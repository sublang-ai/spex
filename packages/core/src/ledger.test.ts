// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Integration coverage for the intent ledger (DR-035, core-service-42
// ..59): the stored intents table, the one derivation fold, and the
// protocol commands, driven end to end where a session is needed and
// against the store directly where the fold's contract is over stored
// state alone — restart-identical, arrival-order-independent.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";

import { Store } from "./store.js";
import { foldLedger, type LiveLane } from "./ledger.js";
import { CoreService } from "./service.js";
import { parseSpecTree } from "./specs.js";
import { fakeAdapterImports } from "./testing/fake-adapter.js";
import { createScriptedCaptain } from "./testing/scripted-captain.js";
import { demoHistoryIntentId, seedHistorySession } from "./testing/demo.js";
import type {
  Command,
  CommandResults,
  DerivedIntent,
  IntentInfo,
  LedgerState,
  ServerMessage,
  TmuxPlayRecord,
} from "./protocol.js";

// ---------------------------------------------------------------------------
// Store-level harness: the fold's contract is over stored rows, so a
// synthetic session written straight into the store is a legitimate
// subject — it is exactly what a restart rebuilds from.
// ---------------------------------------------------------------------------

const NOW = 10_000_000;

function newProjectStore(path?: string): { store: Store; projectId: string } {
  const store = new Store(path ? { dir: path } : {});
  const project = store.registerProject("/tmp/ledger-proj", "ledger-proj", 1);
  return { store, projectId: project.id };
}

function addSession(store: Store, projectId: string, id: string): void {
  store.createSession({
    id,
    projectId,
    projectPath: "/tmp/ledger-proj",
    createdAt: 100,
    live: true,
    endedAt: null,
    players: [{ id: "dev.coder", adapter: "claude" }],
    initialVisible: ["dev.coder"],
    turns: 0,
    failed: false,
  });
}

function queueIntent(
  store: Store,
  projectId: string,
  id: string,
  rank: string,
  extra: Partial<IntentInfo> = {},
): IntentInfo {
  const intent: IntentInfo = {
    id,
    projectId,
    text: `Intent ${id}\nthe staged Boss turn`,
    rank,
    createdAt: 10,
    ...extra,
  };
  store.addIntent(intent);
  return intent;
}

function append(
  store: Store,
  sessionId: string,
  record: Record<string, unknown>,
  role?: string,
): void {
  store.appendRecord(
    sessionId,
    store.maxSeq(sessionId) + 1,
    record as unknown as TmuxPlayRecord,
    role,
  );
}

function beginTurn(
  store: Store,
  sessionId: string,
  turnId: number,
  prompt: string,
  at: number,
): void {
  store.startTurn(sessionId, turnId, prompt, at);
  append(store, sessionId, {
    type: "turn_started",
    turnId,
    turn: { id: turnId, prompt },
    timestamp: at,
  });
}

function finishTurn(store: Store, sessionId: string, turnId: number, at: number): void {
  store.endTurn(sessionId, turnId, "finished", at);
  append(store, sessionId, { type: "turn_finished", turnId, timestamp: at });
}

function abortStoredTurn(
  store: Store,
  sessionId: string,
  turnId: number,
  at: number,
): void {
  store.endTurn(sessionId, turnId, "aborted", at);
  append(store, sessionId, { type: "turn_aborted", turnId, timestamp: at });
}

function lane(sessionId: string, projectId: string, turnActive: boolean): LiveLane {
  return { sessionId, projectId, turnActive };
}

function fold(store: Store, lanes: LiveLane[]): LedgerState {
  return foldLedger({ store, lanes, now: () => NOW });
}

function stateOf(ledger: LedgerState, intentId: string): DerivedIntent {
  const found = ledger.intents.find((entry) => entry.intent.id === intentId);
  assert.ok(found, `intent ${intentId} missing from the fold`);
  return found;
}

// ---------------------------------------------------------------------------
// Derived states over a synthetic session (core-service-47/49)
// ---------------------------------------------------------------------------

test("DR-035: dispatch derives working, a finish delivers, a follow-up reopens work", () => {
  const { store, projectId } = newProjectStore();
  addSession(store, projectId, "s1");
  queueIntent(store, projectId, "A", "i");

  // The dispatch stamp binds when the submitted turn starts.
  beginTurn(store, "s1", 1, "ship the ledger", 1000);
  store.stampIntentDispatch("A", "s1", 1, 1000);
  const busy = [lane("s1", projectId, true)];
  const idle = [lane("s1", projectId, false)];

  let a = stateOf(fold(store, busy), "A");
  assert.equal(a.state, "working");
  assert.equal(a.stats?.turns, 1);

  // The turn finishes: finished, and one band-two attention entry
  // whose since is the turn's end. reviewRounds is omitted at zero.
  finishTurn(store, "s1", 1, 3000);
  const delivered = fold(store, idle);
  a = stateOf(delivered, "A");
  assert.equal(a.state, "finished");
  assert.deepEqual(a.stats, { turns: 1, elapsedMs: 2000 });
  assert.deepEqual(delivered.attention, [
    {
      band: "finished",
      kind: "finish",
      intentId: "A",
      title: "Intent A",
      projectId,
      sessionId: "s1",
      turnId: 1,
      since: 3000,
      stats: { turns: 1, elapsedMs: 2000 },
    },
  ]);
  assert.equal(delivered.badge, 1);

  // A follow-up turn belongs to the newest dispatched open intent:
  // working again, and the finish entry stands down while it runs.
  beginTurn(store, "s1", 2, "polish it", 4000);
  a = stateOf(fold(store, busy), "A");
  assert.equal(a.state, "working");
  assert.equal(a.stats?.turns, 2);

  finishTurn(store, "s1", 2, 6000);
  const redelivered = fold(store, idle);
  a = stateOf(redelivered, "A");
  assert.equal(a.state, "finished");
  assert.deepEqual(a.stats, { turns: 2, elapsedMs: 5000 });
  assert.equal(redelivered.attention[0]?.since, 6000);
  store.close();
});

test("DR-035: an aborted dispatch turn or a dead session releases the intent, stamps and rank kept", () => {
  const { store, projectId } = newProjectStore();
  addSession(store, projectId, "s1");
  addSession(store, projectId, "s2");

  // Dispatch turn ends aborted: released by derivation.
  queueIntent(store, projectId, "A", "i");
  beginTurn(store, "s1", 1, "go", 1000);
  store.stampIntentDispatch("A", "s1", 1, 1000);
  abortStoredTurn(store, "s1", 1, 2000);

  // Session died before the dispatch turn finished: released too.
  queueIntent(store, projectId, "B", "r");
  beginTurn(store, "s2", 1, "go", 3000);
  store.stampIntentDispatch("B", "s2", 1, 3000);

  const ledger = fold(store, [lane("s1", projectId, false)]);
  const a = stateOf(ledger, "A");
  assert.equal(a.state, "queued");
  assert.equal(a.intent.rank, "i", "the queue position keeps its rank");
  assert.ok(a.intent.dispatched, "the stamps remain as history");
  const b = stateOf(ledger, "B");
  assert.equal(b.state, "queued");
  assert.equal(b.intent.rank, "r");
  assert.ok(b.intent.dispatched);
  assert.equal(ledger.badge, 0, "a released dispatch summons nobody");
  store.close();
});

// ---------------------------------------------------------------------------
// Interruptions (core-service-49 band one)
// ---------------------------------------------------------------------------

test("DR-035: a parked awaitBossReply derives interrupted question in band one", () => {
  const { store, projectId } = newProjectStore();
  addSession(store, projectId, "s1");
  queueIntent(store, projectId, "Q", "i");
  beginTurn(store, "s1", 1, "ask around", 1000);
  store.stampIntentDispatch("Q", "s1", 1, 1000);
  append(store, "s1", {
    type: "captain_telemetry",
    topic: "playbook.fsm.state",
    payload: { to: "awaitBossReply" },
    turnId: 1,
    timestamp: 1500,
  });
  finishTurn(store, "s1", 1, 2000);

  const ledger = fold(store, [lane("s1", projectId, false)]);
  const q = stateOf(ledger, "Q");
  assert.equal(q.state, "interrupted");
  assert.equal(q.reason, "question");
  assert.deepEqual(
    ledger.attention.map((entry) => [entry.band, entry.kind, entry.intentId, entry.since]),
    [["interrupted", "question", "Q", 1500]],
  );
  store.close();
});

test("DR-066: a permission request raises no entry — nothing answers one", () => {
  const { store, projectId } = newProjectStore();
  addSession(store, projectId, "s1");
  queueIntent(store, projectId, "P", "i");
  beginTurn(store, "s1", 1, "build it", 1000);
  store.stampIntentDispatch("P", "s1", 1, 1000);
  append(store, "s1", {
    type: "player_event",
    playerId: "dev.coder",
    event: { type: "permission_request" },
    turnId: 1,
    timestamp: 1200,
  });

  // No command answers a permission request, so summoning the Boss to
  // one would name an act they cannot take (dashboard-54, DR-066). The
  // session reads as what it is: a run still working.
  const busy = [lane("s1", projectId, true)];
  const working = fold(store, busy);
  assert.equal(stateOf(working, "P").state, "working");
  assert.deepEqual(working.attention, []);
  assert.equal(working.badge, 0);

  // An un-ledgered session raises none either.
  addSession(store, projectId, "s2");
  beginTurn(store, "s2", 1, "and this", 2000);
  append(store, "s2", {
    type: "player_event",
    playerId: "dev.coder",
    event: { type: "permission_request" },
    turnId: 1,
    timestamp: 2200,
  });
  const standIn = fold(store, [...busy, lane("s2", projectId, true)]);
  assert.deepEqual(standIn.attention, []);
  store.close();
});

