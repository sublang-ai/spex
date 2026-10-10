// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Installing a locked environment (environments-7, DR-104): the lock's
// selected files, verified by digest into the store, are linked under
// `<clone>/packages/<org>/<pkg>/` at their release paths. The new tree
// is complete before it replaces the old one; a failure leaves the last
// files in place. The swap happens only while the lock it installs still
// stands on disk at the version read and still matches `spex.yaml` and
// its path sources: an install overtaken meanwhile publishes nothing
// (DR-111). A path source copies nothing and is reported missing where
// the working folder lacks it; a stale lock installs nothing new.
// No code runs: the only thing added beside the release files is the
// engine links in each installed playbook artifact's folder.

import { randomUUID } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { provisionEngineLinks } from "../compile.js";
import { fileVersion, VersionConflictError, type FileVersion } from "../files.js";
import { parseManifestText, portablePathIssues, type Manifest } from "./format.js";
import type { GitCredential, GitSource } from "./git-source.js";
import { isGitSource, isPathSource, isRegistrySource, lockStaleness, sourceValue, type Lock, type LockedFile, type Resolution } from "./lock.js";
import { readVersionResource, type RegistrySource, type VersionResource } from "./registry.js";
import { DigestError, type ContentStore } from "./store.js";
import { gunzip, readTar } from "./tar.js";

export interface InstallOptions {
  cloneDir: string;
  lock: Lock;
  /** The version of `<clone>/spex.lock` this lock was read as or written
   * as — null where none stands: a lock on disk at any other version by
   * the swap refuses it (DR-111). */
  lockVersion: FileVersion;
  store: ContentStore;
  /** The home's `cache/` folder. */
  cache: string;
  registry: RegistrySource;
  git: GitSource;
  gitCredential?: (repo: string) => Promise<GitCredential | undefined>;
  workingFolder: string | null;
  /** `spex.yaml`'s text; read from the clone when omitted. */
  requestsText?: string | null;
  /** Where the engine links point (the app's node_modules). */
  modulePaths?: string[];
  /** Test seam: runs after every file is fetched and staged, before
   * the new tree replaces the old. */
  beforeReplace?: () => void | Promise<void>;
}

export interface InstallReport {
  /** The spec packages whose files this install placed. */
  installed: string[];
  /** Path sources this device's working folder lacks. */
  missingPaths: string[];
  /** Why the lock is stale, where it is: nothing new was installed. */
  stale?: string[];
  /** True when the installed files already matched the lock. */
  unchanged: boolean;
}

export class InstallError extends Error {
  constructor(readonly packageName: string | undefined, message: string, readonly cause?: unknown) {
    super(message);
    this.name = "InstallError";
  }
}

/** The installed tree's record of what it holds, beside the packages. */
export const INSTALL_RECORD = ".spex-install.json";

function readPathManifest(dir: string): Manifest | null {
  const file = join(dir, "meta.yaml");
  if (!existsSync(file)) return null;
  const { manifest, issues } = parseManifestText(readFileSync(file, "utf8"));
  if (!manifest) throw new Error(issues.map((issue) => issue.message).join("; "));
  return manifest;
}

/** The path sources of a lock this device's working folder lacks. */
export function missingPathSources(lock: Lock, workingFolder: string | null): string[] {
  const missing: string[] = [];
  for (const name of Object.keys(lock.packages).sort()) {
    const source = lock.packages[name]!.source;
    if (!isPathSource(source)) continue;
    if (workingFolder === null || !existsSync(join(workingFolder, ...source.path.split("/"), "meta.yaml"))) missing.push(name);
  }
  return missing;
}

const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical((value as Record<string, unknown>)[key])]));
  }
  return value;
};

/** One spec package as the install record holds it: what the lock
 * locks of it, in one order however the lock was read. */
