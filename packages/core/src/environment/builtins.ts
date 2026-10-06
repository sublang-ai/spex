// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The built-in spec package (environments-11, DR-104): the playbooks
// Playbook ships, staged at build as `sublang/playbooks` at Playbook's
// version under `assets/builtins/<version>/`, seeded into the store at
// start with a release index under `cache/builtins/`, and served as a
// registry source that needs no network. Several seeded versions stand
// side by side, so a lock pinning an older one keeps installing it.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { writeApplicationBytes } from "../app-storage.js";
import { packFiles } from "./archive.js";
import { BUILTIN_PACKAGE_NAME } from "./exports.js";
import { artifactLanguages, readRelease, sha256Hex, type Manifest, type ReleaseFile } from "./format.js";
import { RegistryError, type RegistrySource, type SearchResult, type VersionIndex, type VersionIndexEntry, type VersionResource } from "./registry.js";
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
