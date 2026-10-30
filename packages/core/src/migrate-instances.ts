// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The instances migration (DR-127): a home whose `home.yaml` names one
// Git host, in format 1, becomes a home recording every instance by its
// origin, in format 2, every clone at that instance moved under its
// folder. It runs once under the root lease before any writer is
// admitted, as the groups migration does, leaving a receipt under
// `local/migrations/`; each step is verified, and a restart finishes
// what remains without overwriting a destination that diverged. A clone
// a session's lease holds where it stands is deferred: it keeps its key
// until the next sync or the next start moves it. Nothing at any
// instance changes, so each device migrates on its own.

import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, type Dirent } from "node:fs";
import { dirname, join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { heldSessionLease, occupied, pruneEmptyFolders } from "./clone-moves.js";
import {
  closed, isObject, isText, need, readJsonFile, sha256, StorageFormatError, writeApplicationBytes, writeApplicationFile,
} from "@sublang/spex/files";
import {
  CLIENT_ID, Home, HOME_FILE, invalidHome, isRepositoryKey, notAnOrigin, parseHomeFile, WORKSPACE, WORKSPACE_DEPTH, type HomeAccount, type HomeFile,
} from "./home.js";
import { i18n } from "./i18n.js";
import { canonicalOrigin, instanceFolder, instanceSegmentOf, isInstanceFolder, OriginRefused } from "@sublang/spex/instance";
import { type ConfigRun, LEGACY_ID_KEY, moveLegacyIds } from "./placements.js";
import { gitEnvironment } from "./storage-git.js";

export interface InstancesReceipt {
  format: 1;
  id: string;
  kind: "instances";
  /** Each input as it stood when the migration began: its digest, and
   * whether its bytes are kept under the receipt — a credential's never
   * are. */
  inputs: { path: string; sha256: string; kept: boolean }[];
  steps: Record<string, unknown>[];
  /** Clones whose move a session lease naming a live writer refused, by
   * the key they keep and the key they move to. */
  deferred: { from: string; to: string }[];
  complete: boolean;
}

/** A clone the migration moves under its instance's folder, or whose
 * remote alone it renames: by the key it has and the key it takes —
 * one key for your own group's own repository, which keeps its folder —
 * whether its remote, the host's, takes the instance's folder's name,
 * and the clone it was when planned: the host's id it records, and its
 * remote's URL, each null where it had none. */
interface CloneMove { from: string; to: string; remote: boolean; id: string | null; url: string | null }

/** A clone the migration deferred (DR-127): the key it keeps, the key
 * it moves to, and the clone it was when planned, so a move made later
 * moves that clone alone, never another made at its key since. */
export interface DeferredMove { from: string; to: string; id: string | null; url: string | null }

/** The clones step as the receipt records it: the instance's folder,
 * every move planned before the first is made, and the moves done. */
interface ClonesStep { step: "clones"; folder: string; moves: CloneMove[]; done: string[] }

/** The preferences and the forge cache, re-keyed for each moved clone. */
const PREFS = "local/prefs.json";
const FORGE_CACHE = "local/forge-cache.json";
/** The files the migration rewrites, their original bytes kept. */
const KEPT = [HOME_FILE, PREFS, FORGE_CACHE];
/** The app tokens, re-keyed with `home.yaml`, recorded by digest alone. */
const CREDENTIALS = "local/credentials.yaml";

function migrationsDir(root: string): string { return join(root, "local", "migrations"); }

/** Every instances receipt under `local/migrations/`, in order. */
function instancesReceipts(root: string): { receipt: InstancesReceipt; dir: string }[] {
  const migrations = migrationsDir(root);
  if (!existsSync(migrations)) return [];
  const found: { receipt: InstancesReceipt; dir: string }[] = [];
  for (const id of readdirSync(migrations).sort()) {
    const file = join(migrations, id, "receipt.json");
    if (!existsSync(file)) continue;
    let value: unknown;
    try { value = readJsonFile(file); } catch { continue; }
    if (isObject(value) && value.kind === "instances" && typeof value.complete === "boolean" && Array.isArray(value.deferred)) {
      found.push({ receipt: value as unknown as InstancesReceipt, dir: join(migrations, id) });
    }
  }
  return found;
}

/** The clone directory a key names under the home's `workspace/`. */
function clonePathOf(root: string, key: string): string {
  return join(root, WORKSPACE, ...key.split("/"));
}

/** Whether a directory stands at a path, never through a link, as the
 * store's walk finds a clone. */
function standsAsDirectory(path: string): boolean {
  try { return lstatSync(path).isDirectory(); } catch { return false; }
}

/** The receipt a run resumes: one interrupted, else a complete one
 * whose deferred clone still stands at the key it kept. */
function findPendingReceipt(root: string): { receipt: InstancesReceipt; dir: string } | undefined {
  const receipts = instancesReceipts(root);
  return receipts.find((found) => !found.receipt.complete)
    ?? receipts.find((found) => found.receipt.deferred.some((move) => standsAsDirectory(clonePathOf(root, move.from))));
}

/** Whether the home must take the instances migration before writers
 * are admitted: `home.yaml` in format 1, a migration interrupted, or a
 * clone it deferred still standing at the key it kept. */
export function needsInstancesMigration(root: string): boolean {
  if (findPendingReceipt(root)) return true;
  let value: unknown;
  try { value = parseYaml(readFileSync(Home.file(root), "utf8")); } catch { return false; }
  return isObject(value) && value.format === 1;
}

/** The planned move of a clone in a receipt's clones step, where it
 * records one. */
function plannedMove(receipt: InstancesReceipt, from: string): CloneMove | undefined {
  const clones = receipt.steps.find((entry) => entry.step === "clones");
  const moves = clones && Array.isArray(clones.moves) ? clones.moves as unknown[] : [];
  return moves.find((move): move is CloneMove => isObject(move) && move.from === from);
}

/** The clones the migration deferred, each by the key it keeps, the key
 * it moves to and the clone it was, while it still stands at the key it
 * kept (DR-127). */
export function deferredMoves(root: string): DeferredMove[] {
  const moves = new Map<string, DeferredMove>();
  for (const { receipt } of instancesReceipts(root)) {
    for (const move of receipt.deferred) {
      if (isRepositoryKey(move.from) && isRepositoryKey(move.to) && standsAsDirectory(clonePathOf(root, move.from))) {
        const planned = plannedMove(receipt, move.from);
        const text = (value: unknown): string | null => typeof value === "string" ? value : null;
        moves.set(move.from, { from: move.from, to: move.to, id: text(planned?.id), url: text(planned?.url) });
      }
    }
  }
  return [...moves.values()];
}

/** Whether the clone standing at a deferred move's key is the one the
 * migration deferred (DR-127): the host's id it recorded, else — it
 * recorded none — its remote's URL, none where it had no remote. A
 * clone made at that key since is another, and never moved. */
export function isDeferredClone(move: Pick<DeferredMove, "id" | "url">, recorded: { id: string | null; url: string | null }): boolean {
  return move.id !== null ? recorded.id === move.id : recorded.id === null && recorded.url === move.url;
}

/** Deferred clones moved or removed since by the store, or found to be
 * another clone at their key: the receipt no longer names them, so no
 * later start moves what stands at the key they kept. */
export function settleDeferred(root: string, keys: readonly string[]): void {
  for (const { receipt, dir } of instancesReceipts(root)) {
    const deferred = receipt.deferred.filter((move) => !keys.includes(move.from));
    if (deferred.length !== receipt.deferred.length) writeApplicationFile(join(dir, "receipt.json"), { ...receipt, deferred });
  }
}

const divergedDestination = (): string =>
  i18n._({ id: "migration destination diverged; preserved unchanged",
    comment: "Migration diagnostic: the file changed under the migration, which wrote nothing" });

const invalidReceipt = (): string =>
  i18n._({ id: "invalid migration receipt or retained input",
    comment: "Migration diagnostic: the kept original no longer matches its receipt" });

function readIfAny(file: string): Buffer | null {
  try { return readFileSync(file); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new StorageFormatError(file, (error as Error).message);
  }
}

/** `home.yaml` in format 1: one host, with the account signed in there. */
interface FormerHome {
  format: 1;
  device: unknown;
  host: { url: string; clientId: string; account?: HomeAccount; signedOut?: boolean };
  own: unknown;
  folders: unknown;
}

/** The format-1 fields the migration reads; the rest is verified in the
 * format-2 file it becomes. */
function parseFormerHome(bytes: Buffer, file: string): FormerHome {
  let value: unknown;
  try { value = parseYaml(bytes.toString("utf8")); }
  catch (error) { throw new StorageFormatError(file, (error as Error).message); }
  need(isObject(value) && value.format === 1, file, invalidHome());
  closed(value, ["format", "device", "host", "own", "folders"], [], file);
  closed(value.host, ["url", "clientId"], ["account", "signedOut"], file);
  need(isText(value.host.url) && value.host.clientId === CLIENT_ID &&
    (value.host.signedOut === undefined || typeof value.host.signedOut === "boolean"), file, invalidHome());
  return value as unknown as FormerHome;
}

/** The URL a former credential store keyed the host's token by. */
function formerKey(url: string): string {
  return url.replace(/\/+$/, "");
}

/** The credentials file with the home's token moved from its former key
 * to the instance's origin, the home's own token standing over any entry
 * already there; null where it moves nothing, or the file is not one the
 * credential store reads, which leaves it as it is and reports it. */
function rekeyedCredentials(bytes: Buffer, from: string, to: string): Buffer | null {
  if (from === to) return null;
  let doc: unknown;
  try { doc = parseYaml(bytes.toString("utf8")); } catch { return null; }
  if (!isObject(doc) || doc.format !== 1 || !isObject(doc.hosts) || !Object.hasOwn(doc.hosts, from)) return null;
  const hosts: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(doc.hosts)) {
    if (key === to) continue;
    hosts[key === from ? to : key] = value;
  }
  return Buffer.from(stringifyYaml({ format: 1, hosts }));
}

