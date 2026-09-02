// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The card's dressing of a solved layout (run-view-60/61/76/81): boxes
// as wide as their column's longest label, captions that fall back
// before spilling, rest-state exits, and the scale-or-scroll rule.

import { describe, expect, test } from "vitest";
import type { MachineGraph } from "@sublang/spex-core/protocol";

import codeGraph from "../fixtures/machines/code.json";
import decideGraph from "../fixtures/machines/decide.json";
import { layoutMachine, STATE_W, type MachineFrame } from "./machine-frames.js";
import {
  drawingWidthRule,
  fitCaption,
  fitsByScaling,
  isRestState,
  labelWidth,
  scaleFloor,
  stateCaption,
  widenLayout,
  stateName,
  statePath,
} from "./machine-labels.js";

function frame(over: Partial<MachineFrame> = {}): MachineFrame {
  return {
    traceSessionId: "t",
    playbookId: "code",
    depth: 1,
    active: null,
    visited: [],
    transitions: [],
    activeTags: [],
    calls: [],
    settledCalls: [],
    openedAt: 0,
    ...over,
  };
}

describe("widenLayout", () => {
  const graph = codeGraph as MachineGraph;
  const layout = layoutMachine(graph);

  test("each column takes its longest label's width, from the floor to the cap", () => {
    const widened = widenLayout(layout, graph, frame());
    const reported = widened.nodes.get("reportedReviewFailure")!;
    const ready = widened.nodes.get("ready")!;
    expect(reported.width).toBe(labelWidth("reported review failure"));
    expect(reported.width).toBeGreaterThan(STATE_W);
    // Boxes in one column share the width; another column keeps the
    // floor when nothing in it needs more.
    expect(ready.width).toBe(reported.width);
    const failed = widened.nodes.get("failed")!;
    expect(failed.width).toBe(STATE_W);
    // Columns shift right to make room, and the drawing's width follows.
    expect(failed.x).toBeGreaterThan(layout.nodes.get("failed")!.x);
    expect(widened.width).toBeGreaterThan(layout.width);
    // Rank heights and kinds are the geometry's own, untouched.
    expect(reported.height).toBe(layout.nodes.get("reportedReviewFailure")!.height);
    expect(widened.kinds).toBe(layout.kinds);
  });

  test("a caption the run adds can widen its column once", () => {
    const before = widenLayout(layout, graph, frame());
    const after = widenLayout(
      layout,
      graph,
      frame({
        activePlayer: {
          stateId: "awaitBossReply",
          role: "coder",
          playerId: "dev.coder.with.a.long.lane.name",
          running: true,
        },
      }),
    );
    expect(after.nodes.get("awaitBossReply")!.width).toBeGreaterThan(
      before.nodes.get("awaitBossReply")!.width,
    );
    expect(after.nodes.get("awaitBossReply")!.width).toBeLessThanOrEqual(240);
  });
});

describe("stateCaption and fitCaption", () => {
  test("a call, then the role with its player, then the graph's role", () => {
    const node = { id: "runFirstPhase", kind: "state" as const, role: "coder", tags: [] };
    expect(stateCaption(node, frame())).toEqual({ text: "coder" });
    expect(
      stateCaption(
        node,
        frame({
          activePlayer: {
            stateId: "runFirstPhase",
            role: "coder",
            playerId: "dev.coder",
            running: true,
          },
        }),
      ),
    ).toEqual({ text: "coder · dev.coder", role: "coder" });
    expect(
      stateCaption(
        node,
        frame({ calls: [{ stateId: "runFirstPhase", playbookId: "review" }] }),
      ),
    ).toEqual({ text: "call /review" });
  });

  test("the pair where it fits, the role where it does not, a trim last", () => {
    const pair = { text: "reviewer · dev.reviewer", role: "reviewer" };
    expect(fitCaption(pair, labelWidth("x", pair.text))).toBe(pair.text);
    expect(fitCaption(pair, STATE_W)).toBe("reviewer");
    expect(fitCaption({ text: "a caption nothing holds whole" }, 60)).toMatch(
      /…$/,
    );
  });
});

describe("isRestState", () => {
  test("parked states and failures rest; working and done states do not", () => {
    expect(isRestState({ id: "awaitBossReply", kind: "state", tags: ["playbook.parked"] })).toBe(true);
    expect(isRestState({ id: "reportedReviewFailure", kind: "final", tags: [] })).toBe(true);
    expect(isRestState({ id: "failed", kind: "state", tags: [] })).toBe(true);
    expect(isRestState({ id: "done", kind: "final", tags: [] })).toBe(false);
    expect(isRestState({ id: "runIrTask", kind: "state", tags: ["playbook.busy"] })).toBe(false);
    expect(isRestState(undefined)).toBe(false);
  });
});

describe("the scale-or-scroll rule", () => {
  test("a drawing scales into a pane it exceeds by under a quarter, else scrolls", () => {
    expect(scaleFloor(500)).toBe(400);
    expect(fitsByScaling(500, 600)).toBe(false); // fits as is
    expect(fitsByScaling(500, 450)).toBe(true);
    expect(fitsByScaling(500, 400)).toBe(true);
    expect(fitsByScaling(500, 399)).toBe(false); // scrolls at natural size
  });

  test("the CSS says the same: the floor in the fit, the natural width as the cap", () => {
    const rule = drawingWidthRule(500);
    expect(rule.fit).toBe("clamp(0px, (100cqw - 400px) * 1000000, 1px)");
    expect(rule.width).toBe("min(500px, 100cqw + (1px - var(--fit)) * 1000000)");
    expect(rule.beyond).toContain("var(--fit)");
  });
});

describe("run-view-60: a nested state goes by its own segment", () => {
  const decide = decideGraph as MachineGraph;
  const emptyFrame = {
    calls: [],
    settledCalls: [],
    walked: [],
    fired: [],
  } as unknown as MachineFrame;

  test("the leaf names the box, the path names the tooltip", () => {
    expect(stateName("independentProposals.coder.working")).toBe("working");
    expect(stateName("independentProposals.coder")).toBe("coder");
    expect(stateName("reportedReviewFailure")).toBe("reported review failure");
    expect(statePath("independentProposals.coder.working")).toBe(
      "independent proposals · coder · working",
    );
    expect(statePath("ready")).toBe("ready");
  });

  test("a nested state with no role wears its parent's name", () => {
    const region = decide.nodes.find((n) => n.id === "independentProposals.coder")!;
    const waiting = decide.nodes.find(
      (n) => n.id === "independentProposals.reviewer.waiting",
    )!;
    const working = decide.nodes.find(
      (n) => n.id === "independentProposals.coder.working",
    )!;
    expect(stateCaption(region, emptyFrame)?.text).toBe("independent proposals");
    expect(stateCaption(waiting, emptyFrame)?.text).toBe("reviewer");
    // A role still captions the box it names.
    expect(stateCaption(working, emptyFrame)?.text).toBe("coder");
  });
});
