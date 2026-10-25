// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The sweep over a lease table on disk (hub-9): the real sweep program,
// dist/reaper.js, run once per case as the current user, the fake helper
// starting and stopping stub seats on scratch homes, and a fake service
// manager answering which seats' units are active. The lease table is
// written by hand in the hub's own shape, the locks' directory made and a
// seat's lock held by this process as the hub makes and holds them.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  existsSync,
  lstatSync,
  lutimesSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir, uptime } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REAPER = join(packageDir, "dist", "reaper.js");
const FIXTURES = join(packageDir, "test", "fixtures");
const FAKE_HELPER = join(FIXTURES, "fake-seatctl");
const FAKE_SYSTEMCTL = join(FIXTURES, "fake-systemctl");

// ---------------------------------------------------------------------------
// Scratch, processes and cleanup

const roots: string[] = [];
const children = new Set<ChildProcess>();

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

test.after(() => {
  for (const child of children) child.kill("SIGKILL");
  for (const root of roots) {
    const run = join(root, "run");
    for (const id of existsSync(run) ? readdirSync(run) : []) {
      try {
        process.kill(Number(readFileSync(join(run, id, "seat.pid"), "utf8")), "SIGKILL");
      } catch {
        // gone already
      }
    }
    rmSync(root, { recursive: true, force: true });
  }
});

interface Scenario {
  state: string;
  run: string;
  homes: string;
  log: string;
  systemctlLog: string;
  events: string;
  script: string;
}

/** A scratch state directory with the locks' directory the hub makes,
 * owner-only (hub-8), unless `locks` is false. */
function scenario({ locks = true }: { locks?: boolean } = {}): Scenario {
  const root = mkdtempSync(join(tmpdir(), "hub-sweep-"));
  roots.push(root);
  const s: Scenario = {
    state: join(root, "state"),
    run: join(root, "run"),
    homes: join(root, "homes"),
    log: join(root, "seatctl.log"),
    systemctlLog: join(root, "systemctl.log"),
    events: join(root, "events.log"),
    script: join(root, "script.json"),
  };
  mkdirSync(s.state, { mode: 0o700 });
  if (locks) mkdirSync(join(s.state, "locks"), { mode: 0o700 });
  mkdirSync(s.run);
  mkdirSync(s.homes);
  for (const file of [s.log, s.systemctlLog, s.events]) writeFileSync(file, "");
  writeFileSync(s.script, "{}");
  return s;
}

function env(s: Scenario): NodeJS.ProcessEnv {
  return {
    ...process.env,
    FAKE_NODE: process.execPath,
    FAKE_RUN_DIR: s.run,
    FAKE_SEATS_HOME: s.homes,
    FAKE_SEATCTL_LOG: s.log,
    FAKE_SYSTEMCTL_LOG: s.systemctlLog,
    FAKE_SEAT_SCRIPT: s.script,
    FAKE_SEAT_EVENTS: s.events,
  };
}

function setScript(s: Scenario, script: unknown): void {
  writeFileSync(s.script, JSON.stringify(script));
}

/** Start a stub seat through the fake helper as an admission does —
 * `create`, then `start` with a handshake token on standard input — and
 * answer its pid. */
function startSeat(s: Scenario, id: string): number {
  for (const [command, input] of [
    ["create", ""],
    ["start", randomBytes(32).toString("base64url")],
  ]) {
    const result = spawnSync(FAKE_HELPER, [command, id], { env: env(s), input, encoding: "utf8" });
    assert.equal(result.status, 0, `${command} ${id}: ${result.stderr}`);
  }
  const pid = Number(readFileSync(join(s.run, id, "seat.pid"), "utf8"));
  assert.ok(alive(pid), `the stub seat ${id} runs`);
  return pid;
}

interface Lease {
  login: string;
  expires_at: string;
  bearer_hash: string | null;
  stop_owed?: true;
}