/** Every clone under `workspace/` outside the instances' folders, as
 * the store's walk finds one: a folder whose path is a key of up to
 * WORKSPACE_DEPTH segments, inside plain folders, never through a link. */
function cloneKeys(home: Home): string[] {
  const keys: string[] = [];
  const walk = (dir: string, depth: number): void => {
    if (depth >= WORKSPACE_DEPTH) return;
    let entries: Dirent[];
    try { entries = readdirSync(dir, { withFileTypes: true }); }
    catch (error) {
      if (["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) return;
      throw error;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".") || (depth === 0 && isInstanceFolder(entry.name))) continue;
      const path = join(dir, entry.name);
      const key = home.keyOf(path);
      if (key) keys.push(key);
      else walk(path, depth + 1);
    }
  };
  walk(home.workspace, 0);
  return keys.sort();
}

/** One Git command in a clone, read whole; a Git that cannot run reads
 * as a failed command. */
function gitIn(dir: string, args: string[], env: NodeJS.ProcessEnv): { ok: boolean; stdout: string; stderr: string } {
  const run = spawnSync("git", ["-C", dir, ...args], { env: gitEnvironment(env), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30_000 });
  return { ok: !run.error && run.status === 0, stdout: run.stdout ?? "", stderr: run.stderr ?? (run.error?.message ?? "") };
}

