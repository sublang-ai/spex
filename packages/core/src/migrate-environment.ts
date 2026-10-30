// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The environment migration (storage-24, DR-113, DR-165): a project's
// `spex.yaml` and `spex.lock` move from its clone into its working
// folder, the folder's own files standing where it holds either, and
// the former installed trees under the clone — `packages/` with its
// install record and `skills/` — move under the environment's root's
// `.spex/` where the record matches the lock, else are deleted for the
// lock to install from the store. A file moved or standing without
// `space` gains it naming the clone's placement's instance. Your own
// group's clone keeps its two files. It runs under the root lease at
// the core's start and at each pairing, leaving one receipt of kind
// `environment` under `local/migrations/`, as the groups migration does
// (storage-9); a restart repeats nothing, since a clone it moved holds
// none of the files that start it.

import { randomUUID } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { join, relative, isAbsolute } from "node:path";
import { parseDocument } from "yaml";

import { isObject, readJsonFile, readVersioned, sha256, writeApplicationBytes, writeApplicationFile, writeVersionedBytes, type FileVersion } from "@sublang/spex/files";
import {
  ensureSpexDir,
  installedDir,
  installedPackages,
  isPathSource,
  parseLock,
  parseRequests,
  requestsDigest,
  serializeLock,
  setSpaceIn,
  skillsDir,
  type Lock,
} from "@sublang/spex/environment";
import { canonicalOrigin } from "@sublang/spex/instance";

export interface EnvironmentReceipt {
  format: 1;
  id: string;
  kind: "environment";
  /** Each file the migration moved, rewrote or deleted, its original
   * bytes kept under `inputs/<n>` beside the receipt. */
  inputs: { path: string; sha256: string }[];
  /** One entry per spex repository migrated: its key and what was done. */
  steps: { step: "project" | "own"; key: string; outcome: "moved" | "folder" | "own" }[];
  complete: boolean;
}

/** A spex repository as the migration sees it. */
export interface MigratedRepository {
  key: string;
  /** Its clone. */
  clone: string;
  /** Your own group's, which keeps its two files. */
  own: boolean;
  /** A project's working folder on this device; null where none is
   * paired. */
  folder: string | null;
  /** The instance its clone is placed at (storage-31) — your own
   * group's, the one its own repository's remote names; null for one
   * local only. */
  instance: string | null;
}

const FILES = ["spex.yaml", "spex.lock"] as const;
const FORMER_TREES = ["packages", "skills"] as const;

function migrationsDir(home: string): string { return join(home, "local", "migrations"); }

/** The home's environment receipt, where one stands. */
function findReceipt(home: string): { receipt: EnvironmentReceipt; dir: string } | undefined {
  const migrations = migrationsDir(home);
  if (!existsSync(migrations)) return undefined;
  for (const id of readdirSync(migrations).sort()) {
    const file = join(migrations, id, "receipt.json");
    if (!existsSync(file)) continue;
    let value: unknown;
    try { value = readJsonFile(file); } catch { continue; }
    if (isObject(value) && value.kind === "environment" && Array.isArray(value.inputs) && Array.isArray(value.steps)) {
      return { receipt: value as unknown as EnvironmentReceipt, dir: join(migrations, id) };
    }
  }
  return undefined;
}

/** Whether a folder stands at `path`. */
function isFolder(path: string): boolean {
  try { return statSync(path).isDirectory(); } catch { return false; }
}

/** Whether a clone holds either environment file. */
function holdsFiles(dir: string): boolean {
  return FILES.some((file) => existsSync(join(dir, file)));
}

/** Whether a clone holds a former installed tree. */
function holdsTrees(dir: string): boolean {
  return FORMER_TREES.some((tree) => existsSync(join(dir, tree)));
}

/** Whether a repository has work the migration does. */
function pending(repository: MigratedRepository, receipt: EnvironmentReceipt | undefined): boolean {
  if (repository.own) {
    return holdsTrees(repository.clone)
      || (repository.instance !== null && !receipt?.steps.some((entry) => entry.step === "own" && entry.key === repository.key) && lacksSpace(repository.clone));
  }
  return repository.folder !== null && isFolder(repository.folder) && holdsFiles(repository.clone);
}

/** Whether a root's `spex.yaml` stands and names no `space`. */
function lacksSpace(root: string): boolean {
  const { bytes } = readVersioned(join(root, "spex.yaml"));
  if (bytes === null) return false;
  try { return parseRequests(bytes.toString("utf8")).space === undefined; } catch { return false; }
}

