// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { test } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { hostname, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import Database from "better-sqlite3";
import { projectCaptainSessionStructure, type SessionExecutionProjection, type SessionFreshBoundary } from "@sublang/playbook/session-store";

import { StateRootHeldError, Store } from "./store.js";
import { DraftStore, type StoredDraft } from "./drafts.js";
import { StorageFormatError } from "./app-storage.js";
import type { SessionInfo, TmuxPlayRecord } from "./protocol.js";
import { scratchDir } from "./testing/scratch.js";

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
  const store = new Store({ dir: tempRoot(), own: "tester" });
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
  const store = new Store({ dir, own: "tester" });
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

  const reopened = new Store({ dir, own: "tester" });
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
  const store = new Store({ dir, own: "tester" });
  const lease = await sharedSession(store);
  await lease.release();
  await store.initializeSessions();
  assert.equal(store.listSessions()[0].continuable, true);
  store.reopenSession(SESSION, []);
  assert.equal(store.listSessions()[0].live, true);
  assert.equal(store.listSessions()[0].continuable, undefined);
  store.close();

  const reopened = new Store({ dir, own: "tester" });
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

test("prefs round-trip JSON values", () => {
  const store = new Store({ dir: tempRoot(), own: "tester" });
  store.setPref("ui", { theme: "dark" });
  assert.deepEqual(store.getPref("ui"), { theme: "dark" });
  store.setPref("ui", { theme: "light" });
  assert.deepEqual(store.getPref("ui"), { theme: "light" });
  store.close();
});

test("storage-5: a session's own agent settings survive a restart field by field, subagent model and effort included", () => {
  const dir = tempRoot();
  const store = new Store({ dir, own: "tester" });
  const session = sampleSession(store);
  store.setSessionAgentSettingsMap(session.id, {
    captain: { model: "claude-captain", subagentModel: "claude-sonnet-5-5", effort: false, subagentEffort: "high", fastMode: true },
    "dev.coder": { subagentModel: false, subagentEffort: false },
    "dev.reviewer": { subagentModel: "inherit" },
  });
  store.close();

  const reopened = new Store({ dir, own: "tester" });
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
  // the session's own first words, its size, and whether it ended badly.
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
  store.createSession({ ...base, id: "rich" });
  store.createSession({ ...base, id: "bare", createdAt: 3000 });

  store.startTurn("rich", 1, "harden the session refresh", 2100);
  store.endTurn("rich", 1, "finished", 2200);
  store.startTurn("rich", 2, "add expiry-skew tests", 2300);
  store.appendRecord("rich", 1, {
    type: "runtime_error",
    turnId: 2,
    timestamp: 2400,
    message: "The Captain's turn failed: adapter sign-in expired",
  } as TmuxPlayRecord);
  store.addUsage({
    sessionId: "rich",
    turnId: 1,
    actorId: "dev.coder",
    inputTokens: 100,
    outputTokens: 20,
    toolUses: 1,
    totalCostUsd: 0.16,
    at: 2500,
  });

  const listed = store.listSessions();
  const rich = listed.find((session) => session.id === "rich");
  const bare = listed.find((session) => session.id === "bare");

  assert.equal(rich?.title, "harden the session refresh");
  assert.equal(rich?.turns, 2);
  assert.equal(rich?.failed, true);

  // A session that never held a turn says so by carrying no title,
  // rather than faking a name.
  assert.equal(bare?.title, undefined);
  assert.equal(bare?.turns, 0);
  assert.equal(bare?.failed, false);
  store.close();
});