/** A lease as the hub records it, its expiry `fromNowMs` away. */
function lease(login: string, fromNowMs: number): Lease {
  return {
    login,
    expires_at: new Date(Date.now() + fromNowMs).toISOString(),
    bearer_hash: fromNowMs > 0 ? randomBytes(32).toString("hex") : null,
    stop_owed: true,
  };
}

function leasesFile(s: Scenario): string {
  return join(s.state, "leases.yaml");
}

/** The lease table written whole through a rename, as the hub writes it. */
function writeLeaseTable(s: Scenario, leases: Record<string, Lease>): void {
  const staged = `${leasesFile(s)}.test.tmp`;
  writeFileSync(staged, `${JSON.stringify(leases, null, 2)}\n`, { mode: 0o600 });
  renameSync(staged, leasesFile(s));
}

function lockFile(s: Scenario, id: string): string {
  return join(s.state, "locks", `${id}.lock`);
}

/** Hold a seat's lock in the name of a pid, as the hub holds it. */
function holdLock(s: Scenario, id: string, pid: number): void {
  writeFileSync(lockFile(s, id), `${pid}\n`, { flag: "wx", mode: 0o644 });
}

interface Call {
  argv: string[];
  refused?: boolean;
}

function calls(file: string): Call[] {
  return readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Call);
}

function stops(s: Scenario, id: string): number {
  return calls(s.log).filter((call) => call.argv[0] === "stop" && call.argv[1] === id).length;
}

function askedActive(s: Scenario, id: string): number {
  return calls(s.systemctlLog).filter((call) => call.argv.at(-1) === `spex-seat@${id}.service`).length;
}

interface Sweep {
  /** Its standard output and error, as they arrived. */
  output(): string;
  stdout(): string;
  exited: Promise<number | null>;
}

function startSweep(s: Scenario, options: { lockWaitMs?: number; extra?: string[] } = {}): Sweep {
  const child = spawn(
    process.execPath,
    [
      REAPER,
      `--state-dir=${s.state}`,
      `--helper=${FAKE_HELPER}`,
      "--sudo=",
      `--systemctl=${FAKE_SYSTEMCTL}`,
      `--lock-wait-ms=${options.lockWaitMs ?? 10_000}`,
      ...(options.extra ?? []),
    ],
    { env: env(s), stdio: ["ignore", "pipe", "pipe"] },
  );
  children.add(child);
  let output = "";
  let stdout = "";
  child.stdout?.on("data", (chunk) => {
    output += chunk;
    stdout += chunk;
  });
  child.stderr?.on("data", (chunk) => (output += chunk));
  const exited = new Promise<number | null>((resolveExit) =>
    child.on("close", (code) => {
      children.delete(child);
      resolveExit(code);
    }),
  );
  return { output: () => output, stdout: () => stdout, exited };
}

async function sweepOnce(
  s: Scenario,
  extra: string[] = [],
): Promise<{ code: number | null; output: string; stdout: string }> {
  const sweep = startSweep(s, { extra });
  const code = await sweep.exited;
  return { code, output: sweep.output(), stdout: sweep.stdout() };
}

function allStops(s: Scenario): number {
  return calls(s.log).filter((call) => call.argv[0] === "stop").length;
}

/** The line the sweep logs for a lease table it refuses, naming the
 * table's path alone (hub-8). */
const REFUSED_TABLE = /\[spex-seat-reaper\] the lease table cannot be read: \S*leases\.yaml is not the hub's lease table; no seat is stopped; tried again at the next sweep/;

async function waitFor(check: () => boolean, label: string, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
}

// ---------------------------------------------------------------------------

