// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The lock: a spex repository's `spex.lock` (environments-3, DR-104).
// Exactly `{format: 1, requests, packages}`: the digest of the
// `spex.yaml` it resolved, and per spec package the exact source, who
// required it, the selected artifacts with their languages, every
// selected file with its digest and executable flag, and the exported
// names. Written as YAML in one fixed order, so one resolution always
// writes the same bytes on every device.

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { Document, isMap, isSeq, parseDocument } from "yaml";

import { writeApplicationBytes, writeVersionedBytes, type FileVersion } from "../files.js";
import { isPackageName, sha256Hex, type Issue, type Manifest } from "./format.js";
import { requestsDigest } from "./requests.js";

/** A selected file as the lock records it. */
export interface LockedFile {
  path: string;
  sha256: string;
  executable: boolean;
}

export type RegistrySourceLock = { registry: string; version: string; checksum: string };
export type PathSourceLock = { path: string; version: string; dependencies: Record<string, string>; requires: Record<string, string[]> };
export type GitSourceLock = { git: string; commit: string; path?: string };
export type SourceLock = RegistrySourceLock | PathSourceLock | GitSourceLock;

export interface LockedArtifact {
  language: string | null;
  fallback: boolean;
}

export interface Resolution {
  source: SourceLock;
  /** The spec packages that required it; `[]` for a direct request alone. */
  requiredBy: string[];
  artifacts: Record<string, LockedArtifact>;
  files: LockedFile[];
  /** Exported Agent Skills name to artifact id. */
  exports: Record<string, string>;
}

export interface Lock {
  format: 1;
  /** SHA-256 of the `spex.yaml` this lock resolved. */
  requests: string;
  packages: Record<string, Resolution>;
}

export class LockError extends Error {
  constructor(readonly issues: Issue[]) {
    super(`spex.lock refused: ${issues.map((issue) => issue.message).join("; ")}`);
    this.name = "LockError";
  }
}

export function isRegistrySource(source: SourceLock): source is RegistrySourceLock {
  return "registry" in source;
}
export function isPathSource(source: SourceLock): source is PathSourceLock {
  return "path" in source && !("git" in source) && !("registry" in source);
}
export function isGitSource(source: SourceLock): source is GitSourceLock {
  return "git" in source;
}

/** The version a resolution stands at, where the lock records one. */
export function resolutionVersion(resolution: Resolution): string | undefined {
  const source = resolution.source;
  return isGitSource(source) ? undefined : source.version;
}

const byPath = (a: { path: string }, b: { path: string }): number => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
const sortedKeys = (record: Record<string, unknown>): string[] => Object.keys(record).sort();

/** A source as the lock writes it: its own fields, in one order. */
export function sourceValue(source: SourceLock): Record<string, unknown> {
  if (isRegistrySource(source)) return { registry: source.registry, version: source.version, checksum: source.checksum };
  if (isGitSource(source)) return { git: source.git, commit: source.commit, ...(source.path !== undefined ? { path: source.path } : {}) };
  const requires: Record<string, string[]> = {};
  for (const id of sortedKeys(source.requires)) requires[id] = [...source.requires[id]!];
  const dependencies: Record<string, string> = {};
  for (const name of sortedKeys(source.dependencies)) dependencies[name] = source.dependencies[name]!;
  return { path: source.path, version: source.version, dependencies, requires };
}

/** The lock's bytes: fixed field order, names and paths sorted. */
export function serializeLock(lock: Lock): string {
  const packages: Record<string, unknown> = {};
  for (const name of sortedKeys(lock.packages)) {
    const resolution = lock.packages[name]!;
    const artifacts: Record<string, unknown> = {};
    for (const id of sortedKeys(resolution.artifacts)) {
      const artifact = resolution.artifacts[id]!;
      artifacts[id] = { language: artifact.language, fallback: artifact.fallback };
    }
    const exports: Record<string, string> = {};
    for (const exported of sortedKeys(resolution.exports)) exports[exported] = resolution.exports[exported]!;
    packages[name] = {
      source: sourceValue(resolution.source),
      "required-by": [...resolution.requiredBy].sort(),
      artifacts,
      files: [...resolution.files].sort(byPath).map((file) => ({ path: file.path, sha256: file.sha256, executable: file.executable })),
      exports,
    };
  }
  const doc = new Document({ format: 1, requests: lock.requests, packages });
  // One line per file and per artifact keeps the lock short to read.
  const packagesNode = doc.get("packages", true);
  if (isMap(packagesNode)) {
    for (const item of packagesNode.items) {
      const resolution = item.value;
      if (!isMap(resolution)) continue;
      const files = resolution.get("files", true);
      if (isSeq(files)) for (const file of files.items) if (isMap(file)) file.flow = true;
      const artifacts = resolution.get("artifacts", true);
      if (isMap(artifacts)) for (const artifact of artifacts.items) if (isMap(artifact.value)) artifact.value.flow = true;
      for (const key of ["required-by"]) {
        const node = resolution.get(key, true);
        if (isSeq(node)) node.flow = true;
      }
    }
  }
  return doc.toString({ lineWidth: 0 });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function closed(value: Record<string, unknown>, keys: string[], at: string, issues: Issue[]): void {
  for (const key of Object.keys(value)) if (!keys.includes(key)) issues.push({ path: at, rule: "field", message: `${at} has unknown field "${key}"` });
}

const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string");
const isHex64 = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);