function recordEntry(resolution: Resolution): unknown {
  return canonical({
    source: sourceValue(resolution.source),
    files: [...resolution.files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
      .map((file) => ({ path: file.path, sha256: file.sha256, executable: file.executable })),
    artifacts: Object.fromEntries(Object.entries(resolution.artifacts).map(([id, artifact]) => [id, { language: artifact.language, fallback: artifact.fallback }])),
  });
}

function installRecord(lock: Lock): Record<string, unknown> {
  const packages: Record<string, unknown> = {};
  for (const name of Object.keys(lock.packages).sort()) {
    const resolution = lock.packages[name]!;
    if (isPathSource(resolution.source)) continue;
    packages[name] = recordEntry(resolution);
  }
  return { format: 1, packages };
}

function readInstallRecord(target: string): { text: string; packages: Record<string, unknown> } | null {
  try {
    const text = readFileSync(join(target, INSTALL_RECORD), "utf8");
    const value = JSON.parse(text) as { packages?: unknown };
    return { text, packages: typeof value.packages === "object" && value.packages !== null ? value.packages as Record<string, unknown> : {} };
  } catch {
    return null;
  }
}

function filesStand(target: string, name: string, resolution: Resolution): boolean {
  return resolution.files.every((entry) => existsSync(join(target, ...name.split("/"), ...entry.path.split("/"))));
}

function treeMatches(target: string, lock: Lock, record: Record<string, unknown>): boolean {
  if (readInstallRecord(target)?.text !== JSON.stringify(record)) return false;
  return Object.entries(lock.packages).every(([name, resolution]) => isPathSource(resolution.source) || filesStand(target, name, resolution));
}

/** The registry and Git sources of a lock whose files stand installed
 * in the clone as the lock locks them: recorded by the install that
 * placed them, the same source, files and artifacts, every file there. */
export function installedPackages(cloneDir: string, lock: Lock): Set<string> {
  const target = join(cloneDir, "packages");
  const record = readInstallRecord(target);
  const out = new Set<string>();
  if (!record) return out;
  for (const [name, resolution] of Object.entries(lock.packages)) {
    if (isPathSource(resolution.source)) continue;
    if (JSON.stringify(record.packages[name]) === JSON.stringify(recordEntry(resolution)) && filesStand(target, name, resolution)) out.add(name);
  }
  return out;
}

/** Refuse a swap the files changed under (DR-111): the clone gone, its
 * lock no longer at the version installed, or the lock no longer
 * matching `spex.yaml` or a path source's manifest. */
function assertCurrent(options: InstallOptions): void {
  const { cloneDir, lock, workingFolder } = options;
  const lockFile = join(cloneDir, "spex.lock");
  if (!existsSync(cloneDir)) throw new VersionConflictError(cloneDir);
  if (fileVersion(lockFile) !== options.lockVersion) throw new VersionConflictError(lockFile);
  const requestsFile = join(cloneDir, "spex.yaml");
  const requestsText = existsSync(requestsFile) ? readFileSync(requestsFile, "utf8") : null;
  let stale = false;
  try {
    stale = lockStaleness(lock, requestsText, (path) => (workingFolder === null ? null : readPathManifest(join(workingFolder, ...path.split("/"))))).stale;
  } catch {
    stale = true;
  }
  if (stale) throw new VersionConflictError(requestsFile);
}

async function cachedResource(cache: string, registry: RegistrySource, name: string, version: string): Promise<VersionResource> {
  const file = join(cache, "registry", ...name.split("/"), `${version}.json`);
  if (existsSync(file)) {
    try {
      return readVersionResource(name, version, JSON.parse(await readFile(file, "utf8")));
    } catch { /* refetch below */ }
  }
  const resource = await registry.version(name, version);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(resource));
  return resource;
}

async function cachedArchive(cache: string, registry: RegistrySource, name: string, version: string): Promise<Uint8Array> {
  const file = join(cache, "archives", ...name.split("/"), `${version}.tgz`);
  if (existsSync(file)) return new Uint8Array(await readFile(file));
  const bytes = await registry.archive(name, version);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, bytes);
  return bytes;
}

function putVerified(store: ContentStore, name: string, file: LockedFile, bytes: Uint8Array): void {
  try {
    store.put(bytes, file.sha256, file.executable, `${name} ${file.path}`);
  } catch (error) {
    if (error instanceof DigestError) throw new InstallError(name, `${name}: ${file.path} does not match the lock's digest; nothing was installed`, error);
    throw error;
  }
}

/** Fetch every selected file the store lacks, verified by digest. */
async function fetchMissing(options: InstallOptions, name: string, resolution: Resolution): Promise<void> {
  const { store } = options;
  const missing: LockedFile[] = [];
  for (const file of resolution.files) {
    if (store.has(file.sha256, file.executable)) continue;
    // The same bytes in the other mode need no fetch.
    if (store.has(file.sha256, !file.executable)) {
      putVerified(store, name, file, readFileSync(store.pathOf(file.sha256, !file.executable)));
      continue;
    }
    missing.push(file);
  }
  if (missing.length === 0) return;
  const source = resolution.source;
  if (isRegistrySource(source)) {
    const resource = await cachedResource(options.cache, options.registry, name, source.version);
    const total = resource.files?.length ?? resolution.files.length;
    let remaining = missing;
    if (missing.length > total / 2) {
      // The archive holds the release whole: cheaper than many files.
      const archive = await cachedArchive(options.cache, options.registry, name, source.version);
      const pkg = name.split("/")[1]!;
      const entries = new Map<string, Uint8Array>();
      try {
        for (const entry of readTar(gunzip(archive))) {
          if (entry.type !== "file" || !entry.path.startsWith(`${pkg}/`)) continue;
          entries.set(entry.path.slice(pkg.length + 1), entry.data);
        }
      } catch {
        rmSync(join(options.cache, "archives", ...name.split("/"), `${source.version}.tgz`), { force: true });
        entries.clear();
      }
      remaining = [];
      for (const file of missing) {
        const bytes = entries.get(file.path);
        if (bytes) putVerified(store, name, file, bytes);
        else remaining.push(file);
      }
    }
    for (const file of remaining) putVerified(store, name, file, await options.registry.file(name, source.version, file.path));
    return;
  }
  if (isGitSource(source)) {
    const credential = options.gitCredential ? await options.gitCredential(source.git) : undefined;
    const { dir } = await options.git.fetch(source.git, source.commit, credential);
    const root = source.path ? join(dir, ...source.path.split("/")) : dir;
    for (const file of missing) {
      const absolute = join(root, ...file.path.split("/"));
      let stat;
      try { stat = lstatSync(absolute); } catch { stat = undefined; }
      if (!stat?.isFile()) throw new InstallError(name, `${name}: ${file.path} is not a file at ${source.commit}`);
      putVerified(store, name, file, readFileSync(absolute));
    }
  }
}