test("DR-066: a session's own failure honours the parked rule its intent-owned twin does", () => {
  const { store, projectId } = newProjectStore();
  addSession(store, projectId, "s1");
  beginTurn(store, "s1", 1, "run it", 1000);
  append(store, "s1", {
    type: "runtime_error",
    turnId: 1,
    timestamp: 1100,
    message: "the workflow failed",
  });
  append(store, "s1", {
    type: "captain_telemetry",
    topic: "playbook.fsm.state",
    payload: { to: "failed" },
    turnId: 1,
    timestamp: 1150,
  });
  finishTurn(store, "s1", 1, 1200);

  const live = [lane("s1", projectId, false)];
  const parked = fold(store, live);
  assert.deepEqual(
    parked.attention.map((entry) => [entry.kind, entry.parked]),
    [["failure", true]],
  );

  // A later turn does not answer a parked failure (dashboard-4): only
  // the run leaving that state does. The stand-in branch used to clear
  // here, which the intent-owned branch never did.
  beginTurn(store, "s1", 2, "something else", 2000);
  finishTurn(store, "s1", 2, 2100);
  assert.deepEqual(
    fold(store, live).attention.map((entry) => entry.kind),
    ["failure"],
  );

  append(store, "s1", {
    type: "captain_telemetry",
    topic: "playbook.fsm.state",
    payload: { from: "failed", to: "idle" },
    turnId: 2,
    timestamp: 2200,
  });
  const cleared = fold(store, live);
  assert.ok(
    !cleared.attention.some((entry) => entry.kind === "failure"),
    "the run leaving its failure state answers it",
  );
  store.close();
});

test("DR-066: a project whose store refuses its acts raises no summons", () => {
  const dir = mkdtempSync(join(tmpdir(), "ledger-blocked-"));
  const { store, projectId } = newProjectStore(dir);
  addSession(store, projectId, "s1");
  beginTurn(store, "s1", 1, "chat about tests", 1000);
  finishTurn(store, "s1", 1, 1100);
  const live = [lane("s1", projectId, false)];
  assert.deepEqual(
    fold(store, live).attention.map((entry) => entry.kind),
    ["review"],
    "a healthy project summons",
  );
  store.close();

  // Damaged preferences fold every marker to -1 while refusing every
  // write, so the summons would stand with no act able to clear it.
  writeFileSync(join(dir, "prefs.json"), "{bad JSON}");
  const reopened = new Store({ dir });
  const blocked = foldLedger({
    store: reopened,
    lanes: live,
    now: () => NOW,
  });
  assert.deepEqual(blocked.attention, []);
  assert.equal(blocked.badge, 0);
  assert.ok(
    reopened.storageDiagnostics().some((report) => report.blocking),
    "the condition stands as a storage diagnostic, where the repair is",
  );
  reopened.close();
});

test("DR-035: a runtime_error derives interrupted failure, cleared by a later turn start", () => {
  const { store, projectId } = newProjectStore();
  addSession(store, projectId, "s1");
  queueIntent(store, projectId, "F", "i");
  beginTurn(store, "s1", 1, "try it", 1000);
  store.stampIntentDispatch("F", "s1", 1, 1000);
  append(store, "s1", {
    type: "runtime_error",
    turnId: 1,
    timestamp: 1500,
    message: "The Captain's turn failed: boom",
  });
  finishTurn(store, "s1", 1, 2000);

  const failed = fold(store, [lane("s1", projectId, false)]);
  const f = stateOf(failed, "F");
  assert.equal(f.state, "interrupted");
  assert.equal(f.reason, "failure");
  assert.deepEqual(
    failed.attention.map((entry) => [entry.band, entry.kind, entry.intentId, entry.since]),
    [["interrupted", "failure", "F", 1500]],
  );

  // The Boss's next turn in the session acknowledges the failure.
  beginTurn(store, "s1", 2, "retry", 3000);
  const acknowledged = fold(store, [lane("s1", projectId, true)]);
  assert.equal(stateOf(acknowledged, "F").state, "working");
  assert.equal(acknowledged.badge, 0);
  store.close();
});

test("DR-062: a parked failure stands through a later turn, and the run's end clears it", () => {
  const { store, projectId } = newProjectStore();
  addSession(store, projectId, "s1");
  queueIntent(store, projectId, "P", "i");
  beginTurn(store, "s1", 1, "run it", 1000);
  store.stampIntentDispatch("P", "s1", 1, 1000);
  // The run parks in its failure state. A real stream reports it twice —
  // the per-run trace that names which machine moved, and the shell's own
  // state topic — so the fixture carries both.
  append(store, "s1", {
    type: "captain_telemetry",
    topic: "playbook.trace",
    payload: {
      sessionId: "run-1",
      type: "fsm.transition",
      payload: { from: "coding", to: "failed" },
    },
    turnId: 1,
    timestamp: 1390,
  });
  append(store, "s1", {
    type: "captain_telemetry",
    topic: "playbook.fsm.state",
    payload: { to: "failed" },
    turnId: 1,
    timestamp: 1400,
  });
  append(store, "s1", {
    type: "runtime_error",
    turnId: 1,
    timestamp: 1500,
    message: "The Captain's turn failed: boom",
  });
  finishTurn(store, "s1", 1, 2000);

  const parked = fold(store, [lane("s1", projectId, true)]);
  assert.equal(stateOf(parked, "P").reason, "failure");

  // DR-062: talking about something else is not resolving it. The same turn
  // would have acknowledged a failure that parked nothing.
  beginTurn(store, "s1", 2, "something unrelated", 3000);
  const afterTurn = fold(store, [lane("s1", projectId, true)]);
  assert.equal(stateOf(afterTurn, "P").state, "interrupted");
  assert.equal(stateOf(afterTurn, "P").reason, "failure");
  assert.equal(afterTurn.badge, 1);

  // Ending the run is what clears it — here the Boss's give-up, which
  // disposes the parked call inside its turn.
  append(store, "s1", {
    type: "captain_telemetry",
    topic: "playbook.trace",
    payload: { sessionId: "run-1", type: "session.disposed" },
    turnId: 2,
    timestamp: 3200,
  });
  const dropped = fold(store, [lane("s1", projectId, true)]);
  assert.equal(stateOf(dropped, "P").state, "working");
  assert.equal(dropped.badge, 0);
  store.close();
});

test("core-service-106: the parked failure's cause travels to its attention entry", () => {
  const { store, projectId } = newProjectStore();
  addSession(store, projectId, "s1");
  beginTurn(store, "s1", 1, "/code fix it", 1000);
  const cause = {
    code: "commit-residual",
    evidence: {
      required: "one-commit",
      observed: "commit-and-worktree-change",
      commitOid: "3b7de901",
      paths: { uncommitted: ["src/a.ts"], altered: ["src/b.ts"] },
    },
  };
  // The runtime attaches the cause where it decides the failure, so it
  // reaches the transition and the failed-state status line alike
  // (DR-075). Either arrival order yields the same entry, which is what
  // the deterministic fold owes (dashboard-10).
  append(store, "s1", {
    type: "captain_status",
    turnId: 1,
    timestamp: 1380,
    message: "◆ workflow failed; awaiting Boss recovery.",
    data: { lastError: { name: "Error", message: "unresolved", cause } },
  });
  append(store, "s1", {
    type: "captain_telemetry",
    topic: "playbook.trace",
    payload: {
      sessionId: "run-1",
      type: "fsm.transition",
      payload: { from: "coding", to: "failed" },
    },
    turnId: 1,
    timestamp: 1390,
  });
  append(store, "s1", {
    type: "captain_telemetry",
    topic: "playbook.fsm.state",
    payload: { to: "failed" },
    turnId: 1,
    timestamp: 1400,
  });
  append(store, "s1", {
    type: "runtime_error",
    turnId: 1,
    timestamp: 1500,
    message: "CODE governed outcome remains unresolved",
  });
  finishTurn(store, "s1", 1, 2000);

  const parked = fold(store, [lane("s1", projectId, true)]);
  const entry = parked.attention.find((row) => row.kind === "failure");
  assert.equal(entry?.parked, true);
  assert.deepEqual(entry?.cause, cause);
  store.close();
});

test("core-service-106: a cause the runtime never stated is left unstated", () => {
  const { store, projectId } = newProjectStore();
  addSession(store, projectId, "s1");
  beginTurn(store, "s1", 1, "/code fix it", 1000);
  // A shape that is not `{ code }` is dropped rather than half-read: the
  // row says a failure stands and invents no reason for it (DR-075).
  append(store, "s1", {
    type: "captain_status",
    turnId: 1,
    timestamp: 1380,
    message: "◆ workflow failed; awaiting Boss recovery.",
    data: { lastError: { message: "unresolved", cause: { reason: "?" } } },
  });
  append(store, "s1", {
    type: "captain_telemetry",
    topic: "playbook.fsm.state",
    payload: { to: "failed" },
    turnId: 1,
    timestamp: 1400,
  });
  append(store, "s1", {
    type: "runtime_error",
    turnId: 1,
    timestamp: 1500,
    message: "CODE governed outcome remains unresolved",
  });
  finishTurn(store, "s1", 1, 2000);

  const parked = fold(store, [lane("s1", projectId, true)]);
  const entry = parked.attention.find((row) => row.kind === "failure");
  assert.equal(entry?.parked, true);
  assert.equal(entry?.cause, undefined);
  store.close();
});

test("DR-035: failure outranks the question and the permission", () => {
  const { store, projectId } = newProjectStore();
  addSession(store, projectId, "s1");
  queueIntent(store, projectId, "X", "i");
  beginTurn(store, "s1", 1, "everything at once", 1000);
  store.stampIntentDispatch("X", "s1", 1, 1000);
  append(store, "s1", {
    type: "captain_telemetry",
    topic: "playbook.fsm.state",
    payload: { to: "awaitBossReply" },
    turnId: 1,
    timestamp: 1100,
  });
  append(store, "s1", {
    type: "player_event",
    playerId: "dev.coder",
    event: { type: "permission_request" },
    turnId: 1,
    timestamp: 1200,
  });
  append(store, "s1", {
    type: "runtime_error",
    turnId: 1,
    timestamp: 1300,
    message: "The Captain's turn failed: red first",
  });

  const ledger = fold(store, [lane("s1", projectId, true)]);
  const x = stateOf(ledger, "X");
  assert.equal(x.state, "interrupted");
  assert.equal(x.reason, "failure");
  assert.equal(ledger.attention[0]?.kind, "failure");
  store.close();
});