test("the sweep stops a seat whose lease expired and still runs, leaves an active lease and a stopped unit alone, and rewrites nothing of the table (hub-5, hub-8)", async () => {
  const s = scenario();
  const lapsedPid = startSeat(s, "5101");
  const activePid = startSeat(s, "5102");
  const lapsed = lease("ann", -60_000);
  writeLeaseTable(s, { "5101": lapsed, "5102": lease("bo", 60 * 60_000), "5103": lease("cy", -60_000) });
  const table = readFileSync(leasesFile(s));

  const swept = await sweepOnce(s);
  assert.equal(swept.code, 0, swept.output);

  // hub-5: the expired lease's running seat stopped through the helper.
  assert.equal(stops(s, "5101"), 1);
  await waitFor(() => !alive(lapsedPid), "the lapsed seat's stub to be gone");
  assert.ok(
    swept.output.includes(`[spex-seat-reaper] stopped the seat of ann (5101): its lease ended at ${lapsed.expires_at}`),
    swept.output,
  );
  // hub-5: an active lease is not even asked about; its seat runs on.
  assert.equal(askedActive(s, "5102"), 0);
  assert.equal(stops(s, "5102"), 0);
  assert.ok(alive(activePid), "the active lease's seat runs on");
  // hub-5: an expired lease whose unit is inactive is asked about and
  // left alone.
  assert.ok(askedActive(s, "5103") >= 1);
  assert.equal(stops(s, "5103"), 0);

  // hub-8: the table is the hub's: not a byte of it rewritten, nothing
  // else written beside it, its lock released.
  assert.deepEqual(readFileSync(leasesFile(s)), table);
  assert.deepEqual(readdirSync(s.state).sort(), ["leases.yaml", "locks"]);
  assert.deepEqual(readdirSync(join(s.state, "locks")), []);
  // hub-8: the locks' directory left as the hub made it: the state
  // directory's owner's, owner-only.
  const locks = statSync(join(s.state, "locks"));
  assert.equal(locks.uid, statSync(s.state).uid);
  assert.equal(locks.mode & 0o777, 0o700);

  // A command line it does not know is refused with its usage, exit 2,
  // touching nothing.
  const before = calls(s.log).length;
  const mistaken = await sweepOnce(s, ["--bogus=1"]);
  assert.equal(mistaken.code, 2);
  assert.match(mistaken.output, /spex-seat-reaper: the sweep takes no --bogus\nusage: node reaper\.js/);
  assert.equal(calls(s.log).length, before);
  assert.ok(alive(activePid));

  assert.ok(calls(s.log).every((call) => !call.refused));
  assert.ok(calls(s.systemctlLog).every((call) => !call.refused));
});

test("the sweep waits on a seat's lock a live process holds and, the lease renewed before the lock is released, stops nothing (hub-5)", async () => {
  const s = scenario();
  const pid = startSeat(s, "5201");
  writeLeaseTable(s, { "5201": lease("dee", -60_000) });
  holdLock(s, "5201", process.pid);

  const sweep = startSweep(s, { lockWaitMs: 20_000 });
  await waitFor(
    () => sweep.output().includes(`[spex-seat-reaper] waiting for the lock of 5201 held by pid ${process.pid}`),
    "the sweep to wait on the held lock",
  );
  assert.equal(stops(s, "5201"), 0);

  // The holder records a renewal, then releases the lock, as the hub does.
  writeLeaseTable(s, { "5201": lease("dee", 60 * 60_000) });
  rmSync(lockFile(s, "5201"));
  const code = await sweep.exited;
  assert.equal(code, 0, sweep.output());
  assert.match(sweep.output(), /\[spex-seat-reaper\] left dee \(5201\): its lease is active again/);
  assert.equal(stops(s, "5201"), 0);
  assert.ok(alive(pid), "the renewed seat runs on");
  assert.equal(existsSync(lockFile(s, "5201")), false, "the sweep released the lock it took");
});

