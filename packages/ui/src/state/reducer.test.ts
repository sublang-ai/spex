// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// RUN-19/20/21/22 reducer coverage against the recorded fixture.

import { describe, expect, test } from "vitest";

import {
  applyRecords,
  initialSessionView,
  resolvePlayerId,
} from "./reducer.js";
import {
  FULL_RUN,
  HIDDEN_LEAK,
  INITIAL_VISIBLE,
  PLAYERS,
  TURN_ONE,
  TURN_TWO_QUESTION,
} from "../fixtures/sample-run.js";
import type { TmuxPlayRecord } from "@sublang/spex-core/protocol";

function fresh() {
  return initialSessionView(PLAYERS, INITIAL_VISIBLE);
}

describe("RUN-19: fixture stream renders expected pane structure", () => {
  test("turn one produces coder transcript segments in order", () => {
    const view = applyRecords(fresh(), TURN_ONE);
    const coder = view.players["code-coder"];
    expect(coder.segments.map((s) => s.kind)).toEqual([
      "prompt",
      "text",
      "tool",
      "thinking",
      "result",
    ]);
    const text = coder.segments[1];
    expect(text.kind === "text" && text.text).toBe(
      "Looking at the **auth** module.",
    );
    const tool = coder.segments[2];
    expect(tool.kind === "tool" && tool.status).toBe("success");
    const result = coder.segments[4];
    expect(result.kind === "result" && result.usage?.totalCostUsd).toBe(0.05);
    expect(view.captain.some((line) => line.text === "◇ /code started")).toBe(
      true,
    );
    expect(view.fsmState).toBe("ready");
    expect(view.turnActive).toBe(false);
    expect(view.visible).toEqual(["code-coder", "code-reviewer"]);
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
    expect(view.pendingQuestionPlayer).toBe("code-reviewer");
  });

  test("the question becomes a bubble, replacing its status echo", () => {
    const view = applyRecords(fresh(), [...TURN_ONE, ...TURN_TWO_QUESTION]);
    const questions = view.captain.filter((line) => line.kind === "question");
    expect(questions).toHaveLength(1);
    expect(questions[0].text).toBe("Which auth flow should I prioritize?");
    expect(questions[0].player).toBe("code-reviewer");
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
            "◆ code-reviewer asks: Which auth flow should I prioritize?",
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

describe("one name per agent: runtime roles resolve to pane ids", () => {
  test("a bare role name resolves to the suffix-matching pane", () => {
    const view = fresh();
    expect(resolvePlayerId(view, "coder")).toBe("code-coder");
    expect(resolvePlayerId(view, "code-reviewer")).toBe("code-reviewer");
    expect(resolvePlayerId(view, "committer")).toBe("committer");
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
    const coder = view.players["code-coder"];
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