/** The host's id a clone before DR-127 records at the top level of its
 * Git configuration — which a join, a creation or a check by that Spex
 * wrote, the host's remote with it — and the URL of the remote it
 * synced through, `origin`; each null where it has none. */
function cloneIdentity(dir: string, env: NodeJS.ProcessEnv): { id: string | null; url: string | null } {
  const value = (key: string): string | null => {
    const read = gitIn(dir, ["config", "--get", key], env);
    const text = read.ok ? read.stdout.trim() : "";
    return text.length > 0 ? text : null;
  };
  return { id: value(LEGACY_ID_KEY), url: value("remote.origin.url") };
}

/** The host's remote takes the instance's folder's name: one still
 * named `origin` is renamed, its fetched `spex` and its upstream with it,
 * where no remote bears that name already. The host's id and the core's
 * creation mark the clone records at the top level, which a Spex before
 * DR-127 recorded beside that remote, move into its section in the same
 * step, first, so the rename carries them (storage-34); a restart after
 * the rename moves them into the folder's remote. A rename Git refuses
 * leaves `origin`, through which the clone still syncs, its id in its
 * section, and is reported. */
function nameRemoteBy(dir: string, folder: string, env: NodeJS.ProcessEnv): void {
  const read = gitIn(dir, ["config", "-z", "--get-regexp", "^remote\\..+\\.url$"], env);
  const names = read.ok ? read.stdout.split("\0").map((entry) => entry.split("\n", 1)[0]).filter((key) => key.startsWith("remote.") && key.endsWith(".url"))
    .map((key) => key.slice("remote.".length, -".url".length)) : [];
  const run: ConfigRun = (args) => gitIn(dir, args, env);
  const report = (): void => console.error(`spex: the host's id of ${dir} stays where it was recorded`);
  if (names.includes("origin") && !names.includes(folder)) {
    if (!moveLegacyIds(run, "origin")) report();
    const renamed = gitIn(dir, ["remote", "rename", "origin", folder], env);
    if (!renamed.ok) console.error(`spex: the remote of ${dir} keeps its name: ${renamed.stderr.trim()}`);
  } else if (names.includes(folder) && !moveLegacyIds(run, folder)) report();
}