test("a stop that fails is logged with its cause, exits 1 and is tried again at the next sweep; a lock whose holder died, or older than fifteen minutes, is replaced (hub-5, hub-8)", async () => {
  const s = scenario();
  const failingPid = startSeat(s, "5301");
  const freedPid = startSeat(s, "5302");
  const agedPid = startSeat(s, "5303");
  writeLeaseTable(s, {
    "5301": lease("eli", -60_000),
    "5302": lease("fox", -60_000),
    "5303": lease("gus", -60_000),
  });
  setScript(s, { nostop: ["5301"] });
  // A lock left by a holder that died: a pid that ran and exited.
  const dead = spawn(process.execPath, ["-e", ""], { stdio: "ignore" });
  await new Promise((resolveExit) => dead.once("exit", resolveExit));
  holdLock(s, "5302", dead.pid as number);
  // A lock a live process wrote sixteen minutes ago: older than any hold.
  // On a host up less than seventeen minutes the before-this-boot rule
  // would replace it too, so the case proves the age rule only past that.
  const agedProvable = uptime() > 17 * 60;
  if (agedProvable) {
    holdLock(s, "5303", process.pid);
    const aged = (Date.now() - 16 * 60_000) / 1000;
    utimesSync(lockFile(s, "5303"), aged, aged);
  }

  const first = await sweepOnce(s);
  assert.equal(first.code, 1, first.output);
  assert.match(
    first.output,
    /\[spex-seat-reaper\] the seat of eli \(5301\) did not stop: the helper's stop 5301 failed: spex-seatctl: stop refused by the test's script; tried again at the next sweep/,
  );
  assert.ok(alive(failingPid), "the seat whose stop failed still runs");
  // The dead holder's lock is cleared at the sweep's start, with no wait,
  // and the other seat's stop goes on beside the failure.
  assert.ok(first.output.includes(`cleared the stale lock of 5302, left by pid ${dead.pid}\n`), first.output);
  assert.equal(stops(s, "5302"), 1);
  await waitFor(() => !alive(freedPid), "the freed seat's stub to be gone");
  assert.match(first.output, /stopped the seat of fox \(5302\)/);
  assert.ok(!first.output.includes("waiting for the lock of 5302"), first.output);
  assert.equal(existsSync(lockFile(s, "5302")), false);
  // hub-5: the aged lock likewise, its holder still running.
  assert.equal(stops(s, "5303"), 1);
  await waitFor(() => !alive(agedPid), "the aged lock's seat's stub to be gone");
  assert.match(first.output, /stopped the seat of gus \(5303\)/);
  if (agedProvable) assert.ok(!first.output.includes("waiting for the lock of 5303"), first.output);
  assert.equal(existsSync(lockFile(s, "5303")), false);

  // The next sweep tries the failed stop again; the stopped seat is left.
  setScript(s, {});
  const second = await sweepOnce(s);
  assert.equal(second.code, 0, second.output);
  assert.equal(stops(s, "5301"), 2);
  await waitFor(() => !alive(failingPid), "the retried seat's stub to be gone");
  assert.match(second.output, /stopped the seat of eli \(5301\)/);
  assert.equal(stops(s, "5302"), 1);
  assert.equal(stops(s, "5303"), 1);

  // A table that is not the hub's stops nothing and exits 1, naming it.
  writeFileSync(leasesFile(s), "{not the hub's table");
  const before = calls(s.log).length;
  const malformed = await sweepOnce(s);
  assert.equal(malformed.code, 1);
  assert.match(malformed.output, /\[spex-seat-reaper\] the lease table cannot be read: .*leases\.yaml/);
  assert.equal(calls(s.log).length, before);
  assert.ok(calls(s.log).every((call) => !call.refused));
});

