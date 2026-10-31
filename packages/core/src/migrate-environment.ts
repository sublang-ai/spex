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
  /** Durable plans survive both partial publication and retirement. */
  pending?: EnvironmentPlan[];
  complete: boolean;
}


export interface EnvironmentPlan {
  key: string;
  clone: string;
  root: string;
  outcome: "moved" | "folder" | "own";
  phase: "writing" | "retiring";
  sources: { path: string; before: FileVersion }[];
  files: { path: string; before: FileVersion; after: FileVersion; retained: string | null }[];
}

export interface EnvironmentMigrationOptions {
  report?: (key: string, blocked: boolean) => void;
  /** A durable boundary, also usable by a process-interruption harness. */
  checkpoint?: (point: "planned" | "written" | "retired", key: string, path?: string) => void;
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
    // An unreadable journal must never turn our partial destination into
    // an apparently reader-owned environment on retry.
    const value = readJsonFile(file);
    if (isObject(value) && value.kind === "environment") {
      validateReceipt(value);
      return { receipt: value as unknown as EnvironmentReceipt, dir: join(migrations, id) };
    }
  }
  return undefined;
}

function validateReceipt(value: Record<string, unknown>): void {
  const version = (held: unknown): boolean => held === null || typeof held === "string" && /^[a-f0-9]{64}$/.test(held);
  function fail(): never { throw new Error("unsupported or damaged environment migration journal; original files preserved"); }
  if (value.format !== 1 || typeof value.id !== "string" || typeof value.complete !== "boolean"
    || !Array.isArray(value.inputs) || !value.inputs.every((file) => isObject(file) && typeof file.path === "string" && typeof file.sha256 === "string" && version(file.sha256))
    || !Array.isArray(value.steps) || !value.steps.every((step) => isObject(step) && typeof step.key === "string" && ["own", "project"].includes(String(step.step)) && ["own", "folder", "moved"].includes(String(step.outcome)))) fail();
  if (value.pending === undefined) {
    if (!value.complete) fail();
    return; // Completed pre-journal receipts remain readable.
  }
  if (!Array.isArray(value.pending)) fail();
  for (const plan of value.pending as unknown[]) {
    if (!isObject(plan) || typeof plan.key !== "string" || typeof plan.clone !== "string" || !isAbsolute(plan.clone)
      || typeof plan.root !== "string" || !isAbsolute(plan.root) || !["own", "folder", "moved"].includes(String(plan.outcome))
      || !["writing", "retiring"].includes(String(plan.phase)) || !Array.isArray(plan.sources) || !Array.isArray(plan.files)) fail();
    const sources = plan.sources as unknown[];
    const files = plan.files as unknown[];
    const clone = plan.clone as string, root = plan.root as string;
    if (sources.length !== (plan.outcome === "own" ? 0 : 2) || !sources.every((source, index) => isObject(source) && source.path === join(clone, FILES[index]!) && version(source.before))) fail();
    if (files.length !== 2 || !files.every((file, index) => isObject(file) && file.path === join(root, FILES[index]!) && version(file.before) && version(file.after)
      && (file.after === null ? file.retained === null : typeof file.retained === "string" && /^inputs\/\d+$/.test(file.retained)))) fail();
  }
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
export function migrateEnvironments(home: string, repositories: readonly MigratedRepository[], options: EnvironmentMigrationOptions = {}): string[] {
  let found = findReceipt(home);
  const planFor = (repository: MigratedRepository): EnvironmentPlan | undefined => found?.receipt.pending?.find((plan) =>
    plan.key === repository.key || plan.root === (repository.own ? repository.clone : repository.folder));
  const todo = repositories.filter((repository) => planFor(repository) || pending(repository, found?.receipt));
  for (const repository of repositories) if (!todo.includes(repository)) options.report?.(repository.key, false);
  if (todo.length === 0) return [];
  if (!found) {
    const id = randomUUID();
    const dir = join(migrationsDir(home), id);
    mkdirSync(join(dir, "inputs"), { recursive: true, mode: 0o700 });
    found = { receipt: { format: 1, id, kind: "environment", inputs: [], steps: [], pending: [], complete: false }, dir };
  }
  const { receipt, dir } = found;
  receipt.pending ??= [];
  mkdirSync(join(dir, "inputs"), { recursive: true, mode: 0o700 });
  receipt.complete = false;
  const save = (): void => writeApplicationFile(join(dir, "receipt.json"), receipt);
  save();
  const keep = (file: string, bytes: Buffer): string => {
    const rel = relative(home, file);
    const path = rel !== "" && !rel.startsWith("..") && !isAbsolute(rel) ? rel.split("\\").join("/") : file;
    const retained = `inputs/${receipt.inputs.length}`;
    writeApplicationBytes(join(dir, retained), bytes);
    receipt.inputs.push({ path, sha256: sha256(bytes) });
    save();
    return retained;
  };
  const changed: string[] = [];
  for (const repository of todo) {
    options.report?.(repository.key, true);
    try {
      let plan = planFor(repository);
      if (!plan) {
        plan = planRepository(repository, receipt, keep);
        receipt.pending.push(plan);
        save(); // All planned bytes and versions stand before any publication.
        options.checkpoint?.("planned", repository.key);
      }
      if (plan.clone !== repository.clone || plan.root !== (repository.own ? repository.clone : repository.folder)) {
        throw new Error("environment migration binding changed; original files preserved");
      }
      finishPlan(plan, dir, save, options, repository.key);
      receipt.steps.push({ step: plan.outcome === "own" ? "own" : "project", key: repository.key, outcome: plan.outcome });
      receipt.pending = receipt.pending.filter((held) => held !== plan);
      save();
      changed.push(repository.key);
      options.report?.(repository.key, false);
    } catch (error) {
      receipt.complete = false;
      save();
      console.error(`spex: the environment of ${repository.key} did not move: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  receipt.complete = receipt.pending.length === 0 && todo.every((repository) => changed.includes(repository.key));
  save();
  return changed;
}

type Keep = (file: string, bytes: Buffer) => string;
const read = (file: string): { bytes: Buffer | null; version: FileVersion } => readVersioned(file);

/** Capture both files, even an unchanged or absent one, so a retry cannot
 * mistake our partial publication for the reader's existing environment. */
function planRepository(repository: MigratedRepository, receipt: EnvironmentReceipt, keep: Keep): EnvironmentPlan {
  const root = repository.own ? repository.clone : repository.folder!;
  const source = FILES.map((name) => ({ path: join(repository.clone, name), ...read(join(repository.clone, name)) }));
  const outcome = repository.own ? "own" : holdsFiles(root) ? "folder" : "moved";
  const destination = FILES.map((name) => ({ path: join(root, name), ...read(join(root, name)) }));
  let texts = (outcome === "moved" ? source : destination).map((file) => file.bytes?.toString("utf8") ?? null);
  const done = receipt.steps.some((entry) => entry.step === "own" && entry.key === repository.key);
  if (texts[0] !== null && repository.instance !== null && !(repository.own && done)) {
    const named = withSpace(texts[0]!, texts[1]!, repository.instance);
    if (named) texts = [named.requests, named.lock];
  }
  for (const file of [...source, ...destination]) if (file.bytes !== null) keep(file.path, file.bytes);
  return {
    key: repository.key, clone: repository.clone, root, outcome, phase: "writing",
    sources: repository.own ? [] : source.map((file) => ({ path: file.path, before: file.version })),
    files: destination.map((file, index) => {
      const text = texts[index]!;
      return { path: file.path, before: file.version, after: text === null ? null : sha256(text), retained: text === null ? null : keep(file.path, Buffer.from(text)) };
    }),
  };
}

/** Validate the whole pair before any retry write or source retirement. */
function finishPlan(plan: EnvironmentPlan, dir: string, save: () => void, options: EnvironmentMigrationOptions, key: string): void {
  const planned = plan.files.map((file) => {
    const bytes = file.retained === null ? null : read(join(dir, file.retained)).bytes;
    if ((bytes === null ? null : sha256(bytes)) !== file.after) throw new Error("retained environment plan changed; source preserved");
    const current = read(file.path);
    if (current.version !== file.after && (plan.phase !== "writing" || current.version !== file.before)) {
      throw new Error(`${file.path}: migration destination diverged; preserved unchanged`);
    }
    return { file, bytes, current };
  });
  const verifySources = (): void => {
    for (const source of plan.sources) {
      const current = read(source.path).version;
      if (current !== source.before && !(plan.phase === "retiring" && current === null)) {
        throw new Error(`${source.path}: migration source changed; preserved unchanged`);
      }
    }
  };
  verifySources();
  for (const { file, bytes, current } of planned) {
    if (current.version === file.after) continue;
    if (bytes === null) throw new Error("invalid environment plan deletion");
    writeVersionedBytes(file.path, bytes, file.before, 0o644);
    options.checkpoint?.("written", key, file.path);
  }
  for (const file of plan.files) if (read(file.path).version !== file.after) throw new Error(`${file.path}: migration destination changed; source preserved`);
  verifySources();
  plan.phase = "retiring";
  save(); // Missing source members are accepted only after this boundary.
  const lock = planned.find(({ file }) => file.path === join(plan.root, "spex.lock"))?.bytes?.toString("utf8") ?? null;
  if (plan.outcome === "folder") {
    for (const tree of FORMER_TREES) rmSync(join(plan.clone, tree), { recursive: true, force: true });
  } else moveTrees(plan.clone, plan.root, lock);
  for (const source of plan.sources) {
    verifySources();
    rmSync(source.path, { force: true });
    options.checkpoint?.("retired", key, source.path);
  }
}

/** The home's environment receipt, where one stands. */
export function environmentReceipt(home: string): EnvironmentReceipt | undefined {
  return findReceipt(home)?.receipt;
}
