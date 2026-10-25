#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The sweep (hub-5, DR-148): the program of spex-seat-reaper.service,
// run as root every minute by its timer whether a hub runs or not. For
// every lease in the hub's table that has expired while its seat's unit
// is still active, it takes the seat's lock — held by the hub while it
// records an admission or a renewal — reads that lease again under it,
// and, the lease still expired and the unit still active, runs the
// helper's `stop` (hub-4), as root and so with no sudo. A unit counts as
// active unless the service manager answers its ActiveState `inactive`
// or `failed`, so one it is restarting at that instant is stopped as a
// running one. It writes nothing to the table and makes nothing under
// the state directory but its own lock file: the hub reconciles its own
// record of an owed stop at its next stop and makes the locks' directory
// (hub-8), and a directory missing, a link or another account's leaves
// the seat not swept. It reads the table through no link, from a regular
// file of the state directory's owner at most 1 MiB long, and logs
// nothing of a table it refuses but its path; a login or an expiry from
// the table is logged with its control characters replaced, so the table
// forges no line of root's journal. The seats are swept at once, so a
// slow stop delays no other; a lock it cannot take within its wait leaves
// that seat to the next sweep, and a stop that fails is logged and tried
// again there.
//
// The sweep is the one process that breaks a lock: at each sweep,
// whatever the leases, it first clears every seat's lock whose holder is
// gone — before it reads the lease table, so that a table it cannot read
// leaves no stale lock in the hub's way — and it replaces one that goes
// stale while it waits on it, the hub waiting on a stale one until then,
// so that no two takers of one stale lock both go on (hub-5).
//
// Exit status: 0 when every stop it ran succeeded, or none was due; 1
// when one failed, a seat could not be swept, the locks could not be
// cleared, or the lease table could not be read; 2 for a mistaken
// command line.

import { spawn } from "node:child_process";

import { DEFAULT_HELPER, runHelper, type HelperConfig } from "./helper.js";
import {
  acquireSeatLock,
  clearStaleLocks,
  DEFAULT_STATE_DIR,
  leaseActive,
  lockHolder,
  readLeasesGuarded,
  type Lease,
} from "./state.js";

const USAGE = `usage: node reaper.js [options]

  Stop, through the seat helper, every seat whose recorded lease has
  expired while its unit is still active; run as root by
  spex-seat-reaper.service every minute.

options:
  --state-dir <dir>     the hub's state (default ${DEFAULT_STATE_DIR})
  --helper <path>       spex-seatctl (default ${DEFAULT_HELPER})
  --sudo <path>         sudo, or empty to run the helper directly (default
                        empty: the unit runs as root)
  --systemctl <path>    systemctl (default systemctl)
  --lock-wait-ms <n>    how long a seat's lock is waited for (default 10000)`;

const FLAGS = ["state-dir", "helper", "sudo", "systemctl", "lock-wait-ms"];
const LOCK_WAIT_MS = 10_000;
/** How long `systemctl show` may take. */
const SYSTEMCTL_TIMEOUT_MS = 30_000;

class UsageError extends Error {}

function log(line: string): void {
  console.log(`[spex-seat-reaper] ${line}`);
}

/** Text from the lease table as a log line prints it: every control
 * character `?`, so a newline in a login forges no line of the journal. */
function printable(text: string): string {
  return text.replace(/[\x00-\x1f\x7f]/g, "?");
}

function parseFlags(argv: string[]): Map<string, string> | "help" {
  const flags = new Map<string, string>();
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h" || arg === "help") return "help";
    if (!arg.startsWith("--")) throw new UsageError(`the sweep takes no argument ${JSON.stringify(arg)}`);
    const equals = arg.indexOf("=");
    const name = arg.slice(2, equals < 0 ? undefined : equals);
    if (!FLAGS.includes(name)) throw new UsageError(`the sweep takes no --${name}`);
    let value: string;
    if (equals >= 0) value = arg.slice(equals + 1);
    else {
      if (index + 1 >= argv.length) throw new UsageError(`--${name} needs a value`);
      value = argv[++index];
    }
    flags.set(name, value);
  }
  return flags;
}

function lockWait(flags: Map<string, string>): number {
  const value = flags.get("lock-wait-ms");
  if (value === undefined) return LOCK_WAIT_MS;
  const number = Number(value);
  const max = 10 * 60 * 1000;
  if (!/^[0-9]+$/.test(value) || !Number.isSafeInteger(number) || number > max) {
    throw new UsageError(`--lock-wait-ms must be an integer from 0 to ${max}`);
  }
  return number;
}

/** Whether the seat's unit runs, by the ActiveState `systemctl show`
 * answers: every state but `inactive` and `failed` — `activating`,
 * `active`, `reloading`, `deactivating` and any other — counts as
 * running (hub-5). A systemctl that cannot run, fails or answers no
 * state throws. */