test("core-service-61: a held state root refuses a second store, and releases on close", () => {
  const dir = tempRoot();
  const first = new Store({ dir, own: "tester" });
  assert.throws(
    () => new Store({ dir, own: "tester" }),
    (error: unknown) => {
      assert.ok(error instanceof StateRootHeldError);
      assert.equal(error.holder.pid, process.pid);
      return true;
    },
  );
  first.close();
  const second = new Store({ dir, own: "tester" });
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

  const store = await Store.open({ dir: root, legacyDbPath, own: "tester" });
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
  const reopened = await Store.open({ dir: root, legacyDbPath, own: "tester" });
  reopened.setPref("viewed:71000000-0000-4000-8000-000000000001", 4);
  reopened.close();
  const third = await Store.open({ dir: root, legacyDbPath, own: "tester" });
  assert.equal(third.getPref("viewed:71000000-0000-4000-8000-000000000001"), 4);
  assert.ok(existsSync(legacyDbPath));
  third.close();

  // The file carries its mark, so a state root created later on this
  // machine — a second home, a reinstall into a fresh one — imports
  // nothing from it, and the file itself stays untouched.
  const marker = `${legacyDbPath}.imported`;
  assert.ok(existsSync(marker));
  assert.equal(JSON.parse(readFileSync(marker, "utf8")).root, root);
  const fresh = await Store.open({ dir: join(dir, "fresh-state"), legacyDbPath, own: "tester" });
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
  const stamping = await Store.open({ dir: root, legacyDbPath, own: "tester" });
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
    const store = await Store.open({ dir: join(dir, "state"), legacyDbPath, own: "tester" });
    assert.equal(store.listProjects().length, 1);
    store.close();
    // The mark could not be written; the root's own record stands.
    assert.ok(!existsSync(`${legacyDbPath}.imported`));
    assert.deepEqual(JSON.parse(readFileSync(join(dir, "state", "meta.json"), "utf8")).importedLegacy, [legacyDbPath]);
    const reopened = await Store.open({ dir: join(dir, "state"), legacyDbPath, own: "tester" });
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

  const first = await Store.open({ dir: root, legacyDbPath: join(dir, "desktop.db"), own: "tester" });
  first.registerProject(join(tmpdir(), "spex-new-work"), "new-work", 2);
  first.setPref("shared", "live");
  first.close();

  // The home already holds the groups layout: the late import merges in
  // through the same migration, what the home holds winning (storage-9).
  const second = await Store.open({ dir: root, legacyDbPath: join(dir, "server.db"), own: "tester" });
  assert.deepEqual(
    second.listProjects().map((project) => project.path).sort(),
    [join(tmpdir(), "spex-desktop-project"), join(tmpdir(), "spex-new-work"), join(tmpdir(), "spex-server-project")],
  );
  // Existing preferences win over imported ones: they are newer.
  assert.equal(second.getPref("shared"), "live");
  second.close();
});

test("storage-4: one closed file per intent; a malformed one is reported, kept and listed nowhere", () => {
  const dir = tempRoot(); const store = new Store({ dir, own: "tester" });
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
  const reopened = new Store({ dir, own: "tester" });
  assert.deepEqual(reopened.listOpenIntents(), []);
  assert.equal(reopened.getIntent(nextId), undefined);
  assert.equal(reopened.getIntent(firstId)?.closedAs, "done");
  assert.ok(reopened.storageDiagnostics().some((entry) => entry.file === join(intents, `${nextId}.json`) && !entry.blocking));
  assert.equal(readFileSync(join(intents, `${nextId}.json`), "utf8"), damaged, "the reader deletes nothing");
  // A format this Spex does not know is refused, never guessed.
  writeFileSync(join(intents, `${nextId}.json`), '{"format":2,"id":"' + nextId + '","text":"x","createdAt":2}');
  reopened.reload();
  assert.ok(reopened.storageDiagnostics().some((entry) => /unsupported format 2/.test(entry.reason)));
  // A remove deletes the file and its attachments.
  mkdirSync(join(intents, `${firstId}.assets`));
  reopened.removeIntent(firstId);
  assert.ok(!existsSync(join(intents, `${firstId}.json`)) && !existsSync(join(intents, `${firstId}.assets`)));
  reopened.close();
});

test("an unreadable legacy store skips its import and never blocks startup", async () => {
  const dir = scratchDir("spex-badlegacy-");
  const legacyDbPath = join(dir, "spex.db");
  // What better-sqlite3 leaves when the old app died before its first
  // migration: a zero-byte file.
  writeFileSync(legacyDbPath, "");
  const store = await Store.open({ dir: join(dir, "state"), legacyDbPath, own: "tester" });
  store.registerProject(join(tmpdir(), "spex-after"), "after", 1);
  store.close();
  const reopened = await Store.open({ dir: join(dir, "state"), legacyDbPath, own: "tester" });
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
    const store = await Store.open({ dir: join(dir, "state"), legacyDbPath, own: "tester" });
    assert.deepEqual(store.listProjects(), []);
    store.close();
    assert.ok(!existsSync(marker));
    assert.equal(JSON.parse(readFileSync(join(dir, "state", "meta.json"), "utf8")).importedLegacy, undefined);
  } finally {
    chmodSync(legacyDbPath, 0o600);
  }
  const repaired = await Store.open({ dir: join(dir, "state"), legacyDbPath, own: "tester" });
  assert.equal(repaired.listProjects().length, 1);
  repaired.close();
  assert.ok(existsSync(marker));
});

