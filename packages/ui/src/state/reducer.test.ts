// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// RUN-19/20/21/22 reducer coverage against the recorded fixture.

import { describe, expect, test } from "vitest";

import {
  applyRecords,
  initialSessionView,
  readDoneUsage,
  resolvePlayerId,
} from "./reducer.js";
import {
  FULL_RUN,
  HIDDEN_LEAK,
  PLAYERS,
  TURN_ONE,
  TURN_TWO_QUESTION,
} from "../fixtures/sample-run.js";
import type { TmuxPlayRecord } from "@sublang/spex-core/protocol";

function fresh() {
  return initialSessionView(PLAYERS);
}

describe("RUN-19: fixture stream renders expected pane structure", () => {
  test("turn one produces coder transcript segments in order", () => {
    const view = applyRecords(fresh(), TURN_ONE);
    const coder = view.players["dev.coder"];
    expect(coder.segments.map((s) => s.kind)).toEqual([
      "prompt",
      "text",
      "tool",
      "tool",
      "thinking",
      "result",
    ]);
    const text = coder.segments[1];
    expect(text.kind === "text" && text.text).toBe(
      "Looking at the **auth** module — see [auth.md](specs/packages/auth.md#auth-3)" +
        " and [the SDK docs](https://example.com/sdk).",
    );
    const tool = coder.segments[2];
    expect(tool.kind === "tool" && tool.status).toBe("success");
    const result = coder.segments[5];
    // The cligent 0.22 shape is read as sent: inclusive totals and a
    // cost that carries its provenance (DR-032).
    expect(result.kind === "result" && result.usage).toMatchObject({
      inputTokens: 120,
      outputTokens: 30,
      toolUses: 1,
      totalCostUsd: 0.05,
      costSource: "provider-reported",
    });
    expect(view.captain.some((line) => line.text === "◇ /code started")).toBe(
      true,
    );
    expect(view.fsmState).toBe("ready");
    expect(view.turnActive).toBe(false);
    // A lane belongs to the session, not to the call in flight: the
    // roster's players both hold one (run-view-7).
    expect(Object.keys(view.players)).toEqual(["dev.coder", "dev.reviewer"]);
  });
});

describe("RUN-20: hidden records never surface", () => {
  test("a misdelivered hidden captain_prompt changes nothing visible", () => {
    const view = applyRecords(fresh(), [...TURN_ONE, ...HIDDEN_LEAK]);
    const rendered = JSON.stringify({
      captain: view.captain,
      players: view.players,
      draft: view.captainDraft,
    });
    expect(rendered).not.toContain("secret router prompt");
  });
});

describe("RUN-21: awaitBossReply banner and reply routing", () => {
  test("question parks the view with the player identified", () => {
    const view = applyRecords(fresh(), [...TURN_ONE, ...TURN_TWO_QUESTION]);
    expect(view.fsmState).toBe("awaitBossReply");
    expect(view.pendingQuestion).toBe("Which auth flow should I prioritize?");
    expect(view.pendingQuestionPlayer).toBe("dev.reviewer");
  });

  test("the question becomes a bubble, replacing its status echo", () => {
    const view = applyRecords(fresh(), [...TURN_ONE, ...TURN_TWO_QUESTION]);
    const questions = view.captain.filter((line) => line.kind === "question");
    expect(questions).toHaveLength(1);
    expect(questions[0].text).toBe("Which auth flow should I prioritize?");
    expect(questions[0].player).toBe("dev.reviewer");
    // The "◆ … asks:" status narration is replaced, not duplicated.
    expect(
      view.captain.some(
        (line) => line.kind === "status" && line.text.includes("asks:"),
      ),
    ).toBe(false);
  });

  test("a status echo arriving after the telemetry is also dropped", () => {
    const view = applyRecords(fresh(), [...TURN_ONE, ...TURN_TWO_QUESTION]);
    applyRecords(view, [
      {
        seq: 900,
        record: {
          type: "captain_status",
          turnId: 2,
          timestamp: 900,
          message:
            "◆ dev.reviewer asks: Which auth flow should I prioritize?",
        } as unknown as TmuxPlayRecord,
      },
    ]);
    expect(
      view.captain.filter(
        (line) => line.kind === "status" && line.text.includes("asks:"),
      ),
    ).toHaveLength(0);
  });

  test("the reply clears the pending question", () => {
    const view = applyRecords(fresh(), FULL_RUN);
    expect(view.fsmState).toBe("review");
    expect(view.pendingQuestion).toBeUndefined();
    expect(view.pendingQuestionPlayer).toBeUndefined();
  });
});

describe("a pane is a session player, never a guessed one", () => {
  test("a lane resolves to itself; nothing else is guessed into one", () => {
    const view = fresh();
    // The id the roster carries is the pane (DR-032).
    expect(resolvePlayerId(view, "dev.coder")).toBe("dev.coder");
    expect(resolvePlayerId(view, "dev.reviewer")).toBe("dev.reviewer");
    // A bare local role is NOT matched onto a lane by spelling — the
    // suffix heuristic that turned "coder" into "dev.coder" is gone,
    // because v8 resolves the binding and the trace carries both.
    expect(resolvePlayerId(view, "coder")).toBe("coder");
    expect(resolvePlayerId(view, undefined)).toBeUndefined();
  });
});