function parseSource(raw: unknown, at: string, issues: Issue[]): SourceLock | undefined {
  if (!isPlainObject(raw)) { issues.push({ path: at, rule: "source", message: `${at} is not a source` }); return undefined; }
  if ("registry" in raw) {
    closed(raw, ["registry", "version", "checksum"], at, issues);
    if (typeof raw.registry !== "string" || typeof raw.version !== "string" || typeof raw.checksum !== "string") {
      issues.push({ path: at, rule: "source", message: `${at} is not {registry, version, checksum}` });
      return undefined;
    }
    return { registry: raw.registry, version: raw.version, checksum: raw.checksum };
  }
  if ("git" in raw) {
    closed(raw, ["git", "commit", "path"], at, issues);
    if (typeof raw.git !== "string" || typeof raw.commit !== "string" || (raw.path !== undefined && typeof raw.path !== "string")) {
      issues.push({ path: at, rule: "source", message: `${at} is not {git, commit, path?}` });
      return undefined;
    }
    return { git: raw.git, commit: raw.commit, ...(typeof raw.path === "string" ? { path: raw.path } : {}) };
  }
  closed(raw, ["path", "version", "dependencies", "requires"], at, issues);
  const dependencies = raw.dependencies ?? {};
  const requires = raw.requires ?? {};
  if (typeof raw.path !== "string" || typeof raw.version !== "string" || !isPlainObject(dependencies)
    || !Object.values(dependencies).every((value) => typeof value === "string")
    || !isPlainObject(requires) || !Object.values(requires).every(isStringArray)) {
    issues.push({ path: at, rule: "source", message: `${at} is not {path, version, dependencies, requires}` });
    return undefined;
  }
  return { path: raw.path, version: raw.version, dependencies: dependencies as Record<string, string>, requires: requires as Record<string, string[]> };
}

/** Read a parsed `spex.lock` value, or throw. Reads `required-by` and
 * the in-memory `requiredBy` alike. */
export function parseLockValue(raw: unknown): Lock {
  const issues: Issue[] = [];
  if (!isPlainObject(raw)) throw new LockError([{ rule: "lock", message: "spex.lock is not a mapping" }]);
  if (raw.format !== 1) throw new LockError([{ rule: "format", message: `format ${JSON.stringify(raw.format ?? null)} is not the known format 1` }]);
  closed(raw, ["format", "requests", "packages"], "spex.lock", issues);
  if (typeof raw.requests !== "string") issues.push({ rule: "requests", message: "requests is not a digest" });
  const packages: Record<string, Resolution> = {};
  const rawPackages = raw.packages ?? {};
  if (!isPlainObject(rawPackages)) issues.push({ rule: "packages", message: "packages is not a mapping" });
  else {
    for (const [name, value] of Object.entries(rawPackages)) {
      const at = `packages.${name}`;
      if (!isPackageName(name)) { issues.push({ path: at, rule: "name", message: `"${name}" is not a <org>/<pkg> name` }); continue; }
      if (!isPlainObject(value)) { issues.push({ path: at, rule: "resolution", message: `${at} is not a resolution` }); continue; }
      closed(value, ["source", "required-by", "requiredBy", "artifacts", "files", "exports"], at, issues);
      const source = parseSource(value.source, `${at}.source`, issues);
      const requiredBy = value["required-by"] ?? value.requiredBy ?? [];
      if (!isStringArray(requiredBy)) issues.push({ path: at, rule: "required-by", message: `${at}.required-by is not a list of names` });
      const artifacts: Record<string, LockedArtifact> = {};
      if (!isPlainObject(value.artifacts)) issues.push({ path: at, rule: "artifacts", message: `${at}.artifacts is not a mapping` });
      else for (const [id, artifact] of Object.entries(value.artifacts)) {
        if (!isPlainObject(artifact) || !(artifact.language === null || typeof artifact.language === "string") || typeof artifact.fallback !== "boolean") {
          issues.push({ path: at, rule: "artifacts", message: `${at}.artifacts.${id} is not {language, fallback}` });
          continue;
        }
        artifacts[id] = { language: artifact.language as string | null, fallback: artifact.fallback };
      }
      const files: LockedFile[] = [];
      if (!Array.isArray(value.files)) issues.push({ path: at, rule: "files", message: `${at}.files is not a list` });
      else for (const file of value.files) {
        if (!isPlainObject(file) || typeof file.path !== "string" || !isHex64(file.sha256) || typeof file.executable !== "boolean") {
          issues.push({ path: at, rule: "files", message: `${at}.files holds an entry that is not {path, sha256, executable}` });
          continue;
        }
        files.push({ path: file.path, sha256: file.sha256, executable: file.executable });
      }
      const exports: Record<string, string> = {};
      if (!isPlainObject(value.exports ?? {})) issues.push({ path: at, rule: "exports", message: `${at}.exports is not a mapping` });
      else for (const [exported, id] of Object.entries((value.exports ?? {}) as Record<string, unknown>)) {
        if (typeof id === "string") exports[exported] = id;
        else issues.push({ path: at, rule: "exports", message: `${at}.exports.${exported} is not an artifact id` });
      }
      if (source && isStringArray(requiredBy)) packages[name] = { source, requiredBy: [...requiredBy], artifacts, files, exports };
    }
  }
  if (issues.length > 0) throw new LockError(issues);
  return { format: 1, requests: raw.requests as string, packages };
}

