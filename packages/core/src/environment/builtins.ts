// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The built-in spec package (environments-11, DR-104): the playbooks
// Playbook ships, staged at build as `sublang/playbooks` at Playbook's
// version under `assets/builtins/<version>/`, seeded into the store at
// start with a release index under `cache/builtins/`, and served as a
// registry source that needs no network. Several seeded versions stand
// side by side, so a lock pinning an older one keeps installing it.

import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Document, isMap, parseDocument } from "yaml";

import { writeApplicationBytes } from "../app-storage.js";
import { packFiles } from "./archive.js";
import { BUILTIN_PACKAGE_NAME } from "./exports.js";
import { artifactLanguages, inArtifact, parseManifestText, readRelease, ROOT_FILES, sha256Hex, type Manifest, type ReleaseFile } from "./format.js";
import { serializeLock, type Lock } from "./lock.js";
import { RegistryError, type RegistrySource, type SearchResult, type VersionIndex, type VersionIndexEntry, type VersionResource } from "./registry.js";
import { parseRequests, requestsDigest } from "./requests.js";
import { compareVersions, isVersion } from "./semver.js";
import type { ContentStore } from "./store.js";

export { BUILTIN_PACKAGE_NAME };

export interface BuiltinPackage {
  name: typeof BUILTIN_PACKAGE_NAME;
  version: string;
  /** The staged release folder. */
  dir: string;
}

/** A seeded release, as `cache/builtins/<version>.json` records it. */
export interface BuiltinRelease {
  format: 1;
  name: typeof BUILTIN_PACKAGE_NAME;
  version: string;
  manifest: Manifest;
  files: ReleaseFile[];
  /** SHA-256 of the release archive this source serves. */
  checksum: string;
  size: number;
}

/** Where the build stages the built-in spec package. */
export function builtinsRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..", "assets", "builtins");
}

/** The staged built-in spec package: the highest version staged. */
export function builtinPackage(root: string = builtinsRoot()): BuiltinPackage {
  const versions = existsSync(root) ? readdirSync(root).filter((name) => isVersion(name) && existsSync(join(root, name, "meta.yaml"))) : [];
  if (versions.length === 0) throw new Error(`no built-in spec package is staged under ${root}: run the core's build`);
  const version = versions.sort(compareVersions).at(-1)!;
  return { name: BUILTIN_PACKAGE_NAME, version, dir: join(root, version) };
}

function recordFile(cacheDir: string, version: string): string {
  return join(cacheDir, "builtins", `${version}.json`);
}

/** Seed a built-in release into the store and record its index
 * (environments-11). Idempotent; an older seeded release stays. */
export async function seedBuiltinPackage(store: ContentStore, cacheDir: string, pkg: BuiltinPackage = builtinPackage()): Promise<BuiltinRelease> {
  const { manifest, files } = await readRelease(pkg.dir);
  if (`${manifest.org}/${manifest.name}` !== BUILTIN_PACKAGE_NAME || manifest.version !== pkg.version) {
    throw new Error(`${pkg.dir} holds ${manifest.org}/${manifest.name} ${manifest.version}, not ${BUILTIN_PACKAGE_NAME} ${pkg.version}`);
  }
  const data: { path: string; executable: boolean; data: Uint8Array }[] = [];
  for (const file of files) {
    const bytes = await readFile(join(pkg.dir, ...file.path.split("/")));
    store.put(bytes, file.sha256, file.executable, `${BUILTIN_PACKAGE_NAME} ${file.path}`);
    data.push({ path: file.path, executable: file.executable, data: bytes });
  }
  const archive = packFiles(manifest.name, data);
  const release: BuiltinRelease = { format: 1, name: BUILTIN_PACKAGE_NAME, version: pkg.version, manifest, files, checksum: sha256Hex(archive), size: archive.length };
  const file = recordFile(cacheDir, pkg.version);
  await mkdir(dirname(file), { recursive: true });
  writeApplicationBytes(file, JSON.stringify(release));
  return release;
}

function readRecord(file: string): BuiltinRelease | null {
  try {
    const value = JSON.parse(readFileSync(file, "utf8")) as BuiltinRelease;
    return value.format === 1 && value.name === BUILTIN_PACKAGE_NAME && isVersion(value.version) && Array.isArray(value.files) ? value : null;
  } catch {
    return null;
  }
}

export interface BuiltinSourceOptions {
  store: ContentStore;
  cacheDir: string;
  /** The registry the lock names for the built-in spec package. */
  url?: string;
  /** The staged release this app ships, served even before seeding. */
  shipped?: BuiltinPackage | null;
}

