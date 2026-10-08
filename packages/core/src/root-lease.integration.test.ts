// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// storage-27: the root lease (storage-26, DR-108) over one home with real
// competing processes and a fixed machine identity, for the core's store
// and the storage Git reservation alike.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";

import { StateRootHeldError, StateRootLeaseError, acquireRootLease, probeProcess, type ProbeResult, type RootLeaseOwner } from "./root-lease.js";
import { Store } from "./store.js";
import { reserveStorageHome, storageMachineIdentity } from "./storage-git.js";
import { scratchDir } from "./testing/scratch.js";

const machineIdentity = "machine-id:v1:00000000-0000-4000-8000-0000000000aa";
const leaseModule = new URL("./root-lease.js", import.meta.url).href;

function writeLock(dir: string, owner: Record<string, unknown>, file = "owner.json"): void {
  const lock = join(dir, ".lease");
  mkdirSync(lock, { mode: 0o700 });
  writeFileSync(join(lock, file), JSON.stringify(owner), { mode: 0o600 });
}

function deadOwner(dir: string, overrides: Record<string, unknown> = {}): RootLeaseOwner {
  const owner = { pid: 4242, hostname: machineIdentity, acquiredAt: Date.now(), token: randomUUID(), ...overrides } as RootLeaseOwner;
  writeLock(dir, owner as unknown as Record<string, unknown>);
  return owner;
}

const dead = (): ProbeResult => ({ state: "dead", code: "ESRCH" });
const retiredTokens = (dir: string) => (existsSync(join(dir, ".lease.retired")) ? readdirSync(join(dir, ".lease.retired")).sort() : []);
const snapshot = (dir: string) => readdirSync(dir).sort().join(",");

/** A real process holding the lease of `dir` until its stdin closes. */
async function holdInChild(dir: string): Promise<{ child: ChildProcess; pid: number; token: string }> {
  const source = `
    import { acquireRootLease } from ${JSON.stringify(leaseModule)};
    const lease = acquireRootLease(${JSON.stringify(dir)}, { machineIdentity: ${JSON.stringify(machineIdentity)} });
    process.stdout.write(lease.token + "\\n");
    process.stdin.once("end", () => { lease.release(); process.exit(0); });
    process.stdin.resume();
  `;
  const child = spawn(process.execPath, ["--input-type=module", "--eval", source], { stdio: ["pipe", "pipe", "pipe"] });
  let stderr = "";
  child.stderr?.on("data", (chunk) => (stderr += chunk.toString()));
  const token = await new Promise<string>((resolveToken, rejectToken) => {
    let buffer = "";
    child.stdout?.on("data", (chunk) => {
      buffer += chunk.toString();
      const newline = buffer.indexOf("\n");
      if (newline >= 0) resolveToken(buffer.slice(0, newline));
    });
    child.once("exit", (code) => rejectToken(new Error(`holder exited ${code}: ${stderr}`)));
  });
  return { child, pid: child.pid as number, token };
}

const exited = (child: ChildProcess) => new Promise<void>((resolveExit) => (child.exitCode !== null || child.signalCode !== null ? resolveExit() : child.once("exit", () => resolveExit())));

test("storage-27: a killed owner of this machine is reclaimed by the store and by a storage command, its record retained", async () => {
  const dir = scratchDir("spex-root-lease-");
  const holder = await holdInChild(dir);
  holder.child.kill("SIGKILL");
  await exited(holder.child);

  const store = new Store({ dir, machineIdentity });
  assert.deepEqual(retiredTokens(dir), [holder.token]);
  assert.equal(JSON.parse(readFileSync(join(dir, ".lease.retired", holder.token, "owner.json"), "utf8")).pid, holder.pid);
  store.close();
  assert.equal(existsSync(join(dir, ".lease")), false);
  assert.equal(retiredTokens(dir).length, 2, "a normal release retires the same way");

  const second = await holdInChild(dir);
  second.child.kill("SIGKILL");
  await exited(second.child);
  const release = reserveStorageHome(dir, machineIdentity);
  assert.ok(retiredTokens(dir).includes(second.token));
  release();
  assert.equal(existsSync(join(dir, ".lease")), false);
  assert.equal(retiredTokens(dir).length, 4);
  for (const token of retiredTokens(dir)) assert.ok(existsSync(join(dir, ".lease.retired", token, "owner.json")));
});