function unitRunning(systemctl: string, id: string): Promise<boolean> {
  return new Promise((resolveRunning, rejectRunning) => {
    const child = spawn(systemctl, ["show", "-p", "ActiveState", "--value", `spex-seat@${id}.service`], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      if (stdout.length < 4096) stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      if (stderr.length < 4096) stderr += chunk;
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), SYSTEMCTL_TIMEOUT_MS);
    child.once("error", (error) => {
      clearTimeout(timer);
      rejectRunning(new Error(`${systemctl} did not run: ${error.message}`));
    });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      const state = stdout.trim();
      if (signal) rejectRunning(new Error(`${systemctl} show was killed by ${signal}`));
      else if (code !== 0) {
        const why = stderr.trim().split("\n")[0];
        rejectRunning(new Error(`${systemctl} show exited ${code}${why ? `: ${why}` : ""}`));
      } else if (!state) rejectRunning(new Error(`${systemctl} show answered no ActiveState`));
      else resolveRunning(state !== "inactive" && state !== "failed");
    });
  });
}

interface Sweep {
  stateDir: string;
  helper: HelperConfig;
  systemctl: string;
  lockWaitMs: number;
}

/** Sweep one seat whose lease had lapsed at the first read; false where
 * its stop, finding whether it runs, or taking its lock failed — the
 * locks' directory missing, a link or another account's, which the
 * sweep never makes or mends (hub-5). */
async function sweepSeat(sweep: Sweep, id: string, first: Lease): Promise<boolean> {
  try {
    if (!(await unitRunning(sweep.systemctl, id))) return true;
    const lock = await acquireSeatLock(
      sweep.stateDir,
      id,
      sweep.lockWaitMs,
      (holder) => log(`waiting for the lock of ${id} held by ${lockHolder(holder)}`),
      { clearStale: true },
    );
    if (!lock) {
      log(`left ${id} to the next sweep: its lock is held`);
      return true;
    }
    try {
      // Read again under the lock: an admission or a renewal recorded
      // meanwhile stands, its seat running on (hub-5).
      const lease = readLeasesGuarded(sweep.stateDir)[id];
      if (!lease) {
        log(`left ${printable(first.login)} (${id}): its lease is no longer recorded`);
        return true;
      }
      if (leaseActive(lease)) {
        log(`left ${printable(lease.login)} (${id}): its lease is active again`);
        return true;
      }
      if (!(await unitRunning(sweep.systemctl, id))) return true;
      try {
        await runHelper(sweep.helper, "stop", id);
      } catch (error) {
        log(
          `the seat of ${printable(lease.login)} (${id}) did not stop: ${(error as Error).message}; tried again at the next sweep`,
        );
        return false;
      }
      log(`stopped the seat of ${printable(lease.login)} (${id}): its lease ended at ${printable(lease.expires_at)}`);
      return true;
    } finally {
      lock.release();
    }
  } catch (error) {
    log(`not swept: ${id}: ${(error as Error).message}; tried again at the next sweep`);
    return false;
  }
}

async function main(argv: string[]): Promise<number> {
  let flags: Map<string, string> | "help";
  let lockWaitMs: number;
  try {
    flags = parseFlags(argv);
    lockWaitMs = flags === "help" ? LOCK_WAIT_MS : lockWait(flags);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(`spex-seat-reaper: ${error.message}`);
    console.error(USAGE);
    return 2;
  }
  if (flags === "help") {
    console.log(USAGE);
    return 0;
  }
  const sudo = flags.get("sudo") ?? "";
  const sweep: Sweep = {
    stateDir: flags.get("state-dir") ?? DEFAULT_STATE_DIR,
    helper: { helper: flags.get("helper") ?? DEFAULT_HELPER, sudo: sudo === "" ? null : sudo },
    systemctl: flags.get("systemctl") ?? "systemctl",
    lockWaitMs,
  };
  // Every seat's stale lock cleared, its lease active or not, before the
  // lease table is read, so that the hub, which waits on a stale lock
  // until the sweep clears it, does not hang on the table (hub-5).
  let cleared = true;
  try {
    for (const { id, holder } of clearStaleLocks(sweep.stateDir)) {
      log(`cleared the stale lock of ${id}, left by ${holder === null ? "a process that wrote no pid" : `pid ${holder}`}`);
    }
  } catch (error) {
    log(`locks not cleared: ${(error as Error).message}; tried again at the next sweep`);
    cleared = false;
  }
  let leases;
  try {
    leases = readLeasesGuarded(sweep.stateDir);
  } catch (error) {
    log(`the lease table cannot be read: ${(error as Error).message}; no seat is stopped; tried again at the next sweep`);
    return 1;
  }
  const lapsed = Object.entries(leases).filter(([, lease]) => !leaseActive(lease));
  const swept = await Promise.all(lapsed.map(([id, lease]) => sweepSeat(sweep, id, lease)));
  return cleared && swept.every(Boolean) ? 0 : 1;
}

// The exit status is set, not forced, so every line logged reaches a
// piped standard output first.
main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(`spex-seat-reaper: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  },
);