test("DR-035: interrupted precedes finished, longest waiting first within each band", () => {
  const { store, projectId } = newProjectStore();
  addSession(store, projectId, "s1");
  addSession(store, projectId, "s2");
  addSession(store, projectId, "s3");

  // Finished earliest of all — still band two.
  queueIntent(store, projectId, "A", "3");
  beginTurn(store, "s1", 1, "done early", 400);
  store.stampIntentDispatch("A", "s1", 1, 400);
  finishTurn(store, "s1", 1, 500);

  // Interrupted question since 800.
  queueIntent(store, projectId, "B", "5");
  beginTurn(store, "s2", 1, "ask", 600);
  store.stampIntentDispatch("B", "s2", 1, 600);
  append(store, "s2", {
    type: "captain_telemetry",
    topic: "playbook.fsm.state",
    payload: { to: "awaitBossReply" },
    turnId: 1,
    timestamp: 800,
  });
  finishTurn(store, "s2", 1, 900);

  // Interrupted failure since 1500 — later onset, same band.
  queueIntent(store, projectId, "C", "i");
  beginTurn(store, "s3", 1, "fail", 1000);
  store.stampIntentDispatch("C", "s3", 1, 1000);
  append(store, "s3", {
    type: "runtime_error",
    turnId: 1,
    timestamp: 1500,
    message: "The Captain's turn failed: late",
  });
  finishTurn(store, "s3", 1, 1600);

  const ledger = fold(store, [
    lane("s1", projectId, false),
    lane("s2", projectId, false),
    lane("s3", projectId, false),
  ]);
  assert.deepEqual(
    ledger.attention.map((entry) => [entry.band, entry.kind, entry.intentId, entry.since]),
    [
      ["interrupted", "question", "B", 800],
      ["interrupted", "failure", "C", 1500],
      ["finished", "finish", "A", 500],
    ],
  );
  assert.equal(ledger.badge, 3);
  store.close();
});

// ---------------------------------------------------------------------------
// Turn attribution and run stats (core-service-47/49)
// ---------------------------------------------------------------------------

test("DR-035: a later dispatch bounds the earlier intent's turn range, and each carries its own stats", () => {
  const { store, projectId } = newProjectStore();
  addSession(store, projectId, "s1");

  // A owns turns 1-2; B's dispatch at turn 3 ends A's range.
  queueIntent(store, projectId, "A", "i");
  beginTurn(store, "s1", 1, "first", 1000);
  store.stampIntentDispatch("A", "s1", 1, 1000);
  finishTurn(store, "s1", 1, 2000);
  beginTurn(store, "s1", 2, "follow-up", 3000);
  finishTurn(store, "s1", 2, 4000);
  queueIntent(store, projectId, "B", "r");
  beginTurn(store, "s1", 3, "second", 5000);
  store.stampIntentDispatch("B", "s1", 3, 5000);
  finishTurn(store, "s1", 3, 6000);

  // Reviewer-role prompts: two inside A's range, one inside B's, and a
  // coder-role prompt that must not count (DR-032 role column).
  append(store, "s1", { type: "player_prompt", playerId: "dev.coder", prompt: "r1", turnId: 1, timestamp: 1100 }, "reviewer");
  append(store, "s1", { type: "player_prompt", playerId: "dev.coder", prompt: "r2", turnId: 2, timestamp: 3100 }, "reviewer");
  append(store, "s1", { type: "player_prompt", playerId: "dev.coder", prompt: "c1", turnId: 2, timestamp: 3200 }, "coder");
  append(store, "s1", { type: "player_prompt", playerId: "dev.coder", prompt: "r3", turnId: 3, timestamp: 5100 }, "reviewer");

  const ledger = fold(store, [lane("s1", projectId, false)]);
  const a = stateOf(ledger, "A");
  assert.equal(a.state, "finished");
  assert.deepEqual(a.stats, { turns: 2, elapsedMs: 3000, reviewRounds: 2 });
  const b = stateOf(ledger, "B");
  assert.equal(b.state, "finished");
  assert.deepEqual(b.stats, { turns: 1, elapsedMs: 1000, reviewRounds: 1 });

  // Each intent's delivery is its own attention entry at its own turn.
  assert.deepEqual(
    ledger.attention.map((entry) => [entry.intentId, entry.turnId, entry.since]),
    [
      ["A", 2, 4000],
      ["B", 3, 6000],
    ],
  );
  store.close();
});

test("DR-035: an aborted follow-up does not unseat a standing finish", () => {
  const { store, projectId } = newProjectStore();
  addSession(store, projectId, "s1");
  queueIntent(store, projectId, "C", "i");
  beginTurn(store, "s1", 1, "deliver", 1000);
  store.stampIntentDispatch("C", "s1", 1, 1000);
  finishTurn(store, "s1", 1, 2000);
  beginTurn(store, "s1", 2, "never mind", 3000);
  abortStoredTurn(store, "s1", 2, 3500);

  const ledger = fold(store, [lane("s1", projectId, false)]);
  const c = stateOf(ledger, "C");
  assert.equal(c.state, "finished");
  assert.deepEqual(c.stats, { turns: 2, elapsedMs: 1000 });
  assert.equal(ledger.attention[0]?.turnId, 1, "the finish points at the finished turn");
  assert.equal(ledger.attention[0]?.since, 2000);
  store.close();
});

// ---------------------------------------------------------------------------
// Session stand-ins and the viewed marker (core-service-48/49/59)
// ---------------------------------------------------------------------------


test("DR-035: a ruled turn never re-summons — plain chat after the verdict does", () => {
  const { store, projectId } = newProjectStore();
  addSession(store, projectId, "s1");
  queueIntent(store, projectId, "A", "i");
  beginTurn(store, "s1", 1, "Intent A", 1000);
  store.stampIntentDispatch("A", "s1", 1, 1000);
  finishTurn(store, "s1", 1, 2000);
  const lanes = [lane("s1", projectId, false)];

  // Finished intent: its own attention entry, no review stand-in.
  const finished = fold(store, lanes);
  assert.deepEqual(
    finished.attention.map((entry) => entry.kind),
    ["finish"],
  );

  // The verdict settles the turn: no stand-in resurrects it.
  store.closeIntent("A", "done", 2500);
  const ruled = fold(store, lanes);
  assert.deepEqual(ruled.attention, []);
  assert.equal(ruled.badge, 0);

  // Plain chat after the verdict is un-ledgered again and summons.
  beginTurn(store, "s1", 2, "just chatting", 3000);
  finishTurn(store, "s1", 2, 4000);
  const chat = fold(store, lanes);
  assert.deepEqual(
    chat.attention.map((entry) => [entry.kind, entry.turnId]),
    [["review", 2]],
  );
});

test("DR-035: an un-ledgered finished turn stands in for review until the viewed marker passes it, and hidden records feed nothing", () => {
  const { store, projectId } = newProjectStore();
  addSession(store, projectId, "s1");
  beginTurn(store, "s1", 1, "review me", 1000);
  finishTurn(store, "s1", 1, 2000);

  // A live session holding a hidden permission request: hidden records
  // never reach the fold's conditions (core-service-8).
  addSession(store, projectId, "s2");
  beginTurn(store, "s2", 1, "secret work", 1000);
  append(store, "s2", {
    type: "player_event",
    playerId: "dev.coder",
    event: { type: "permission_request" },
    visibility: "hidden",
    turnId: 1,
    timestamp: 1500,
  });

  const lanes = [lane("s1", projectId, false), lane("s2", projectId, true)];
  const before = fold(store, lanes);
  assert.deepEqual(before.attention, [
    {
      band: "finished",
      kind: "review",
      title: "review me",
      projectId,
      sessionId: "s1",
      turnId: 1,
      since: 2000,
    },
  ]);
  assert.equal(before.badge, 1);

  // The persisted viewed marker clears the stand-in.
  store.setPref("viewed:s1", 1);
  const viewed = fold(store, lanes);
  assert.deepEqual(viewed.attention, []);
  assert.equal(viewed.badge, 0);
  store.close();
});

// ---------------------------------------------------------------------------
// Restart identity (core-service-49/54): the same stored rows derive
// the same states, with no live lane surviving the restart.
// ---------------------------------------------------------------------------

test("DR-035: reopening the store reproduces closed, queued, and finished; a dead session's dispatch releases", async () => {
  const ids = { s1: "73000000-0000-4000-8000-000000000001", s2: "73000000-0000-4000-8000-000000000002", closed: "73000000-0000-4000-8000-000000000003", queued: "73000000-0000-4000-8000-000000000004", finished: "73000000-0000-4000-8000-000000000005", working: "73000000-0000-4000-8000-000000000006" };
  const dir = mkdtempSync(join(tmpdir(), "spex-ledger-"));
  const path = join(dir, "state");
  const { store, projectId } = newProjectStore(path);
  addSession(store, projectId, ids.s1);
  addSession(store, projectId, ids.s2);

  queueIntent(store, projectId, ids.closed, "3");
  store.closeIntent(ids.closed, "dropped", 500);
  queueIntent(store, projectId, ids.queued, "5");
  queueIntent(store, projectId, ids.finished, "i");
  beginTurn(store, ids.s1, 1, "deliver", 1000);
  store.stampIntentDispatch(ids.finished, ids.s1, 1, 1000);
  finishTurn(store, ids.s1, 1, 2000);
  queueIntent(store, projectId, ids.working, "r");
  beginTurn(store, ids.s2, 1, "mid-flight", 3000);
  store.stampIntentDispatch(ids.working, ids.s2, 1, 3000);

  const before = fold(store, [lane(ids.s1, projectId, false), lane(ids.s2, projectId, true)]);
  assert.equal(stateOf(before, ids.queued).state, "queued");
  assert.equal(stateOf(before, ids.finished).state, "finished");
  assert.equal(stateOf(before, ids.working).state, "working");
  assert.ok(
    !before.intents.some((entry) => entry.intent.id === ids.closed),
    "a closed intent never re-enters the open fold",
  );
  await seedHistorySession(join(path, "sessions"), "/tmp/ledger-proj", store.getRecords(ids.s1, { includeHidden: true }).map((entry) => entry.record as unknown as Record<string, unknown>), ids.s1);
  await seedHistorySession(join(path, "sessions"), "/tmp/ledger-proj", store.getRecords(ids.s2, { includeHidden: true }).map((entry) => entry.record as unknown as Record<string, unknown>), ids.s2);
  store.close();

  // Restart: same file, no live lanes.
  const reopened = new Store({ dir: path });
  await reopened.initializeSessions();
  const after = fold(reopened, []);
  const queued = stateOf(after, ids.queued);
  assert.equal(queued.state, "queued");
  assert.equal(queued.intent.rank, "5");
  // Finished persists: it derives from ended turns, not from a lane.
  assert.deepEqual(
    stateOf(after, ids.finished),
    stateOf(before, ids.finished),
    "the finished derivation is restart-identical",
  );
  assert.deepEqual(after.attention, before.attention);
  // The mid-turn dispatch releases: its session died before the turn
  // finished. Stamps and rank stay.
  const released = stateOf(after, ids.working);
  assert.equal(released.state, "queued");
  assert.equal(released.intent.rank, "r");
  assert.ok(released.intent.dispatched);
  // The closed row is kept, never deleted.
  assert.equal(reopened.getIntent(ids.closed)?.closedAs, "dropped");
  reopened.close();
});

