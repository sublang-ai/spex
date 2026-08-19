// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Recorded-stream fixture used by RUN tests: the session channel of
// one boss turn (visible records only, as the core delivers them),
// followed by an awaitBossReply park and a reply turn.

import type { TmuxPlayRecord } from "@sublang/spex-core/protocol";

export interface FixtureEntry {
  seq: number;
  record: TmuxPlayRecord;
}

const t = 1_700_000_000_000;

function rec(seq: number, record: Record<string, unknown>): FixtureEntry {
  return { seq, record: record as unknown as TmuxPlayRecord };
}

export const PLAYERS = [
  { id: "dev.coder", adapter: "claude" as const, model: "claude-test" },
  { id: "dev.reviewer", adapter: "codex" as const },
];

export const INITIAL_VISIBLE = ["dev.coder", "dev.reviewer"];

/** Turn 1: dispatch to the coder, tool use, success. */
export const TURN_ONE: FixtureEntry[] = [
  rec(1, {
    type: "turn_started",
    turnId: 1,
    timestamp: t,
    turn: { id: 1, prompt: "/code fix the bug", timestamp: t },
  }),
  rec(2, {
    type: "captain_status",
    turnId: 1,
    timestamp: t + 1,
    message: "◇ /code started",
  }),
  rec(3, {
    type: "player_view_changed",
    turnId: 1,
    timestamp: t + 2,
    visiblePlayerIds: ["dev.coder", "dev.reviewer"],
  }),
  rec(4, {
    type: "player_prompt",
    turnId: 1,
    timestamp: t + 3,
    playerId: "dev.coder",
    prompt: "Fix the bug in auth.ts",
  }),
  rec(5, {
    type: "player_event",
    turnId: 1,
    timestamp: t + 4,
    playerId: "dev.coder",
    event: {
      type: "text_delta",
      agent: "fake",
      timestamp: t + 4,
      sessionId: "a",
      payload: { delta: "Looking at " },
    },
  }),
  rec(6, {
    type: "player_event",
    turnId: 1,
    timestamp: t + 5,
    playerId: "dev.coder",
    event: {
      type: "text_delta",
      agent: "fake",
      timestamp: t + 5,
      sessionId: "a",
      // Two links an agent writes without thinking about it: one the
      // shell can open, one it cannot (run-view-83).
      payload: {
        delta:
          "the **auth** module — see [auth.md](specs/packages/auth.md#auth-3)" +
          " and [the SDK docs](https://example.com/sdk).",
      },
    },
  }),
  rec(7, {
    type: "player_event",
    turnId: 1,
    timestamp: t + 6,
    playerId: "dev.coder",
    event: {
      type: "tool_use",
      agent: "fake",
      timestamp: t + 6,
      sessionId: "a",
      // A real call names what it acts on; the pane reads its subject
      // from these very fields (run-view-4).
      payload: {
        toolName: "Edit",
        toolUseId: "tu1",
        input: { file_path: "src/auth.ts", old_string: "a", new_string: "b" },
      },
    },
  }),
  rec(8, {
    type: "player_event",
    turnId: 1,
    timestamp: t + 7,
    playerId: "dev.coder",
    event: {
      type: "tool_result",
      agent: "fake",
      timestamp: t + 7,
      sessionId: "a",
      payload: { toolUseId: "tu1", toolName: "Edit", status: "success", output: "ok", durationMs: 12 },
    },
  }),
  rec(9, {
    type: "player_event",
    turnId: 1,
    timestamp: t + 7,
    playerId: "dev.coder",
    event: {
      type: "tool_use",
      agent: "fake",
      timestamp: t + 7,
      sessionId: "a",
      // An input naming nothing the reader would recognize: the card
      // stays the tool name alone rather than guessing (run-view-4).
      payload: {
        toolName: "TodoWrite",
        toolUseId: "tu2",
        input: { todos: [{ content: "ship it", status: "pending" }] },
      },
    },
  }),
  rec(10, {
    type: "player_event",
    turnId: 1,
    timestamp: t + 7,
    playerId: "dev.coder",
    event: {
      type: "tool_result",
      agent: "fake",
      timestamp: t + 7,
      sessionId: "a",
      payload: { toolUseId: "tu2", toolName: "TodoWrite", status: "success", output: "ok" },
    },
  }),
  rec(11, {
    type: "player_event",
    turnId: 1,
    timestamp: t + 8,
    playerId: "dev.coder",
    event: {
      type: "thinking",
      agent: "fake",
      timestamp: t + 8,
      sessionId: "a",
      payload: { summary: "considering edge cases" },
    },
  }),
  rec(12, {
    type: "player_event",
    turnId: 1,
    timestamp: t + 9,
    playerId: "dev.coder",
    event: {
      type: "done",
      agent: "fake",
      timestamp: t + 9,
      sessionId: "a",
      payload: {
        status: "success",
        result: "Fixed.",
        // The cligent 0.22 DoneUsage shape, as the runtime sends it:
        // totals are inclusive, and cost carries its provenance.
        usage: {
          toolUses: 1,
          tokens: {
            coverage: "full",
            totals: { input: { total: 120 }, output: { total: 30 } },
          },
          cost: { amount: 0.05, currency: "USD", source: "provider-reported" },
        },
        durationMs: 900,
      },
    },
  }),
  rec(13, {
    type: "player_finished",
    turnId: 1,
    timestamp: t + 10,
    playerId: "dev.coder",
    result: { status: "ok", playerId: "dev.coder", turnId: 1, finalText: "Fixed." },
  }),
  rec(14, {
    type: "captain_telemetry",
    turnId: 1,
    timestamp: t + 11,
    topic: "playbook.fsm.state",
    payload: { from: "coding", to: "ready", event: "xstate.done" },
  }),
  rec(15, { type: "turn_finished", turnId: 1, timestamp: t + 12 }),
];

