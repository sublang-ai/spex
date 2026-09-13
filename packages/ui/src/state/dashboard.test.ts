// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// DASH-15/16 coverage: attention ordering from fixture streams and
// clearing when the question is answered.

import { describe, expect, test } from "vitest";
import type { SessionInfo } from "@sublang/spex-core/protocol";

import { deriveAttention } from "./dashboard.js";
import { applyRecords, initialSessionView } from "./reducer.js";
import {
  FULL_RUN,
  INITIAL_VISIBLE,
  MACHINE_ANSWERED,
  MACHINE_FAILED,
  MACHINE_RECOVERED,
  PLAYERS,
  TURN_ONE,
  TURN_TWO_QUESTION,
} from "../fixtures/sample-run.js";

function session(id: string): SessionInfo {
  return {
    id,
    projectId: `p-${id}`,
    projectPath: `/tmp/${id}`,
    createdAt: 0,
    live: true,
    endedAt: null,
    players: PLAYERS,
    initialVisible: INITIAL_VISIBLE,
    turns: 0,
    failed: false,
  };
}

describe("DASH-15: attention derivation and ordering", () => {
  test("question outranks failure outranks idle", () => {
    const questionView = applyRecords(
      initialSessionView(PLAYERS),
      [...TURN_ONE, ...TURN_TWO_QUESTION],
    );
    const idleView = applyRecords(
      initialSessionView(PLAYERS),
      TURN_ONE,
    );
    const failedView = applyRecords(
      initialSessionView(PLAYERS),
      TURN_ONE,
    );
    failedView.captain.push({
      kind: "error",
      text: "runtime exploded",
      turnId: 1,
      at: 1,
    });

    const items = deriveAttention(
      [session("idle"), session("failed"), session("asking")],
      {
        idle: idleView,
        failed: failedView,
        asking: questionView,
      },
    );
    expect(items.map((item) => item.kind)).toEqual([
      "question",
      "failure",
      "idle",
    ]);
    expect(items[0].text).toContain("Which auth flow");
  });
});

describe("DASH-16: answering clears the question item", () => {
  test("after the reply turn the session degrades to idle attention", () => {
    const view = applyRecords(
      initialSessionView(PLAYERS),
      FULL_RUN,
    );
    const items = deriveAttention([session("s")], { s: view });
    expect(items.every((item) => item.kind !== "question")).toBe(true);
  });
});

describe("dead sessions produce no attention", () => {
  test("non-live sessions are skipped", () => {
    const view = applyRecords(
      initialSessionView(PLAYERS),
      [...TURN_ONE, ...TURN_TWO_QUESTION],
    );
    const ended = { ...session("s"), live: false };
    expect(deriveAttention([ended], { s: view })).toEqual([]);
  });
});

describe("run-view-133: a parked run summons until it leaves its failure state", () => {
  const kinds = (view: ReturnType<typeof initialSessionView>) =>
    deriveAttention([session("s")], { s: view }).map((item) => item.kind);

  test("the run's own frames answer, not the session's last reported state", () => {
    const parked = applyRecords(initialSessionView(PLAYERS), MACHINE_FAILED);
    // The Captain shell's own machine reported last, on the topic the
    // leaf had just used (DR-061), and it parked no run.
    expect(parked.fsmState).toBe("hub");
    expect(kinds(parked)).toEqual(["failure"]);

    // A later turn settles with no failure of its own: the workflow is
    // still parked, so the summons stands with the notice.
    const answered = applyRecords(
      initialSessionView(PLAYERS),
      [...MACHINE_FAILED, ...MACHINE_ANSWERED],
    );
    expect(kinds(answered)).toEqual(["failure"]);

    // The run leaves `failed`: nothing is owed but a look at the work.
    const recovered = applyRecords(
      initialSessionView(PLAYERS),
      [...MACHINE_FAILED, ...MACHINE_ANSWERED, ...MACHINE_RECOVERED],
    );
    expect(kinds(recovered)).toEqual(["idle"]);
  });
});
