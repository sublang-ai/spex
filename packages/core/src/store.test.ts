// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { test } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import Database from "better-sqlite3";
import { projectCaptainSessionStructure, type SessionExecutionProjection, type SessionFreshBoundary } from "@sublang/playbook/session-store";

import { StateRootHeldError, Store } from "./store.js";
import { DraftChangedError, DraftStore, legacyInstance, type StoredDraft } from "./drafts.js";
import { StorageFormatError } from "./app-storage.js";
import { ownConfigPath } from "./config.js";
import { Home, InstanceRefused, remoteNamesIn, remoteSectionOrder } from "./home.js";
import type { SessionInfo, TmuxPlayRecord } from "./protocol.js";
import { scratchDir } from "./testing/scratch.js";

const machineIdentity = "machine-id:v1:00000000-0000-4000-8000-0000000000aa";

const PROJECT_PATH = join(tmpdir(), "spex-store-project");

function tempRoot(): string {
  return join(scratchDir("spex-store-"), "state");
}

/** The sample project's sessions: its spex repository's clone (storage-1). */
function sessionsOf(dir: string): string {
  return join(dir, "workspace", "tester", "proj-spex", "sessions");
}

function sampleSession(store: Store): SessionInfo {
  const project = store.registerProject(PROJECT_PATH, "proj", 1000);
  const session: SessionInfo = {
    id: "71000000-0000-4000-8000-000000000001",
    projectId: project.id,
    projectPath: project.path,
    createdAt: 2000,
    live: true,
    endedAt: null,
    players: [{ id: "dev.coder", adapter: "claude" }],
    turns: 0,
    failed: false,
    initialVisible: ["dev.coder"],
  };
  store.createSession(session);
  return session;
}

const SESSION = "71000000-0000-4000-8000-000000000001";
const execution: SessionExecutionProjection = {
  schemaVersion: 2,
  captain: { adapter: "claude", model: { kind: "provider-default" }, effort: { kind: "provider-default" }, permissions: { mode: "auto" } },
  players: [{ id: "dev.coder", adapter: "codex", model: { kind: "provider-default" }, effort: { kind: "provider-default" }, permissions: {} }],
  catalog: { code: { id: "code", from: "@sublang/playbook/code/registry", manifestCommand: "code", command: "code", intent: "Implement a change", artifactSchema: 3, requiredRoleIds: ["coder"], concurrentRoleSets: [], roles: { coder: { playerId: "dev.coder", model: { kind: "provider-default" }, effort: { kind: "provider-default" } } }, options: {} } },
};
async function sharedSession(store: Store) {
  const project = store.registerProject(PROJECT_PATH, "proj", 1000);
  const shared = store.sessionStore(project.id); await shared.prepare();
  const lease = await shared.acquire(SESSION);
  const structure = projectCaptainSessionStructure(execution);
  const captainId = "71000000-0000-4000-8000-000000000007";
  const ledger = { schemaVersion: 1, revision: 0, boundaries: [], logicalOperations: [] };
  const state = { value: "routing", activeStateIds: ["routing"], tags: ["playbook.parked"], status: "active", quiescent: true, stateId: "routing" };
  const snapshot = {
    schemaVersion: 4,
    captain: {
      sessionId: captainId, agent: structure.captain, conversation: { kind: "unopened" },
      runtime: { schemaVersion: 4, playbookId: "captain", machine: { value: "routing", status: "active" }, roleResumeTokens: {},
        sequences: { trace: 0, turn: 0, judgeCall: 0, playerCall: 0, playbookCall: 0, captainCall: 0 }, state, pendingBossQuestions: [], effectLedger: ledger },
    },
    playerSessions: Object.fromEntries(structure.players.map(({ id, ...agent }) => [id, agent])), issuedSessionIds: [captainId], sequences: { turn: 0, journal: 0 }, journal: [], effectLedger: ledger, mode: "chat",
  } as unknown as SessionFreshBoundary["snapshot"];
  await lease.initializeSettledWithPredecessor({ cwd: PROJECT_PATH, structuralProjection: structure, executionProjection: execution, snapshot });
  return lease;
}

test("projects register idempotently by path and can be removed", () => {
  const store = new Store({ machineIdentity, dir: tempRoot(), own: "tester" });
  const a = store.registerProject(join(tmpdir(), "spex-store-x"), "x", 1);
  const b = store.registerProject(join(tmpdir(), "spex-store-x"), "x", 2);
  assert.equal(a.id, b.id);
  assert.equal(store.listProjects().length, 1);
  assert.ok(store.removeProject(a.id));
  assert.equal(store.listProjects().length, 0);
  store.close();
});

test("records persist through the shared lifecycle with order and hidden flags", async () => {
  const dir = tempRoot();
  const store = new Store({ machineIdentity, dir, own: "tester" });
  const lease = await sharedSession(store);
  const visible: TmuxPlayRecord = {
    type: "captain_status",
    turnId: 1,
    timestamp: 10,
    message: "◇ /code started",
  } as TmuxPlayRecord;
  const hidden: TmuxPlayRecord = {
    type: "captain_prompt",
    turnId: 1,
    timestamp: 11,
    prompt: "route this",
    visibility: "hidden",
  } as TmuxPlayRecord;
  await lease.append(visible);
  await lease.append(hidden);
  await lease.release();
  store.close();

  const reopened = new Store({ machineIdentity, dir, own: "tester" });
  await reopened.initializeSessions();
  const filtered = reopened.getRecords("71000000-0000-4000-8000-000000000001");
  assert.deepEqual(
    filtered.map((r) => r.seq),
    [1, 2],
  );
  const all = reopened.getRecords("71000000-0000-4000-8000-000000000001", { includeHidden: true });
  assert.deepEqual(
    all.map((r) => r.seq),
    [1, 2, 3],
  );
  assert.equal(all[2].record.type, "captain_prompt");
  assert.equal(reopened.maxSeq(SESSION), 3);
  reopened.close();
});

test("liveness comes from the host while shared recovery survives restart", async () => {
  const dir = tempRoot();
  const store = new Store({ machineIdentity, dir, own: "tester" });
  const lease = await sharedSession(store);
  await lease.release();
  await store.initializeSessions();
  assert.equal(store.listSessions()[0].continuable, true);
  store.reopenSession(SESSION, []);
  assert.equal(store.listSessions()[0].live, true);
  assert.equal(store.listSessions()[0].continuable, undefined);
  store.close();

  const reopened = new Store({ machineIdentity, dir, own: "tester" });
  await reopened.initializeSessions();
  assert.equal(reopened.listSessions()[0].live, false);
  assert.equal(reopened.listSessions()[0].continuable, true);
  assert.equal(reopened.listSessions()[0].projectPath, PROJECT_PATH);
  assert.equal(existsSync(join(sessionsOf(dir), `${SESSION}.spex.json`)), false);
  const before = readFileSync(join(sessionsOf(dir), `${SESSION}.json`));
  await reopened.refreshSession(SESSION);
  assert.deepEqual(readFileSync(join(sessionsOf(dir), `${SESSION}.json`)), before);
  reopened.close();
});

test("usage totals aggregate per session", () => {
  const store = new Store({ own: "tester" });
  sampleSession(store);
  store.addUsage({
    sessionId: "71000000-0000-4000-8000-000000000001",
    turnId: 1,
    actorId: "dev.coder",
    inputTokens: 100,
    outputTokens: 40,
    toolUses: 3,
    totalCostUsd: 0.5,
    costSource: "provider-reported",
    at: 1,
  });
  store.addUsage({
    sessionId: "71000000-0000-4000-8000-000000000001",
    turnId: 1,
    actorId: "captain",
    inputTokens: 10,
    outputTokens: 5,
    toolUses: 0,
    totalCostUsd: 0.25,
    costSource: "agent-estimate",
    at: 2,
  });
  // The provenance of every contributing entry travels with the sum,
  // so a total mixing a provider's bill with an agent's guess cannot be
  // presented as if the provider reported all of it (DR-032).
  assert.deepEqual(store.sessionUsage("71000000-0000-4000-8000-000000000001"), {
    inputTokens: 110,
    outputTokens: 45,
    toolUses: 3,
    totalCostUsd: 0.75,
    costSources: ["agent-estimate", "provider-reported"],
  });
  store.close();
});

