// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { parse as parseYaml } from "yaml";
import { executionConfigFromPlan, loadLaunchPlan, openSessionHost } from "@sublang/playbook/session-host";
import { composeConfig } from "./config.js";
import { SessionManager, CoreError } from "./session.js";
import { Store } from "./store.js";
import { fakeAdapterImports } from "./testing/fake-adapter.js";
import { scratchDir } from "./testing/scratch.js";
import { builtinLaunchModules } from "./testing/launch-modules.js";

const CONFIG = `captain:
  adapter: claude
  model: claude-test
players:
  dev.coder:
    adapter: claude
    model: claude-test
playbooks:
  code:
    roles:
      coder: dev.coder
`;

function boundary() {
  let resolve!: () => void;
  const promise = new Promise<void>((ready) => { resolve = ready; });
  return { promise, resolve };
}

async function interrupted(t: TestContext) {
  const dir = scratchDir("spex-recovery-ownership-");
  const projectPath = join(dir, "project"); mkdirSync(projectPath);
  execFileSync("git", ["init", "-q", projectPath]);
  const configPath = join(dir, "config.yaml"); writeFileSync(configPath, CONFIG);
  const store = new Store({ dir: join(dir, "state"), own: "tester" });
  const project = store.registerProject(projectPath, "recovery ownership fixture", 1);
  // The CLI writes into the session store of the project's spex
  // repository, which makes the session the project's (storage-6).
  const shared = store.sessionStore(project.id);
  const modules = builtinLaunchModules(configPath);
  const config = executionConfigFromPlan(await loadLaunchPlan({ userConfigPath: configPath, modules }));
  const { imports, stats } = fakeAdapterImports({ fallback: { result: "unused fixture answer" } });
  const cli = await openSessionHost({ store: shared, mode: "new", cwd: projectPath, config, adapterImports: imports });
  const id = cli.sessionId;
  await cli.lease.beginTurn({ input: "saved fixture input", attemptId: randomUUID(), attemptedExecutionProjection: config });
  await cli.lease.recordProgress({ snapshot: null, step: { id: randomUUID(), kind: "player", stateId: "firstPhase", runtimeSessionId: randomUUID(), playbookId: "code" } });
  await cli.dispose();
  await store.adoptForeignSessions(project.id);
  assert.equal(store.sessionRepository(id), project.id);
  const manager = new SessionManager({ store, adapterImports: imports, env: {} });
  const states: ReturnType<Store["listSessions"]> = [];
  manager.onSessionState = (state) => states.push(state);
  t.after(async () => { await manager.disposeAll(); await cli.dispose(); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const manifest = join(shared.sessionsDir, `${id}.json`);
  const stream = join(shared.sessionsDir, `${id}.records.jsonl`);
  return { store, shared, project, manager, stats, id, manifest, stream, states, composed: await composeConfig(parseYaml(CONFIG), undefined, undefined, { modules: { repository: "tester/tester-spex", find: (id) => (modules[id] ? { module: modules[id], builtin: true } : undefined) } }) };
}

async function restored(fixture: Awaited<ReturnType<typeof interrupted>>) {
  await fixture.manager.restoreSession(fixture.project, fixture.id);
  await fixture.manager.getLive(fixture.id)?.operation;
  await fixture.manager.settled(fixture.id);
  assert.equal((await fixture.shared.readManifest(fixture.id))?.state, "settled");
  assert.equal(fixture.stats.runs.length, 0, "Restore reports without calling an agent");
  assert.equal(await fixture.shared.readLeaseState(fixture.id), "idle");
}

test("core-service-84: released external ownership is revalidated before Restore admission", async (t) => {
  const f = await interrupted(t);
  const holder = await f.shared.acquire(f.id);
  await f.store.refreshSession(f.id, false);
  assert.equal(f.store.describeSession(f.id)?.externalWriter, "active");
  await holder.release();
  assert.equal(await f.shared.readLeaseState(f.id), "idle");
  await restored(f);
  assert.ok(f.states.some((state) => !state.externalWriter && state.recovery), "idle ownership is published before recovery runs");
});

test("core-service-84: refused Discard republishes released ownership before Restore", async (t) => {
  const f = await interrupted(t);
  // The watcher observation is scheduled at the real acquisition boundary;
  // all lease, checkpoint, refusal and release operations remain real.
  const observed = { ...f.shared, acquire: async (...args: Parameters<typeof f.shared.acquire>) => {
    const lease = await f.shared.acquire(...args);
    await f.store.refreshSession(f.id, false);
    return lease;
  }};
  f.store.sessionStore = () => observed;
  const before = readFileSync(f.manifest);
  await assert.rejects(f.manager.discardSession(f.id), (error: unknown) => error instanceof CoreError && error.code === "invalid_request" && /restored and reported/.test(error.message));
  assert.deepEqual(readFileSync(f.manifest), before);
  assert.equal(await f.shared.readLeaseState(f.id), "idle");
  assert.equal(f.store.describeSession(f.id)?.externalWriter, undefined);
  assert.equal(f.states.at(-1)?.live, false);
  assert.ok(f.states.at(-1)?.recovery);
  f.store.sessionStore = () => f.shared;
  await restored(f);
});

for (const ownership of ["active", "unknown"] as const) {
  test(`core-service-84: authoritative ${ownership} ownership keeps Restore closed`, async (t) => {
    const f = await interrupted(t);
    let holder: Awaited<ReturnType<typeof f.shared.acquire>> | undefined;
    if (ownership === "active") {
      holder = await f.shared.acquire(f.id);
    } else {
      const lock = join(f.shared.sessionsDir, `.${f.id}.lock`);
      mkdirSync(lock, { mode: 0o700 });
      writeFileSync(join(lock, "owner.json"), JSON.stringify({ schemaVersion: 1, kind: "captain-session-lease", sessionId: f.id, ownerToken: randomUUID(), pid: process.pid, hostname: `${hostname()}-unverifiable-fixture`, acquiredAt: new Date().toISOString() }), { mode: 0o600 });
    }
    try {
      await f.store.refreshSession(f.id, false);
      assert.equal(await f.shared.readLeaseState(f.id), ownership);
      const before = [readFileSync(f.manifest), readFileSync(f.stream)];
      await assert.rejects(f.manager.restoreSession(f.project, f.id), (error: unknown) => error instanceof CoreError && error.code === "busy");
      assert.deepEqual([readFileSync(f.manifest), readFileSync(f.stream)], before);
      assert.equal(f.stats.runs.length, 0);
      assert.equal(await f.shared.readLeaseState(f.id), ownership);
    } finally { await holder?.release(); }
  });
}

test("core-service-84: ownership refresh leaves unread foreign replay for normal publication", async (t) => {
  const f = await interrupted(t);
  const beforeSeq = f.store.maxSeq(f.id);
  const holder = await f.shared.acquire(f.id);
  await f.store.refreshSession(f.id, false);
  await holder.append({ type: "captain_telemetry", turnId: null, timestamp: 1000, topic: "fixture.foreign.ownership", payload: { proof: "real append" } });
  await holder.release();
  const admitted = await f.manager.createSession(f.project, f.composed);
  assert.ok(f.manager.getLive(admitted.id), "a real sibling admission revalidates the external holder");
  assert.equal(f.store.describeSession(f.id)?.externalWriter, undefined);
  assert.equal(f.store.maxSeq(f.id), beforeSeq, "ownership admission never consumes an unannounced record");
  const later = await f.store.refreshSession(f.id, false);
  assert.equal(later?.appended.length, 1);
  assert.equal((later?.appended[0]?.record as { topic?: string }).topic, "fixture.foreign.ownership");
});

test("core-service-84: opening stays reserved while authoritative ownership refresh awaits", async (t) => {
  const f = await interrupted(t);
  const holder = await f.shared.acquire(f.id);
  await f.store.refreshSession(f.id, false);
  await holder.release();
  const started = boundary();
  const proceed = boundary();
  const refresh = f.store.refreshSessionOwnership.bind(f.store);
  f.store.refreshSessionOwnership = async (id) => { await refresh(id); started.resolve(); await proceed.promise; };
  const opening = f.manager.restoreSession(f.project, f.id);
  await started.promise;
  const before = [readFileSync(f.manifest), readFileSync(f.stream)];
  try {
    await assert.rejects(f.manager.restoreSession(f.project, f.id), (error: unknown) => error instanceof CoreError && error.code === "busy");
    await assert.rejects(f.manager.discardSession(f.id), (error: unknown) => error instanceof CoreError && error.code === "busy");
    const sessionsBefore = readdirSync(f.shared.sessionsDir).filter((file) => file.endsWith(".json"));
    await assert.rejects(f.manager.createSession(f.project, f.composed), (error: unknown) => error instanceof CoreError && error.code === "busy");
    assert.deepEqual(readdirSync(f.shared.sessionsDir).filter((file) => file.endsWith(".json")), sessionsBefore, "a different session of this project starts no checkpoint during opening");
    assert.deepEqual([readFileSync(f.manifest), readFileSync(f.stream)], before);
  } finally { proceed.resolve(); }
  await opening;
  await f.manager.getLive(f.id)?.operation;
  assert.equal(f.stats.runs.length, 0);
  assert.equal((await f.shared.readManifest(f.id))?.state, "settled");
});

test("core-service-84: Discard recovery reservation lasts through ownership publication", async (t) => {
  const f = await interrupted(t);
  const started = boundary();
  const proceed = boundary();
  const refresh = f.store.refreshSessionOwnership.bind(f.store);
  f.store.refreshSessionOwnership = async (id) => { await refresh(id); started.resolve(); await proceed.promise; };
  const discard = f.manager.discardSession(f.id).catch((error: unknown) => error);
  await started.promise;
  const before = [readFileSync(f.manifest), readFileSync(f.stream)];
  try {
    await assert.rejects(f.manager.restoreSession(f.project, f.id), (error: unknown) => error instanceof CoreError && error.code === "busy");
    await assert.rejects(f.manager.discardSession(f.id), (error: unknown) => error instanceof CoreError && error.code === "busy");
    const sessionsBefore = readdirSync(f.shared.sessionsDir).filter((file) => file.endsWith(".json"));
    await assert.rejects(f.manager.createSession(f.project, f.composed), (error: unknown) => error instanceof CoreError && error.code === "busy");
    assert.deepEqual(readdirSync(f.shared.sessionsDir).filter((file) => file.endsWith(".json")), sessionsBefore, "a different session of this project starts no checkpoint during recovery publication");
    assert.deepEqual([readFileSync(f.manifest), readFileSync(f.stream)], before);
  } finally { proceed.resolve(); }
  const refusal = await discard;
  assert.ok(refusal instanceof CoreError && /restored and reported/.test(refusal.message));
  f.store.refreshSessionOwnership = refresh;
  await restored(f);
});

test("core-service-84: ownership refresh failure preserves the original Discard refusal", async (t) => {
  const f = await interrupted(t);
  const refresh = f.store.refreshSessionOwnership.bind(f.store);
  const reported: string[] = [];
  const reporting = console.error;
  console.error = (...args: unknown[]) => reported.push(args.map(String).join(" "));
  f.store.refreshSessionOwnership = async () => { throw new Error("fixture ownership read failure"); };
  const before = [readFileSync(f.manifest), readFileSync(f.stream)];
  try {
    await assert.rejects(f.manager.discardSession(f.id), (error: unknown) => error instanceof CoreError && error.code === "invalid_request" && /restored and reported/.test(error.message));
  } finally { console.error = reporting; f.store.refreshSessionOwnership = refresh; }
  assert.deepEqual([readFileSync(f.manifest), readFileSync(f.stream)], before);
  assert.equal(await f.shared.readLeaseState(f.id), "idle");
  assert.ok(reported.some((line) => line.includes("fixture ownership read failure")));
  await restored(f);
});

test("core-service-84: a local live runtime still refuses Restore after foreign ownership clears", async (t) => {
  const f = await interrupted(t);
  const holder = await f.shared.acquire(f.id);
  await f.store.refreshSession(f.id, false);
  await holder.release();
  const local = await f.manager.createSession(f.project, f.composed);
  const before = [readFileSync(f.manifest), readFileSync(f.stream)];
  await assert.rejects(f.manager.restoreSession(f.project, f.id), (error: unknown) => error instanceof CoreError && error.code === "busy");
  assert.equal(f.manager.getLive(local.id)?.info.id, local.id);
  assert.deepEqual([readFileSync(f.manifest), readFileSync(f.stream)], before);
  assert.equal(f.stats.runs.length, 0);
});

test("core-service-84: refusing the same live session preserves its local ownership marker", async (t) => {
  const f = await interrupted(t);
  const local = await f.manager.createSession(f.project, f.composed);
  const paths = [join(f.shared.sessionsDir, `${local.id}.json`), join(f.shared.sessionsDir, `${local.id}.records.jsonl`)];
  const before = paths.map((path) => readFileSync(path));
  for (const request of [() => f.manager.restoreSession(f.project, local.id), () => f.manager.continueSession(f.project, f.composed, local)]) {
    await assert.rejects(request(), (error: unknown) => error instanceof CoreError && error.code === "busy");
    assert.equal(await f.store.refreshSession(local.id, false), undefined, "a scanner refresh cannot adopt a locally reserved runtime as foreign");
    assert.equal(f.store.describeSession(local.id)?.live, true);
    assert.equal(f.store.describeSession(local.id)?.externalWriter, undefined);
    assert.equal(f.manager.getLive(local.id)?.info.id, local.id);
  }
  assert.deepEqual(paths.map((path) => readFileSync(path)), before);
  assert.equal(f.stats.runs.length, 0);
});