/** `spex.yaml`'s text naming `space` as `instance`, and the lock following
 * its bytes where the lock matched the text before (environments-2): an
 * environment placed before `space` existed keeps resolving there, its
 * lock as current as it was. Null where nothing changes. */
function withSpace(requests: string, lock: string | null, instance: string): { requests: string; lock: string | null } | null {
  let space: string | undefined;
  try { space = parseRequests(requests).space; } catch { return null; }
  if (space !== undefined) return null;
  const doc = parseDocument(requests);
  setSpaceIn(doc, canonicalOrigin(instance));
  const next = doc.toString({ lineWidth: 0 });
  try { parseRequests(next); } catch { return null; }
  let nextLock = lock;
  if (lock !== null) {
    try {
      const parsed = parseLock(lock);
      if (parsed.requests === requestsDigest(requests)) nextLock = serializeLock({ ...parsed, requests: requestsDigest(next) });
    } catch { /* a lock that does not read stays as it is */ }
  }
  return { requests: next, lock: nextLock };
}

/** Move a folder, across file systems by a copy keeping links as they are. */
function moveFolder(from: string, to: string): void {
  try {
    renameSync(from, to);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
    cpSync(from, to, { recursive: true, verbatimSymlinks: true, errorOnExist: true, force: false });
    rmSync(from, { recursive: true, force: true });
  }
}

/** Every registry and Git source of a lock installed under the root's
 * `.spex/` as the lock locks it, its install record matching. */
function installedWhole(root: string, lock: Lock): boolean {
  const installed = installedPackages(root, lock);
  return Object.entries(lock.packages).every(([name, resolution]) => isPathSource(resolution.source) || installed.has(name));
}

/** The former trees of a clone under the root's `.spex/` (storage-24):
 * moved where the root holds none and the moved record matches the
 * lock, so nothing is fetched; else deleted, the lock installing from
 * the store at the next install (environments-7). */
function moveTrees(clone: string, root: string, lockText: string | null): void {
  if (!holdsTrees(clone)) return;
  let lock: Lock | null = null;
  try { lock = lockText === null ? null : parseLock(lockText); } catch { lock = null; }
  const target = installedDir(root);
  const skills = skillsDir(root);
  if (lock !== null && !existsSync(target)) {
    ensureSpexDir(root);
    if (existsSync(join(clone, "packages"))) moveFolder(join(clone, "packages"), target);
    if (existsSync(join(clone, "skills")) && !existsSync(skills)) moveFolder(join(clone, "skills"), skills);
    if (!existsSync(target) || !installedWhole(root, lock)) {
      rmSync(target, { recursive: true, force: true });
      rmSync(skills, { recursive: true, force: true });
    }
  }
  for (const tree of FORMER_TREES) rmSync(join(clone, tree), { recursive: true, force: true });
}

/**
 * Run the environment migration over the repositories given
 * (storage-24): each project's clone holding `spex.yaml` or `spex.lock`
 * whose working folder stands on this device, and your own group's
 * clone. Returns the keys whose environments it changed. A repository
 * whose step fails is left as it stood, reported, the others going on.
 */
