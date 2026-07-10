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
    players: [{ id: "code-coder", adapter: "claude" }],
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
    actorId: "code-coder",
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
