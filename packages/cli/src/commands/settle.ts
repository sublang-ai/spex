// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The settle of an environment from the command line (cli-2 to cli-5,
// environments-5, environments-7, environments-8): read `spex.yaml` and
// `spex.lock` at the root; resolve where asked, or where the lock is
// missing or stale; write the lock under the version read; install under
// `<root>/.spex/` with no engine (cli-14), the app's built-in spec
// package that no seed and no registry serves left to the app; export
// into the root with the library's agent table. It follows the order
// and the version checks of the app's settle, without its state,
// announcements or catalog: every write is a versioned write, refused
// where its file changed meanwhile (DR-111). What it prints speaks a
// project's Packages tab's words (DR-172): added, installed, updated,
// removed, the registry by its name, skills for agents, and beneath a
// package providing a spec where that spec stands in `specs/` with the
// packages its links wait for (cli-6, environments-41, DR-174).

import { existsSync, lstatSync, readFileSync } from "node:fs";
import { isAbsolute, join, posix } from "node:path";

import {
  AGENT_FOLDERS,
  BUILTIN_PACKAGE_NAME,
  EXPORTS_MANIFEST,
  exportEnvironment,
  GitSourceError,
  install,
  InstallError,
  installedPackages,
  isGitRequest,
  isGitSource,
  isPathSource,
  isRegistrySource,
  lockStaleness,
  packageRoot,
  installedDir,
  parseManifestText,
  providedArtifacts,
  recordedPackages,
  RegistryError,
  resolve,
  ResolveError,
  resolutionVersion,
  serializeLock,
  writeLock,
  type ExportReport,
  type InstallReport,
  type Lock,
  type Manifest,
  type Requests,
  type Resolution,
  type SpecPlacement,
} from "../lib/environment/index.js";
import { fileVersion, sha256, VersionConflictError, type FileVersion } from "../lib/files.js";
import type { AuthScope } from "../lib/git-host.js";
import { shown, type Environment } from "./environment.js";
import { Refusal } from "./run.js";

/** `install`: resolve only where the lock is missing or stale;
 * `resolve`: resolve again from `spex.yaml` whatever the lock holds,
 * rewriting a lock that does not read. */
export type SettleMode = "install" | "resolve";

