// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { isDeepStrictEqual } from "node:util";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { executionConfigFromPlan, loadLaunchPlan, openSessionHost } from "@sublang/playbook/session-host";
import { createSessionStore } from "@sublang/playbook/session-store";
import { composeConfig } from "./config.js";
import { restoringRecord } from "./control-record.js";
import { CoreService } from "./service.js";
import { SessionManager, CoreError } from "./session.js";
import { Store } from "./store.js";
import { parkingScript } from "./testing/demo.js";
import { fakeAdapterImports } from "./testing/fake-adapter.js";
import { scratchDir } from "./testing/scratch.js";
import { builtinLaunchModules } from "./testing/launch-modules.js";

const machineIdentity = "machine-id:v1:00000000-0000-4000-8000-0000000000aa";

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
  const store = new Store({ machineIdentity, dir: join(dir, "state"), own: "tester" });
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

/** The stopped writer (core-service-84) as another runtime: a CLI host
 * that assigns its new session to `runtime`, as that runtime's core
 * assigns its own (storage-43), then dies mid-step, its step's start
 * saved and its coder's commit made — the session left uncertain. */
async function stopWriterOn(runtime: { device: string; label: string }, sessionsDir: string, projectPath: string, configPath: string, input: string): Promise<string> {
  const writer = join(dirname(new URL(import.meta.url).pathname), "testing", "stopped-writer.js");
  const child = spawn(process.execPath, [writer, sessionsDir, projectPath, configPath, input, `--runtime=${runtime.device}:${runtime.label}`], { stdio: ["ignore", "pipe", "inherit"] });
  const sessionId = await new Promise<string>((resolveReady, reject) => {
    let out = "";
    child.stdout.on("data", (chunk) => {
      out += String(chunk);
      const ready = /READY (\S+)/.exec(out);
      if (ready) resolveReady(ready[1]!);
    });
    child.once("exit", (code) => reject(new Error(`the stopped writer exited early (${code}): ${out}`)));
  });
  const exited = new Promise((resolveExit) => child.once("exit", resolveExit));
  child.kill("SIGKILL");
  await exited;
  return sessionId;
}

/** This home as another device pairing the same folder at the same
 * path: `home.yaml`'s `device` rewritten, which the store reads as the
 * file stands (storage-2). */
function setDevice(stateDir: string, device: string): void {
  const file = join(stateDir, "home.yaml");
  const home = parseYaml(readFileSync(file, "utf8")) as Record<string, unknown>;
  writeFileSync(file, stringifyYaml({ ...home, device }));
}