test("with the locks' directory a link, or missing, the sweep takes no lock, stops nothing and exits 1, making nothing anywhere (hub-5, hub-8)", async () => {
  const s = scenario({ locks: false });
  const pid = startSeat(s, "5401");
  writeLeaseTable(s, { "5401": lease("gil", -60_000) });
  const table = readFileSync(leasesFile(s));
  // The hub's account points locks/ elsewhere: a directory of its own.
  const elsewhere = mkdtempSync(join(tmpdir(), "hub-sweep-elsewhere-"));
  roots.push(elsewhere);
  writeFileSync(join(elsewhere, "sentinel"), "the link's target\n");
  symlinkSync(elsewhere, join(s.state, "locks"));

  const linked = await sweepOnce(s);
  assert.equal(linked.code, 1, linked.output);
  // hub-5: a link is no directory to take a lock in: the seat is not
  // swept, named, and left to the next sweep.
  assert.match(
    linked.output,
    /\[spex-seat-reaper\] not swept: 5401: .*locks is no directory of the state directory's owner; tried again at the next sweep/,
  );
  // hub-5: nor does it clear a lock there.
  assert.match(
    linked.output,
    /\[spex-seat-reaper\] locks not cleared: .*locks is no directory of the state directory's owner; tried again at the next sweep/,
  );
  assert.equal(calls(s.log).filter((call) => call.argv[0] === "stop").length, 0, "the helper stops nobody");
  assert.ok(alive(pid), "the seat runs on");
  // hub-8: nothing is made, moved or changed where the link leads, nor
  // the link itself.
  assert.deepEqual(readdirSync(elsewhere), ["sentinel"]);
  assert.equal(readFileSync(join(elsewhere, "sentinel"), "utf8"), "the link's target\n");
  assert.ok(lstatSync(join(s.state, "locks")).isSymbolicLink());
  assert.deepEqual(readFileSync(leasesFile(s)), table);

  // hub-8: with no locks' directory at all, the sweep makes none — the
  // hub makes it — even run as the state directory's owner.
  rmSync(join(s.state, "locks"));
  const missing = await sweepOnce(s);
  assert.equal(missing.code, 1, missing.output);
  assert.match(
    missing.output,
    /\[spex-seat-reaper\] not swept: 5401: .*locks is missing: the hub makes it; tried again at the next sweep/,
  );
  assert.deepEqual(readdirSync(s.state), ["leases.yaml"]);
  assert.equal(calls(s.log).filter((call) => call.argv[0] === "stop").length, 0, "the helper stops nobody");
  assert.ok(alive(pid), "the seat runs on");
  assert.deepEqual(readFileSync(leasesFile(s)), table);

  // Once the hub has made it again, the next sweep stops the seat.
  mkdirSync(join(s.state, "locks"), { mode: 0o700 });
  const made = await sweepOnce(s);
  assert.equal(made.code, 0, made.output);
  assert.equal(stops(s, "5401"), 1);
  await waitFor(() => !alive(pid), "the seat's stub to be gone");
  assert.ok(calls(s.log).every((call) => !call.refused));
  assert.ok(calls(s.systemctlLog).every((call) => !call.refused));
});

