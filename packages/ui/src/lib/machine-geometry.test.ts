// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// run-view-77: the routed geometry of a drawn machine (DR-031).
// Arrowheads used to float in empty space — a same-rank edge was
// classified "forward" and looped under its own row, and skip edges
// cut straight through the ranks between. The routing is a pure
// function of the solved layout, so the law is assertable exactly.

import { describe, expect, test } from "vitest";
import type { MachineGraph } from "@sublang/spex-core/protocol";

import codeGraph from "../fixtures/machines/code.json";
import reviewGraph from "../fixtures/machines/review.json";
import decideGraph from "../fixtures/machines/decide.json";

import {
  edgeCrossesBox,
  layoutMachine,
  routeEdges,
} from "./machine-frames.js";

const node = (id: string) => ({ id, kind: "state" as const, tags: [] });
const edge = (from: string, to: string, event: string) => ({
  id: `${from}::${event}::0::0`,
  from,
  to,
  event,
});

/** One machine holding every routing case the law names: two states
 * sharing a rank, a rank-skipping edge, a backward return, and a
 * reciprocal pair. */
const GRAPH: MachineGraph = {
  initial: "ready",
  nodes: ["ready", "work", "alt", "check", "retry", "done", "resume"].map(node),
  edges: [
    // Two states share rank 1, so the edges between them are lateral.
    edge("ready", "work", "START"),
    edge("ready", "alt", "BRANCH"),
    edge("work", "alt", "LATERAL"),
    edge("alt", "work", "BACK_LATERAL"),
    // Two edges land on check's top border: the ports must spread.
    edge("work", "check", "NEXT"),
    edge("alt", "check", "JOIN"),
    edge("check", "retry", "FAILED"),
    // A backward return across ranks takes a side lane.
    edge("retry", "work", "AGAIN"),
    edge("check", "done", "OK"),
    // Reachable from nowhere: it sits below everything, and its edge
    // back to the start spans the whole drawing.
    edge("resume", "ready", "RESUME"),
  ],
};

describe("run-view-77: routed edge geometry", () => {
  const layout = layoutMachine(GRAPH);
  const routed = routeEdges(GRAPH, layout);

  test("every head lands on its target's border", () => {
    expect(routed).toHaveLength(GRAPH.edges.length);
    for (const edgeRoute of routed) {
      const box = layout.nodes.get(edgeRoute.to);
      expect(box, edgeRoute.id).toBeTruthy();
      const { x, y, width, height } = box!;
      const onVertical =
        Math.abs(edgeRoute.head.x - x) < 0.01 ||
        Math.abs(edgeRoute.head.x - (x + width)) < 0.01;
      const onHorizontal =
        Math.abs(edgeRoute.head.y - y) < 0.01 ||
        Math.abs(edgeRoute.head.y - (y + height)) < 0.01;
      expect(onVertical || onHorizontal, `${edgeRoute.id} lands on a border`).toBe(
        true,
      );
      // And within the border's own extent, not past its corner.
      expect(edgeRoute.head.x).toBeGreaterThanOrEqual(x - 0.01);
      expect(edgeRoute.head.x).toBeLessThanOrEqual(x + width + 0.01);
      expect(edgeRoute.head.y).toBeGreaterThanOrEqual(y - 0.01);
      expect(edgeRoute.head.y).toBeLessThanOrEqual(y + height + 0.01);
    }
  });

  test("no two heads on one border coincide", () => {
    const seen = new Map<string, string>();
    for (const edgeRoute of routed) {
      const key = `${edgeRoute.to}:${edgeRoute.side}:${edgeRoute.head.x.toFixed(2)},${edgeRoute.head.y.toFixed(2)}`;
      expect(seen.has(key), `${edgeRoute.id} shares a port with ${seen.get(key)}`).toBe(
        false,
      );
      seen.set(key, edgeRoute.id);
    }
  });

  test("no edge path crosses a state box", () => {
    const crossing = routed.filter((edgeRoute) =>
      edgeCrossesBox(edgeRoute, layout),
    );
    expect(crossing.map((edgeRoute) => edgeRoute.id)).toEqual([]);
  });

  test("a reciprocal pair renders as two distinct paths", () => {
    const out = routed.find((e) => e.from === "work" && e.to === "alt");
    const back = routed.find((e) => e.from === "alt" && e.to === "work");
    expect(out).toBeTruthy();
    expect(back).toBeTruthy();
    expect(out!.path).not.toBe(back!.path);
    // Same-rank neighbours meet across the row: their heads land on
    // the facing side borders, never on a top border below the row —
    // the misclassification that used to strand the arrowhead.
    expect(out!.side).toBe("left");
    expect(back!.side).toBe("right");
  });

  test("a backward return leaves through a rank gap, not across a row", () => {
    const back = routed.find((e) => e.from === "retry" && e.to === "work");
    expect(back).toBeTruthy();
    expect(back!.side).toBe("bottom");
    // Its lane clears every box in the rows it passes, including the
    // sibling sitting beside its source.
    expect(edgeCrossesBox(back!, layout)).toBe(false);
  });
});

// The fixture above holds the cases by construction; the built-ins
// hold the cases that actually shipped — 8 states and 26 edges of
// resume and failure paths, where a curve bulging through a third box
// and a lateral edge cutting through the state between its ends both
// survived a fixture that never posed them.
describe("run-view-77: the law holds on the served built-in machines", () => {
  const graphs = [
    { id: "code", graph: codeGraph as MachineGraph },
    { id: "review", graph: reviewGraph as MachineGraph },
    { id: "decide", graph: decideGraph as MachineGraph },
  ];

  for (const { id, graph } of graphs) {
    test(`${id} draws with every arrow landed and no box crossed`, () => {
      const layout = layoutMachine(graph);
      const routed = routeEdges(graph, layout);
      expect(routed.length).toBeGreaterThan(0);

      const ports = new Map<string, string>();
      for (const edgeRoute of routed) {
        const box = layout.nodes.get(edgeRoute.to);
        expect(box, `${id}: ${edgeRoute.id} targets a placed state`).toBeTruthy();
        const { x, y, width, height } = box!;
        const onVertical =
          Math.abs(edgeRoute.head.x - x) < 0.01 ||
          Math.abs(edgeRoute.head.x - (x + width)) < 0.01;
        const onHorizontal =
          Math.abs(edgeRoute.head.y - y) < 0.01 ||
          Math.abs(edgeRoute.head.y - (y + height)) < 0.01;
        expect(
          onVertical || onHorizontal,
          `${id}: ${edgeRoute.id} lands on a border`,
        ).toBe(true);

        const port = `${edgeRoute.to}|${edgeRoute.head.x.toFixed(2)},${edgeRoute.head.y.toFixed(2)}`;
        expect(
          ports.has(port),
          `${id}: ${edgeRoute.id} shares a port with ${ports.get(port)}`,
        ).toBe(false);
        ports.set(port, edgeRoute.id);

        expect(
          edgeCrossesBox(edgeRoute, layout),
          `${id}: ${edgeRoute.id} crosses a state box`,
        ).toBe(false);
      }
    });
  }
});
