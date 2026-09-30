// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// storage-25: the root lease (storage-24, DR-093) over one home with real
// competing processes and a fixed machine identity, for the core's store
// and the storage Git reservation alike.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
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

import { StateRootHeldError, StateRootLeaseError, acquireRootLease, type RootLeaseOwner } from "./root-lease.js";
import { Store } from "./store.js";
import { reserveStorageHome, storageMachineIdentity } from "./storage-git.js";
import { scratchDir } from "./testing/scratch.js";

const machineIdentity = "machine-id:v1:00000000-0000-4000-8000-0000000000aa";
const leaseModule = new URL("./root-lease.js", import.meta.url).href;

function writeLock(dir: string, owner: Record<string, unknown>, file = "owner.json"): void {
  const lock = join(dir, ".lock");
  mkdirSync(lock, { mode: 0o700 });
  writeFileSync(join(lock, file), JSON.stringify(owner), { mode: 0o600 });
}

function deadOwner(dir: string, overrides: Record<string, unknown> = {}): RootLeaseOwner {
  const owner = { pid: 4242, hostname: machineIdentity, acquiredAt: Date.now(), token: randomUUID(), ...overrides } as RootLeaseOwner;
  writeLock(dir, owner as unknown as Record<string, unknown>);
  return owner;
}

const dead = () => "dead" as const;
const retiredTokens = (dir: string) => (existsSync(join(dir, ".lock.retired")) ? readdirSync(join(dir, ".lock.retired")).sort() : []);
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

test("storage-25: a killed owner of this machine is reclaimed by the store and by a storage command, its record retained", async () => {
  const dir = scratchDir("spex-root-lease-");
  const holder = await holdInChild(dir);
  holder.child.kill("SIGKILL");
  await exited(holder.child);

  const store = new Store({ dir, machineIdentity });
  assert.deepEqual(retiredTokens(dir), [holder.token]);
  assert.equal(JSON.parse(readFileSync(join(dir, ".lock.retired", holder.token, "owner.json"), "utf8")).pid, holder.pid);
  store.close();
  assert.equal(existsSync(join(dir, ".lock")), false);
  assert.equal(retiredTokens(dir).length, 2, "a normal release retires the same way");

  const second = await holdInChild(dir);
  second.child.kill("SIGKILL");
  await exited(second.child);
  const release = reserveStorageHome(dir, machineIdentity);
  assert.ok(retiredTokens(dir).includes(second.token));
  release();
  assert.equal(existsSync(join(dir, ".lock")), false);
  assert.equal(retiredTokens(dir).length, 4);
  for (const token of retiredTokens(dir)) assert.ok(existsSync(join(dir, ".lock.retired", token, "owner.json")));
});