test("the lease table replaced by a link, past its size bound, or holding a key no person id is, takes no lock, stops nothing and names nothing of what it was led to (hub-5, hub-8)", async () => {
  const s = scenario();
  const pid = startSeat(s, "5501");
  // The hub's account points leases.yaml at a table of its own: a lapsed
  // lease for the running seat beside one under a key no person id is.
  const elsewhere = mkdtempSync(join(tmpdir(), "hub-sweep-planted-"));
  roots.push(elsewhere);
  const target = join(elsewhere, "table.json");
  const planted = {
    "5501": lease("planted-login-77", -60_000),
    "SECRET-KEY-77": lease("planted-login-77", -60_000),
  };
  const plantedText = `${JSON.stringify(planted, null, 2)}\n`;
  writeFileSync(target, plantedText, { mode: 0o600 });
  symlinkSync(target, leasesFile(s));
  // A seat's lock left by a holder that died, its seat in no table.
  const dead = spawn(process.execPath, ["-e", ""], { stdio: "ignore" });
  await new Promise((resolveExit) => dead.once("exit", resolveExit));
  holdLock(s, "5502", dead.pid as number);

  const linked = await sweepOnce(s);
  assert.equal(linked.code, 1, linked.output);
  assert.match(linked.output, REFUSED_TABLE);
  // hub-5: the stale lock is cleared all the same, before and apart from
  // the table's read.
  const clearedLine = `[spex-seat-reaper] cleared the stale lock of 5502, left by pid ${dead.pid}\n`;
  assert.ok(linked.stdout.includes(clearedLine), linked.stdout);
  assert.ok(linked.stdout.indexOf(clearedLine) < linked.stdout.search(REFUSED_TABLE), linked.stdout);
  assert.equal(existsSync(lockFile(s, "5502")), false);
  // hub-8: nothing of what the link led to is named.
  for (const named of ["SECRET-KEY-77", "planted-login-77", target, elsewhere]) {
    assert.ok(!linked.output.includes(named), `the output names ${named}: ${linked.output}`);
  }
  // hub-5: no unit asked about, no lock taken, nobody stopped.
  assert.equal(askedActive(s, "5501"), 0);
  assert.deepEqual(readdirSync(join(s.state, "locks")), []);
  assert.equal(allStops(s), 0, "the helper stops nobody");
  assert.ok(alive(pid), "the seat runs on");
  // hub-8: nothing changed where the link leads, nor the link itself.
  assert.deepEqual(readdirSync(elsewhere), ["table.json"]);
  assert.equal(readFileSync(target, "utf8"), plantedText);
  assert.ok(lstatSync(leasesFile(s)).isSymbolicLink());

  // A link to a table that is the hub's in every byte — a lapsed lease
  // for the running seat alone — is refused all the same: the link is
  // what refuses it, not its content.
  rmSync(leasesFile(s));
  const valid = join(elsewhere, "valid.json");
  writeFileSync(valid, `${JSON.stringify({ "5501": lease("valid-login-77", -60_000) }, null, 2)}\n`, { mode: 0o600 });
  symlinkSync(valid, leasesFile(s));
  const validLinked = await sweepOnce(s);
  assert.equal(validLinked.code, 1, validLinked.output);
  assert.match(validLinked.output, REFUSED_TABLE);
  for (const named of ["valid-login-77", valid, elsewhere]) {
    assert.ok(!validLinked.output.includes(named), `the output names ${named}: ${validLinked.output}`);
  }
  assert.equal(askedActive(s, "5501"), 0);
  assert.deepEqual(readdirSync(join(s.state, "locks")), []);
  assert.equal(allStops(s), 0, "the helper stops nobody");
  assert.ok(alive(pid), "the seat runs on");
  assert.ok(lstatSync(leasesFile(s)).isSymbolicLink());

  // A table past its size bound, a regular file of the owner, is refused
  // whole too.
  rmSync(leasesFile(s));
  writeLeaseTable(s, { "5501": { ...lease("hal", -60_000), login: "h".repeat(1_100_000) } });
  const oversized = await sweepOnce(s);
  assert.equal(oversized.code, 1, oversized.output);
  assert.match(oversized.output, REFUSED_TABLE);
  assert.equal(askedActive(s, "5501"), 0);
  assert.equal(allStops(s), 0, "the helper stops nobody");
  assert.ok(alive(pid), "the seat runs on");

  // The same table as a regular file of the state directory's owner: its
  // key that is no person id refuses it whole, the refusal still naming
  // no key and no login.
  rmSync(leasesFile(s));
  writeLeaseTable(s, planted);
  const malformed = await sweepOnce(s);
  assert.equal(malformed.code, 1, malformed.output);
  assert.match(malformed.output, REFUSED_TABLE);
  for (const named of ["SECRET-KEY-77", "planted-login-77"]) {
    assert.ok(!malformed.output.includes(named), `the output names ${named}: ${malformed.output}`);
  }
  assert.deepEqual(readdirSync(join(s.state, "locks")), []);
  assert.equal(allStops(s), 0, "the helper stops nobody");
  assert.ok(alive(pid), "the seat runs on");

  // The hub's own table in its place, the seat is swept.
  writeLeaseTable(s, { "5501": lease("hal", -60_000) });
  const plain = await sweepOnce(s);
  assert.equal(plain.code, 0, plain.output);
  assert.equal(stops(s, "5501"), 1);
  await waitFor(() => !alive(pid), "the seat's stub to be gone");
  assert.ok(calls(s.log).every((call) => !call.refused));
});