test("storage-2: a change to home.yaml applies to the file as it stands; a deleted one is refused, never restored", () => {
  const dir = tempRoot();
  const store = new Store({ machineIdentity, dir, own: "tester" });
  const project = store.registerProject(join(tmpdir(), "spex-store-home"), "home", 1);
  const file = join(dir, "home.yaml");
  // An editor's change since the store last wrote it is kept by the next write.
  const edited = parseYaml(readFileSync(file, "utf8")) as { folders: { path: string; repository: string; aliases?: string[] }[] };
  edited.folders[0].aliases = ["/elsewhere/recorded"];
  writeFileSync(file, stringifyYaml(edited));
  store.signIn(store.home.defaultInstance().origin, { id: "1", login: "ada", displayName: null });
  const after = parseYaml(readFileSync(file, "utf8")) as { folders: { aliases?: string[] }[]; origin: string; instances: { origin: string; account?: { login: string } }[] };
  assert.deepEqual(after.folders[0].aliases, ["/elsewhere/recorded"], "the editor's change stands");
  assert.deepEqual(after.instances.map((entry) => [entry.origin, entry.account?.login]), [[after.origin, "ada"]]);
  // Deleted once read, the file is not written back from memory.
  rmSync(file);
  assert.throws(() => store.rebindProject({ id: project.id, path: join(tmpdir(), "spex-store-home") }), (error: unknown) => error instanceof StorageFormatError && /changed meanwhile/.test(error.reason));
  assert.equal(existsSync(file), false, "the deleted home is not restored");
  store.close();
});

test("storage-4: an intent write never recreates a clone gone from under the store", () => {
  const dir = tempRoot();
  const store = new Store({ machineIdentity, dir, own: "tester" });
  const project = store.registerProject(join(tmpdir(), "spex-store-gone"), "gone", 1);
  const clone = join(dir, "workspace", ...project.id.split("/"));
  rmSync(clone, { recursive: true, force: true });
  assert.throws(() => store.addIntent({ id: "72000000-0000-4000-8000-000000000001", projectId: project.id, text: "late", createdAt: 1 }));
  assert.equal(existsSync(clone), false, "the clone is not recreated");
  store.close();
});

test("storage-5: a preference write keeps what another writer wrote to the file meanwhile", () => {
  const dir = tempRoot();
  const store = new Store({ machineIdentity, dir, own: "tester" });
  store.setPref("viewed:a", 3);
  store.setPref("viewed:b", 4);
  // Another writer — a sync's Apply — clears a viewed marker in the file.
  const file = join(dir, "local", "prefs.json");
  const held = JSON.parse(readFileSync(file, "utf8")) as { format: 1; prefs: Record<string, unknown> };
  delete held.prefs["viewed:a"];
  writeFileSync(`${file}.next`, JSON.stringify(held));
  renameSync(`${file}.next`, file);
  assert.equal(store.getPref("viewed:a"), undefined, "a read follows the file");
  store.setPref("language", "zh");
  const prefs = (JSON.parse(readFileSync(file, "utf8")) as { prefs: Record<string, unknown> }).prefs;
  assert.deepEqual(prefs, { "viewed:b": 4, language: "zh" }, "the cleared marker is not restored");
  store.close();
});

test("prefs round-trip JSON values", () => {
  const store = new Store({ machineIdentity, dir: tempRoot(), own: "tester" });
  store.setPref("ui", { theme: "dark" });
  assert.deepEqual(store.getPref("ui"), { theme: "dark" });
  store.setPref("ui", { theme: "light" });
  assert.deepEqual(store.getPref("ui"), { theme: "light" });
  store.close();
});

test("storage-5: a session's own agent settings survive a restart field by field, subagent model and effort included", () => {
  const dir = tempRoot();
  const store = new Store({ machineIdentity, dir, own: "tester" });
  const session = sampleSession(store);
  store.setSessionAgentSettingsMap(session.id, {
    captain: { model: "claude-captain", subagentModel: "claude-sonnet-5-5", effort: false, subagentEffort: "high", fastMode: true },
    "dev.coder": { subagentModel: false, subagentEffort: false },
    "dev.reviewer": { subagentModel: "inherit" },
  });
  store.close();

  const reopened = new Store({ machineIdentity, dir, own: "tester" });
  assert.deepEqual(reopened.sessionAgentSettings(session.id), {
    captain: { model: "claude-captain", subagentModel: "claude-sonnet-5-5", effort: false, subagentEffort: "high", fastMode: true },
    "dev.coder": { subagentModel: false, subagentEffort: false },
    "dev.reviewer": { subagentModel: "inherit" },
  });
  // A hand-edited value of the wrong shape is dropped alone.
  reopened.setPref(`session:${session.id}:agents`, { captain: { subagentModel: "", subagentEffort: "", model: "kept" }, "dev.coder": { subagentModel: 7, subagentEffort: 3 } });
  assert.deepEqual(reopened.sessionAgentSettings(session.id), { captain: { model: "kept" } });
  reopened.close();
});

test("core-service-32: session.list carries each session's conversation summary", () => {
  // The rail's rows are only scannable if the listing carries scent:
  // the session's own first words, its size, and whether a failure of
  // it still stands — never whether one was ever recorded (DR-061).
  const store = new Store({ own: "tester" });
  const project = store.registerProject(PROJECT_PATH, "proj", 1000);
  const base = {
    projectId: project.id,
    projectPath: project.path,
    createdAt: 2000,
    live: false,
    endedAt: 9000,
    players: [{ id: "dev.coder", adapter: "claude" as const }],
    initialVisible: ["dev.coder"],
    turns: 0,
    failed: false,
  };
  const ids = ["recovered", "failing", "stopped", "parked", "bare"];
  ids.forEach((id, index) => store.createSession({ ...base, id, createdAt: 2000 + index }));
  // Each record is stored and folded as a live session records it.
  const record = (id: string, entry: Record<string, unknown>): void => {
    const stored = entry as unknown as TmuxPlayRecord;
    store.appendRecord(id, store.maxSeq(id) + 1, stored);
    store.foldStoredRecord(id, stored);
  };
  const turn = (
    id: string,
    turnId: number,
    prompt: string,
    at: number,
    ...within: Record<string, unknown>[]
  ): void => {
    record(id, { type: "turn_started", turnId, turn: { id: turnId, prompt }, timestamp: at });
    within.forEach((entry, index) => record(id, { turnId, timestamp: at + index + 1, ...entry }));
  };
  const finished = { type: "turn_finished" };
  const failure = (message: string) => ({ type: "runtime_error", message });
  const aborted = (reason: string) => ({ type: "turn_aborted", reason });
  const runMove = (from: string, to: string) => ({
    type: "captain_telemetry",
    topic: "playbook.trace",
    payload: { sessionId: "run-1", playbookId: "code", depth: 1, type: "fsm.transition", payload: { from, to } },
  });

  // The first turn failed; two later turns settled clean.
  turn("recovered", 1, "harden the session refresh", 2100,
    failure("adapter sign-in expired"), aborted("adapter sign-in expired"));
  turn("recovered", 2, "add expiry-skew tests", 2300, finished);
  turn("recovered", 3, "commit the tests", 2500, finished);
  // The latest settled turn failed — the Captain's failure names no
  // turn — and the turn started after it has not settled.
  turn("failing", 1, "draft the migration", 2100, finished);
  turn("failing", 2, "run the migration", 2300,
    { ...failure("The Captain's turn failed: rate limited"), turnId: null }, finished);
  turn("failing", 3, "try once more", 2500);
  // A stop's own error is no failure: the core stopped the only turn
  // as it closed.
  turn("stopped", 1, "write the notes", 2100,
    failure("interrupted when Spex closed"), aborted("interrupted when Spex closed"));
  // A run parked on its failure stands through a later clean turn.
  turn("parked", 1, "deliver the fix", 2100, runMove("work", "failed"), finished);
  turn("parked", 2, "what failed?", 2300, finished);
  store.addUsage({
    sessionId: "recovered",
    turnId: 1,
    actorId: "dev.coder",
    inputTokens: 100,
    outputTokens: 20,
    toolUses: 1,
    totalCostUsd: 0.16,
    at: 2500,
  });

  const listed = new Map(store.listSessions().map((session) => [session.id, session]));

  assert.equal(listed.get("recovered")?.title, "harden the session refresh");
  assert.equal(listed.get("recovered")?.turns, 3);
  assert.equal(listed.get("recovered")?.failed, false);
  assert.equal(listed.get("failing")?.failed, true);
  assert.equal(listed.get("stopped")?.failed, false);
  assert.equal(listed.get("parked")?.failed, true);

  // The turn after the failure settling clean stands it down; a later
  // failed turn raises it again.
  record("failing", { type: "turn_finished", turnId: 3, timestamp: 2600 });
  assert.equal(store.describeSession("failing")?.failed, false);
  turn("failing", 4, "and again", 2700, failure("provider overloaded"), aborted("provider overloaded"));
  assert.equal(store.describeSession("failing")?.failed, true);

  // The parked run leaving its failure state ends that failure.
  turn("parked", 3, "retry it", 2500, runMove("failed", "work"), finished);
  assert.equal(store.describeSession("parked")?.failed, false);

  // A session that never held a turn says so by carrying no title,
  // rather than faking a name.
  assert.equal(listed.get("bare")?.title, undefined);
  assert.equal(listed.get("bare")?.turns, 0);
  assert.equal(listed.get("bare")?.failed, false);
  store.close();
});

