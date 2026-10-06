// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The spec package format (environments-1, DR-104): a release is a
// folder with a `meta.yaml` manifest of `format: 2`, the three root
// files, and one folder per artifact — `sources/`, `specs/`, `skills/`
// and `playbooks/` by language, `applets/` without one. The core reads
// a release from the registry, a Git commit, a path inside a working
// folder or the app's built-in spec package through these checks, and
// refuses any other with every reason it finds.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { lstat, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseDocument, stringify } from "yaml";

import { isRequirement, isVersion } from "./semver.js";

export const ARTIFACT_KINDS = ["source", "spec", "skill", "playbook", "applet"] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

export interface Artifact {
  kind: ArtifactKind;
  /** The original text's language; absent for an applet. */
  language?: string;
  from?: string;
  requires: string[];
  generatedBy?: { agent: string; model: string };
}

export interface Manifest {
  format: 2;
  org: string;
  name: string;
  version: string;
  description?: string;
  license?: string;
  repository?: string;
  dependencies: Record<string, string>;
  artifacts: Record<string, Artifact>;
}

/** One file of a release: its `/`-separated path relative to the
 * release root, size, SHA-256 and owner-execute bit. */
export interface ReleaseFile {
  path: string;
  size: number;
  sha256: string;
  executable: boolean;
}

export interface Release {
  manifest: Manifest;
  files: ReleaseFile[];
}

export interface Issue {
  path?: string;
  rule: string;
  message: string;
}

export class FormatError extends Error {
  constructor(readonly issues: Issue[], subject = "release") {
    super(`${subject} refused: ${issues.map((issue) => (issue.path ? `${issue.path}: ${issue.message}` : issue.message)).join("; ")}`);
    this.name = "FormatError";
  }
}

export const ROOT_FILES = ["meta.yaml", "README.md", "LICENSE"] as const;

export const KIND_FOLDERS: Record<ArtifactKind, string> = {
  source: "sources",
  spec: "specs",
  skill: "skills",
  playbook: "playbooks",
  applet: "applets",
};

const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A lowercase kebab-case name of at most 64 characters: an org, a
 * package, and — by the same rule — an Agent Skills name. */
export function isKebabName(value: unknown): value is string {
  return typeof value === "string" && value.length <= 64 && NAME_RE.test(value);
}

/** An Agent Skills name: a skill's or a playbook's id, or an alias. */
export const isSkillName = isKebabName;

export function isPackageName(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parts = value.split("/");
  return parts.length === 2 && isKebabName(parts[0]) && isKebabName(parts[1]);
}

export function parsePackageName(name: string): { org: string; pkg: string } {
  if (!isPackageName(name)) throw new FormatError([{ rule: "name", message: `"${name}" is not a <org>/<pkg> name` }], "name");
  const [org, pkg] = name.split("/") as [string, string];
  return { org, pkg };
}

// BCP 47's langtag in its common form, or a private-use tag (RFC 5646
// §2.1); grandfathered tags are not taken.
const LANGTAG_RE = new RegExp(
  "^(?:" +
    "(?:[a-z]{2,3}(?:-[a-z]{3}){0,3}|[a-z]{4}|[a-z]{5,8})" +
    "(?:-[a-z]{4})?" +
    "(?:-(?:[a-z]{2}|\\d{3}))?" +
    "(?:-(?:[a-z\\d]{5,8}|\\d[a-z\\d]{3}))*" +
    "(?:-[\\da-wyz](?:-[a-z\\d]{2,8})+)*" +
    "(?:-x(?:-[a-z\\d]{1,8})+)?" +
    "|x(?:-[a-z\\d]{1,8})+" +
  ")$",
  "i",
);

/** A well-formed BCP 47 tag, such as `en` or `zh-Hans`. */
export function isLanguageTag(value: unknown): value is string {
  return typeof value === "string" && value.length <= 64 && LANGTAG_RE.test(value);
}

