// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Installing a locked environment (environments-7, DR-104): the lock's
// selected files, verified by digest into the store, are linked under
// `<clone>/packages/<org>/<pkg>/` at their release paths. A registry
// package is fetched from the first of the registries asked that serves
// its release at the locked version and checksum (DR-127); the built-in
// spec package is served first from this device's seed where its files
// carry the lock's digests, whatever archive checksum the lock records
// (environments-11). The new tree
// is complete before it replaces the old one; a failure leaves the last
// files in place. The swap happens only while the lock it installs still
// stands on disk at the version read and still matches `spex.yaml` and
// its path sources: an install overtaken meanwhile publishes nothing
// (DR-111). A path source copies nothing and is reported missing where
// the folder its path resolves to lacks it; your own group's path source
// must hold only what its clone's sync carries, checked before anything
// is installed or linked (environments-32); a stale lock installs
// nothing new.
// No code runs: what an install adds to the release files is each
// playbook artifact folder's engine links — a path source's in the
// working folder too — and, for a registry module bundled carrying its
// own engine, the module bundled again from the wrapper shipped beside
// it, so every playbook runs on the app's engine (playbook-library-46).

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
import { dirname, join, relative } from "node:path";

import { ENGINE_LINKS_EXCLUDE, prepareArtifactEngine, provisionEngineLinks } from "../compile.js";
import { seedServes } from "./builtins.js";
import { fileVersion, VersionConflictError, type FileVersion } from "../files.js";
import { instanceFolder } from "../instance.js";
import { BUILTIN_PACKAGE_NAME, writeExcludeBlock } from "./exports.js";
import { listReleaseFiles, parseManifestText, portablePathIssues, sha256Hex, type Manifest } from "./format.js";
import type { GitCredential, GitSource } from "./git-source.js";
import { isGitSource, isPathSource, isRegistrySource, lockStaleness, sourceValue, type Lock, type LockedFile, type RegistrySourceLock, type Resolution } from "./lock.js";
import { ownFolderIssue, ownPathIssue, ownPathMessage } from "./own-paths.js";
import { readVersionResource, RegistryError, type RegistrySource, type VersionResource } from "./registry.js";
import { isVersion } from "./semver.js";
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
  /** The registries asked for a registry source's files, in order
   * (environments-7): the first serving its release at the locked
   * version and checksum serves them. `[registry]` where omitted. */
  registries?: (source: RegistrySourceLock) => readonly RegistrySource[];
  /** This device's seed of the built-in spec package (environments-11),
   * asked first for its locked release: it serves where it holds the
   * locked version with each locked file at the lock's digest, whatever
   * archive checksum the lock records (environments-7). */
  seed?: RegistrySource;
  git: GitSource;
  gitCredential?: (repo: string) => Promise<GitCredential | undefined>;
  /** The folder a path source's path is relative to (environments-2):
   * the paired working folder's root, or your own group's clone's; null
   * where this device has none. */
  pathRoot: string | null;
  /** Whether `pathRoot` is your own group's clone, whose path sources
   * hold only what its sync carries (environments-32). */
  confined?: boolean;
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
  /** Path sources this device lacks where their paths resolve. */
  missingPaths: string[];
  /** Why the lock is stale, where it is: nothing new was installed. */
  stale?: string[];
  /** True when the installed files already matched the lock. */
  unchanged: boolean;
  /** Registry modules left carrying the engine they were bundled with,
   * each with why (playbook-library-46). */
  engineKept: { module: string; reason: string }[];
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

/** The path sources of a lock this device lacks where their paths
 * resolve (environments-7). */