test("core-service-124: an uncertain session offers Restore on its own runtime alone", { timeout: 120_000 }, async (t) => {
  const dir = scratchDir("spex-recovery-runtime-");
  const projectPath = join(dir, "project"); mkdirSync(projectPath);
  execFileSync("git", ["init", "-q", projectPath]);
  writeFileSync(join(projectPath, "work.txt"), "baseline\n");
  execFileSync("git", ["-C", projectPath, "add", "-A"]);
  execFileSync("git", ["-C", projectPath, "-c", "user.name=Spex Test", "-c", "user.email=spex@example.test", "-c", "commit.gpgsign=false", "commit", "-q", "-m", "baseline"]);
  const configPath = join(dir, "config.yaml"); writeFileSync(configPath, CONFIG);
  const stateDir = join(dir, "state");
  const store = new Store({ machineIdentity, dir: stateDir, own: "tester" });
  const project = store.registerProject(projectPath, "recovery runtime fixture", 1);
  const shared = store.sessionStore(project.id);
  const here = store.home.device;
  const there = { device: randomUUID(), label: "build-server" };
  const id = await stopWriterOn(there, shared.sessionsDir, projectPath, configPath, "Add a line to work.txt");
  await store.adoptForeignSessions(project.id);
  const { imports, stats } = fakeAdapterImports(parkingScript());
  const manager = new SessionManager({ store, adapterImports: imports, env: {} });
  t.after(async () => { await manager.disposeAll(); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const manifest = join(shared.sessionsDir, `${id}.json`);
  const stream = join(shared.sessionsDir, `${id}.records.jsonl`);
  const lanes = () => manager.listLanes().filter((lane) => lane.projectId === project.id).map((lane) => lane.sessionId);

  // Another runtime offers nothing on it: no recovery and no
  // continuation, the phrase as its reason (core-service-32), and it is
  // never this runtime's lane (core-service-93).
  const elsewhere = store.describeSession(id);
  assert.equal(elsewhere?.runsOn, "build-server");
  assert.equal(elsewhere?.recovery, undefined);
  assert.equal(elsewhere?.continuable, undefined);
  assert.equal(elsewhere?.continuationReason, "Runs on build-server");
  assert.equal(store.hasContinuableCheckpoint(id), false);
  assert.deepEqual(lanes(), []);
  // Restore and Discard are refused with the phrase and the label before
  // anything opens, writing nothing (core-service-82, core-service-83).
  const before = [readFileSync(manifest), readFileSync(stream)];
  for (const request of [() => manager.restoreSession(project, id), () => manager.discardSession(id)]) {
    await assert.rejects(request(), (error: unknown) => error instanceof CoreError && error.code === "invalid_request" &&
      error.message === "Runs on build-server" && isDeepStrictEqual(error.details, { runsOn: "build-server" }));
  }
  assert.deepEqual([readFileSync(manifest), readFileSync(stream)], before);
  assert.equal(await shared.readLeaseState(id), "idle");

  // On its own runtime — the same folder at the same path — the stopped
  // step is offered for Restore, Discard withheld as recorded work's is,
  // and the conversation is the lane (core-service-32, core-service-93).
  setDevice(stateDir, there.device);
  const own = store.describeSession(id);
  assert.equal(own?.runsOn, undefined);
  assert.deepEqual(own?.recovery, { state: "uncertain", input: "Add a line to work.txt", discardable: false });
  assert.deepEqual(lanes(), [id]);
  await manager.restoreSession(project, id);
  await manager.getLive(id)?.operation;
  await manager.settled(id);
  assert.equal((await shared.readManifest(id))?.state, "settled");
  assert.equal(stats.runs.length, 0, "Restore reports without calling an agent");

  // Restored there, it still runs there alone.
  setDevice(stateDir, here);
  const restored = store.describeSession(id);
  assert.equal(restored?.runsOn, "build-server");
  assert.equal(restored?.continuable, undefined);
  assert.equal(restored?.recovery, undefined);
  assert.equal(store.hasContinuableCheckpoint(id), false);
});

test("core-service-84: a restore left unrecorded is completed by a core on the session's own runtime alone", { timeout: 180_000 }, async (t) => {
  const dir = scratchDir("spex-restore-runtime-");
  const projectPath = join(dir, "project"); mkdirSync(projectPath);
  execFileSync("git", ["init", "-q", projectPath]);
  writeFileSync(join(projectPath, "work.txt"), "baseline\n");
  execFileSync("git", ["-C", projectPath, "add", "-A"]);
  execFileSync("git", ["-C", projectPath, "-c", "user.name=Spex Test", "-c", "user.email=spex@example.test", "-c", "commit.gpgsign=false", "commit", "-q", "-m", "baseline"]);
  const configPath = join(dir, "config.yaml"); writeFileSync(configPath, CONFIG);
  const stateDir = join(dir, "state");
  // The folder paired before any core starts, so the other runtime's
  // writes land in its spex repository's session store (storage-6).
  const paired = new Store({ machineIdentity, dir: stateDir, own: "tester" });
  const sessionsDir = paired.sessionStore(paired.registerProject(projectPath, "restore runtime fixture", 1).id).sessionsDir;
  paired.close();
  const shared = createSessionStore({ sessionsDir });
  const there = { device: randomUUID(), label: "build-server" };
  const { imports, stats } = fakeAdapterImports(parkingScript());
  const start = () => CoreService.start({ token: "test", configPath, dataDir: stateDir, adapterImports: imports, adapterRuntime: () => ({ usable: true }), env: {}, home: join(dir, "home"), watchConfig: false });
  let service: CoreService | undefined = await start();
  const restart = async (): Promise<CoreService> => {
    await service?.stop();
    service = undefined;
    service = await start();
    return service;
  };
  t.after(async () => { await service?.stop(); rmSync(dir, { recursive: true, force: true }); });

  // There's writer stops mid-step, and a core of there marks and reports
  // the restore, then stops before it records where the runs stand: the
  // marker and the settled report stand, and no position.
  const sessionId = await stopWriterOn(there, sessionsDir, projectPath, configPath, "Add a line to work.txt");
  const controller = await openSessionHost({
    store: shared, sessionId, mode: "recover", cwd: projectPath,
    loadModule: (specifier: string) => import(specifier), adapterImports: imports,
  });
  const saved = await controller.read();
  assert.equal(saved?.state, "uncertain");
  await controller.lease.append(restoringRecord(saved!.uncertain!.input, Date.now()));
  await controller.recover();
  assert.equal((await controller.read())?.state, "settled");
  await controller.dispose();
  const entries = async () => (await shared.readHistory(sessionId)).entries;
  const positions = async () => (await entries()).filter(({ record }) => (record as { topic?: unknown }).topic === "spex.session.restored");
  const count = (await entries()).length;

  // Here, the session joins the listing as there's, and this core
  // appends nothing to it (core-service-82).
  await service["syncForeignSessions"]();
  assert.equal(service["store"].describeSession(sessionId)?.runsOn, "build-server");
  assert.equal((await entries()).length, count, "joining the listing appends nothing here");
  // A start here appends nothing either (core-service-82).
  service = await restart();
  assert.equal(service["store"].describeSession(sessionId)?.runsOn, "build-server");
  assert.equal((await entries()).length, count, "a start appends nothing here");
  assert.deepEqual(await positions(), []);

  // The same core on the session's own runtime completes the restore
  // once at its start, naming the report's turn (core-service-82).
  setDevice(stateDir, there.device);
  service = await restart();
  const recorded = await positions();
  assert.equal(recorded.length, 1);
  assert.equal((await entries()).length, count + 1);
  const report = (await entries()).filter(({ record }) => record.type === "turn_started").at(-1)?.record as { turn?: { id?: number } } | undefined;
  assert.equal((recorded[0]?.record as { turnId?: unknown }).turnId, report?.turn?.id);
  // Once: a later listing and a later start append nothing more
  // (core-service-82).
  await service["syncForeignSessions"]();
  service = await restart();
  assert.equal((await positions()).length, 1);
  assert.equal((await entries()).length, count + 1);
  assert.equal(stats.runs.length, 0, "completing a restore calls no agent");
});