/** What the migration does with each clone (DR-127): your own group's
 * own repository, recording the host's id, renames its remote and keeps
 * its folder; any other clone recording it moves under the instance's
 * folder at its key — its path there, which a Spex before DR-127 kept
 * it at — its remote renamed; a clone recording none moves at its key
 * keeping its remote, unless it lies in your own group's folder, which
 * holds the clones never at an instance; a clone already under an
 * instance's folder is not touched. */
function planClones(home: Home, folder: string, env: NodeJS.ProcessEnv): CloneMove[] {
  const own = home.own();
  const moves: CloneMove[] = [];
  for (const key of cloneKeys(home)) {
    if (instanceSegmentOf(key) !== null) continue;
    const identity = cloneIdentity(home.clonePath(key), env);
    const id = identity.id !== null;
    if (key === own) {
      if (id) moves.push({ from: key, to: key, remote: true, ...identity });
      continue;
    }
    if (!id && key.startsWith(`${home.ownName}/`)) continue;
    const to = `${folder}/${key}`;
    if (isRepositoryKey(to)) moves.push({ from: key, to, remote: id, ...identity });
  }
  return moves;
}

/** A JSON file of the home as it reads now; undefined where none stands
 * or it does not read, which the store reports at its open. */
function readOwnJson(file: string): Record<string, unknown> | undefined {
  if (!existsSync(file)) return undefined;
  try {
    const value = readJsonFile(file);
    return isObject(value) ? value : undefined;
  } catch { return undefined; }
}

/** A moved clone's records outside it follow it, as a host's rename
 * moves them (space-60): every pair naming its key names the new one,
 * its sync preferences `sync:<key>:*` and its forge cache entry are
 * re-keyed. Each is read as it stands and written only where it
 * changes, so a restart repeats nothing. */
function rekeyClone(root: string, move: CloneMove): void {
  const home = Home.load(root);
  if (home.folders().some((folder) => folder.repository === move.from)) {
    home.move([{ from: move.from, to: move.to }]);
    home.save();
  }
  const prefsFile = join(root, PREFS);
  const prefs = readOwnJson(prefsFile);
  if (prefs && prefs.format === 1 && isObject(prefs.prefs)) {
    const prefix = `sync:${move.from}:`;
    const next: Record<string, unknown> = {};
    let changed = false;
    for (const [key, value] of Object.entries(prefs.prefs)) {
      if (key.startsWith(prefix)) { next[`sync:${move.to}:${key.slice(prefix.length)}`] = value; changed = true; }
      else next[key] = value;
    }
    if (changed) writeApplicationFile(prefsFile, { ...prefs, prefs: next });
  }
  const cacheFile = join(root, FORGE_CACHE);
  const cache = readOwnJson(cacheFile);
  if (cache && isObject(cache.entries) && Object.hasOwn(cache.entries, move.from)) {
    const entries: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(cache.entries)) entries[key === move.from ? move.to : key] = value;
    writeApplicationFile(cacheFile, { ...cache, entries });
  }
}

