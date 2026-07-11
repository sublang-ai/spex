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
  };
}

describe("DASH-15: attention derivation and ordering", () => {
  test("question outranks failure outranks idle", () => {
    const questionView = applyRecords(
      initialSessionView(PLAYERS, INITIAL_VISIBLE),
      [...TURN_ONE, ...TURN_TWO_QUESTION],
    );
    const idleView = applyRecords(
      initialSessionView(PLAYERS, INITIAL_VISIBLE),
      TURN_ONE,
    );
    const failedView = applyRecords(
      initialSessionView(PLAYERS, INITIAL_VISIBLE),
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
      initialSessionView(PLAYERS, INITIAL_VISIBLE),
      FULL_RUN,
    );
    const items = deriveAttention([session("s")], { s: view });
    expect(items.every((item) => item.kind !== "question")).toBe(true);
  });
});

describe("dead sessions produce no attention", () => {
  test("non-live sessions are skipped", () => {
    const view = applyRecords(
      initialSessionView(PLAYERS, INITIAL_VISIBLE),
      [...TURN_ONE, ...TURN_TWO_QUESTION],
    );
    const ended = { ...session("s"), live: false };
    expect(deriveAttention([ended], { s: view })).toEqual([]);
  });
});