/** Turn 2: the reviewer asks a question; the FSM parks awaiting a reply. */
export const TURN_TWO_QUESTION: FixtureEntry[] = [
  rec(16, {
    type: "turn_started",
    turnId: 2,
    timestamp: t + 20,
    turn: { id: 2, prompt: "review it", timestamp: t + 20 },
  }),
  rec(17, {
    type: "player_prompt",
    turnId: 2,
    timestamp: t + 21,
    playerId: "dev.reviewer",
    prompt: "Review the change",
  }),
  rec(18, {
    type: "player_finished",
    turnId: 2,
    timestamp: t + 22,
    playerId: "dev.reviewer",
    result: {
      status: "ok",
      playerId: "dev.reviewer",
      turnId: 2,
      finalText: "Which auth flow should I prioritize?",
    },
  }),
  rec(19, {
    type: "captain_status",
    turnId: 2,
    timestamp: t + 23,
    message: "◆ dev.reviewer asks: Which auth flow should I prioritize?",
  }),
  rec(20, {
    type: "captain_telemetry",
    turnId: 2,
    timestamp: t + 24,
    topic: "playbook.fsm.state",
    payload: {
      from: "review",
      to: "awaitBossReply",
      event: "NEEDS_BOSS",
      pendingBossQuestion: {
        player: "dev.reviewer",
        question: "Which auth flow should I prioritize?",
        resumeStateId: "review",
      },
    },
  }),
  rec(21, { type: "turn_finished", turnId: 2, timestamp: t + 25 }),
];

/** Turn 3: the Boss reply resumes the flow. */
export const TURN_THREE_REPLY: FixtureEntry[] = [
  rec(22, {
    type: "turn_started",
    turnId: 3,
    timestamp: t + 30,
    turn: { id: 3, prompt: "prioritize OAuth", timestamp: t + 30 },
  }),
  rec(23, {
    type: "captain_telemetry",
    turnId: 3,
    timestamp: t + 31,
    topic: "playbook.fsm.state",
    payload: { from: "awaitBossReply", to: "review", event: "BOSS_REPLY" },
  }),
  rec(24, { type: "turn_finished", turnId: 3, timestamp: t + 32 }),
];

/** A hidden captain exchange — must NEVER appear on a session channel;
 * used to verify the reducer ignores it even if misdelivered. */
export const HIDDEN_LEAK: FixtureEntry[] = [
  rec(25, {
    type: "captain_prompt",
    turnId: 4,
    timestamp: t + 40,
    prompt: "secret router prompt",
    visibility: "hidden",
  }),
];

/** A /code run's structured trace (run-view-66, DR-028): shapes
 * mirror the real runtime's playbook.trace payloads — an invocation
 * at depth 1, transitions, a player call attributed to its state, a
 * nested review at depth 2, and the settled finish. */
/** A playbook.trace envelope, as the runtime emits it (schemaVersion 3). */
function trace(
  seq: number,
  at: number,
  sessionId: string,
  playbookId: string,
  type: string,
  body: Record<string, unknown>,
  parentSessionId?: string,
): FixtureEntry {
  return rec(seq, {
    type: "captain_telemetry",
    turnId: 9,
    timestamp: at,
    topic: "playbook.trace",
    payload: {
      schemaVersion: 3,
      sessionId,
      playbookId,
      ...(parentSessionId ? { parentSessionId } : {}),
      depth: parentSessionId ? 2 : 1,
      sequence: seq,
      timestamp: at,
      type,
      payload: body,
    },
  });
}

const moved = (
  from: string,
  to: string,
  event: string,
  status = "active",
  tags: string[] = [],
): Record<string, unknown> => ({
  from,
  to,
  event: { type: event },
  state: { value: to, activeStateIds: [to], tags, status },
});

/** One /code run that calls /review, finishes, and is then talked
 * about — the status, settlement and disposal a real runtime emits
 * after the closing transition (run-view-66/74). */
