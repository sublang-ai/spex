// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Integration coverage for the intent ledger (DR-035, core-service-42
// ..59): the stored intent files, the one derivation fold, and the
// protocol commands, driven end to end where a session is needed and
// against the store directly where the fold's contract is over stored
// state alone — restart-identical, arrival-order-independent.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { WebSocket } from "ws";

import { prefsFileOf, Store } from "./store.js";
import { foldLedger, type LiveLane } from "./ledger.js";
import { BOSS_ABORT_REASON, controlRecord } from "./control-record.js";
import { CoreService } from "./service.js";
import { parseSpecTree } from "./specs.js";
import { fakeAdapterImports } from "./testing/fake-adapter.js";
import { createScriptedCaptain } from "./testing/scripted-captain.js";
import { demoHistoryIntentId, seedHistorySession } from "./testing/demo.js";
import {
  UUID_PATTERN,
  type Command,
  type CommandResults,
  type DerivedIntent,
  type IntentInfo,
  type LedgerState,
  type ServerMessage,
  type TmuxPlayRecord,
} from "./protocol.js";
import { scratchDir } from "./testing/scratch.js";

// ---------------------------------------------------------------------------
// Store-level harness: the fold's contract is over stored rows, so a
// synthetic session written straight into the store is a legitimate
// subject — it is exactly what a restart rebuilds from.
// ---------------------------------------------------------------------------

const NOW = 10_000_000;
const OWN = "tester";

/** Intent and session ids are canonical lowercase UUIDs (storage-4); the
 * tests name them ("A", "s1"), and each name maps to one fixed UUID —
 * its bytes in the last group, so equal-length names keep their order.
 * A UUID passes through unchanged. */
function uid(name: string): string {
  if (UUID_PATTERN.test(name)) return name;
  const hex = Buffer.from(name, "utf8").toString("hex");
  assert.ok(hex.length <= 12, `test name ${name} is too long for a UUID`);
  return `00000000-0000-4000-8000-${hex.padStart(12, "0")}`;
}

function newProjectStore(path?: string): { store: Store; projectId: string } {
  const store = new Store(path ? { dir: path, own: OWN } : { own: OWN });
  const project = store.registerProject("/tmp/ledger-proj", "ledger-proj", 1);
  return { store, projectId: project.id };
}

