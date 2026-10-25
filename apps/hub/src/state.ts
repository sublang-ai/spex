// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The hub's own state (hub-1, hub-8): one owner-only directory holding
// `state.yaml` — the instance, the server's id, name, address and
// token, and the TLS pair's paths — and `leases.yaml` — each seat's
// lease as `{<person id>: {login, expires_at, bearer_hash, stop_owed}}`,
// `stop_owed` present from a lease's admission until a stop succeeds
// after its end — and, under `locks/`, which the hub makes, a lock per
// seat shared with the sweep, which alone clears one whose holder is
// gone (DR-148). Both files are written in
// YAML's JSON-compatible flow form, so any YAML reader reads them and
// the hub needs no YAML library; every write replaces the file whole
// through a rename, so a crash leaves the old file or the new.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  renameSync,
  rmdirSync,
  rmSync,
  unlinkSync,
  statSync,
  writeFileSync,
  writeSync,
  type Stats,
} from "node:fs";
import { uptime } from "node:os";
import { join } from "node:path";

export const DEFAULT_STATE_DIR = "/var/lib/spex-hub";

export interface HubState {
  /** The instance's origin, e.g. `https://spex.pub`. */
  instance: string;
  server_id: string;
  /** The server's name as the instance last answered it; null until
   * the first admission. */
  name: string | null;
  /** The https origin the hub serves, e.g. `https://hub.example.com`. */
  address: string;
  /** The server token; null once `retire` forgot it. */
  token: string | null;
  /** Absolute paths of the TLS certificate and key the hub serves. */
  tls_cert: string;
  tls_key: string;
}

export interface Lease {
  login: string;
  /** The instance's expiry, as it answered it; a lease ended early
   * carries the time it ended. */
  expires_at: string;
  /** SHA-256 (hex) of the bearer the last admission issued; null when
   * the lease ended or no bearer was issued. */
  bearer_hash: string | null;
  /** True from a lease's admission until the helper's stop succeeds
   * after its end (hub-5, hub-8); absent otherwise. */
  stop_owed?: true;
}

export type Leases = Record<string, Lease>;

/** A person's permanent account id at the instance, as the helper
 * admits it (hub-4). */
export const PERSON_ID = /^[0-9]{1,20}$/;

export function statePath(dir: string): string {
  return join(dir, "state.yaml");
}

export function leasesPath(dir: string): string {
  return join(dir, "leases.yaml");
}

export function controlPath(dir: string): string {
  return join(dir, "control.sock");
}

/** Make the state directory owner-only, whoever made it. */
export function ensureStateDir(dir: string): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
}