export function missingPathSources(lock: Lock, pathRoot: string | null): string[] {
  const missing: string[] = [];
  for (const name of Object.keys(lock.packages).sort()) {
    const source = lock.packages[name]!.source;
    if (!isPathSource(source)) continue;
    if (pathRoot === null || !existsSync(join(pathRoot, ...source.path.split("/"), "meta.yaml"))) missing.push(name);
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
  const { cloneDir, lock, pathRoot } = options;
  const lockFile = join(cloneDir, "spex.lock");
  if (!existsSync(cloneDir)) throw new VersionConflictError(cloneDir);
  if (fileVersion(lockFile) !== options.lockVersion) throw new VersionConflictError(lockFile);
  const requestsFile = join(cloneDir, "spex.yaml");
  const requestsText = existsSync(requestsFile) ? readFileSync(requestsFile, "utf8") : null;
  let stale = false;
  try {
    stale = lockStaleness(lock, requestsText, (path) => (pathRoot === null ? null : readPathManifest(join(pathRoot, ...path.split("/"))))).stale;
  } catch {
    stale = true;
  }
  if (stale) throw new VersionConflictError(requestsFile);
}

const isChecksum = (value: string): boolean => /^[0-9a-f]{64}$/.test(value);

/** A registry's folder under `cache/registry/`: its instance's folder
 * where its URL is an instance's origin, else one from its URL's digest,
 * which no instance's folder begins as. */
function registryFolder(url: string): string {
  try { return instanceFolder(url); } catch { return `_${sha256Hex(url).slice(0, 32)}`; }
}

/** Where a registry's version resource is cached: per registry, since
 * each answers for its own releases; none for a version no release may
 * hold. */
function resourceFile(cache: string, registry: RegistrySource, name: string, version: string): string | null {
  return isVersion(version) ? join(cache, "registry", registryFolder(registry.url), ...name.split("/"), `${version}.json`) : null;
}

/** Where a release archive is cached: by the checksum it was verified
 * at, whichever registry served it. */
function archiveFile(cache: string, name: string, source: RegistrySourceLock): string | null {
  return isVersion(source.version) && isChecksum(source.checksum) ? join(cache, "archives", ...name.split("/"), source.version, `${source.checksum}.tgz`) : null;
}

/** A registry's version resource, from the cache where the answer kept
 * there carries the locked checksum, else asked of the registry. */
async function cachedResource(cache: string, registry: RegistrySource, name: string, source: RegistrySourceLock): Promise<VersionResource> {
  const file = resourceFile(cache, registry, name, source.version);
  if (file !== null && existsSync(file)) {
    try {
      const cached = readVersionResource(name, source.version, JSON.parse(await readFile(file, "utf8")));
      if (cached.checksum === source.checksum) return cached;
    } catch { /* refetch below */ }
  }
  const resource = await registry.version(name, source.version);
  if (file !== null) {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(resource));
  }
  return resource;
}

/** The release archive at the locked checksum, from the cache or the
 * registry; null where the registry's archive is not that release, so
 * its raw files serve instead. Only an archive at its checksum is kept. */
async function cachedArchive(cache: string, registry: RegistrySource, name: string, source: RegistrySourceLock): Promise<Uint8Array | null> {
  const file = archiveFile(cache, name, source);
  if (file !== null && existsSync(file)) {
    const bytes = new Uint8Array(await readFile(file));
    if (sha256Hex(bytes) === source.checksum) return bytes;
    rmSync(file, { force: true });
  }
  const bytes = await registry.archive(name, source.version);
  if (sha256Hex(bytes) !== source.checksum) return null;
  if (file !== null) {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, bytes);
  }
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
    // The built-in from this device's seed, by its files' digests: the
    // archive each device packs differs, its files do not.
    if (name === BUILTIN_PACKAGE_NAME && options.seed && await fetchSeeded(options.seed, store, name, source, resolution)) return;
    // The first registry serving the release at the locked checksum
    // serves what is still missing; any other answer moves on.
    const reasons: string[] = [];
    for (const registry of options.registries ? options.registries(source) : [options.registry]) {
      const left = missing.filter((file) => !store.has(file.sha256, file.executable));
      if (left.length === 0) return;
      try {
        if (await fetchFrom(options, registry, name, source, resolution, left)) return;
        reasons.push(`${registry.url} holds it at another checksum`);
      } catch (error) {
        if (!(error instanceof RegistryError)) throw error;
        reasons.push(`${registry.url}: ${error.message}`);
      }
    }
    throw new InstallError(name, `${name} ${source.version}: no registry serves it at the locked checksum${reasons.length > 0 ? `: ${reasons.join("; ")}` : ""}`);
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

/** Serve the built-in spec package's missing files from this device's
 * seed, each verified by digest: false where the seed lacks the locked
 * version, holds a locked file at another digest, or cannot read one, so
 * the registries are asked instead. */
async function fetchSeeded(seed: RegistrySource, store: ContentStore, name: string, source: RegistrySourceLock, resolution: Resolution): Promise<boolean> {
  if (!(await seedServes(seed, source.version, resolution.files))) return false;
  for (const file of resolution.files) {
    if (store.has(file.sha256, file.executable)) continue;
    let bytes: Uint8Array;
    try {
      bytes = await seed.file(name, source.version, file.path);
    } catch (error) {
      if (error instanceof RegistryError) return false;
      throw error;
    }
    putVerified(store, name, file, bytes);
  }
  return true;
}