const PUBLISHED_AT = "1970-01-01T00:00:00.000Z";

/** The seeded built-in releases as a registry source (environments-11):
 * no network, `sublang/playbooks` only. */
export function builtinRegistrySource(options: BuiltinSourceOptions): RegistrySource {
  const { store, cacheDir } = options;
  let shippedCache: { pkg: BuiltinPackage; release: Promise<BuiltinRelease> } | undefined;

  function shippedRelease(): Promise<BuiltinRelease> | undefined {
    const pkg = options.shipped === undefined ? safeBuiltinPackage() : options.shipped;
    if (!pkg) return undefined;
    if (shippedCache?.pkg.dir !== pkg.dir) {
      shippedCache = {
        pkg,
        release: (async () => {
          const { manifest, files } = await readRelease(pkg.dir);
          const archive = packFiles(manifest.name, files.map((file) => ({ path: file.path, executable: file.executable, data: readFileSync(join(pkg.dir, ...file.path.split("/"))) })));
          return { format: 1, name: BUILTIN_PACKAGE_NAME, version: pkg.version, manifest, files, checksum: sha256Hex(archive), size: archive.length };
        })(),
      };
    }
    return shippedCache.release;
  }

  async function releases(): Promise<BuiltinRelease[]> {
    const out = new Map<string, BuiltinRelease>();
    const dir = join(cacheDir, "builtins");
    if (existsSync(dir)) {
      for (const name of readdirSync(dir)) {
        if (!name.endsWith(".json")) continue;
        const record = readRecord(join(dir, name));
        // A seeded release serves only while the store holds its files.
        if (record && record.files.every((file) => store.has(file.sha256, file.executable))) out.set(record.version, record);
      }
    }
    const shipped = shippedRelease();
    if (shipped) {
      const release = await shipped;
      out.set(release.version, release);
    }
    return [...out.values()].sort((a, b) => compareVersions(a.version, b.version));
  }

  async function releaseOf(name: string, version: string): Promise<BuiltinRelease> {
    if (name !== BUILTIN_PACKAGE_NAME) throw new RegistryError("not_found", name, `${name} is not the built-in spec package`);
    const release = (await releases()).find((item) => item.version === version);
    if (!release) throw new RegistryError("not_found", name, `${name} ${version} is not seeded on this device`);
    return release;
  }

  function artifactsOf(release: BuiltinRelease): VersionIndexEntry["artifacts"] {
    const languages = artifactLanguages(release.manifest, release.files);
    const out: VersionIndexEntry["artifacts"] = {};
    for (const [id, artifact] of Object.entries(release.manifest.artifacts)) {
      out[id] = { kind: artifact.kind, ...(artifact.language ? { language: artifact.language } : {}), languages: languages[id] ?? [] };
    }
    return out;
  }

  async function bytesOf(release: BuiltinRelease, path: string): Promise<Uint8Array> {
    const file = release.files.find((item) => item.path === path);
    if (!file) throw new RegistryError("not_found", BUILTIN_PACKAGE_NAME, `${BUILTIN_PACKAGE_NAME} ${release.version} has no file ${path}`);
    if (store.has(file.sha256, file.executable)) return new Uint8Array(await readFile(store.pathOf(file.sha256, file.executable)));
    const shipped = options.shipped === undefined ? safeBuiltinPackage() : options.shipped;
    if (shipped && shipped.version === release.version) return new Uint8Array(await readFile(join(shipped.dir, ...path.split("/"))));
    throw new RegistryError("not_found", BUILTIN_PACKAGE_NAME, `${BUILTIN_PACKAGE_NAME} ${release.version}: ${path} is not in the store`);
  }

  return {
    url: options.url ?? "builtin:",
    async index(name: string): Promise<VersionIndex> {
      if (name !== BUILTIN_PACKAGE_NAME) throw new RegistryError("not_found", name, `${name} is not the built-in spec package`);
      const versions = (await releases()).map((release): VersionIndexEntry => ({
        version: release.version,
        format: 2,
        published_at: PUBLISHED_AT,
        checksum: release.checksum,
        yanked: false,
        suppressed: false,
        dependencies: { ...release.manifest.dependencies },
        artifacts: artifactsOf(release),
      }));
      return { org: "sublang", name: "playbooks", latest: versions.at(-1)?.version ?? null, versions };
    },
    async version(name: string, version: string): Promise<VersionResource> {
      const release = await releaseOf(name, version);
      const artifacts: VersionResource["artifacts"] = {};
      const indexArtifacts = artifactsOf(release);
      for (const [id, artifact] of Object.entries(release.manifest.artifacts)) {
        artifacts[id] = { ...indexArtifacts[id]!, ...(artifact.from ? { from: artifact.from } : {}), requires: [...artifact.requires] };
      }
      return {
        org: "sublang",
        name: "playbooks",
        version,
        format: 2,
        ...(release.manifest.description ? { description: release.manifest.description } : {}),
        ...(release.manifest.license ? { license: release.manifest.license } : {}),
        ...(release.manifest.repository ? { repository: release.manifest.repository } : {}),
        languages: [...new Set(Object.values(indexArtifacts).flatMap((artifact) => artifact.languages))].sort(),
        artifacts,
        dependencies: { ...release.manifest.dependencies },
        checksum: release.checksum,
        size: release.size,
        published_at: PUBLISHED_AT,
        yanked: false,
        suppressed: false,
        files: release.files.map((file) => ({ ...file })),
        dist: { tarball: `/api/v1/packages/sublang/playbooks/${version}/download`, sha256: release.checksum },
      };
    },
    async file(name: string, version: string, path: string): Promise<Uint8Array> {
      return bytesOf(await releaseOf(name, version), path);
    },
    async archive(name: string, version: string): Promise<Uint8Array> {
      const release = await releaseOf(name, version);
      const data = [];
      for (const file of release.files) data.push({ path: file.path, executable: file.executable, data: await bytesOf(release, file.path) });
      return packFiles(release.manifest.name, data);
    },
    async publish(name: string): Promise<void> {
      throw new RegistryError("forbidden", name, `${name}: the built-in spec package is not published from this device`);
    },
    async search(query: string): Promise<SearchResult[]> {
      const all = await releases();
      const latest = all.at(-1);
      if (!latest) return [];
      const description = latest.manifest.description ?? "";
      const q = query.toLowerCase();
      if (!BUILTIN_PACKAGE_NAME.includes(q) && !description.toLowerCase().includes(q)) return [];
      return [{ name: BUILTIN_PACKAGE_NAME, description, versions: all.map((release) => release.version) }];
    },
  };
}