describe("run-view-1: the playbook-7 shell's captain_reply is Captain speech", () => {
  test("a captain_reply record renders as a speech bubble", () => {
    // The playbook-7 shell speaks through captain_reply while its
    // durable calls stay hidden; before the case existed the reply
    // was dropped and a normal chat rendered nothing at all.
    const view = applyRecords(fresh(), [
      {
        seq: 1,
        record: {
          type: "captain_reply",
          turnId: 1,
          timestamp: 5,
          text: "Happy to help — what should we work on?",
        } as TmuxPlayRecord,
      },
    ]);
    const speech = view.captain.filter((line) => line.kind === "speech");
    expect(speech).toHaveLength(1);
    expect(speech[0].text).toBe("Happy to help — what should we work on?");
  });

  test("a visible errored captain result renders as a failure, not speech", () => {
    const view = applyRecords(fresh(), [
      {
        seq: 1,
        record: {
          type: "captain_finished",
          turnId: 1,
          timestamp: 5,
          result: {
            status: "error",
            error: "Failed to authenticate: OAuth session expired",
            finalText: "Failed to authenticate: OAuth session expired",
          },
        } as TmuxPlayRecord,
      },
    ]);
    expect(view.captain.filter((line) => line.kind === "speech")).toHaveLength(0);
    const errors = view.captain.filter((line) => line.kind === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0].text).toContain("OAuth session expired");
  });
});

describe("RUN-22: abort surfaces the aborted state", () => {
  test("turn_aborted ends the turn with a captain status line", () => {
    const view = applyRecords(fresh(), [
      {
        seq: 1,
        record: {
          type: "turn_started",
          turnId: 1,
          timestamp: 1,
          turn: { id: 1, prompt: "go", timestamp: 1 },
        } as unknown as TmuxPlayRecord,
      },
      {
        seq: 2,
        record: {
          type: "turn_aborted",
          turnId: 1,
          timestamp: 2,
          reason: "aborted",
        } as unknown as TmuxPlayRecord,
      },
    ]);
    expect(view.turnActive).toBe(false);
    expect(
      view.captain.some(
        (line) => line.kind === "status" && line.text.includes("aborted"),
      ),
    ).toBe(true);
  });
});

describe("streaming deltas coalesce", () => {
  test("consecutive deltas build one streaming segment, closed by done", () => {
    const view = fresh();
    applyRecords(view, TURN_ONE.slice(0, 6));
    const coder = view.players["dev.coder"];
    const last = coder.segments[coder.segments.length - 1];
    expect(last.kind === "text" && last.streaming).toBe(true);
    applyRecords(view, TURN_ONE.slice(6));
    const text = coder.segments[1];
    expect(text.kind === "text" && text.streaming).toBe(false);
  });
});

describe("playbook 2.0 shell telemetry: object-shaped states fold safely", () => {
  // Regression: the real captain shell reports states as rich objects
  // ({stateId, value, tags, …}) where the fake harness sends strings;
  // the reducer once passed the object through to the label pipeline,
  // which crashed the render with "e.replace is not a function" and
  // masked the actual turn failure.
  test("object to/from resolve to stateId; error events leave state intact", () => {
    const view = applyRecords(fresh(), [
      {
        seq: 950,
        record: {
          type: "captain_telemetry",
          turnId: 9,
          timestamp: 5000,
          topic: "playbook.fsm.state",
          payload: {
            event: { type: "xstate.init" },
            from: null,
            to: {
              value: "ready",
              activeStateIds: ["ready"],
              tags: ["playbook.parked"],
              status: "active",
              quiescent: true,
              stateId: "ready",
            },
          },
        },
      },
      {
        seq: 951,
        record: {
          type: "captain_telemetry",
          turnId: 9,
          timestamp: 5001,
          topic: "playbook.fsm.state",
          payload: {
            event: {
              type: "xstate.error.actor.0.routing",
              error: { name: "Error", message: "adapter refused" },
            },
            to: { value: { engaged: "routing" }, stateId: "routing" },
          },
        },
      },
      {
        seq: 952,
        record: {
          type: "captain_telemetry",
          turnId: 9,
          timestamp: 5002,
          topic: "playbook.captain.fsm.state",
          payload: { from: "engaged.driving", to: "engaged.parked" },
        },
      },
    ]);
    expect(view.fsmState).toBe("routing");
    expect(view.captainMode).toBe("engaged.parked");
  });

  test("a payload with no resolvable state clears nothing it should not", () => {
    const view = applyRecords(fresh(), [
      {
        seq: 960,
        record: {
          type: "captain_telemetry",
          turnId: 9,
          timestamp: 5010,
          topic: "playbook.fsm.state",
          payload: { event: { type: "noise" }, to: { odd: true } },
        },
      },
    ]);
    expect(view.fsmState).toBeUndefined();
  });
});

describe("DR-032: an unreported figure is silence, never zero", () => {
  test("a done payload reporting no tokens yields no token figures", () => {
    // The runtime tells us tool uses and nothing else; substituting a
    // zero here would invent a measurement nobody made.
    expect(readDoneUsage({ usage: { toolUses: 3 } })).toEqual({ toolUses: 3 });
  });

  test("a cost without a token report still arrives, with its source", () => {
    expect(
      readDoneUsage({
        usage: {
          toolUses: 0,
          cost: { amount: 0.4, currency: "USD", source: "agent-estimate" },
        },
      }),
    ).toEqual({ toolUses: 0, totalCostUsd: 0.4, costSource: "agent-estimate" });
  });

  test("no usage at all is no usage view", () => {
    expect(readDoneUsage({ status: "success" })).toBeUndefined();
  });
});