test("core-service-61: a held state root refuses a second store, and releases on close", () => {
  const dir = tempRoot();
  const first = new Store({ machineIdentity, dir, own: "tester" });
  assert.throws(
    () => new Store({ machineIdentity, dir, own: "tester" }),
    (error: unknown) => {
      assert.ok(error instanceof StateRootHeldError);
      assert.equal(error.holder.pid, process.pid);
      return true;
    },
  );
  first.close();
  const second = new Store({ machineIdentity, dir, own: "tester" });
  second.close();
});

test("core-service-64: a legacy SQLite store imports once, rows served from files", async () => {
  // A pre-DR-036 release left a spex.db behind. Its rows must serve
  // identically from the file state, with turns, titles, and usage
  // folded from the imported record stream — and the legacy file must
  // stay in place, imported exactly once.
  const dir = scratchDir("spex-import-");
  const legacyDbPath = join(dir, "spex.db");
  const root = join(dir, "state");
  const legacy = new Database(legacyDbPath);
  const doneEvent = {
    type: "player_event",
    turnId: 1,
    timestamp: 30,
    playerId: "dev.coder",
    event: {
      type: "done",
      payload: {
        usage: {
          toolUses: 2,
          tokens: { totals: { input: { total: 40 }, output: { total: 10 } } },
          cost: { amount: 0.25, source: "provider-reported" },
        },
        durationMs: 700,
      },
    },
  };
  legacy.exec(`
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE projects (
      id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      registered_at INTEGER NOT NULL
    );
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
      created_at INTEGER NOT NULL, ended_at INTEGER, live INTEGER NOT NULL,
      players_json TEXT NOT NULL, initial_visible_json TEXT NOT NULL
    );
    CREATE TABLE records (
      session_id TEXT NOT NULL, seq INTEGER NOT NULL, turn_id INTEGER,
      type TEXT NOT NULL, hidden INTEGER NOT NULL DEFAULT 0,
      timestamp INTEGER NOT NULL, payload_json TEXT NOT NULL, role TEXT,
      PRIMARY KEY (session_id, seq)
    );
    CREATE TABLE prefs (key TEXT PRIMARY KEY, value_json TEXT NOT NULL);
    CREATE TABLE intents (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, text TEXT NOT NULL,
      source_kind TEXT, source_ref TEXT, source_url TEXT,
      rank TEXT NOT NULL, after_id TEXT, created_at INTEGER NOT NULL,
      dispatched_session_id TEXT, dispatched_turn_id INTEGER, dispatched_at INTEGER,
      closed_at INTEGER, closed_as TEXT
    );
    INSERT INTO meta VALUES ('schema_version', '3');
    INSERT INTO projects VALUES ('71000000-0000-4000-8000-000000000004', '${PROJECT_PATH.replaceAll("'", "''")}', 'proj', 1);
    INSERT INTO sessions VALUES ('71000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000004', 1, NULL, 1, '[]', '[]');
    INSERT INTO prefs VALUES ('viewed:71000000-0000-4000-8000-000000000001', '1');
    INSERT INTO intents VALUES ('71000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000004', 'Ship it', NULL, NULL, NULL,
      'i', NULL, 5, '71000000-0000-4000-8000-000000000001', 1, 10, NULL, NULL);
  `);
  const insert = legacy.prepare(
    "INSERT INTO records (session_id, seq, turn_id, type, hidden, timestamp, payload_json, role) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  insert.run(
    "71000000-0000-4000-8000-000000000001",
    1,
    1,
    "turn_started",
    0,
    10,
    JSON.stringify({
      type: "turn_started",
      turnId: 1,
      turn: { id: 1, prompt: "ship the import" },
      timestamp: 10,
    }),
    null,
  );
  insert.run("71000000-0000-4000-8000-000000000001", 2, 1, "player_event", 0, 30, JSON.stringify(doneEvent), "coder");
  // The pre-0.22 flat usage shape lives in real stored streams; the
  // fold must read it too.
  insert.run(
    "71000000-0000-4000-8000-000000000001",
    4,
    1,
    "captain_event",
    0,
    40,
    JSON.stringify({
      type: "captain_event",
      turnId: 1,
      timestamp: 40,
      event: {
        type: "done",
        payload: {
          usage: { tokenAvailability: "reported", inputTokens: 60, outputTokens: 5, toolUses: 1 },
        },
      },
    }),
    null,
  );
  insert.run(
    "71000000-0000-4000-8000-000000000001",
    3,
    1,
    "turn_finished",
    0,
    50,
    JSON.stringify({ type: "turn_finished", turnId: 1, timestamp: 50 }),
    null,
  );
  legacy.close();
  const legacyBytes = readFileSync(legacyDbPath);

  const store = await Store.open({ machineIdentity, dir: root, legacyDbPath, own: "tester" });
  await store.initializeSessions();
  // A session live when the legacy store last closed is not live now.
  const session = store.listSessions().find((entry) => entry.id === "71000000-0000-4000-8000-000000000001");
  assert.equal(session?.live, false);
  assert.equal(session?.title, "ship the import");
  assert.equal(session?.turns, 1);
  // Usage folds from the imported stream (core-service-10), across
  // both payload generations.
  assert.deepEqual(store.sessionUsage("71000000-0000-4000-8000-000000000001"), {
    inputTokens: 100,
    outputTokens: 15,
    toolUses: 3,
    totalCostUsd: 0.25,
    costSources: ["provider-reported"],
  });
  assert.equal(store.getRecords("71000000-0000-4000-8000-000000000001")[1]?.role, "coder");
  assert.equal(store.getPref("viewed:71000000-0000-4000-8000-000000000001"), 1);
  assert.equal(store.getIntent("71000000-0000-4000-8000-000000000002")?.dispatched?.turnId, 1);
  store.close();

  // The legacy file is untouched, and a second startup imports nothing
  // twice: rows written since are not clobbered by a re-import.
  assert.deepEqual(readFileSync(legacyDbPath), legacyBytes);
  const reopened = await Store.open({ machineIdentity, dir: root, legacyDbPath, own: "tester" });
  reopened.setPref("viewed:71000000-0000-4000-8000-000000000001", 4);
  reopened.close();
  const third = await Store.open({ machineIdentity, dir: root, legacyDbPath, own: "tester" });
  assert.equal(third.getPref("viewed:71000000-0000-4000-8000-000000000001"), 4);
  assert.ok(existsSync(legacyDbPath));
  third.close();

  // The file carries its mark, so a state root created later on this
  // machine — a second home, a reinstall into a fresh one — imports
  // nothing from it, and the file itself stays untouched.
  const marker = `${legacyDbPath}.imported`;
  assert.ok(existsSync(marker));
  assert.equal(JSON.parse(readFileSync(marker, "utf8")).root, root);
  const fresh = await Store.open({ machineIdentity, dir: join(dir, "fresh-state"), legacyDbPath, own: "tester" });
  await fresh.initializeSessions();
  assert.deepEqual(fresh.listSessions(), []);
  assert.deepEqual(fresh.listProjects(), []);
  assert.equal(fresh.getIntent("71000000-0000-4000-8000-000000000002"), undefined);
  fresh.close();
  assert.deepEqual(readFileSync(legacyDbPath), legacyBytes);
  assert.ok(existsSync(marker));

  // A root that took the store before the file carried a mark stamps
  // it at its next start, importing nothing again.
  rmSync(marker);
  const stamping = await Store.open({ machineIdentity, dir: root, legacyDbPath, own: "tester" });
  assert.equal(stamping.getPref("viewed:71000000-0000-4000-8000-000000000001"), 4);
  stamping.close();
  assert.ok(existsSync(marker));
});