export interface Settled {
  /** The lock as it stood before; null where none stood or it did not
   * read. */
  before: Lock | null;
  /** Why the lock standing before was stale; null where it was not. */
  staleBefore: string[] | null;
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

// -- Git locators as a reader is shown them (environments-29, DR-120) ---------

/** Whether a Git locator is a folder of this computer: a path, or a
 * file URL. */
function localGit(repo: string): boolean {
  return isAbsolute(repo) || /^file:/i.test(repo)
    || (!/^[a-z][a-z0-9+.-]*:\/\//i.test(repo) && !/^[^/\\]+:/.test(repo));
}

/** A Git locator as a reader reads it: a local path or file URL as
 * given; a network remote unnamed, since the command line reads no
 * Space's Git origin and so never tells a Space's repository from
 * another's, and never names the Git host behind a Space. */
export function gitShown(repo: string): string {
  return localGit(repo) ? repo : "a Git remote";
}

/** A Git repository as a source's words name it: `Git <repository>`
 * for one of this computer, `a Git remote` for a network one. */
export function gitLabel(repo: string): string {
  return localGit(repo) ? `Git ${repo}` : gitShown(repo);
}

/** Every Git locator the environment's files name, longest first, with
 * the spec packages fetched from it. */
export type GitLocators = [repo: string, names: string[]][];

export function gitLocators(requests: Requests | null, lock: Lock | null): GitLocators {
  const out = new Map<string, Set<string>>();
  const add = (repo: string, name: string): void => { out.set(repo, (out.get(repo) ?? new Set()).add(name)); };
  for (const [name, request] of Object.entries(requests?.packages ?? {})) if (isGitRequest(request)) add(request.git, name);
  for (const [name, resolution] of Object.entries(lock?.packages ?? {})) if (isGitSource(resolution.source)) add(resolution.source.git, name);
  return [...out.entries()].map(([repo, names]): [string, string[]] => [repo, [...names].sort()]).sort(([a], [b]) => b.length - a.length);
}

/** A text with every network Git locator of the environment unnamed. */
export function unnamedText(text: string, locators: GitLocators): string {
  return locators.reduce((out, [repo]) => (localGit(repo) ? out : out.split(repo).join(gitShown(repo))), text);
}

/** A Git fetch's failure as a reader reads it: Git's own words for a
 * local repository; for a network remote, what it answered and no raw
 * output, which may name the host behind a Space. */
function gitFailure(error: GitSourceError, locators: GitLocators): string {
  if (localGit(error.repo)) return error.message;
  const status = /returned error: (\d{3})|RPC failed; HTTP (\d{3})|HTTP (\d{3})/i.exec(error.run?.stderr ?? "");
  const answer = status ? ` (HTTP ${status[1] ?? status[2] ?? status[3]})` : "";
  const names = locators.find(([repo]) => repo === error.repo)?.[1] ?? [];
  return `${names.length > 0 ? `${names.join(", ")}: ` : ""}${gitShown(error.repo)} answered with an error${answer} — check that Git on this computer can read it, then retry`;
}

/** What the library's install says before its cause where it kept the
 * last files. */
const KEPT = "installing failed; the last files stay: ";

/** A resolution's refusal of a package's source in the CLI's words, each
 * ending in what to do (cli-13): a folder missing, holding no
 * `meta.yaml` or another package, leading out of the project folder, or
 * no package; a Git repository holding none; no versions found in time. */
function resolvePhrase(error: ResolveError): string | null {
  const pkg = error.packageName ?? "a package";
  const { path, git, rev, folderMissing, found, issues } = error.detail;
  const where = git !== undefined ? `${gitShown(git)} at ${rev}${path ? `, folder ${path}` : ""}` : path;
  const fix = git !== undefined ? "fix its git, rev or path in spex.yaml" : "fix its path in spex.yaml";
  switch (error.kind) {
    case "path_missing":
      if (git !== undefined) return `${pkg}: ${where} holds no package — ${fix}`;
      return folderMissing
        ? `${pkg}: no folder at ${path} — ${fix}, or spex remove ${pkg}`
        : `${pkg}: ${path} has no meta.yaml, so it is no package — ${fix}, or spex remove ${pkg}`;
    case "path_outside":
      return `${pkg}: ${path} leads out of this project folder — ${fix} to a folder inside it, or spex remove ${pkg}`;
    case "name_mismatch":
      return `${pkg}: ${where} holds ${found} — fix the name in spex.yaml, or in its meta.yaml`;
    case "not_a_package":
      return `${pkg}: ${where} is not a package: ${issues} — fix its meta.yaml, then retry`;
    case "bound":
      return "no versions found that fit every package in time — loosen a version in spex.yaml, then spex update";
    default:
      return null;
  }
}

/** A failure of a settle as one phrase ending in what to do (cli-13). */
export async function refusalOf(env: Environment, error: unknown, context: { origin: string; scope: AuthScope }, locators: GitLocators = []): Promise<Refusal> {
  if (error instanceof Refusal) return error;
  if (error instanceof GitSourceError) return new Refusal(gitFailure(error, locators));
  if (error instanceof InstallError && error.cause instanceof GitSourceError) return new Refusal(gitFailure(error.cause, locators));
  const registryError = error instanceof RegistryError ? error : error instanceof InstallError && error.cause instanceof RegistryError ? error.cause : null;
  if (registryError !== null) return new Refusal(unnamedText((await env.registryRefusal(registryError, context)).message, locators));
  if (error instanceof VersionConflictError) return new Refusal(`${shown(env.root, error.file)} changed meanwhile — retry`);
  const phrase = error instanceof ResolveError ? resolvePhrase(error) : null;
  if (phrase !== null) return new Refusal(unnamedText(phrase, locators));
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof InstallError && message.startsWith(KEPT)) return new Refusal(unnamedText(`installing stopped, the last files stay: ${message.slice(KEPT.length)} — retry`, locators));
  if (error instanceof InstallError && / no registry has it as spex\.lock records it/.test(message)) {
    return new Refusal(unnamedText(`${message} — spex update picks a version the registry has`, locators));
  }
  // Anything else still ends in what to do.
  return new Refusal(unnamedText(/ — /.test(message) ? message : `${message} — retry`, locators));
}

/** Settle the environment; null where it holds neither file. */
export async function settle(env: Environment, mode: SettleMode): Promise<Settled | null> {
  const read = env.readRequests();
  const locked = mode === "resolve" ? env.readLockForUpdate() : env.readLock();
  if (read === null && locked === null) return null;
  const { root, requestsFile, lockFile } = env;
  // The environment's registry: the one its `spex.yaml` names, else its
  // Space's in a file naming none (environments-2, environments-38).
  const target = env.registryOf(read?.requests ?? null);
  const context = { origin: target.origin, scope: target.scope };
  const instance = target.origin;
  const registry = env.registryAt(instance, target.scope);
  const locators = gitLocators(read?.requests ?? null, locked?.lock ?? null);

  let lock = locked?.lock ?? null;
  let lockVersion: FileVersion = locked?.version ?? null;
  const staleBefore = lock !== null && read !== null ? staleReasons(root, lock, read.text) : null;
  const needsResolve = mode === "resolve" || lock === null || staleBefore !== null;
  let lockWritten = false;
  if (needsResolve) {
    if (read === null) throw new Refusal(`no spex.yaml in ${root} — spex add <org>/<pkg>`);
    let result;
    try {
      result = await resolve({
        requests: read.requests, requestsText: read.text, registry, pathRoot: root, git: env.git,
        // A package resolving to the release its lock records keeps the
        // registry recorded there (environments-5).
        ...(locked?.lock ? { previous: locked.lock } : {}),
      });
    } catch (error) {
      throw await refusalOf(env, error, context, locators);
    }
    if (!result.ok) {
      const conflicts = result.conflicts.map((conflict) => `${conflict.name} (${conflict.requirements.map((entry) => `${entry.by}: ${entry.requirement}`).join(", ")})`);
      throw new Refusal(unnamedText(`no version fits every package: ${conflicts.join(", ")} — change or remove one`, locators));
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
      throw await refusalOf(env, error, context);
    }
    lock = result.lock;
  }
  if (lock === null) throw new Refusal(`no spex.lock in ${root} — spex install`);

  let report: InstallReport;
  try {
    report = await install({
      root,
      lock,
      lockVersion,
      store: env.store,
      cache: env.cache,
      registry,
      registries: (source) => env.installRegistries(instance, source, target.scope),
      // The built-in spec package from this computer's seed, by its
      // files' digests; where no seed and no registry serves it, left
      // out as not installed for the app's next use to install, the rest
      // installed (environments-7).
      seed: env.seed(),
      builtinUnserved: "leave",
      git: env.git,
      pathRoot: root,
      requestsText: read?.text ?? null,
    });
  } catch (error) {
    throw await refusalOf(env, error, context, locators);
  }
  // A stale lock installs and exports nothing (environments-7).
  if (report.stale) throw new Refusal(unnamedText(`${report.stale.join("; ")} while spex ran — retry`, locators));
  // Exports derive from the installed tree and its lock: written only
  // while both still stand as this install left them, and cover the
  // spec packages installed alone (environments-8).
  let exported: ExportReport;
  try {
    if (fileVersion(lockFile) !== lockVersion) throw new VersionConflictError(lockFile);
    const installed = installedPackages(root, lock);
    const left = new Set(report.left ?? []);
    if (!Object.entries(lock.packages).every(([name, resolution]) => isPathSource(resolution.source) || left.has(name) || installed.has(name))) {
      throw new VersionConflictError(installedDir(root));
    }
    const exportedLock = left.size === 0 ? lock : { ...lock, packages: Object.fromEntries(Object.entries(lock.packages).filter(([name]) => !left.has(name))) };
    exported = await exportEnvironment({ root, lock: exportedLock, workingFolder: root, pathRoot: root, userHome: null, agents: [] });
  } catch (error) {
    throw await refusalOf(env, error, context);
  }
  return { before: locked?.lock ?? null, staleBefore, lock, resolved: needsResolve, lockWritten, install: report, exported };
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

/** Where a package comes from, as a project's Packages tab says it
 * (cli-6): the registry, a folder, a Git repository at its commit with
 * no network remote named, or built in for the app's own. */
export function sourceLabel(name: string, resolution: Resolution): string {
  const source = resolution.source;
  if (isRegistrySource(source)) return name === BUILTIN_PACKAGE_NAME ? "built in" : "from the registry";
  if (isGitSource(source)) return `from ${gitLabel(source.git)} at ${source.commit.slice(0, 12)}${source.path ? `, folder ${source.path}` : ""}`;
  return `from folder ${source.path}`;
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

/** Whether a package's files stand as the lock records them
 * (environments-14): `installed`; `not installed`; or `files missing`
 * where the install placed it, or its folder is not at its path. */
export type PackageState = "installed" | "not installed" | "files missing";

export function packageState(root: string, lock: Lock, name: string, installed: Set<string>, recorded: Set<string>): PackageState {
  const resolution = lock.packages[name]!;
  if (isPathSource(resolution.source)) return existsSync(join(root, ...resolution.source.path.split("/"), "meta.yaml")) ? "installed" : "files missing";
  if (installed.has(name)) return "installed";
  return recorded.has(name) ? "files missing" : "not installed";
}

/** The state of every package of a lock, read from the files. */
export function packageStates(root: string, lock: Lock): Map<string, PackageState> {
  const installed = installedPackages(root, lock);
  const recorded = recordedPackages(root, lock);
  return new Map(Object.keys(lock.packages).map((name) => [name, packageState(root, lock, name, installed, recorded)]));
}

function standing(path: string): boolean {
  try { lstatSync(path); return true; } catch { return false; }
}

/** Where one exported skill of a package stands, read from the files:
 * the agent folders holding it as Spex's export, those a folder of the
 * reader's keeps it out of, and why it is placed nowhere (environments-8). */
export interface SkillPlace { skill: string; placed: string[]; yours: string[]; why: string | null }

export function skillPlaces(root: string, lock: Lock, name: string, state: PackageState): SkillPlace[] {
  const resolution = lock.packages[name]!;
  if (Object.keys(resolution.exports).length === 0) return [];
  const dir = packageRoot(name, resolution, installedDir(root), root);
  let manifest: Manifest | null = null;
  try { manifest = dir === null ? null : pathManifest(dir, "."); } catch { manifest = null; }
  // A skill for the agents of what the release provides alone, and
  // never a provided spec's: the command line's root is a project's,
  // where a spec stands in `specs/packages/` or nowhere (environments-6,
  // environments-8); a release not here is read as its lock names it,
  // its spec by the file the lock selects, or a folder's by its id
  // `<pkg>` (environments-1).
  const provided = manifest === null ? null : providedArtifacts(manifest);
  const pkg = name.slice(name.indexOf("/") + 1);
  const lockedSpec = (id: string): boolean => (isPathSource(resolution.source)
    ? id === pkg
    : resolution.files.some((file) => file.path.startsWith("specs/") && file.path.endsWith(`/${id}.md`)));
  const skills = Object.keys(resolution.exports).sort().filter((skill) => {
    const id = resolution.exports[skill]!;
    if (manifest === null || provided === null) return !lockedSpec(id);
    return provided.has(id) && manifest.artifacts[id]?.kind !== "spec";
  });
  const folders = projectFolders().map((entry) => ({ ...entry, skills: new Set(exportedIn(root, entry.folder)) }));
  return skills.map((skill) => {
    const playbook = manifest?.artifacts[resolution.exports[skill]!]?.kind === "playbook";
    const placed: string[] = [];
    const yours: string[] = [];
    for (const folder of folders) {
      if (playbook && !folder.playbooks) continue;
      if (folder.skills.has(skill)) placed.push(folder.folder);
      else if (standing(join(root, ...folder.folder.split("/"), skill))) yours.push(folder.folder);
    }
    let why: string | null = null;
    if (placed.length === 0) {
      why = yours.length > 0 ? `yours is in ${yours.join(", ")}`
        : state === "files missing" ? "files missing"
          : state === "not installed" ? (name === BUILTIN_PACKAGE_NAME ? "the Spex app installs it" : "not installed")
            : "spex install places it";
    }
    return { skill, placed, yours, why };
  });
}

/** One skill's place as a line's cell: its folders, with those yours
 * keeps it out of, or `not placed` with why. */
export function placeText(place: SkillPlace): string {
  if (place.placed.length === 0) return `not placed: ${place.why ?? "spex install places it"}`;
  return `${place.placed.join(", ")}${place.yours.length > 0 ? `, not ${place.yours.join(", ")} (yours is there)` : ""}`;
}

/** Rows aligned in columns, two spaces apart, under a two-space indent;
 * a column no row fills is left out. */
export function table(rows: string[][]): string[] {
  const widths = rows.reduce<number[]>((out, row) => row.map((cell, at) => Math.max(out[at] ?? 0, cell.length)), []);
  const kept = widths.map((width, at) => (width > 0 ? at : -1)).filter((at) => at >= 0);
  const last = kept.at(-1);
  return rows.map((row) => `  ${kept.map((at) => (at === last ? row[at] ?? "" : (row[at] ?? "").padEnd(widths[at]!))).join("  ")}`.trimEnd());
}

/** The lines of a package's skills under its line: each skill with where
 * it stands for the agents (cli-2, cli-4). */
export function skillLines(root: string, lock: Lock, name: string, state: PackageState): string[] {
  return table(skillPlaces(root, lock, name, state).map((place) => [place.skill, placeText(place)]));
}

/** A provided spec's place as a line, in a project's Packages tab's
 * words (cli-6, environments-41), an edited copy naming the newer
 * release's version where one waits; an edited copy its package no
 * longer places, the project's own now, reads as edited too (DR-172). */
export function specText(placement: SpecPlacement): string {
  switch (placement.state) {
    case "placed": return `spec in ${placement.path}`;
    case "edited": return `spec edited in specs/ — left as yours${placement.waitingVersion ? `, ${placement.waitingVersion} waiting` : ""}`;
    case "blocked": return `spec not placed — specs/ holds ${posix.basename(placement.path)} already`;
    case "no-specs": return "spec needs specs/ — spex scaffold";
  }
}

/** The lines beneath a package of its provided spec (cli-2, cli-4,
 * cli-6): where it stands, then one line per package its links wait
 * for, with the command adding it. */
export function specLines(placements: readonly SpecPlacement[], name: string, indent = "  "): string[] {
  return placements.filter((placement) => placement.name === name).flatMap((placement) => [
    `${indent}${specText(placement)}`,
    ...placement.waiting.map((wait) => `${indent}${wait.count === 1 ? "1 link waits" : `${wait.count} links wait`} for ${wait.name} — spex add ${wait.name}`),
  ]);
}

/** Each change from one lock to the next: a package gained, updated from
 * one version to another, switched to another source at one version, or
 * removed. */
export interface LockChange {
  name: string;
  from: string | null;
  to: string | null;
  /** The source after, where the source changed. */
  source?: string;
}

export function lockChanges(root: string, before: Lock | null, after: Lock): LockChange[] {
  const out: LockChange[] = [];
  const names = new Set([...Object.keys(before?.packages ?? {}), ...Object.keys(after.packages)]);
  for (const name of [...names].sort()) {
    const was = before?.packages[name];
    const now = after.packages[name];
    const from = was ? versionOf(root, name, was) : null;
    const to = now ? versionOf(root, name, now) : null;
    const moved = was !== undefined && now !== undefined && sourceKind(was) !== sourceKind(now);
    if (from !== to || moved) out.push({ name, from, to, ...(moved ? { source: sourceLabel(name, now!) } : {}) });
  }
  return out;
}

/** A resolution's source with no version: where its files come from. */
function sourceKind(resolution: Resolution): string {
  const source = resolution.source;
  if (isRegistrySource(source)) return `registry ${source.registry}`;
  if (isGitSource(source)) return `git ${source.git} ${source.commit} ${source.path ?? ""}`;
  return `path ${source.path}`;
}

/** A change as a reader reads it: added, with the packages it came for
 * where `spex.yaml` does not add it itself; updated, with both versions
 * and its new source; removed. */
export function changeLine(change: LockChange, lock?: Lock, added?: ReadonlySet<string>): string {
  if (change.from === null) {
    const requiredBy = lock?.packages[change.name]?.requiredBy ?? [];
    const forOthers = added !== undefined && !added.has(change.name) && requiredBy.length > 0 ? ` for ${requiredBy.join(", ")}` : "";
    return `Added ${change.name} ${change.to}${forOthers}`;
  }
  if (change.to === null) return `Removed ${change.name} ${change.from}`;
  const version = change.from === change.to ? change.to : `${change.from} → ${change.to}`;
  return `Updated ${change.name} ${version}${change.source ? `, now ${change.source}` : ""}`;
}

/** The lines naming each package gained, updated or removed, with where
 * each one's spec and skills went — a removed package's edited copy left
 * as the project's own (cli-2, cli-3, environments-41). */
export function gainedLines(root: string, settled: Settled, added: ReadonlySet<string>): string[] {
  const lines: string[] = [];
  const states = packageStates(root, settled.lock);
  for (const change of lockChanges(root, settled.before, settled.lock)) {
    lines.push(changeLine(change, settled.lock, added), ...specLines(settled.exported.specs, change.name));
    if (change.to === null) continue;
    lines.push(...skillLines(root, settled.lock, change.name, states.get(change.name)!));
  }
  return lines;
}

/** The line naming the app's built-in spec package an install left to
 * the app, no seed and no registry serving it: marked built in, for
 * the Spex app to install (cli-4). */
export function leftToAppLine(name: string, version: string): string {
  return `${name} ${version}  built in — the Spex app installs it when it opens this project`;
}

/** The lines naming each spec package an install left to the app. */
export function leftToAppLines(root: string, settled: Settled): string[] {
  return (settled.install.left ?? []).map((name) => leftToAppLine(name, versionOf(root, name, settled.lock.packages[name]!)));
}

/** The lines naming each folder package whose folder is not at its path
 * here (environments-7). */
export function missingPathLines(settled: Settled): string[] {
  return settled.install.missingPaths.map((name) => {
    const source = settled.lock.packages[name]?.source;
    return `Files missing for ${name}: no folder at ${source && isPathSource(source) ? source.path : "its path"}`;
  });
}