/** Fetch a registry package's missing files from one registry, each
 * verified by digest: false where it holds the release at another
 * checksum than the lock's. */
async function fetchFrom(options: InstallOptions, registry: RegistrySource, name: string, source: RegistrySourceLock, resolution: Resolution, missing: LockedFile[]): Promise<boolean> {
  const { store } = options;
  const resource = await cachedResource(options.cache, registry, name, source);
  if (resource.checksum !== source.checksum) return false;
  const total = resource.files?.length ?? resolution.files.length;
  let remaining = missing;
  if (missing.length > total / 2) {
    // The archive holds the release whole: cheaper than many files.
    const archive = await cachedArchive(options.cache, registry, name, source);
    const pkg = name.split("/")[1]!;
    const entries = new Map<string, Uint8Array>();
    if (archive !== null) {
      try {
        for (const entry of readTar(gunzip(archive))) {
          if (entry.type !== "file" || !entry.path.startsWith(`${pkg}/`)) continue;
          entries.set(entry.path.slice(pkg.length + 1), entry.data);
        }
      } catch {
        const file = archiveFile(options.cache, name, source);
        if (file !== null) rmSync(file, { force: true });
        entries.clear();
      }
    }
    remaining = [];
    for (const file of missing) {
      const bytes = entries.get(file.path);
      if (bytes) putVerified(store, name, file, bytes);
      else remaining.push(file);
    }
  }
  for (const file of remaining) putVerified(store, name, file, await registry.file(name, source.version, file.path));
  return true;
}

function linkOrCopy(from: string, to: string, executable: boolean): void {
  try {
    linkSync(from, to);
  } catch {
    copyFileSync(from, to);
    chmodSync(to, executable ? 0o555 : 0o444);
  }
}

/** The playbook artifact folders of a spec package's selected
 * artifacts under `root`, with their ids. */
function playbookFolders(root: string, resolution: Resolution): { id: string; folder: string }[] {
  const out: { id: string; folder: string }[] = [];
  for (const [id, chosen] of Object.entries(resolution.artifacts)) {
    if (chosen.language === null) continue;
    const folder = join(root, "playbooks", chosen.language, id);
    if (existsSync(folder)) out.push({ id, folder });
  }
  return out;
}

/** Prepare every playbook artifact folder under `target` to run on the
 * app's engine (playbook-library-46), collecting the modules kept as
 * they are; each is named at `named`'s spelling of its folder. A tree
 * standing installed already is `tolerant`: a folder it cannot prepare
 * is logged and left, since the install itself places nothing. */
async function prepareInstalled(target: string, names: readonly string[], lock: Lock, modulePaths: string[] | undefined, named: (folder: string) => string, tolerant = false): Promise<InstallReport["engineKept"]> {
  const kept: InstallReport["engineKept"] = [];
  for (const name of names) {
    for (const { id, folder } of playbookFolders(join(target, ...name.split("/")), lock.packages[name]!)) {
      let reason: string | null;
      try {
        reason = await prepareArtifactEngine(folder, id, modulePaths);
      } catch (error) {
        if (!tolerant) throw error;
        console.error(`spex: ${named(folder)} was not prepared for the app's engine: ${String(error)}`);
        continue;
      }
      if (reason !== null) kept.push({ module: join(named(folder), `${id}.registry.mjs`), reason });
    }
  }
  return kept;
}

/** Every playbook artifact folder of a lock's path sources where their
 * paths resolve. */
function pathSourcePlaybooks(lock: Lock, pathRoot: string | null): string[] {
  if (pathRoot === null) return [];
  const folders: string[] = [];
  for (const name of Object.keys(lock.packages).sort()) {
    const resolution = lock.packages[name]!;
    if (!isPathSource(resolution.source)) continue;
    for (const { folder } of playbookFolders(join(pathRoot, ...resolution.source.path.split("/")), resolution)) folders.push(folder);
  }
  return folders;
}

/** The engine links of a path source's playbook folders are ignored by
 * the Git of the working folder or of your own group's clone holding
 * them before any is made, so a sync never carries one
 * (playbook-library-46, DR-125): your own group's clone failing to list
 * them fails the install, which makes none; a working folder's failure
 * is logged and its folders are linked anyway, its Git being the
 * reader's alone. */
