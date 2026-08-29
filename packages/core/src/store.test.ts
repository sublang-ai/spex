// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";

import { StateRootHeldError, Store } from "./store.js";
import type { SessionInfo, TmuxPlayRecord } from "./protocol.js";

function tempRoot(): string {
  return join(mkdtempSync(join(tmpdir(), "spex-store-")), "state");
}

function sampleSession(store: Store): SessionInfo {
  const project = store.registerProject("/tmp/proj", "proj", 1000);
  const session: SessionInfo = {
    id: "s1",
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

test("projects register idempotently by path and can be removed", () => {
  const store = new Store({ dir: tempRoot() });
  const a = store.registerProject("/tmp/x", "x", 1);
  const b = store.registerProject("/tmp/x", "x", 2);
  assert.equal(a.id, b.id);
  assert.equal(store.listProjects().length, 1);
  assert.ok(store.removeProject(a.id));
  assert.equal(store.listProjects().length, 0);
  store.close();
});

test("records persist with order and hidden flags surviving reopen", () => {
  const dir = tempRoot();
  const store = new Store({ dir });
  sampleSession(store);
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
  store.appendRecord("s1", 1, visible);
  store.appendRecord("s1", 2, hidden);
  store.close();

  const reopened = new Store({ dir });
  const filtered = reopened.getRecords("s1");
  assert.deepEqual(
    filtered.map((r) => r.seq),
    [1],
  );
  const all = reopened.getRecords("s1", { includeHidden: true });
  assert.deepEqual(
    all.map((r) => r.seq),
    [1, 2],
  );
  assert.equal(all[1].record.type, "captain_prompt");
  assert.equal(reopened.maxSeq("s1"), 2);
  reopened.close();
});

test("sessions live at shutdown are recovered as not live", () => {
  const dir = tempRoot();
  const store = new Store({ dir });
  sampleSession(store);
  store.close();

  const reopened = new Store({ dir });
  reopened.markAllSessionsNotLive();
  const sessions = reopened.listSessions();
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].live, false);
  assert.equal(sessions[0].projectPath, "/tmp/proj");
  reopened.close();
});

test("usage totals aggregate per session", () => {
  const store = new Store({ dir: tempRoot() });
  sampleSession(store);
  store.addUsage({
    sessionId: "s1",
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
    sessionId: "s1",
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
  assert.deepEqual(store.sessionUsage("s1"), {
    inputTokens: 110,
    outputTokens: 45,
    toolUses: 3,
    totalCostUsd: 0.75,
    costSources: ["agent-estimate", "provider-reported"],
  });
  store.close();
});

test("prefs round-trip JSON values", () => {
  const store = new Store({ dir: tempRoot() });
  store.setPref("ui", { theme: "dark" });
  assert.deepEqual(store.getPref("ui"), { theme: "dark" });
  store.setPref("ui", { theme: "light" });
  assert.deepEqual(store.getPref("ui"), { theme: "light" });
  store.close();
});

test("core-service-32: session.list carries each session's conversation summary", () => {
  // The rail's rows are only scannable if the listing carries scent:
  // the session's own first words, its size, and whether it ended badly.
  const store = new Store({ dir: tempRoot() });
  const project = store.registerProject("/tmp/proj", "proj", 1000);
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
  const first = new Store({ dir });
  assert.throws(
    () => new Store({ dir }),
    (error: unknown) => {
      assert.ok(error instanceof StateRootHeldError);
      assert.equal(error.holder.pid, process.pid);
      return true;
    },
  );
  first.close();
  const second = new Store({ dir });
  second.close();
});

test("core-service-64: a legacy SQLite store imports once, rows served from files", () => {
  // A pre-DR-036 release left a spex.db behind. Its rows must serve
  // identically from the file state, with turns, titles, and usage
  // folded from the imported record stream — and the legacy file must
  // stay in place, imported exactly once.
  const dir = mkdtempSync(join(tmpdir(), "spex-import-"));
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
    INSERT INTO projects VALUES ('p1', '/tmp/proj', 'proj', 1);
    INSERT INTO sessions VALUES ('s1', 'p1', 1, NULL, 1, '[]', '[]');
    INSERT INTO prefs VALUES ('viewed:s1', '1');
    INSERT INTO intents VALUES ('i1', 'p1', 'Ship it', NULL, NULL, NULL,
      'i', NULL, 5, 's1', 1, 10, NULL, NULL);
  `);
  const insert = legacy.prepare(
    "INSERT INTO records (session_id, seq, turn_id, type, hidden, timestamp, payload_json, role) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  insert.run(
    "s1",
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
  insert.run("s1", 2, 1, "player_event", 0, 30, JSON.stringify(doneEvent), "coder");
  // The pre-0.22 flat usage shape lives in real stored streams; the
  // fold must read it too.
  insert.run(
    "s1",
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
    "s1",
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

  const store = new Store({ dir: root, legacyDbPath });
  // A session live when the legacy store last closed is not live now.
  const session = store.listSessions().find((entry) => entry.id === "s1");
  assert.equal(session?.live, false);
  assert.equal(session?.title, "ship the import");
  assert.equal(session?.turns, 1);
  // Usage folds from the imported stream (core-service-10), across
  // both payload generations.
  assert.deepEqual(store.sessionUsage("s1"), {
    inputTokens: 100,
    outputTokens: 15,
    toolUses: 3,
    totalCostUsd: 0.25,
    costSources: ["provider-reported"],
  });
  assert.equal(store.getRecords("s1")[1]?.role, "coder");
  assert.equal(store.getPref("viewed:s1"), 1);
  assert.equal(store.getIntent("i1")?.dispatched?.turnId, 1);
  store.close();

  // The legacy file is untouched, and a second startup imports nothing
  // twice: rows written since are not clobbered by a re-import.
  assert.deepEqual(readFileSync(legacyDbPath), legacyBytes);
  const reopened = new Store({ dir: root, legacyDbPath });
  reopened.setPref("viewed:s1", 4);
  reopened.close();
  const third = new Store({ dir: root, legacyDbPath });
  assert.equal(third.getPref("viewed:s1"), 4);
  assert.ok(existsSync(legacyDbPath));
  third.close();
});