test("a legacy store whose directory refuses the mark still imports once per root", async () => {
  // Root ignores directory modes, so the refusal cannot be staged.
  if (process.getuid?.() === 0) return;
  const dir = scratchDir("spex-nomark-");
  const legacyDir = join(dir, "legacy");
  mkdirSync(legacyDir, { recursive: true });
  const legacyDbPath = join(legacyDir, "spex.db");
  const db = new Database(legacyDbPath);
  db.exec(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      registered_at INTEGER NOT NULL
    );
    INSERT INTO projects VALUES ('71000000-0000-4000-8000-000000000007', '${join(tmpdir(), "spex-nomark-project").replaceAll("'", "''")}', 'p', 1);
  `);
  db.close();
  chmodSync(legacyDir, 0o500);
  try {
    const store = await Store.open({ machineIdentity, dir: join(dir, "state"), legacyDbPath, own: "tester" });
    assert.equal(store.listProjects().length, 1);
    store.close();
    // The mark could not be written; the root's own record stands.
    assert.ok(!existsSync(`${legacyDbPath}.imported`));
    assert.deepEqual(JSON.parse(readFileSync(join(dir, "state", "meta.json"), "utf8")).importedLegacy, [legacyDbPath]);
    const reopened = await Store.open({ machineIdentity, dir: join(dir, "state"), legacyDbPath, own: "tester" });
    assert.equal(reopened.listProjects().length, 1);
    reopened.close();
    assert.ok(!existsSync(`${legacyDbPath}.imported`));
  } finally {
    chmodSync(legacyDir, 0o700);
  }
});

test("a second shell's legacy import merges into the root, clobbering nothing", async () => {
  // Both shells share one root: the server's first launch imports its
  // own legacy store and must not erase what the desktop imported or
  // what was registered since (DR-036).
  const dir = scratchDir("spex-merge-");
  const root = join(dir, "state");
  const seed = (path: string, projectId: string, projectPath: string): void => {
    const db = new Database(path);
    db.exec(`
      CREATE TABLE projects (
        id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
        registered_at INTEGER NOT NULL
      );
      CREATE TABLE prefs (key TEXT PRIMARY KEY, value_json TEXT NOT NULL);
      INSERT INTO projects VALUES ('${projectId}', '${projectPath.replaceAll("'", "''")}', 'p', 1);
      INSERT INTO prefs VALUES ('shared', '"${projectId}"');
    `);
    db.close();
  };
  seed(join(dir, "desktop.db"), "71000000-0000-4000-8000-000000000005", join(tmpdir(), "spex-desktop-project"));
  seed(join(dir, "server.db"), "71000000-0000-4000-8000-000000000006", join(tmpdir(), "spex-server-project"));

  const first = await Store.open({ machineIdentity, dir: root, legacyDbPath: join(dir, "desktop.db"), own: "tester" });
  first.registerProject(join(tmpdir(), "spex-new-work"), "new-work", 2);
  first.setPref("shared", "live");
  first.close();

  // The home already holds the groups layout: the late import merges in
  // through the same migration, what the home holds winning (storage-9).
  const second = await Store.open({ machineIdentity, dir: root, legacyDbPath: join(dir, "server.db"), own: "tester" });
  assert.deepEqual(
    second.listProjects().map((project) => project.path).sort(),
    [join(tmpdir(), "spex-desktop-project"), join(tmpdir(), "spex-new-work"), join(tmpdir(), "spex-server-project")],
  );
  // Existing preferences win over imported ones: they are newer.
  assert.equal(second.getPref("shared"), "live");
  second.close();
});

test("storage-4: one closed file per intent; a malformed one is reported, kept and listed nowhere", () => {
  const dir = tempRoot(); const store = new Store({ machineIdentity, dir, own: "tester" });
  const project = store.registerProject(join(tmpdir(), "spex-heal"), "heal", 1);
  const firstId = "71000000-0000-4000-8000-000000000002";
  const nextId = "71000000-0000-4000-8000-000000000003";
  store.addIntent({ id: firstId, projectId: project.id, text: "First", createdAt: 1, source: { kind: "issue", ref: "7", url: "https://x/7" } });
  store.addIntent({ id: nextId, projectId: project.id, text: "Second", createdAt: 2 });
  const intents = join(dir, "workspace", "tester", "heal-spex", "intents");
  assert.deepEqual(JSON.parse(readFileSync(join(intents, `${firstId}.json`), "utf8")),
    { format: 1, id: firstId, text: "First", source: { kind: "issue", ref: "7", url: "https://x/7" }, createdAt: 1 });
  store.stampIntentDispatch(firstId, "71000000-0000-4000-8000-000000000001", 1, 5);
  store.closeIntent(firstId, "done", 9);
  assert.deepEqual(JSON.parse(readFileSync(join(intents, `${firstId}.json`), "utf8")).closed, { as: "done", at: 9 });
  store.close();
  const damaged = '{"format":1,"id":"' + nextId + '","text":"Second","createdAt":2,"rank":"i"}';
  writeFileSync(join(intents, `${nextId}.json`), damaged);
  const reopened = new Store({ machineIdentity, dir, own: "tester" });
  assert.deepEqual(reopened.listOpenIntents(), []);
  assert.equal(reopened.getIntent(nextId), undefined);
  assert.equal(reopened.getIntent(firstId)?.closedAs, "done");
  assert.ok(reopened.storageDiagnostics().some((entry) => entry.file === join(intents, `${nextId}.json`) && !entry.blocking));
  assert.equal(readFileSync(join(intents, `${nextId}.json`), "utf8"), damaged, "the reader deletes nothing");
  // A format this Spex does not know is refused, never guessed.
  writeFileSync(join(intents, `${nextId}.json`), '{"format":3,"id":"' + nextId + '","text":"x","createdAt":2}');
  reopened.reload();
  assert.ok(reopened.storageDiagnostics().some((entry) => /unsupported format 3/.test(entry.reason)));
  // A remove deletes the file and its attachments.
  mkdirSync(join(intents, `${firstId}.assets`));
  reopened.removeIntent(firstId);
  assert.ok(!existsSync(join(intents, `${firstId}.json`)) && !existsSync(join(intents, `${firstId}.assets`)));
  reopened.close();
});

test("storage-4: a capture writes format 2 with its runtime; edit, dispatch and close keep a file's format and runtime; format 3 and a misplaced runtime are malformed", () => {
  const dir = tempRoot(); const store = new Store({ machineIdentity, dir, own: "tester" });
  const project = store.registerProject(join(tmpdir(), "spex-runtime"), "runtime", 1);
  const intents = join(dir, "workspace", "tester", "runtime-spex", "intents");
  const read = (id: string): Record<string, unknown> =>
    JSON.parse(readFileSync(join(intents, `${id}.json`), "utf8")) as Record<string, unknown>;
  // The runtime is named by the home's device (storage-2).
  const { device } = parseYaml(readFileSync(join(dir, "home.yaml"), "utf8")) as { device: string };
  assert.equal(store.home.device, device);
  const runtime = { device, label: "laptop" };

  // A capture is written at format 2 with this home's runtime.
  const captured = "71000000-0000-4000-8000-000000000011";
  store.addIntent({ id: captured, projectId: project.id, text: "Captured", createdAt: 1, runtime });
  assert.deepEqual(read(captured), { format: 2, id: captured, text: "Captured", runtime, createdAt: 1 });
  assert.deepEqual(store.getIntent(captured)?.runtime, runtime);

  // A format 1 file, written before runtimes were recorded, reads with none.
  const former = "71000000-0000-4000-8000-000000000012";
  writeFileSync(join(intents, `${former}.json`), JSON.stringify({ format: 1, id: former, text: "Former", createdAt: 2 }));
  assert.ok(!Object.hasOwn(store.getIntent(former)!, "runtime"));

  // An edit, a dispatch and a close rewrite each file whole, keeping its
  // format and its runtime as they were.
  const kept = (id: string, format: 1 | 2): Record<string, unknown> => {
    const file = read(id);
    assert.equal(file.format, format, id);
    if (format === 2) assert.deepEqual(file.runtime, runtime);
    else assert.ok(!Object.hasOwn(file, "runtime"), id);
    return file;
  };
  for (const [id, format, turnId] of [[captured, 2, 1], [former, 1, 2]] as const) {
    store.editIntent(id, "Edited");
    assert.equal(kept(id, format).text, "Edited");
    store.stampIntentDispatch(id, SESSION, turnId, 5);
    assert.deepEqual(kept(id, format).dispatched, { sessionId: SESSION, turnId, at: 5 });
    store.closeIntent(id, "done", 9);
    assert.deepEqual(kept(id, format).closed, { as: "done", at: 9 });
  }
  assert.deepEqual(store.getIntent(captured)?.runtime, runtime);

  // A format above 2, a format 1 file naming a runtime, and a format 2
  // file naming none or a malformed one are malformed: reported without
  // blocking, their bytes kept, refused with their cause, listed nowhere.
  const malformed: [string, Record<string, unknown>, RegExp?][] = [
    ["71000000-0000-4000-8000-000000000013", { format: 3, text: "Later", runtime, createdAt: 3 }, /unsupported format 3/],
    ["71000000-0000-4000-8000-000000000014", { format: 1, text: "Named", runtime, createdAt: 3 }],
    ["71000000-0000-4000-8000-000000000015", { format: 2, text: "Unnamed", createdAt: 3 }],
    ["71000000-0000-4000-8000-000000000016", { format: 2, text: "Shouted", runtime: { device: device.toUpperCase(), label: "laptop" }, createdAt: 3 }],
    ["71000000-0000-4000-8000-000000000017", { format: 2, text: "Blank", runtime: { device, label: "" }, createdAt: 3 }],
    ["71000000-0000-4000-8000-000000000018", { format: 2, text: "Extra", runtime: { ...runtime, host: "laptop.local" }, createdAt: 3 }],
  ];
  for (const [id, fields, reason] of malformed) {
    const file = join(intents, `${id}.json`);
    const bytes = JSON.stringify({ id, ...fields });
    writeFileSync(file, bytes);
    assert.equal(store.getIntent(id), undefined, id);
    const report = store.storageDiagnostics().find((entry) => entry.file === file);
    assert.ok(report && !report.blocking, id);
    if (reason) assert.match(report.reason, reason);
    assert.throws(() => store.editIntent(id, "lost"), (error: Error & { file?: string }) => error.file === file);
    assert.equal(readFileSync(file, "utf8"), bytes, "the reader deletes nothing");
  }
  assert.deepEqual(store.listOpenIntents(), []);
  assert.deepEqual(store.listClosedIntents(project.id, 10).map((intent) => intent.id).sort(), [captured, former]);
  store.close();
});

test("an unreadable legacy store skips its import and never blocks startup", async () => {
  const dir = scratchDir("spex-badlegacy-");
  const legacyDbPath = join(dir, "spex.db");
  // What better-sqlite3 leaves when the old app died before its first
  // migration: a zero-byte file.
  writeFileSync(legacyDbPath, "");
  const store = await Store.open({ machineIdentity, dir: join(dir, "state"), legacyDbPath, own: "tester" });
  store.registerProject(join(tmpdir(), "spex-after"), "after", 1);
  store.close();
  const reopened = await Store.open({ machineIdentity, dir: join(dir, "state"), legacyDbPath, own: "tester" });
  assert.equal(reopened.listProjects().length, 1);
  reopened.close();
});

test("an unreadable legacy store stays unmarked until it is repaired", async () => {
  // Root reads a mode-000 file, so the refusal cannot be staged.
  if (process.getuid?.() === 0) return;
  const dir = scratchDir("spex-unreadable-");
  const legacyDbPath = join(dir, "spex.db");
  const db = new Database(legacyDbPath);
  db.exec(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      registered_at INTEGER NOT NULL
    );
    INSERT INTO projects VALUES ('71000000-0000-4000-8000-000000000008', '${join(tmpdir(), "spex-unreadable-project").replaceAll("'", "''")}', 'p', 1);
  `);
  db.close();
  chmodSync(legacyDbPath, 0o000);
  const marker = `${legacyDbPath}.imported`;
  try {
    // The import fails and is recorded nowhere — not in this root's
    // meta, not beside the file — so a repaired file imports later.
    const store = await Store.open({ machineIdentity, dir: join(dir, "state"), legacyDbPath, own: "tester" });
    assert.deepEqual(store.listProjects(), []);
    store.close();
    assert.ok(!existsSync(marker));
    assert.equal(JSON.parse(readFileSync(join(dir, "state", "meta.json"), "utf8")).importedLegacy, undefined);
  } finally {
    chmodSync(legacyDbPath, 0o600);
  }
  const repaired = await Store.open({ machineIdentity, dir: join(dir, "state"), legacyDbPath, own: "tester" });
  assert.equal(repaired.listProjects().length, 1);
  repaired.close();
  assert.ok(existsSync(marker));
});

test("an unreadable root lease fails closed rather than letting a second core in", () => {
  const dir = tempRoot();
  mkdirSync(join(dir, ".lease"), { recursive: true });
  writeFileSync(join(dir, ".lease", "owner.json"), "not json");
  assert.throws(() => new Store({ machineIdentity, dir, own: "tester" }), /malformed/);
  rmSync(join(dir, ".lease"), { recursive: true, force: true });
  const store = new Store({ machineIdentity, dir, own: "tester" });
  store.close();
});

test("storage-14: a live core of the former layout holding .lock keeps this one out", () => {
  const dir = tempRoot();
  mkdirSync(join(dir, ".lock"), { recursive: true });
  writeFileSync(join(dir, ".lock", "owner.json"), JSON.stringify({ pid: process.pid, hostname: hostname(), acquiredAt: 1, token: "former" }));
  assert.throws(() => new Store({ machineIdentity, dir, own: "tester" }), StateRootHeldError);
  assert.ok(!existsSync(join(dir, ".lease")), "the refused store leaves no lease behind");
  rmSync(join(dir, ".lock"), { recursive: true, force: true });
  new Store({ machineIdentity, dir, own: "tester" }).close();
});

test("storage-2: a new home writes home.yaml with this device, the origin it was created with, no instance and your own group", () => {
  const dir = tempRoot();
  const store = new Store({ machineIdentity, dir, own: "tester", env: { ...process.env, SPEX_HOST_URL: "HTTPS://Host.test:443/" } });
  const project = store.registerProject(join(tmpdir(), "spex-home-file"), "Home File", 1);
  store.close();
  const file = parseYaml(readFileSync(join(dir, "home.yaml"), "utf8")) as Record<string, unknown>;
  assert.deepEqual(Object.keys(file), ["format", "device", "origin", "instances", "own", "folders"]);
  assert.equal(file.format, 2);
  assert.match(String(file.device), /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.equal(file.origin, "https://host.test", "the environment's URL, as its canonical origin");
  assert.deepEqual(file.instances, []);
  assert.equal(file.own, "tester");
  assert.equal(project.id, "tester/home-file-spex");
  assert.deepEqual(file.folders, [{ path: join(tmpdir(), "spex-home-file"), repository: "tester/home-file-spex" }]);
  assert.deepEqual(project.repository, { key: "tester/home-file-spex", name: "home-file-spex", group: "tester", own: true });
  // The project file names the code's remote, none here (storage-3).
  assert.deepEqual(JSON.parse(readFileSync(join(dir, "workspace", "tester", "home-file-spex", "project.json"), "utf8")), { format: 1, name: "Home File", remote: null });
  // Your own group's spex repository stands on its spex branch, seeded.
  const own = join(dir, "workspace", "tester", "tester-spex");
  assert.ok(existsSync(join(own, "config", "playbook.config.yaml")));
  assert.equal(execFileSync("git", ["-C", own, "symbolic-ref", "--short", "HEAD"], { encoding: "utf8" }).trim(), "spex");
  assert.equal(execFileSync("git", ["-C", own, "rev-list", "--count", "HEAD"], { encoding: "utf8" }).trim(), "1");
  // Nothing outside workspace/ is a Git work tree (storage-1).
  assert.ok(!existsSync(join(dir, ".git")));
  // A malformed home file is reported, never guessed: writes refuse.
  writeFileSync(join(dir, "home.yaml"), "format: 2\n");
  const damaged = new Store({ machineIdentity, dir, own: "tester" });
  assert.ok(damaged.storageDiagnostics().some((entry) => entry.blocking && /home\.yaml/.test(entry.file)));
  assert.throws(() => damaged.registerProject(join(tmpdir(), "spex-other"), "other", 1), /home\.yaml/);
  damaged.close();
  // A URL the environment names that is no instance's origin creates no home.
  const refused = tempRoot();
  assert.throws(() => new Store({ machineIdentity, dir: refused, own: "tester", env: { ...process.env, SPEX_HOST_URL: "http://host.test" } }),
    (error: unknown) => error instanceof StorageFormatError && error.reason === "http://host.test is not an instance's origin");
  assert.equal(existsSync(join(refused, "home.yaml")), false);
});

test("storage-2: home.yaml lists every instance by its origin, the first the default; a sign-in lists its instance, as another account is refused; Forget takes a signed-out one", () => {
  const dir = scratchDir("spex-home-instances-");
  const home = Home.create(dir, { own: "tester", env: { SPEX_HOST_URL: "https://spex.pub" } });
  assert.deepEqual(home.instances(), []);
  assert.deepEqual(home.defaultInstance(), { origin: "https://spex.pub", clientId: "spex" }, "the recorded origin, while none is listed");
  assert.equal(home.account(), null);
  assert.deepEqual(home.instanceByFolder("@spex.pub"), { origin: "https://spex.pub", clientId: "spex" });
  // A sign-in lists the instance it names, in any spelling; the first listed is the default.
  const ada = { id: "1", login: "ada", displayName: "Ada" };
  home.signIn("http://127.0.0.1:4100/", ada);
  assert.deepEqual(home.instances(), [{ origin: "http://127.0.0.1:4100", clientId: "spex", account: ada }]);
  assert.equal(home.defaultInstance().origin, "http://127.0.0.1:4100");
  assert.deepEqual(home.account(), ada);
  assert.equal(home.account("https://spex.pub"), null);
  // The origin-less sign-in signs the default in; a second instance follows the first.
  home.signIn({ ...ada, displayName: "Ada L." });
  assert.deepEqual(home.instances(), [{ origin: "http://127.0.0.1:4100", clientId: "spex", account: { ...ada, displayName: "Ada L." } }]);
  home.signIn("HTTPS://Spex.pub", { id: "77", login: "lovelace", displayName: null });
  assert.equal(home.setDisplayName("https://spex.pub", "spex.pub"), true);
  assert.equal(home.setDisplayName("https://elsewhere.test", "Elsewhere"), false);
  assert.deepEqual(home.instances().map((entry) => [entry.origin, entry.account?.login, entry.displayName]),
    [["http://127.0.0.1:4100", "ada", undefined], ["https://spex.pub", "lovelace", "spex.pub"]]);
  // Clones keyed under an instance's folder find it; a key outside every one finds none.
  assert.equal(home.instanceByFolder("@127.0.0.1_4100")?.origin, "http://127.0.0.1:4100");
  assert.equal(home.instanceOfKey("@spex.pub/acme/a-spex")?.account?.login, "lovelace");
  assert.equal(home.instanceOfKey("tester/tester-spex"), undefined);
  assert.equal(home.instanceOfKey("@other.test/acme/a-spex"), undefined);
  assert.equal(home.instance("https://SPEX.pub/")?.origin, "https://spex.pub");
  // Another account at a listed instance is refused, its entry unchanged.
  assert.throws(() => home.signIn("https://spex.pub", ada), (error: unknown) => error instanceof InstanceRefused && error.reason === "another-account" && error.origin === "https://spex.pub");
  assert.equal(home.account("https://spex.pub")?.login, "lovelace");
  // An origin that is none, or whose folder a listed one's equals, is refused.
  assert.throws(() => home.signIn("http://spex.pub", ada), (error: unknown) => error instanceof StorageFormatError && /is not an instance's origin/.test(error.reason));
  assert.throws(() => home.signIn("https://127.0.0.1:4100", ada), (error: unknown) => error instanceof StorageFormatError &&
    error.reason === "instances http://127.0.0.1:4100 and https://127.0.0.1:4100 share the folder @127.0.0.1_4100");
  assert.equal(home.instances().length, 2);
  // Sign out keeps the entry; Forget refuses one signed in and takes one signed out.
  assert.throws(() => home.forget("https://spex.pub"), (error: unknown) => error instanceof InstanceRefused && error.reason === "signed-in");
  home.signOut("https://spex.pub");
  assert.equal(home.account("https://spex.pub"), null);
  assert.equal(home.instance("https://spex.pub")?.signedOut, true);
  assert.equal(home.account()?.login, "ada", "the other instance stays signed in");
  home.signIn("https://spex.pub", { id: "77", login: "lovelace", displayName: null });
  assert.equal(home.instance("https://spex.pub")?.signedOut, undefined, "signed in again as the same account");
  assert.equal(home.instance("https://spex.pub")?.displayName, "spex.pub", "its display name kept");
  home.signOut("https://spex.pub");
  assert.equal(home.forget("https://spex.pub"), true);
  assert.equal(home.forget("https://spex.pub"), false);
  home.signOut();
  assert.equal(home.forget("http://127.0.0.1:4100"), true);
  assert.deepEqual(home.instances(), []);
  assert.deepEqual(home.defaultInstance(), { origin: "https://spex.pub", clientId: "spex" }, "a home with no entry is as before any sign-in");
  home.save();
  assert.deepEqual(Home.load(dir).file, home.file);
});

test("storage-1, storage-2: home.yaml in format 1 is refused until the instances migration rewrites it; a listed instance stands once, canonical, at a folder of its own", () => {
  const dir = scratchDir("spex-home-format-");
  const file = join(dir, "home.yaml");
  const device = "71000000-0000-4000-8000-0000000000ff";
  const account = { id: "1", login: "ada", displayName: null };
  const valid = { format: 2, device, origin: "https://spex.pub", instances: [{ origin: "https://spex.pub", clientId: "spex", account }], own: "tester", folders: [] };
  const write = (value: unknown): void => writeFileSync(file, stringifyYaml(value));
  const refusal = (value: unknown): string => {
    write(value);
    try { Home.load(dir); } catch (error) { assert.ok(error instanceof StorageFormatError); return error.reason; }
    return "accepted";
  };
  assert.equal(refusal(valid), "accepted");
  assert.equal(refusal({ format: 1, device, host: { url: "https://spex.pub", clientId: "spex" }, own: "tester", folders: [] }),
    "format 1: the instances migration has not run; preserved unchanged");
  assert.equal(refusal({ ...valid, format: 3 }), "unsupported format 3; preserved unchanged");
  assert.equal(refusal({ ...valid, origin: "https://spex.pub/" }), "https://spex.pub/ is not an instance's origin");
  assert.equal(refusal({ ...valid, instances: [{ origin: "https://Spex.pub", clientId: "spex", account }] }), "https://Spex.pub is not an instance's origin");
  assert.equal(refusal({ ...valid, instances: [{ origin: "https://ada:secret@spex.pub", clientId: "spex", account }] }), "https://…@spex.pub is not an instance's origin");
  assert.equal(refusal({ ...valid, instances: [valid.instances[0], valid.instances[0]] }), "instances https://spex.pub and https://spex.pub share the folder @spex.pub");
  assert.equal(refusal({ ...valid, instances: [{ origin: "http://localhost:8443", clientId: "spex", account }, { origin: "https://localhost:8443", clientId: "spex", account }] }),
    "instances http://localhost:8443 and https://localhost:8443 share the folder @localhost_8443");
  assert.equal(refusal({ ...valid, instances: [{ origin: "https://spex.pub", clientId: "spex", account, signedOut: "yes" }] }), "invalid home file");
  assert.match(refusal({ ...valid, instances: [{ url: "https://spex.pub", clientId: "spex", account }] }), /^expected fields /, "an entry names its origin as origin");
  assert.match(refusal({ ...valid, instances: [{ origin: "https://spex.pub", clientId: "spex" }] }), /^expected fields /, "an entry carries its account");
  assert.match(refusal({ ...valid, host: valid.instances[0] }), /^expected fields /);
  // Your own group's config path reads either format's folder name.
  write({ format: 1, device, host: { url: "https://spex.pub", clientId: "spex" }, own: "bob", folders: [] });
  assert.equal(ownConfigPath(dir), join(dir, "workspace", "bob", "bob-spex", "config", "playbook.config.yaml"));
});

test("projects-10: removal forgets the pair and deletes the clone; the working folder stays", () => {
  const dir = tempRoot();
  const folder = join(scratchDir("spex-remove-folder-"), "work");
  mkdirSync(folder);
  writeFileSync(join(folder, "keep.txt"), "kept");
  const store = new Store({ machineIdentity, dir, own: "tester" });
  const project = store.registerProject(folder, "work", 1);
  const clone = join(dir, "workspace", "tester", "work-spex");
  assert.ok(existsSync(clone));
  assert.ok(store.removeProject(project.id));
  assert.ok(!existsSync(clone));
  assert.equal(readFileSync(join(folder, "keep.txt"), "utf8"), "kept");
  assert.deepEqual(store.listProjects(), []);
  store.close();
  const reopened = new Store({ machineIdentity, dir, own: "tester" });
  assert.deepEqual(reopened.listProjects(), []);
  assert.deepEqual(reopened.storageDiagnostics(), []);
  reopened.close();
});

test("storage-1: a clone whose group and name the host spells with capitals, dots and underscores pairs under that key", () => {
  const dir = tempRoot();
  const store = new Store({ machineIdentity, dir, own: "tester" });
  const project = store.registerProject(join(tmpdir(), "spex-spelled"), "spelled", 1);
  store.close();
  // The host's own spelling of the group and the repository, as a sync
  // that followed a transfer would leave them (space-60).
  const key = "Acme.Corp/platform_team/web.app-spex";
  mkdirSync(join(dir, "workspace", "Acme.Corp", "platform_team"), { recursive: true });
  renameSync(join(dir, "workspace", ...project.id.split("/")), join(dir, "workspace", ...key.split("/")));
  const home = parseYaml(readFileSync(join(dir, "home.yaml"), "utf8")) as { folders: { repository: string }[] };
  for (const folder of home.folders) if (folder.repository === project.id) folder.repository = key;
  writeFileSync(join(dir, "home.yaml"), stringifyYaml(home));
  // A dot folder is never a group or a clone.
  mkdirSync(join(dir, "workspace", ".trash", "old-spex"), { recursive: true });
  const reopened = new Store({ machineIdentity, dir, own: "tester" });
  assert.deepEqual(reopened.listProjects().map((entry) => entry.id), [key]);
  assert.ok(!reopened.listRepositories().some((repository) => repository.key.includes(".trash")));
  reopened.close();
});

test("storage-1: a clone under an instance's folder with nine segments below it, as deep as a key stood before the instance's folder led it, pairs and lists under that key", () => {
  const dir = tempRoot();
  const store = new Store({ machineIdentity, dir, own: "tester" });
  const project = store.registerProject(join(tmpdir(), "spex-deep"), "deep", 1);
  store.close();
  const key = "@spex.pub/acme/b/c/d/e/f/g/h/deep-spex";
  assert.equal(key.split("/").length, 10);
  mkdirSync(join(dir, "workspace", ...key.split("/").slice(0, -1)), { recursive: true });
  renameSync(join(dir, "workspace", ...project.id.split("/")), join(dir, "workspace", ...key.split("/")));
  const home = parseYaml(readFileSync(join(dir, "home.yaml"), "utf8")) as { folders: { repository: string }[] };
  for (const folder of home.folders) if (folder.repository === project.id) folder.repository = key;
  writeFileSync(join(dir, "home.yaml"), stringifyYaml(home));
  const reopened = new Store({ machineIdentity, dir, own: "tester" });
  assert.deepEqual(reopened.listProjects().map((entry) => entry.id), [key]);
  assert.ok(reopened.listRepositories().some((repository) => repository.key === key));
  assert.deepEqual(reopened.storageDiagnostics(), [], "neither an unpaired clone nor a missing one");
  reopened.close();
});

test("storage-12: an unpaired clone and a pair whose clone is missing are repairs, nothing paired automatically", () => {
  const dir = tempRoot();
  const store = new Store({ machineIdentity, dir, own: "tester" });
  const kept = store.registerProject(join(tmpdir(), "spex-kept"), "kept", 1);
  const lost = store.registerProject(join(tmpdir(), "spex-lost"), "lost", 1);
  store.close();
  // A clone no folder pairs: drop its pair by hand.
  const home = parseYaml(readFileSync(join(dir, "home.yaml"), "utf8")) as { folders: { repository: string }[] };
  home.folders = home.folders.filter((folder) => folder.repository !== kept.id);
  writeFileSync(join(dir, "home.yaml"), stringifyYaml(home));
  rmSync(join(dir, "workspace", "tester", "lost-spex"), { recursive: true, force: true });
  const reopened = new Store({ machineIdentity, dir, own: "tester" });
  const repairs = reopened.storageDiagnostics().map((entry) => entry.repair);
  assert.deepEqual(repairs.find((repair) => repair?.kind === "repository"),
    { kind: "repository", repository: kept.id, name: "kept-spex", group: "tester", directories: [], sessions: 0, key: `${kept.id}|` });
  assert.deepEqual(repairs.find((repair) => repair?.kind === "folder"),
    { kind: "folder", repository: lost.id, directories: [join(tmpdir(), "spex-lost")], sessions: 0, key: `${lost.id}|${join(tmpdir(), "spex-lost")}` });
  assert.deepEqual(reopened.listProjects(), []);
  reopened.close();
});

test("shared replay remains token-free in memory and across restart", async () => {
  const dir = tempRoot();
  const store = new Store({ machineIdentity, dir, own: "tester" });
  const lease = await sharedSession(store);
  await lease.append({
    type: "player_finished",
    turnId: 1,
    timestamp: 10,
    playerId: "dev.coder",
    result: { status: "ok", finalText: "done", resumeToken: "sess-abc" },
  } as unknown as TmuxPlayRecord);
  await lease.append({
    type: "captain_telemetry",
    turnId: 1,
    timestamp: 11,
    topic: "playbook.trace",
    payload: {
      type: "player.call.finished",
      playerId: "dev.coder",
      resume: "sess-abc",
      resumeToken: "sess-def",
      status: "ok",
    },
  } as unknown as TmuxPlayRecord);
  await lease.append({
    type: "captain_telemetry",
    turnId: 1,
    timestamp: 12,
    topic: "playbook.trace",
    payload: { type: "player.call.started", resume: false },
  } as unknown as TmuxPlayRecord);
  await lease.release();
  store.close();

  const reopened = new Store({ machineIdentity, dir, own: "tester" });
  await reopened.initializeSessions();
  const text = readFileSync(join(sessionsOf(dir), "71000000-0000-4000-8000-000000000001.records.jsonl"), "utf8");
  assert.ok(!text.includes("sess-abc") && !text.includes("sess-def"));
  const serialized = JSON.stringify(reopened.getRecords("71000000-0000-4000-8000-000000000001"));
  assert.ok(!serialized.includes("resumeToken") && !serialized.includes("sess-abc"));
  // `resume: false` is semantics, not a token, and survives the strip.
  const trace = reopened.getRecords("71000000-0000-4000-8000-000000000001")[3].record as unknown as {
    payload: { resume?: unknown };
  };
  assert.equal(trace.payload.resume, false);
  reopened.close();
});

test("a lease-free shared read serves only the complete prefix and mutates nothing", async () => {
  const dir = tempRoot();
  const store = new Store({ machineIdentity, dir, own: "tester" });
  const lease = await sharedSession(store);
  await lease.append({
    type: "captain_status",
    turnId: 1,
    timestamp: 10,
    message: "ok",
  } as TmuxPlayRecord);
  await lease.release();
  store.close();

  // A torn tail, as a crashed writer leaves it.
  const file = join(sessionsOf(dir), "71000000-0000-4000-8000-000000000001.records.jsonl");
  const damaged = readFileSync(file, "utf8") + '{"v":1,"seq":2,"rec';
  writeFileSync(file, damaged);

  const reopened = new Store({ machineIdentity, dir, own: "tester" });
  await reopened.initializeSessions();
  assert.deepEqual(
    reopened.getRecords("71000000-0000-4000-8000-000000000001").map((r) => r.seq),
    [1, 2],
  );
  assert.equal(readFileSync(file, "utf8"), damaged, "the reader rewrites nothing");
  reopened.close();
});

test("shared stream failure preserves the incomplete marker across Store restart", async () => {
  const dir = tempRoot(); const store = new Store({ machineIdentity, dir, own: "tester" });
  const lease = await sharedSession(store);
  await lease.append({ type: "player_prompt", turnId: 1, timestamp: 10, playerId: "dev.coder", prompt: "measure" });
  const file = join(sessionsOf(dir), `${SESSION}.records.jsonl`);
  const prefix = readFileSync(file);
  chmodSync(file, 0o644);
  await assert.rejects(() => lease.append({ type: "player_finished", turnId: 1, timestamp: 11, playerId: "dev.coder", result: { status: "ok", playerId: "dev.coder", turnId: 1 } }));
  chmodSync(file, 0o600);
  assert.equal(lease.streamStatus().incomplete, true);
  await lease.release(); store.close();
  assert.deepEqual(readFileSync(file), prefix);
  const reopened = new Store({ machineIdentity, dir, own: "tester" }); await reopened.initializeSessions();
  assert.equal(reopened.describeSession(SESSION)?.streamIncompleteAfterSeq, 1, "failure retains the last fsynced checkpoint, not merely readable bytes");
  assert.equal(reopened.describeSession(SESSION)?.agentActiveMs, undefined);
  assert.equal(reopened.describeSession(SESSION)?.continuable, undefined);
  assert.deepEqual(reopened.getRecords(SESSION).map((record) => record.seq), [1, 2]);
  reopened.close();
});


test("unsupported or damaged migration metadata stays unchanged and releases the home lease", () => {
  for (const bytes of ['{"version":42}', '{"version":1,"extra":true}', 'null', '{broken']) {
    const dir = tempRoot(); mkdirSync(dir, { recursive: true });
    const file = join(dir, "meta.json"); writeFileSync(file, bytes);
    assert.throws(() => new Store({ machineIdentity, dir, own: "tester" }));
    assert.equal(readFileSync(file, "utf8"), bytes);
    assert.equal(existsSync(join(dir, ".lease")), false);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("storage-23: authoring session encodings are written and read back exactly", () => {
  const dir = tempRoot(); mkdirSync(dir, { recursive: true });
  const authoringDir = join(dir, "workspace", "tester", "proj-spex", "authoring");
  const workingFolder = join(dir, "project");
  const location = { key: "tester/proj-spex", authoringDir, workingFolder };
  const drafts = new DraftStore(() => [location]);
  // `authoring/` is made inside a clone that stands, never the clone.
  assert.throws(() => drafts.create("triage", 1000, location, { org: "local", license: "MIT" }, "en"), /ENOENT/);
  mkdirSync(join(authoringDir, ".."), { recursive: true });
  const draft = drafts.create("triage", 1000, location, { org: "local", license: "MIT" }, "en");
  // The spec package under development stands in the working folder
  // with its manifest (environments-10, playbook-library-70).
  const packageDir = join(workingFolder, "spex-packages", "triage");
  assert.equal(drafts.draftDir("triage"), packageDir);
  assert.equal(drafts.sourcePath("triage"), join(packageDir, "playbooks", "en", "triage", "triage.md"));
  assert.match(readFileSync(join(packageDir, "meta.yaml"), "utf8"), /^format: 2\norg: local\nname: triage\nversion: 0\.1\.0\n/);
  assert.equal(drafts.recordFile("triage"), join(authoringDir, "triage.json"));
  assert.equal(drafts.projectOf("triage"), "tester/proj-spex");
  // Creation mints the session's instance, a fresh UUID each time.
  assert.match(draft.instance, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  // The session's language is recorded with it (storage-23).
  assert.deepEqual(JSON.parse(readFileSync(drafts.recordFile("triage"), "utf8")), { format: 1, id: "triage", instance: draft.instance, createdAt: 1000, touchedAt: 1000, package: "spex-packages/triage", language: "en", queued: [], failures: 0 });
  const full: StoredDraft = {
    ...draft, touchedAt: 2000, queued: [{text: "next"}, {text: "after"}], failures: 2,
    compile: { at: 1500, by: "agent", outcome: "failed", phase: "gears2fsm", output: "✗ gears2fsm failed at x (2s)", questions: [{ id: "q1", question: "?", reason: "r", evidence: "e", choices: ["a", "b"] }], relay: "stopped", roles: ["Coder"], sourceSha256: "ab".repeat(32) },
    proposal: { command: "triage", intent: "Label issues", players: { Coder: "dev.coder" } },
  };
  const read = drafts.load("triage");
  drafts.write(full, read.version);
  const bytes = JSON.parse(readFileSync(drafts.recordFile("triage"), "utf8")) as Record<string, unknown>;
  assert.deepEqual(Object.keys(bytes), ["format", "id", "instance", "createdAt", "touchedAt", "package", "language", "queued", "failures", "compile", "proposal"]);
  assert.deepEqual(bytes, full);
  assert.deepEqual(drafts.read("triage"), full);
  assert.deepEqual(drafts.ids(), ["triage"]);
  // A write under the bytes read before the last write is refused and
  // changes nothing (playbook-library-70).
  assert.throws(() => drafts.write({ ...full, failures: 9 }, read.version), DraftChangedError);
  assert.deepEqual(drafts.read("triage"), full);
  // A file an earlier version wrote reads as the UUID its id and
  // creation time derive, alike in two homes, and records it at its
  // next write.
  const legacy = '{"format":1,"id":"triage","createdAt":1000,"touchedAt":1000,"package":"spex-packages/triage","queued":[],"failures":0}';
  const otherDir = join(dir, "elsewhere", "authoring");
  mkdirSync(otherDir, { recursive: true });
  writeFileSync(join(otherDir, "triage.json"), legacy);
  writeFileSync(drafts.recordFile("triage"), legacy);
  const derived = drafts.read("triage").instance;
  assert.equal(derived, legacyInstance("triage", 1000));
  // A file without `language` reads as `en`, and its next write adds none.
  assert.equal(drafts.read("triage").language, undefined);
  assert.equal(drafts.language("triage"), "en");
  assert.equal(drafts.sourcePath("triage"), join(packageDir, "playbooks", "en", "triage", "triage.md"));
  assert.match(derived, /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(new DraftStore(() => [{ key: "elsewhere/proj-spex", authoringDir: otherDir, workingFolder: null }]).read("triage").instance, derived);
  const old = drafts.load("triage");
  drafts.write({ ...old.draft, touchedAt: 1001 }, old.version);
  assert.equal(JSON.parse(readFileSync(drafts.recordFile("triage"), "utf8")).instance, derived);
  assert.equal(Object.hasOwn(JSON.parse(readFileSync(drafts.recordFile("triage"), "utf8")), "language"), false);
  drafts.write(full, drafts.load("triage").version);
  // A fresh store finds the session by its clone.
  assert.deepEqual(new DraftStore(() => [location]).ids(), ["triage"]);
  // The transcript: newline-terminated {seq,record} lines in order,
  // no provider token, and an incomplete final line is not a record.
  const started = { type: "turn_started", turnId: 1, timestamp: 3000, turn: { id: 1, prompt: "hi", timestamp: 3000 } } as unknown as TmuxPlayRecord;
  drafts.append("triage", draft.instance, started);
  drafts.append("triage", draft.instance, { type: "player_finished", turnId: 1, timestamp: 3001, playerId: "author", result: { status: "ok", playerId: "author", turnId: 1, resumeToken: "secret-token", finalText: "done" } } as unknown as TmuxPlayRecord);
  assert.equal(drafts.recordsFile("triage"), join(authoringDir, "triage.records.jsonl"));
  const text = readFileSync(drafts.recordsFile("triage"), "utf8");
  const finished = { type: "player_finished", turnId: 1, timestamp: 3001, playerId: "author", result: { status: "ok", playerId: "author", turnId: 1, finalText: "done" } };
  assert.equal(text, `${JSON.stringify({ seq: 1, record: started })}\n${JSON.stringify({ seq: 2, record: finished })}\n`);
  assert.ok(!text.includes("secret-token"), "no provider token enters the transcript");
  assert.deepEqual(drafts.records("triage"), { records: [{ seq: 1, record: started }, { seq: 2, record: finished as unknown as TmuxPlayRecord }] });
  // An append naming another instance writes nothing.
  assert.throws(() => drafts.append("triage", legacyInstance("triage", 1), started), DraftChangedError);
  assert.equal(readFileSync(drafts.recordsFile("triage"), "utf8"), text);
  appendFileSync(drafts.recordsFile("triage"), '{"seq":3,"record":{"type":"turn_fin');
  assert.deepEqual(drafts.records("triage").records.map((r) => r.seq), [1, 2]);
  assert.equal(drafts.records("triage").incompleteAfterSeq, 2);
  // Every key is closed: a stray field, an unknown format or a wrong id is a scoped diagnostic.
  const base = '"id":"triage","createdAt":1,"touchedAt":1,"package":"spex-packages/triage","queued":[],"failures":0';
  for (const damaged of [`{"format":2,${base}}`, `{"format":1,${base},"token":"x"}`, `{"format":1,${base},"language":"../zh"}`, `{"format":1,${base},"language":7}`, `{"format":1,${base.replace('"triage"', '"other"')}}`, `{"format":1,${base},"compile":{"at":1,"by":"boss","outcome":"failed","relay":"lost"}}`, `{"format":1,${base.replace('"spex-packages/triage"', '"../out"')}}`, `{"v":2,${base}}`, "{broken"]) {
    writeFileSync(drafts.recordFile("triage"), damaged);
    assert.throws(() => drafts.read("triage"), StorageFormatError, damaged);
  }
  // The source is versioned by its digest; a stale token conflicts.
  const first = drafts.writeSource("triage", "# Triage\n");
  assert.ok(first.ok && first.version.length === 16);
  const stale = drafts.writeSource("triage", "# Triage 2\n", "0000000000000000");
  assert.ok(!stale.ok && stale.code === "conflict");
  const next = drafts.writeSource("triage", "# Triage 2\n", first.ok ? first.version : undefined);
  assert.ok(next.ok && next.version !== (first.ok ? first.version : ""));
  assert.equal(drafts.readSource("triage")?.markdown, "# Triage 2\n");
  // Delete removes the session's files and leaves the spec package
  // folder in the working folder (playbook-library-63).
  mkdirSync(join(authoringDir, "triage.assets"));
  const source = drafts.sourcePath("triage")!;
  // The file was left damaged above: it names no instance to delete
  // under, only its bytes' version.
  assert.throws(() => drafts.delete("triage", { instance: draft.instance }), DraftChangedError);
  drafts.delete("triage", { version: drafts.fileVersion("triage")! });
  assert.ok(!existsSync(join(authoringDir, "triage.json")) && !existsSync(join(authoringDir, "triage.records.jsonl")) && !existsSync(join(authoringDir, "triage.assets")));
  assert.ok(existsSync(source));
  assert.ok(existsSync(join(packageDir, "meta.yaml")));
  rmSync(dir, { recursive: true, force: true });
});

test("storage-34: a clone's remotes stand in the order of their sections in its Git configuration, whatever order Git lists their keys", () => {
  const config = [
    "[core]", "\trepositoryformatversion = 0",
    "[remote \"@127.0.0.1_39003\"]", "\turl = http://127.0.0.1:39003/git/a-spex.git", "\tspexId = 3001",
    "[branch \"spex\"]", "\tremote = @127.0.0.1_39003",
    "[remote \"@127.0.0.1_34023\"]", "\turl = http://127.0.0.1:34023/git/a-spex.git",
    "[remote \"origin\"]", "\turl = /tmp/bare.git",
    "[remote \"with \\\"quote\\\"\"]", "\turl = /tmp/q.git",
  ].join("\n");
  assert.deepEqual(remoteSectionOrder(config), ["@127.0.0.1_39003", "@127.0.0.1_34023", "origin", 'with "quote"']);
  // Git's listing sorted by key, as some versions give it, is put back in the file's order.
  const sorted = ["remote.@127.0.0.1_34023.url\nhttp://127.0.0.1:34023/git/a-spex.git", "remote.@127.0.0.1_39003.url\nhttp://127.0.0.1:39003/git/a-spex.git", "remote.origin.url\n/tmp/bare.git"].join("\0");
  assert.deepEqual(remoteNamesIn(sorted, remoteSectionOrder(config)), ["@127.0.0.1_39003", "@127.0.0.1_34023", "origin"]);
  // A name the file does not list keeps its place after the listed ones, and no order leaves the listing as it is.
  assert.deepEqual(remoteNamesIn(sorted + "\0remote.extra.url\n/tmp/x.git", ["origin"]), ["origin", "@127.0.0.1_34023", "@127.0.0.1_39003", "extra"]);
  assert.deepEqual(remoteNamesIn(sorted), ["@127.0.0.1_34023", "@127.0.0.1_39003", "origin"]);
});