export const MACHINE_RUN: FixtureEntry[] = [
  rec(401, {
    type: "turn_started",
    turnId: 9,
    timestamp: 9_000,
    turn: { id: 9, prompt: "/code fix the refresh path" },
  }),
  rec(402, {
    type: "captain_status",
    turnId: 9,
    timestamp: 9_001,
    message: "\u25c7 /code started",
  }),
  trace(403, 9_002, "t-code", "code", "session.started", {}),
  trace(404, 9_003, "t-code", "code", "fsm.transition", moved(
    "ready",
    "runFirstPhase",
    "START_CODE",
    "active",
    ["playbook.busy"],
  )),
  rec(405, {
    type: "captain_status",
    turnId: 9,
    timestamp: 9_004,
    message: "\u2937 Coder: implement the refresh fix",
  }),
  // The runtime also narrates its transitions with no glyph at all —
  // raw event ids that used to land in the conversation as jargon.
  rec(4051, {
    type: "captain_status",
    turnId: 9,
    timestamp: 9_004,
    message: "START_CODE",
  }),
  rec(4052, {
    type: "captain_status",
    turnId: 9,
    timestamp: 9_005,
    message: "\u2192 directCommit",
  }),
  trace(406, 9_004, "t-code", "code", "player.call.started", {
    stateId: "runFirstPhase",
    roleId: "coder",
    playerId: "dev.coder",
  }),
  trace(407, 9_010, "t-code", "code", "player.call.finished", {
    stateId: "runFirstPhase",
    status: "ok",
  }),
  trace(408, 9_011, "t-code", "code", "fsm.transition", moved(
    "runFirstPhase",
    "reviewFirstCommit",
    "done",
  )),
  // The caller names the state that delegates, and to whom.
  trace(409, 9_012, "t-code", "code", "playbook.call.started", {
    stateId: "reviewFirstCommit",
    playbookId: "review",
    text: "review the first commit",
  }),
  trace(410, 9_013, "t-review", "review", "session.started", {}, "t-code"),
  trace(411, 9_014, "t-review", "review", "fsm.transition",
    moved("ready", "reviewing", "START_REVIEW"), "t-code"),
  trace(412, 9_020, "t-review", "review", "fsm.transition",
    moved("reviewing", "done", "APPROVED", "done"), "t-code"),
  // Everything below post-dates the review's closing transition: a
  // settled run keeps being reported on, and none of it may revive it.
  trace(413, 9_021, "t-review", "review", "status.emitted", {
    message: "\u2192 approved",
    stateId: "done",
  }, "t-code"),
  trace(414, 9_022, "t-review", "review", "boss.input.settled", {
    outcome: "terminal",
    stateId: "done",
  }, "t-code"),
  trace(415, 9_023, "t-review", "review", "session.disposed", {
    state: { value: "done", status: "done" },
    stateId: "done",
  }, "t-code"),
  trace(416, 9_024, "t-code", "code", "playbook.call.finished", {
    stateId: "reviewFirstCommit",
    playbookId: "review",
    result: "approved",
  }),
  trace(417, 9_030, "t-code", "code", "fsm.transition",
    moved("reviewFirstCommit", "done", "APPROVED", "done")),
  trace(418, 9_031, "t-code", "code", "status.emitted", {
    message: "\u2192 settled",
    stateId: "done",
  }),
  trace(419, 9_032, "t-code", "code", "boss.input.settled", {
    outcome: "terminal",
    stateId: "done",
  }),
  trace(420, 9_033, "t-code", "code", "session.disposed", {
    state: { value: "done", status: "done" },
    stateId: "done",
  }),
  rec(421, { type: "turn_finished", turnId: 9, timestamp: 9_034 }),
];

/** A run that never reaches a final state and is disposed where it
 * stands: unfinished, and it says so (run-view-62). */
export const MACHINE_STOPPED: FixtureEntry[] = [
  rec(501, {
    type: "turn_started",
    turnId: 11,
    timestamp: 11_000,
    turn: { id: 11, prompt: "/code start something" },
  }),
  trace(502, 11_001, "t-halt", "code", "session.started", {}),
  trace(503, 11_002, "t-halt", "code", "fsm.transition",
    moved("ready", "runFirstPhase", "START_CODE")),
  trace(504, 11_010, "t-halt", "code", "session.disposed", {
    state: { value: "runFirstPhase", status: "active" },
    stateId: "runFirstPhase",
  }),
  rec(505, { type: "turn_finished", turnId: 11, timestamp: 11_011 }),
];

/** A child whose caller the pane never saw — it draws where it can be
 * seen rather than vanishing (run-view-78). */
export const MACHINE_ORPHAN: FixtureEntry[] = [
  rec(601, {
    type: "turn_started",
    turnId: 12,
    timestamp: 12_000,
    turn: { id: 12, prompt: "/review something" },
  }),
  trace(602, 12_001, "t-lost", "review", "session.started", {}, "t-never-seen"),
  trace(603, 12_002, "t-lost", "review", "fsm.transition",
    moved("ready", "reviewing", "START_REVIEW"), "t-never-seen"),
];

export const FULL_RUN: FixtureEntry[] = [
  ...TURN_ONE,
  ...TURN_TWO_QUESTION,
  ...TURN_THREE_REPLY,
];
