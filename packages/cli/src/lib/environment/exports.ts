// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Exports (environments-6, environments-8, environments-9,
// environments-14, environments-16, environments-30, environments-41,
// DR-104, DR-115, DR-124, DR-174). Only what a release provides is
// placed, a support artifact installed and placed nowhere: each provided
// skill is copied — its `name` rewritten where aliased — and one skill
// is generated per provided playbook, into `<root>/.spex/skills/<name>/`;
// those are mirrored into the folder where each agent Spex drives reads
// project-level skills in the working folder, kept out of Git there by
// its `.git/info/exclude`, and, for your own group, into the user-level
// folders of the agents this device has. A playbook's skill goes only
// where the table lets it. A manifest beside them records what Spex
// wrote, so a re-export removes only its own and a skill the reader put
// there stays, the export reporting each name such a skill kept out; an
// unchanged skill is left as it is, and a changed one is swapped in
// whole.
// A provided spec stands in a project's `specs/packages/<pkg>.md`,
// derived from the release's file — the marker line naming its package
// and version, a blank line, then the file with its citations rewritten
// for the tree — whenever the set of placed specs changes, its version
// and its bytes' hash kept in the install record at `.spex/placed.json`,
// and the file left for the reader to commit: a copy holding the
// derivation is the package's, record or no record; one holding the
// bytes recorded follows its release; one edited since, its marker line
// or one the record names at its path, stands as the reader's; one
// whose package no longer places it leaves unless edited; and a file of
// its basename anywhere under `specs/` that is none of these blocks it.
// A project not scaffolded yet, its root holding no `specs/`, places no
// spec and reports it; your own group's clone, which is no project, has
// a generated skill hold the spec file instead.
// Playbooks go to the launcher as module locations at launch, bound to
// the environment whose lock exported them.

import { randomUUID } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { parseDocument, stringify as stringifyYaml } from "yaml";

import { readVersioned, sha256, writeVersionedBytes } from "../files.js";
import { AGENT_FOLDERS } from "./agent-folders.js";
import { rewriteForTree } from "./citations.js";
import { ensureSpexDir, installedDir, skillsDir as generatedSkillsDir } from "./layout.js";
import { parseManifestText, providedArtifacts, type Manifest } from "./format.js";
import { isPathSource, resolutionVersion, type Lock, type Resolution } from "./lock.js";
import { placedMarker, readPlacedMarker } from "./marker.js";
import { placedRecordPath, readPlacedRecord, serializePlacedRecord, writePlacedRecord, type PlacedSpec } from "./placed-record.js";

/** The built-in spec package's name (environments-11). */
export const BUILTIN_PACKAGE_NAME = "sublang/playbooks";

/** The manifest an export leaves in each agent folder it writes. */
export const EXPORTS_MANIFEST = ".spex-exports.json";

/** A managed block of a working folder's `info/exclude`: the exports,
 * or the engine links a compile provisions (playbook-library-12). */
export type ExcludeBlock = "exports" | "engine links";

const excludeBegin = (block: string): string => `# >>> spex ${block} (managed by Spex; do not edit)`;
const excludeEnd = (block: string): string => `# <<< spex ${block}`;

export interface ExportOptions {
  /** The environment's root (environments-26): its `.spex/` holds the
   * installed files and receives the generated skills. */
  root: string;
  lock: Lock;
  /** The working folder exported to; null exports nowhere but the
   * root's `.spex/` and the user's home. */
  workingFolder: string | null;
  /** The folder a path source's path is relative to (environments-2):
   * your own group's clone; the working folder where omitted. */
  pathRoot?: string | null;
  /** The user's home, for your own group's environment; else null. */
  userHome: string | null;
  /** The agents this device has: only their user-level folders are
   * written, while every project-level folder is (environments-16). */
  agents: string[];
  /** The rename a mirror swaps a changed skill in with; the file
   * system's, unless a test injects a failure (environments-30). */
  rename?: (from: string, to: string) => void;
}

/** Where a provided spec stands under a project's `specs/`
 * (environments-41, environments-14): placed at its path; edited there,
 * the package's copy by its marker line or the record, so left as the
 * reader's — as is an edited copy its package no longer places, the
 * project's own now; blocked by a file of its basename under `specs/`
 * that is neither the derivation nor the package's copy; or waiting for
 * `specs/` where the root holds none, placed nowhere. */
export type SpecState = "placed" | "edited" | "blocked" | "no-specs";

export interface SpecPlacement {
  /** The spec package, `<org>/<pkg>`. */
  name: string;
  /** Its path from the root, `specs/packages/<pkg>.md`. */
  path: string;
  state: SpecState;
  /** Each package the placed copy's links wait for, with their count,
   * in name order (environments-41). */
  waiting: { name: string; count: number }[];
  /** For an edited copy, the release's version where its marker line
   * names another: the newer release waiting under `.spex/`
   * (environments-41). */
  waitingVersion?: string;
}

export interface ExportReport {
  /** Every exported skill name, as it stands in `<root>/.spex/skills/`. */
  skills: string[];
  /** Each agent folder written, with the agents that read it. */
  folders: { agents: string[]; level: "project" | "user"; dir: string }[];
  /** Skill folders an earlier export wrote and this one removed. */
  removed: string[];
  /** Exports left out of an agent folder because a folder the reader
   * placed there has the name: the folder as the agent table names it,
   * once under each name where a link makes two folders one. */
  skipped: { name: string; folder: string }[];
  /** Spec packages an exported artifact of which is not here: not
   * installed, or a path source missing where its path resolves. */
  missing: string[];
  /** Each provided spec of a project's root with where it stands, in
   * name order (environments-41); none where the root is no working
   * folder, as your own group's clone. */
  specs: SpecPlacement[];
}