test("storage-25: a live owner refuses naming its pid, for the store and the storage command alike", async () => {
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

test("storage-25: another machine's identity, legacy host names, and a value that only looks tagged", () => {
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
  rmSync(join(dir, ".lock"), { recursive: true });

  const legacy = deadOwner(dir, { hostname: hostname() });
  const lease = acquireRootLease(dir, { machineIdentity, probe: dead });
  assert.deepEqual(retiredTokens(dir), [legacy.token]);
  assert.equal(JSON.parse(readFileSync(join(dir, ".lock", "owner.json"), "utf8")).hostname, machineIdentity);
  lease.release();

  deadOwner(dir, { hostname: `${hostname()}.renamed` });
  assert.throws(() => acquireRootLease(dir, { machineIdentity, probe: dead }), (error: unknown) => {
    assert.ok(error instanceof StateRootHeldError);
    assert.equal(error.machine, "foreign");
    assert.match(error.message, /on .*\.renamed/);
    return true;
  });
  rmSync(join(dir, ".lock"), { recursive: true });

  deadOwner(dir, { hostname: "machine-id:v1:not-a-uuid" });
  assert.throws(() => acquireRootLease(dir, { machineIdentity, probe: dead }), (error: unknown) => {
    assert.ok(error instanceof StateRootLeaseError);
    assert.match(error.message, /unverifiable/);
    return true;
  });
});

test("storage-25: malformed, tokenless, empty, dangling, and unprobeable owners refuse without changing the home", () => {
  const cases: [string, (dir: string) => void][] = [
    ["not json", (dir) => { mkdirSync(join(dir, ".lock")); writeFileSync(join(dir, ".lock", "owner.json"), "not json"); }],
    ["tokenless", (dir) => writeLock(dir, { pid: 4242, hostname: machineIdentity, acquiredAt: Date.now() })],
    ["extra key", (dir) => writeLock(dir, { pid: 4242, hostname: machineIdentity, acquiredAt: Date.now(), token: randomUUID(), extra: 1 })],
    ["another file", (dir) => writeLock(dir, { pid: 4242, hostname: machineIdentity, acquiredAt: Date.now(), token: randomUUID() }, "other.json")],
    ["empty", (dir) => mkdirSync(join(dir, ".lock"))],
    ["dangling symlink", (dir) => symlinkSync(join(dir, "nowhere"), join(dir, ".lock"))],
    ["a file", (dir) => writeFileSync(join(dir, ".lock"), "")],
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
  assert.throws(() => acquireRootLease(dir, { machineIdentity, probe: () => "unknown" }), (error: unknown) => {
    assert.ok(error instanceof StateRootLeaseError);
    assert.match(error.message, /cannot be probed \(unknown\)/);
    return true;
  });
  assert.equal(snapshot(dir), before);
});

test("storage-25: a delayed reclaimer meets the occupied retired target and the successor stays authoritative", async () => {
  const dir = scratchDir("spex-root-lease-");
  // Owner O is dead; another reclaimer already retired O and published N.
  const o = deadOwner(dir);
  mkdirSync(join(dir, ".lock.retired", o.token), { recursive: true, mode: 0o700 });
  writeFileSync(join(dir, ".lock.retired", o.token, "owner.json"), JSON.stringify(o), { mode: 0o600 });
  const before = snapshot(join(dir, ".lock.retired"));
  assert.throws(() => acquireRootLease(dir, { machineIdentity, probe: dead }), (error: unknown) => {
    assert.ok(error instanceof StateRootLeaseError);
    assert.match(error.message, /already occupied/);
    return true;
  });
  assert.equal(snapshot(join(dir, ".lock.retired")), before);
  assert.ok(existsSync(join(dir, ".lock", "owner.json")), "nothing was moved or deleted");

  // A successor N published by a live process is never touched by a
  // contender that read a dead O earlier: it meets N live.
  rmSync(join(dir, ".lock"), { recursive: true });
  const holder = await holdInChild(dir);
  try {
    assert.throws(() => acquireRootLease(dir, { machineIdentity }), (error: unknown) => {
      assert.ok(error instanceof StateRootHeldError);
      assert.equal(error.holder.token, holder.token);
      return true;
    });
    assert.equal(JSON.parse(readFileSync(join(dir, ".lock", "owner.json"), "utf8")).token, holder.token);
  } finally {
    holder.child.stdin?.end();
    await exited(holder.child);
  }
});

test("storage-25: a writer publishing between the inspection and the rename leaves the contender refusing", () => {
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
  assert.equal(JSON.parse(readFileSync(join(dir, ".lock", "owner.json"), "utf8")).token, published?.token);
  assert.deepEqual(readdirSync(dir).filter((name) => name.startsWith(".lock.stage")), []);
});

test("storage-25: a moved owner whose token differs fails closed with the moved directory intact", () => {
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
  assert.equal(existsSync(join(dir, ".lock")), false);
  assert.ok(existsSync(join(dir, ".lock.retired", o.token, "owner.json")));
  assert.ok(lstatSync(join(dir, ".lock.retired")).isDirectory());
});

test("storage-25: a storage command with an unavailable identity refuses before any change, naming the file", async () => {
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
