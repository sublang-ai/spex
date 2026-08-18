// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Store } from "./store.js";
import type { SessionInfo, TmuxPlayRecord } from "./protocol.js";

function tempStorePath(): string {
  return join(mkdtempSync(join(tmpdir(), "spex-store-")), "spex.db");
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
  const store = new Store(tempStorePath());
  const a = store.registerProject("/tmp/x", "x", 1);
  const b = store.registerProject("/tmp/x", "x", 2);
  assert.equal(a.id, b.id);
  assert.equal(store.listProjects().length, 1);
  assert.ok(store.removeProject(a.id));
  assert.equal(store.listProjects().length, 0);
  store.close();
});

test("records persist with order and hidden flags surviving reopen", () => {
  const path = tempStorePath();
  const store = new Store(path);
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

  const reopened = new Store(path);
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
  const path = tempStorePath();
  const store = new Store(path);
  sampleSession(store);
  store.close();

  const reopened = new Store(path);
  reopened.markAllSessionsNotLive();
  const sessions = reopened.listSessions();
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].live, false);
  assert.equal(sessions[0].projectPath, "/tmp/proj");
  reopened.close();
});

test("usage totals aggregate per session", () => {
  const store = new Store(tempStorePath());
  sampleSession(store);
  store.addUsage({
    sessionId: "s1",
    turnId: 1,
    actorId: "dev.coder",
    inputTokens: 100,
    outputTokens: 40,
    toolUses: 3,
    totalCostUsd: 0.5,
    at: 1,
  });
  store.addUsage({
    sessionId: "s1",
    turnId: 1,
    actorId: "captain",
    inputTokens: 10,
    outputTokens: 5,
    toolUses: 0,
    at: 2,
  });
  assert.deepEqual(store.sessionUsage("s1"), {
    inputTokens: 110,
    outputTokens: 45,
    toolUses: 3,
    totalCostUsd: 0.5,
  });
  store.close();
});

test("prefs round-trip JSON values", () => {
  const store = new Store(tempStorePath());
  store.setPref("ui", { theme: "dark" });
  assert.deepEqual(store.getPref("ui"), { theme: "dark" });
  store.setPref("ui", { theme: "light" });
  assert.deepEqual(store.getPref("ui"), { theme: "light" });
  store.close();
});

test("core-service-32: session.list carries each session's conversation summary", () => {
  // The rail's rows are only scannable if the listing carries scent:
  // the session's own first words, its size, and whether it ended badly.
  const store = new Store(tempStorePath());
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
});