/**
 * Migrate a home to format 2 in place (DR-127). Restart-safe: an
 * interrupted run resumes from its receipt, verifying what it already
 * wrote and never overwriting a destination that diverged. A clone a
 * session's lease names a live writer beneath is deferred, and moved by
 * a later run once it is released. `machineIdentity` reads a lease's
 * owner as this machine's, `env` runs Git.
 */
export function migrateInstances(root: string, options: { machineIdentity?: string; env?: NodeJS.ProcessEnv } = {}): InstancesReceipt {
  const env = options.env ?? process.env;
  const migrations = migrationsDir(root);
  mkdirSync(migrations, { recursive: true, mode: 0o700 });

  // 1 — the receipt: every input's digest, the original bytes of all
  // but the credentials kept.
  let found = findPendingReceipt(root);
  if (!found) {
    const id = randomUUID(); const dir = join(migrations, id);
    mkdirSync(join(dir, "inputs"), { recursive: true, mode: 0o700 });
    const inputs: InstancesReceipt["inputs"] = [];
    for (const path of [...KEPT, CREDENTIALS]) {
      const file = join(root, path);
      if (!existsSync(file) || !statSync(file).isFile()) continue;
      const bytes = readFileSync(file);
      const kept = path !== CREDENTIALS;
      if (kept) writeApplicationBytes(join(dir, "inputs", String(inputs.length)), bytes);
      inputs.push({ path, sha256: sha256(bytes), kept });
    }
    const receipt: InstancesReceipt = { format: 1, id, kind: "instances", inputs, steps: [], deferred: [], complete: false };
    writeApplicationFile(join(dir, "receipt.json"), receipt);
    found = { receipt, dir };
  }
  const { receipt, dir: receiptDir } = found;
  const save = (): void => writeApplicationFile(join(receiptDir, "receipt.json"), receipt);
  const step = (name: string): Record<string, unknown> | undefined => receipt.steps.find((entry) => entry.step === name);
  const record = (entry: Record<string, unknown>): void => {
    receipt.steps = [...receipt.steps.filter((prior) => prior.step !== entry.step), entry];
    save();
  };
  const kept = (path: string): Buffer | undefined => {
    const index = receipt.inputs.findIndex((entry) => entry.path === path);
    if (index < 0) return undefined;
    const file = join(receiptDir, "inputs", String(index));
    let bytes: Buffer;
    try { bytes = readFileSync(file); } catch { throw new StorageFormatError(file, invalidReceipt()); }
    need(receipt.inputs[index].kept && sha256(bytes) === receipt.inputs[index].sha256, file, invalidReceipt());
    return bytes;
  };

  // 2 — home.yaml in format 2, the host its recorded origin and, where
  // it holds an account, its one instance; the app token re-keyed to
  // that origin in the same step.
  const homeFile = Home.file(root);
  if (step("home")?.written !== true) {
    const formerBytes = kept(HOME_FILE);
    if (!formerBytes) throw new StorageFormatError(homeFile, invalidReceipt());
    const former = parseFormerHome(formerBytes, homeFile);
    let origin: string;
    try { origin = canonicalOrigin(former.host.url); }
    catch (error) {
      if (!(error instanceof OriginRefused)) throw error;
      throw new StorageFormatError(homeFile, notAnOrigin(former.host.url));
    }
    const { account, signedOut } = former.host;
    const next: HomeFile = {
      format: 2,
      device: former.device as string,
      origin,
      instances: account ? [{ origin, clientId: CLIENT_ID, account, ...(signedOut === true ? { signedOut: true } : {}) }] : [],
      own: former.own as string,
      folders: former.folders as HomeFile["folders"],
    };
    parseHomeFile(next, homeFile);
    const nextBytes = Buffer.from(stringifyYaml(next));

    // The token's move, planned by digest before anything is written,
    // so a restart tells its own write from another's.
    const credentialsFile = join(root, CREDENTIALS);
    const from = formerKey(former.host.url);
    let entry = step("home");
    if (!entry) {
      let credentials: { from: string; to: string } | null = null;
      const input = receipt.inputs.find((item) => item.path === CREDENTIALS);
      const current = input ? readIfAny(credentialsFile) : null;
      if (input && current) {
        need(sha256(current) === input.sha256, credentialsFile, divergedDestination());
        const moved = rekeyedCredentials(current, from, origin);
        if (moved) credentials = { from: input.sha256, to: sha256(moved) };
      }
      entry = { step: "home", origin, credentials, written: false };
      record(entry);
    }
    const plan = entry.credentials as { from: string; to: string } | null;
    if (plan) {
      const current = readIfAny(credentialsFile);
      const digest = current === null ? null : sha256(current);
      if (digest !== plan.to) {
        need(current !== null && digest === plan.from, credentialsFile, divergedDestination());
        const moved = rekeyedCredentials(current, from, origin);
        need(moved !== null && sha256(moved) === plan.to, credentialsFile, divergedDestination());
        mkdirSync(join(root, "local"), { recursive: true, mode: 0o700 });
        writeApplicationBytes(credentialsFile, moved);
      }
    }
    const current = readIfAny(homeFile);
    if (current === null || !current.equals(nextBytes)) {
      need(current !== null && current.equals(formerBytes), homeFile, divergedDestination());
      writeApplicationBytes(homeFile, nextBytes);
    }
    record({ ...entry, written: true });
  }

  // 3 — every clone at the instance under its folder (DR-127), each
  // move planned before the first is made: one rename, then the records
  // outside the clone re-keyed and its remote named by the folder. A
  // destination taken stops the run before any rename; a session's lease
  // beneath a clone defers it, keeping its key and remote.
  const home = Home.load(root);
  let clones = step("clones") as ClonesStep | undefined;
  if (!clones) {
    const folder = instanceFolder(home.defaultInstance().origin);
    clones = { step: "clones", folder, moves: planClones(home, folder, env), done: [] };
    record(clones as unknown as Record<string, unknown>);
  }
  const plan = clones;
  // A complete run comes back for its deferred clones alone.
  const deferred = (move: CloneMove): boolean => receipt.deferred.some((entry) => entry.from === move.from);
  const pending = plan.moves.filter((move) => !plan.done.includes(move.from) && (!receipt.complete || deferred(move)));
  const taken = (move: CloneMove): boolean => move.from !== move.to &&
    standsAsDirectory(home.clonePath(move.from)) && occupied(home.clonePath(move.from), home.clonePath(move.to), home.workspace);
  // A destination taken stops the run before any move it has not
  // deferred; a deferred clone's stays deferred, which the store reports
  // naming that destination, so no start is refused for it.
  const divergent = pending.find((move) => !deferred(move) && taken(move));
  if (divergent) throw new StorageFormatError(home.clonePath(divergent.to), divergedDestination());
  const finish = (move: CloneMove): void => {
    plan.done = [...plan.done.filter((key) => key !== move.from), move.from];
    receipt.deferred = receipt.deferred.filter((entry) => entry.from !== move.from);
    record(plan as unknown as Record<string, unknown>);
  };
  for (const move of pending) {
    const source = home.clonePath(move.from);
    const target = home.clonePath(move.to);
    if (move.from !== move.to) {
      if (standsAsDirectory(source)) {
        if (deferred(move)) {
          // Another clone made at its key since is not the one deferred:
          // it stays, and the receipt names that key no more.
          if (!isDeferredClone({ id: move.id ?? null, url: move.url ?? null }, cloneIdentity(source, env))) { finish(move); continue; }
          if (taken(move)) continue;
        }
        if (taken(move)) throw new StorageFormatError(target, divergedDestination());
        // Read at the rename's instant: a lease that cannot be read as
        // harmless holds the clone where it is.
        let held: boolean;
        try { held = heldSessionLease(source, options.machineIdentity) !== undefined; } catch { held = true; }
        if (held) {
          receipt.deferred = [...receipt.deferred.filter((entry) => entry.from !== move.from), { from: move.from, to: move.to }];
          save();
          continue;
        }
        mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
        renameSync(source, target);
        pruneEmptyFolders(dirname(source), home.workspace);
      } else if (!standsAsDirectory(target)) {
        // Gone meanwhile: nothing stands to move or to follow.
        finish(move);
        continue;
      }
      rekeyClone(root, move);
    }
    if (move.remote) nameRemoteBy(target, plan.folder, env);
    finish(move);
  }

  // 4 — verified: the home reads in format 2.
  Home.load(root);
  receipt.complete = true;
  save();
  return receipt;
}