test("the lease table replaced by a FIFO is refused at once: the sweep stops nothing and does not hang (hub-5, hub-8)", { timeout: 30_000 }, async (t) => {
  const s = scenario();
  const pid = startSeat(s, "5601");
  const made = spawnSync("mkfifo", [leasesFile(s)], { encoding: "utf8" });
  if (made.error) {
    // No mkfifo on this host: the FIFO case is not run here.
    t.skip(`mkfifo cannot run: ${made.error.message}`);
    return;
  }
  assert.equal(made.status, 0, made.stderr);
  assert.ok(lstatSync(leasesFile(s)).isFIFO());

  // Awaited under this test's own timeout: a sweep blocked on the FIFO,
  // which no process writes, fails it.
  const fifo = await sweepOnce(s);
  assert.equal(fifo.code, 1, fifo.output);
  assert.match(fifo.output, REFUSED_TABLE);
  assert.deepEqual(readdirSync(join(s.state, "locks")), []);
  assert.equal(allStops(s), 0, "the helper stops nobody");
  assert.ok(alive(pid), "the seat runs on");
  assert.ok(lstatSync(leasesFile(s)).isFIFO(), "the FIFO left as it was");
});

test("a login or an expiry holding a control character is logged with it replaced, so the table forges no line of the sweep's log (hub-5, hub-8)", async () => {
  const s = scenario();
  const stoppedPid = startSeat(s, "5701");
  const failingPid = startSeat(s, "5702");
  // Date.parse reads a parenthesised comment, so an expiry may hold a
  // newline too.
  const expiry = "Oct 24 2020 (\nforged: the expiry's line)";
  writeLeaseTable(s, {
    "5701": { ...lease("ivy\nforged: every seat stopped\r", -60_000), expires_at: expiry },
    "5702": lease("jo\u001b[2Kforged\u007f", -60_000),
  });
  setScript(s, { nostop: ["5702"] });

  const swept = await sweepOnce(s);
  assert.equal(swept.code, 1, swept.output);
  assert.equal(stops(s, "5701"), 1);
  await waitFor(() => !alive(stoppedPid), "the stopped seat's stub to be gone");
  assert.ok(alive(failingPid), "the seat whose stop failed still runs");
  // Each line shows the replaced characters.
  assert.ok(
    swept.stdout.includes(
      "[spex-seat-reaper] stopped the seat of ivy?forged: every seat stopped? (5701): its lease ended at Oct 24 2020 (?forged: the expiry's line)\n",
    ),
    swept.stdout,
  );
  assert.ok(
    swept.stdout.includes("[spex-seat-reaper] the seat of jo?[2Kforged? (5702) did not stop: "),
    swept.stdout,
  );
  // Every line of the sweep's standard output is one of its own.
  assert.ok(swept.stdout.endsWith("\n"), swept.stdout);
  for (const line of swept.stdout.slice(0, -1).split("\n")) {
    assert.ok(line.startsWith("[spex-seat-reaper] "), `a line not the sweep's: ${JSON.stringify(line)}`);
  }
  assert.doesNotMatch(swept.output, /[\x00-\x09\x0b-\x1f\x7f]/, "no control character but the line ends");
});