/** Where a spec package's files stand: its installed folder, or a path
 * source's folder where its path resolves (environments-8). */
export function packageRoot(name: string, resolution: Resolution, packagesDir: string, pathRoot: string | null): string | null {
  const source = resolution.source;
  if (isPathSource(source)) return pathRoot === null ? null : join(pathRoot, ...source.path.split("/"));
  return join(packagesDir, ...name.split("/"));
}

function readManifestAt(root: string): Manifest | null {
  const file = join(root, "meta.yaml");
  if (!existsSync(file)) return null;
  return parseManifestText(readFileSync(file, "utf8")).manifest;
}

/** Copy a folder's files, writable, links and engine links left out. */
function copyTree(from: string, to: string): void {
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from).sort()) {
    const source = join(from, name);
    const target = join(to, name);
    const stat = lstatSync(source);
    if (stat.isDirectory()) {
      if (name === "node_modules") continue;
      copyTree(source, target);
    } else if (stat.isFile()) {
      copyFileSync(source, target);
      chmodSync(target, stat.mode & 0o100 ? 0o755 : 0o644);
    }
  }
}

/** A `name` as a YAML string, whatever YAML would read it as bare:
 * four agents read a skill by it (environments-8, environments-16). */
function yamlName(name: string): string {
  return `name: ${stringifyYaml(name, { lineWidth: 0 }).trimEnd()}`;
}

/** Rewrite the `name` of a SKILL.md's frontmatter (Agent Skills: the
 * name matches the folder). */
export function rewriteSkillName(text: string, name: string): string {
  const match = /^(---\r?\n)([\s\S]*?)(\r?\n---[ \t]*(?:\r?\n|$))/.exec(text);
  if (!match) return `---\n${yamlName(name)}\n---\n\n${text}`;
  const front = match[2]!;
  const line = /^name[ \t]*:.*$/m;
  let rewritten: string;
  if (line.test(front)) rewritten = front.replace(line, yamlName(name));
  else {
    const doc = parseDocument(front);
    doc.set("name", name);
    rewritten = doc.toString().replace(/\n$/, "");
  }
  return `${match[1]}${rewritten}${match[3]}${text.slice(match[0].length)}`;
}

/** The SKILL.md generated for an exported playbook (environments-16):
 * for an agent a person runs in the working folder, never for a player
 * Spex launches there, which sees the same skills. The description
 * leaves the version to the body, so its bounded names keep it within
 * the Agent Skills limit. */
export function playbookSkill(options: { name: string; id: string; packageName: string; version: string }): string {
  const { name, id, packageName, version } = options;
  return [
    "---",
    yamlName(name),
    `description: Starts the ${id} playbook of ${packageName} through Spex in this working folder. Not for an agent already playing a role in this or any playbook; that agent does the step it was given.`,
    "---",
    "",
    `Run the playbook \`${id}\` of the spec package \`${packageName}\`, version \`${version}\`, through Spex in this working folder: start the playbook's command in a Spex session of this working folder.`,
    "",
    "If you are already inside a Spex session as a player of a playbook, given a role and a step, this skill does not apply: do the step you were given.",
    "",
  ].join("\n");
}

/** The Agent Skills limits on a name and a description
 * (https://agentskills.io/specification). */
const SKILL_NAME_MAX = 64;
const SKILL_DESCRIPTION_MAX = 1024;

/** The name a spec package's spec is exported under where no alias
 * names it (environments-6): `<org>-<pkg>`, or `<pkg>` where that is
 * longer than an Agent Skills name may be. */
export function specExportName(packageName: string): string {
  const joined = packageName.replace("/", "-");
  return joined.length <= SKILL_NAME_MAX ? joined : packageName.slice(packageName.indexOf("/") + 1);
}

/** The SKILL.md generated for an exported spec (environments-16): what
 * spec package it is, and the spec file beside it. */
export function specSkill(options: { name: string; packageName: string; version: string; description?: string | undefined; file: string }): string {
  const { name, packageName, version, file } = options;
  const [org, pkg] = packageName.split("/") as [string, string];
  const about = (options.description ?? "").replace(/\s+/g, " ").trim();
  const lead = `The spec of ${packageName} ${version}`;
  const tail = `. Read ${file} beside this skill.`;
  // The manifest's description, cut to fit the description's limit.
  let summary = Array.from(about.replace(/[.。]+$/, ""));
  const room = SKILL_DESCRIPTION_MAX - lead.length - tail.length - 2;
  if (summary.length > room) summary = [...Array.from(summary.slice(0, room - 1).join("").trimEnd()), "…"];
  const description = summary.length > 0 ? `${lead}: ${summary.join("")}${tail}` : `${lead}${tail}`;
  return [
    "---",
    stringifyYaml({ name, description }, { lineWidth: 0 }).trimEnd(),
    "---",
    "",
    `The spec package \`${packageName}\` — org \`${org}\`, name \`${pkg}\`, version \`${version}\`${about ? `: ${about}` : "."}`,
    "",
    `Its spec is \`${file}\` beside this file: read it whole when a request names the spec package or works from it. Each of its items states one requirement, cited by its id.`,
    "",
  ].join("\n");
}

