// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Exports (environments-8, environments-9, environments-16, DR-104).
// Each selected skill is copied — its `name` rewritten where aliased —
// and one skill is generated per selected playbook, into
// `<clone>/skills/<name>/`; those are mirrored into the folders where
// each agent of this device reads skills, kept out of Git there by the
// working folder's `.git/info/exclude`, and, for your own group, into
// the agents' home folders. A manifest beside them records what Spex
// wrote, so a re-export removes only its own and a skill the reader put
// there stays. Playbooks go to the launcher as module locations at
// launch, bound to the environment whose lock exported them.

import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { parseDocument } from "yaml";

import { readVersioned, writeVersionedBytes } from "../files.js";
import { AGENT_FOLDERS } from "./agent-folders.js";
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
  cloneDir: string;
  lock: Lock;
  /** The working folder exported to; null exports nowhere but the
   * clone and the user's home. */
  workingFolder: string | null;
  /** The user's home, for your own group's environment; else null. */
  userHome: string | null;
  /** The agents this device has. */
  agents: string[];
  /** `<clone>/packages`. */
  packagesDir: string;
}

export interface ExportReport {
  /** Every exported skill name, as it stands in `<clone>/skills/`. */
  skills: string[];
  /** Each agent folder written. */
  folders: { agent: string; level: "project" | "user"; dir: string }[];
  /** Agents the table names no folder for: they receive no export. */
  unsupportedAgents: string[];
  /** Skill folders an earlier export wrote and this one removed. */
  removed: string[];
  /** Exports not written because a folder the reader placed has the name. */
  skipped: { name: string; dir: string; reason: string }[];
  /** Spec packages whose files are not here: not installed, or a path
   * source this working folder lacks. */
  missing: string[];
}

function packageRoot(name: string, resolution: Resolution, packagesDir: string, workingFolder: string | null): string | null {
  const source = resolution.source;
  if (isPathSource(source)) return workingFolder === null ? null : join(workingFolder, ...source.path.split("/"));
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

/** Rewrite the `name` of a SKILL.md's frontmatter (Agent Skills: the
 * name matches the folder). */
export function rewriteSkillName(text: string, name: string): string {
  const match = /^(---\r?\n)([\s\S]*?)(\r?\n---[ \t]*(?:\r?\n|$))/.exec(text);
  if (!match) return `---\nname: ${name}\n---\n\n${text}`;
  const front = match[2]!;
  const line = /^name[ \t]*:.*$/m;
  let rewritten: string;
  if (line.test(front)) rewritten = front.replace(line, `name: ${name}`);
  else {
    const doc = parseDocument(front);
    doc.set("name", name);
    rewritten = doc.toString().replace(/\n$/, "");
  }
  return `${match[1]}${rewritten}${match[3]}${text.slice(match[0].length)}`;
}

/** The SKILL.md generated for an exported playbook (environments-16). */
export function playbookSkill(options: { name: string; id: string; packageName: string; version: string }): string {
  const { name, id, packageName, version } = options;
  return [
    "---",
    `name: ${name}`,
    `description: Runs the ${id} playbook of ${packageName} ${version} in this working folder.`,
    "---",
    "",
    `Run the playbook \`${id}\` of the spec package \`${packageName}\`, version \`${version}\`, through Spex in this working folder: start the playbook's command in a Spex session of this working folder.`,
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

function mirror(skillsDir: string, names: string[], dir: string, report: ExportReport): string[] {
  mkdirSync(dir, { recursive: true });
  const previous = readExportsManifest(dir);
  for (const name of previous) {
    if (names.includes(name)) continue;
    rmSync(join(dir, name), { recursive: true, force: true });
    if (!report.removed.includes(name)) report.removed.push(name);
  }
  const written: string[] = [];
  for (const name of names) {
    const target = join(dir, name);
    if (existsSync(target) && !previous.includes(name)) {
      report.skipped.push({ name, dir, reason: "a folder the reader placed has this name" });
      continue;
    }
    rmSync(target, { recursive: true, force: true });
    copyTree(join(skillsDir, name), target);
    written.push(name);
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
  for (const folders of Object.values(AGENT_FOLDERS)) {
    const dir = join(workingFolder, ...folders.project.split("/"));
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
  const { cloneDir, lock, workingFolder, userHome, packagesDir } = options;
  const report: ExportReport = { skills: [], folders: [], unsupportedAgents: [], removed: [], skipped: [], missing: [] };
  const skillsDir = join(cloneDir, "skills");
  rmSync(skillsDir, { recursive: true, force: true });
  mkdirSync(skillsDir, { recursive: true });

  for (const name of Object.keys(lock.packages).sort()) {
    const resolution = lock.packages[name]!;
    const root = packageRoot(name, resolution, packagesDir, workingFolder);
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
        mkdirSync(target, { recursive: true });
        writeFileSync(join(target, "SKILL.md"), playbookSkill({ name: exported, id, packageName: name, version }));
      } else continue;
      report.skills.push(exported);
    }
  }
  report.skills.sort();

  const projectFolders = new Map<string, string>();
  const userFolders = new Map<string, string>();
  for (const agent of [...new Set(options.agents)].sort()) {
    const folders = AGENT_FOLDERS[agent];
    if (!folders) { report.unsupportedAgents.push(agent); continue; }
    if (workingFolder !== null && !projectFolders.has(folders.project)) projectFolders.set(folders.project, agent);
    if (userHome !== null && !userFolders.has(folders.user)) userFolders.set(folders.user, agent);
  }
  const excluded: string[] = [];
  for (const [folder, agent] of projectFolders) {
    const dir = join(workingFolder!, ...folder.split("/"));
    const written = mirror(skillsDir, report.skills, dir, report);
    report.folders.push({ agent, level: "project", dir });
    excluded.push(`/${folder}/${EXPORTS_MANIFEST}`, ...written.map((name) => `/${folder}/${name}/`));
  }
  if (workingFolder !== null) writeExcludeBlock(workingFolder, excluded);
  for (const [folder, agent] of userFolders) {
    const dir = userFolder(userHome!, folder);
    mirror(skillsDir, report.skills, dir, report);
    report.folders.push({ agent, level: "user", dir });
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
 * installed artifact under `packages/`, or a path source's in the
 * working folder. Keyed by the exported name. */
export function moduleLocations(lock: Lock, cloneDir: string, workingFolder: string | null): Map<string, ModuleLocation> {
  const out = new Map<string, ModuleLocation>();
  const packagesDir = join(cloneDir, "packages");
  for (const name of Object.keys(lock.packages).sort()) {
    const resolution = lock.packages[name]!;
    const root = packageRoot(name, resolution, packagesDir, workingFolder);
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