const DEVICE_RE = /^(?:con|prn|aux|nul|com[0-9\u00b9\u00b2\u00b3]|lpt[0-9\u00b9\u00b2\u00b3])(?:\..*)?$/i;
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f]/;
const RESERVED_RE = /[\\:*?"<>|]/;

/** Compare key for "unique after NFC and case folding". */
export function foldPath(path: string): string {
  return path.normalize("NFC").toUpperCase().toLowerCase().normalize("NFC");
}

/** Every portable-path rule a list of release paths breaks. */
export function portablePathIssues(paths: readonly string[]): Issue[] {
  const issues: Issue[] = [];
  const files = new Map<string, string>();
  const directories = new Map<string, string>();
  for (const path of paths) {
    if (path === "" || path.startsWith("/") || path.endsWith("/")) {
      issues.push({ path, rule: "path", message: "not a relative file path" });
      continue;
    }
    const components = path.split("/");
    let bad = false;
    for (const component of components) {
      const reason =
        component === "" ? "has an empty component"
          : Buffer.byteLength(component, "utf8") > 255 ? "has a component over 255 bytes"
            : CONTROL_RE.test(component) ? "has a control character"
              : RESERVED_RE.test(component) ? "has one of \\ : * ? \" < > |"
                : /[. ]$/.test(component) ? "has a component ending in a dot or space"
                  : DEVICE_RE.test(component) ? `has the Windows device name "${component}"`
                    : undefined;
      if (reason) {
        issues.push({ path, rule: "path", message: `is not portable: ${reason}` });
        bad = true;
        break;
      }
    }
    if (bad) continue;
    const key = foldPath(path);
    const clash = files.get(key) ?? directories.get(key);
    if (clash !== undefined) {
      issues.push({ path, rule: "path", message: `is not unique after NFC and case folding: it collides with ${clash}` });
      continue;
    }
    files.set(key, path);
    for (let i = 1; i < components.length; i += 1) {
      const directory = components.slice(0, i).join("/");
      const directoryKey = foldPath(directory);
      const fileClash = files.get(directoryKey);
      if (fileClash !== undefined) {
        issues.push({ path, rule: "path", message: `is not unique after NFC and case folding: its folder collides with ${fileClash}` });
      }
      if (!directories.has(directoryKey)) directories.set(directoryKey, directory);
    }
  }
  return issues;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const MANIFEST_FIELDS = new Set(["format", "org", "name", "version", "description", "license", "repository", "dependencies", "artifacts"]);
const ARTIFACT_FIELDS = new Set(["kind", "language", "from", "requires", "generated-by"]);

function isExtension(key: string): boolean {
  return key.startsWith("x-");
}

/** Read a parsed `meta.yaml` value as a manifest of `format: 2`. */
export function parseManifest(raw: unknown): { manifest: Manifest | null; issues: Issue[] } {
  const at = "meta.yaml";
  const issues: Issue[] = [];
  if (!isPlainObject(raw)) return { manifest: null, issues: [{ path: at, rule: "manifest", message: "the manifest is not a mapping" }] };
  if (raw.format !== 2) {
    return { manifest: null, issues: [{ path: at, rule: "format", message: `format ${JSON.stringify(raw.format ?? null)} is not the known format 2` }] };
  }
  for (const key of Object.keys(raw)) {
    if (!MANIFEST_FIELDS.has(key) && !isExtension(key)) issues.push({ path: at, rule: "field", message: `unknown field "${key}"` });
  }
  for (const key of ["org", "name"] as const) {
    if (!isKebabName(raw[key])) issues.push({ path: at, rule: "name", message: `${key} ${JSON.stringify(raw[key] ?? null)} is not a lowercase kebab-case name of at most 64 characters` });
  }
  if (!isVersion(raw.version)) issues.push({ path: at, rule: "version", message: `version ${JSON.stringify(raw.version ?? null)} is not a Semantic Versioning 2.0.0 version` });
  for (const key of ["description", "license", "repository"] as const) {
    if (raw[key] !== undefined && typeof raw[key] !== "string") issues.push({ path: at, rule: "field", message: `${key} is not a string` });
  }
  const dependencies: Record<string, string> = {};
  if (raw.dependencies !== undefined && raw.dependencies !== null) {
    if (!isPlainObject(raw.dependencies)) {
      issues.push({ path: at, rule: "dependency", message: "dependencies is not a mapping" });
    } else {
      for (const [name, requirement] of Object.entries(raw.dependencies)) {
        if (!isPackageName(name)) issues.push({ path: at, rule: "dependency", message: `dependency "${name}" is not a <org>/<pkg> name` });
        else if (name === `${String(raw.org)}/${String(raw.name)}`) issues.push({ path: at, rule: "dependency", message: `${name} depends on itself` });
        if (isPlainObject(requirement) && "mode" in requirement) {
          issues.push({ path: at, rule: "dependency", message: `dependency ${name} carries mode, which DR-104 retired: give a version requirement` });
        } else if (!isRequirement(requirement)) {
          issues.push({ path: at, rule: "dependency", message: `dependency ${name} requirement ${JSON.stringify(requirement)} is not 1.2.3, ^1.2.3 or ~1.2.3` });
        } else {
          dependencies[name] = requirement;
        }
      }
    }
  }
  const artifacts: Record<string, Artifact> = {};
  if (!isPlainObject(raw.artifacts) || Object.keys(raw.artifacts).length === 0) {
    issues.push({ path: at, rule: "artifact", message: "artifacts must name at least one artifact" });
  } else {
    for (const [id, entry] of Object.entries(raw.artifacts)) {
      if (id === "" || id.includes("/") || id === "." || id === "..") {
        issues.push({ path: at, rule: "artifact", message: `artifact id "${id}" is not a folder name` });
        continue;
      }
      if (!isPlainObject(entry)) {
        issues.push({ path: at, rule: "artifact", message: `artifact ${id} is not a mapping` });
        continue;
      }
      for (const key of Object.keys(entry)) {
        if (!ARTIFACT_FIELDS.has(key) && !isExtension(key)) issues.push({ path: at, rule: "field", message: `artifact ${id} has unknown field "${key}"` });
      }
      const kind = entry.kind;
      if (typeof kind !== "string" || !(ARTIFACT_KINDS as readonly string[]).includes(kind)) {
        issues.push({ path: at, rule: "kind", message: `artifact ${id} kind ${JSON.stringify(kind ?? null)} is not one of ${ARTIFACT_KINDS.join(", ")}` });
        continue;
      }
      if (entry.language !== undefined && typeof entry.language !== "string") issues.push({ path: at, rule: "language", message: `artifact ${id} language is not a string` });
      if (entry.from !== undefined && typeof entry.from !== "string") issues.push({ path: at, rule: "from", message: `artifact ${id} from is not an artifact id` });
      const requires = entry.requires ?? [];
      if (!Array.isArray(requires) || !requires.every((item) => typeof item === "string")) {
        issues.push({ path: at, rule: "requires", message: `artifact ${id} requires is not a list of artifact ids` });
      }
      const generated = entry["generated-by"];
      if (generated !== undefined && !(isPlainObject(generated) && typeof generated.agent === "string" && typeof generated.model === "string"
        && Object.keys(generated).every((key) => key === "agent" || key === "model" || isExtension(key)))) {
        issues.push({ path: at, rule: "field", message: `artifact ${id} generated-by is not {agent, model}` });
      }
      artifacts[id] = {
        kind: kind as ArtifactKind,
        ...(typeof entry.language === "string" ? { language: entry.language } : {}),
        ...(typeof entry.from === "string" ? { from: entry.from } : {}),
        requires: Array.isArray(requires) ? requires.filter((item): item is string => typeof item === "string") : [],
        ...(isPlainObject(generated) && typeof generated.agent === "string" && typeof generated.model === "string"
          ? { generatedBy: { agent: generated.agent, model: generated.model } } : {}),
      };
    }
  }
  if (issues.length > 0) return { manifest: null, issues };
  return {
    manifest: {
      format: 2,
      org: raw.org as string,
      name: raw.name as string,
      version: raw.version as string,
      ...(typeof raw.description === "string" ? { description: raw.description } : {}),
      ...(typeof raw.license === "string" ? { license: raw.license } : {}),
      ...(typeof raw.repository === "string" ? { repository: raw.repository } : {}),
      dependencies,
      artifacts,
    },
    issues,
  };
}

/** Parse `meta.yaml` text, YAML errors reported as issues. */
export function parseManifestText(text: string): { manifest: Manifest | null; issues: Issue[] } {
  const doc = parseDocument(text, { prettyErrors: false, uniqueKeys: true });
  if (doc.errors.length > 0) {
    return { manifest: null, issues: doc.errors.map((error) => ({ path: "meta.yaml", rule: "manifest", message: error.message })) };
  }
  return parseManifest(doc.toJS());
}

/** The manifest as `meta.yaml` text, fields in the format's order. */
export function serializeManifest(manifest: Manifest): string {
  const artifacts: Record<string, unknown> = {};
  for (const [id, artifact] of Object.entries(manifest.artifacts)) {
    artifacts[id] = {
      kind: artifact.kind,
      ...(artifact.language !== undefined ? { language: artifact.language } : {}),
      ...(artifact.from !== undefined ? { from: artifact.from } : {}),
      ...(artifact.requires.length > 0 ? { requires: artifact.requires } : {}),
      ...(artifact.generatedBy ? { "generated-by": artifact.generatedBy } : {}),
    };
  }
  return stringify({
    format: 2,
    org: manifest.org,
    name: manifest.name,
    version: manifest.version,
    ...(manifest.description !== undefined ? { description: manifest.description } : {}),
    ...(manifest.license !== undefined ? { license: manifest.license } : {}),
    ...(manifest.repository !== undefined ? { repository: manifest.repository } : {}),
    ...(Object.keys(manifest.dependencies).length > 0 ? { dependencies: manifest.dependencies } : {}),
    artifacts,
  }, { lineWidth: 0 });
}

/** Where a release path lies: a root file, an artifact's folder (with
 * the spec's one file checked), or nowhere. */
export type PathPlace =
  | { root: true }
  | { root: false; kind: ArtifactKind; id: string; language?: string; folder: string; misplaced?: string }
  | null;

export function placeOf(path: string, pkg: string): PathPlace {
  const parts = path.split("/");
  if (parts.length === 1) return (ROOT_FILES as readonly string[]).includes(path) ? { root: true } : null;
  const head = parts[0];
  if (head === "sources" || head === "skills" || head === "playbooks") {
    if (parts.length < 4) return null;
    const kind: ArtifactKind = head === "sources" ? "source" : head === "skills" ? "skill" : "playbook";
    return { root: false, kind, language: parts[1]!, id: parts[2]!, folder: parts.slice(0, 3).join("/") };
  }
  if (head === "specs") {
    if (parts.length < 3) return null;
    const ok = parts.length === 3 && parts[2] === `${pkg}.md`;
    return {
      root: false, kind: "spec", language: parts[1]!, id: pkg, folder: parts.slice(0, 2).join("/"),
      ...(ok ? {} : { misplaced: `a spec folder holds only ${pkg}.md` }),
    };
  }
  if (head === "applets") {
    if (parts.length < 3) return null;
    return { root: false, kind: "applet", id: parts[1]!, folder: parts.slice(0, 2).join("/") };
  }
  return null;
}

/** The folder prefix of an artifact in a language (none for an applet). */
export function artifactFolder(kind: ArtifactKind, id: string, language: string | null | undefined): string {
  if (kind === "applet") return `applets/${id}/`;
  if (kind === "spec") return `specs/${language}/`;
  return `${KIND_FOLDERS[kind]}/${language}/${id}/`;
}

/** Whether a release path belongs to an artifact in a language. */
export function inArtifact(path: string, kind: ArtifactKind, id: string, language: string | null | undefined, pkg: string): boolean {
  if (kind === "spec") return path === `specs/${language}/${pkg}.md`;
  return path.startsWith(artifactFolder(kind, id, language));
}

/** Each artifact's language folders, read from the files. */
export function artifactLanguages(manifest: Manifest, files: readonly { path: string }[]): Record<string, string[]> {
  const languages: Record<string, Set<string>> = {};
  for (const file of files) {
    const place = placeOf(file.path, manifest.name);
    if (!place || place.root || place.language === undefined) continue;
    const artifact = manifest.artifacts[place.id];
    if (!artifact || artifact.kind !== place.kind) continue;
    (languages[place.id] ??= new Set()).add(place.language);
  }
  const out: Record<string, string[]> = {};
  for (const id of Object.keys(manifest.artifacts)) out[id] = [...(languages[id] ?? [])].sort();
  return out;
}

const ITEM_HEADING = (pkg: string): RegExp => new RegExp(`^#{3,4}[ \\t]+(${pkg.replace(/[-]/g, "\\-")}-([1-9]\\d*))[ \\t]*$`, "gm");

/** A spec file's item ids, in order, from its `### <pkg>-<N>` and
 * `#### <pkg>-<N>` headings. */
export function specItemIds(text: string, pkg: string): string[] {
  return [...text.matchAll(ITEM_HEADING(pkg))].map((match) => match[1]!);
}

/** The `name` of a SKILL.md's YAML frontmatter, if it has one. */
export function skillFrontmatterName(text: string): string | undefined {
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!match) return undefined;
  try {
    const value = parseDocument(match[1]!).toJS() as unknown;
    return isPlainObject(value) && typeof value.name === "string" ? value.name : undefined;
  } catch {
    return undefined;
  }
}

export type ReadReleaseFile = (path: string) => Uint8Array | undefined;

/** Every layout rule of environments-1 the release breaks. */
export function checkRelease(dir: string | ReadReleaseFile, manifest: Manifest, files: readonly ReleaseFile[]): Issue[] {
  const read: ReadReleaseFile = typeof dir === "string"
    ? (path) => { const file = join(dir, ...path.split("/")); return existsSync(file) ? readFileSync(file) : undefined; }
    : dir;
  const issues: Issue[] = [];
  const pkg = manifest.name;
  const paths = new Set(files.map((file) => file.path));
  // folder key -> place
  const folders = new Map<string, { kind: ArtifactKind; id: string; language?: string; folder: string }>();
  for (const file of files) {
    const place = placeOf(file.path, pkg);
    if (place === null) {
      issues.push({ path: file.path, rule: "layout", message: "lies under no artifact and is not meta.yaml, README.md or LICENSE" });
      continue;
    }
    if (place.root) continue;
    if (place.misplaced) issues.push({ path: file.path, rule: "spec", message: place.misplaced });
    if (place.language !== undefined && !isLanguageTag(place.language)) {
      issues.push({ path: file.path, rule: "language", message: `language folder "${place.language}" is not a well-formed BCP 47 tag` });
    }
    folders.set(`${place.kind}\u0000${place.id}\u0000${place.language ?? ""}`, place);
  }
  const shared = new Set<string>();
  for (const place of folders.values()) {
    if (place.kind === "skill" || place.kind === "playbook") {
      const other = place.kind === "skill" ? "playbooks" : "skills";
      if ([...folders.values()].some((p) => p.id === place.id && KIND_FOLDERS[p.kind] === other)) shared.add(place.id);
    }
  }
  for (const id of shared) issues.push({ path: `skills/*/${id}`, rule: "shared-id", message: `a skill and a playbook share the id ${id}` });
  const seenFolders = new Set<string>();
  for (const place of folders.values()) {
    if (seenFolders.has(place.folder)) continue;
    seenFolders.add(place.folder);
    if (shared.has(place.id)) continue;
    const artifact = manifest.artifacts[place.id];
    if (!artifact) {
      issues.push({ path: place.folder, rule: "folder", message: `folder has no manifest entry ${place.id}` });
    } else if (artifact.kind !== place.kind) {
      issues.push({ path: place.folder, rule: "folder", message: `folder is a ${place.kind} folder but ${place.id} is a ${artifact.kind}` });
    }
  }
  const languagesOf = (kind: ArtifactKind, id: string): string[] =>
    [...folders.values()].filter((p) => p.kind === kind && p.id === id && p.language !== undefined).map((p) => p.language!)
      .filter((language, index, all) => all.indexOf(language) === index);
  let specs = 0;
  for (const [id, artifact] of Object.entries(manifest.artifacts)) {
    const at = "meta.yaml";
    if (artifact.kind === "applet") {
      if (artifact.language !== undefined) issues.push({ path: at, rule: "language", message: `applet ${id} has a language; an applet has none` });
      if (![...folders.values()].some((p) => p.kind === "applet" && p.id === id)) {
        issues.push({ path: `applets/${id}`, rule: "folder", message: `applet ${id} has no folder` });
      }
    } else {
      const languages = languagesOf(artifact.kind, id);
      if (artifact.language === undefined) {
        issues.push({ path: at, rule: "language", message: `${artifact.kind} ${id} names no language` });
      } else if (!isLanguageTag(artifact.language)) {
        issues.push({ path: at, rule: "language", message: `${artifact.kind} ${id} language "${artifact.language}" is not a well-formed BCP 47 tag` });
      } else if (!languages.includes(artifact.language)) {
        issues.push({ path: artifactFolder(artifact.kind, id, artifact.language).replace(/\/$/, ""), rule: "folder", message: `${artifact.kind} ${id} has no folder in its language ${artifact.language}` });
      }
      if (artifact.kind === "spec") {
        specs += 1;
        if (id !== pkg) issues.push({ path: at, rule: "spec", message: `the spec's id is ${id}, not the package name ${pkg}` });
        const original = artifact.language;
        const originalText = original ? read(`specs/${original}/${pkg}.md`) : undefined;
        if (originalText) {
          const ids = specItemIds(Buffer.from(originalText).toString("utf8"), pkg);
          const duplicates = ids.filter((item, index) => ids.indexOf(item) !== index);
          if (duplicates.length > 0) issues.push({ path: `specs/${original}/${pkg}.md`, rule: "item-ids", message: `item ids repeat: ${[...new Set(duplicates)].join(", ")}` });
          const expected = [...new Set(ids)].sort().join(",");
          for (const language of languages) {
            if (language === original) continue;
            const translated = read(`specs/${language}/${pkg}.md`);
            if (!translated) continue;
            const translatedIds = specItemIds(Buffer.from(translated).toString("utf8"), pkg);
            if ([...new Set(translatedIds)].sort().join(",") !== expected || translatedIds.length !== ids.length) {
              issues.push({ path: `specs/${language}/${pkg}.md`, rule: "translation", message: `a translation must keep the original's item ids` });
            }
          }
        }
      }
      if (artifact.kind === "skill" || artifact.kind === "playbook") {
        if (!isSkillName(id)) issues.push({ path: at, rule: "skill-name", message: `${artifact.kind} id "${id}" is not an Agent Skills name` });
      }
      if (artifact.kind === "skill") {
        for (const language of languages) {
          const skillPath = `skills/${language}/${id}/SKILL.md`;
          const text = paths.has(skillPath) ? read(skillPath) : undefined;
          if (!text) {
            issues.push({ path: skillPath, rule: "skill-md", message: `skill ${id} has no SKILL.md` });
            continue;
          }
          const name = skillFrontmatterName(Buffer.from(text).toString("utf8"));
          if (name !== id) issues.push({ path: skillPath, rule: "skill-md", message: `SKILL.md name ${JSON.stringify(name ?? null)} differs from the skill's id ${id}` });
        }
      }
      if (artifact.kind === "source") {
        for (const language of languages) {
          const sourcePath = `sources/${language}/${id}/SOURCE.md`;
          if (!paths.has(sourcePath)) issues.push({ path: sourcePath, rule: "source-md", message: `source ${id} has no SOURCE.md` });
        }
      }
    }
    if (artifact.from !== undefined && (artifact.from === id || !manifest.artifacts[artifact.from])) {
      issues.push({ path: at, rule: "from", message: `artifact ${id} from ${artifact.from} names no other artifact of this release` });
    }
    for (const required of artifact.requires) {
      if (required === id || !manifest.artifacts[required]) {
        issues.push({ path: at, rule: "requires", message: `artifact ${id} requires ${required}, which names no other artifact of this release` });
      }
    }
  }
  if (specs > 1) issues.push({ path: "meta.yaml", rule: "spec", message: "a release has at most one spec" });
  issues.push(...portablePathIssues([...paths]));
  return issues;
}

/** Folders and files a reader of a working folder or a Git tree skips:
 * they are never release files. */
const SKIPPED_DIRECTORIES = new Set([".git", "node_modules"]);
const SKIPPED_FILES = new Set([".DS_Store"]);

export function sha256Hex(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Every file of a folder with its digest and executable bit; a link
 * or a special file is an issue, never followed. */
export async function listReleaseFiles(dir: string): Promise<{ files: ReleaseFile[]; issues: Issue[] }> {
  const files: ReleaseFile[] = [];
  const issues: Issue[] = [];
  const walk = async (relative: string): Promise<void> => {
    const absolute = relative ? join(dir, ...relative.split("/")) : dir;
    const entries = (await readdir(absolute)).sort();
    for (const name of entries) {
      const path = relative ? `${relative}/${name}` : name;
      const stat = await lstat(join(absolute, name));
      if (stat.isDirectory()) {
        if (SKIPPED_DIRECTORIES.has(name)) continue;
        await walk(path);
      } else if (stat.isSymbolicLink()) {
        issues.push({ path, rule: "link", message: "is a link; a release holds files only" });
      } else if (stat.isFile()) {
        if (SKIPPED_FILES.has(name)) continue;
        const bytes = await readFile(join(absolute, name));
        files.push({ path, size: bytes.length, sha256: sha256Hex(bytes), executable: (stat.mode & 0o100) !== 0 });
      } else {
        issues.push({ path, rule: "special", message: "is a special file; a release holds files only" });
      }
    }
  };
  await walk("");
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { files, issues };
}

/** Read the manifest of a folder, refusing a missing or unknown one. */
export function readManifest(dir: string): Manifest {
  const file = join(dir, "meta.yaml");
  if (!existsSync(file)) throw new FormatError([{ path: "meta.yaml", rule: "manifest", message: "the release has no meta.yaml manifest" }]);
  const { manifest, issues } = parseManifestText(readFileSync(file, "utf8"));
  if (!manifest) throw new FormatError(issues);
  return manifest;
}

/** Read and check a release folder (environments-1). */
export async function readRelease(dir: string): Promise<Release> {
  const file = join(dir, "meta.yaml");
  if (!existsSync(file)) throw new FormatError([{ path: "meta.yaml", rule: "manifest", message: "the release has no meta.yaml manifest" }]);
  const { manifest, issues } = parseManifestText(readFileSync(file, "utf8"));
  const listed = await listReleaseFiles(dir);
  issues.push(...listed.issues);
  if (manifest) issues.push(...checkRelease(dir, manifest, listed.files));
  if (!manifest || issues.length > 0) throw new FormatError(issues);
  return { manifest, files: listed.files };
}