test("core-service-79: a remove act retires a closed intent from every read, its acts kept and its neighbours unmoved", async () => {
  const ids = { s1: "73000000-0000-4000-8000-000000000001", gone: "73000000-0000-4000-8000-000000000002", kept: "73000000-0000-4000-8000-000000000003" };
  const dir = mkdtempSync(join(tmpdir(), "spex-ledger-remove-"));
  const path = join(dir, "state");
  const { store, projectId } = newProjectStore(path);
  addSession(store, projectId, ids.s1);

  // One worked, confirmed intent, a plain chat turn ruled by its
  // verdict, and a queued bystander.
  queueIntent(store, projectId, ids.gone, "3", {
    source: { kind: "issue", ref: "9" },
  });
  beginTurn(store, ids.s1, 1, "hello hello hello", 1000);
  store.stampIntentDispatch(ids.gone, ids.s1, 1, 1000);
  finishTurn(store, ids.s1, 1, 2000);
  beginTurn(store, ids.s1, 2, "and a word after", 2200);
  finishTurn(store, ids.s1, 2, 2300);
  store.closeIntent(ids.gone, "done", 2500);
  queueIntent(store, projectId, ids.kept, "5");

  const lanes = [lane(ids.s1, projectId, false)];
  const before = fold(store, lanes);
  assert.deepEqual(
    store.listClosedIntents(projectId, 20).map((intent) => intent.id),
    [ids.gone],
  );
  assert.deepEqual(before.attention, [], "the chat turn is ruled, so it waits on nobody");

  store.removeIntent(ids.gone, 5000);

  // Absent from every read: the History page, the source binding, and
  // the fold's own rows.
  assert.equal(store.getIntent(ids.gone), undefined);
  assert.deepEqual(store.listClosedIntents(projectId, 20), []);
  assert.equal(store.openIntentBySource(projectId, "issue", "9"), undefined);
  const after = fold(store, lanes);
  assert.ok(
    !after.intents.some((entry) => entry.intent.id === ids.gone),
    "a removed intent lists in no band",
  );
  // Nothing else moves: the removed dispatch still bounds its
  // neighbours' turn ranges, so the ruled chat turn never re-summons.
  assert.deepEqual(after.attention, before.attention);
  assert.equal(stateOf(after, ids.kept).state, "queued");
  await seedHistorySession(join(path, "sessions"), "/tmp/ledger-proj", store.getRecords(ids.s1, { includeHidden: true }).map((entry) => entry.record as unknown as Record<string, unknown>), ids.s1);
  store.close();

  // Restart: the act log still holds every act of the removed intent,
  // and the reopened store reads it as absent all the same.
  const log = readFileSync(join(path, "intents", `${projectId}.jsonl`), "utf8");
  const acts = log
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { act: string; id?: string })
    .filter((act) => act.id === ids.gone || act.act === "queue")
    .map((act) => act.act);
  assert.deepEqual(acts, ["queue", "dispatch", "close", "queue", "remove"]);
  const reopened = new Store({ dir: path });
  await reopened.initializeSessions();
  assert.equal(reopened.getIntent(ids.gone), undefined);
  assert.deepEqual(reopened.listClosedIntents(projectId, 20), []);
  assert.equal(stateOf(fold(reopened, []), ids.kept).state, "queued");
  reopened.close();
});

// ---------------------------------------------------------------------------
// Specs record status (DR-035: specs.get carries the Status line)
// ---------------------------------------------------------------------------

test("DR-035: intent records serve their Status line verbatim, or none", () => {
  const dir = mkdtempSync(join(tmpdir(), "spex-ledger-specs-"));
  mkdirSync(join(dir, "specs", "intents"), { recursive: true });
  writeFileSync(
    join(dir, "specs", "intents", "001-ship-it.md"),
    "# IR-1: Ship it\n\n## Status\n\nDone — shipped 2026-08-01\n\n## Intent\n\nShip.\n",
  );
  writeFileSync(
    join(dir, "specs", "intents", "002-polish.md"),
    "# IR-2: Polish\n\n## Status\n\nIn progress\n\n## Intent\n\nPolish.\n",
  );
  writeFileSync(
    join(dir, "specs", "intents", "003-someday.md"),
    "# IR-3: Someday\n\n## Intent\n\nNo status section here.\n",
  );

  const tree = parseSpecTree(dir);
  assert.equal(tree.present, true);
  const byId = new Map(tree.intents.map((record) => [record.id, record]));
  assert.equal(byId.get("IR-001")?.status, "Done — shipped 2026-08-01");
  assert.equal(byId.get("IR-002")?.status, "In progress");
  const bare = byId.get("IR-003");
  assert.ok(bare, "the record without a Status section still lists");
  assert.ok(!("status" in bare), "an absent Status section serves no status");
});

// ---------------------------------------------------------------------------
// Protocol harness (core-service-18): the service end to end over the
// WebSocket against the scripted fake adapter.
// ---------------------------------------------------------------------------

// The player id carries no dot: the harness must run on the installed
// cligent build, and an undotted id is legal under every generation of
// the player-id rule.
const VALID_CONFIG = `
captain:
  adapter: claude
  model: claude-test
players:
  dev_coder:
    adapter: claude
    model: claude-test
playbooks:
  code:
    from: "@sublang/playbook/code/registry"
    roles:
      coder: dev_coder
`;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class Client {
  private readonly socket: WebSocket;
  readonly messages: ServerMessage[] = [];
  private nextId = 0;

  constructor(port: number) {
    this.socket = new WebSocket(`ws://127.0.0.1:${port}/?token=test`);
    this.socket.on("message", (data) => {
      this.messages.push(JSON.parse(String(data)) as ServerMessage);
    });
  }

  async open(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      if (this.socket.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }
      this.socket.once("open", resolve);
      this.socket.once("error", reject);
    });
    await this.waitFor((m) => m.type === "hello");
  }

  close(): void {
    this.socket.close();
  }

  async command<T extends Command["type"]>(
    type: T,
    fields: Omit<Extract<Command, { type: T }>, "type" | "id">,
  ): Promise<
    | { ok: true; result: CommandResults[T] }
    | { ok: false; error: { code: string; message: string } }
  > {
    const id = `c${(this.nextId += 1)}`;
    this.socket.send(JSON.stringify({ type, id, ...fields }));
    const reply = await this.waitFor(
      (m) => m.type === "reply" && m.id === id,
    );
    if (reply.type !== "reply") throw new Error("unreachable");
    return reply.ok
      ? { ok: true, result: reply.result as CommandResults[T] }
      : { ok: false, error: reply.error };
  }

  async expectOk<T extends Command["type"]>(
    type: T,
    fields: Omit<Extract<Command, { type: T }>, "type" | "id">,
  ): Promise<CommandResults[T]> {
    const reply = await this.command(type, fields);
    if (!reply.ok) {
      throw new Error(`${type} failed: ${reply.error.code} ${reply.error.message}`);
    }
    return reply.result;
  }

  /** The count-th message satisfying the check, appearing or already seen. */
  async waitFor(
    check: (message: ServerMessage) => boolean,
    count = 1,
    timeoutMs = 10000,
  ): Promise<ServerMessage> {
    const start = Date.now();
    for (;;) {
      const found = this.messages.filter(check);
      if (found.length >= count) return found[count - 1];
      if (Date.now() - start > timeoutMs) {
        throw new Error(
          `timeout waiting; got ${JSON.stringify(this.messages.map((m) => m.type))}`,
        );
      }
      await sleep(10);
    }
  }

  /** Poll ledger.get until the fold satisfies the check — session
   * bookkeeping (the turnActive flag) settles just after the final
   * record lands. */
  async ledgerUntil(
    check: (ledger: LedgerState) => boolean,
    label: string,
    timeoutMs = 10000,
  ): Promise<LedgerState> {
    const start = Date.now();
    for (;;) {
      const ledger = await this.expectOk("ledger.get", {});
      if (check(ledger)) return ledger;
      if (Date.now() - start > timeoutMs) {
        throw new Error(`timeout waiting for ${label}`);
      }
      await sleep(25);
    }
  }
}

interface Harness {
  service: CoreService;
  dir: string;
  dataDir: string;
  projectDir: string;
}

async function startHarness(
  options: {
    dataDir?: string;
    /** Replaces the default scripted Captain, so a test can leave a run
     * parked where the fold reads it (core-service-104). */
    captainScript?: Parameters<typeof createScriptedCaptain>[0];
    /** Prepended to the adapter's rules: a decision reply that starts a
     * catalog playbook engages a real root, which is what makes the
     * Captain shell advertise its own ending (core-service-98). */
    decision?: string;
  } = {},
): Promise<Harness> {
  const dir = mkdtempSync(join(tmpdir(), "spex-ledger-it-"));
  const configPath = join(dir, "playbook.config.yaml");
  writeFileSync(configPath, VALID_CONFIG);
  const projectDir = join(dir, "project");
  mkdirSync(projectDir);
  execFileSync("git", ["init", "-q", projectDir]);
  const dataDir = options.dataDir ?? join(dir, "state");

  const { imports } = fakeAdapterImports({
    rules: [
      ...(options.decision !== undefined
        ? [{ match: /"action"/, response: { result: options.decision } }]
        : []),
      { match: "route:", response: { result: '{"decision":"dispatch"}' } },
      {
        match: "slow:",
        response: { deltas: ["working"], result: "slow done", delayMs: 400 },
      },
    ],
    fallback: { deltas: ["hello ", "world"], result: "hello world" },
  });
  const captain = createScriptedCaptain(
    options.captainScript ??
      (async (turn, context, session) => {
        await session.emitStatus(`◇ turn ${turn.id}`);
        await context.callCaptain(`route: ${turn.prompt}`, { visibility: "hidden" });
        await context.callPlayer("dev_coder", `${turn.prompt}`);
      }),
  );

  const service = await CoreService.start({
    token: "test",
    configPath,
    dataDir,
    adapterImports: imports,
    adapterRuntime: () => ({ usable: true }),
    captainFactory: async () => captain,
    env: {},
    home: join(dir, "home"),
    watchConfig: false,
  });
  return { service, dir, dataDir, projectDir };
}