test("storage-27: a live owner refuses naming its pid, for the store and the storage command alike", async () => {
  const dir = scratchDir("spex-root-lease-");
  const holder = await holdInChild(dir);
  try {
    assert.throws(() => new Store({ dir, machineIdentity }), (error: unknown) => {
      assert.ok(error instanceof StateRootHeldError);
      assert.equal(error.holder.pid, holder.pid);
      assert.equal(error.machine, "local");
      assert.match(error.message, new RegExp(`pid ${holder.pid} on this machine`));
      return true;
    });
    assert.throws(() => reserveStorageHome(dir, machineIdentity), new RegExp(`stop the Spex core before changing stored data; .*pid ${holder.pid}`));
    assert.deepEqual(retiredTokens(dir), []);
  } finally {
    holder.child.stdin?.end();
    await exited(holder.child);
  }
  assert.deepEqual(retiredTokens(dir), [holder.token]);
});

test("storage-27: another machine's identity, legacy host names, and a value that only looks tagged", () => {
  const dir = scratchDir("spex-root-lease-");
  const other = `machine-id:v1:${randomUUID()}`;
  deadOwner(dir, { hostname: other });
  assert.throws(() => acquireRootLease(dir, { machineIdentity, probe: dead }), (error: unknown) => {
    assert.ok(error instanceof StateRootHeldError);
    assert.equal(error.machine, "foreign");
    assert.match(error.message, /another machine \(identity machine-id:v1:/);
    assert.doesNotMatch(error.message, /on machine-id/);
    return true;
  });
  rmSync(join(dir, ".lease"), { recursive: true });

  const legacy = deadOwner(dir, { hostname: hostname() });
  const lease = acquireRootLease(dir, { machineIdentity, probe: dead });
  assert.deepEqual(retiredTokens(dir), [legacy.token]);
  assert.equal(JSON.parse(readFileSync(join(dir, ".lease", "owner.json"), "utf8")).hostname, machineIdentity);
  lease.release();

  deadOwner(dir, { hostname: `${hostname()}.renamed` });
  assert.throws(() => acquireRootLease(dir, { machineIdentity, probe: dead }), (error: unknown) => {
    assert.ok(error instanceof StateRootHeldError);
    assert.equal(error.machine, "foreign");
    assert.match(error.message, /on .*\.renamed/);
    return true;
  });
  rmSync(join(dir, ".lease"), { recursive: true });

  deadOwner(dir, { hostname: "machine-id:v1:not-a-uuid" });
  assert.throws(() => acquireRootLease(dir, { machineIdentity, probe: dead }), (error: unknown) => {
    assert.ok(error instanceof StateRootLeaseError);
    assert.match(error.message, /unverifiable/);
    return true;
  });
});

test("storage-27: malformed, tokenless, empty, dangling, and unprobeable owners refuse without changing the home", () => {
  const cases: [string, (dir: string) => void][] = [
    ["not json", (dir) => { mkdirSync(join(dir, ".lease")); writeFileSync(join(dir, ".lease", "owner.json"), "not json"); }],
    ["tokenless", (dir) => writeLock(dir, { pid: 4242, hostname: machineIdentity, acquiredAt: Date.now() })],
    ["extra key", (dir) => writeLock(dir, { pid: 4242, hostname: machineIdentity, acquiredAt: Date.now(), token: randomUUID(), extra: 1 })],
    ["another file", (dir) => writeLock(dir, { pid: 4242, hostname: machineIdentity, acquiredAt: Date.now(), token: randomUUID() }, "other.json")],
    ["empty", (dir) => mkdirSync(join(dir, ".lease"))],
    ["dangling symlink", (dir) => symlinkSync(join(dir, "nowhere"), join(dir, ".lease"))],
    ["a file", (dir) => writeFileSync(join(dir, ".lease"), "")],
  ];
  for (const [label, arrange] of cases) {
    const dir = scratchDir("spex-root-lease-");
    arrange(dir);
    const before = snapshot(dir);
    assert.throws(() => acquireRootLease(dir, { machineIdentity, probe: dead }), (error: unknown) => {
      assert.ok(error instanceof StateRootLeaseError, label);
      assert.match(error.message, /cannot be verified/, label);
      return true;
    }, label);
    assert.throws(() => reserveStorageHome(dir, machineIdentity), /stop the Spex core before changing stored data; .*cannot be verified/, label);
    assert.equal(snapshot(dir), before, label);
  }
  const dir = scratchDir("spex-root-lease-");
  deadOwner(dir);
  const before = snapshot(dir);
  // A probe failing otherwise than ESRCH refuses naming the error's code.
  assert.throws(() => acquireRootLease(dir, { machineIdentity, probe: () => ({ state: "unknown", code: "EACCES" }) }), (error: unknown) => {
    assert.ok(error instanceof StateRootLeaseError);
    assert.match(error.message, /the owner process cannot be probed \(EACCES\)/);
    return true;
  });
  assert.equal(snapshot(dir), before);
  // The real probe keeps the code it read: ESRCH for an exited process.
  assert.deepEqual(probeProcess(spawnSync(process.execPath, ["-e", ""]).pid as number), { state: "dead", code: "ESRCH" });
  assert.deepEqual(probeProcess(process.pid), { state: "live" });
});

test("storage-27: a tagged owner.json open to the group or others refuses as malformed; a legacy one is read whatever its mode", () => {
  // Every writer naming its machine publishes its owner 0600.
  const dir = scratchDir("spex-root-lease-");
  deadOwner(dir);
  chmodSync(join(dir, ".lease", "owner.json"), 0o644);
  const before = snapshot(dir);
  assert.throws(() => acquireRootLease(dir, { machineIdentity, probe: dead }), (error: unknown) => {
    assert.ok(error instanceof StateRootLeaseError);
    assert.match(error.message, /the owner record is malformed/);
    return true;
  });
  assert.throws(() => new Store({ dir, machineIdentity }), /the owner record is malformed/);
  assert.throws(() => reserveStorageHome(dir, machineIdentity), /stop the Spex core before changing stored data; .*the owner record is malformed/);
  assert.equal(snapshot(dir), before);
  assert.equal(existsSync(join(dir, ".lease.retired")), false, "nothing was retired");

  // A dead local owner an older core left, untagged and written with the
  // default mode, is reclaimed under the old rule by every writer.
  const deadPid = spawnSync(process.execPath, ["-e", ""]).pid as number;
  const takes: [string, (home: string) => () => void][] = [
    ["acquireRootLease", (home) => { const lease = acquireRootLease(home, { machineIdentity }); return () => lease.release(); }],
    ["Store", (home) => { const store = new Store({ dir: home, machineIdentity }); return () => store.close(); }],
    ["reserveStorageHome", (home) => reserveStorageHome(home, machineIdentity)],
  ];
  for (const [label, take] of takes) {
    const home = scratchDir("spex-root-lease-");
    const legacy = deadOwner(home, { pid: deadPid, hostname: hostname() });
    chmodSync(join(home, ".lease", "owner.json"), 0o644);
    const release = take(home);
    assert.ok(existsSync(join(home, ".lease.retired", legacy.token, "owner.json")), label);
    assert.equal(JSON.parse(readFileSync(join(home, ".lease", "owner.json"), "utf8")).hostname, machineIdentity, label);
    release();
  }
});

test("storage-27: a .lease.retired/ parent already there is used when private and refuses when not", () => {
  // Another writer created the parent first: this one validates it and
  // retires into it.
  const dir = scratchDir("spex-root-lease-");
  mkdirSync(join(dir, ".lease.retired"), { mode: 0o700 });
  const o = deadOwner(dir);
  acquireRootLease(dir, { machineIdentity, probe: dead }).release();
  assert.ok(existsSync(join(dir, ".lease.retired", o.token, "owner.json")));
  assert.equal(retiredTokens(dir).length, 2);

  // A parent open to others, or a symlink, refuses with nothing moved.
  for (const arrange of [
    (home: string) => { mkdirSync(join(home, ".lease.retired")); chmodSync(join(home, ".lease.retired"), 0o755); },
    (home: string) => { mkdirSync(join(home, "elsewhere"), { mode: 0o700 }); symlinkSync(join(home, "elsewhere"), join(home, ".lease.retired")); },
  ]) {
    const home = scratchDir("spex-root-lease-");
    arrange(home);
    const owner = deadOwner(home);
    assert.throws(() => acquireRootLease(home, { machineIdentity, probe: dead }), (error: unknown) => {
      assert.ok(error instanceof StateRootLeaseError);
      assert.match(error.message, /the owner record is malformed/);
      return true;
    });
    assert.equal(JSON.parse(readFileSync(join(home, ".lease", "owner.json"), "utf8")).token, owner.token, "the lease stays where it was");
  }
});

test("storage-27: a home the writer cannot write refuses at once naming the error, never as a race", () => {
  const dir = scratchDir("spex-root-lease-");
  chmodSync(dir, 0o500);
  try {
    for (const take of [
      () => acquireRootLease(dir, { machineIdentity }),
      () => new Store({ dir, machineIdentity }),
      () => reserveStorageHome(dir, machineIdentity),
    ]) {
      assert.throws(take, (error: unknown) => {
        assert.match((error as Error).message, /the lock cannot be inspected \(EACCES\)/);
        assert.doesNotMatch((error as Error).message, /another writer published/);
        return true;
      });
    }
    assert.deepEqual(readdirSync(dir), [], "nothing staged or published");
  } finally {
    chmodSync(dir, 0o700);
  }
});

test("storage-27: a delayed reclaimer meets the occupied retired target and the successor stays authoritative", async () => {
  const dir = scratchDir("spex-root-lease-");
  // Owner O is dead; another reclaimer already retired O and published N.
  const o = deadOwner(dir);
  mkdirSync(join(dir, ".lease.retired", o.token), { recursive: true, mode: 0o700 });
  writeFileSync(join(dir, ".lease.retired", o.token, "owner.json"), JSON.stringify(o), { mode: 0o600 });
  const before = snapshot(join(dir, ".lease.retired"));
  assert.throws(() => acquireRootLease(dir, { machineIdentity, probe: dead }), (error: unknown) => {
    assert.ok(error instanceof StateRootLeaseError);
    assert.match(error.message, /already occupied/);
    return true;
  });
  assert.equal(snapshot(join(dir, ".lease.retired")), before);
  assert.ok(existsSync(join(dir, ".lease", "owner.json")), "nothing was moved or deleted");

  // A successor N published by a live process is never touched by a
  // contender that read a dead O earlier: it meets N live.
  rmSync(join(dir, ".lease"), { recursive: true });
  const holder = await holdInChild(dir);
  try {
    assert.throws(() => acquireRootLease(dir, { machineIdentity }), (error: unknown) => {
      assert.ok(error instanceof StateRootHeldError);
      assert.equal(error.holder.token, holder.token);
      return true;
    });
    assert.equal(JSON.parse(readFileSync(join(dir, ".lease", "owner.json"), "utf8")).token, holder.token);
  } finally {
    holder.child.stdin?.end();
    await exited(holder.child);
  }
});

test("storage-27: a writer publishing between the inspection and the rename leaves the contender refusing", () => {
  const dir = scratchDir("spex-root-lease-");
  let published: { token: string } | undefined;
  assert.throws(() => acquireRootLease(dir, {
    machineIdentity,
    _testBeforePublish: () => {
      if (published) return;
      published = acquireRootLease(dir, { machineIdentity });
    },
  }), (error: unknown) => {
    assert.ok(error instanceof StateRootHeldError);
    assert.equal(error.holder.pid, process.pid);
    return true;
  });
  assert.equal(JSON.parse(readFileSync(join(dir, ".lease", "owner.json"), "utf8")).token, published?.token);
  assert.deepEqual(readdirSync(dir).filter((name) => name.startsWith(".lease.stage")), []);
});

test("storage-27: a moved owner whose token differs fails closed with the moved directory intact", () => {
  const dir = scratchDir("spex-root-lease-");
  const o = deadOwner(dir);
  assert.throws(() => acquireRootLease(dir, {
    machineIdentity,
    probe: dead,
    _testAfterRetireRename: (target) => writeFileSync(join(target, "owner.json"), JSON.stringify({ ...o, token: randomUUID() })),
  }), (error: unknown) => {
    assert.ok(error instanceof StateRootLeaseError);
    assert.match(error.message, /token changed/);
    return true;
  });
  assert.equal(existsSync(join(dir, ".lease")), false);
  assert.ok(existsSync(join(dir, ".lease.retired", o.token, "owner.json")));
  assert.ok(lstatSync(join(dir, ".lease.retired")).isDirectory());
});

test("storage-27: a former-layout .lock held live or by another machine keeps the core out; a dead one of this machine is left", async () => {
  const dir = scratchDir("spex-root-lease-");
  const former = (owner: Record<string, unknown>) => {
    mkdirSync(join(dir, ".lock"), { recursive: true, mode: 0o700 });
    writeFileSync(join(dir, ".lock", "owner.json"), JSON.stringify({ acquiredAt: 1, token: "former", ...owner }), { mode: 0o600 });
  };
  const holder = await holdInChild(scratchDir("spex-root-lease-other-"));
  try {
    former({ pid: holder.pid, hostname: hostname() });
    assert.throws(() => new Store({ dir, machineIdentity }), (error: unknown) => {
      assert.ok(error instanceof StateRootHeldError);
      assert.equal(error.holder.pid, holder.pid);
      assert.equal(error.lock, join(dir, ".lock"));
      return true;
    });
    assert.equal(existsSync(join(dir, ".lease")), false, "the refused store leaves no lease");
  } finally {
    holder.child.stdin?.end();
    await exited(holder.child);
  }
  former({ pid: holder.pid, hostname: `machine-id:v1:${randomUUID()}` });
  assert.throws(() => new Store({ dir, machineIdentity }), (error: unknown) => {
    assert.ok(error instanceof StateRootHeldError);
    assert.equal(error.machine, "foreign");
    assert.match(error.message, /another machine \(identity machine-id:v1:/);
    return true;
  });
  former({ pid: holder.pid, hostname: "machine-id:v1:not-a-uuid" });
  assert.throws(() => new Store({ dir, machineIdentity }), /unverifiable/);
  assert.equal(existsSync(join(dir, ".lease")), false);
  former({ pid: holder.pid, hostname: machineIdentity });
  new Store({ dir, machineIdentity }).close();
  assert.equal(JSON.parse(readFileSync(join(dir, ".lock", "owner.json"), "utf8")).pid, holder.pid, "left for the migration");
});

test("storage-27: a storage command with an unavailable identity refuses before any change, naming the file", async () => {
  const xdg = scratchDir("spex-xdg-");
  mkdirSync(join(xdg, "playbook"), { recursive: true, mode: 0o700 });
  writeFileSync(join(xdg, "playbook", "machine-id"), "nonsense\n", { mode: 0o600 });
  const previous = process.env.XDG_STATE_HOME;
  process.env.XDG_STATE_HOME = xdg;
  try {
    await assert.rejects(storageMachineIdentity(), (error: Error) => {
      assert.match(error.message, /^Spex cannot identify this machine: /);
      assert.ok(error.message.includes(join(xdg, "playbook", "machine-id")));
      return true;
    });
    assert.equal(readFileSync(join(xdg, "playbook", "machine-id"), "utf8"), "nonsense\n");
  } finally {
    if (previous === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = previous;
  }
});
