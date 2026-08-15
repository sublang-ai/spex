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
  { id: "code-coder", adapter: "claude" as const, model: "claude-test" },
  { id: "code-reviewer", adapter: "codex" as const },
];

export const INITIAL_VISIBLE = ["code-coder", "code-reviewer"];

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
    visiblePlayerIds: ["code-coder", "code-reviewer"],
  }),
  rec(4, {
    type: "player_prompt",
    turnId: 1,
    timestamp: t + 3,
    playerId: "code-coder",
    prompt: "Fix the bug in auth.ts",
  }),
  rec(5, {
    type: "player_event",
    turnId: 1,
    timestamp: t + 4,
    playerId: "code-coder",
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
    playerId: "code-coder",
    event: {
      type: "text_delta",
      agent: "fake",
      timestamp: t + 5,
      sessionId: "a",
      payload: { delta: "the **auth** module." },
    },
  }),
  rec(7, {
    type: "player_event",
    turnId: 1,
    timestamp: t + 6,
    playerId: "code-coder",
    event: {
      type: "tool_use",
      agent: "fake",
      timestamp: t + 6,
      sessionId: "a",
      payload: { toolName: "Edit", toolUseId: "tu1", input: { file: "auth.ts" } },
    },
  }),
  rec(8, {
    type: "player_event",
    turnId: 1,
    timestamp: t + 7,
    playerId: "code-coder",
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
    timestamp: t + 8,
    playerId: "code-coder",
    event: {
      type: "thinking",
      agent: "fake",
      timestamp: t + 8,
      sessionId: "a",
      payload: { summary: "considering edge cases" },
    },
  }),
  rec(10, {
    type: "player_event",
    turnId: 1,
    timestamp: t + 9,
    playerId: "code-coder",
    event: {
      type: "done",
      agent: "fake",
      timestamp: t + 9,
      sessionId: "a",
      payload: {
        status: "success",
        result: "Fixed.",
        usage: { inputTokens: 120, outputTokens: 30, toolUses: 1, totalCostUsd: 0.05 },
        durationMs: 900,
      },
    },
  }),
  rec(11, {
    type: "player_finished",
    turnId: 1,
    timestamp: t + 10,
    playerId: "code-coder",
    result: { status: "ok", playerId: "code-coder", turnId: 1, finalText: "Fixed." },
  }),
  rec(12, {
    type: "captain_telemetry",
    turnId: 1,
    timestamp: t + 11,
    topic: "playbook.fsm.state",
    payload: { from: "coding", to: "ready", event: "xstate.done" },
  }),
  rec(13, { type: "turn_finished", turnId: 1, timestamp: t + 12 }),
];

/** Turn 2: the reviewer asks a question; the FSM parks awaiting a reply. */
export const TURN_TWO_QUESTION: FixtureEntry[] = [
  rec(14, {
    type: "turn_started",
    turnId: 2,
    timestamp: t + 20,
    turn: { id: 2, prompt: "review it", timestamp: t + 20 },
  }),
  rec(15, {
    type: "player_prompt",
    turnId: 2,
    timestamp: t + 21,
    playerId: "code-reviewer",
    prompt: "Review the change",
  }),
  rec(16, {
    type: "player_finished",
    turnId: 2,
    timestamp: t + 22,
    playerId: "code-reviewer",
    result: {
      status: "ok",
      playerId: "code-reviewer",
      turnId: 2,
      finalText: "Which auth flow should I prioritize?",
    },
  }),
  rec(17, {
    type: "captain_status",
    turnId: 2,
    timestamp: t + 23,
    message: "◆ code-reviewer asks: Which auth flow should I prioritize?",
  }),
  rec(18, {
    type: "captain_telemetry",
    turnId: 2,
    timestamp: t + 24,
    topic: "playbook.fsm.state",
    payload: {
      from: "review",
      to: "awaitBossReply",
      event: "NEEDS_BOSS",
      pendingBossQuestion: {
        player: "code-reviewer",
        question: "Which auth flow should I prioritize?",
        resumeStateId: "review",
      },
    },
  }),
  rec(19, { type: "turn_finished", turnId: 2, timestamp: t + 25 }),
];

/** Turn 3: the Boss reply resumes the flow. */
export const TURN_THREE_REPLY: FixtureEntry[] = [
  rec(20, {
    type: "turn_started",
    turnId: 3,
    timestamp: t + 30,
    turn: { id: 3, prompt: "prioritize OAuth", timestamp: t + 30 },
  }),
  rec(21, {
    type: "captain_telemetry",
    turnId: 3,
    timestamp: t + 31,
    topic: "playbook.fsm.state",
    payload: { from: "awaitBossReply", to: "review", event: "BOSS_REPLY" },
  }),
  rec(22, { type: "turn_finished", turnId: 3, timestamp: t + 32 }),
];

/** A hidden captain exchange — must NEVER appear on a session channel;
 * used to verify the reducer ignores it even if misdelivered. */