/** The one project's queue, in rank order, as intent ids. */
function queueIds(ledger: LedgerState, projectId: string): string[] {
  return ledger.intents
    .filter((entry) => entry.intent.projectId === projectId)
    .map((entry) => entry.intent.id);
}

// ---------------------------------------------------------------------------
// core-service-42..46/55/56: queue, move, link, and close mechanics
// ---------------------------------------------------------------------------

test("core-service-42..46: intent commands hold position, dedup, link, and close guards", async () => {
  const harness = await startHarness();
  const client = new Client(harness.service.port());
  await client.open();
  const project = await client.expectOk("project.register", {
    path: harness.projectDir,
  });

  // Positions: tail by default, head on request.
  const a = await client.expectOk("intent.queue", {
    projectId: project.id,
    text: "Alpha intent\nthe full staged text",
  });
  const b = await client.expectOk("intent.queue", {
    projectId: project.id,
    text: "Beta intent",
  });
  const c = await client.expectOk("intent.queue", {
    projectId: project.id,
    text: "Gamma intent",
    at: "head",
  });
  let ledger = await client.expectOk("ledger.get", {});
  assert.deepEqual(queueIds(ledger, project.id), [c.id, a.id, b.id]);

  // Every write announces itself (core-service-51, debounced).
  await client.waitFor(
    (m) => m.type === "intents.changed" && m.projectIds.includes(project.id),
  );

  // Moves: after a named intent, or to the head on null.
  await client.expectOk("intent.move", { intentId: b.id, afterIntentId: c.id });
  ledger = await client.expectOk("ledger.get", {});
  assert.deepEqual(queueIds(ledger, project.id), [c.id, b.id, a.id]);
  await client.expectOk("intent.move", { intentId: a.id, afterIntentId: null });
  ledger = await client.expectOk("ledger.get", {});
  assert.deepEqual(queueIds(ledger, project.id), [a.id, c.id, b.id]);

  // Source dedup: one open intent per issue/PR/record artifact.
  const issue = await client.expectOk("intent.queue", {
    projectId: project.id,
    text: "Fix the login issue",
    source: {
      kind: "issue",
      ref: "7",
      url: "https://github.com/o/r/issues/7",
      labels: ["bug", "p1"],
    },
  });
  // The source's labels are provenance, kept as captured (DR-038).
  assert.deepEqual(issue.source?.labels, ["bug", "p1"]);
  const dupIssue = await client.command("intent.queue", {
    projectId: project.id,
    text: "Fix the login issue again",
    source: { kind: "issue", ref: "7" },
  });
  assert.ok(!dupIssue.ok && dupIssue.error.code === "conflict");
  assert.match(dupIssue.error.message, /Fix the login issue/);
  await client.expectOk("intent.queue", {
    projectId: project.id,
    text: "Review the PR",
    source: { kind: "pr", ref: "12" },
  });
  const dupPr = await client.command("intent.queue", {
    projectId: project.id,
    text: "Review the PR twice",
    source: { kind: "pr", ref: "12" },
  });
  assert.ok(!dupPr.ok && dupPr.error.code === "conflict");
  await client.expectOk("intent.queue", {
    projectId: project.id,
    text: "Realize the record",
    source: { kind: "record", ref: "IR-21" },
  });
  const dupRecord = await client.command("intent.queue", {
    projectId: project.id,
    text: "Realize the record twice",
    source: { kind: "record", ref: "IR-21" },
  });
  assert.ok(!dupRecord.ok && dupRecord.error.code === "conflict");

  // Chat capture is never deduplicated.
  await client.expectOk("intent.queue", {
    projectId: project.id,
    text: "From the chat",
    source: { kind: "chat", ref: "sess-1" },
  });
  await client.expectOk("intent.queue", {
    projectId: project.id,
    text: "From the chat again",
    source: { kind: "chat", ref: "sess-1" },
  });

  // An edit lands while queued (core-service-43).
  const edited = await client.expectOk("intent.edit", {
    intentId: b.id,
    text: "Beta intent, sharpened",
  });
  assert.equal(edited.text, "Beta intent, sharpened");

  // Link guards: blocked marking, cycle, self, and closed targets.
  await client.expectOk("intent.link", { intentId: c.id, afterIntentId: a.id });
  ledger = await client.expectOk("ledger.get", {});
  const blocked = ledger.intents.find((entry) => entry.intent.id === c.id);
  assert.deepEqual(blocked?.blockedBy, {
    intentId: a.id,
    title: "Alpha intent",
    projectId: project.id,
  });
  const cycle = await client.command("intent.link", {
    intentId: a.id,
    afterIntentId: c.id,
  });
  assert.ok(!cycle.ok && cycle.error.code === "conflict");
  assert.match(cycle.error.message, /cycle/);
  const self = await client.command("intent.link", {
    intentId: a.id,
    afterIntentId: a.id,
  });
  assert.ok(!self.ok && self.error.code === "invalid_request");

  // Closing the predecessor lifts the block by derivation.
  await client.expectOk("intent.close", { intentId: a.id, as: "dropped" });
  ledger = await client.expectOk("ledger.get", {});
  const lifted = ledger.intents.find((entry) => entry.intent.id === c.id);
  assert.equal(lifted?.state, "queued");
  assert.equal(lifted?.blockedBy, undefined);

  // A link to a closed intent is rejected.
  const closedTarget = await client.command("intent.link", {
    intentId: b.id,
    afterIntentId: a.id,
  });
  assert.ok(!closedTarget.ok && closedTarget.error.code === "conflict");
  assert.match(closedTarget.error.message, /closed/);

  // done requires a finished intent; dropped is legal on any open one;
  // a second close is rejected (core-service-46).
  const doneEarly = await client.command("intent.close", {
    intentId: c.id,
    as: "done",
  });
  assert.ok(!doneEarly.ok && doneEarly.error.code === "conflict");
  await client.expectOk("intent.close", { intentId: c.id, as: "dropped" });
  const reClose = await client.command("intent.close", {
    intentId: c.id,
    as: "dropped",
  });
  assert.ok(!reClose.ok && reClose.error.code === "conflict");

  // Closing the holder releases the source artifact (core-service-55).
  await client.expectOk("intent.close", { intentId: issue.id, as: "dropped" });
  await client.expectOk("intent.queue", {
    projectId: project.id,
    text: "Fix the login issue, take two",
    source: { kind: "issue", ref: "7" },
  });

  client.close();
  await harness.service.stop();
});

// ---------------------------------------------------------------------------
// core-service-104: letting go ends the parked run (DR-073)
// ---------------------------------------------------------------------------

/** A Captain that parks a run on a Boss question on its first turn and
 * then stays out of the way, so the fold reads a standing question while
 * the real Captain shell keeps the root its decision engaged. */
function parkingCaptain(): Parameters<typeof createScriptedCaptain>[0] {
  let turns = 0;
  return async (turn, context, session) => {
    turns += 1;
    if (turns > 1) return;
    const trace = async (
      type: string,
      payload: Record<string, unknown>,
      sequence: number,
    ): Promise<void> => {
      await session.emitTelemetry({
        topic: "playbook.trace",
        payload: {
          schemaVersion: 4,
          sequence,
          timestamp: Date.now(),
          type,
          playbookId: "code",
          depth: 0,
          sessionId: "root-code",
          rootSessionId: "root-code",
          payload,
        },
      });
    };
    await trace("session.started", {}, 1);
    await trace(
      "fsm.transition",
      {
        from: "coding",
        to: "awaitBossReply",
        event: { type: "NEEDS_BOSS" },
        state: {
          value: "awaitBossReply",
          activeStateIds: ["awaitBossReply"],
          tags: [],
          status: "active",
          quiescent: true,
        },
      },
      2,
    );
    await session.emitTelemetry({
      topic: "playbook.fsm.state",
      payload: { from: "coding", to: "awaitBossReply", event: "NEEDS_BOSS" },
    });
    await context.emitReply("Should I also migrate the legacy sessions?");
  };
}

const START_CODE = JSON.stringify({
  action: "start",
  playbookId: "code",
  input: "Carry out the parked work",
});

/** Wait out a turn and the runtime release that follows it: the fold
 * reads the stored turn as ended a moment before the shell lets go, and
 * a control submitted in that window is refused busy. */
async function settledTurns(
  client: Client,
  harness: Harness,
  sessionId: string,
  turns: number,
): Promise<void> {
  await client.waitFor(
    (message) =>
      message.type === "session.state" &&
      message.session.id === sessionId &&
      message.session.turns === turns &&
      !message.session.turnActive &&
      !message.session.live,
  );
  await harness.service["sessions"].settled(sessionId);
}

/** Every Boss turn the session has started, oldest first, by prompt. */
async function turnPrompts(client: Client, sessionId: string): Promise<string[]> {
  const { records } = await client.expectOk("history.get", { sessionId });
  return records.flatMap(({ record }) => {
    const entry = record as unknown as { type: string; turn?: { prompt: string } };
    return entry.type === "turn_started" && entry.turn ? [entry.turn.prompt] : [];
  });
}

