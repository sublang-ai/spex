// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The root lease (storage-24, DR-093): one rule admitting a home writer —
// the core or a mutating storage Git command — through `.lock/owner.json`.
// The owner's `hostname` carries Playbook's machine identity; an untagged
// value is a legacy host name; only `ESRCH` proves an owner dead; every
// retirement, a dead owner's or a normal release, moves the lock to a
// permanent nonempty `.lock.retired/<token>/`; a publication never
// replaces what stands at `.lock`.

import { randomUUID } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { hostname as systemHostname } from "node:os";
import { join } from "node:path";
import { isMachineIdentity } from "@sublang/playbook/machine-identity";
import { UUID } from "./app-storage.js";
import { i18n } from "./i18n.js";

export interface RootLeaseOwner {
  pid: number;
  hostname: string;
  acquiredAt: number;
  token: string;
}

export type ProcessProbe = (pid: number) => "live" | "dead" | "unknown";

export interface RootLeaseOptions {
  /** This machine's identity from Playbook's facade, the tagged form. */
  machineIdentity: string;
  /** The host name a legacy owner is compared with; `os.hostname()`. */
  legacyHostname?: string;
  probe?: ProcessProbe;
  pid?: number;
  /** Test hooks: between the absence check and the publication rename,
   * and between a retirement's rename and its re-read. */
  _testBeforePublish?: () => void;
  _testAfterRetireRename?: (target: string) => void;
}

export interface RootLease {
  readonly token: string;
  /** Retire this writer's own lock; a successor is never touched. */
  release(): void;
}

/** Another writer holds the state root (storage-24). */
export class StateRootHeldError extends Error {
  constructor(
    readonly holder: RootLeaseOwner,
    readonly dir: string,
    readonly lock: string,
    readonly machine: "local" | "foreign",
  ) {
    super(
      machine === "local"
        ? isMachineIdentity(holder.hostname)
          ? i18n._({
              id: "state root {dir} is held by pid {pid} on this machine; one core serves a root at a time (DR-036)",
              comment:
                "Startup refusal the shell shows in a dialog; the path, the process id and the decision's id stay as they are",
              values: { dir, pid: holder.pid },
            })
          : i18n._({
              id: "state root {dir} is held by pid {pid} on {host}; one core serves a root at a time (DR-036)",
              comment:
                "Startup refusal the shell shows in a dialog; the path, the process id, the host name and the decision's id stay as they are",
              values: { dir, pid: holder.pid, host: holder.hostname },
            })
        : isMachineIdentity(holder.hostname)
          ? i18n._({
              id: "state root {dir} is held by another machine (identity {identity}) at {lock}; stop that writer before removing the lock (DR-093)",
              comment:
                "Startup refusal the shell shows in a dialog; the paths, the identity and the decision's id stay as they are",
              values: { dir, identity: holder.hostname, lock },
            })
          : i18n._({
              id: "state root {dir} is held by pid {pid} on {host}; one core serves a root at a time (DR-036)",
              comment:
                "Startup refusal the shell shows in a dialog; the path, the process id, the host name and the decision's id stay as they are",
              values: { dir, pid: holder.pid, host: holder.hostname },
            }),
    );
    this.name = "StateRootHeldError";
  }
}

/** The lock cannot be verified: malformed, unverifiable, an occupied
 * retired target, a changed token, a probe that answered neither way. */
export class StateRootLeaseError extends Error {
  constructor(
    readonly dir: string,
    readonly lock: string,
    reason: string,
  ) {
    super(
      i18n._({
        id: "state root {dir} lock at {lock} cannot be verified: {reason}; stop every Spex writer before removing it (DR-093)",
        comment:
          "Startup refusal the shell shows in a dialog; the paths and the decision's id stay as they are",
        values: { dir, lock, reason },
      }),
    );
    this.name = "StateRootLeaseError";
  }
}

