// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// `spex export <org>/<pkg>` (cli-23, environments-10, environments-42,
// DR-174): a spec package under development built at
// `spex-packages/<org>/<pkg>/` under the environment's root, in the
// release layout the library reads, by copying the project's own files,
// which stay where they are. A first export takes its artifacts from
// `--skill` and `--spec` and writes `meta.yaml` with the kinds it
// `provides`, a README and the root's LICENSE; a later one keeps
// `meta.yaml` as the author left it, adding an entry per artifact a flag
// adds, and refreshes every artifact it names from the project by
// identity: the spec `<pkg>.md` wherever it stands under `specs/`, a
// skill from an agent folder of the root holding a folder of its name
// that no placement wrote. A playbook, a source or an applet stays as
// it is: the folder is its home. The spec's citations are rewritten for
// the release, each one removed or reduced printed as a warning. It
// requests nothing: the project has its files in place. Every rule is
// checked before anything is written; a refusal writes nothing.

import {
  chmodSync,
  copyFileSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  writeFileSync,
  type Stats,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { basename, dirname, join, posix, relative, resolve, sep } from "node:path";
import { parseDocument } from "yaml";

import {
  packageNameRefusal,
  parseManifestText,
  providedArtifacts,
  readPlacedRecord,
  rewriteForRelease,
  serializeManifest,
  type ArtifactKind,
  type CitationWarning,
  type Manifest,
} from "../lib/environment/index.js";
import { Environment, isDirectory } from "./environment.js";
import { exportedIn, projectFolders, table } from "./settle.js";
import { misuse, needs, Refusal, type Command } from "./run.js";

function refuse(message: string): never {
  throw new Refusal(message);
}

/** A lowercase kebab-case name of at most 64 characters: an org, a
 * package's name, and an Agent Skills name alike (environments-1). */
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const isName = (value: string): boolean => value.length <= 64 && KEBAB.test(value);

// BCP 47's langtag in its common form, or a private-use tag, as the
// core reads a release's language folders.
const LANGTAG = new RegExp(
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

interface ExportOptions {
  org: string;
  name: string;
  skills: string[];
  spec?: string;
  /** `--language`, else `en`: the language of what this export adds. */
  language: string;
  description?: string;
  license?: string;
}

const VALUED = new Set(["skill", "spec", "language", "description", "license"]);
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

/** Parse the whole invocation before reading or writing anything. */
function parseExport(args: string[]): ExportOptions {
  const words: string[] = [];
  const skills: string[] = [];
  const single: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (!arg.startsWith("-")) { words.push(arg); continue; }
    const match = /^--([a-z-]+)(?:=([\s\S]*))?$/.exec(arg);
    const key = match?.[1];
    if (!key || !VALUED.has(key)) throw misuse("export", `unknown option ${arg.split("=")[0]}`);
    const inline = match![2];
    const value = inline ?? args[++i];
    if (value === undefined || value === "" || (inline === undefined && value.startsWith("-"))) throw misuse("export", `--${key} needs ${needs("export", key)}`);
    if (key === "skill") { skills.push(value); continue; }
    if (Object.hasOwn(single, key)) throw misuse("export", `--${key} given twice — give it once`);
    single[key] = value;
  }
  if (words.length === 0) throw misuse("export", "missing <org>/<pkg>");
  if (words.length > 1) throw misuse("export", `unexpected argument ${words[1]}`);
  const parts = words[0]!.split("/");
  if (parts.length !== 2 || !isName(parts[0]!) || !isName(parts[1]!))
    refuse(packageNameRefusal(words[0]!));
  const language = single.language ?? "en";
  if (!LANGTAG.test(language) || language.length > 64) refuse(`--language ${JSON.stringify(language)} is not a language tag — use one like en or zh-Hans`);
  if (single.description !== undefined && CONTROL.test(single.description.replace(/[\n\t]/g, " "))) refuse("--description holds control characters — remove them");
  if (single.license !== undefined && CONTROL.test(single.license)) refuse("--license holds control characters — remove them");
  if (single.license !== undefined && !single.license.trim()) throw misuse("export", `--license needs ${needs("export", "license")}`);
  if (single.description !== undefined && !single.description.trim()) throw misuse("export", `--description needs ${needs("export", "description")}`);
  return {
    org: parts[0]!,
    name: parts[1]!,
    skills,
    ...(single.spec !== undefined ? { spec: single.spec } : {}),
    language,
    ...(single.description !== undefined ? { description: single.description.trim() } : {}),
    ...(single.license !== undefined ? { license: single.license.trim() } : {}),
  };
}

// -- SKILL.md frontmatter ------------------------------------------------

/** Plain YAML scalars the core schema reads as no string: a skill named
 * so would be refused by the core's reader. */
const NON_STRING = /^(?:~|null|Null|NULL|true|True|TRUE|false|False|FALSE|[-+]?[0-9]+|0o[0-7]+|0x[0-9a-fA-F]+|[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)(?:[eE][-+]?[0-9]+)?|[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN))$/;

/** A plain value YAML refuses in a block mapping, so the core's reader
 * reads no frontmatter at all. */
const REFUSED = Symbol("refused");

interface Frontmatter {
  name?: string;
  description?: string;
  /** The field whose unquoted value YAML refuses (`: ` inside it). */
  unreadable?: "name" | "description";
}

/** The top-level string fields of a SKILL.md's YAML frontmatter that
 * matter here — `name` and `description` — read from the common YAML
 * forms: plain, single- or double-quoted, and `|` or `>` blocks. A field
 * of another form reads as absent. The frontmatter is found as a
 * release's readers find it, from the text's first character: nothing
 * before `---`, a byte order mark included, is skipped. */
export function skillFrontmatter(text: string): Frontmatter {
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!match) return {};
  const lines = match[1]!.split(/\r?\n/);
  const out: Frontmatter = {};
  for (let i = 0; i < lines.length; i++) {
    const field = /^(name|description)[ \t]*:(?:[ \t]+(.*)|)$/.exec(lines[i]!);
    if (!field) continue;
    const key = field[1] as "name" | "description";
    // The value's continuation: the lines indented below its key.
    const rest: string[] = [];
    while (i + 1 < lines.length && (/^[ \t]/.test(lines[i + 1]!) || lines[i + 1]!.trim() === "")) rest.push(lines[++i]!);
    while (rest.length && rest[rest.length - 1]!.trim() === "") rest.pop();
    const value = scalar((field[2] ?? "").trim(), rest);
    if (value === REFUSED) out.unreadable ??= key;
    else if (value !== undefined) out[key] = value;
  }
  return out;
}