test(
  "core-service-104: a Drop on interrupted work ends its parked run, then rules",
  { timeout: 30_000 },
  async (t) => {
    const harness = await startHarness({
      captainScript: parkingCaptain(),
      decision: START_CODE,
    });
    const client = new Client(harness.service.port());
    t.after(async () => { client.close(); await harness.service.stop(); });
    await client.open();
    const project = await client.expectOk("project.register", {
      path: harness.projectDir,
    });
    const session = await client.expectOk("session.create", {
      projectId: project.id,
    });
    await client.expectOk("subscribe", {
      channel: { kind: "session", sessionId: session.id },
    });
    const parked = await client.expectOk("intent.queue", {
      projectId: project.id,
      text: "Migrate the legacy sessions",
    });
    // Never dispatched, so nothing of its own is ever parked: its Drop
    // stays the pure verdict it has always been.
    const untouched = await client.expectOk("intent.queue", {
      projectId: project.id,
      text: "Something else entirely",
    });
    await client.expectOk("turn.submit", {
      sessionId: session.id,
      text: parked.text,
      intentId: parked.id,
    });
    await settledTurns(client, harness, session.id, 1);
    const standing = await client.ledgerUntil(
      (ledger) =>
        ledger.attention.some(
          (entry) => entry.intentId === parked.id && entry.kind === "question",
        ),
      "the run to park on its question",
    );
    assert.equal(
      standing.intents.find((entry) => entry.intent.id === parked.id)?.state,
      "interrupted",
    );

    // The whole ruling, taken by the close alone (core-service-46).
    const dropped = await client.expectOk("intent.close", {
      intentId: parked.id,
      as: "dropped",
    });
    assert.equal(dropped.closedAs, "dropped");
    // The ending ran as the session's own next turn, carrying the
    // control's label rather than any Boss text, and stamped no
    // dispatch (core-service-47, core-service-98).
    const prompts = await turnPrompts(client, session.id);
    assert.equal(prompts.length, 2);
    assert.notEqual(prompts[1], parked.text);
    assert.ok(
      prompts[1].includes("/code"),
      `the ending turn names the run it stopped; got ${prompts[1]}`,
    );
    assert.equal(dropped.dispatched?.turnId, 1);
    // The run it ended is disposed, inside that turn, so the fold's
    // park stops standing for every consumer at once.
    const { records } = await client.expectOk("history.get", {
      sessionId: session.id,
    });
    const disposed = records.filter(({ record }) => {
      const entry = record as unknown as {
        type: string;
        topic?: string;
        turnId: number | null;
        payload?: { type?: string; playbookId?: string };
      };
      return (
        entry.type === "captain_telemetry" &&
        entry.topic === "playbook.trace" &&
        entry.payload?.type === "session.disposed" &&
        entry.payload.playbookId === "code" &&
        entry.turnId === 2
      );
    });
    assert.ok(disposed.length > 0, "the ended run reports its disposal");
    // Nothing of that session still summons, and the work reads as
    // dropped in History (core-service-49, core-service-50).
    const after = await client.expectOk("ledger.get", {});
    assert.deepEqual(
      after.attention.filter((entry) => entry.sessionId === session.id),
      [],
    );
    const history = await client.expectOk("ledger.history", {
      projectId: project.id,
    });
    assert.deepEqual(
      history.intents.map((row) => [row.intent.id, row.intent.closedAs]),
      [[parked.id, "dropped"]],
    );

    // With no run parked, the verdict is the whole act: no control turn.
    await client.expectOk("intent.close", {
      intentId: untouched.id,
      as: "dropped",
    });
    assert.deepEqual(await turnPrompts(client, session.id), prompts);
  },
);

test(
  "core-service-104: an ending the session cannot run refuses the Drop",
  { timeout: 30_000 },
  async (t) => {
    // No decision starts a root, so the opened shell advertises no
    // ending: nothing half-rules, and the intent stays open.
    const harness = await startHarness({ captainScript: parkingCaptain() });
    const client = new Client(harness.service.port());
    t.after(async () => { client.close(); await harness.service.stop(); });
    await client.open();
    const project = await client.expectOk("project.register", {
      path: harness.projectDir,
    });
    const session = await client.expectOk("session.create", {
      projectId: project.id,
    });
    await client.expectOk("subscribe", {
      channel: { kind: "session", sessionId: session.id },
    });
    const parked = await client.expectOk("intent.queue", {
      projectId: project.id,
      text: "Migrate the legacy sessions",
    });
    await client.expectOk("turn.submit", {
      sessionId: session.id,
      text: parked.text,
      intentId: parked.id,
    });
    await settledTurns(client, harness, session.id, 1);
    await client.ledgerUntil(
      (ledger) =>
        ledger.attention.some(
          (entry) => entry.intentId === parked.id && entry.kind === "question",
        ),
      "the run to park on its question",
    );

    const refused = await client.command("intent.close", {
      intentId: parked.id,
      as: "dropped",
    });
    assert.ok(!refused.ok, "the close is refused with the ending's cause");
    assert.match(refused.error.message, /end its run/);
    const after = await client.expectOk("ledger.get", {});
    assert.equal(
      after.intents.find((entry) => entry.intent.id === parked.id)?.intent
        .closedAt,
      undefined,
    );
    assert.ok(
      after.attention.some((entry) => entry.intentId === parked.id),
      "the summons stands until the ruling lands",
    );
  },
);

// ---------------------------------------------------------------------------
// core-service-47/53/57: dispatch stamping over real turns
// ---------------------------------------------------------------------------

for (const outcome of ["finished", "aborted"] as const) {
  for (const admission of ["message", "session", "shutdown"] as const) {
    test(`core-service-77: ${admission} admission waits for ${outcome} release metadata`, {timeout: 15000}, async (t) => {
      const harness = await startHarness();
      const client = new Client(harness.service.port());
      const store = harness.service["store"];
      const sessions = harness.service["sessions"];
      const refresh = store.refreshSession.bind(store);
      let stopping: Promise<void> | undefined;
      let storeClosed = false;
      const close = store.close.bind(store);
      store.close = () => { storeClosed = true; close(); };
      let release!: () => void;
      const held = new Promise<void>((resolve) => { release = resolve; });
      let reached!: () => void;
      const refreshing = new Promise<void>((resolve) => { reached = resolve; });
      t.after(async () => {
        release();
        store.refreshSession = refresh;
        client.close();
        await (stopping ?? harness.service.stop());
      });
      await client.open();
      const project = await client.expectOk("project.register", {path: harness.projectDir});
      const session = await client.expectOk("session.create", {projectId: project.id});
      await client.expectOk("subscribe", {channel: {kind: "session", sessionId: session.id}});
      const intent = await client.expectOk("intent.queue", {projectId: project.id, text: "Next work"});
      store.refreshSession = async (id, live) => {
        if (id === session.id && live === false && !sessions.getLive(id)) {
          store.refreshSession = refresh;
          reached();
          await held;
        }
        return refresh(id, live);
      };
      await client.expectOk("turn.submit", {sessionId: session.id, text: "slow: first"});
      if (outcome === "aborted") {
        await client.waitFor((m) => m.type === "record" && m.record.type === "turn_started");
        await client.expectOk("turn.abort", {sessionId: session.id});
      }
      await refreshing;
      assert.equal(sessions.getLive(session.id), undefined, "the runtime has already been removed");

      // Observe the admission boundary, then round-trip an independent
      // command while refresh is held; no wall-clock sleep defines the race.
      let entered!: () => void;
      const entering = new Promise<void>((resolve) => { entered = resolve; });
      if (admission === "message") {
        const settled = sessions.settled.bind(sessions);
        sessions.settled = async (id) => { entered(); await settled(id); };
      } else if (admission === "session") {
        const settled = sessions.projectSettled.bind(sessions);
        sessions.projectSettled = async (id) => { entered(); await settled(id); };
      } else {
        const dispose = sessions.disposeAll.bind(sessions);
        sessions.disposeAll = async () => { entered(); await dispose(); };
      }
      let replied = false;
      const pending = (admission === "message"
        ? client.command("turn.submit", {sessionId: session.id, text: "next", intentId: intent.id})
        : admission === "session"
          ? client.command("session.create", {projectId: project.id})
          : (stopping = harness.service.stop()).then(() => ({ok: true as const, result: null}))
      ).then((reply) => { replied = true; return reply; });
      await entering;
      const before = await client.expectOk("ledger.get", {});
      assert.equal(replied, false, "admission waits through the stored-summary refresh");
      assert.equal(storeClosed, false, "shutdown cannot close the store during refresh");
      assert.equal(before.intents.find((entry) => entry.intent.id === intent.id)?.intent.dispatched, undefined);
      release();
      const reply = await pending;
      if (admission === "message" && outcome === "aborted") {
        assert.ok(!reply.ok && reply.error.code === "invalid_request");
        assert.match(reply.error.message, /Retry or Discard/);
      } else {
        assert.ok(reply.ok, JSON.stringify(reply));
      }
      if (admission === "message" && outcome === "finished") {
        const after = await client.ledgerUntil((ledger) => ledger.intents.find((entry) => entry.intent.id === intent.id)?.state === "finished", "the continued intent to finish");
        assert.equal(after.intents.find((entry) => entry.intent.id === intent.id)?.intent.dispatched?.turnId, 2);
        assert.equal(client.messages.filter((m) => m.type === "record" && m.record.type === "turn_started").length, 2);
      } else if (admission !== "shutdown") {
        assert.equal(store.getIntent(intent.id)?.dispatched, undefined, "no extra dispatch stamp");
      } else {
        assert.equal(storeClosed, true);
      }
    });
  }
}

