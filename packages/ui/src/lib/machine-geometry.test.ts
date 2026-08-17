// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// run-view-77: the solved geometry of a drawn machine (DR-031).
// Neighbours draw, distance speaks in words: only edges between
// layout neighbours render as lines, and everything else is an exit
// label inside its source. Two routed-lane attempts before this ended
// in the hairball on the shipped machines, so the law is asserted on
// those machines' served graphs, not only on a fixture.

import { describe, expect, test } from "vitest";
import type { MachineGraph } from "@sublang/spex-core/protocol";

import codeGraph from "../fixtures/machines/code.json";
import reviewGraph from "../fixtures/machines/review.json";
import decideGraph from "../fixtures/machines/decide.json";

import {
  edgeCrossesBox,
  layoutMachine,
  routeEdges,
  type MachineLayout,
  type RoutedEdge,
} from "./machine-frames.js";

const node = (id: string) => ({ id, kind: "state" as const, tags: [] });
const edge = (from: string, to: string, event: string) => ({
  id: `${from}::${event}::0::0`,
  from,
  to,
  event,
});

/** One machine holding every geometry case the law names: neighbour
 * hops, a same-rank pair, a rank skip, a backward return, and a fan
 * into one state. */
const GRAPH: MachineGraph = {
  initial: "ready",
  nodes: ["ready", "work", "alt", "check", "retry", "done", "resume"].map(node),
  edges: [
    edge("ready", "work", "START"),
    edge("ready", "alt", "BRANCH"),
    // A reciprocal same-rank pair.
    edge("work", "alt", "LATERAL"),
    edge("alt", "work", "BACK_LATERAL"),
    // Two drawn heads land on check: the ports must spread.
    edge("work", "check", "NEXT"),
    edge("alt", "check", "JOIN"),
    edge("check", "retry", "FAILED"),
    // A backward neighbour return — drawn upward.
    edge("retry", "check", "AGAIN"),
    // A rank skip and a long return: distance speaks in words.
    edge("ready", "done", "SHORTCUT"),
    edge("retry", "ready", "RESTART"),
    edge("check", "done", "OK"),
    // From an unreached state clear across the drawing.
    edge("resume", "ready", "RESUME"),
  ],
};

function assertLaw(id: string, graph: MachineGraph): {
  layout: MachineLayout;
  lines: RoutedEdge[];
  exits: RoutedEdge[];
} {
  const layout = layoutMachine(graph);
  const routed = routeEdges(graph, layout);

  // Every transition is exactly one drawn line or one exit label.
  const known = new Set(graph.nodes.map((n) => n.id));
  const expected = graph.edges.filter(
    (e) => known.has(e.from) && known.has(e.to),
  );
  expect(routed.map((e) => e.id).sort()).toEqual(
    expected.map((e) => e.id).sort(),
  );
  const lines = routed.filter((e) => e.kind === "line");
  const exits = routed.filter((e) => e.kind === "exit");

  const ports = new Map<string, string>();
  for (const line of lines) {
    const box = layout.nodes.get(line.to)!;
    const head = line.head!;
    if (line.from === line.to) continue;
    // The head lies on its target's border.
    const onVertical =
      Math.abs(head.x - box.x) < 0.01 ||
      Math.abs(head.x - (box.x + box.width)) < 0.01;
    const onHorizontal =
      Math.abs(head.y - box.y) < 0.01 ||
      Math.abs(head.y - (box.y + box.height)) < 0.01;
    expect(onVertical || onHorizontal, `${id}: ${line.id} lands on a border`).toBe(
      true,
    );
    expect(head.x).toBeGreaterThanOrEqual(box.x - 0.01);
    expect(head.x).toBeLessThanOrEqual(box.x + box.width + 0.01);
    expect(head.y).toBeGreaterThanOrEqual(box.y - 0.01);
    expect(head.y).toBeLessThanOrEqual(box.y + box.height + 0.01);
    // At a port no other head shares.
    const port = `${line.to}|${head.x.toFixed(2)},${head.y.toFixed(2)}`;
    expect(
      ports.has(port),
      `${id}: ${line.id} shares a port with ${ports.get(port)}`,
    ).toBe(false);
    ports.set(port, line.id);
    // And its path crosses no state box.
    expect(edgeCrossesBox(line, layout), `${id}: ${line.id} crosses a box`).toBe(
      false,
    );
  }

  // Exit labels name their target from an unshared slot in the source.
  const slots = new Map<string, string>();
  for (const exit of exits) {
    expect(exit.anchor, `${id}: ${exit.id} has an anchor`).toBeTruthy();
    const key = `${exit.from}|${exit.slot}`;
    expect(
      slots.has(key),
      `${id}: ${exit.id} shares a slot with ${slots.get(key)}`,
    ).toBe(false);
    slots.set(key, exit.id);
    // The label sits inside its source box.
    const box = layout.nodes.get(exit.from)!;
    expect(exit.anchor!.x).toBeGreaterThan(box.x);
    expect(exit.anchor!.y).toBeGreaterThan(box.y);
    expect(exit.anchor!.y).toBeLessThan(box.y + box.height);
  }

  return { layout, lines, exits };
}

describe("run-view-77: solved machine geometry", () => {
  test("the fixture partitions into drawn neighbours and worded exits", () => {
    const { lines, exits } = assertLaw("fixture", GRAPH);

    // Neighbour hops draw; the reciprocal pair draws as two paths.
    const ids = (list: RoutedEdge[]) => list.map((e) => e.id);
    expect(ids(lines)).toContain("ready::START::0::0");
    expect(ids(lines)).toContain("retry::AGAIN::0::0");
    const out = lines.find((e) => e.id === "work::LATERAL::0::0");
    const back = lines.find((e) => e.id === "alt::BACK_LATERAL::0::0");
    expect(out && back).toBeTruthy();
    expect(out!.path).not.toBe(back!.path);

    // Distance speaks in words: the skip, the long return, and the
    // edge from the unreached state.
    expect(ids(exits)).toContain("ready::SHORTCUT::0::0");
    expect(ids(exits)).toContain("retry::RESTART::0::0");
    expect(ids(exits)).toContain("resume::RESUME::0::0");
  });

  // The machines that actually ship are the real gate: two routing
  // attempts survived a fixture and failed on these.
  for (const [id, graph] of [
    ["code", codeGraph],
    ["review", reviewGraph],
    ["decide", decideGraph],
  ] as const) {
    test(`${id} holds the law over its served graph`, () => {
      const { lines } = assertLaw(id, graph as MachineGraph);
      // The spine still draws as lines — the drawing keeps its shape.
      expect(lines.length).toBeGreaterThan(3);
    });
  }
});