function linkOrCopy(from: string, to: string, executable: boolean): void {
  try {
    linkSync(from, to);
  } catch {
    copyFileSync(from, to);
    chmodSync(to, executable ? 0o555 : 0o444);
  }
}

/** Install a lock's selected files (environments-7). */
export async function install(options: InstallOptions): Promise<InstallReport> {
  const { cloneDir, lock, store, workingFolder } = options;
  const missingPaths = missingPathSources(lock, workingFolder);
  const requestsText = options.requestsText !== undefined
    ? options.requestsText
    : existsSync(join(cloneDir, "spex.yaml")) ? readFileSync(join(cloneDir, "spex.yaml"), "utf8") : null;
  const staleness = lockStaleness(lock, requestsText, (path) => (workingFolder === null ? null : readPathManifest(join(workingFolder, ...path.split("/")))));
  if (staleness.stale) return { installed: [], missingPaths, stale: staleness.reasons, unchanged: true };

  const names = Object.keys(lock.packages).sort().filter((name) => !isPathSource(lock.packages[name]!.source));
  for (const name of names) {
    const issues = portablePathIssues(lock.packages[name]!.files.map((file) => file.path));
    if (issues.length > 0) throw new InstallError(name, `${name}: ${issues.map((issue) => `${issue.path} ${issue.message}`).join("; ")}`);
  }

  const target = join(cloneDir, "packages");
  const record = installRecord(lock);
  if (treeMatches(target, lock, record)) return { installed: [], missingPaths, unchanged: true };

  for (const name of names) {
    try {
      await fetchMissing(options, name, lock.packages[name]!);
    } catch (error) {
      if (error instanceof InstallError) throw error;
      throw new InstallError(name, `${name}: ${(error as Error).message}`, error);
    }
  }

  const id = randomUUID();
  const staging = join(options.cache, "staging", id);
  try {
    mkdirSync(staging, { recursive: true });
    for (const name of names) {
      const resolution = lock.packages[name]!;
      const root = join(staging, ...name.split("/"));
      for (const file of resolution.files) {
        const to = join(root, ...file.path.split("/"));
        mkdirSync(dirname(to), { recursive: true });
        linkOrCopy(store.pathOf(file.sha256, file.executable), to, file.executable);
      }
      for (const [artifact, chosen] of Object.entries(resolution.artifacts)) {
        if (chosen.language === null) continue;
        const folder = join(root, "playbooks", chosen.language, artifact);
        if (existsSync(folder)) provisionEngineLinks(folder, options.modulePaths);
      }
    }
    writeFileSync(join(staging, INSTALL_RECORD), JSON.stringify(record));
    await options.beforeReplace?.();
    // Checked at the instant before the swap, nothing awaited between.
    assertCurrent(options);
    replaceTree(staging, target, join(options.cache, "trash", id));
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    if (error instanceof InstallError || error instanceof VersionConflictError) throw error;
    throw new InstallError(undefined, `installing failed; the last files stay: ${(error as Error).message}`, error);
  }
  return { installed: names, missingPaths, unchanged: false };
}

/** Swap a complete staged tree in for the installed one. */
function replaceTree(staging: string, target: string, trash: string): void {
  let source = staging;
  const hadOld = existsSync(target);
  if (hadOld) {
    mkdirSync(dirname(trash), { recursive: true });
    try {
      renameSync(target, trash);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
      // The cache is on another file system: move the old tree aside
      // next to itself instead.
      trash = `${target}.old-${randomUUID()}`;
      renameSync(target, trash);
    }
  }
  try {
    try {
      renameSync(source, target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
      const near = `${target}.new-${randomUUID()}`;
      cpSync(source, near, { recursive: true, verbatimSymlinks: true });
      rmSync(source, { recursive: true, force: true });
      source = near;
      renameSync(source, target);
    }
  } catch (error) {
    if (hadOld) renameSync(trash, target);
    throw error;
  }
  if (hadOld) rmSync(trash, { recursive: true, force: true });
}

/** Remove every installed file of a clone (an environment emptied). */
export function removeInstalled(cloneDir: string): void {
  rmSync(join(cloneDir, "packages"), { recursive: true, force: true });
}