test("an unreadable root lease fails closed rather than letting a second core in", () => {
  const dir = tempRoot();
  mkdirSync(join(dir, ".lease"), { recursive: true });
  writeFileSync(join(dir, ".lease", "owner.json"), "not json");
  assert.throws(() => new Store({ dir, own: "tester" }), /unreadable lock/);
  rmSync(join(dir, ".lease"), { recursive: true, force: true });
  const store = new Store({ dir, own: "tester" });
  store.close();
});

test("storage-14: a live core of the former layout holding .lock keeps this one out", () => {
  const dir = tempRoot();
  mkdirSync(join(dir, ".lock"), { recursive: true });
  writeFileSync(join(dir, ".lock", "owner.json"), JSON.stringify({ pid: process.pid, hostname: hostname(), acquiredAt: 1, token: "former" }));
  assert.throws(() => new Store({ dir, own: "tester" }), StateRootHeldError);
  assert.ok(!existsSync(join(dir, ".lease")), "the refused store leaves no lease behind");
  rmSync(join(dir, ".lock"), { recursive: true, force: true });
  new Store({ dir, own: "tester" }).close();
});

test("storage-2: a new home writes home.yaml with this device, the host and your own group", () => {
  const dir = tempRoot();
  const store = new Store({ dir, own: "tester", env: { ...process.env, SPEX_HOST_URL: "https://host.test" } });
  const project = store.registerProject(join(tmpdir(), "spex-home-file"), "Home File", 1);
  store.close();
  const file = parseYaml(readFileSync(join(dir, "home.yaml"), "utf8")) as Record<string, unknown>;
  assert.deepEqual(Object.keys(file), ["format", "device", "host", "own", "folders"]);
  assert.match(String(file.device), /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.deepEqual(file.host, { url: "https://host.test", clientId: "spex" });
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
  const damaged = new Store({ dir, own: "tester" });
  assert.ok(damaged.storageDiagnostics().some((entry) => entry.blocking && /home\.yaml/.test(entry.file)));
  assert.throws(() => damaged.registerProject(join(tmpdir(), "spex-other"), "other", 1), /home\.yaml/);
  damaged.close();
});

test("projects-10: removal forgets the pair and deletes the clone; the working folder stays", () => {
  const dir = tempRoot();
  const folder = join(scratchDir("spex-remove-folder-"), "work");
  mkdirSync(folder);
  writeFileSync(join(folder, "keep.txt"), "kept");
  const store = new Store({ dir, own: "tester" });
  const project = store.registerProject(folder, "work", 1);
  const clone = join(dir, "workspace", "tester", "work-spex");
  assert.ok(existsSync(clone));
  assert.ok(store.removeProject(project.id));
  assert.ok(!existsSync(clone));
  assert.equal(readFileSync(join(folder, "keep.txt"), "utf8"), "kept");
  assert.deepEqual(store.listProjects(), []);
  store.close();
  const reopened = new Store({ dir, own: "tester" });
  assert.deepEqual(reopened.listProjects(), []);
  assert.deepEqual(reopened.storageDiagnostics(), []);
  reopened.close();
});

test("storage-1: a clone whose group and name the host spells with capitals, dots and underscores pairs under that key", () => {
  const dir = tempRoot();
  const store = new Store({ dir, own: "tester" });
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
  const reopened = new Store({ dir, own: "tester" });
  assert.deepEqual(reopened.listProjects().map((entry) => entry.id), [key]);
  assert.ok(!reopened.listRepositories().some((repository) => repository.key.includes(".trash")));
  reopened.close();
});

test("storage-12: an unpaired clone and a pair whose clone is missing are repairs, nothing paired automatically", () => {
  const dir = tempRoot();
  const store = new Store({ dir, own: "tester" });
  const kept = store.registerProject(join(tmpdir(), "spex-kept"), "kept", 1);
  const lost = store.registerProject(join(tmpdir(), "spex-lost"), "lost", 1);
  store.close();
  // A clone no folder pairs: drop its pair by hand.
  const home = parseYaml(readFileSync(join(dir, "home.yaml"), "utf8")) as { folders: { repository: string }[] };
  home.folders = home.folders.filter((folder) => folder.repository !== kept.id);
  writeFileSync(join(dir, "home.yaml"), stringifyYaml(home));
  rmSync(join(dir, "workspace", "tester", "lost-spex"), { recursive: true, force: true });
  const reopened = new Store({ dir, own: "tester" });
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
  const store = new Store({ dir, own: "tester" });
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

  const reopened = new Store({ dir, own: "tester" });
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
  const store = new Store({ dir, own: "tester" });
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

  const reopened = new Store({ dir, own: "tester" });
  await reopened.initializeSessions();
  assert.deepEqual(
    reopened.getRecords("71000000-0000-4000-8000-000000000001").map((r) => r.seq),
    [1, 2],
  );
  assert.equal(readFileSync(file, "utf8"), damaged, "the reader rewrites nothing");
  reopened.close();
});

test("shared stream failure preserves the incomplete marker across Store restart", async () => {
  const dir = tempRoot(); const store = new Store({ dir, own: "tester" });
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
  const reopened = new Store({ dir, own: "tester" }); await reopened.initializeSessions();
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
    assert.throws(() => new Store({ dir, own: "tester" }));
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
  const draft = drafts.create("triage", 1000, location, "local");
  // The spec package under development stands in the working folder
  // with its manifest (environments-10, playbook-library-70).
  const packageDir = join(workingFolder, "spex-packages", "triage");
  assert.equal(drafts.draftDir("triage"), packageDir);
  assert.equal(drafts.sourcePath("triage"), join(packageDir, "playbooks", "en", "triage", "triage.md"));
  assert.match(readFileSync(join(packageDir, "meta.yaml"), "utf8"), /^format: 2\norg: local\nname: triage\nversion: 0\.1\.0\n/);
  assert.equal(drafts.recordFile("triage"), join(authoringDir, "triage.json"));
  assert.equal(drafts.projectOf("triage"), "tester/proj-spex");
  assert.deepEqual(JSON.parse(readFileSync(drafts.recordFile("triage"), "utf8")), { format: 1, id: "triage", createdAt: 1000, touchedAt: 1000, package: "spex-packages/triage", queued: [], failures: 0 });
  const full: StoredDraft = {
    ...draft, touchedAt: 2000, queued: [{text: "next"}, {text: "after"}], failures: 2,
    compile: { at: 1500, by: "agent", outcome: "failed", phase: "gears2fsm", output: "✗ gears2fsm failed at x (2s)", questions: [{ id: "q1", question: "?", reason: "r", evidence: "e", choices: ["a", "b"] }], relay: "stopped", roles: ["Coder"], sourceSha256: "ab".repeat(32) },
    proposal: { command: "triage", intent: "Label issues", players: { Coder: "dev.coder" } },
  };
  drafts.write(full);
  const bytes = JSON.parse(readFileSync(drafts.recordFile("triage"), "utf8")) as Record<string, unknown>;
  assert.deepEqual(Object.keys(bytes), ["format", "id", "createdAt", "touchedAt", "package", "queued", "failures", "compile", "proposal"]);
  assert.deepEqual(bytes, full);
  assert.deepEqual(drafts.read("triage"), full);
  assert.deepEqual(drafts.ids(), ["triage"]);
  // A fresh store finds the session by its clone.
  assert.deepEqual(new DraftStore(() => [location]).ids(), ["triage"]);
  // The transcript: newline-terminated {seq,record} lines in order,
  // no provider token, and an incomplete final line is not a record.
  const started = { type: "turn_started", turnId: 1, timestamp: 3000, turn: { id: 1, prompt: "hi", timestamp: 3000 } } as unknown as TmuxPlayRecord;
  drafts.append("triage", 1, started);
  drafts.append("triage", 2, { type: "player_finished", turnId: 1, timestamp: 3001, playerId: "author", result: { status: "ok", playerId: "author", turnId: 1, resumeToken: "secret-token", finalText: "done" } } as unknown as TmuxPlayRecord);
  assert.equal(drafts.recordsFile("triage"), join(authoringDir, "triage.records.jsonl"));
  const text = readFileSync(drafts.recordsFile("triage"), "utf8");
  const finished = { type: "player_finished", turnId: 1, timestamp: 3001, playerId: "author", result: { status: "ok", playerId: "author", turnId: 1, finalText: "done" } };
  assert.equal(text, `${JSON.stringify({ seq: 1, record: started })}\n${JSON.stringify({ seq: 2, record: finished })}\n`);
  assert.ok(!text.includes("secret-token"), "no provider token enters the transcript");
  assert.deepEqual(drafts.records("triage"), { records: [{ seq: 1, record: started }, { seq: 2, record: finished as unknown as TmuxPlayRecord }] });
  appendFileSync(drafts.recordsFile("triage"), '{"seq":3,"record":{"type":"turn_fin');
  assert.deepEqual(drafts.records("triage").records.map((r) => r.seq), [1, 2]);
  assert.equal(drafts.records("triage").incompleteAfterSeq, 2);
  // Every key is closed: a stray field, an unknown format or a wrong id is a scoped diagnostic.
  const base = '"id":"triage","createdAt":1,"touchedAt":1,"package":"spex-packages/triage","queued":[],"failures":0';
  for (const damaged of [`{"format":2,${base}}`, `{"format":1,${base},"token":"x"}`, `{"format":1,${base.replace('"triage"', '"other"')}}`, `{"format":1,${base},"compile":{"at":1,"by":"boss","outcome":"failed","relay":"lost"}}`, `{"format":1,${base.replace('"spex-packages/triage"', '"../out"')}}`, `{"v":2,${base}}`, "{broken"]) {
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
  drafts.delete("triage");
  assert.ok(!existsSync(join(authoringDir, "triage.json")) && !existsSync(join(authoringDir, "triage.records.jsonl")) && !existsSync(join(authoringDir, "triage.assets")));
  assert.ok(existsSync(source));
  assert.ok(existsSync(join(packageDir, "meta.yaml")));
  rmSync(dir, { recursive: true, force: true });
});

test("playbook-library-70: the authoring store refuses an id another project's spex repository holds, and reports two holding one", () => {
  const dir = tempRoot(); mkdirSync(dir, { recursive: true });
  const at = (name: string) => ({
    key: `tester/${name}-spex`,
    authoringDir: join(dir, "workspace", "tester", `${name}-spex`, "authoring"),
    workingFolder: join(dir, name),
  });
  const a = at("alpha");
  const b = at("beta");
  const drafts = new DraftStore(() => [a, b]);
  drafts.create("triage", 1000, a, "local");
  // The id is the home's: the store itself refuses it to another
  // project, naming the one that holds it, and writes nothing there.
  assert.throws(() => drafts.create("triage", 2000, b, "local"),
    (error: unknown) => error instanceof StorageFormatError && error.reason.includes("triage") && error.reason.includes(a.key));
  assert.ok(!existsSync(join(b.authoringDir, "triage.json")));
  assert.ok(!existsSync(join(b.workingFolder, "spex-packages", "triage")));
  assert.equal(drafts.projectOf("triage"), a.key);
  assert.deepEqual(drafts.diagnostics(), []);
  // Two devices each created one before syncing: a rescan keeps the
  // first found and reports the other, nonblocking, by both and the id
  // (storage-12).
  mkdirSync(b.authoringDir, { recursive: true });
  writeFileSync(join(b.authoringDir, "triage.json"), readFileSync(join(a.authoringDir, "triage.json")));
  drafts.refresh();
  assert.equal(drafts.projectOf("triage"), a.key);
  assert.deepEqual(drafts.ids(), ["triage"]);
  const reports = drafts.diagnostics();
  assert.equal(reports.length, 1);
  assert.equal(reports[0].file, join(b.authoringDir, "triage.json"));
  assert.equal(reports[0].blocking, false);
  for (const name of ["triage", a.key, b.key]) assert.ok(reports[0].reason.includes(name), `${reports[0].reason} names ${name}`);
  // Once the other file is gone, the next rescan reports nothing.
  rmSync(join(b.authoringDir, "triage.json"));
  drafts.refresh();
  assert.deepEqual(drafts.diagnostics(), []);
  rmSync(dir, { recursive: true, force: true });
});

test("storage-12: the kept authoring session stays kept while its file stands, a deletion hands its id on, and create never replaces a record", () => {
  const dir = tempRoot(); mkdirSync(dir, { recursive: true });
  const at = (name: string) => ({
    key: `tester/${name}-spex`,
    authoringDir: join(dir, "workspace", "tester", `${name}-spex`, "authoring"),
    workingFolder: join(dir, name),
  });
  const alpha = at("alpha");
  const beta = at("beta");
  const gamma = at("gamma");
  const status = (message: string) => ({ type: "captain_status", turnId: null, timestamp: 1, message }) as unknown as TmuxPlayRecord;
  /** A session of `id` another device made in `location`, written
   * behind the store's back as a sync would. */
  const arrive = (location: typeof alpha, id: string, message: string): { record: string; records: string } => {
    mkdirSync(location.authoringDir, { recursive: true });
    const record = join(location.authoringDir, `${id}.json`);
    const records = join(location.authoringDir, `${id}.records.jsonl`);
    writeFileSync(record, JSON.stringify({ format: 1, id, createdAt: 1, touchedAt: 1, package: `spex-packages/${id}`, queued: [], failures: 0 }));
    writeFileSync(records, `${JSON.stringify({ seq: 1, record: status(message) })}\n`);
    return { record, records };
  };
  let repositories = [beta, gamma];
  const drafts = new DraftStore(() => repositories);
  // Each id a rescan gives another session, or none, is told.
  const changed: string[] = [];
  drafts.onKeptChanged = (id) => changed.push(id);
  drafts.create("triage", 1000, beta, "local");
  drafts.append("triage", 1, status("beta"));
  drafts.append("triage", 2, status("beta again"));
  const inGamma = arrive(gamma, "triage", "gamma");
  drafts.refresh();
  assert.equal(drafts.projectOf("triage"), beta.key);

  // A record standing where a session is created is never replaced,
  // nor its transcript removed: the store refuses.
  const sift = arrive(gamma, "sift", "sift");
  assert.throws(() => drafts.create("sift", 2000, gamma, "local"), StorageFormatError);
  assert.equal(readFileSync(sift.records, "utf8"), `${JSON.stringify({ seq: 1, record: status("sift") })}\n`);
  assert.equal(JSON.parse(readFileSync(sift.record, "utf8")).createdAt, 1);

  // A spex repository whose key sorts first joins holding the id: the
  // one kept stays kept while its file stands, both others reported.
  const inAlpha = arrive(alpha, "triage", "alpha");
  repositories = [alpha, beta, gamma];
  drafts.refresh();
  assert.equal(drafts.projectOf("triage"), beta.key);
  assert.equal(drafts.recordsFile("triage"), join(beta.authoringDir, "triage.records.jsonl"));
  assert.deepEqual(drafts.diagnostics().map((report) => report.file).sort(), [inAlpha.record, inGamma.record]);
  for (const report of drafts.diagnostics()) assert.ok(report.reason.includes(`the one in ${beta.key} opens`), report.reason);
  assert.deepEqual(changed, []);

  // The kept one's clone moves (space-60): it stays the one kept, now
  // sorting last.
  const zeta = { ...at("zeta"), workingFolder: beta.workingFolder };
  renameSync(dirname(beta.authoringDir), dirname(zeta.authoringDir));
  repositories = [alpha, gamma, zeta];
  drafts.moved([{ from: beta.key, to: zeta.key }]);
  assert.equal(drafts.projectOf("triage"), zeta.key);
  assert.deepEqual(drafts.records("triage").records.map((entry) => entry.seq), [1, 2]);
  assert.deepEqual(changed, []);

  // Deleting the kept session hands the id to the one shadowed whose
  // key sorts first: kept, listed, and its diagnostic gone.
  drafts.delete("triage");
  assert.ok(!existsSync(join(zeta.authoringDir, "triage.json")));
  assert.equal(drafts.projectOf("triage"), alpha.key);
  assert.deepEqual(changed, ["triage"]);
  assert.ok(drafts.ids().includes("triage"));
  assert.deepEqual(drafts.records("triage").records.map((entry) => entry.seq), [1]);
  assert.deepEqual(drafts.diagnostics().map((report) => report.file), [inGamma.record]);
  // Creating it there again is refused, the transcript intact.
  assert.throws(() => drafts.create("triage", 3000, alpha, "local"), StorageFormatError);
  assert.equal(readFileSync(inAlpha.records, "utf8"), `${JSON.stringify({ seq: 1, record: status("alpha") })}\n`);

  // Once the kept file goes, the next rescan keeps the other.
  rmSync(inAlpha.record);
  drafts.refresh();
  assert.equal(drafts.projectOf("triage"), gamma.key);
  assert.deepEqual(drafts.diagnostics(), []);
  assert.deepEqual(changed, ["triage", "triage"]);
  rmSync(dir, { recursive: true, force: true });
});
