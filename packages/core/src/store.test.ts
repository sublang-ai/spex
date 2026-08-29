// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

test("a second shell's legacy import merges into the root, clobbering nothing", () => {
  // Both shells share one root: the server's first launch imports its
  // own legacy store and must not erase what the desktop imported or
  // what was registered since (DR-036).
  const dir = mkdtempSync(join(tmpdir(), "spex-merge-"));
  const root = join(dir, "state");
  const seed = (path: string, projectId: string, projectPath: string): void => {
    const db = new Database(path);
    db.exec(`
      CREATE TABLE projects (
        id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
        registered_at INTEGER NOT NULL
      );
      CREATE TABLE prefs (key TEXT PRIMARY KEY, value_json TEXT NOT NULL);
      INSERT INTO projects VALUES ('${projectId}', '${projectPath}', 'p', 1);
      INSERT INTO prefs VALUES ('shared', '"${projectId}"');
    `);
    db.close();
  };
  seed(join(dir, "desktop.db"), "p-desktop", "/tmp/desktop-proj");
  seed(join(dir, "server.db"), "p-server", "/tmp/server-proj");

  const first = new Store({ dir: root, legacyDbPath: join(dir, "desktop.db") });
  first.registerProject("/tmp/new-work", "new-work", 2);
  first.setPref("shared", "live");
  first.close();

  const second = new Store({ dir: root, legacyDbPath: join(dir, "server.db") });
  assert.deepEqual(
    second.listProjects().map((project) => project.path).sort(),
    ["/tmp/desktop-proj", "/tmp/new-work", "/tmp/server-proj"],
  );
  // Existing preferences win over imported ones: they are newer.
  assert.equal(second.getPref("shared"), "live");
  second.close();
});

test("a torn intent-log tail heals on load, so a later append cannot brick startup", () => {
  const dir = tempRoot();
  const store = new Store({ dir });
  const project = store.registerProject("/tmp/heal", "heal", 1);
  store.addIntent({
    id: "i1",
    projectId: project.id,
    text: "First",
    rank: "i",
    createdAt: 1,
  });
  store.close();

  // A crash mid-append leaves a torn tail with no trailing newline.
  const log = join(dir, "intents", `${project.id}.jsonl`);
  writeFileSync(log, readFileSync(log, "utf8") + '{"v":1,"act":"edit","id":"i1","te');

  const healed = new Store({ dir });
  healed.addIntent({
    id: "i2",
    projectId: project.id,
    text: "Second",
    rank: "r",
    createdAt: 2,
  });
  healed.close();

  const reopened = new Store({ dir });
  assert.deepEqual(
    reopened.listOpenIntents().map((intent) => intent.id),
    ["i1", "i2"],
  );
  reopened.close();
});

test("an unreadable legacy store skips its import and never blocks startup", () => {
  const dir = mkdtempSync(join(tmpdir(), "spex-badlegacy-"));
  const legacyDbPath = join(dir, "spex.db");
  // What better-sqlite3 leaves when the old app died before its first
  // migration: a zero-byte file.
  writeFileSync(legacyDbPath, "");
  const store = new Store({ dir: join(dir, "state"), legacyDbPath });
  store.registerProject("/tmp/after", "after", 1);
  store.close();
  const reopened = new Store({ dir: join(dir, "state"), legacyDbPath });
  assert.equal(reopened.listProjects().length, 1);
  reopened.close();
});

test("an unreadable root lock fails closed rather than letting a second core in", () => {
  const dir = tempRoot();
  mkdirSync(join(dir, ".lock"), { recursive: true });
  writeFileSync(join(dir, ".lock", "owner.json"), "not json");
  assert.throws(() => new Store({ dir }), /unreadable lock/);
  rmSync(join(dir, ".lock"), { recursive: true, force: true });
  const store = new Store({ dir });
  store.close();
});

test("the stream is a token-free projection: resume tokens never reach memory or disk", () => {
  const dir = tempRoot();
  const store = new Store({ dir });
  sampleSession(store);
  store.appendRecord("s1", 1, {
    type: "player_finished",
    turnId: 1,
    timestamp: 10,
    playerId: "dev.coder",
    result: { status: "ok", finalText: "done", resumeToken: "sess-abc" },
  } as unknown as TmuxPlayRecord);
  store.appendRecord("s1", 2, {
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
  store.appendRecord("s1", 3, {
    type: "captain_telemetry",
    turnId: 1,
    timestamp: 12,
    topic: "playbook.trace",
    payload: { type: "player.call.started", resume: false },
  } as unknown as TmuxPlayRecord);
  store.close();

  const reopened = new Store({ dir });
  const text = readFileSync(join(dir, "sessions", "s1.records.jsonl"), "utf8");
  assert.ok(!text.includes("sess-abc") && !text.includes("sess-def"));
  const serialized = JSON.stringify(reopened.getRecords("s1"));
  assert.ok(!serialized.includes("resumeToken") && !serialized.includes("sess-abc"));
  // `resume: false` is semantics, not a token, and survives the strip.
  const trace = reopened.getRecords("s1")[2].record as unknown as {
    payload: { resume?: unknown };
  };
  assert.equal(trace.payload.resume, false);
  reopened.close();
});

test("a lease-free records read serves the newline-terminated prefix and mutates nothing", () => {
  const dir = tempRoot();
  const store = new Store({ dir });
  sampleSession(store);
  store.appendRecord("s1", 1, {
    type: "captain_status",
    turnId: 1,
    timestamp: 10,
    message: "ok",
  } as TmuxPlayRecord);
  store.close();

  // A torn tail, as a crashed writer leaves it.
  const file = join(dir, "sessions", "s1.records.jsonl");
  const damaged = readFileSync(file, "utf8") + '{"v":1,"seq":2,"rec';
  writeFileSync(file, damaged);

  const reopened = new Store({ dir });
  assert.deepEqual(
    reopened.getRecords("s1").map((r) => r.seq),
    [1],
  );
  assert.equal(readFileSync(file, "utf8"), damaged, "the reader rewrites nothing");
  reopened.close();
});

test("a failed stream append latches incomplete instead of killing the turn", () => {
  const dir = tempRoot();
  const store = new Store({ dir });
  sampleSession(store);
  store.appendRecord("s1", 1, {
    type: "captain_status",
    turnId: 1,
    timestamp: 10,
    message: "durable",
  } as TmuxPlayRecord);
  // Make the records file unappendable: a directory in its place.
  const file = join(dir, "sessions", "s1.records.jsonl");
  rmSync(file);
  mkdirSync(file);
  store.appendRecord("s1", 2, {
    type: "captain_status",
    turnId: 1,
    timestamp: 11,
    message: "memory-only",
  } as TmuxPlayRecord);
  // Live serving stays complete; the listing says the stream is not.
  assert.deepEqual(
    store.getRecords("s1").map((r) => r.seq),
    [1, 2],
  );
  assert.equal(store.describeSession("s1")?.streamIncompleteAfterSeq, 1);
  store.close();

  rmSync(file, { recursive: true, force: true });
  const reopened = new Store({ dir });
  assert.equal(
    reopened.describeSession("s1")?.streamIncompleteAfterSeq,
    1,
    "the latch survives a restart on the sidecar",
  );
  reopened.close();
});