function scalar(head: string, rest: string[]): string | undefined | typeof REFUSED {
  const block = /^([|>])[-+]?[1-9]?(?:[ \t]+#.*)?$/.exec(head);
  if (block) {
    const indent = Math.min(...rest.filter((line) => line.trim()).map((line) => /^[ \t]*/.exec(line)![0].length));
    const body = rest.map((line) => line.slice(Math.min(indent, line.length)));
    if (block[1] === "|") return body.join("\n").trim() || undefined;
    return body.join("\n").split(/\n[ \t]*\n/).map((p) => p.split("\n").map((l) => l.trim()).join(" ")).join("\n").trim() || undefined;
  }
  // A nested mapping is no string.
  if (head === "" && rest[0] !== undefined && /^[ \t]+[^ \t#'"][^:]*:(?:[ \t]|$)/.test(rest[0])) return undefined;
  const joined = [head, ...rest.map((line) => line.trim())].filter((part) => part !== "").join(" ");
  if (joined.startsWith('"')) {
    const end = /^"((?:[^"\\]|\\.)*)"[ \t]*(?:#.*)?$/.exec(joined);
    if (!end) return undefined;
    // An escaped space is a space; a tab stands as it is.
    try { return JSON.parse(`"${end[1]!.replace(/\\(?=[ \t])/g, "").replace(/\t/g, "\\t")}"`) as string; } catch { return undefined; }
  }
  if (joined.startsWith("'")) {
    const end = /^'((?:[^']|'')*)'[ \t]*(?:#.*)?$/.exec(joined);
    return end ? end[1]!.replace(/''/g, "'") : undefined;
  }
  const plain = joined.replace(/[ \t]+#.*$/, "").trim();
  if (!plain || NON_STRING.test(plain) || /^[[{&*!|>%@`]/.test(plain)) return undefined;
  // `key: value: more` is no YAML: the whole frontmatter is refused.
  if (/:[ \t]/.test(plain) || plain.endsWith(":")) return REFUSED;
  return plain;
}

// -- the spec's Intent ---------------------------------------------------

/** The first paragraph under a spec's Intent heading, its lines joined. */
export function intentParagraph(text: string): string | undefined {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  let i = lines.findIndex((line) => /^#{1,6}[ \t]+Intent[ \t]*#*[ \t]*$/i.test(line));
  if (i < 0) return undefined;
  i++;
  while (i < lines.length && lines[i]!.trim() === "") i++;
  const paragraph: string[] = [];
  while (i < lines.length && lines[i]!.trim() !== "" && !/^#{1,6}(?:[ \t]|$)/.test(lines[i]!)) paragraph.push(lines[i++]!.trim());
  return paragraph.join(" ") || undefined;
}

// -- the license ---------------------------------------------------------

/** The license a root's LICENSE names (cli-23). */
export function detectLicense(text: string | undefined): string {
  const head = (text ?? "").replace(/^﻿/, "").trimStart();
  if (head.startsWith("Apache License")) return "Apache-2.0";
  if (head.startsWith("MIT License")) return "MIT";
  return "Apache-2.0";
}

// -- the project's files -------------------------------------------------

interface SkillSource {
  folder: string;
  id: string;
  description?: string;
  /** Every folder and regular file below it, by its relative path. */
  dirs: string[];
  files: string[];
}

function lstatOrNull(path: string): Stats | null {
  try { return lstatSync(path); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" || (error as NodeJS.ErrnoException).code === "ENOTDIR") return null;
    throw error;
  }
}

function isFile(path: string): boolean {
  try { return statSync(path).isFile(); } catch { return false; }
}

/** A skill folder read whole: only folders and regular files, no link.
 * `label` names it in a refusal: the option and its folder as given, or
 * the agent folder it was found in. */
function readSkill(folder: string, label: string): SkillSource {
  const stat = lstatOrNull(folder);
  if (stat?.isSymbolicLink()) refuse(`${label} is a link — name the skill's own folder`);
  if (!stat?.isDirectory()) refuse(`${label} is not a folder holding a SKILL.md`);
  const dirs: string[] = [];
  const files: string[] = [];
  const walk = (relativeDir: string): void => {
    for (const entry of readdirSync(join(folder, relativeDir)).sort()) {
      const path = relativeDir ? `${relativeDir}/${entry}` : entry;
      const entryStat = lstatSync(join(folder, path));
      if (entryStat.isSymbolicLink()) refuse(`${label} holds a link at ${path} — a package holds files only`);
      if (entryStat.isDirectory()) { dirs.push(path); walk(path); }
      else if (entryStat.isFile()) files.push(path);
      else refuse(`${label} holds a special file at ${path} — a package holds files only`);
    }
  };
  walk("");
  if (!files.includes("SKILL.md")) refuse(`${label} holds no SKILL.md`);
  const text = readFileSync(join(folder, "SKILL.md"), "utf8");
  // A release's readers find the frontmatter from the first byte, so a
  // byte order mark would hide the name from the app and the registry.
  if (text.startsWith("﻿"))
    refuse(`${label}: its SKILL.md begins with a byte order mark, which hides its name — save it as UTF-8 without one`);
  const frontmatter = skillFrontmatter(text);
  if (frontmatter.unreadable)
    refuse(`${label}: its SKILL.md's ${frontmatter.unreadable} holds ": " unquoted, so its name cannot be read — put the value in quotes`);
  if (frontmatter.name === undefined || !isName(frontmatter.name))
    refuse(`${label}: its SKILL.md names no skill — give it a name of lowercase letters, digits and single hyphens, at most 64 characters`);
  return { folder, id: frontmatter.name, ...(frontmatter.description ? { description: frontmatter.description } : {}), dirs, files };
}

/** A path under the root as a reader sees it, `/`-separated. */
function shownAt(root: string, path: string): string {
  return relative(root, path).split(sep).join("/") || ".";
}

/** A skill of the package found in the project by its id (cli-23): a
 * folder of that name in an agent folder of the root that no placement
 * wrote — not listed in that folder's exports manifest — a real folder
 * before a link; null where none stands. */
function findSkill(root: string, id: string): { folder: string; shown: string } | null {
  const found: { folder: string; shown: string; real: boolean }[] = [];
  for (const { folder } of projectFolders()) {
    const path = join(root, ...folder.split("/"), id);
    const stat = lstatOrNull(path);
    if (!stat || !(stat.isDirectory() || stat.isSymbolicLink())) continue;
    if (exportedIn(root, folder).includes(id)) continue;
    found.push({ folder: path, shown: `${folder}/${id}`, real: stat.isDirectory() });
  }
  return found.find((entry) => entry.real) ?? found[0] ?? null;
}

/** The spec `<name>.md` found under the root's `specs/`, whose
 * basenames are unique (meta-10), in a walk of sorted entries that
 * follows no link and passes over a file another package's install
 * placed there; null where none stands. */
function findSpec(root: string, name: string, placedByOthers: ReadonlySet<string>): string | null {
  const base = join(root, "specs");
  const walk = (relativeDir: string): string | null => {
    let entries: string[];
    try { entries = readdirSync(join(base, ...relativeDir.split("/").filter(Boolean))).sort(); } catch { return null; }
    for (const entry of entries) {
      const path = relativeDir ? `${relativeDir}/${entry}` : entry;
      const full = join(base, ...path.split("/"));
      if (lstatOrNull(full)?.isDirectory()) {
        const inner = walk(path);
        if (inner !== null) return inner;
      } else if (entry === `${name}.md` && isFile(full) && !placedByOthers.has(`specs/${path}`)) {
        return full;
      }
    }
    return null;
  };
  return walk("");
}

// -- the packages a citation may name ------------------------------------

/** A manifest standing in a folder, or null where none reads. */
function manifestIn(dir: string | null): Manifest | null {
  if (dir === null) return null;
  try { return parseManifestText(readFileSync(join(dir, "meta.yaml"), "utf8")).manifest; } catch { return null; }
}

/** Whether a release provides its spec (environments-1, DR-174). */
function providesSpec(manifest: Manifest): boolean {
  return manifest.artifacts[manifest.name]?.kind === "spec" && providedArtifacts(manifest).has(manifest.name);
}

/** The `<org>/<pkg>` names of the folders two levels below the root's
 * `spex-packages/`, in name order. */
function developedNames(root: string): string[] {
  const base = join(root, "spex-packages");
  const entries = (dir: string): string[] => {
    try { return readdirSync(dir).filter((entry) => !entry.startsWith(".") && isDirectory(join(dir, entry))).sort(); } catch { return []; }
  };
  return entries(base).flatMap((org) => entries(join(base, org)).map((pkg) => `${org}/${pkg}`));
}

/**
 * The package whose provided spec a specs-relative file is, as building
 * a release's spec asks it (environments-42): the package whose install
 * placed that very file, by the placed specs' record; else, by the
 * file's basename `<pkg>.md`, the one package under development at
 * `spex-packages/<org>/<pkg>/` providing its spec, or, where two or more
 * do, their claims, which leave the file no package's. Any other file —
 * the project's own, though an installed package's spec shares its
 * basename, or one outside `specs/` — is no package's.
 */
function specOwners(root: string): (specsPath: string) => string | { claims: string[] } | null {
  const placed = new Map<string, string>();
  for (const [name, spec] of Object.entries(readPlacedRecord(root)?.specs ?? {})) placed.set(posix.normalize(spec.path), name);
  // Each basename with the packages claiming it, in name order.
  const byFile = new Map<string, string[]>();
  for (const name of developedNames(root)) {
    const manifest = manifestIn(join(root, "spex-packages", ...name.split("/")));
    if (manifest === null || `${manifest.org}/${manifest.name}` !== name || !providesSpec(manifest)) continue;
    const file = `${manifest.name}.md`;
    byFile.set(file, [...(byFile.get(file) ?? []), name]);
  }
  return (specsPath) => {
    const path = posix.normalize(specsPath);
    if (path === ".." || path.startsWith("../") || posix.isAbsolute(path)) return null;
    const recorded = placed.get(`specs/${path}`);
    if (recorded !== undefined) return recorded;
    const claims = byFile.get(posix.basename(path)) ?? [];
    if (claims.length === 0) return null;
    return claims.length === 1 ? claims[0]! : { claims };
  };
}

/** A warning of the rewrite as a reader reads it (cli-23): the citing
 * item and what it cited, with the packages claiming it alike. */
function warningLine(warning: CitationWarning): string {
  if (warning.kind === "record") return `Warning: ${warning.item} links ${warning.target} — the package keeps its text, not the link`;
  const target = posix.normalize(`specs/${warning.target}`);
  if (warning.claims !== undefined) return `Warning: ${warning.item} cites ${target}, which ${claimants(warning.claims)} claim — left out of the package, its phrase kept`;
  return `Warning: ${warning.item} cites ${target}, a spec of no package — left out of the package, its phrase kept`;
}

/** "a and b both", or "a, b and c all". */
function claimants(names: string[]): string {
  const listed = names.length === 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${listed} ${names.length === 2 ? "both" : "all"}`;
}

// -- the folder ----------------------------------------------------------

/** One piece of the folder this export writes: a path of the release
 * and how to write it at a staged path. */
interface Piece {
  path: string;
  write: (at: string) => void;
}

/** What the folder holds, one line per artifact: where it came from, or
 * why it stands as it was. */
interface Held {
  kind: ArtifactKind;
  id: string;
  note: string;
}

function copyFile(from: string, to: string): void {
  copyFileSync(from, to);
  chmodSync(to, statSync(from).mode & 0o777);
}

function skillPiece(skill: SkillSource, language: string): Piece {
  return {
    path: `skills/${language}/${skill.id}`,
    write: (into) => {
      mkdirSync(into, { recursive: true });
      for (const dir of skill.dirs) mkdirSync(join(into, ...dir.split("/")), { recursive: true });
      for (const file of skill.files) copyFile(join(skill.folder, ...file.split("/")), join(into, ...file.split("/")));
    },
  };
}

function filePiece(path: string, bytes: string | Buffer): Piece {
  return { path, write: (at) => writeFileSync(at, bytes) };
}

/** Put a staged piece at its place, the one standing there moved aside
 * first and back where the move in fails. */
function swap(from: string, to: string, aside: string): void {
  mkdirSync(dirname(to), { recursive: true });
  const had = lstatOrNull(to) !== null;
  if (had) renameSync(to, aside);
  try { renameSync(from, to); } catch (error) {
    if (had) renameSync(aside, to);
    throw error;
  }
}

/** `spex export` (cli-23): build the folder from the project's files. */
export const exportPackage: Command = async (args) => {
  const cwd = process.cwd();
  const options = parseExport(args);
  const { org, name } = options;
  const pkg = `${org}/${name}`;

  // The environment's root, whose placed specs the spec's citations may
  // name; nothing is requested of it.
  const env = new Environment(cwd);
  const root = env.root;

  // The org is a folder, as npm's scopes are, so two orgs' packages of
  // one name stand apart (environments-10, DR-165).
  const packages = join(root, "spex-packages");
  const parent = join(packages, org);
  const destination = join(parent, name);
  const folder = `spex-packages/${org}/${name}`;
  const packagesStat = lstatOrNull(packages);
  if (packagesStat && !packagesStat.isDirectory()) refuse(`spex-packages in ${root} is not a folder — move it aside, then retry`);
  const parentStat = lstatOrNull(parent);
  if (parentStat && !parentStat.isDirectory()) refuse(`spex-packages/${org} in ${root} is not a folder — move it aside, then retry`);
  const destinationStat = lstatOrNull(destination);
  if (destinationStat && !destinationStat.isDirectory()) refuse(`${folder} in ${root} is not a folder — move it aside, then retry`);

  // A later export keeps the manifest the author left (cli-23).
  const metaFile = join(destination, "meta.yaml");
  const metaText = destinationStat && isFile(metaFile) ? readFileSync(metaFile, "utf8") : null;
  let kept: Manifest | null = null;
  if (metaText !== null) {
    const { manifest, issues } = parseManifestText(metaText);
    if (!manifest) refuse(`${folder}/meta.yaml cannot be read: ${issues.map((issue) => issue.message).join("; ")} — fix it, then retry`);
    const held = `${manifest.org}/${manifest.name}`;
    if (held !== pkg) refuse(`${folder}/ holds ${held}, not ${pkg} — fix the name in its meta.yaml, or export ${held}`);
    kept = manifest;
  }
  if (kept === null && options.skills.length === 0 && options.spec === undefined) refuse("name at least one skill or spec — --skill <folder> or --spec <file>");
  const hasSpec = options.spec !== undefined || kept?.artifacts[name]?.kind === "spec";

  // The skills the flags name, each read whole.
  const flagged: SkillSource[] = [];
  for (const argument of options.skills) {
    const skill = readSkill(resolve(cwd, argument), `--skill ${argument}`);
    if (flagged.some((other) => other.id === skill.id)) refuse(`two skills are named ${skill.id} — give each its own name in its SKILL.md`);
    if (hasSpec && skill.id === name) refuse(`the skill ${skill.id} takes the spec's name ${name} — rename the skill or the package`);
    const other = kept?.artifacts[skill.id];
    if (other !== undefined && other.kind !== "skill") refuse(`${folder}/ holds a ${other.kind} named ${skill.id} already — give the skill its own name in its SKILL.md`);
    flagged.push(skill);
  }
  if (options.spec !== undefined && kept?.artifacts[name] !== undefined && kept.artifacts[name]!.kind !== "spec") {
    refuse(`the ${kept.artifacts[name]!.kind} ${name} takes the spec's name ${name} — rename it or the package`);
  }

  // The spec the flag names.
  const placedByOthers = new Set(Object.entries(readPlacedRecord(root)?.specs ?? {}).filter(([owner]) => owner !== pkg).map(([, spec]) => posix.normalize(spec.path)));
  let specFile: string | null = null;
  if (options.spec !== undefined) {
    specFile = resolve(cwd, options.spec);
    if (!isFile(specFile)) refuse(`--spec ${options.spec} is not a file — give your spec file, ${name}.md under specs/`);
    if (basename(specFile) !== `${name}.md`) refuse(`the spec file must be named ${name}.md, as its items are ${name}-<N> — rename it or the package`);
  }

  // Each artifact the manifest names and no flag does, refreshed from
  // the project by identity (cli-23); one found nowhere is reported and
  // stands as it was.
  const refreshed: SkillSource[] = [];
  const held: Held[] = [];
  const from = new Map<string, string>();
  for (const [id, artifact] of Object.entries(kept?.artifacts ?? {})) {
    if (artifact.kind === "skill") {
      if (flagged.some((skill) => skill.id === id)) continue;
      const found = findSkill(root, id);
      if (found === null) {
        held.push({ kind: "skill", id, note: `not found in ${projectFolders().map((entry) => entry.folder).join(" or ")} — left as it was` });
        continue;
      }
      const label = `the skill ${id} in ${found.shown}`;
      const skill = readSkill(found.folder, label);
      if (skill.id !== id) refuse(`${label}: its SKILL.md names ${skill.id} — name it ${id}, or export it with --skill`);
      refreshed.push(skill);
      from.set(`skill:${id}`, `${found.shown}/`);
    } else if (artifact.kind === "spec") {
      if (specFile !== null) continue;
      specFile = findSpec(root, name, placedByOthers);
      if (specFile === null) held.push({ kind: "spec", id, note: `no ${name}.md under specs/ — left as it was` });
    } else {
      held.push({ kind: artifact.kind, id, note: "left as it is" });
    }
  }

  let specText: string | null = null;
  if (specFile !== null) {
    specText = readFileSync(specFile, "utf8");
    from.set(`spec:${name}`, shownAt(root, specFile));
  }
  for (const skill of flagged) from.set(`skill:${skill.id}`, `${shownAt(root, skill.folder)}/`);

  // A first export's description and license (cli-23).
  let description: string | undefined;
  let license: string | undefined;
  let licenseText: Buffer | undefined;
  if (kept === null) {
    description = options.description
      ?? flagged[0]?.description
      ?? (specText !== null ? intentParagraph(specText) : undefined);
    if (!description) refuse("no description in the first skill's SKILL.md or under the spec's Intent heading — pass --description <text>");
    const licenseFile = join(root, "LICENSE");
    if (isFile(licenseFile)) licenseText = readFileSync(licenseFile);
    license = options.license ?? detectLicense(licenseText?.toString("utf8"));
  }

  // The spec, its citations rewritten for the release (environments-42).
  let warnings: CitationWarning[] = [];
  let releaseSpec: string | null = null;
  if (specFile !== null && specText !== null) {
    const selfPath = relative(join(root, "specs"), specFile).split(sep).join("/");
    const rewritten = rewriteForRelease(specText, { selfPath, packageOf: specOwners(root) });
    releaseSpec = rewritten.text.replace(/\r\n/g, "\n");
    warnings = rewritten.warnings;
  }

  // The pieces to write, the manifest last.
  const languageOf = (id: string): string => kept?.artifacts[id]?.language ?? options.language;
  const added = [
    ...flagged.filter((skill) => kept?.artifacts[skill.id] === undefined).map((skill) => ({ id: skill.id, kind: "skill" as const })),
    ...(options.spec !== undefined && kept?.artifacts[name] === undefined ? [{ id: name, kind: "spec" as const }] : []),
  ];
  const pieces: Piece[] = [
    ...[...flagged, ...refreshed].map((skill) => skillPiece(skill, languageOf(skill.id))),
    ...(releaseSpec !== null ? [filePiece(`specs/${languageOf(name)}/${name}.md`, releaseSpec)] : []),
  ];
  let manifest: Manifest;
  if (kept === null) {
    manifest = {
      format: 2, org, name, version: "0.1.0", description: description!, license: license!, dependencies: {},
      // The kinds given, in the order the artifacts are listed.
      provides: [...(flagged.length > 0 ? ["skill" as const] : []), ...(options.spec !== undefined ? ["spec" as const] : [])],
      artifacts: Object.fromEntries([
        ...flagged.map((skill) => [skill.id, { kind: "skill" as const, language: options.language, requires: [] }]),
        ...(options.spec !== undefined ? [[name, { kind: "spec" as const, language: options.language, requires: [] }]] : []),
      ]),
    };
    pieces.push(filePiece("README.md", `# ${pkg}\n\n${description}\n`));
    if (licenseText) pieces.push(filePiece("LICENSE", licenseText));
    pieces.push(filePiece("meta.yaml", serializeManifest(manifest)));
  } else {
    manifest = kept;
    if (added.length > 0) {
      // The author's file edited in place: its comments, order and
      // fields kept, an entry added per artifact a flag adds.
      const doc = parseDocument(metaText!);
      for (const artifact of added) doc.setIn(["artifacts", artifact.id], doc.createNode({ kind: artifact.kind, language: options.language }));
      manifest = { ...kept, artifacts: { ...kept.artifacts, ...Object.fromEntries(added.map((artifact) => [artifact.id, { kind: artifact.kind, language: options.language, requires: [] }])) } };
      pieces.push(filePiece("meta.yaml", doc.toString({ lineWidth: 0 })));
    }
  }

  // Everything is staged beside the folder: a first export's folder is
  // renamed into place whole; a later one's pieces are swapped in one by
  // one, so a session working in the folder keeps it.
  if (pieces.length > 0) {
    const madePackages = !packagesStat;
    const madeParent = !parentStat;
    mkdirSync(parent, { recursive: true });
    // Made as any folder is, not owner-only as a temporary one.
    const staging = join(parent, `.${name}.export-${randomBytes(6).toString("hex")}`);
    mkdirSync(staging);
    try {
      const built = join(staging, "release");
      mkdirSync(built);
      for (const piece of pieces) {
        const at = join(built, ...piece.path.split("/"));
        mkdirSync(dirname(at), { recursive: true });
        piece.write(at);
      }
      if (lstatOrNull(destination) === null) renameSync(built, destination);
      else for (const [index, piece] of pieces.entries()) swap(join(built, ...piece.path.split("/")), join(destination, ...piece.path.split("/")), join(staging, `aside-${index}`));
    } catch (error) {
      rmSync(staging, { recursive: true, force: true });
      if (madeParent) { try { rmdirSync(parent); } catch { /* holds something else now */ } }
      if (madePackages) { try { rmdirSync(packages); } catch { /* holds something else now */ } }
      throw error;
    }
    rmSync(staging, { recursive: true, force: true });
  }

  for (const warning of warnings) process.stderr.write(`${warningLine(warning)}\n`);
  if (kept !== null && (options.description !== undefined || options.license !== undefined)) {
    console.log("meta.yaml stays as you left it — edit its description and license there");
  }
  // What the folder holds, each artifact with where it came from or why
  // it stands as it was, then the next steps (cli-23).
  const notes = new Map(held.map((entry) => [`${entry.kind}:${entry.id}`, entry.note]));
  const rows = Object.entries(manifest.artifacts).map(([id, artifact]) => {
    const key = `${artifact.kind}:${id}`;
    return [`${artifact.kind} ${id}`, from.has(key) ? `from ${from.get(key)}` : notes.get(key) ?? "left as it is"];
  });
  console.log([
    `Exported ${pkg} ${manifest.version} to ${folder}/`,
    ...table(rows),
    "Next:",
    `  spex publish ${pkg} --dry-run`,
    `  spex publish ${pkg}`,
  ].join("\n"));
};