function writePrivate(file: string, value: unknown): void {
  const temporary = `${file}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
    flag: "wx",
  });
  try {
    renameSync(temporary, file);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}

function readJson(file: string): unknown {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new Error(`cannot read ${file}: ${(error as Error).message}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${file} is not the hub's own state; attach again`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

export function readState(dir: string): HubState | undefined {
  const file = statePath(dir);
  const value = readJson(file);
  if (value === undefined) return undefined;
  if (
    !isRecord(value) ||
    typeof value.instance !== "string" ||
    typeof value.server_id !== "string" ||
    !stringOrNull(value.name) ||
    typeof value.address !== "string" ||
    !stringOrNull(value.token) ||
    typeof value.tls_cert !== "string" ||
    typeof value.tls_key !== "string"
  ) {
    throw new Error(`${file} is not the hub's own state; attach again`);
  }
  return {
    instance: value.instance,
    server_id: value.server_id,
    name: value.name,
    address: value.address,
    token: value.token,
    tls_cert: value.tls_cert,
    tls_key: value.tls_key,
  };
}

export function writeState(dir: string, state: HubState): void {
  ensureStateDir(dir);
  writePrivate(statePath(dir), {
    instance: state.instance,
    server_id: state.server_id,
    name: state.name,
    address: state.address,
    token: state.token,
    tls_cert: state.tls_cert,
    tls_key: state.tls_key,
  });
}

/** A parsed lease table checked whole, entry by entry, as `file` holds
 * it; an error names the file and, for a malformed entry, its key. */
function leasesOf(value: unknown, file: string): Leases {
  if (!isRecord(value)) throw new Error(`${file} is not the hub's lease table`);
  const leases: Leases = {};
  for (const [id, entry] of Object.entries(value)) {
    if (
      !PERSON_ID.test(id) ||
      !isRecord(entry) ||
      typeof entry.login !== "string" ||
      typeof entry.expires_at !== "string" ||
      !Number.isFinite(Date.parse(entry.expires_at)) ||
      !stringOrNull(entry.bearer_hash) ||
      (entry.stop_owed !== undefined && typeof entry.stop_owed !== "boolean")
    ) {
      throw new Error(`${file} holds a malformed lease for ${JSON.stringify(id)}`);
    }
    leases[id] = {
      login: entry.login,
      expires_at: entry.expires_at,
      bearer_hash: entry.bearer_hash,
      ...(entry.stop_owed === true ? { stop_owed: true } : {}),
    };
  }
  return leases;
}

export function readLeases(dir: string): Leases {
  const file = leasesPath(dir);
  const value = readJson(file);
  if (value === undefined) return {};
  return leasesOf(value, file);
}

/** The most of the lease table the sweep reads: far above any team's
 * table, so a longer file is none the hub wrote. */
const LEASES_MAX_BYTES = 1024 * 1024;

/** The lease table as the sweep, as root, reads it (hub-5, hub-8):
 * opened through no link and without blocking, so a link the hub's
 * account planted leads it nowhere and a FIFO holds it up for no time,
 * and read only from a regular file of the state directory's owner at
 * most 1 MiB long. It is checked as readLeases checks it, but every
 * refusal — the file not opened, of another kind or owner, too long, or
 * not the table's shape — is the one error naming the file alone, never
 * a key or a byte of what it held, for the sweep logs it into root's
 * journal. A missing file is an empty table. */
export function readLeasesGuarded(dir: string): Leases {
  const file = leasesPath(dir);
  const refused = (): Error => new Error(`${file} is not the hub's lease table`);
  let fd: number;
  try {
    fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw refused();
  }
  let text: string;
  try {
    const stats = fstatSync(fd);
    if (!stats.isFile() || stats.uid !== statSync(dir).uid || stats.size > LEASES_MAX_BYTES) throw refused();
    // A byte past the size fstat answered tells a file grown since,
    // which the hub, renaming a whole new table over the old, never is.
    const buffer = Buffer.alloc(stats.size + 1);
    let length = 0;
    for (;;) {
      const read = readSync(fd, buffer, length, buffer.length - length, null);
      if (read === 0) break;
      length += read;
      if (length === buffer.length) throw refused();
    }
    text = buffer.subarray(0, length).toString("utf8");
  } catch {
    throw refused();
  } finally {
    closeSync(fd);
  }
  try {
    return leasesOf(JSON.parse(text), file);
  } catch {
    throw refused();
  }
}

export function writeLeases(dir: string, leases: Leases): void {
  ensureStateDir(dir);
  writePrivate(leasesPath(dir), leases);
}

/** Whether a lease still holds at `now`. */
export function leaseActive(lease: Lease, now = Date.now()): boolean {
  return Date.parse(lease.expires_at) > now;
}

/** A secret of 32 random bytes in unpadded base64url (43 characters):
 * a bearer or a seat's handshake token. */
export function mintSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Compare a presented bearer with a stored hash in constant time. */
export function bearerMatches(bearer: string, hash: string): boolean {
  const presented = Buffer.from(sha256(bearer), "hex");
  const stored = Buffer.from(hash, "hex");
  return presented.length === stored.length && timingSafeEqual(presented, stored);
}

// --- The lock per seat (hub-5, hub-8, DR-148) -------------------------------

/** The seats' locks' directory under the state directory. */
export function locksPath(dir: string): string {
  return join(dir, "locks");
}

/** A seat's lock file in it: made with O_EXCL, holding its holder's
 * pid, taken by the hub while it records a lease and by the sweep, as
 * root, while it judges and stops a seat. */
export function seatLockPath(dir: string, id: string): string {
  return join(locksPath(dir), `${id}.lock`);
}

/** Refuse a locks' directory that is missing, a link, or not the state
 * directory's owner's: the sweep, as root, follows no path the hub's
 * account could redirect (hub-5). */
function checkLocks(dir: string): void {
  const locks = locksPath(dir);
  let made: Stats;
  try {
    made = lstatSync(locks);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error(`${locks} is missing: the hub makes it`);
    throw error;
  }
  if (!made.isDirectory() || made.uid !== statSync(dir).uid) {
    throw new Error(`${locks} is no directory of the state directory's owner`);
  }
}

/** Make the locks' directory where it is absent, owner-only whoever made
 * it, as the state directory is: the hub's to make, never the sweep's
 * (hub-5, hub-8). Only the state directory's owner makes it, so root
 * running the administrator's command by mistake makes none the hub
 * could not use. */
export function ensureLocksDir(dir: string): void {
  if (process.getuid !== undefined && process.getuid() !== statSync(dir).uid) return;
  try {
    mkdirSync(locksPath(dir), { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  checkLocks(dir);
  chmodSync(locksPath(dir), 0o700);
}

/** Remove a lock entry by its name alone: unlink follows no link and
 * recurses into nothing, so root removes nothing but that name; one
 * gone already is no error. */
function unlinkLock(path: string): void {
  try {
    unlinkSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

/** Whether a pid still runs: a signal refused (EPERM) is another
 * account's live process, root's among them; ESRCH is none. */
function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** How old a lock grows before the sweep clears it whoever holds it
 * (hub-5): past every hold, each bounded by the seat's start and stop
 * timeouts. */
const LOCK_STALE_MS = 15 * 60 * 1000;

/** How long a lock may hold no pid after it was made: a taker writes its
 * pid at once after the create (hub-5). */
const LOCK_EMPTY_MS = 1000;

/** Whether a lock's holder is gone (hub-5), `mtimeMs` the modification
 * time of the very file its pid was read from (readLock), by any of three
 * rules: its pid no longer runs, or is this process's own — for no
 * process holds a lock twice: the hub takes one person's operations one
 * at a time and the sweep visits each seat once — and so a pid reused
 * since a reboot; the lock was written before this boot; or the lock is
 * older than fifteen minutes. */
function holderGone(holder: number, mtimeMs: number): boolean {
  if (holder === process.pid || !pidAlive(holder)) return true;
  const now = Date.now();
  return mtimeMs < now - uptime() * 1000 || now - mtimeMs > LOCK_STALE_MS;
}

/** A lock as one read of it found it: its text and the modification time
 * of the file the text came from. */
interface LockRead {
  text: string;
  mtimeMs: number;
}

/** Whether a lock read, holding no pid, still holds none a second after
 * it was made (hub-5). */
function emptyGone(lock: LockRead): boolean {
  return Date.now() - lock.mtimeMs > LOCK_EMPTY_MS;
}

/** A lock file's text, at most 64 bytes, and its modification time, both
 * from the fstat and the read of one open file, so a file replaced
 * meanwhile is never judged by another's time. It is read through no
 * link and from nothing but a regular file bearing one name, so a lock
 * planted as a link, a hard link, a FIFO or a device leads its reader
 * nowhere: such a one reads as "" — a FIFO, a device or a hard link with
 * its own fstat's time, a link, which no taker makes and which is never
 * opened, as made at the epoch. The sweep's pass over every lock
 * (clearStaleLocks) opens none that is no regular file, judging it by its
 * lstat's time instead; the sweep of its own seat replaces it as an empty
 * one (acquireSeatLock with `clearStale`). Throws as the open does where
 * it is gone (ENOENT) or not yet readable. */
function readLock(path: string): LockRead {
  let fd: number;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ELOOP") return { text: "", mtimeMs: 0 };
    throw error;
  }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1) return { text: "", mtimeMs: stat.mtimeMs };
    const buffer = Buffer.alloc(64);
    const text = buffer.subarray(0, readSync(fd, buffer, 0, buffer.length, 0)).toString("utf8").trim();
    return { text, mtimeMs: stat.mtimeMs };
  } finally {
    closeSync(fd);
  }
}

/** The pid a lock's text holds, null for none. */
function lockPid(text: string): number | null {
  return /^[0-9]+$/.test(text) ? Number(text) : null;
}

export interface SeatLock {
  /** Give the lock back, once; one no longer holding this process's pid
   * — cleared as stale by the sweep — is left alone. */
  release(): void;
}

/** A lock's holder as a log line names it. */
export function lockHolder(holder: number | null): string {
  return holder === null ? "a process still writing its pid" : `pid ${holder}`;
}

/** Take a seat's lock, waiting up to `timeoutMs` and polling every
 * 50 ms. The `locks/` directory is the hub's to make (ensureLocksDir):
 * this makes nothing but its own lock file and changes the owner of
 * nothing, and it throws where the directory is missing, a link, or not
 * the state directory's owner's — checked at every round and at the
 * release — so the sweep, as root, follows no path the hub's account
 * could redirect (hub-5). The file is made readable by every account
 * whatever the umask (the sweep's unit sets 0077), so the hub reads a
 * lock root took. A lock whose holder is gone — holderGone, or a file
 * still holding no pid a second after it was made: a holder that died
 * between the create and the write, or a lock that is a link or no
 * regular file (readLock), each judged by the time of the file read — is
 * removed at once only with `clearStale`, which the sweep alone passes;
 * every other taker waits on it as on a live holder until the sweep
 * clears it (clearStaleLocks), so that no two takers of one stale lock
 * both go on (hub-5). One not yet readable is waited on as any holder
 * is. `onWait` is told the holder's pid, and whether it is gone, the
 * first time the lock is found held. Answers undefined when the wait ran
 * out, the lock still held. */
export async function acquireSeatLock(
  dir: string,
  id: string,
  timeoutMs: number,
  onWait?: (holder: number | null, gone: boolean) => void,
  options: { clearStale?: boolean } = {},
): Promise<SeatLock | undefined> {
  if (!PERSON_ID.test(id)) throw new Error(`no seat id: ${JSON.stringify(id)}`);
  const path = seatLockPath(dir, id);
  const deadline = Date.now() + timeoutMs;
  let told = false;
  for (;;) {
    checkLocks(dir);
    let fd: number | undefined;
    try {
      fd = openSync(path, "wx", 0o644);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    if (fd !== undefined) {
      try {
        fchmodSync(fd, 0o644);
        writeSync(fd, `${process.pid}\n`);
      } catch (error) {
        closeSync(fd);
        unlinkLock(path);
        throw error;
      }
      closeSync(fd);
      let released = false;
      return {
        release: () => {
          if (released) return;
          released = true;
          try {
            checkLocks(dir);
            if (readLock(path).text === String(process.pid)) unlinkLock(path);
          } catch {
            // cleared as stale, gone already, or its directory no
            // longer the hub's: left to the sweep, which clears it once
            // its holder is gone
          }
        },
      };
    }
    let lock: LockRead | undefined;
    try {
      lock = readLock(path);
    } catch (error) {
      // Gone meanwhile: take it at once.
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
    }
    const holder = lock === undefined ? null : lockPid(lock.text);
    let gone = false;
    if (lock !== undefined) gone = holder !== null ? holderGone(holder, lock.mtimeMs) : emptyGone(lock);
    if (gone && options.clearStale) {
      unlinkLock(path);
      continue;
    }
    if (!told) {
      told = true;
      onWait?.(holder, gone);
    }
    if (Date.now() >= deadline) return undefined;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
}

/** A seat's lock file as `locks/` names it. */
const LOCK_FILE = /^([0-9]{1,20})\.lock$/;

/** Clear every seat's lock whose holder is gone, its seat's lease active
 * or not: the sweep's, at each sweep (hub-5, hub-8). The sweep is the
 * one process that breaks a lock, and its unit never runs twice at once:
 * a gone holder releases nothing and every other taker only waits on it,
 * so nothing replaces the file between the sweep's read of it and its
 * removal, and no fresh lock is removed as stale — but for a holder the
 * fifteen-minute rule judges gone while it still runs, which may release
 * in that window, a hold the seat's timeouts make impossible. A lock is gone where
 * holderGone says so of its pid, or where it still holds no pid a second
 * after it was made (a holder that died between the create and the
 * write, or a hard link: readLock), each judged by the time of the file
 * read. An entry named as a lock that is no regular file — a link, a
 * FIFO, a directory — no taker makes and only the hub's account could
 * plant in its own owner-only directory: it is never opened, holds no
 * pid, and is gone a second after its lstat's time, and removing it
 * removes that name alone — a link and not what it leads to, a directory
 * only while it is empty. One that cannot be read or removed
 * is left to the next sweep. A missing directory holds no lock to clear;
 * one that is a link or another account's throws as checkLocks does.
 * Answers each lock removed, by its seat's id and the pid it held, null
 * for none. */
export function clearStaleLocks(dir: string): { id: string; holder: number | null }[] {
  const locks = locksPath(dir);
  try {
    lstatSync(locks);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  checkLocks(dir);
  const cleared: { id: string; holder: number | null }[] = [];
  for (const name of readdirSync(locks)) {
    const match = LOCK_FILE.exec(name);
    if (!match) continue;
    const path = join(locks, name);
    let entry: Stats;
    let lock: LockRead;
    try {
      entry = lstatSync(path);
      // No regular file is opened: it holds no pid, judged by its own time.
      lock = entry.isFile() ? readLock(path) : { text: "", mtimeMs: entry.mtimeMs };
    } catch {
      // Gone meanwhile, or not readable: the next sweep sees it again.
      continue;
    }
    const holder = lockPid(lock.text);
    if (!(holder !== null ? holderGone(holder, lock.mtimeMs) : emptyGone(lock))) continue;
    try {
      // By its name alone, never through it: unlink follows no link and
      // recurses into nothing, where Node's rmSync, a rimraf, would walk a
      // directory swapped in under root; rmdirSync removes one only while
      // empty.
      if (entry.isDirectory()) rmdirSync(path);
      else unlinkLock(path);
    } catch {
      // Not removed — a directory not empty, or replaced meanwhile: the
      // next sweep sees it again.
      continue;
    }
    cleared.push({ id: match[1], holder });
  }
  return cleared;
}