export const HIDDEN_LEAK: FixtureEntry[] = [
  rec(23, {
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
export const MACHINE_RUN: FixtureEntry[] = [
  {
    seq: 401,
    record: {
      type: "turn_started",
      turnId: 9,
      timestamp: 9_000,
      turn: { id: 9, prompt: "/code fix the refresh path" },
    } as TmuxPlayRecord,
  },
  {
    seq: 402,
    record: {
      type: "captain_status",
      turnId: 9,
      timestamp: 9_001,
      message: "◇ /code started",
    } as TmuxPlayRecord,
  },
  {
    seq: 403,
    record: {
      type: "captain_telemetry",
      turnId: 9,
      timestamp: 9_002,
      topic: "playbook.trace",
      payload: {
        schemaVersion: 3,
        sessionId: "t-code",
        playbookId: "code",
        rootSessionId: "t-root",
        depth: 1,
        sequence: 1,
        timestamp: 9_002,
        type: "session.started",
        payload: {},
      },
    } as TmuxPlayRecord,
  },
  {
    seq: 404,
    record: {
      type: "captain_telemetry",
      turnId: 9,
      timestamp: 9_003,
      topic: "playbook.trace",
      payload: {
        schemaVersion: 3,
        sessionId: "t-code",
        playbookId: "code",
        depth: 1,
        sequence: 2,
        timestamp: 9_003,
        type: "fsm.transition",
        payload: {
          from: "ready",
          to: "runFirstPhase",
          event: { type: "START_CODE" },
          state: {
            value: "runFirstPhase",
            activeStateIds: ["runFirstPhase"],
            tags: ["playbook.busy"],
            status: "active",
          },
        },
      },
    } as TmuxPlayRecord,
  },
  {
    seq: 405,
    record: {
      type: "captain_status",
      turnId: 9,
      timestamp: 9_004,
      message: "⤷ Coder: implement the refresh fix",
    } as TmuxPlayRecord,
  },
  {
    seq: 406,
    record: {
      type: "captain_telemetry",
      turnId: 9,
      timestamp: 9_004,
      topic: "playbook.trace",
      payload: {
        schemaVersion: 3,
        sessionId: "t-code",
        playbookId: "code",
        depth: 1,
        sequence: 3,
        timestamp: 9_004,
        type: "player.call.started",
        callId: "c1",
        payload: { stateId: "runFirstPhase", roleId: "coder", playerId: "code-coder" },
      },
    } as TmuxPlayRecord,
  },
  {
    seq: 407,
    record: {
      type: "captain_telemetry",
      turnId: 9,
      timestamp: 9_010,
      topic: "playbook.trace",
      payload: {
        schemaVersion: 3,
        sessionId: "t-code",
        playbookId: "code",
        depth: 1,
        sequence: 4,
        timestamp: 9_010,
        type: "player.call.finished",
        callId: "c1",
        payload: { stateId: "runFirstPhase", status: "ok" },
      },
    } as TmuxPlayRecord,
  },
  // The nested review: a machine calling a machine (run-view-63).
  {
    seq: 408,
    record: {
      type: "captain_telemetry",
      turnId: 9,
      timestamp: 9_011,
      topic: "playbook.trace",
      payload: {
        schemaVersion: 3,
        sessionId: "t-review",
        playbookId: "review",
        parentSessionId: "t-code",
        depth: 2,
        sequence: 1,
        timestamp: 9_011,
        type: "session.started",
        payload: {},
      },
    } as TmuxPlayRecord,
  },
  {
    seq: 409,
    record: {
      type: "captain_telemetry",
      turnId: 9,
      timestamp: 9_012,
      topic: "playbook.trace",
      payload: {
        schemaVersion: 3,
        sessionId: "t-review",
        playbookId: "review",
        parentSessionId: "t-code",
        depth: 2,
        sequence: 2,
        timestamp: 9_012,
        type: "fsm.transition",
        payload: {
          from: "ready",
          to: "reviewing",
          event: { type: "START_REVIEW" },
          state: { value: "reviewing", status: "active", tags: [] },
        },
      },
    } as TmuxPlayRecord,
  },
  {
    seq: 410,
    record: {
      type: "captain_telemetry",
      turnId: 9,
      timestamp: 9_020,
      topic: "playbook.trace",
      payload: {
        schemaVersion: 3,
        sessionId: "t-review",
        playbookId: "review",
        parentSessionId: "t-code",
        depth: 2,
        sequence: 3,
        timestamp: 9_020,
        type: "fsm.transition",
        payload: {
          from: "reviewing",
          to: "done",
          event: { type: "APPROVED" },
          state: { value: "done", status: "done", tags: [] },
        },
      },
    } as TmuxPlayRecord,
  },
  {
    seq: 411,
    record: {
      type: "captain_telemetry",
      turnId: 9,
      timestamp: 9_030,
      topic: "playbook.trace",
      payload: {
        schemaVersion: 3,
        sessionId: "t-code",
        playbookId: "code",
        depth: 1,
        sequence: 5,
        timestamp: 9_030,
        type: "fsm.transition",
        payload: {
          from: "runFirstPhase",
          to: "done",
          event: { type: "done" },
          state: { value: "done", status: "done", tags: [] },
        },
      },
    } as TmuxPlayRecord,
  },
  {
    seq: 412,
    record: {
      type: "turn_finished",
      turnId: 9,
      timestamp: 9_031,
    } as TmuxPlayRecord,
  },
];

export const FULL_RUN: FixtureEntry[] = [
  ...TURN_ONE,
  ...TURN_TWO_QUESTION,
  ...TURN_THREE_REPLY,
];