test("core-service-57: submission validates the intent, the turn start stamps it, and an abort re-queues it", async () => {
  const harness = await startHarness();
  const client = new Client(harness.service.port());
  await client.open();
  const project = await client.expectOk("project.register", {
    path: harness.projectDir,
  });
  const session = await client.expectOk("session.create", {
    projectId: project.id,
  });
  await client.expectOk("subscribe", {
    channel: { kind: "session", sessionId: session.id },
  });

  const i1 = await client.expectOk("intent.queue", {
    projectId: project.id,
    text: "Run the build",
  });
  const i2 = await client.expectOk("intent.queue", {
    projectId: project.id,
    text: "Follow the build",
  });
  const i3 = await client.expectOk("intent.queue", {
    projectId: project.id,
    text: "Bystander",
  });
  await client.expectOk("intent.link", { intentId: i2.id, afterIntentId: i1.id });

  // A blocked intent is rejected at submission and starts no turn.
  const blockedSubmit = await client.command("turn.submit", {
    sessionId: session.id,
    text: "x",
    intentId: i2.id,
  });
  assert.ok(!blockedSubmit.ok && blockedSubmit.error.code === "conflict");
  assert.match(blockedSubmit.error.message, /waits on/);

  // Another project's intent is rejected too.
  const otherDir = join(harness.dir, "other");
  mkdirSync(otherDir);
  execFileSync("git", ["init", "-q", otherDir]);
  const other = await client.expectOk("project.register", { path: otherDir });
  const foreign = await client.expectOk("intent.queue", {
    projectId: other.id,
    text: "Foreign intent",
  });
  const foreignSubmit = await client.command("turn.submit", {
    sessionId: session.id,
    text: "x",
    intentId: foreign.id,
  });
  assert.ok(!foreignSubmit.ok && foreignSubmit.error.code === "invalid_request");

  // Neither rejection started a turn: the real dispatch is accepted.
  await client.expectOk("turn.submit", {
    sessionId: session.id,
    text: "slow: run",
    intentId: i1.id,
  });
  const started = await client.waitFor(
    (m) => m.type === "record" && m.record.type === "turn_started",
  );
  const startedTurnId =
    started.type === "record"
      ? (started.record as unknown as { turn: { id: number } }).turn.id
      : -1;

  // Busy while the turn is active: nothing stamps on the bystander.
  const busySubmit = await client.command("turn.submit", {
    sessionId: session.id,
    text: "y",
    intentId: i3.id,
  });
  assert.ok(!busySubmit.ok && busySubmit.error.code === "busy");

  // The started turn stamped the dispatch: working, and no longer
  // editable (core-service-43).
  let ledger = await client.expectOk("ledger.get", {});
  const working = ledger.intents.find((entry) => entry.intent.id === i1.id);
  assert.equal(working?.state, "working");
  assert.deepEqual(
    {
      sessionId: working?.intent.dispatched?.sessionId,
      turnId: working?.intent.dispatched?.turnId,
    },
    { sessionId: session.id, turnId: startedTurnId },
  );
  const editDispatched = await client.command("intent.edit", {
    intentId: i1.id,
    text: "rewrite history",
  });
  assert.ok(!editDispatched.ok && editDispatched.error.code === "conflict");
  const doneWhileWorking = await client.command("intent.close", {
    intentId: i1.id,
    as: "done",
  });
  assert.ok(!doneWhileWorking.ok && doneWhileWorking.error.code === "conflict");

  // The finish delivers: finished with a band-two entry, and the
  // untouched bystander stays queued with no stamp.
  await client.waitFor(
    (m) => m.type === "record" && m.record.type === "turn_finished",
  );
  ledger = await client.ledgerUntil(
    (state) =>
      state.intents.find((entry) => entry.intent.id === i1.id)?.state ===
      "finished",
    "the dispatched intent to finish",
  );
  const finishEntry = ledger.attention.find((entry) => entry.intentId === i1.id);
  assert.equal(finishEntry?.band, "finished");
  assert.equal(finishEntry?.kind, "finish");
  const bystander = ledger.intents.find((entry) => entry.intent.id === i3.id);
  assert.equal(bystander?.state, "queued");
  assert.equal(bystander?.intent.dispatched, undefined);

  // The shared checkpoint must settle before another turn starts.
  await client.waitFor((message) => message.type === "session.state" && message.session.id === session.id && message.session.turns === 1 && message.session.turnActive === false);

  // The verdict lands, releasing the follower for dispatch.
  await client.expectOk("intent.close", { intentId: i1.id, as: "done" });
  ledger = await client.expectOk("ledger.get", {});
  const follower = ledger.intents.find((entry) => entry.intent.id === i2.id);
  assert.equal(follower?.state, "queued");
  assert.equal(follower?.blockedBy, undefined);
  const followerRank = follower?.intent.rank;

  // An aborted dispatch turn keeps its stamps while the next fold
  // re-derives the intent as queued at its kept rank, editable again.
  await client.expectOk("turn.submit", {
    sessionId: session.id,
    text: "slow: follow",
    intentId: i2.id,
  });
  await client.waitFor(
    (m) => m.type === "record" && m.record.type === "turn_started",
    2,
  );
  const aborted = await client.expectOk("turn.abort", { sessionId: session.id });
  assert.equal(aborted.aborted, true);
  await client.waitFor(
    (m) => m.type === "record" && m.record.type === "turn_aborted",
  );
  ledger = await client.ledgerUntil(
    (state) =>
      state.intents.find((entry) => entry.intent.id === i2.id)?.state ===
      "queued",
    "the aborted dispatch to release",
  );
  const released = ledger.intents.find((entry) => entry.intent.id === i2.id);
  assert.ok(released?.intent.dispatched, "the stamps remain as history");
  assert.equal(released?.intent.rank, followerRank, "the rank keeps its place");
  await client.expectOk("intent.edit", {
    intentId: i2.id,
    text: "Follow the build, retried",
  });

  // An abort leaves shared uncertainty. Resolve it before sending different work.
  await client.waitFor((message) => message.type === "session.state" && message.session.id === session.id && !message.session.live && !!message.session.recovery);
  await client.expectOk("session.discard", { sessionId: session.id });

  // History is done work (core-service-50, DR-038): the done intent
  // lists; the bystander, worked then dropped, lists under its
  // verdict; an intent dropped before any turn of it ran leaves no
  // trace.
  await client.expectOk("turn.submit", {
    sessionId: session.id,
    text: "wrap up",
    intentId: i3.id,
  });
  await client.waitFor(
    (m) => m.type === "record" && m.record.type === "turn_finished",
    2,
  );
  await client.ledgerUntil(
    (state) =>
      state.intents.find((entry) => entry.intent.id === i3.id)?.state ===
      "finished",
    "the bystander to finish",
  );
  await client.expectOk("intent.close", { intentId: i3.id, as: "dropped" });
  const neverRun = await client.expectOk("intent.queue", {
    projectId: project.id,
    text: "Queued and taken back out",
  });
  await client.expectOk("intent.close", { intentId: neverRun.id, as: "dropped" });
  const history = await client.expectOk("ledger.history", { projectId: project.id });
  assert.deepEqual(
    history.intents.map((row) => [row.intent.id, row.intent.closedAs]),
    [
      [i3.id, "dropped"],
      [i1.id, "done"],
    ],
  );
  assert.equal(history.more, false);

  // Removing takes the closed row out of History and leaves the rest
  // of the ledger as it was (core-service-79); an open intent, an
  // unknown one, and one already removed all refuse.
  const beforeRemove = await client.expectOk("ledger.get", {});
  const changes = client.messages.filter(
    (m) => m.type === "intents.changed",
  ).length;
  await client.expectOk("intent.remove", { intentId: i1.id });
  await client.waitFor(
    (m) => m.type === "intents.changed" && m.projectIds.includes(project.id),
    changes + 1,
  );
  const afterRemove = await client.expectOk("ledger.history", {
    projectId: project.id,
  });
  assert.deepEqual(
    afterRemove.intents.map((row) => row.intent.id),
    [i3.id],
  );
  const rowStates = (state: LedgerState) =>
    state.intents.map((entry) => [entry.intent.id, entry.state]);
  const stillOpen = await client.expectOk("ledger.get", {});
  assert.deepEqual(rowStates(stillOpen), rowStates(beforeRemove));
  assert.equal(stillOpen.badge, beforeRemove.badge);
  const openRemove = await client.command("intent.remove", { intentId: i2.id });
  assert.ok(!openRemove.ok && openRemove.error.code === "conflict");
  assert.match(openRemove.error.message, /closed/);
  const unknownRemove = await client.command("intent.remove", {
    intentId: "no-such-intent",
  });
  assert.ok(!unknownRemove.ok && unknownRemove.error.code === "not_found");
  const twice = await client.command("intent.remove", { intentId: i1.id });
  assert.ok(!twice.ok && twice.error.code === "not_found");

  client.close();
  await harness.service.stop();
});

// ---------------------------------------------------------------------------
// core-service-50/58: History paging
// ---------------------------------------------------------------------------

test("core-service-58: ledger.history pages 45 closed intents 20/20/5, newest first, no overlap", async () => {
  // Seed the store first, then serve it: paging is a pure read over
  // closed rows, wherever they came from.
  const dir = mkdtempSync(join(tmpdir(), "spex-ledger-hist-"));
  const dataDir = join(dir, "state");
  const seeded = new Store({ dir: dataDir });
  const project = seeded.registerProject("/tmp/ledger-hist-proj", "hist", 1);
  // Half close done, half were worked — one finished turn each — then
  // dropped: both are history (DR-038).
  addSession(seeded, project.id, "73000000-0000-4000-8000-000000000010");
  for (let i = 1; i <= 45; i += 1) {
    const id = demoHistoryIntentId(i);
    seeded.addIntent({
      id,
      projectId: project.id,
      text: `Closed intent ${i}`,
      rank: String(i).padStart(3, "0") + "i",
      createdAt: i,
    });
    if (i % 2 === 1) {
      beginTurn(seeded, "73000000-0000-4000-8000-000000000010", i, `Closed intent ${i}`, 100 + i);
      finishTurn(seeded, "73000000-0000-4000-8000-000000000010", i, 500 + i);
      seeded.stampIntentDispatch(id, "73000000-0000-4000-8000-000000000010", i, 100 + i);
    }
    seeded.closeIntent(id, i % 2 === 0 ? "done" : "dropped", 1000 + i);
  }
  await seedHistorySession(join(dataDir, "sessions"), project.path, seeded.getRecords("73000000-0000-4000-8000-000000000010", { includeHidden: true }).map((entry) => entry.record as unknown as Record<string, unknown>), "73000000-0000-4000-8000-000000000010");
  seeded.close();

  const harness = await startHarness({ dataDir });
  const client = new Client(harness.service.port());
  await client.open();

  const expectedIds = Array.from({ length: 45 }, (_, index) => {
    const n = 45 - index;
    return demoHistoryIntentId(n);
  });

  const page1 = await client.expectOk("ledger.history", {
    projectId: project.id,
  });
  assert.equal(page1.intents.length, 20);
  assert.equal(page1.more, true);
  assert.deepEqual(
    page1.intents.map((row) => row.intent.id),
    expectedIds.slice(0, 20),
  );

  const last1 = page1.intents[page1.intents.length - 1].intent;
  assert.ok(last1.closedAt !== undefined);
  const page2 = await client.expectOk("ledger.history", {
    projectId: project.id,
    before: { closedAt: last1.closedAt, intentId: last1.id },
  });
  assert.equal(page2.intents.length, 20);
  assert.equal(page2.more, true);
  assert.deepEqual(
    page2.intents.map((row) => row.intent.id),
    expectedIds.slice(20, 40),
  );

  const last2 = page2.intents[page2.intents.length - 1].intent;
  assert.ok(last2.closedAt !== undefined);
  const page3 = await client.expectOk("ledger.history", {
    projectId: project.id,
    before: { closedAt: last2.closedAt, intentId: last2.id },
  });
  assert.equal(page3.intents.length, 5);
  assert.equal(page3.more, false);
  assert.deepEqual(
    page3.intents.map((row) => row.intent.id),
    expectedIds.slice(40),
  );

  const all = [...page1.intents, ...page2.intents, ...page3.intents].map(
    (row) => row.intent.id,
  );
  assert.equal(new Set(all).size, 45, "the pages overlap nothing");

  client.close();
  await harness.service.stop();
});