function readExportsManifest(dir: string): string[] {
  const file = join(dir, EXPORTS_MANIFEST);
  if (!existsSync(file)) return [];
  try {
    const value = JSON.parse(readFileSync(file, "utf8")) as { skills?: unknown };
    return Array.isArray(value.skills) ? value.skills.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

/** Whether two folders hold the same files, bytes and executable bits:
 * what copyTree writes from one it would write from the other. */
function sameTree(a: string, b: string): boolean {
  let left: string[];
  let right: string[];
  try {
    left = readdirSync(a).sort();
    right = readdirSync(b).sort();
  } catch {
    return false;
  }
  if (left.length !== right.length || left.some((name, index) => name !== right[index])) return false;
  for (const name of left) {
    const x = lstatSync(join(a, name));
    const y = lstatSync(join(b, name));
    if (x.isDirectory() && y.isDirectory()) {
      if (!sameTree(join(a, name), join(b, name))) return false;
    } else if (x.isFile() && y.isFile()) {
      if (x.size !== y.size || (x.mode & 0o100) !== (y.mode & 0o100)) return false;
      if (!readFileSync(join(a, name)).equals(readFileSync(join(b, name)))) return false;
    } else return false;
  }
  return true;
}

/** The staging folders a mirror makes beside an agent folder, outside
 * every folder an agent reads skills from (environments-30). */
const STAGING_PREFIX = ".spex-staging-";

/** Whether anything stands at a path, a link included, dangling or not. */
function standing(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

/** Where a path is on disk: its nearest standing ancestor with every
 * link resolved, a link whose target is not there yet followed to that
 * target, and the rest as written. Two agent folders that are one
 * folder by a link resolve alike, before the folder exists too. */
function realLocation(path: string, depth = 0): string {
  const rest: string[] = [];
  let current = path;
  for (;;) {
    try {
      return join(realpathSync.native(current), ...rest.reverse());
    } catch {
      let link: string | null = null;
      try {
        if (lstatSync(current).isSymbolicLink()) link = readlinkSync(current);
      } catch {
        // Nothing stands here: an ancestor decides.
      }
      if (link !== null && depth < 16) return realLocation(join(resolve(dirname(current), link), ...rest.reverse()), depth + 1);
      const parent = dirname(current);
      if (parent === current) return path;
      rest.push(basename(current));
      current = parent;
    }
  }
}

function mirror(skillsDir: string, names: string[], folder: string, named: string[], report: ExportReport, rename: (from: string, to: string) => void): string[] {
  // The folder as it is on disk, made there where a link points at it
  // before it exists, so the staging copy beside it shares its
  // filesystem even where a link puts it elsewhere.
  const location = realLocation(folder);
  mkdirSync(location, { recursive: true });
  const dir = realpathSync.native(location);
  const previous = readExportsManifest(dir);
  for (const name of previous) {
    if (names.includes(name)) continue;
    rmSync(join(dir, name), { recursive: true, force: true });
    if (!report.removed.includes(name)) report.removed.push(name);
  }
  const written: string[] = [];
  // A changed skill is made whole beside the agent folder and renamed
  // into place, the replaced one moved aside first and back where the
  // rename fails; one whose files already match is left as it stands.
  const staging = join(dirname(dir), `${STAGING_PREFIX}${randomUUID()}`);
  try {
    for (const name of names) {
      const target = join(dir, name);
      if (standing(target) && !previous.includes(name)) {
        for (const as of named) report.skipped.push({ name, folder: as });
        continue;
      }
      written.push(name);
      const source = join(skillsDir, name);
      if (sameTree(source, target)) continue;
      const staged = join(staging, "new", name);
      copyTree(source, staged);
      const replaced = join(staging, "old", name);
      const hadTarget = standing(target);
      if (hadTarget) {
        mkdirSync(dirname(replaced), { recursive: true });
        rename(target, replaced);
      }
      try {
        rename(staged, target);
      } catch (error) {
        if (hadTarget) renameSync(replaced, target);
        throw error;
      }
    }
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
  const manifest = join(dir, EXPORTS_MANIFEST);
  const text = `${JSON.stringify({ format: 1, skills: written.sort() }, null, 2)}\n`;
  let current: string | null = null;
  try { current = readFileSync(manifest, "utf8"); } catch { current = null; }
  if (current !== text) writeFileSync(manifest, text);
  return written;
}

/** The `info/exclude` file of the Git work tree a working folder lies
 * in, where it lies in one, with the folder's path below the work
 * tree's top, `/`-separated, empty at the top itself. */
export function gitExclude(workingFolder: string): { file: string; prefix: string } | null {
  const segments: string[] = [];
  for (let dir = resolve(workingFolder); ; dir = dirname(dir)) {
    const dotGit = join(dir, ".git");
    let stat;
    try { stat = statSync(dotGit); } catch { stat = undefined; }
    if (stat) {
      const prefix = segments.reverse().join("/");
      if (stat.isDirectory()) return { file: join(dotGit, "info", "exclude"), prefix };
      const match = /^gitdir:\s*(.+)$/m.exec(readFileSync(dotGit, "utf8"));
      if (!match) return null;
      const gitDir = resolve(dir, match[1]!.trim());
      const commonFile = join(gitDir, "commondir");
      const common = existsSync(commonFile) ? resolve(gitDir, readFileSync(commonFile, "utf8").trim()) : gitDir;
      return { file: join(common, "info", "exclude"), prefix };
    }
    if (dirname(dir) === dir) return null;
    segments.push(basename(dir));
  }
}

/** The `info/exclude` file of a working folder's Git, where it lies in
 * a work tree. */
export function gitExcludeFile(workingFolder: string): string | null {
  return gitExclude(workingFolder)?.file ?? null;
}

/** Replace a managed block of a working folder's `info/exclude`, under
 * the version read: the file changed meanwhile is refused as a conflict,
 * never overwritten (DR-111). The file is the folder's, so its mode is
 * kept; one made new is 0644. A folder below its work tree's top keeps
 * a block of its own, its anchored entries placed under its path, so
 * two such folders of one work tree never replace each other's. */
export function writeExcludeBlock(workingFolder: string, entries: string[], block: ExcludeBlock = "exports"): void {
  const found = gitExclude(workingFolder);
  if (!found) return;
  const { file, prefix } = found;
  const label = prefix === "" ? block : `${block} /${prefix}/`;
  const begin = excludeBegin(label);
  const end = excludeEnd(label);
  const placed = prefix === "" ? entries : entries.map((entry) => (entry.startsWith("/") ? `/${prefix}${entry}` : entry));
  const read = readVersioned(file);
  const text = read.bytes === null ? "" : read.bytes.toString("utf8");
  const lines = text.split("\n");
  const kept: string[] = [];
  let inside = false;
  for (const line of lines) {
    if (line === begin) { inside = true; continue; }
    if (line === end) { inside = false; continue; }
    if (!inside) kept.push(line);
  }
  while (kept.length > 0 && kept[kept.length - 1] === "") kept.pop();
  const managed = placed.length > 0 ? [begin, ...placed, end] : [];
  const out = [...kept, ...managed].join("\n");
  const next = out.length > 0 ? `${out}\n` : "";
  if (next === text) return;
  let mode = 0o644;
  try { mode = statSync(file).mode & 0o7777; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  mkdirSync(dirname(file), { recursive: true });
  writeVersionedBytes(file, next, read.version, mode);
}

/**
 * Remove what exports wrote into a working folder (environments-8): each
 * agent folder's exported skills and their manifest, and the exports'
 * block of the folder's `info/exclude`; a skill the reader placed stays.
 * Called when the folder stops being paired with the spex repository.
 */
export function removeExports(workingFolder: string): string[] {
  const removed: string[] = [];
  for (const folder of new Set(Object.values(AGENT_FOLDERS).map((folders) => folders.project))) {
    const dir = join(workingFolder, ...folder.split("/"));
    const manifest = join(dir, EXPORTS_MANIFEST);
    if (!existsSync(manifest)) continue;
    for (const name of readExportsManifest(dir)) {
      rmSync(join(dir, name), { recursive: true, force: true });
      removed.push(name);
    }
    rmSync(manifest, { force: true });
  }
  writeExcludeBlock(workingFolder, [], "exports");
  return removed.sort();
}

function userFolder(userHome: string, folder: string): string {
  if (folder.startsWith("~/")) return join(userHome, ...folder.slice(2).split("/"));
  return isAbsolute(folder) ? folder : join(userHome, ...folder.split("/"));
}

/** A project's specs folder at its root. */
const SPECS = "specs";

/** The path from the root a spec `<pkg>` is placed at (environments-41). */
export function placedSpecPath(id: string): string {
  return `${SPECS}/packages/${id}.md`;
}

function isDirectory(path: string): boolean {
  try { return statSync(path).isDirectory(); } catch { return false; }
}

/** The digest of something at a path that is no file: no file's bytes
 * have it. */
const NOT_A_FILE = "not a file";

/** What stands at a root's path, as a digest: the SHA-256 of a file's
 * bytes; null where nothing stands; and NOT_A_FILE where something else
 * stands — a folder, a link, or a path under a file. */
function standingDigest(root: string, path: string): string | null {
  const file = join(root, ...path.split("/"));
  try {
    if (!lstatSync(file).isFile()) return NOT_A_FILE;
    return sha256(readFileSync(file));
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? null : NOT_A_FILE;
  }
}

/** Every regular file under a root's `specs/` by its basename, each
 * with its paths from the root, in a walk of sorted entries that follows
 * no link: what a spec's basename, unique across the tree (meta-10),
 * meets wherever a collection holds it (environments-41). */
function specsByBasename(root: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const walk = (relativeDir: string): void => {
    let entries: string[];
    try { entries = readdirSync(join(root, ...relativeDir.split("/"))).sort(); } catch { return; }
    for (const entry of entries) {
      const path = `${relativeDir}/${entry}`;
      let stat;
      try { stat = lstatSync(join(root, ...path.split("/"))); } catch { continue; }
      if (stat.isDirectory()) walk(path);
      else if (stat.isFile()) out.set(entry, [...(out.get(entry) ?? []), path]);
    }
  };
  walk(SPECS);
  return out;
}

/** A record's waiting counts as a report lists them. */
function waitingList(waiting: Record<string, number>): { name: string; count: number }[] {
  return Object.keys(waiting).sort().map((name) => ({ name, count: waiting[name]! }));
}

/** How an environment's provided specs are placed (environments-8): as
 * files under `specs/packages/` where the root is the working folder
 * and holds `specs/`; nowhere in a working folder holding none, each
 * reported waiting for `specs/`; and as generated skills where the root
 * is no working folder — your own group's clone. */
type SpecMode = "files" | "no-specs" | "skills";

function specMode(root: string, workingFolder: string | null): SpecMode {
  if (workingFolder === null || realLocation(resolve(workingFolder)) !== realLocation(resolve(root))) return "skills";
  return isDirectory(join(root, SPECS)) ? "files" : "no-specs";
}

/** A provided spec found to place: its spec package, its id `<pkg>`,
 * the release's version, and its spec file in its chosen language. */
interface SpecSource { name: string; id: string; version: string; file: string }

/** Remove a copy only while it still holds the bytes recorded, checked
 * at the instant before (DR-111); whether it went. */
function removeUnchanged(root: string, path: string, digest: string): boolean {
  if (standingDigest(root, path) !== digest) return false;
  rmSync(join(root, ...path.split("/")), { force: true });
  return true;
}

/** The marker on the first line of the file at a root's path, where a
 * file stands there and opens with one (environments-41). */
function standingMarker(root: string, path: string): { name: string; version: string } | null {
  const file = join(root, ...path.split("/"));
  try { return lstatSync(file).isFile() ? readPlacedMarker(readFileSync(file, "utf8")) : null; } catch { return null; }
}

/** The bytes a provided spec is placed as (environments-41): the marker
 * line naming its package and version, a blank line, then the release's
 * file with each address rewritten for the specs standing — `standing`
 * giving each package's placed path below `specs/` — and the packages
 * its links wait for. */
function deriveSpec(source: SpecSource, standing: ReadonlyMap<string, string>): { text: string; sha256: string; waiting: Record<string, number> } {
  const self = placedSpecPath(source.id).slice(SPECS.length + 1);
  const placedPathOf = (name: string): string | null => (name === source.name ? self : standing.get(name) ?? null);
  const rewritten = rewriteForTree(readFileSync(source.file, "utf8"), { placedPathOf, selfPath: self });
  const text = `${placedMarker(source.name, source.version)}\n\n${rewritten.text}`;
  return { text, sha256: sha256(text), waiting: rewritten.waiting };
}

/** What placing a root's provided specs does: where each stands, each
 * file written with the digest it must still hold (DR-111), and the
 * record left. */
interface SpecPlan {
  placements: SpecPlacement[];
  writes: { path: string; text: string; digest: string | null }[];
  record: Record<string, PlacedSpec>;
}

/**
 * Plan the placement of a root's provided specs (environments-41) from
 * the files, their marker lines and the install record, writing nothing
 * but through `remove`:
 *
 * 1. each spec claims `specs/packages/<pkg>.md`, the first in name order
 *    taking it and a later one blocked, as is one whose path a copy of a
 *    package whose files are not here holds — by the record, or by the
 *    marker line of the copy standing there, as on a fresh clone;
 * 2. a recorded copy its package no longer places there — removed, no
 *    longer providing its spec, or now blocked — leaves through `remove`
 *    while it holds the bytes recorded, else stays as the project's own,
 *    reported edited where its package places no spec now;
 * 3. a claimed spec is blocked by a file at its path the record does not
 *    name for it and whose marker line names another package or none, or
 *    by a file of its basename elsewhere under `specs/` whose marker line
 *    does not name its package: the derivation opens with that line, so
 *    such a file is never the derivation, whatever specs stand — which
 *    specs stand is known before any is derived, and no copy differs
 *    only for another's presumed standing;
 * 4. each spec not blocked is derived for the specs standing — those not
 *    blocked, and the copies of packages whose files are not here that
 *    hold their paths — and is placed where the file holds the derivation, recorded
 *    with or without an earlier record, as on a fresh clone; written
 *    where no file stands or the file holds the bytes recorded; and
 *    otherwise edited, the package's by its marker line or its record:
 *    left standing, its record kept as it was, the release's version
 *    waiting where the marker, else the record, names another.
 */
function planSpecs(root: string, sources: SpecSource[], unread: ReadonlySet<string>, remove: (path: string, digest: string) => boolean): SpecPlan {
  const previous = readPlacedRecord(root)?.specs ?? {};
  const record: Record<string, PlacedSpec> = {};
  const placements: SpecPlacement[] = [];
  const writes: SpecPlan["writes"] = [];
  const byName = (a: { name: string }, b: { name: string }): number => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  const ordered = [...sources].sort(byName);
  const names = new Set(ordered.map((source) => source.name));
  // A copy `remove` took leaves nothing standing at its path.
  const gone = new Set<string>();
  const digestOf = (path: string): string | null => (gone.has(path) ? null : standingDigest(root, path));

  // A package whose files are not here keeps what the record says of its
  // copy, which still holds its path (environments-8).
  const held = new Map<string, string>();
  for (const name of Object.keys(previous).sort()) {
    if (!unread.has(name) || names.has(name)) continue;
    record[name] = previous[name]!;
    held.set(previous[name]!.path, name);
  }
  // So does a committed copy its marker line names it in, record or no
  // record, as a fresh clone finds it: it stands for the links citing
  // it, and nothing is recorded of bytes no derivation here vouches for.
  for (const name of [...unread].sort()) {
    if (names.has(name) || record[name] !== undefined) continue;
    const path = placedSpecPath(name.slice(name.indexOf("/") + 1));
    if (!held.has(path) && standingMarker(root, path)?.name === name) held.set(path, name);
  }

  // 1. The basename's claim: the first in name order.
  const claims = new Map<string, SpecSource>();
  const blocked = new Set<string>();
  for (const source of ordered) {
    const path = placedSpecPath(source.id);
    if (claims.has(path) || held.has(path)) blocked.add(source.name);
    else claims.set(path, source);
  }

  // 2. A copy no longer placed for its package leaves unless edited.
  for (const name of Object.keys(previous).sort()) {
    if (record[name] !== undefined) continue;
    const entry = previous[name]!;
    if (claims.get(entry.path)?.name === name) continue;
    const digest = digestOf(entry.path);
    if (digest === null) continue;
    if (digest === entry.sha256 && remove(entry.path, entry.sha256)) { gone.add(entry.path); continue; }
    if (!names.has(name)) placements.push({ name, path: entry.path, state: "edited", waiting: [] });
  }

  // 3. What stands at each claimed path, and the files that block.
  const candidates = new Map([...claims].map(([path, source]) => {
    const entry = previous[source.name];
    const found = {
      path,
      digest: digestOf(path),
      recorded: entry !== undefined && entry.path === path ? entry : null,
      marker: gone.has(path) ? null : standingMarker(root, path),
    };
    return [source.name, found] as const;
  }));
  const elsewhere = specsByBasename(root);
  for (const [name, { path, digest, recorded, marker }] of candidates) {
    if (digest === NOT_A_FILE || (digest !== null && recorded === null && marker?.name !== name)) blocked.add(name);
    const others = (elsewhere.get(basename(path)) ?? []).filter((other) => other !== path && !gone.has(other));
    if (others.some((other) => standingMarker(root, other)?.name !== name)) blocked.add(name);
  }

  // 4. Each derived for the specs standing: placed, written or edited.
  const standing = new Map<string, string>();
  for (const source of ordered) if (!blocked.has(source.name)) standing.set(source.name, placedSpecPath(source.id).slice(SPECS.length + 1));
  for (const [path, name] of held) if (digestOf(path) !== null) standing.set(name, path.slice(SPECS.length + 1));
  for (const source of ordered) {
    const path = placedSpecPath(source.id);
    const candidate = candidates.get(source.name);
    if (candidate === undefined || blocked.has(source.name)) {
      placements.push({ name: source.name, path, state: "blocked", waiting: [] });
      continue;
    }
    const { digest, recorded, marker } = candidate;
    const spec = deriveSpec(source, standing);
    if (digest !== null && digest !== spec.sha256 && digest !== recorded?.sha256) {
      // Edited since it was placed: the reader's to merge.
      if (recorded !== null) record[source.name] = recorded;
      const known = marker?.name === source.name ? marker.version : recorded?.version;
      const waiting = known !== undefined && known !== source.version ? { waitingVersion: source.version } : {};
      placements.push({ name: source.name, path, state: "edited", waiting: [], ...waiting });
      continue;
    }
    if (digest !== spec.sha256) writes.push({ path, text: spec.text, digest });
    record[source.name] = { path, version: source.version, sha256: spec.sha256, waiting: spec.waiting };
    placements.push({ name: source.name, path, state: "placed", waiting: waitingList(spec.waiting) });
  }
  return { placements: placements.sort(byName), writes, record };
}

/** Place the provided specs of a root holding `specs/` (environments-41)
 * as `planSpecs` decides: a copy that leaves removed while it holds the
 * bytes recorded, each file written under the version read so a hand
 * edit meanwhile is refused (DR-111), and the record written whole only
 * where it changed, removed once it records nothing. */
function placeSpecs(root: string, sources: SpecSource[], unread: ReadonlySet<string>): SpecPlacement[] {
  const plan = planSpecs(root, sources, unread, (path, digest) => removeUnchanged(root, path, digest));
  for (const { path, text, digest } of plan.writes) {
    // A project file the reader commits.
    const file = join(root, ...path.split("/"));
    mkdirSync(dirname(file), { recursive: true });
    writeVersionedBytes(file, text, digest, 0o644);
  }
  const record = { format: 1 as const, specs: plan.record };
  const recordFile = placedRecordPath(root);
  let current: string | null = null;
  try { current = readFileSync(recordFile, "utf8"); } catch { current = null; }
  if (Object.keys(plan.record).length === 0) {
    if (current !== null) rmSync(recordFile, { force: true });
  } else if (current !== serializePlacedRecord(record)) {
    writePlacedRecord(root, record);
  }
  return plan.placements;
}

/** The provided specs of a lock as an install places them, from release
 * files that stand here as the lock locks them, and the spec packages
 * whose files do not: not installed, another version installed, or a
 * path source missing where its path resolves (environments-8). */
function lockedSpecs(root: string, lock: Lock, pathRoot: string | null): { sources: SpecSource[]; unread: Set<string> } {
  const sources: SpecSource[] = [];
  const unread = new Set<string>();
  const packagesDir = installedDir(root);
  for (const name of Object.keys(lock.packages).sort()) {
    const resolution = lock.packages[name]!;
    const dir = packageRoot(name, resolution, packagesDir, pathRoot);
    let manifest: Manifest | null = null;
    try { manifest = dir === null ? null : readManifestAt(dir); } catch { manifest = null; }
    const locked = resolutionVersion(resolution);
    if (dir === null || manifest === null || (locked !== undefined && manifest.version !== locked)) {
      unread.add(name);
      continue;
    }
    const provided = providedArtifacts(manifest);
    for (const id of [...new Set(Object.values(resolution.exports))].sort()) {
      const language = resolution.artifacts[id]?.language;
      if (manifest.artifacts[id]?.kind !== "spec" || !provided.has(id) || !language) continue;
      const file = join(dir, "specs", language, `${id}.md`);
      if (existsSync(file)) sources.push({ name, id, version: locked ?? manifest.version, file });
      else unread.add(name);
    }
  }
  return { sources, unread };
}

/**
 * Where each provided spec of a lock stands under a project's root, read
 * from the files, their marker lines and the install record as a
 * placement finds them, writing nothing (environments-14,
 * environments-41), so `spex list` and an install agree: waiting for
 * `specs/` where the root holds none; else placed, edited or blocked as
 * an install reports it. A spec whose package's files are not here as
 * the lock locks them is left out, its recorded copy holding its path,
 * and so is one whose copy is not written yet.
 */
export function readSpecPlacements(root: string, lock: Lock, pathRoot: string | null = root): SpecPlacement[] {
  const { sources, unread } = lockedSpecs(root, lock, pathRoot);
  if (!isDirectory(join(root, SPECS))) return sources.map(({ name, id }) => ({ name, path: placedSpecPath(id), state: "no-specs" as const, waiting: [] }));
  const plan = planSpecs(root, sources, unread, () => true);
  const unwritten = new Set(plan.writes.filter((write) => write.digest === null).map((write) => write.path));
  return plan.placements.filter((placement) => placement.state !== "placed" || !unwritten.has(placement.path));
}

/** Export an installed environment (environments-8). */
export async function exportEnvironment(options: ExportOptions): Promise<ExportReport> {
  const { root: envRoot, lock, workingFolder } = options;
  const packagesDir = installedDir(envRoot);
  const pathRoot = options.pathRoot === undefined ? workingFolder : options.pathRoot;
  const report: ExportReport = { skills: [], folders: [], removed: [], skipped: [], missing: [], specs: [] };
  const playbookSkills = new Set<string>();
  const mode = specMode(envRoot, workingFolder);
  const specSources: SpecSource[] = [];
  // Spec packages whose provided spec cannot be read here: what the
  // record says of their copies stands.
  const unread = new Set<string>();
  ensureSpexDir(envRoot);
  // The skills are generated whole into a folder beside `.spex/skills/`
  // and swapped in only where they differ, so an export that changes
  // nothing rewrites no file (cli-4).
  const finalSkillsDir = generatedSkillsDir(envRoot);
  const skillsDir = join(dirname(finalSkillsDir), `.skills-${randomUUID()}`);
  rmSync(skillsDir, { recursive: true, force: true });
  mkdirSync(skillsDir, { recursive: true });
  try {
    for (const name of Object.keys(lock.packages).sort()) {
      const resolution = lock.packages[name]!;
      const root = packageRoot(name, resolution, packagesDir, pathRoot);
      const manifest = root === null ? null : readManifestAt(root);
      if (root === null || manifest === null) {
        if (Object.keys(resolution.exports).length > 0) report.missing.push(name);
        unread.add(name);
        continue;
      }
      const version = resolutionVersion(resolution) ?? manifest.version;
      // A support artifact, or one of a kind the release does not offer,
      // is installed with the rest and placed nowhere; the lock's names
      // stay as resolved (environments-6).
      const provided = providedArtifacts(manifest);
      for (const exported of Object.keys(resolution.exports).sort()) {
        const id = resolution.exports[exported]!;
        const artifact = manifest.artifacts[id];
        const language = resolution.artifacts[id]?.language;
        if (!artifact || !language || !provided.has(id)) continue;
        const target = join(skillsDir, exported);
        if (artifact.kind === "skill") {
          const folder = join(root, "skills", language, id);
          if (!existsSync(folder)) { if (!report.missing.includes(name)) report.missing.push(name); continue; }
          copyTree(folder, target);
          if (exported !== id) {
            const skill = join(target, "SKILL.md");
            writeFileSync(skill, rewriteSkillName(readFileSync(skill, "utf8"), exported));
          }
        } else if (artifact.kind === "playbook") {
          // No skill runs a playbook whose folder is not here.
          if (!existsSync(join(root, "playbooks", language, id))) { if (!report.missing.includes(name)) report.missing.push(name); continue; }
          mkdirSync(target, { recursive: true });
          writeFileSync(join(target, "SKILL.md"), playbookSkill({ name: exported, id, packageName: name, version }));
          playbookSkills.add(exported);
        } else if (artifact.kind === "spec") {
          const file = join(root, "specs", language, `${id}.md`);
          if (!existsSync(file)) { if (!report.missing.includes(name)) report.missing.push(name); unread.add(name); continue; }
          // In a project's `specs/`, a file placed after the skills
          // (environments-41); in a project holding no `specs/`, nowhere,
          // reported waiting for it; else, your own group's, a generated
          // skill, the spec file in its chosen language byte for byte
          // beside a SKILL.md saying what spec package it is (DR-115).
          if (mode === "files") { specSources.push({ name, id, version, file }); continue; }
          if (mode === "no-specs") { report.specs.push({ name, path: placedSpecPath(id), state: "no-specs", waiting: [] }); continue; }
          mkdirSync(target, { recursive: true });
          copyFileSync(file, join(target, `${id}.md`));
          chmodSync(join(target, `${id}.md`), 0o644);
          writeFileSync(join(target, "SKILL.md"), specSkill({ name: exported, packageName: name, version, description: manifest.description, file: `${id}.md` }));
        } else continue;
        report.skills.push(exported);
      }
    }
    report.skills.sort();
  } catch (error) {
    rmSync(skillsDir, { recursive: true, force: true });
    throw error;
  }
  if (sameTree(skillsDir, finalSkillsDir)) rmSync(skillsDir, { recursive: true, force: true });
  else {
    rmSync(finalSkillsDir, { recursive: true, force: true });
    renameSync(skillsDir, finalSkillsDir);
  }
  const mirrored = mirrorExports(options, finalSkillsDir, report, playbookSkills);
  // The specs after the skills, in the project's `specs/`, never listed
  // in its Git's exclude: they are the reader's to commit.
  if (mode === "files") mirrored.specs = placeSpecs(envRoot, specSources, unread);
  return mirrored;
}

function mirrorExports(options: ExportOptions, skillsDir: string, report: ExportReport, playbookSkills: Set<string>): ExportReport {
  const { workingFolder, userHome } = options;

  // Every project-level folder the table names, whatever agents this
  // device has; a user-level folder only for an agent it has
  // (environments-16). A folder several agents read is written once, and
  // so are two folders a link makes one, with playbook skills where
  // either takes them.
  interface Readers { folders: string[]; dir: string; agents: string[]; playbooks: boolean }
  const readers = (level: "project" | "user", root: string, present: (agent: string) => boolean): Readers[] => {
    const byLocation = new Map<string, Readers>();
    for (const [agent, entry] of Object.entries(AGENT_FOLDERS).sort(([a], [b]) => a.localeCompare(b))) {
      if (!present(agent)) continue;
      const folder = level === "project" ? entry.project : entry.user;
      const dir = level === "project" ? join(root, ...folder.split("/")) : userFolder(root, folder);
      const location = realLocation(dir);
      const known = byLocation.get(location) ?? { folders: [], dir, agents: [], playbooks: false };
      if (!known.folders.includes(folder)) known.folders.push(folder);
      known.agents.push(agent);
      known.playbooks ||= entry.playbooks;
      byLocation.set(location, known);
    }
    return [...byLocation.values()];
  };
  const exported = (playbooks: boolean): string[] => report.skills.filter((name) => playbooks || !playbookSkills.has(name));
  const rename = options.rename ?? renameSync;
  const excluded: string[] = [];
  if (workingFolder !== null) {
    for (const { folders, dir, agents, playbooks } of readers("project", workingFolder, () => true)) {
      const written = mirror(skillsDir, exported(playbooks), dir, folders, report, rename);
      report.folders.push({ agents, level: "project", dir });
      for (const folder of folders) excluded.push(`/${folder}/${EXPORTS_MANIFEST}`, ...written.map((name) => `/${folder}/${name}/`), `/${dirname(folder)}/${STAGING_PREFIX}*/`);
      // The staging copy sits beside the folder as it is on disk, which a
      // link can move elsewhere in the working folder.
      const staging = relative(realpathSync.native(workingFolder), dirname(realpathSync.native(dir)));
      if (!staging.startsWith("..") && !isAbsolute(staging)) {
        const line = `/${staging === "" ? "" : `${staging.split(sep).join("/")}/`}${STAGING_PREFIX}*/`;
        if (!excluded.includes(line)) excluded.push(line);
      }
    }
    writeExcludeBlock(workingFolder, excluded);
  }
  if (userHome !== null) {
    const present = new Set(options.agents);
    for (const { folders, dir, agents, playbooks } of readers("user", userHome, (agent) => present.has(agent))) {
      mirror(skillsDir, exported(playbooks), dir, folders, report, rename);
      report.folders.push({ agents, level: "user", dir });
    }
  }
  return report;
}

export interface ModuleLocation {
  /** The playbook's registry module, absolute. */
  module: string;
  /** The spec package it came from, and its version. */
  package: string;
  version: string;
  /** Whether it is the app's built-in spec package. */
  builtin: boolean;
  /** The playbook's own id (the key is its exported name). */
  id: string;
  /** Whether the module file is there. */
  present: boolean;
}

/** The module candidates of a playbook artifact folder, preferred first. */
export function playbookModuleCandidates(folder: string, id: string): string[] {
  return [
    join(folder, `${id}.playbook`, `${id}.registry.js`),
    join(folder, `${id}.playbook`, `${id}.registry.mjs`),
    join(folder, `${id}.registry.mjs`),
    join(folder, `${id}.registry.js`),
  ];
}

/** Each exported playbook's module location (environments-9): the
 * installed artifact under the root's `.spex/packages/`, or a path
 * source's where its path resolves, `pathRoot` being the folder its path
 * is relative to. Keyed by the exported name. */
export function moduleLocations(lock: Lock, root: string, pathRoot: string | null): Map<string, ModuleLocation> {
  const out = new Map<string, ModuleLocation>();
  const packagesDir = installedDir(root);
  for (const name of Object.keys(lock.packages).sort()) {
    const resolution = lock.packages[name]!;
    const root = packageRoot(name, resolution, packagesDir, pathRoot);
    if (root === null) continue;
    const pathSource = isPathSource(resolution.source);
    const manifest = pathSource ? readManifestAt(root) : null;
    const version = resolutionVersion(resolution) ?? readManifestAt(root)?.version ?? "";
    for (const exported of Object.keys(resolution.exports).sort()) {
      const id = resolution.exports[exported]!;
      const language = resolution.artifacts[id]?.language;
      if (!language) continue;
      const prefix = `playbooks/${language}/${id}/`;
      const isPlaybook = pathSource ? manifest?.artifacts[id]?.kind === "playbook" : resolution.files.some((file) => file.path.startsWith(prefix));
      if (!isPlaybook) continue;
      const candidates = playbookModuleCandidates(join(root, "playbooks", language, id), id);
      const found = candidates.find((candidate) => existsSync(candidate));
      out.set(exported, {
        module: found ?? candidates[0]!,
        package: name,
        version,
        builtin: name === BUILTIN_PACKAGE_NAME,
        id,
        present: found !== undefined,
      });
    }
  }
  return out;
}

export interface EnvironmentModules {
  /** The spex repository's key. */
  repository: string;
  locations: Map<string, ModuleLocation>;
}

export type LaunchModules =
  | { ok: true; modules: Map<string, ModuleLocation & { repository: string }> }
  | { ok: false; errors: { playbook: string; repository: string }[] };

/** The modules a session hands the launcher (environments-9): each
 * enabled playbook from the project's environment, else your own
 * group's; one no environment exports is a config error naming the
 * playbook and the spex repository whose environment lacks it. */
export function launchModules(enabled: Iterable<string>, project: EnvironmentModules | null, own: EnvironmentModules): LaunchModules {
  const modules = new Map<string, ModuleLocation & { repository: string }>();
  const errors: { playbook: string; repository: string }[] = [];
  for (const playbook of [...new Set(enabled)].sort()) {
    const fromProject = project?.locations.get(playbook);
    if (fromProject) { modules.set(playbook, { ...fromProject, repository: project!.repository }); continue; }
    const fromOwn = own.locations.get(playbook);
    if (fromOwn) { modules.set(playbook, { ...fromOwn, repository: own.repository }); continue; }
    errors.push({ playbook, repository: (project ?? own).repository });
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, modules };
}