const reasons = {
  malformed: () =>
    i18n._({
      id: "the owner record is malformed",
      comment: "Why a state-root lock cannot be verified",
    }),
  empty: () =>
    i18n._({
      id: "the active lock is empty",
      comment: "Why a state-root lock cannot be verified",
    }),
  unverifiable: (value: string) =>
    i18n._({
      id: "the owner's machine identity {value} is unverifiable",
      comment: "Why a state-root lock cannot be verified; the value stays as it is",
      values: { value },
    }),
  probe: (code: string) =>
    i18n._({
      id: "the owner process cannot be probed ({code})",
      comment: "Why a state-root lock cannot be verified; the error code stays as it is",
      values: { code },
    }),
  occupied: (retired: string) =>
    i18n._({
      id: "its retired path {retired} is already occupied",
      comment: "Why a state-root lock cannot be verified; the path stays as it is",
      values: { retired },
    }),
  changed: () =>
    i18n._({
      id: "the moved owner's token changed",
      comment: "Why a state-root lock cannot be verified",
    }),
  inspect: (code: string) =>
    i18n._({
      id: "the lock cannot be inspected ({code})",
      comment: "Why a state-root lock cannot be verified; the error code stays as it is",
      values: { code },
    }),
  race: () =>
    i18n._({
      id: "another writer published while this one was retrying",
      comment: "Why a state-root lock cannot be verified",
    }),
};

/** Signal 0 to the owner: success or EPERM is a live process, ESRCH a
 * dead one, and anything else answers neither way (storage-24). */
export function probeProcess(pid: number): "live" | "dead" | "unknown" {
  try {
    process.kill(pid, 0);
    return "live";
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EPERM") return "live";
    if (code === "ESRCH") return "dead";
    return "unknown";
  }
}

/** How a reader reads an owner's `hostname` (storage-24): the exact tag
 * is an identity compared with this machine's; a value that begins like
 * the tag but fails its form is unverifiable; anything else is a legacy
 * host name compared with the current one. */
export function classifyOwnerMachine(
  value: string,
  machineIdentity: string,
  legacyHostname: string,
): "local" | "foreign" | "unverifiable" {
  const tagged: boolean = isMachineIdentity(value);
  if (tagged) return value === machineIdentity ? "local" : "foreign";
  if (value.startsWith("machine-id:")) return "unverifiable";
  return value === legacyHostname ? "local" : "foreign";
}

const errorCode = (error: unknown): string =>
  (error as NodeJS.ErrnoException)?.code ?? "unknown";

function readOwner(dir: string, lock: string): RootLeaseOwner {
  let stat;
  try {
    stat = lstatSync(lock);
  } catch (error) {
    throw new StateRootLeaseError(dir, lock, reasons.inspect(errorCode(error)));
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new StateRootLeaseError(dir, lock, reasons.malformed());
  }
  let names: string[];
  try {
    names = readdirSync(lock);
  } catch (error) {
    throw new StateRootLeaseError(dir, lock, reasons.inspect(errorCode(error)));
  }
  if (names.length === 0) throw new StateRootLeaseError(dir, lock, reasons.empty());
  if (names.length !== 1 || names[0] !== "owner.json") {
    throw new StateRootLeaseError(dir, lock, reasons.malformed());
  }
  const file = join(lock, "owner.json");
  let value: unknown;
  try {
    const fileStat = lstatSync(file);
    if (fileStat.isSymbolicLink() || !fileStat.isFile()) {
      throw new StateRootLeaseError(dir, lock, reasons.malformed());
    }
    value = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    if (error instanceof StateRootLeaseError) throw error;
    throw new StateRootLeaseError(dir, lock, reasons.malformed());
  }
  if (
    !value || typeof value !== "object" || Array.isArray(value) ||
    Object.keys(value).sort().join(",") !== "acquiredAt,hostname,pid,token"
  ) {
    throw new StateRootLeaseError(dir, lock, reasons.malformed());
  }
  const owner = value as Record<string, unknown>;
  if (
    !Number.isSafeInteger(owner.pid) || (owner.pid as number) <= 0 ||
    typeof owner.hostname !== "string" || owner.hostname.trim().length === 0 ||
    typeof owner.acquiredAt !== "number" || !Number.isFinite(owner.acquiredAt) ||
    typeof owner.token !== "string" || !UUID.test(owner.token)
  ) {
    throw new StateRootLeaseError(dir, lock, reasons.malformed());
  }
  return owner as unknown as RootLeaseOwner;
}

