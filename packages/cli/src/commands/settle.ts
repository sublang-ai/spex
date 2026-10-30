// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The settle of an environment from the command line (cli-2 to cli-5,
// environments-5, environments-7, environments-8): read `spex.yaml` and
// `spex.lock` at the root; resolve where asked, or where the lock is
// missing or stale; write the lock under the version read; install under
// `<root>/.spex/` with no engine (cli-14); export into the root with the
// library's agent table. It follows the order and the version checks of
// the app's settle, without its state, announcements or catalog: every
// write is a versioned write, refused in the library's words where its
// file changed meanwhile (DR-111).

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  AGENT_FOLDERS,
  EXPORTS_MANIFEST,
  exportEnvironment,
  install,
  InstallError,
  installedPackages,
  isGitSource,
  isPathSource,
  isRegistrySource,
  lockStaleness,
  packageRoot,
  installedDir,
  parseManifestText,
  RegistryError,
  ResolveError,
  resolve,
  resolutionVersion,
  serializeLock,
  writeLock,
  type ExportReport,
  type InstallReport,
  type Lock,
  type Manifest,
  type Resolution,
} from "../lib/environment/index.js";
import { fileVersion, sha256, VersionConflictError, type FileVersion } from "../lib/files.js";
import { hostOf } from "./home.js";
import { registryCause, type Environment } from "./environment.js";
import { Refusal } from "./run.js";

/** `install`: resolve only where the lock is missing or stale;
 * `resolve`: resolve again from `spex.yaml` whatever the lock holds. */
export type SettleMode = "install" | "resolve";

export interface Settled {
  /** The lock as it stood before. */
  before: Lock | null;
  /** The lock installed. */
  lock: Lock;
  /** Whether a resolution ran, and whether it wrote the lock. */
  resolved: boolean;
  lockWritten: boolean;
  install: InstallReport;
  exported: ExportReport;
}

/** A path source's manifest where its path resolves under the root; null
 * where the folder holds none (environments-7). */
function pathManifest(root: string, path: string): Manifest | null {
  const file = join(root, ...path.split("/"), "meta.yaml");
  if (!existsSync(file)) return null;
  const { manifest, issues } = parseManifestText(readFileSync(file, "utf8"));
  if (!manifest) throw new Error(issues.map((issue) => issue.message).join("; "));
  return manifest;
}

/** Why a lock no longer stands against the files at the root, or null. */
export function staleReasons(root: string, lock: Lock, requestsText: string | null): string[] | null {
  const staleness = lockStaleness(lock, requestsText, (path) => pathManifest(root, path));
  return staleness.stale ? staleness.reasons : null;
}

function refusalOf(error: unknown): Refusal {
  if (error instanceof Refusal) return error;
  if (error instanceof VersionConflictError || error instanceof InstallError || error instanceof ResolveError || error instanceof RegistryError) {
    return new Refusal(registryCause(error));
  }
  return new Refusal(error instanceof Error ? error.message : String(error));
}

/** Settle the environment; null where it holds neither file. */
export async function settle(env: Environment, mode: SettleMode): Promise<Settled | null> {
  const read = env.readRequests();
  const locked = env.readLock();
  if (read === null && locked === null) return null;
  const { root, requestsFile, lockFile } = env;
  // The environment's registry, at the instance its `spex.yaml` names,
  // else the default instance's (environments-2, environments-5).
  const instance = env.instanceOf(read?.requests ?? null);
  const registry = env.registryAt(instance);

  let lock = locked?.lock ?? null;
  let lockVersion: FileVersion = locked?.version ?? null;
  const stale = lock !== null && read !== null && staleReasons(root, lock, read.text) !== null;
  const needsResolve = mode === "resolve" || lock === null || stale;
  let lockWritten = false;
  if (needsResolve) {
    if (read === null) throw new Refusal(`${root} holds no spex.yaml to resolve the lock from; spex add <org>/<pkg> makes one`);
    let result;
    try {
      result = await resolve({
        requests: read.requests, requestsText: read.text, registry, pathRoot: root, git: env.git,
        // A package resolving to the release its lock records keeps the
        // registry recorded there (environments-5).
        ...(locked ? { previous: locked.lock } : {}),
      });
    } catch (error) {
      throw refusalOf(error);
    }
    if (!result.ok) {
      const conflicts = result.conflicts.map((conflict) => `${conflict.name} (${conflict.requirements.map((entry) => `${entry.by}: ${entry.requirement}`).join(", ")})`);
      throw new Refusal(`no set of versions meets every requirement: ${conflicts.join(", ")}`);
    }
    // The lock is written only while `spex.yaml` stands as resolved and
    // the lock as read, both checked at the instant of the write; a lock
    // already holding these bytes is left as it is.
    try {
      if (fileVersion(requestsFile) !== read.version) throw new VersionConflictError(requestsFile);
      if (serializeLock(result.lock) !== locked?.text) {
        lockVersion = sha256(await writeLock(lockFile, result.lock, lockVersion));
        lockWritten = true;
      }
    } catch (error) {
      throw refusalOf(error);
    }
    lock = result.lock;
  }
  if (lock === null) throw new Refusal(`${root} holds no spex.lock`);

  let report: InstallReport;
  try {
    report = await install({
      root,
      lock,
      lockVersion,
      store: env.store,
      cache: env.cache,
      registry,
      registries: (source) => env.installRegistries(instance, source),
      git: env.git,
      pathRoot: root,
      requestsText: read?.text ?? null,
    });
  } catch (error) {
    throw refusalOf(error);
  }
  // A stale lock installs and exports nothing (environments-7).
  if (report.stale) throw new Refusal(`spex.lock no longer matches: ${report.stale.join("; ")}; spex update resolves it again`);
  // Exports derive from the installed tree and its lock: written only
  // while both still stand as this install left them (environments-8).
  let exported: ExportReport;
  try {
    if (fileVersion(lockFile) !== lockVersion) throw new VersionConflictError(lockFile);
    const installed = installedPackages(root, lock);
    if (!Object.entries(lock.packages).every(([name, resolution]) => isPathSource(resolution.source) || installed.has(name))) {
      throw new VersionConflictError(installedDir(root));
    }
    exported = await exportEnvironment({ root, lock, workingFolder: root, pathRoot: root, userHome: null, agents: [] });
  } catch (error) {
    throw refusalOf(error);
  }
  return { before: locked?.lock ?? null, lock, resolved: needsResolve, lockWritten, install: report, exported };
}