function addSession(store: Store, projectId: string, id: string): void {
  store.createSession({
    id: uid(id),
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

/** The capture clock: each queued intent is younger than the last, so the
 * queue's age order is the order a test queues in (core-service-107). */
let captured = 10;

function queueIntent(
  store: Store,
  projectId: string,
  id: string,
  extra: Partial<IntentInfo> = {},
): IntentInfo {
  const intent: IntentInfo = {
    id: uid(id),
    projectId,
    text: `Intent ${id}\nthe staged Boss turn`,
    createdAt: (captured += 1),
    ...extra,
  };
  store.addIntent(intent);
  return intent;
}

function stamp(
  store: Store,
  intentId: string,
  sessionId: string,
  turnId: number,
  at: number,
): void {
  store.stampIntentDispatch(uid(intentId), uid(sessionId), turnId, at);
}

function append(
  store: Store,
  sessionId: string,
  record: Record<string, unknown>,
  role?: string,
): void {
  store.appendRecord(
    uid(sessionId),
    store.maxSeq(uid(sessionId)) + 1,
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
  store.startTurn(uid(sessionId), turnId, prompt, at);
  append(store, sessionId, {
    type: "turn_started",
    turnId,
    turn: { id: turnId, prompt },
    timestamp: at,
  });
}

function finishTurn(store: Store, sessionId: string, turnId: number, at: number): void {
  store.endTurn(uid(sessionId), turnId, "finished", at);
  append(store, sessionId, { type: "turn_finished", turnId, timestamp: at });
}

function abortStoredTurn(
  store: Store,
  sessionId: string,
  turnId: number,
  at: number,
  reason?: string,
): void {
  store.endTurn(uid(sessionId), turnId, "aborted", at);
  append(store, sessionId, {
    type: "turn_aborted",
    turnId,
    timestamp: at,
    ...(reason ? { reason } : {}),
  });
}

function lane(sessionId: string, projectId: string, turnActive: boolean): LiveLane {
  return { sessionId: uid(sessionId), projectId, turnActive };
}

function fold(store: Store, lanes: LiveLane[]): LedgerState {
  return foldLedger({ store, lanes, now: () => NOW });
}

function stateOf(ledger: LedgerState, intentId: string): DerivedIntent {
  const found = ledger.intents.find((entry) => entry.intent.id === uid(intentId));
  assert.ok(found, `intent ${intentId} missing from the fold`);
  return found;
}

function nextOf(ledger: LedgerState, projectId: string): DerivedIntent {
  const rows = ledger.intents.filter(
    (entry) => entry.intent.projectId === projectId && entry.next,
  );
  assert.equal(rows.length, 1, `expected exactly one next row in ${projectId}`);
  return rows[0] as DerivedIntent;
}

function markControl(
  store: Store,
  sessionId: string,
  turnId: number,
  kind: "recovery" | "ending",
  at: number,
): void {
  store.appendRecord(
    uid(sessionId),
    store.maxSeq(uid(sessionId)) + 1,
    controlRecord(turnId, kind, at),
  );
}

/** Write one session's stored records into its project's clone, as the
 * running core would have, so a reopened store rebuilds its turns. */
async function persistSession(store: Store, projectId: string, sessionId: string): Promise<void> {
  await seedHistorySession(
    store.repository(projectId)!.sessionsDir,
    "/tmp/ledger-proj",
    store.getRecords(uid(sessionId), { includeHidden: true }).map((entry) => entry.record as unknown as Record<string, unknown>),
    uid(sessionId),
  );
}

// ---------------------------------------------------------------------------
// Queue scheduling standing (core-service-49/95/107)
// ---------------------------------------------------------------------------

test("core-service-107: only the oldest queued row is next, by capture time then id", () => {
  const { store, projectId } = newProjectStore();
  const otherProject = store.registerProject(
    "/tmp/ledger-other",
    "ledger-other",
    2,
  );
  // Another project's older intent heads its own queue, never this one.
  queueIntent(store, otherProject.id, "P");
  addSession(store, projectId, "s1");
  // The oldest open intent here is dispatched and finished: not queued.
  queueIntent(store, projectId, "A");
  beginTurn(store, "s1", 1, "deliver A", 1000);
  stamp(store, "A", "s1", 1, 1000);
  finishTurn(store, "s1", 1, 2000);
  queueIntent(store, projectId, "B");
  // Captured in the same millisecond: the lower id is the older row.
  const tie = captured + 1;
  queueIntent(store, projectId, "D", { createdAt: tie });
  queueIntent(store, projectId, "C", { createdAt: tie });

  const ledger = fold(store, []);
  const rows = ledger.intents.filter(
    (entry) => entry.intent.projectId === projectId,
  );
  assert.deepEqual(
    rows.map((entry) => [entry.intent.id, entry.state]),
    [[uid("A"), "finished"], [uid("B"), "queued"], [uid("C"), "queued"], [uid("D"), "queued"]],
  );
  assert.deepEqual(
    rows.filter((entry) => entry.next).map((entry) => entry.intent.id),
    [uid("B")],
  );
  assert.deepEqual(nextOf(ledger, projectId).next, {
    standing: "manual-ready",
    manualStart: true,
  });
  assert.equal(nextOf(ledger, otherProject.id).intent.id, uid("P"));
  assert.equal(stateOf(ledger, "C").next, undefined);
  store.close();
});

test("core-service-107: the six scheduling standings derive from the ordered lane conditions", () => {
  const read = (
    prepare: (store: Store, projectId: string, sessionId: string) => void,
    activity: Partial<LiveLane> | undefined = {},
    withLane = true,
  ) => {
    const { store, projectId } = newProjectStore();
    const sessionId = "s1";
    addSession(store, projectId, sessionId);
    queueIntent(store, projectId, "N");
    prepare(store, projectId, sessionId);
    const lanes = withLane
      ? [{ ...lane(sessionId, projectId, false), ...activity }]
      : [];
    const schedule = nextOf(fold(store, lanes), projectId).next;
    store.close();
    return schedule;
  };

  assert.deepEqual(read(() => {}, {}, false), {
    standing: "manual-ready",
    manualStart: true,
  });
  assert.deepEqual(read(() => {}, { turnActive: true }), {
    standing: "after-current-work",
    manualStart: false,
  });
  assert.deepEqual(read(() => {}, { settling: true }), {
    standing: "after-current-work",
    manualStart: false,
  });

  const cause = {
    code: "commit-residual",
    evidence: { required: "one-commit" },
  };
  assert.deepEqual(read((store, _projectId, sessionId) => {
    beginTurn(store, sessionId, 1, "park on failure", 1000);
    append(store, sessionId, {
      type: "captain_status",
      turnId: 1,
      timestamp: 1200,
      data: { lastError: { cause } },
    });
    append(store, sessionId, {
      type: "captain_telemetry",
      topic: "playbook.trace",
      payload: {
        sessionId: "run-failure",
        type: "fsm.transition",
        payload: { from: "work", to: "failed", lastError: { cause } },
      },
      turnId: 1,
      timestamp: 1300,
    });
    append(store, sessionId, {
      type: "captain_telemetry",
      topic: "playbook.fsm.state",
      payload: { from: "work", to: "failed" },
      turnId: 1,
      timestamp: 1400,
    });
    finishTurn(store, sessionId, 1, 1500);
  }), { standing: "failure-park", manualStart: false, cause });

  assert.deepEqual(read((store, _projectId, sessionId) => {
    beginTurn(store, sessionId, 1, "ask", 1000);
    append(store, sessionId, {
      type: "captain_telemetry",
      topic: "playbook.fsm.state",
      payload: { from: "work", to: "awaitBossReply" },
      turnId: 1,
      timestamp: 1200,
    });
    finishTurn(store, sessionId, 1, 1500);
  }), { standing: "question-park", manualStart: false });

  assert.deepEqual(read((store, _projectId, sessionId) => {
    beginTurn(store, sessionId, 1, "fail without a park", 1000);
    append(store, sessionId, {
      type: "runtime_error",
      turnId: 1,
      timestamp: 1200,
      message: "failed",
      cause,
    });
    finishTurn(store, sessionId, 1, 1500);
  }), { standing: "failed", manualStart: true, cause });

  assert.deepEqual(read((store, _projectId, sessionId) => {
    beginTurn(store, sessionId, 1, "stop", 1000);
    append(store, sessionId, {
      type: "runtime_error",
      turnId: 1,
      timestamp: 1200,
      message: BOSS_ABORT_REASON,
    });
    abortStoredTurn(store, sessionId, 1, 1500, BOSS_ABORT_REASON);
  }), { standing: "stopped", manualStart: true });

  assert.deepEqual(read((store, _projectId, sessionId) => {
    beginTurn(store, sessionId, 1, "fail and abort", 1000);
    append(store, sessionId, {
      type: "runtime_error",
      turnId: 1,
      timestamp: 1100,
      message: "provider failed",
      cause,
    });
    append(store, sessionId, {
      type: "runtime_error",
      turnId: 1,
      timestamp: 1200,
      message: BOSS_ABORT_REASON,
    });
    abortStoredTurn(store, sessionId, 1, 1500, BOSS_ABORT_REASON);
  }), { standing: "failed", manualStart: true, cause });

  assert.deepEqual(read((store, _projectId, sessionId) => {
    beginTurn(store, sessionId, 1, "finish", 1000);
    append(store, sessionId, {
      type: "runtime_error",
      turnId: 1,
      timestamp: 1200,
      message: "hidden diagnostic",
      visibility: "hidden",
    });
    finishTurn(store, sessionId, 1, 1500);
  }), { standing: "manual-ready", manualStart: true });
});

test("core-service-107: failure park wins over question and stopped with its cause", () => {
  const { store, projectId } = newProjectStore();
  addSession(store, projectId, "s1");
  queueIntent(store, projectId, "N");
  beginTurn(store, "s1", 1, "several outcomes", 1000);
  const cause = { code: "commit-residual", evidence: { observed: "mixed" } };
  append(store, "s1", {
    type: "captain_telemetry",
    topic: "playbook.fsm.state",
    payload: { from: "work", to: "awaitBossReply" },
    turnId: 1,
    timestamp: 1100,
  });
  append(store, "s1", {
    type: "captain_status",
    turnId: 1,
    timestamp: 1200,
    data: { lastError: { cause } },
  });
  append(store, "s1", {
    type: "captain_telemetry",
    topic: "playbook.trace",
    payload: {
      sessionId: "run-failure",
      type: "fsm.transition",
      payload: { from: "work", to: "failed", lastError: { cause } },
    },
    turnId: 1,
    timestamp: 1300,
  });
  append(store, "s1", {
    type: "captain_telemetry",
    topic: "playbook.fsm.state",
    payload: { from: "work", to: "failed" },
    turnId: 1,
    timestamp: 1400,
  });
  abortStoredTurn(store, "s1", 1, 1500);

  assert.deepEqual(
    nextOf(fold(store, [{ ...lane("s1", projectId, false), settling: true }]), projectId).next,
    { standing: "after-current-work", manualStart: false },
  );
  assert.deepEqual(nextOf(fold(store, [lane("s1", projectId, false)]), projectId).next, {
    standing: "failure-park",
    manualStart: false,
    cause,
  });
  store.close();
});

test("core-service-107: when one failed run leaves, another park and its cause survive", () => {
  const { store, projectId } = newProjectStore();
  addSession(store, projectId, "s1");
  queueIntent(store, projectId, "N");
  beginTurn(store, "s1", 1, "two runs fail", 1000);
  const first = { code: "commit-residual", evidence: { run: "first" } };
  const survivor = { code: "receipt-missing", evidence: { run: "second" } };
  const park = (runId: string, cause: typeof first, at: number) => {
    append(store, "s1", {
      type: "captain_status",
      turnId: 1,
      timestamp: at,
      data: { lastError: { cause } },
    });
    append(store, "s1", {
      type: "captain_telemetry",
      topic: "playbook.trace",
      payload: {
        sessionId: runId,
        type: "fsm.transition",
        payload: { from: "work", to: "failed" },
      },
      turnId: 1,
      timestamp: at + 1,
    });
    append(store, "s1", {
      type: "captain_telemetry",
      topic: "playbook.fsm.state",
      payload: { from: "work", to: "failed" },
      turnId: 1,
      timestamp: at + 2,
    });
  };
  park("run-first", first, 1100);
  park("run-second", survivor, 1200);
  finishTurn(store, "s1", 1, 1500);
  append(store, "s1", {
    type: "captain_telemetry",
    topic: "playbook.trace",
    payload: { sessionId: "run-first", type: "session.disposed" },
    turnId: 1,
    timestamp: 1600,
  });

  assert.deepEqual(nextOf(fold(store, [lane("s1", projectId, false)]), projectId).next, {
    standing: "failure-park",
    manualStart: false,
    cause: survivor,
  });
  store.close();
});

test("core-service-49/107: a failure never inherits an earlier failure's cause", () => {
  const { store, projectId } = newProjectStore();
  addSession(store, projectId, "s1");
  queueIntent(store, projectId, "N");
  beginTurn(store, "s1", 1, "fail twice", 1000);
  const oldCause = { code: "commit-residual", evidence: { run: "old" } };
  append(store, "s1", {
    type: "runtime_error",
    turnId: 1,
    timestamp: 1100,
    message: "first failure",
    cause: oldCause,
  });
  append(store, "s1", {
    type: "runtime_error",
    turnId: 1,
    timestamp: 1200,
    message: "second failure stated no cause",
  });
  finishTurn(store, "s1", 1, 1300);
  assert.deepEqual(nextOf(fold(store, [lane("s1", projectId, false)]), projectId).next, {
    standing: "failed",
    manualStart: true,
  });
  store.close();
});

test("core-service-49/107: duplicate and aggregate evidence cannot create a phantom failure park", () => {
  const { store, projectId } = newProjectStore();
  addSession(store, projectId, "s1");
  queueIntent(store, projectId, "N");
  beginTurn(store, "s1", 1, "two parked failures", 1000);
  const oldCause = { code: "commit-residual", evidence: { run: "old" } };
  append(store, "s1", {
    type: "captain_telemetry",
    topic: "playbook.trace",
    payload: {
      sessionId: "run-old",
      type: "fsm.transition",
      payload: { from: "work", to: "failed", cause: oldCause },
    },
    turnId: 1,
    timestamp: 1100,
  });
  // A duplicate aggregate status still belongs to run-old; it must not
  // wait around to label the next run.
  append(store, "s1", {
    type: "captain_status",
    turnId: 1,
    timestamp: 1110,
    data: { lastError: { cause: oldCause } },
  });
  append(store, "s1", {
    type: "captain_telemetry",
    topic: "playbook.trace",
    payload: {
      sessionId: "run-new",
      type: "fsm.transition",
      payload: { from: "work", to: "failed" },
    },
    turnId: 1,
    timestamp: 1200,
  });
  append(store, "s1", {
    type: "captain_telemetry",
    topic: "playbook.trace",
    payload: { sessionId: "run-old", type: "session.disposed" },
    turnId: 1,
    timestamp: 1300,
  });
  finishTurn(store, "s1", 1, 1400);
  assert.deepEqual(nextOf(fold(store, [lane("s1", projectId, false)]), projectId).next, {
    standing: "failure-park",
    manualStart: false,
  });

  // An aggregate report may precede the identified trace. Once that
  // trace leaves, the fallback must not resurrect as a phantom park.
  append(store, "s1", {
    type: "captain_telemetry",
    topic: "playbook.trace",
    payload: {
      sessionId: "run-new",
      type: "fsm.transition",
      payload: { from: "failed", to: "work" },
    },
    turnId: 1,
    timestamp: 1450,
  });
  const aggregateCause = { code: "receipt-missing", evidence: { run: "aggregate-first" } };
  append(store, "s1", {
    type: "captain_status",
    turnId: 1,
    timestamp: 1490,
    data: { lastError: { cause: aggregateCause } },
  });
  append(store, "s1", {
    type: "captain_telemetry",
    topic: "playbook.fsm.state",
    payload: { from: "work", to: "failed" },
    turnId: 1,
    timestamp: 1500,
  });
  append(store, "s1", {
    type: "captain_telemetry",
    topic: "playbook.trace",
    payload: {
      sessionId: "run-phantom",
      type: "fsm.transition",
      payload: { from: "work", to: "failed" },
    },
    turnId: 1,
    timestamp: 1510,
  });
  assert.deepEqual(nextOf(fold(store, [lane("s1", projectId, false)]), projectId).next, {
    standing: "failure-park",
    manualStart: false,
    cause: aggregateCause,
  });
  append(store, "s1", {
    type: "captain_telemetry",
    topic: "playbook.trace",
    payload: {
      sessionId: "run-phantom",
      type: "fsm.transition",
      payload: { from: "failed", to: "work" },
    },
    turnId: 1,
    timestamp: 1600,
  });
  assert.deepEqual(nextOf(fold(store, [lane("s1", projectId, false)]), projectId).next, {
    standing: "manual-ready",
    manualStart: true,
  });
  store.close();
});

test("core-service-107: a durable ending marker makes a finished turn stopped", () => {
  const { store, projectId } = newProjectStore();
  addSession(store, projectId, "s1");
  queueIntent(store, projectId, "N");
  beginTurn(store, "s1", 1, "Stop /code", 1000);
  finishTurn(store, "s1", 1, 1500);
  markControl(store, "s1", 1, "ending", 1600);

  const expected = {
    standing: "stopped",
    manualStart: true,
  } as const;
  assert.deepEqual(nextOf(fold(store, [lane("s1", projectId, false)]), projectId).next, expected);
  store.close();
});

// ---------------------------------------------------------------------------
// Derived states over a synthetic session (core-service-47/49)
// ---------------------------------------------------------------------------

test("DR-035: dispatch derives working, a finish delivers, a follow-up reopens work", () => {
  const { store, projectId } = newProjectStore();
  addSession(store, projectId, "s1");
  queueIntent(store, projectId, "A");

  // The dispatch stamp binds when the submitted turn starts.
  beginTurn(store, "s1", 1, "ship the ledger", 1000);
  stamp(store, "A", "s1", 1, 1000);
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
      intentId: uid("A"),
      title: "Intent A",
      projectId,
      sessionId: uid("s1"),
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

test("DR-035: an aborted dispatch turn or a dead session releases the intent, stamps and place by age kept", () => {
  const { store, projectId } = newProjectStore();
  addSession(store, projectId, "s1");
  addSession(store, projectId, "s2");

  // Dispatch turn ends aborted: released by derivation.
  queueIntent(store, projectId, "A");
  beginTurn(store, "s1", 1, "go", 1000);
  stamp(store, "A", "s1", 1, 1000);
  abortStoredTurn(store, "s1", 1, 2000);

  // Session died before the dispatch turn finished: released too.
  queueIntent(store, projectId, "B");
  beginTurn(store, "s2", 1, "go", 3000);
  stamp(store, "B", "s2", 1, 3000);

  const ledger = fold(store, [lane("s1", projectId, false)]);
  const a = stateOf(ledger, "A");
  assert.equal(a.state, "queued");
  assert.ok(a.intent.dispatched, "the stamps remain as history");
  const b = stateOf(ledger, "B");
  assert.equal(b.state, "queued");
  assert.ok(b.intent.dispatched);
  // Each keeps its place by age: the older release is next (core-service-47).
  assert.deepEqual(ledger.intents.map((entry) => entry.intent.id), [uid("A"), uid("B")]);
  assert.equal(nextOf(ledger, projectId).intent.id, uid("A"));
  assert.equal(ledger.badge, 0, "a released dispatch summons nobody");
  store.close();
});

// ---------------------------------------------------------------------------
// Interruptions (core-service-49 band one)
// ---------------------------------------------------------------------------

test("DR-035: a parked awaitBossReply derives interrupted question in band one", () => {
  const { store, projectId } = newProjectStore();
  addSession(store, projectId, "s1");
  queueIntent(store, projectId, "Q");
  beginTurn(store, "s1", 1, "ask around", 1000);
  stamp(store, "Q", "s1", 1, 1000);
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
    [["interrupted", "question", uid("Q"), 1500]],
  );
  store.close();
});

test("DR-066: a permission request raises no entry — nothing answers one", () => {
  const { store, projectId } = newProjectStore();
  addSession(store, projectId, "s1");
  queueIntent(store, projectId, "P");
  beginTurn(store, "s1", 1, "build it", 1000);
  stamp(store, "P", "s1", 1, 1000);
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

test("DR-066: a project whose store refuses its acts raises no summons", async () => {
  const dir = scratchDir("spex-ledger-blocked-");
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
  await persistSession(store, projectId, "s1");
  store.close();

  // The same stored session summons after a restart while the store
  // can answer it ...
  const healthy = new Store({ dir });
  await healthy.initializeSessions();
  assert.deepEqual(
    fold(healthy, live).attention.map((entry) => entry.kind),
    ["review"],
    "the stored turn summons on its own",
  );
  healthy.close();

  // ... but damaged preferences fold every marker to -1 while refusing
  // every write, so the summons would stand with no act able to clear it.
  mkdirSync(dirname(prefsFileOf(dir)), { recursive: true });
  writeFileSync(prefsFileOf(dir), "{bad JSON}");
  const reopened = new Store({ dir });
  await reopened.initializeSessions();
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
  queueIntent(store, projectId, "F");
  beginTurn(store, "s1", 1, "try it", 1000);
  stamp(store, "F", "s1", 1, 1000);
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
    [["interrupted", "failure", uid("F"), 1500]],
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
  queueIntent(store, projectId, "P");
  beginTurn(store, "s1", 1, "run it", 1000);
  stamp(store, "P", "s1", 1, 1000);
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
  queueIntent(store, projectId, "X");
  beginTurn(store, "s1", 1, "everything at once", 1000);
  stamp(store, "X", "s1", 1, 1000);
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
  queueIntent(store, projectId, "A");
  beginTurn(store, "s1", 1, "done early", 400);
  stamp(store, "A", "s1", 1, 400);
  finishTurn(store, "s1", 1, 500);

  // Interrupted question since 800.
  queueIntent(store, projectId, "B");
  beginTurn(store, "s2", 1, "ask", 600);
  stamp(store, "B", "s2", 1, 600);
  append(store, "s2", {
    type: "captain_telemetry",
    topic: "playbook.fsm.state",
    payload: { to: "awaitBossReply" },
    turnId: 1,
    timestamp: 800,
  });
  finishTurn(store, "s2", 1, 900);

  // Interrupted failure since 1500 — later onset, same band.
  queueIntent(store, projectId, "C");
  beginTurn(store, "s3", 1, "fail", 1000);
  stamp(store, "C", "s3", 1, 1000);
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
      ["interrupted", "question", uid("B"), 800],
      ["interrupted", "failure", uid("C"), 1500],
      ["finished", "finish", uid("A"), 500],
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
  queueIntent(store, projectId, "A");
  beginTurn(store, "s1", 1, "first", 1000);
  stamp(store, "A", "s1", 1, 1000);
  finishTurn(store, "s1", 1, 2000);
  beginTurn(store, "s1", 2, "follow-up", 3000);
  finishTurn(store, "s1", 2, 4000);
  queueIntent(store, projectId, "B");
  beginTurn(store, "s1", 3, "second", 5000);
  stamp(store, "B", "s1", 3, 5000);
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
      [uid("A"), 2, 4000],
      [uid("B"), 3, 6000],
    ],
  );
  store.close();
});

test("DR-035: an aborted follow-up does not unseat a standing finish", () => {
  const { store, projectId } = newProjectStore();
  addSession(store, projectId, "s1");
  queueIntent(store, projectId, "C");
  beginTurn(store, "s1", 1, "deliver", 1000);
  stamp(store, "C", "s1", 1, 1000);
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
  queueIntent(store, projectId, "A");
  beginTurn(store, "s1", 1, "Intent A", 1000);
  stamp(store, "A", "s1", 1, 1000);
  finishTurn(store, "s1", 1, 2000);
  const lanes = [lane("s1", projectId, false)];

  // Finished intent: its own attention entry, no review stand-in.
  const finished = fold(store, lanes);
  assert.deepEqual(
    finished.attention.map((entry) => entry.kind),
    ["finish"],
  );

  // The verdict settles the turn: no stand-in resurrects it.
  store.closeIntent(uid("A"), "done", 2500);
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
      sessionId: uid("s1"),
      turnId: 1,
      since: 2000,
    },
  ]);
  assert.equal(before.badge, 1);

  // The persisted viewed marker clears the stand-in.
  store.setPref(`viewed:${uid("s1")}`, 1);
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
  const dir = scratchDir("spex-ledger-");
  const path = join(dir, "state");
  const { store, projectId } = newProjectStore(path);
  addSession(store, projectId, ids.s1);
  addSession(store, projectId, ids.s2);

  queueIntent(store, projectId, ids.closed);
  store.closeIntent(ids.closed, "dropped", 500);
  queueIntent(store, projectId, ids.queued);
  queueIntent(store, projectId, ids.finished);
  beginTurn(store, ids.s1, 1, "deliver", 1000);
  store.stampIntentDispatch(ids.finished, ids.s1, 1, 1000);
  finishTurn(store, ids.s1, 1, 2000);
  queueIntent(store, projectId, ids.working);
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
  await persistSession(store, projectId, ids.s1);
  await persistSession(store, projectId, ids.s2);
  store.close();

  // Restart: same files, no live lanes.
  const reopened = new Store({ dir: path });
  await reopened.initializeSessions();
  const after = fold(reopened, []);
  const queued = stateOf(after, ids.queued);
  assert.equal(queued.state, "queued");
  assert.deepEqual(queued.intent, stateOf(before, ids.queued).intent);
  // Finished persists: it derives from ended turns, not from a lane.
  assert.deepEqual(
    stateOf(after, ids.finished),
    stateOf(before, ids.finished),
    "the finished derivation is restart-identical",
  );
  assert.deepEqual(after.attention, before.attention);
  // The mid-turn dispatch releases: its session died before the turn
  // finished. Its stamps stay, and it keeps its place by age behind
  // the older queued intent, which stays next.
  const released = stateOf(after, ids.working);
  assert.equal(released.state, "queued");
  assert.ok(released.intent.dispatched);
  assert.deepEqual(
    after.intents.map((entry) => entry.intent.id),
    [ids.queued, ids.finished, ids.working],
  );
  assert.equal(nextOf(after, projectId).intent.id, ids.queued);
  // The closed intent's file is kept and read back closed.
  assert.equal(reopened.getIntent(ids.closed)?.closedAs, "dropped");
  reopened.close();
});

test("core-service-79: a remove deletes a closed intent's file and attachments, retiring it from every read, its turns going to the preceding dispatch", async () => {
  const ids = { s1: "73000000-0000-4000-8000-000000000001", gone: "73000000-0000-4000-8000-000000000002", kept: "73000000-0000-4000-8000-000000000003", first: "73000000-0000-4000-8000-000000000004" };
  const dir = scratchDir("spex-ledger-remove-");
  const path = join(dir, "state");
  const { store, projectId } = newProjectStore(path);
  const intentsDir = store.repository(projectId)!.intentsDir;
  addSession(store, projectId, ids.s1);

  // An earlier dispatched intent still awaiting its verdict, then a
  // worked, confirmed intent with an attachment of its own, and a
  // queued bystander.
  queueIntent(store, projectId, ids.first);
  beginTurn(store, ids.s1, 1, "the first delivery", 1000);
  store.stampIntentDispatch(ids.first, ids.s1, 1, 1000);
  finishTurn(store, ids.s1, 1, 2000);
  queueIntent(store, projectId, ids.gone, {
    source: { kind: "issue", ref: "9" },
  });
  mkdirSync(store.intentAssetsDir(ids.gone), { recursive: true });
  writeFileSync(join(store.intentAssetsDir(ids.gone), "evidence.txt"), "kept with the intent");
  beginTurn(store, ids.s1, 2, "hello hello hello", 3000);
  store.stampIntentDispatch(ids.gone, ids.s1, 2, 3000);
  finishTurn(store, ids.s1, 2, 4000);
  store.closeIntent(ids.gone, "done", 4500);
  queueIntent(store, projectId, ids.kept);

  const lanes = [lane(ids.s1, projectId, false)];
  const before = fold(store, lanes);
  assert.deepEqual(
    store.listClosedIntents(projectId, 20).map((intent) => intent.id),
    [ids.gone],
  );
  // The removed intent's dispatch bounds the first one's range today.
  assert.deepEqual(stateOf(before, ids.first).stats, { turns: 1, elapsedMs: 1000 });
  assert.deepEqual(
    before.attention.map((entry) => [entry.kind, entry.intentId, entry.turnId, entry.since]),
    [["finish", ids.first, 1, 2000]],
  );
  assert.ok(existsSync(join(intentsDir, `${ids.gone}.json`)));

  store.removeIntent(ids.gone, 5000);
  // The session's viewed marker advanced past its last ended turn.
  assert.equal(store.getPref(`viewed:${ids.s1}`), 2);

  // The file and its attachments go (storage-4) ...
  assert.ok(!existsSync(join(intentsDir, `${ids.gone}.json`)), "the intent's file is deleted");
  assert.ok(!existsSync(join(intentsDir, `${ids.gone}.assets`)), "its attachments go with it");
  // ... so it is absent from every read: the History page, the source
  // binding, and the fold's own rows.
  assert.equal(store.getIntent(ids.gone), undefined);
  assert.deepEqual(store.listClosedIntents(projectId, 20), []);
  assert.equal(store.openIntentBySource(projectId, "issue", "9"), undefined);
  const after = fold(store, lanes);
  assert.ok(
    !after.intents.some((entry) => entry.intent.id === ids.gone),
    "a removed intent lists in no band",
  );
  // Its stamp no longer bounds its neighbours' turn ranges: the
  // preceding dispatched intent owns the removed one's turns.
  assert.equal(stateOf(after, ids.first).state, "finished");
  assert.deepEqual(stateOf(after, ids.first).stats, { turns: 2, elapsedMs: 3000 });
  assert.deepEqual(
    after.attention.map((entry) => [entry.kind, entry.intentId, entry.turnId, entry.since]),
    [["finish", ids.first, 2, 4000]],
  );
  assert.equal(stateOf(after, ids.kept).state, "queued");
  await persistSession(store, projectId, ids.s1);
  store.close();

  // Restart: the reopened store reads it as absent all the same.
  const reopened = new Store({ dir: path });
  await reopened.initializeSessions();
  assert.equal(reopened.getIntent(ids.gone), undefined);
  assert.deepEqual(reopened.listClosedIntents(projectId, 20), []);
  const reread = fold(reopened, []);
  assert.deepEqual(stateOf(reread, ids.first).stats, { turns: 2, elapsedMs: 3000 });
  assert.equal(stateOf(reread, ids.kept).state, "queued");
  assert.deepEqual(readdirSync(intentsDir).sort(), [`${ids.kept}.json`, `${ids.first}.json`].sort());

  // A later intent worked after the first's verdict and then removed:
  // its turn passes to no open dispatch, so the viewed marker advances
  // past its last ended turn first and work already ruled on summons no
  // review.
  const late = "73000000-0000-4000-8000-000000000005";
  const laneOf = [lane(ids.s1, projectId, false)];
  reopened.closeIntent(ids.first, "done", 5500);
  queueIntent(reopened, projectId, late);
  beginTurn(reopened, ids.s1, 3, "late work", 6000);
  reopened.stampIntentDispatch(late, ids.s1, 3, 6000);
  finishTurn(reopened, ids.s1, 3, 7000);
  reopened.closeIntent(late, "done", 7500);
  assert.ok(!fold(reopened, laneOf).attention.some((entry) => entry.sessionId === ids.s1), "a ruled turn raises nothing");
  assert.equal(reopened.getPref(`viewed:${ids.s1}`), 2);
  reopened.removeIntent(late, 8000);
  assert.equal(reopened.getPref(`viewed:${ids.s1}`), 3);
  assert.deepEqual(fold(reopened, laneOf).attention.filter((entry) => entry.sessionId === ids.s1), [], "no review returns");
  reopened.close();
});

// ---------------------------------------------------------------------------
// Specs record status (DR-035: specs.get carries the Status line)
// ---------------------------------------------------------------------------

test("DR-035: intent records serve their Status line verbatim, or none", () => {
  const dir = scratchDir("spex-ledger-specs-");
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
    roles:
      coder: dev_coder
  review:
    roles:
      coder: dev_coder
      reviewer: dev_coder
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

  private lastCaptured = 0;

  /** `intent.queue` a moment after the previous capture: the queue is
   * ordered by capture time (core-service-42), so no two captures here
   * share a millisecond and the order is the order queued. */
  async queue(
    fields: Omit<Extract<Command, { type: "intent.queue" }>, "type" | "id">,
  ): Promise<IntentInfo> {
    while (Date.now() <= this.lastCaptured) await sleep(1);
    const intent = await this.expectOk("intent.queue", fields);
    this.lastCaptured = intent.createdAt;
    return intent;
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
  readonly service: CoreService;
  dir: string;
  dataDir: string;
  projectDir: string;
  restart(): Promise<void>;
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
  const dir = scratchDir("spex-ledger-it-");
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
      // Long enough that the turn's start and finish broadcasts never
      // share one debounce window (core-service-53).
      {
        match: "hold:",
        response: { deltas: ["working"], result: "held done", delayMs: 1500 },
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

  const serviceOptions = {
    token: "test",
    configPath,
    dataDir,
    adapterImports: imports,
    adapterRuntime: () => ({ usable: true }),
    captainFactory: async () => captain,
    env: {},
    home: join(dir, "home"),
    own: OWN,
    watchConfig: false,
  };
  let service = await CoreService.start(serviceOptions);
  return {
    get service() { return service; },
    dir,
    dataDir,
    projectDir,
    async restart() {
      await service.stop();
      service = await CoreService.start(serviceOptions);
    },
  };
}

/** The one project's open intents, oldest first, as intent ids. */
function queueIds(ledger: LedgerState, projectId: string): string[] {
  return ledger.intents
    .filter((entry) => entry.intent.projectId === projectId)
    .map((entry) => entry.intent.id);
}

/** The storage-4 field set an intent file may hold, and nothing else. */
const INTENT_FILE_FIELDS = new Set([
  "format", "id", "text", "attachments", "source", "author", "createdAt", "dispatched", "closed",
]);

function readIntentFile(intentsDir: string, id: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(intentsDir, `${id}.json`), "utf8")) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// core-service-42..46/55: queue order, dedup, and close mechanics
// ---------------------------------------------------------------------------

test("core-service-42..46: intent commands keep age order, dedup, and close guards", async () => {
  const harness = await startHarness();
  const client = new Client(harness.service.port());
  await client.open();
  const project = await client.expectOk("project.register", {
    path: harness.projectDir,
  });

  // An intent holds no place of its own: the queue is oldest first.
  const a = await client.queue({
    projectId: project.id,
    text: "Alpha intent\nthe full staged text",
  });
  const b = await client.queue({
    projectId: project.id,
    text: "Beta intent",
  });
  const c = await client.queue({
    projectId: project.id,
    text: "Gamma intent",
  });
  const ledger = await client.expectOk("ledger.get", {});
  assert.deepEqual(queueIds(ledger, project.id), [a.id, b.id, c.id]);
  assert.equal(nextOf(ledger, project.id).intent.id, a.id);

  // Every write announces itself (core-service-51, debounced).
  await client.waitFor(
    (m) => m.type === "intents.changed" && m.projectIds.includes(project.id),
  );

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
  assert.equal(edited.createdAt, b.createdAt, "an edit keeps the intent's place by age");

  // done requires a finished intent; dropped is legal on any open one
  // (core-service-46). Dropped before any work, the intent is gone, so
  // a second close finds nothing to close.
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
  assert.ok(!reClose.ok && reClose.error.code === "not_found");
  // The oldest of what remains is next (core-service-107).
  const afterDrop = await client.expectOk("ledger.get", {});
  assert.equal(nextOf(afterDrop, project.id).intent.id, a.id);
  assert.ok(!queueIds(afterDrop, project.id).includes(c.id));

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
 * the real Captain shell keeps the root its decision engaged. The next
 * turn — a Drop's ending — narrates that parked run's disposal inside
 * the turn, as the runtime reports a run it ends: a Boss turn starting
 * no longer clears a question by itself (DR-085). */
function parkingCaptain(): Parameters<typeof createScriptedCaptain>[0] {
  let turns = 0;
  return async (turn, context, session) => {
    turns += 1;
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
    if (turns > 1) {
      if (turns === 2) await trace("session.disposed", {}, 3);
      return;
    }
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
    let client = new Client(harness.service.port());
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
    // park stops standing for every consumer at once. The shell's own
    // engaged root counts here, not the fixture's narrated one.
    const { records } = await client.expectOk("history.get", {
      sessionId: session.id,
    });
    const disposed = records.filter(({ record }) => {
      const entry = record as unknown as {
        type: string;
        topic?: string;
        turnId: number | null;
        payload?: { type?: string; playbookId?: string; sessionId?: string };
      };
      return (
        entry.type === "captain_telemetry" &&
        entry.topic === "playbook.trace" &&
        entry.payload?.type === "session.disposed" &&
        entry.payload.playbookId === "code" &&
        entry.payload.sessionId !== "root-code" &&
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
    const successor = stateOf(after, untouched.id);
    assert.equal(successor.state, "queued");
    assert.equal(successor.intent.dispatched, undefined);
    assert.deepEqual(successor.next, {
      standing: "stopped",
      manualStart: true,
    });
    const history = await client.expectOk("ledger.history", {
      projectId: project.id,
    });
    assert.deepEqual(
      history.intents.map((row) => [row.intent.id, row.intent.closedAs]),
      [[parked.id, "dropped"]],
    );

    // The control kind is durable execution evidence. Restarting the
    // service must retain the stopped standing instead of reducing the
    // finished ending turn to a clean handoff.
    client.close();
    await harness.restart();
    client = new Client(harness.service.port());
    await client.open();
    const restarted = stateOf(
      await client.expectOk("ledger.get", {}),
      untouched.id,
    );
    assert.deepEqual(restarted.next, {
      standing: "stopped",
      manualStart: true,
    });

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
      // Playbook 17 settles an abort at its saved progress, so the
      // aborted conversation continues as a finished one does
      // (core-service-6, DR-088).
      assert.ok(reply.ok, JSON.stringify(reply));
      if (admission === "message") {
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

test("core-service-53: an intent lives as one file of its spex repository through queue, edit, dispatch, finish, close, and remove", { timeout: 30_000 }, async () => {
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
  // The project's spex repository is its clone under the home's
  // workspace; its intents are files there (DR-103).
  const intentsDir = harness.service["store"].repository(project.id)!.intentsDir;
  assert.equal(intentsDir, join(harness.dataDir, "workspace", ...project.id.split("/"), "intents"));

  /** Run one act, then wait for the `intents.changed` naming the project
   * that follows it (core-service-51). Waiting out the debounce first
   * leaves no earlier broadcast pending to answer for this one. */
  const announced = async <T>(act: () => Promise<T>): Promise<T> => {
    await sleep(250);
    const mark = client.messages.length;
    const result = await act();
    await client.waitFor((m) =>
      client.messages.indexOf(m) >= mark &&
      m.type === "intents.changed" &&
      m.projectIds.includes(project.id)
    );
    return result;
  };

  // Two intents captured a moment apart: each is one file holding
  // exactly storage-4's fields, and the queue reads them oldest first
  // with the oldest next (core-service-42, core-service-49, core-service-52).
  const first = await announced(() => client.queue({
    projectId: project.id,
    text: "Ship the ledger\nwith its fold",
  }));
  const second = await announced(() => client.queue({
    projectId: project.id,
    text: "Polish the ledger",
  }));
  assert.ok(first.createdAt < second.createdAt);
  for (const intent of [first, second]) {
    assert.match(intent.id, UUID_PATTERN);
    assert.deepEqual(readIntentFile(intentsDir, intent.id), {
      format: 1,
      id: intent.id,
      text: intent.text,
      createdAt: intent.createdAt,
    });
  }
  assert.deepEqual(readdirSync(intentsDir).sort(), [`${first.id}.json`, `${second.id}.json`].sort());
  let ledger = await client.expectOk("ledger.get", {});
  assert.deepEqual(queueIds(ledger, project.id), [first.id, second.id]);
  assert.equal(nextOf(ledger, project.id).intent.id, first.id);

  // An edit lands while the intent is queued, rewriting its file whole
  // (core-service-43).
  const edited = await announced(() => client.expectOk("intent.edit", {
    intentId: first.id,
    text: "Ship the ledger\nwith its fold, sharpened",
  }));
  assert.equal(edited.text, "Ship the ledger\nwith its fold, sharpened");
  assert.deepEqual(readIntentFile(intentsDir, first.id), {
    format: 1,
    id: first.id,
    text: edited.text,
    createdAt: first.createdAt,
  });

  // Dropped while still queued, before any work: its file goes with it,
  // and no History page will list it (core-service-46, core-service-50).
  const dropped = await announced(() => client.expectOk("intent.close", {
    intentId: second.id,
    as: "dropped",
  }));
  assert.equal(dropped.closedAs, "dropped");
  assert.ok(!existsSync(join(intentsDir, `${second.id}.json`)));
  ledger = await client.expectOk("ledger.get", {});
  assert.deepEqual(queueIds(ledger, project.id), [first.id]);

  // Dispatch: the turn's start stamps the file and is announced
  // (core-service-47, core-service-51).
  await sleep(250);
  const beforeStart = client.messages.length;
  await client.expectOk("turn.submit", {
    sessionId: session.id,
    text: "hold: ship it",
    intentId: first.id,
  });
  const started = await client.waitFor(
    (m) => m.type === "record" && m.record.type === "turn_started",
  );
  const startedTurnId =
    started.type === "record"
      ? (started.record as unknown as { turn: { id: number } }).turn.id
      : -1;
  await client.waitFor((m) =>
    client.messages.indexOf(m) >= beforeStart &&
    m.type === "intents.changed" &&
    m.projectIds.includes(project.id)
  );
  const stamped = readIntentFile(intentsDir, first.id).dispatched as
    { sessionId: string; turnId: number; at: number } | undefined;
  assert.equal(stamped?.sessionId, session.id);
  assert.equal(stamped?.turnId, startedTurnId);
  assert.equal(typeof stamped?.at, "number");
  ledger = await client.expectOk("ledger.get", {});
  assert.equal(stateOf(ledger, first.id).state, "working");

  // From its dispatch on, the text is history, and done waits for the
  // finish (core-service-43, core-service-46).
  const editDispatched = await client.command("intent.edit", {
    intentId: first.id,
    text: "rewrite history",
  });
  assert.ok(!editDispatched.ok && editDispatched.error.code === "conflict");
  const doneEarly = await client.command("intent.close", {
    intentId: first.id,
    as: "done",
  });
  assert.ok(!doneEarly.ok && doneEarly.error.code === "conflict");
  assert.equal(readIntentFile(intentsDir, first.id).text, edited.text);
  assert.equal(readIntentFile(intentsDir, first.id).closed, undefined);

  // The finish is announced too.
  const finished = await client.waitFor(
    (m) => m.type === "record" && m.record.type === "turn_finished",
  );
  const afterFinish = client.messages.indexOf(finished);
  await client.waitFor((m) =>
    client.messages.indexOf(m) > afterFinish &&
    m.type === "intents.changed" &&
    m.projectIds.includes(project.id)
  );
  await client.ledgerUntil(
    (state) => state.intents.find((entry) => entry.intent.id === first.id)?.state === "finished",
    "the dispatched intent to finish",
  );
  await settledTurns(client, harness, session.id, 1);
  await Promise.all([...harness.service["advancing"]]);

  // done after the finish: the verdict is written on the file, History
  // lists the done intent but never the one dropped before work, and a
  // second close is refused (core-service-46, core-service-50).
  const done = await announced(() => client.expectOk("intent.close", {
    intentId: first.id,
    as: "done",
  }));
  assert.equal(done.closedAs, "done");
  const closedFile = readIntentFile(intentsDir, first.id);
  assert.deepEqual(closedFile.closed, { as: "done", at: done.closedAt });
  for (const key of Object.keys(closedFile)) assert.ok(INTENT_FILE_FIELDS.has(key), key);
  let history = await client.expectOk("ledger.history", { projectId: project.id });
  assert.deepEqual(
    history.intents.map((row) => [row.intent.id, row.intent.closedAs]),
    [[first.id, "done"]],
  );
  const reClose = await client.command("intent.close", {
    intentId: first.id,
    as: "dropped",
  });
  assert.ok(!reClose.ok && reClose.error.code === "conflict");

  // A later intent worked in the same conversation, still open.
  const open = await announced(() => client.queue({
    projectId: project.id,
    text: "Still awaiting its verdict",
  }));
  await client.expectOk("turn.submit", {
    sessionId: session.id,
    text: open.text,
    intentId: open.id,
  });
  await client.ledgerUntil(
    (state) => state.intents.find((entry) => entry.intent.id === open.id)?.state === "finished",
    "the later intent to finish",
  );
  await settledTurns(client, harness, session.id, 2);
  await Promise.all([...harness.service["advancing"]]);

  // Removing an open intent is refused; removing the done one deletes
  // its file, takes it out of every History page, and leaves the rest
  // of the ledger as it was; an unknown or already-removed one is
  // refused not_found (core-service-79).
  const openRemove = await client.command("intent.remove", { intentId: open.id });
  assert.ok(!openRemove.ok && openRemove.error.code === "conflict");
  assert.match(openRemove.error.message, /closed/);
  const beforeRemove = await client.expectOk("ledger.get", {});
  await announced(() => client.expectOk("intent.remove", { intentId: first.id }));
  assert.ok(!existsSync(join(intentsDir, `${first.id}.json`)));
  history = await client.expectOk("ledger.history", { projectId: project.id });
  assert.deepEqual(history.intents, []);
  assert.deepEqual(await client.expectOk("ledger.get", {}), beforeRemove);
  const twice = await client.command("intent.remove", { intentId: first.id });
  assert.ok(!twice.ok && twice.error.code === "not_found");
  const unknown = await client.command("intent.remove", { intentId: randomUUID() });
  assert.ok(!unknown.ok && unknown.error.code === "not_found");
  assert.deepEqual(readdirSync(intentsDir), [`${open.id}.json`]);

  client.close();
  await harness.service.stop();
});

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
  const turnStarts = () => client.messages.filter(
    (m) => m.type === "record" && m.record.type === "turn_started",
  ).length;

  // Another project's intent is rejected at submission and starts no turn.
  const otherDir = join(harness.dir, "other");
  mkdirSync(otherDir);
  execFileSync("git", ["init", "-q", otherDir]);
  const other = await client.expectOk("project.register", { path: otherDir });
  const foreign = await client.queue({
    projectId: other.id,
    text: "Foreign intent",
  });
  const foreignSubmit = await client.command("turn.submit", {
    sessionId: session.id,
    text: "x",
    intentId: foreign.id,
  });
  assert.ok(!foreignSubmit.ok && foreignSubmit.error.code === "invalid_request");

  // The rejection started no turn: the real dispatch is accepted.
  const i1 = await client.queue({
    projectId: project.id,
    text: "Run the build",
  });
  await client.expectOk("turn.submit", {
    sessionId: session.id,
    text: "hold: run",
    intentId: i1.id,
  });
  const started = await client.waitFor(
    (m) => m.type === "record" && m.record.type === "turn_started",
  );
  const startedTurnId =
    started.type === "record"
      ? (started.record as unknown as { turn: { id: number } }).turn.id
      : -1;
  assert.equal(turnStarts(), 1);

  // Busy while the turn is active: nothing stamps on the bystander,
  // which stays queued (core-service-5).
  const bystander = await client.queue({
    projectId: project.id,
    text: "Bystander",
  });
  const busySubmit = await client.command("turn.submit", {
    sessionId: session.id,
    text: "y",
    intentId: bystander.id,
  });
  assert.ok(!busySubmit.ok && busySubmit.error.code === "busy");

  // The started turn stamped the dispatch: session, turn, and time.
  let ledger = await client.expectOk("ledger.get", {});
  const working = stateOf(ledger, i1.id);
  assert.equal(working.state, "working");
  assert.deepEqual(
    {
      sessionId: working.intent.dispatched?.sessionId,
      turnId: working.intent.dispatched?.turnId,
    },
    { sessionId: session.id, turnId: startedTurnId },
  );
  assert.equal(typeof working.intent.dispatched?.at, "number");
  const idle = stateOf(ledger, bystander.id);
  assert.equal(idle.state, "queued");
  assert.equal(idle.intent.dispatched, undefined);
  // Keep this stamping-focused test from offering automatic work at the
  // first settlement (core-service-94): the bystander is let go while
  // still queued, which leaves no trace of it.
  await client.expectOk("intent.close", { intentId: bystander.id, as: "dropped" });

  await client.ledgerUntil(
    (state) => stateOf(state, i1.id).state === "finished",
    "the dispatched intent to finish",
  );
  await settledTurns(client, harness, session.id, 1);
  await Promise.all([...harness.service["advancing"]]);
  assert.equal(turnStarts(), 1);

  // A closed intent is rejected at submission and starts no turn.
  await client.expectOk("intent.close", { intentId: i1.id, as: "done" });
  const closedSubmit = await client.command("turn.submit", {
    sessionId: session.id,
    text: "once more",
    intentId: i1.id,
  });
  assert.ok(!closedSubmit.ok && closedSubmit.error.code === "conflict");
  assert.equal(turnStarts(), 1);

  // An aborted dispatch turn keeps its stamps while the next fold
  // re-derives the intent as queued at its place by age, editable again.
  const i2 = await client.queue({
    projectId: project.id,
    text: "Follow the build",
  });
  const i3 = await client.queue({
    projectId: project.id,
    text: "Younger work",
  });
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
    (state) => stateOf(state, i2.id).state === "queued",
    "the aborted dispatch to release",
  );
  const released = stateOf(ledger, i2.id);
  assert.equal(released.intent.dispatched?.sessionId, session.id, "the stamps remain as history");
  assert.equal(released.intent.dispatched?.turnId, 2);
  assert.deepEqual(queueIds(ledger, project.id), [i2.id, i3.id]);
  assert.equal(nextOf(ledger, project.id).intent.id, i2.id, "the release keeps its place by age");
  await client.expectOk("intent.edit", {
    intentId: i2.id,
    text: "Follow the build, retried",
  });

  // Playbook settles an abort at its saved progress (core-service-6,
  // DR-088): the conversation continues, no recovery is owed, and the
  // aborted dispatch hands nothing on (core-service-94).
  await settledTurns(client, harness, session.id, 2);
  await Promise.all([...harness.service["advancing"]]);
  const continued = (await client.expectOk("session.list", {})).find((entry) => entry.id === session.id);
  assert.equal(continued?.recovery, undefined);
  assert.equal(continued?.continuable, true);
  assert.equal(turnStarts(), 2);
  assert.equal(stateOf(await client.expectOk("ledger.get", {}), i3.id).intent.dispatched, undefined);

  client.close();
  await harness.service.stop();
});

// ---------------------------------------------------------------------------
// core-service-50/58: History paging
// ---------------------------------------------------------------------------

test("core-service-58: ledger.history pages 45 closed intents 20/20/5, newest first, no overlap", async () => {
  // Seed the store first, then serve it: paging is a pure read over
  // closed rows, wherever they came from.
  const dir = scratchDir("spex-ledger-hist-");
  const dataDir = join(dir, "state");
  const seeded = new Store({ dir: dataDir, own: OWN });
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
      createdAt: i,
    });
    if (i % 2 === 1) {
      beginTurn(seeded, "73000000-0000-4000-8000-000000000010", i, `Closed intent ${i}`, 100 + i);
      finishTurn(seeded, "73000000-0000-4000-8000-000000000010", i, 500 + i);
      seeded.stampIntentDispatch(id, "73000000-0000-4000-8000-000000000010", i, 100 + i);
    }
    seeded.closeIntent(id, i % 2 === 0 ? "done" : "dropped", 1000 + i);
  }
  await seedHistorySession(seeded.repository(project.id)!.sessionsDir, project.path, seeded.getRecords("73000000-0000-4000-8000-000000000010", { includeHidden: true }).map((entry) => entry.record as unknown as Record<string, unknown>), "73000000-0000-4000-8000-000000000010");
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
// core-service-54/56: restart identity over the protocol, the intent
// files, and an intent arriving through a sync
// ---------------------------------------------------------------------------

test("core-service-54: ledger.get replies identically after a service restart, and no intent file holds a state or status field", { timeout: 30_000 }, async () => {
  const harness = await startHarness();
  let client = new Client(harness.service.port());
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
  const finishedTurn = async (intent: IntentInfo, turns: number) => {
    await client.expectOk("turn.submit", {
      sessionId: session.id,
      text: intent.text,
      intentId: intent.id,
    });
    await client.ledgerUntil(
      (state) => state.intents.find((entry) => entry.intent.id === intent.id)?.state === "finished",
      `${intent.text} to finish`,
    );
    await settledTurns(client, harness, session.id, turns);
    await Promise.all([...harness.service["advancing"]]);
  };

  // A completed run: one intent worked and confirmed, one worked and
  // finished awaiting its verdict, one queued and edited, and one
  // dropped before any work. Each is queued only once the turn before
  // it settled, so nothing hands on automatically.
  const confirmed = await client.queue({ projectId: project.id, text: "Confirmed work" });
  await finishedTurn(confirmed, 1);
  const delivered = await client.queue({ projectId: project.id, text: "Delivered work" });
  await finishedTurn(delivered, 2);
  await client.expectOk("intent.close", { intentId: confirmed.id, as: "done" });
  const kept = await client.queue({ projectId: project.id, text: "Keep me queued" });
  await client.expectOk("intent.edit", { intentId: kept.id, text: "Kept, edited" });
  const closed = await client.queue({ projectId: project.id, text: "Close me" });
  await client.expectOk("intent.close", { intentId: closed.id, as: "dropped" });
  const before = await client.expectOk("ledger.get", {});
  assert.equal(stateOf(before, delivered.id).state, "finished");
  assert.equal(stateOf(before, kept.id).state, "queued");
  assert.equal(nextOf(before, project.id).intent.id, kept.id);
  assert.deepEqual(queueIds(before, project.id), [delivered.id, kept.id]);
  const history = await client.expectOk("ledger.history", { projectId: project.id });
  assert.deepEqual(history.intents.map((row) => row.intent.id), [confirmed.id]);

  client.close();
  await harness.restart();
  client = new Client(harness.service.port());
  await client.open();
  assert.deepEqual(await client.expectOk("ledger.get", {}), before);
  assert.deepEqual(await client.expectOk("ledger.history", { projectId: project.id }), history);

  // Each intent is one file of provenance and stamps only: exactly
  // storage-4's fields, no state or status anywhere (core-service-52).
  const intentsDir = harness.service["store"].repository(project.id)!.intentsDir;
  const files = readdirSync(intentsDir).filter((name) => name.endsWith(".json")).sort();
  assert.deepEqual(files, [confirmed.id, delivered.id, kept.id].map((id) => `${id}.json`).sort());
  for (const name of files) {
    const file = JSON.parse(readFileSync(join(intentsDir, name), "utf8")) as Record<string, unknown>;
    assert.equal(file.format, 1);
    for (const key of Object.keys(file)) assert.ok(INTENT_FILE_FIELDS.has(key), `${name} holds ${key}`);
    for (const part of [file, file.dispatched, file.closed]) {
      if (part && typeof part === "object") {
        assert.ok(!("state" in part) && !("status" in part), `${name} stores no state`);
      }
    }
  }
  assert.ok(readIntentFile(intentsDir, delivered.id).dispatched, "the dispatch stamp is kept");
  assert.deepEqual(
    (readIntentFile(intentsDir, confirmed.id).closed as { as: string }).as,
    "done",
  );
  client.close();
  await harness.service.stop();
});

test("core-service-56: an intent arriving through a sync with an older capture time heads the queue", async () => {
  const harness = await startHarness();
  let client = new Client(harness.service.port());
  await client.open();
  const project = await client.expectOk("project.register", {
    path: harness.projectDir,
  });
  const first = await client.queue({ projectId: project.id, text: "Captured first" });
  const second = await client.queue({ projectId: project.id, text: "Captured second" });
  let ledger = await client.expectOk("ledger.get", {});
  assert.deepEqual(queueIds(ledger, project.id), [first.id, second.id]);
  assert.equal(nextOf(ledger, project.id).intent.id, first.id);

  // A sync lands a third intent captured earlier on another device: its
  // file arrives in the clone's intents/ exactly as the other device
  // wrote it, and the core reads it on its next start.
  const intentsDir = harness.service["store"].repository(project.id)!.intentsDir;
  const third = {
    format: 1,
    id: randomUUID(),
    text: "Captured elsewhere, earlier",
    createdAt: first.createdAt - 60_000,
  };
  writeFileSync(join(intentsDir, `${third.id}.json`), `${JSON.stringify(third, null, 2)}\n`);
  client.close();
  await harness.restart();
  client = new Client(harness.service.port());
  await client.open();

  // Its place is its age: first in the queue, and next (core-service-42,
  // core-service-49, core-service-107).
  ledger = await client.expectOk("ledger.get", {});
  assert.deepEqual(queueIds(ledger, project.id), [third.id, first.id, second.id]);
  assert.deepEqual(
    ledger.intents
      .filter((entry) => entry.intent.projectId === project.id)
      .map((entry) => entry.state),
    ["queued", "queued", "queued"],
  );
  const next = nextOf(ledger, project.id);
  assert.equal(next.intent.id, third.id);
  assert.equal(next.intent.text, third.text);
  assert.deepEqual(next.next, { standing: "manual-ready", manualStart: true });
  client.close();
  await harness.service.stop();
});

test("dashboard-10: the Captain's own machine reporting after a park leaves the question standing", () => {
  const { store, projectId } = newProjectStore();
  addSession(store, projectId, "s1");
  queueIntent(store, projectId, "Q");
  beginTurn(store, "s1", 1, "plan it", 1000);
  stamp(store, "Q", "s1", 1, 1000);
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
    [["question", uid("Q")]],
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

test("dashboard-10/33: dispatching another intent in a later Boss turn leaves the prior question standing", () => {
  const { store, projectId } = newProjectStore();
  addSession(store, projectId, "s1");
  queueIntent(store, projectId, "D");
  queueIntent(store, projectId, "Q");
  queueIntent(store, projectId, "N");
  beginTurn(store, "s1", 1, "completed delivery", 1000);
  stamp(store, "D", "s1", 1, 1000);
  finishTurn(store, "s1", 1, 2000);
  beginTurn(store, "s1", 2, "plan it", 3000);
  stamp(store, "Q", "s1", 2, 3000);
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

  // Inspect the new dispatch before any machine state transition: its
  // start answers nothing, so the earlier question stands (DR-085).
  beginTurn(store, "s1", 3, "start another intent", 5000);
  stamp(store, "N", "s1", 3, 5000);
  ledger = fold(store, [lane("s1", projectId, true)]);
  assert.equal(stateOf(ledger, "N").state, "working");
  assert.equal(stateOf(ledger, "Q").state, "interrupted");
  assert.equal(stateOf(ledger, "Q").reason, "question");
  assert.equal(stateOf(ledger, "D").state, "finished");
  assert.deepEqual(
    ledger.attention.map((entry) => [entry.kind, entry.intentId]),
    [["question", uid("Q")], ["finish", uid("D")]],
  );

  // Only the runtime reporting the question gone clears it.
  append(store, "s1", {
    type: "captain_telemetry",
    topic: "playbook.fsm.state",
    payload: { from: "awaitBossReply", to: "planAnalysis" },
    turnId: 3,
    timestamp: 5500,
  });
  ledger = fold(store, [lane("s1", projectId, true)]);
  assert.equal(stateOf(ledger, "N").state, "working");
  assert.equal(stateOf(ledger, "Q").state, "finished");
  assert.deepEqual(
    ledger.attention.map((entry) => [entry.kind, entry.intentId]),
    [["finish", uid("D")], ["finish", uid("Q")]],
  );
  assert.equal(store.getIntent(uid("D"))?.closedAt, undefined);
  store.close();
});

test("dashboard-10/core-service-107: a Boss clarification turn leaves the parked question standing", () => {
  const { store, projectId } = newProjectStore();
  addSession(store, projectId, "s1");
  queueIntent(store, projectId, "Q");
  queueIntent(store, projectId, "N");
  beginTurn(store, "s1", 1, "plan it", 1000);
  stamp(store, "Q", "s1", 1, 1000);
  append(store, "s1", {
    type: "captain_telemetry",
    topic: "playbook.fsm.state",
    payload: { from: "planAnalysis", to: "awaitBossReply" },
    turnId: 1,
    timestamp: 1500,
  });
  finishTurn(store, "s1", 1, 2000);
  let ledger = fold(store, [lane("s1", projectId, false)]);
  assert.equal(stateOf(ledger, "Q").reason, "question");
  assert.deepEqual(nextOf(ledger, projectId).next, {
    standing: "question-park",
    manualStart: false,
  });

  // The Boss asks back instead of answering, and the Captain replies;
  // no machine reports anything, so the park stands (DR-085).
  beginTurn(store, "s1", 2, "what do you mean by target?", 3000);
  append(store, "s1", {
    type: "captain_reply",
    text: "The deployment target the plan names.",
    turnId: 2,
    timestamp: 3200,
  });
  ledger = fold(store, [lane("s1", projectId, true)]);
  assert.equal(stateOf(ledger, "Q").state, "working");
  finishTurn(store, "s1", 2, 3500);

  ledger = fold(store, [lane("s1", projectId, false)]);
  assert.equal(stateOf(ledger, "Q").state, "interrupted");
  assert.equal(stateOf(ledger, "Q").reason, "question");
  assert.deepEqual(
    ledger.attention.map((entry) => [entry.kind, entry.intentId, entry.since]),
    [["question", uid("Q"), 1500]],
  );
  // The queue must not hand the next intent into the parked
  // conversation (core-service-107).
  assert.deepEqual(nextOf(ledger, projectId).next, {
    standing: "question-park",
    manualStart: false,
  });
  store.close();
});

test("dashboard-10: a state report's pending questions raise the question under any state, and an empty set clears it", () => {
  const { store, projectId } = newProjectStore();
  addSession(store, projectId, "s1");
  queueIntent(store, projectId, "Q");
  beginTurn(store, "s1", 1, "analyse it", 1000);
  stamp(store, "Q", "s1", 1, 1000);
  append(store, "s1", {
    type: "captain_telemetry",
    topic: "playbook.fsm.state",
    payload: {
      from: "analysing",
      to: "clarifying",
      pendingBossQuestions: [
        { question: "Which target?", asker: { kind: "role", roleId: "Analyst" } },
      ],
    },
    turnId: 1,
    timestamp: 1500,
  });
  finishTurn(store, "s1", 1, 2000);
  let ledger = fold(store, [lane("s1", projectId, false)]);
  assert.equal(stateOf(ledger, "Q").state, "interrupted");
  assert.equal(stateOf(ledger, "Q").reason, "question");
  assert.deepEqual(
    ledger.attention.map((entry) => [entry.kind, entry.intentId, entry.since]),
    [["question", uid("Q"), 1500]],
  );

  // The Boss answers; the runtime's next report carries no question.
  beginTurn(store, "s1", 2, "the primary target", 3000);
  append(store, "s1", {
    type: "captain_telemetry",
    topic: "playbook.fsm.state",
    payload: { from: "clarifying", to: "analysing", pendingBossQuestions: [] },
    turnId: 2,
    timestamp: 3200,
  });
  finishTurn(store, "s1", 2, 3500);
  ledger = fold(store, [lane("s1", projectId, false)]);
  assert.equal(stateOf(ledger, "Q").state, "finished");
  assert.deepEqual(
    ledger.attention.map((entry) => [entry.kind, entry.intentId]),
    [["finish", uid("Q")]],
  );
  store.close();
});

test("dashboard-10: a run dismissed while parked takes its question with it", () => {
  const { store, projectId } = newProjectStore();
  addSession(store, projectId, "s1");
  queueIntent(store, projectId, "Q");
  beginTurn(store, "s1", 1, "plan it", 1000);
  stamp(store, "Q", "s1", 1, 1000);
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