/** Move the active lock to its permanent retired path and confirm the
 * moved owner is the one read; a mismatch fails closed, deleting nothing. */
function retire(
  dir: string,
  lock: string,
  owner: RootLeaseOwner,
  afterRename?: (target: string) => void,
): void {
  const retiredRoot = join(dir, ".lock.retired");
  try {
    const stat = lstatSync(retiredRoot);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new StateRootLeaseError(dir, lock, reasons.malformed());
    }
  } catch (error) {
    if (error instanceof StateRootLeaseError) throw error;
    if (errorCode(error) !== "ENOENT") {
      throw new StateRootLeaseError(dir, lock, reasons.inspect(errorCode(error)));
    }
    mkdirSync(retiredRoot, { mode: 0o700 });
  }
  const target = join(retiredRoot, owner.token);
  try {
    lstatSync(target);
    throw new StateRootLeaseError(dir, lock, reasons.occupied(target));
  } catch (error) {
    if (error instanceof StateRootLeaseError) throw error;
    if (errorCode(error) !== "ENOENT") {
      throw new StateRootLeaseError(dir, lock, reasons.inspect(errorCode(error)));
    }
  }
  try {
    renameSync(lock, target);
  } catch (error) {
    throw new StateRootLeaseError(dir, lock, reasons.inspect(errorCode(error)));
  }
  afterRename?.(target);
  const moved = readOwner(dir, target);
  if (moved.token !== owner.token) {
    throw new StateRootLeaseError(dir, lock, reasons.changed());
  }
}

/** Take the root lease of `dir` or refuse (storage-24). */
export function acquireRootLease(dir: string, options: RootLeaseOptions): RootLease {
  if (!isMachineIdentity(options.machineIdentity)) {
    throw new TypeError("the root lease requires this machine's tagged identity");
  }
  const lock = join(dir, ".lock");
  const legacyHostname = options.legacyHostname ?? systemHostname();
  const probe = options.probe ?? probeProcess;
  const pid = options.pid ?? process.pid;
  const token = randomUUID();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    let present = true;
    try {
      lstatSync(lock);
    } catch (error) {
      if (errorCode(error) !== "ENOENT") {
        throw new StateRootLeaseError(dir, lock, reasons.inspect(errorCode(error)));
      }
      present = false;
    }
    if (present) {
      const owner = readOwner(dir, lock);
      const machine = classifyOwnerMachine(owner.hostname, options.machineIdentity, legacyHostname);
      if (machine === "foreign") throw new StateRootHeldError(owner, dir, lock, "foreign");
      if (machine === "unverifiable") {
        throw new StateRootLeaseError(dir, lock, reasons.unverifiable(owner.hostname));
      }
      const state = probe(owner.pid);
      if (state === "live") throw new StateRootHeldError(owner, dir, lock, "local");
      if (state !== "dead") throw new StateRootLeaseError(dir, lock, reasons.probe(state));
      retire(dir, lock, owner, options._testAfterRetireRename);
      continue;
    }
    options._testBeforePublish?.();
    // Stage, then rename: the lock appears with its owner inside, and a
    // target that appeared meanwhile makes the rename fail (a program-
    // created lock is never empty), so this writer re-inspects.
    const stage = join(dir, `.lock.stage.${token}`);
    try {
      mkdirSync(stage, { mode: 0o700 });
      writeFileSync(
        join(stage, "owner.json"),
        JSON.stringify({ pid, hostname: options.machineIdentity, acquiredAt: Date.now(), token }),
        { mode: 0o600 },
      );
      renameSync(stage, lock);
    } catch {
      rmSync(stage, { recursive: true, force: true });
      continue;
    }
    const published = readOwner(dir, lock);
    if (published.token !== token) throw new StateRootLeaseError(dir, lock, reasons.race());
    let released = false;
    return {
      token,
      release(): void {
        if (released) return;
        released = true;
        let owner: RootLeaseOwner;
        try {
          owner = readOwner(dir, lock);
        } catch {
          // Absent or unreadable: nothing of this writer's stands there.
          return;
        }
        if (owner.token !== token) return;
        retire(dir, lock, owner, options._testAfterRetireRename);
      },
    };
  }
  throw new StateRootLeaseError(dir, lock, reasons.race());
}