// -- what a reader is told ----------------------------------------------------

/** A spec package's version as its lock records it, or as its folder's
 * manifest states it. */
export function versionOf(root: string, name: string, resolution: Resolution): string {
  return resolutionVersion(resolution) ?? manifestVersion(root, name, resolution) ?? "?";
}

function manifestVersion(root: string, name: string, resolution: Resolution): string | null {
  const dir = packageRoot(name, resolution, installedDir(root), root);
  if (dir === null) return null;
  try { return pathManifest(dir, ".")?.version ?? null; } catch { return null; }
}

/** A resolution's source as a reader reads it: the instance by its
 * host, a path, or a Git repository at its commit, no user in its URL. */
export function sourceLabel(resolution: Resolution): string {
  const source = resolution.source;
  if (isRegistrySource(source)) {
    try { return hostOf(source.registry); } catch { return source.registry; }
  }
  if (isGitSource(source)) return `git ${source.git.replace(/\/\/[^/@]*@/, "//")} at ${source.commit.slice(0, 12)}${source.path ? ` (${source.path})` : ""}`;
  return `path ${source.path}`;
}

/** The project-level agent folders of the table, each once, with
 * whether a playbook's skill goes there (environments-16). */
export function projectFolders(): { folder: string; playbooks: boolean }[] {
  const out = new Map<string, boolean>();
  for (const entry of Object.values(AGENT_FOLDERS)) out.set(entry.project, (out.get(entry.project) ?? false) || entry.playbooks);
  return [...out.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([folder, playbooks]) => ({ folder, playbooks }));
}

/** The skills Spex's last export left in an agent folder of the root,
 * as that folder's manifest names them. */
export function exportedIn(root: string, folder: string): string[] {
  try {
    const value = JSON.parse(readFileSync(join(root, ...folder.split("/"), EXPORTS_MANIFEST), "utf8")) as { skills?: unknown };
    return Array.isArray(value.skills) ? value.skills.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

/** Where each of a package's exported skills stands as Spex's export:
 * name to the agent folders holding it. */
export function exportsOf(root: string, resolution: Resolution): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const folders = projectFolders().map(({ folder }) => ({ folder, skills: new Set(exportedIn(root, folder)) }));
  for (const name of Object.keys(resolution.exports).sort()) {
    out.set(name, folders.filter((entry) => entry.skills.has(name)).map((entry) => `${entry.folder}/${name}/`));
  }
  return out;
}

/** Each change from one lock to the next: a package gained, moved from
 * one version to another, or lost. */
export interface LockChange { name: string; from: string | null; to: string | null }

export function lockChanges(root: string, before: Lock | null, after: Lock): LockChange[] {
  const out: LockChange[] = [];
  const names = new Set([...Object.keys(before?.packages ?? {}), ...Object.keys(after.packages)]);
  for (const name of [...names].sort()) {
    const was = before?.packages[name];
    const now = after.packages[name];
    const from = was ? versionOf(root, name, was) : null;
    const to = now ? versionOf(root, name, now) : null;
    if (from !== to || (was && now && JSON.stringify(was.source) !== JSON.stringify(now.source))) out.push({ name, from, to });
  }
  return out;
}

/** The lines naming each package gained or moved with where its exports
 * went (cli-2). */
export function gainedLines(root: string, settled: Settled): string[] {
  const lines: string[] = [];
  for (const change of lockChanges(root, settled.before, settled.lock)) {
    if (change.to === null) { lines.push(`Removed ${change.name} ${change.from}`); continue; }
    lines.push(change.from === null || change.from === change.to ? `Added ${change.name} ${change.to}` : `Moved ${change.name} ${change.from} -> ${change.to}`);
    for (const [skill, folders] of exportsOf(root, settled.lock.packages[change.name]!)) {
      lines.push(`  ${skill}: ${folders.length > 0 ? folders.join(", ") : "exported nowhere"}`);
    }
  }
  return lines;
}

/** The lines naming what an export left out (environments-8). */
export function leftOutLines(report: ExportReport): string[] {
  const lines: string[] = [];
  for (const { name, folder } of report.skipped) lines.push(`Left out ${name} from ${folder}: a folder of yours stands there`);
  for (const name of report.missing) lines.push(`Left out ${name}: its files are not here`);
  return lines;
}

/** Whether a package's files stand as the lock records them: installed
 * for a registry or Git source, in place for a path source. */
export function installedState(root: string, lock: Lock, name: string, installed: Set<string>): string {
  const resolution = lock.packages[name]!;
  if (isPathSource(resolution.source)) return existsSync(join(root, ...resolution.source.path.split("/"), "meta.yaml")) ? "in place" : "missing";
  return installed.has(name) ? "installed" : "not installed";
}