export function parseLock(text: string): Lock {
  const doc = parseDocument(text, { prettyErrors: false, uniqueKeys: true });
  if (doc.errors.length > 0) throw new LockError(doc.errors.map((error) => ({ rule: "yaml", message: error.message })));
  return parseLockValue(doc.toJS());
}

/** Read `spex.lock`; null where there is none. */
export async function readLock(file: string): Promise<Lock | null> {
  if (!existsSync(file)) return null;
  return parseLock(await readFile(file, "utf8"));
}

/** Write `spex.lock` atomically, no folder made; returns the bytes
 * written. Given the version the writer read, the write is refused as a
 * conflict where the lock changed meanwhile (DR-111). */
export async function writeLock(file: string, lock: Lock, expected?: FileVersion): Promise<string> {
  const text = serializeLock(lock);
  if (expected === undefined) writeApplicationBytes(file, text);
  else writeVersionedBytes(file, text, expected);
  return text;
}

/** The `requires` a path source's manifest states, as the lock keeps it. */
export function manifestRequires(manifest: Manifest): Record<string, string[]> {
  const requires: Record<string, string[]> = {};
  for (const id of Object.keys(manifest.artifacts).sort()) {
    const list = manifest.artifacts[id]!.requires;
    if (list.length > 0) requires[id] = [...list];
  }
  return requires;
}

const canonical = (value: unknown): string => JSON.stringify(value, (_key, inner: unknown) =>
  isPlainObject(inner) ? Object.fromEntries(Object.keys(inner).sort().map((key) => [key, inner[key]])) : inner);

export type Staleness = { stale: false } | { stale: true; reasons: string[] };

/** Whether a lock no longer stands (environments-7): its `requests`
 * digest no longer matches `spex.yaml`, or a path source's manifest no
 * longer states the version, dependencies and `requires` it recorded or
 * lacks an artifact it selected. A path source missing on this device
 * (`null`) is missing, not stale. */
export function lockStaleness(
  lock: Lock,
  requestsText: string | null,
  pathSources: (path: string) => Manifest | null,
): Staleness {
  const reasons: string[] = [];
  if (requestsText === null) reasons.push("spex.yaml is missing");
  else if (requestsDigest(requestsText) !== lock.requests) reasons.push("spex.yaml changed since the lock was resolved");
  for (const name of Object.keys(lock.packages).sort()) {
    const resolution = lock.packages[name]!;
    const source = resolution.source;
    if (!isPathSource(source)) continue;
    let manifest: Manifest | null;
    try {
      manifest = pathSources(source.path);
    } catch (error) {
      reasons.push(`${name} at ${source.path} no longer reads as a release: ${(error as Error).message}`);
      continue;
    }
    if (manifest === null) continue;
    if (`${manifest.org}/${manifest.name}` !== name) reasons.push(`${name} at ${source.path} is now ${manifest.org}/${manifest.name}`);
    if (manifest.version !== source.version) reasons.push(`${name} at ${source.path} changed version from ${source.version} to ${manifest.version}`);
    if (canonical(manifest.dependencies) !== canonical(source.dependencies)) reasons.push(`${name} at ${source.path} changed its dependencies`);
    if (canonical(manifestRequires(manifest)) !== canonical(source.requires)) reasons.push(`${name} at ${source.path} changed what its artifacts require`);
    for (const id of Object.keys(resolution.artifacts).sort()) {
      if (!manifest.artifacts[id]) reasons.push(`${name} at ${source.path} no longer holds the selected artifact ${id}`);
    }
  }
  return reasons.length > 0 ? { stale: true, reasons } : { stale: false };
}

/** A content digest of the lock's bytes, for comparing two locks. */
export function lockDigest(lock: Lock): string {
  return sha256Hex(serializeLock(lock));
}