export function migrateEnvironments(home: string, repositories: readonly MigratedRepository[]): string[] {
  let found = findReceipt(home);
  const todo = repositories.filter((repository) => pending(repository, found?.receipt));
  if (todo.length === 0) return [];
  if (!found) {
    const id = randomUUID();
    const dir = join(migrationsDir(home), id);
    mkdirSync(join(dir, "inputs"), { recursive: true, mode: 0o700 });
    found = { receipt: { format: 1, id, kind: "environment", inputs: [], steps: [], complete: false }, dir };
  }
  const { receipt, dir } = found;
  mkdirSync(join(dir, "inputs"), { recursive: true, mode: 0o700 });
  receipt.complete = false;
  const save = (): void => writeApplicationFile(join(dir, "receipt.json"), receipt);
  save();
  // Each file's original bytes kept before it changes (storage-9).
  const keep = (file: string, bytes: Buffer): void => {
    const rel = relative(home, file);
    const path = rel !== "" && !rel.startsWith("..") && !isAbsolute(rel) ? rel.split("\\").join("/") : file;
    writeApplicationBytes(join(dir, "inputs", String(receipt.inputs.length)), bytes);
    receipt.inputs.push({ path, sha256: sha256(bytes) });
    save();
  };
  const changed: string[] = [];
  for (const repository of todo) {
    try {
      if (repository.own) migrateOwn(repository, receipt, keep);
      else migrateProject(repository, receipt, keep);
      changed.push(repository.key);
      save();
    } catch (error) {
      console.error(`spex: the environment of ${repository.key} did not move: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  receipt.complete = true;
  save();
  return changed;
}

type Keep = (file: string, bytes: Buffer) => void;

/** A file's bytes with their version; null bytes where absent. */
const read = (file: string): { bytes: Buffer | null; version: FileVersion } => readVersioned(file);

/** A project's environment into its working folder (storage-24). */
function migrateProject(repository: MigratedRepository, receipt: EnvironmentReceipt, keep: Keep): void {
  const folder = repository.folder!;
  const clone = repository.clone;
  const cloneFiles = { yaml: read(join(clone, "spex.yaml")), lock: read(join(clone, "spex.lock")) };
  for (const [name, file] of [["spex.yaml", cloneFiles.yaml], ["spex.lock", cloneFiles.lock]] as const) {
    if (file.bytes !== null) keep(join(clone, name), file.bytes);
  }
  const folderHolds = FILES.some((name) => existsSync(join(folder, name)));
  let outcome: "moved" | "folder";
  if (!folderHolds) {
    // The clone's files move to the folder's root, naming the clone's
    // instance as `space` where they name none.
    let yaml = cloneFiles.yaml.bytes?.toString("utf8") ?? null;
    let lock = cloneFiles.lock.bytes?.toString("utf8") ?? null;
    if (yaml !== null && repository.instance !== null) {
      const named = withSpace(yaml, lock, repository.instance);
      if (named) ({ requests: yaml, lock } = named);
    }
    // Written only where the folder still holds none (DR-111).
    if (yaml !== null) writeVersionedBytes(join(folder, "spex.yaml"), yaml, null, 0o644);
    if (lock !== null) writeVersionedBytes(join(folder, "spex.lock"), lock, null, 0o644);
    moveTrees(clone, folder, lock);
    outcome = "moved";
  } else {
    // The folder's own files stand, gaining `space` where they name
    // none; the clone's are dropped with its trees.
    const own = { yaml: read(join(folder, "spex.yaml")), lock: read(join(folder, "spex.lock")) };
    if (own.yaml.bytes !== null && repository.instance !== null) {
      const text = own.yaml.bytes.toString("utf8");
      const lockText = own.lock.bytes?.toString("utf8") ?? null;
      const named = withSpace(text, lockText, repository.instance);
      if (named) {
        keep(join(folder, "spex.yaml"), own.yaml.bytes);
        writeVersionedBytes(join(folder, "spex.yaml"), named.requests, own.yaml.version, 0o644);
        if (named.lock !== null && named.lock !== lockText) {
          keep(join(folder, "spex.lock"), own.lock.bytes!);
          writeVersionedBytes(join(folder, "spex.lock"), named.lock, own.lock.version, 0o644);
        }
      }
    }
    for (const tree of FORMER_TREES) rmSync(join(clone, tree), { recursive: true, force: true });
    outcome = "folder";
  }
  // The deletion from the clone is a local change its next sync carries
  // (storage-24, space-7).
  for (const name of FILES) rmSync(join(clone, name), { force: true });
  receipt.steps.push({ step: "project", key: repository.key, outcome });
}

/** Your own group's environment stays in its clone (storage-24):
 * `space` named where it lacks one, the former trees under its `.spex/`. */
function migrateOwn(repository: MigratedRepository, receipt: EnvironmentReceipt, keep: Keep): void {
  const clone = repository.clone;
  const lock = read(join(clone, "spex.lock"));
  let lockText = lock.bytes?.toString("utf8") ?? null;
  const done = receipt.steps.some((entry) => entry.step === "own" && entry.key === repository.key);
  if (!done && repository.instance !== null) {
    const yaml = read(join(clone, "spex.yaml"));
    if (yaml.bytes !== null) {
      const named = withSpace(yaml.bytes.toString("utf8"), lockText, repository.instance);
      if (named) {
        keep(join(clone, "spex.yaml"), yaml.bytes);
        writeVersionedBytes(join(clone, "spex.yaml"), named.requests, yaml.version, 0o644);
        if (named.lock !== null && named.lock !== lockText) {
          keep(join(clone, "spex.lock"), lock.bytes!);
          writeVersionedBytes(join(clone, "spex.lock"), named.lock, lock.version, 0o644);
          lockText = named.lock;
        }
      }
    }
  }
  moveTrees(clone, clone, lockText);
  if (!done && repository.instance !== null) receipt.steps.push({ step: "own", key: repository.key, outcome: "own" });
}

/** The home's environment receipt, where one stands. */
export function environmentReceipt(home: string): EnvironmentReceipt | undefined {
  return findReceipt(home)?.receipt;
}