function excludeEngineLinks(pathRoot: string | null, folders: readonly string[], confined: boolean): void {
  if (pathRoot === null || folders.length === 0) return;
  try { writeExcludeBlock(pathRoot, [ENGINE_LINKS_EXCLUDE], "engine links"); }
  catch (error) {
    if (confined) throw new InstallError(undefined, `${pathRoot}'s .git/info/exclude cannot list the engine links, so none is made: ${(error as Error).message}`, error);
    console.error(`spex: ${pathRoot}'s engine links are not excluded: ${String(error)}`);
  }
}

/** A path source's playbook folders get the engine links a compile
 * provisions, their files left as they are; a folder that takes no link
 * is logged, never failing the install. */
function linkPathSources(folders: readonly string[], modulePaths: string[] | undefined): void {
  for (const folder of folders) {
    try { provisionEngineLinks(folder, modulePaths); }
    catch (error) { console.error(`spex: ${folder} takes no engine links: ${String(error)}`); }
  }
}

/** Refuse your own group's path source holding what its clone's sync
 * drops or refuses (environments-32), before anything is installed or
 * linked: a folder this device lacks is reported missing instead. */
async function assertConfined(lock: Lock, pathRoot: string): Promise<void> {
  for (const name of Object.keys(lock.packages).sort()) {
    const source = lock.packages[name]!.source;
    if (!isPathSource(source)) continue;
    const folder = join(pathRoot, ...source.path.split("/"));
    if (!existsSync(join(folder, "meta.yaml"))) continue;
    const issue = ownPathIssue(pathRoot, source.path)
      ?? ownFolderIssue(pathRoot, source.path, (await listReleaseFiles(folder)).files.map((file) => file.path));
    if (issue) throw new InstallError(name, ownPathMessage(name, source.path, issue));
  }
}

/** Install a lock's selected files (environments-7). */
export async function install(options: InstallOptions): Promise<InstallReport> {
  const { cloneDir, lock, store, pathRoot } = options;
  const missingPaths = missingPathSources(lock, pathRoot);
  const requestsText = options.requestsText !== undefined
    ? options.requestsText
    : existsSync(join(cloneDir, "spex.yaml")) ? readFileSync(join(cloneDir, "spex.yaml"), "utf8") : null;
  const staleness = lockStaleness(lock, requestsText, (path) => (pathRoot === null ? null : readPathManifest(join(pathRoot, ...path.split("/")))));
  if (staleness.stale) return { installed: [], missingPaths, stale: staleness.reasons, unchanged: true, engineKept: [] };

  const names = Object.keys(lock.packages).sort().filter((name) => !isPathSource(lock.packages[name]!.source));
  for (const name of names) {
    const issues = portablePathIssues(lock.packages[name]!.files.map((file) => file.path));
    if (issues.length > 0) throw new InstallError(name, `${name}: ${issues.map((issue) => `${issue.path} ${issue.message}`).join("; ")}`);
  }

  const confined = options.confined === true;
  const playbooks = pathSourcePlaybooks(lock, pathRoot);
  // The exclude first, so the check reads the engine links standing
  // from an earlier install as Git ignores them.
  excludeEngineLinks(pathRoot, playbooks, confined);
  if (confined && pathRoot !== null) await assertConfined(lock, pathRoot);
  linkPathSources(playbooks, options.modulePaths);
  const target = join(cloneDir, "packages");
  const record = installRecord(lock);
  if (treeMatches(target, lock, record)) {
    // Installed already, by this app or an earlier one: each playbook is
    // prepared in place, where an earlier app left a module carrying the
    // engine it was bundled with.
    const engineKept = await prepareInstalled(target, names, lock, options.modulePaths, (folder) => folder, true);
    return { installed: [], missingPaths, unchanged: true, engineKept };
  }

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
  let engineKept: InstallReport["engineKept"];
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
    }
    engineKept = await prepareInstalled(staging, names, lock, options.modulePaths, (folder) => join(target, relative(staging, folder)));
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
  return { installed: names, missingPaths, unchanged: false, engineKept };
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
  // The complete new tree now stands at target: the install committed.
  // Garbage collection cannot turn that success into a failed install,
  // which would skip exports and falsely claim the old files still stand.
  if (hadOld) {
    try { rmSync(trash, { recursive: true, force: true }); }
    catch (error) { console.error(`spex: installed files stand; obsolete tree ${trash} could not be removed: ${String(error)}`); }
  }
}

/** Remove every installed file of a clone (an environment emptied). */
export function removeInstalled(cloneDir: string): void {
  rmSync(join(cloneDir, "packages"), { recursive: true, force: true });
}