test("the sweep clears at each sweep a lock whose holder is gone, its seat's lease active or not, and leaves a live holder's (hub-5, hub-8)", async () => {
  const s = scenario();
  writeLeaseTable(s, {
    "5801": lease("kai", 60 * 60_000),
    "5802": lease("lea", -60_000),
    "5803": lease("mo", 60 * 60_000),
  });
  // An active lease's lock left by a holder that died: a pid that ran and
  // exited.
  const dead = spawn(process.execPath, ["-e", ""], { stdio: "ignore" });
  await new Promise((resolveExit) => dead.once("exit", resolveExit));
  const deadPid = dead.pid as number;
  holdLock(s, "5801", deadPid);
  // An expired lease's lock, its unit inactive, still empty two seconds
  // after it was made: a holder that died between the create and the write.
  writeFileSync(lockFile(s, "5802"), "", { flag: "wx", mode: 0o644 });
  const made = (Date.now() - 2000) / 1000;
  utimesSync(lockFile(s, "5802"), made, made);
  // An active lease's lock a live process holds.
  holdLock(s, "5803", process.pid);
  // A lock planted as a link, its seat in no table, made two seconds ago
  // by its own time: no pid in it, and nothing to open.
  const elsewhere = mkdtempSync(join(tmpdir(), "hub-sweep-linked-lock-"));
  roots.push(elsewhere);
  const target = join(elsewhere, "target");
  writeFileSync(target, "the link's target\n", { mode: 0o644 });
  const targetBefore = statSync(target);
  symlinkSync(target, lockFile(s, "5804"));
  lutimesSync(lockFile(s, "5804"), made, made);
  assert.ok(Date.now() - lstatSync(lockFile(s, "5804")).mtimeMs > 1000, "the link is older than a second");

  const swept = await sweepOnce(s);
  assert.equal(swept.code, 0, swept.output);
  // hub-5: both stale locks cleared, whatever their leases, each named.
  assert.equal(existsSync(lockFile(s, "5801")), false);
  assert.equal(existsSync(lockFile(s, "5802")), false);
  assert.ok(
    swept.stdout.includes(`[spex-seat-reaper] cleared the stale lock of 5801, left by pid ${deadPid}\n`),
    swept.stdout,
  );
  assert.ok(
    swept.stdout.includes("[spex-seat-reaper] cleared the stale lock of 5802, left by a process that wrote no pid\n"),
    swept.stdout,
  );
  // hub-5: the link is removed, never opened, and what it led to is
  // left as it was.
  assert.ok(!readdirSync(join(s.state, "locks")).includes("5804.lock"), "the planted link is removed");
  assert.ok(
    swept.stdout.includes("[spex-seat-reaper] cleared the stale lock of 5804, left by a process that wrote no pid\n"),
    swept.stdout,
  );
  const targetAfter = statSync(target);
  assert.equal(targetAfter.mtimeMs, targetBefore.mtimeMs);
  assert.equal(targetAfter.ctimeMs, targetBefore.ctimeMs);
  assert.equal(readFileSync(target, "utf8"), "the link's target\n");
  assert.deepEqual(readdirSync(elsewhere), ["target"]);
  // hub-5: a live holder's lock is left as it was.
  assert.equal(readFileSync(lockFile(s, "5803"), "utf8"), `${process.pid}\n`);
  assert.ok(!swept.output.includes("of 5803"), swept.output);
  // hub-5: clearing a lock stops nobody.
  assert.equal(allStops(s), 0, "the helper stops nobody");
  assert.ok(calls(s.systemctlLog).every((call) => !call.refused));
});

test("a lock whose holder dies while the sweep waits on it is replaced at once and the seat stopped (hub-5, hub-8)", async () => {
  const s = scenario();
  const pid = startSeat(s, "5901");
  writeLeaseTable(s, { "5901": lease("ned", -60_000) });
  // A live holder, as a hub in the middle of a hold.
  const holder = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  children.add(holder);
  const holderExited = new Promise((resolveExit) => holder.once("exit", resolveExit));
  const holderPid = holder.pid as number;
  holdLock(s, "5901", holderPid);

  const sweep = startSweep(s, { lockWaitMs: 20_000 });
  await waitFor(
    () => sweep.output().includes(`[spex-seat-reaper] waiting for the lock of 5901 held by pid ${holderPid}\n`),
    "the sweep to wait on the live holder",
  );
  assert.equal(stops(s, "5901"), 0);
  // The holder dies holding the lock, as a hub that crashes.
  holder.kill("SIGKILL");
  await holderExited;
  children.delete(holder);

  const code = await sweep.exited;
  assert.equal(code, 0, sweep.output());
  // hub-5: the lock gone stale in its way replaced, the seat stopped.
  assert.equal(stops(s, "5901"), 1);
  await waitFor(() => !alive(pid), "the seat's stub to be gone");
  assert.match(sweep.output(), /\[spex-seat-reaper\] stopped the seat of ned \(5901\)/);
  assert.equal(existsSync(lockFile(s, "5901")), false, "the sweep released the lock it took");
  assert.ok(calls(s.log).every((call) => !call.refused));
});