// ---------------------------------------------------------------------------
// core-service-48/59: the viewed marker over the protocol
// ---------------------------------------------------------------------------

test("core-service-59: session.viewed clears the un-ledgered turn's review stand-in", async () => {
  const harness = await startHarness();
  const client = new Client(harness.service.port());
  await client.open();
  const project = await client.expectOk("project.register", {
    path: harness.projectDir,
  });
  const session = await client.expectOk("session.create", {
    projectId: project.id,
  });
  await client.expectOk("subscribe", {
    channel: { kind: "session", sessionId: session.id },
  });

  await client.expectOk("turn.submit", {
    sessionId: session.id,
    text: "please review this",
  });
  const finished = await client.waitFor(
    (m) => m.type === "record" && m.record.type === "turn_finished",
  );
  const turnId =
    finished.type === "record" ? (finished.record.turnId ?? -1) : -1;
  assert.ok(turnId >= 0);

  const ledger = await client.ledgerUntil(
    (state) => state.attention.some((entry) => entry.kind === "review"),
    "the review stand-in to appear",
  );
  const review = ledger.attention.find((entry) => entry.kind === "review");
  assert.equal(review?.band, "finished");
  assert.equal(review?.sessionId, session.id);
  assert.equal(review?.turnId, turnId);
  assert.equal(review?.title, "please review this");
  assert.equal(review?.intentId, undefined, "a stand-in names no intent");
  assert.equal(ledger.badge, 1);

  // A marker naming a turn still in flight is refused, so no client
  // suppresses the next summons by naming it (core-service-48).
  await client.expectOk("turn.submit", {
    sessionId: session.id,
    // Slow enough that the marker below reaches a turn still running.
    text: "slow: and one more",
  });
  const started = await client.waitFor(
    (m) =>
      m.type === "record" &&
      m.record.type === "turn_started" &&
      (m.record.turnId ?? -1) > turnId,
  );
  const running =
    started.type === "record" ? (started.record.turnId ?? -1) : -1;
  assert.ok(running > turnId);
  const refused = await client.command("session.viewed", {
    sessionId: session.id,
    turnId: running,
  });
  assert.ok(
    !refused.ok && refused.error.code === "invalid_request",
    JSON.stringify(refused),
  );
  await client.waitFor(
    (m) => m.type === "record" && m.record.type === "turn_finished",
  );

  await client.expectOk("session.viewed", { sessionId: session.id, turnId });
  const stillSummons = await client.ledgerUntil(
    (state) => state.attention.some((entry) => entry.kind === "review"),
    "the newer unread turn to stand",
  );
  assert.equal(
    stillSummons.attention.find((entry) => entry.kind === "review")?.turnId,
    running,
    "the older marker leaves the newer turn summoning",
  );
  await client.expectOk("session.viewed", {
    sessionId: session.id,
    turnId: running,
  });
  const viewed = await client.expectOk("ledger.get", {});
  assert.deepEqual(viewed.attention, []);
  assert.equal(viewed.badge, 0);

  client.close();
  await harness.service.stop();
});

// ---------------------------------------------------------------------------
// core-service-54: restart identity over the protocol, and the act log
// ---------------------------------------------------------------------------

test("core-service-54: ledger.get replies identically after a service restart, and the act log holds acts only", async () => {
  const harness = await startHarness();
  const client = new Client(harness.service.port());
  await client.open();
  const project = await client.expectOk("project.register", {
    path: harness.projectDir,
  });
  const kept = await client.expectOk("intent.queue", {
    projectId: project.id,
    text: "Keep me queued",
  });
  await client.expectOk("intent.edit", { intentId: kept.id, text: "Kept, edited" });
  const closed = await client.expectOk("intent.queue", {
    projectId: project.id,
    text: "Close me",
  });
  await client.expectOk("intent.close", { intentId: closed.id, as: "dropped" });
  const before = await client.expectOk("ledger.get", {});
  client.close();
  await harness.service.stop();

  const restarted = await CoreService.start({
    token: "test",
    configPath: join(harness.dir, "playbook.config.yaml"),
    dataDir: harness.dataDir,
    env: {},
    home: join(harness.dir, "home"),
    watchConfig: false,
  });
  const client2 = new Client(restarted.port());
  await client2.open();
  assert.deepEqual(await client2.expectOk("ledger.get", {}), before);

  // The persisted act log is acts and provenance only: no state or
  // status field anywhere (core-service-52).
  const acts = readFileSync(
    join(harness.dataDir, "intents", `${project.id}.jsonl`),
    "utf8",
  )
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  assert.ok(acts.length >= 4, "queue, edit, queue, close all appended");
  for (const act of acts) {
    assert.ok(!("state" in act) && !("status" in act));
    const intent = act.intent as Record<string, unknown> | undefined;
    if (intent) assert.ok(!("state" in intent) && !("status" in intent));
  }
  client2.close();
  await restarted.stop();
});

test("dashboard-10: the Captain's own machine reporting after a park leaves the question standing", () => {
  const { store, projectId } = newProjectStore();
  addSession(store, projectId, "s1");
  queueIntent(store, projectId, "Q", "i");
  beginTurn(store, "s1", 1, "plan it", 1000);
  store.stampIntentDispatch("Q", "s1", 1, 1000);
  append(store, "s1", {
    type: "captain_telemetry",
    topic: "playbook.fsm.state",
    payload: { from: "planAnalysis", to: "awaitBossReply" },
    turnId: 1,
    timestamp: 1500,
  });
  // The controller Captain's machine reports its own states after
  // the /dev machine parked — recorded verbatim from a real run.
  append(store, "s1", {
    type: "captain_telemetry",
    topic: "playbook.fsm.state",
    payload: { from: "deciding", to: "reporting" },
    turnId: 1,
    timestamp: 1600,
  });
  append(store, "s1", {
    type: "captain_telemetry",
    topic: "playbook.fsm.state",
    payload: { from: "reporting", to: "hub" },
    turnId: 1,
    timestamp: 1700,
  });
  finishTurn(store, "s1", 1, 2000);
  let ledger = fold(store, [lane("s1", projectId, false)]);
  assert.equal(stateOf(ledger, "Q").reason, "question");
  assert.deepEqual(
    ledger.attention.map((entry) => [entry.kind, entry.intentId]),
    [["question", "Q"]],
  );
  // A Boss reply acknowledges the question as the parked machine resumes.
  beginTurn(store, "s1", 2, "only what exists today", 3000);
  append(store, "s1", {
    type: "captain_telemetry",
    topic: "playbook.fsm.state",
    payload: { from: "awaitBossReply", to: "planAnalysis" },
    turnId: 2,
    timestamp: 3100,
  });
  ledger = fold(store, [lane("s1", projectId, true)]);
  assert.equal(ledger.attention.some((entry) => entry.kind === "question"), false);
  store.close();
});

test("dashboard-10/33: manually dispatching another intent clears the prior question at turn start", () => {
  const { store, projectId } = newProjectStore();
  addSession(store, projectId, "s1");
  queueIntent(store, projectId, "D", "h");
  queueIntent(store, projectId, "Q", "i");
  queueIntent(store, projectId, "N", "j");
  beginTurn(store, "s1", 1, "completed delivery", 1000);
  store.stampIntentDispatch("D", "s1", 1, 1000);
  finishTurn(store, "s1", 1, 2000);
  beginTurn(store, "s1", 2, "plan it", 3000);
  store.stampIntentDispatch("Q", "s1", 2, 3000);
  append(store, "s1", {
    type: "captain_telemetry",
    topic: "playbook.fsm.state",
    payload: { from: "planAnalysis", to: "awaitBossReply" },
    turnId: 2,
    timestamp: 3500,
  });
  finishTurn(store, "s1", 2, 4000);
  let ledger = fold(store, [lane("s1", projectId, false)]);
  assert.equal(stateOf(ledger, "Q").reason, "question");
  assert.equal(stateOf(ledger, "D").state, "finished");

  // Inspect the new dispatch before any machine state transition:
  // its start itself acknowledges the earlier question.
  beginTurn(store, "s1", 3, "start another intent", 5000);
  store.stampIntentDispatch("N", "s1", 3, 5000);
  ledger = fold(store, [lane("s1", projectId, true)]);
  assert.equal(stateOf(ledger, "N").state, "working");
  assert.equal(stateOf(ledger, "Q").state, "finished");
  assert.equal(stateOf(ledger, "D").state, "finished");
  assert.deepEqual(
    ledger.attention.map((entry) => [entry.kind, entry.intentId]),
    [["finish", "D"], ["finish", "Q"]],
  );
  assert.equal(store.getIntent("D")?.closedAt, undefined);
  store.close();
});

test("dashboard-10: a run dismissed while parked takes its question with it", () => {
  const { store, projectId } = newProjectStore();
  addSession(store, projectId, "s1");
  queueIntent(store, projectId, "Q", "i");
  beginTurn(store, "s1", 1, "plan it", 1000);
  store.stampIntentDispatch("Q", "s1", 1, 1000);
  const trace = (type: string, payload: Record<string, unknown>, timestamp: number) =>
    append(store, "s1", {
      type: "captain_telemetry",
      topic: "playbook.trace",
      payload: { schemaVersion: 3, sessionId: "run-dev", playbookId: "dev", type, payload },
      turnId: 1,
      timestamp,
    });
  trace("fsm.transition", { from: "planAnalysis", to: "awaitBossReply" }, 1400);
  append(store, "s1", {
    type: "captain_telemetry",
    topic: "playbook.fsm.state",
    payload: { from: "planAnalysis", to: "awaitBossReply" },
    turnId: 1,
    timestamp: 1500,
  });
  // Dismiss within this turn so no later Boss turn acknowledges the
  // question for us: disposal itself must prevent a standing question.
  trace("session.disposed", {}, 1800);
  finishTurn(store, "s1", 1, 2000);
  const ledger = fold(store, [lane("s1", projectId, false)]);
  assert.equal(stateOf(ledger, "Q").state, "finished");
  assert.equal(ledger.attention.some((entry) => entry.kind === "question"), false);
  store.close();
});