function safeBuiltinPackage(): BuiltinPackage | null {
  try { return builtinPackage(); } catch { return null; }
}

/** A release folder's files, read synchronously as `readRelease` lists
 * them: links refused, `.git` and `node_modules` folders skipped. */
function listFilesSync(dir: string): ReleaseFile[] {
  const files: ReleaseFile[] = [];
  const walk = (relative: string): void => {
    const absolute = relative ? join(dir, ...relative.split("/")) : dir;
    for (const name of readdirSync(absolute).sort()) {
      const path = relative ? `${relative}/${name}` : name;
      const stat = lstatSync(join(absolute, name));
      if (stat.isDirectory()) {
        if (name === ".git" || name === "node_modules") continue;
        walk(path);
      } else if (stat.isFile()) {
        if (name === ".DS_Store") continue;
        const bytes = readFileSync(join(absolute, name));
        files.push({ path, size: bytes.length, sha256: sha256Hex(bytes), executable: (stat.mode & 0o100) !== 0 });
      } else {
        throw new Error(`${pkgPathOf(dir, path)} is not a file`);
      }
    }
  };
  walk("");
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

function pkgPathOf(dir: string, path: string): string {
  return join(dir, ...path.split("/"));
}

/**
 * The lock an environment requesting only the built-in spec package
 * resolves to, computed from the release this app ships without any
 * source or network (environments-3, environments-6): every artifact in
 * its original language, every file of theirs, each playbook exported
 * under its id. A clone the store makes holds it from its first commit.
 */
export function builtinLock(pkg: BuiltinPackage, registryUrl: string, requestsText: string): Lock {
  const { manifest, issues } = parseManifestText(readFileSync(join(pkg.dir, "meta.yaml"), "utf8"));
  if (!manifest) throw new Error(issues.map((issue) => issue.message).join("; "));
  const files = listFilesSync(pkg.dir);
  const archive = packFiles(manifest.name, files.map((file) => ({ path: file.path, executable: file.executable, data: readFileSync(pkgPathOf(pkg.dir, file.path)) })));
  const artifacts: Lock["packages"][string]["artifacts"] = {};
  const exports: Record<string, string> = {};
  const ids = Object.keys(manifest.artifacts).sort();
  for (const id of ids) {
    const artifact = manifest.artifacts[id]!;
    artifacts[id] = { language: artifact.kind === "applet" ? null : artifact.language ?? null, fallback: false };
    if (artifact.kind === "playbook" || artifact.kind === "skill") exports[id] = id;
  }
  const selected = files.filter((file) => (ROOT_FILES as readonly string[]).includes(file.path)
    || ids.some((id) => inArtifact(file.path, manifest.artifacts[id]!.kind, id, artifacts[id]!.language, manifest.name)));
  return {
    format: 1,
    requests: requestsDigest(requestsText),
    packages: {
      [BUILTIN_PACKAGE_NAME]: {
        source: { registry: registryUrl.replace(/\/+$/, ""), version: manifest.version, checksum: sha256Hex(archive) },
        requiredBy: [],
        artifacts,
        files: selected.map((file) => ({ path: file.path, sha256: file.sha256, executable: file.executable })),
        exports,
      },
    },
  };
}

/**
 * A new clone's environment (environments-11, storage-6): `spex.yaml`
 * requesting the built-in spec package where it does not, and — where
 * that is all it requests and no lock stands — its lock, so the clone's
 * first commit holds both. Returns whether `spex.yaml` was written.
 */
export function prepareBuiltinEnvironment(cloneDir: string, pkg: BuiltinPackage, registryUrl: string): boolean {
  const wrote = ensureBuiltinRequest(cloneDir, pkg.version);
  const lockFile = join(cloneDir, "spex.lock");
  if (existsSync(lockFile)) return wrote;
  const text = readFileSync(join(cloneDir, "spex.yaml"), "utf8");
  let requested: string[];
  try { requested = Object.keys(parseRequests(text).packages); } catch { return wrote; }
  if (requested.length !== 1 || requested[0] !== BUILTIN_PACKAGE_NAME) return wrote;
  try {
    writeApplicationBytes(lockFile, serializeLock(builtinLock(pkg, registryUrl, text)));
  } catch (error) {
    // The first resolve writes it instead.
    console.error(`spex: ${cloneDir} holds no lock yet: ${error instanceof Error ? error.message : String(error)}`);
  }
  return wrote;
}

/**
 * Request the built-in spec package at a caret requirement in a spex
 * repository's `spex.yaml` where it is not requested (environments-11,
 * storage-6): written synchronously, so a clone's first commit already
 * holds it; comments and key order of an existing file are kept. A
 * file that does not read is left as it is. Returns whether it wrote.
 */
export function ensureBuiltinRequest(cloneDir: string, version: string): boolean {
  const file = join(cloneDir, "spex.yaml");
  let text = "";
  if (existsSync(file)) {
    text = readFileSync(file, "utf8");
    try {
      if (parseRequests(text).packages[BUILTIN_PACKAGE_NAME]) return false;
    } catch {
      return false;
    }
  }
  const doc = text.trim() === "" ? new Document({ format: 1, packages: {} }) : parseDocument(text);
  if (!isMap(doc.get("packages", true))) doc.set("packages", doc.createNode({}));
  doc.setIn(["packages", BUILTIN_PACKAGE_NAME], doc.createNode({ version: `^${version}` }));
  const next = doc.toString({ lineWidth: 0 });
  parseRequests(next);
  mkdirSync(cloneDir, { recursive: true });
  writeApplicationBytes(file, next);
  return true;
}

/** A registry that answers `sublang/playbooks` from the built-in source
 * first — offline, from what this device seeded — and everything else
 * from the remote registry, whose URL the lock records. */
export function compositeRegistry(builtin: RegistrySource, remote: RegistrySource): RegistrySource {
  async function builtinHas(name: string, version: string): Promise<boolean> {
    if (name !== BUILTIN_PACKAGE_NAME) return false;
    try {
      return (await builtin.index(name)).versions.some((entry) => entry.version === version);
    } catch {
      return false;
    }
  }
  return {
    url: remote.url,
    async index(name) {
      if (name === BUILTIN_PACKAGE_NAME) {
        const index = await builtin.index(name).catch(() => null);
        if (index && index.versions.length > 0) return index;
      }
      return remote.index(name);
    },
    async version(name, version) {
      return (await builtinHas(name, version)) ? builtin.version(name, version) : remote.version(name, version);
    },
    async file(name, version, path) {
      return (await builtinHas(name, version)) ? builtin.file(name, version, path) : remote.file(name, version, path);
    },
    async archive(name, version) {
      return (await builtinHas(name, version)) ? builtin.archive(name, version) : remote.archive(name, version);
    },
    publish: (name, version, tgz) => remote.publish(name, version, tgz),
    async search(query) {
      const local = await builtin.search(query).catch(() => [] as SearchResult[]);
      let far: SearchResult[];
      try {
        far = await remote.search(query);
      } catch (error) {
        // Offline, the built-in spec package still answers.
        if (local.length > 0) return local;
        throw error;
      }
      return [...local, ...far.filter((result) => !local.some((item) => item.name === result.name))];
    },
  };
}
