// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Exports (environments-8, environments-9, environments-16,
// environments-30, DR-104, DR-115, DR-124). Each selected skill is
// copied — its `name` rewritten where aliased — and one skill is
// generated per selected playbook, and one per selected spec holding the
// spec file, into `<root>/.spex/skills/<name>/`; those are mirrored into the
// folder where each agent Spex drives reads project-level skills in the
// working folder, kept out of Git there by its `.git/info/exclude`, and,
// for your own group, into the user-level folders of the agents this
// device has. A playbook's skill goes only where the table lets it. A
// manifest beside them records what Spex wrote, so a re-export removes
// only its own and a skill the reader put there stays, the export
// reporting each name such a skill kept out; an unchanged skill is left
// as it is, and a changed one is swapped in whole.
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

import { readVersioned, writeVersionedBytes } from "../files.js";
import { AGENT_FOLDERS } from "./agent-folders.js";
import { ensureSpexDir, installedDir, skillsDir as generatedSkillsDir } from "./layout.js";
import { parseManifestText, type Manifest } from "./format.js";
import { isPathSource, resolutionVersion, type Lock, type Resolution } from "./lock.js";

/** The built-in spec package's name (environments-11). */
export const BUILTIN_PACKAGE_NAME = "sublang/playbooks";

/** The manifest an export leaves in each agent folder it writes. */
export const EXPORTS_MANIFEST = ".spex-exports.json";

/** A managed block of a working folder's `info/exclude`: the exports,
 * or the engine links a compile provisions (playbook-library-12). */
export type ExcludeBlock = "exports" | "engine links";

const excludeBegin = (block: ExcludeBlock): string => `# >>> spex ${block} (managed by Spex; do not edit)`;
const excludeEnd = (block: ExcludeBlock): string => `# <<< spex ${block}`;

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
  writeFileSync(join(dir, EXPORTS_MANIFEST), `${JSON.stringify({ format: 1, skills: written.sort() }, null, 2)}\n`);
  return written;
}

/** The `info/exclude` file of a working folder's Git, where it has one. */
export function gitExcludeFile(workingFolder: string): string | null {
  const dotGit = join(workingFolder, ".git");
  let stat;
  try { stat = statSync(dotGit); } catch { return null; }
  if (stat.isDirectory()) return join(dotGit, "info", "exclude");
  const match = /^gitdir:\s*(.+)$/m.exec(readFileSync(dotGit, "utf8"));
  if (!match) return null;
  const gitDir = resolve(workingFolder, match[1]!.trim());
  const commonFile = join(gitDir, "commondir");
  const common = existsSync(commonFile) ? resolve(gitDir, readFileSync(commonFile, "utf8").trim()) : gitDir;
  return join(common, "info", "exclude");
}

/** Replace a managed block of a working folder's `info/exclude`, under
 * the version read: the file changed meanwhile is refused as a conflict,
 * never overwritten (DR-111). The file is the folder's, so its mode is
 * kept; one made new is 0644. */
export function writeExcludeBlock(workingFolder: string, entries: string[], block: ExcludeBlock = "exports"): void {
  const file = gitExcludeFile(workingFolder);
  if (!file) return;
  const begin = excludeBegin(block);
  const end = excludeEnd(block);
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
  const managed = entries.length > 0 ? [begin, ...entries, end] : [];
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

/** Export an installed environment (environments-8). */
export async function exportEnvironment(options: ExportOptions): Promise<ExportReport> {
  const { root: envRoot, lock, workingFolder, userHome } = options;
  const packagesDir = installedDir(envRoot);
  const pathRoot = options.pathRoot === undefined ? workingFolder : options.pathRoot;
  const report: ExportReport = { skills: [], folders: [], removed: [], skipped: [], missing: [] };
  const playbookSkills = new Set<string>();
  ensureSpexDir(envRoot);
  const skillsDir = generatedSkillsDir(envRoot);
  rmSync(skillsDir, { recursive: true, force: true });
  mkdirSync(skillsDir, { recursive: true });

  for (const name of Object.keys(lock.packages).sort()) {
    const resolution = lock.packages[name]!;
    const root = packageRoot(name, resolution, packagesDir, pathRoot);
    const manifest = root === null ? null : readManifestAt(root);
    if (root === null || manifest === null) {
      if (Object.keys(resolution.exports).length > 0) report.missing.push(name);
      continue;
    }
    const version = resolutionVersion(resolution) ?? manifest.version;
    for (const exported of Object.keys(resolution.exports).sort()) {
      const id = resolution.exports[exported]!;
      const artifact = manifest.artifacts[id];
      const language = resolution.artifacts[id]?.language;
      if (!artifact || !language) continue;
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
        // The spec file in its chosen language, byte for byte, beside a
        // SKILL.md saying what spec package it is (DR-115).
        const file = join(root, "specs", language, `${id}.md`);
        if (!existsSync(file)) { if (!report.missing.includes(name)) report.missing.push(name); continue; }
        mkdirSync(target, { recursive: true });
        copyFileSync(file, join(target, `${id}.md`));
        chmodSync(join(target, `${id}.md`), 0o644);
        writeFileSync(join(target, "SKILL.md"), specSkill({ name: exported, packageName: name, version, description: manifest.description, file: `${id}.md` }));
      } else continue;
      report.skills.push(exported);
    }
  }
  report.skills.sort();

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
