// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A clone's move under `workspace/` (space-59, space-60, DR-127): what
// every mover reads at its rename's instant — whether a session's lease
// beneath holds the clone where it is, whether the destination is taken
// — and the empty folders a move leaves. Shared by the Groups' core,
// which moves clones while writers run, and by the instances migration,
// which moves them once before any writer is admitted.

import { existsSync, lstatSync, readdirSync, readFileSync, rmdirSync, statSync } from "node:fs";
import { hostname } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { UUID } from "./files.js";
import { classifyOwnerMachine, probeProcess } from "./root-lease.js";

/** Remove the folders a move left empty, up to the workspace itself. */
export function pruneEmptyFolders(dir: string, stopAt: string): void {
  let current = resolve(dir);
  const root = resolve(stopAt);
  while (current !== root && current.startsWith(`${root}/`)) {
    try {
      if (readdirSync(current).length > 0) return;
      rmdirSync(current);
    } catch { return; }
    current = dirname(current);
  }
}

/** Whether two paths name one file — a case-only rename's source and
 * destination on a filesystem that folds case (space-60). */
export function sameFile(a: string, b: string): boolean {
  try {
    const one = statSync(a);
    const two = statSync(b);
    return one.dev === two.dev && one.ino === two.ino;
  } catch { return false; }
}

/** Whether a move's destination is taken by anything but its source: a
 * case-folding rename re-cases the final component alone, so the clone
 * itself is its destination only under the same parent (space-60); under
 * another spelling of its group it counts as taken (space-59). A folder
 * on the destination's path below `workspace` that resolves under
 * another spelling on disk takes it too, its leaf absent or not: the
 * rename would land under the disk's spelling while the home records the
 * new key. A missing folder takes nothing. */
export function occupied(from: string, to: string, workspace: string): boolean {
  if (existsSync(to) && !(sameFile(from, to) && dirname(from) === dirname(to))) return true;
  const rel = relative(workspace, dirname(to));
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return false;
  let parent = workspace;
  for (const part of rel.split(sep)) {
    const next = join(parent, part);
    if (!existsSync(next)) return false;
    let names: string[];
    try { names = readdirSync(parent); } catch { return true; }
    if (!names.includes(part)) return true;
    parent = next;
  }
  return false;
}

/** Playbook's session lease owner as it writes one (`owner.json`, schema
 * 1): mirrored here to read a canonical lease, never to write one. */
const LEASE_OWNER_KEYS = ["acquiredAt", "hostname", "kind", "ownerToken", "pid", "schemaVersion", "sessionId"];
const PLAYBOOK_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const LEASE_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** Whether a canonical lease `<sessions>/.<id>.lock` is harmless to a
 * move: a private real directory holding only a private regular
 * `owner.json` of the supported shape for that session, whose `hostname`
 * the root lease's rule reads as this machine — its identity, or the
 * legacy host name — for a process proven dead (storage-26). Anything
 * else — a symlink, a malformed or unsupported record, another machine's,
 * a live process, a probe answering neither way — holds the clone. */
export function deadOwnLease(dir: string, id: string, identity: string | undefined): boolean {
  try {
    const lease = lstatSync(dir);
    if (!lease.isDirectory() || (lease.mode & 0o7777) !== 0o700) return false;
    const names = readdirSync(dir);
    if (names.length !== 1 || names[0] !== "owner.json") return false;
    const file = lstatSync(join(dir, "owner.json"));
    if (!file.isFile() || (file.mode & 0o7777) !== 0o600) return false;
    const owner = JSON.parse(readFileSync(join(dir, "owner.json"), "utf8")) as Record<string, unknown> | null;
    if (!owner || typeof owner !== "object" || Array.isArray(owner)) return false;
    if (Object.keys(owner).sort().join(",") !== LEASE_OWNER_KEYS.join(",")) return false;
    if (owner.schemaVersion !== 1 || owner.kind !== "captain-session-lease" || owner.sessionId !== id) return false;
    if (typeof owner.ownerToken !== "string" || !PLAYBOOK_UUID.test(owner.ownerToken)) return false;
    if (!Number.isSafeInteger(owner.pid) || (owner.pid as number) <= 0) return false;
    if (typeof owner.acquiredAt !== "string" || !LEASE_TIMESTAMP.test(owner.acquiredAt) || new Date(Date.parse(owner.acquiredAt)).toISOString() !== owner.acquiredAt) return false;
    if (identity === undefined || typeof owner.hostname !== "string" || owner.hostname.trim().length === 0) return false;
    if (classifyOwnerMachine(owner.hostname, identity, hostname()) !== "local") return false;
    return probeProcess(owner.pid as number).state === "dead";
  } catch { return false; }
}

/** The first session of a clone whose canonical Playbook lease
 * `sessions/.<id>.lock` holds the clone where it is (deadOwnLease).
 * Read synchronously, so a move reads it at its rename's instant; it
 * takes and waits for no lease. */
export function heldSessionLease(clone: string, identity: string | undefined): string | undefined {
  const dir = join(clone, "sessions");
  let names: string[];
  try { names = readdirSync(dir); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
  for (const name of names.sort()) {
    const id = /^\.(.+)\.lock$/.exec(name)?.[1];
    if (!id || !UUID.test(id)) continue;
    if (!deadOwnLease(join(dir, name), id, identity)) return id;
  }
  return undefined;
}
