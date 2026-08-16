// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Machine frames (run-view-60..64, 74..78, DR-031): the pure model
// behind the Captain pane's call tree. A frame opens only on evidence
// its run is underway, moves with every fsm.transition, carries the
// player activity of its active state and the call it delegates to,
// and settles under its caller — or into chat history for a root run.
// A settled run is tombstoned, so the reports that trail a finished
// run cannot resurrect it. Folding is pure over the record stream, so
// a replayed session reproduces identical cards (run-view-14).

import type { MachineGraph } from "@sublang/spex-core/protocol";

export interface MachineTransition {
  from: string | null;
  to: string;
  event: string;
  at: number;
}

export interface MachineFrame {
  /** The trace's own session identity — the frame key. */
  traceSessionId: string;
  playbookId: string;
  depth: number;
  parentSessionId?: string;
  /** Active state id (single-region machines; the trace's value). */
  active: string | null;
  /** Every state the run has visited, in first-visit order. */
  visited: string[];
  /** Observed transitions, in order. */
  transitions: MachineTransition[];
  /** The edge fired last, for the flash (owner::event derived). */
  lastFired?: { from: string; to: string; event: string; at: number };
  /** The player the active state runs, when the trace attributes one. */
  activePlayer?: { stateId: string; playerId: string; running: boolean };
  /** The nested run this frame's active state is delegating to, while
   * the call is open (run-view-63). */
  delegating?: { stateId: string; playbookId: string };
  /** The caller's state that started this run, when the pane knows it
   * — the anchor the child settles under (run-view-62/63). */
  callerStateId?: string;
  /** Park/failure coloring hints from the trace's state tags. */
  activeTags: string[];
  /** Runs this frame called that have settled, in invocation order
   * (run-view-62); each carries its own settled calls in turn. */
  settledCalls: MachineFrame[];
  outcome?: "done" | "failed" | "stopped";
  openedAt: number;
  closedAt?: number;
}

/** A closed frame as it settles into the thread (run-view-62). */
export interface MachineHistory {
  frame: MachineFrame;
}

type TraceLike = {
  schemaVersion?: unknown;
  sessionId?: unknown;
  playbookId?: unknown;
  parentSessionId?: unknown;
  depth?: unknown;
  type?: unknown;
  timestamp?: unknown;
  payload?: unknown;
};

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value ? value : undefined;

/** The state value a trace payload names, tolerant of shape drift:
 * strings, {value}, {stateId} all appear across schema versions. */
function stateValue(value: unknown): string | undefined {
  if (typeof value === "string") return value || undefined;
  if (value && typeof value === "object") {
    const shaped = value as { value?: unknown; stateId?: unknown };
    if (typeof shaped.value === "string") return shaped.value || undefined;
    if (typeof shaped.stateId === "string") return shaped.stateId || undefined;
  }
  return undefined;
}

function stateTags(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const tags = (value as { tags?: unknown }).tags;
  return Array.isArray(tags)
    ? tags.filter((t): t is string => typeof t === "string")
    : [];
}

function stateStatus(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  return asString((value as { status?: unknown }).status);
}

/** Which frames draw: real playbook runs. The captain shell's own
 * control loop at depth 0 stays the chip's business (DR-028). */
function drawable(playbookId: string, depth: number): boolean {
  return !(depth === 0 && playbookId === "captain");
}

export interface FrameFoldState {
  open: MachineFrame[];
  /** Trace sessions whose run has settled. A finished run keeps being
   * talked about — its closing status line, its turn settlement, its
   * disposal — and none of that may raise it again (run-view-74). */
  settled: readonly string[];
  /** Set when a fold call settled a root frame: the history entry the
   * reducer turns into a thread line (run-view-62). */
  closed?: MachineFrame;
}

/** The trace types that are evidence a run is underway. Everything
 * else only reports on a run and never opens a frame (run-view-74). */
const OPENING_TYPES = new Set([
  "session.started",
  "fsm.transition",
  "player.call.started",
  "player.call.finished",
  "playbook.call.started",
  "playbook.call.finished",
]);

/** The outcome a reported state status names, if it names one. */
function outcomeOf(status: string | undefined): MachineFrame["outcome"] {
  if (status === "done") return "done";
  if (status === "error") return "failed";
  if (status === "stopped") return "stopped";
  return undefined;
}

/** Folds one playbook.trace payload into the frame tree. Returns the
 * next state; `closed` carries at most the one root frame this record
 * settled. */
export function foldTrace(
  open: readonly MachineFrame[],
  payload: unknown,
  at: number,
  settled: readonly string[] = [],
): FrameFoldState {
  const idle: FrameFoldState = { open: [...open], settled };
  const trace = payload as TraceLike;
  const traceSessionId = asString(trace?.sessionId);
  const playbookId = asString(trace?.playbookId);
  const type = asString(trace?.type);
  if (!traceSessionId || !playbookId || !type) return idle;
  const depth = typeof trace.depth === "number" ? trace.depth : 0;
  if (!drawable(playbookId, depth)) return idle;
  // A settled run is finished with: nothing said afterwards revives it.
  if (settled.includes(traceSessionId)) return idle;

  const index = open.findIndex((f) => f.traceSessionId === traceSessionId);
  const found = index >= 0 ? open[index] : undefined;
  // Only evidence that this run is underway may open its frame.
  if (!found && !OPENING_TYPES.has(type)) return idle;
  const body = (trace.payload ?? {}) as Record<string, unknown>;

  const withFrame = (frame: MachineFrame): FrameFoldState => {
    const next = [...open];
    if (index >= 0) next[index] = frame;
    else {
      next.push(frame);
      next.sort((a, b) => a.depth - b.depth || a.openedAt - b.openedAt);
    }
    return { open: next, settled };
  };

  /** Settle a frame and everything it still has running: a run cannot
   * outlive its caller, and an orphan card would be a lie. */
  const close = (
    frame: MachineFrame,
    outcome: MachineFrame["outcome"],
  ): FrameFoldState => {
    const remaining = open.filter((f) => f.traceSessionId !== traceSessionId);
    const descendants: MachineFrame[] = [];
    const collect = (parentId: string): void => {
      for (const candidate of remaining) {
        if (candidate.parentSessionId !== parentId) continue;
        descendants.push(candidate);
        collect(candidate.traceSessionId);
      }
    };
    collect(frame.traceSessionId);
    const orphaned = new Set(descendants.map((f) => f.traceSessionId));
    const adopt = (parent: MachineFrame): MachineFrame => ({
      ...parent,
      settledCalls: [
        ...parent.settledCalls,
        ...descendants
          .filter((f) => f.parentSessionId === parent.traceSessionId)
          .map((child) =>
            adopt({
              ...child,
              // Still running when its caller ended: unfinished.
              outcome: child.outcome ?? "stopped",
              closedAt: at,
              activePlayer: undefined,
              delegating: undefined,
            }),
          ),
      ],
    });

    const complete = adopt({
      ...frame,
      outcome: frame.outcome ?? outcome,
      closedAt: at,
      activePlayer: undefined,
      delegating: undefined,
    });
    const stillOpen = remaining.filter((f) => !orphaned.has(f.traceSessionId));
    const nextSettled = [
      ...settled,
      complete.traceSessionId,
      ...descendants.map((f) => f.traceSessionId),
    ];

    // A child settles under its caller; only a root run reaches the
    // thread (run-view-62).
    const parentIndex = complete.parentSessionId
      ? stillOpen.findIndex(
          (f) => f.traceSessionId === complete.parentSessionId,
        )
      : -1;
    if (parentIndex >= 0) {
      const parent = stillOpen[parentIndex];
      const next = [...stillOpen];
      next[parentIndex] = {
        ...parent,
        settledCalls: [...parent.settledCalls, complete],
        delegating: undefined,
      };
      return { open: next, settled: nextSettled };
    }
    return { open: stillOpen, settled: nextSettled, closed: complete };
  };

  const opened = (): MachineFrame => {
    if (found) return found;
    const parentSessionId = asString(trace.parentSessionId);
    // The caller records which of its states is delegating; the child
    // reads its anchor from there (run-view-63).
    const caller = parentSessionId
      ? open.find((f) => f.traceSessionId === parentSessionId)
      : undefined;
    const callerStateId =
      caller?.delegating?.playbookId === playbookId
        ? caller.delegating.stateId
        : undefined;
    return {
      traceSessionId,
      playbookId,
      depth,
      ...(parentSessionId ? { parentSessionId } : {}),
      ...(callerStateId ? { callerStateId } : {}),
      active: null,
      visited: [],
      transitions: [],
      activeTags: [],
      settledCalls: [],
      openedAt: at,
    };
  };

  switch (type) {
    case "session.started":
      return withFrame(opened());
    case "fsm.transition": {
      const frame = opened();
      const from = stateValue(body.from) ?? null;
      const to = stateValue(body.to) ?? stateValue(body.state);
      if (!to) return withFrame(frame);
      const transitions = [
        ...frame.transitions,
        {
          from,
          to,
          event:
            asString((body.event as { type?: unknown } | undefined)?.type) ??
            asString(body.event) ??
            "",
          at,
        },
      ];
      const visited = frame.visited.includes(to)
        ? frame.visited
        : [...frame.visited, to];
      const status = stateStatus(body.state);
      const moved: MachineFrame = {
        ...frame,
        active: to,
        visited,
        transitions,
        activeTags: stateTags(body.state),
        ...(from
          ? {
              lastFired: {
                from,
                to,
                event: transitions[transitions.length - 1].event,
                at,
              },
            }
          : {}),
        // A player attributed to a previous state is stale once the
        // machine moves on.
        ...(frame.activePlayer && frame.activePlayer.stateId !== to
          ? { activePlayer: undefined }
          : {}),
      };
      const outcome = outcomeOf(status);
      return outcome ? close(moved, outcome) : withFrame(moved);
    }
    case "player.call.started": {
      const frame = opened();
      const stateId = asString(body.stateId) ?? frame.active ?? undefined;
      const playerId = asString(body.playerId) ?? asString(body.roleId);
      if (!stateId || !playerId) return withFrame(frame);
      return withFrame({
        ...frame,
        activePlayer: { stateId, playerId, running: true },
      });
    }
    case "player.call.finished": {
      const frame = opened();
      if (!frame.activePlayer) return withFrame(frame);
      return withFrame({
        ...frame,
        activePlayer: { ...frame.activePlayer, running: false },
      });
    }
    case "playbook.call.started": {
      const frame = opened();
      const stateId = asString(body.stateId) ?? frame.active ?? undefined;
      const callee = asString(body.playbookId);
      if (!stateId || !callee) return withFrame(frame);
      return withFrame({ ...frame, delegating: { stateId, playbookId: callee } });
    }
    case "playbook.call.finished": {
      const frame = opened();
      return withFrame({ ...frame, delegating: undefined });
    }
    case "session.disposed":
      // Disposal closes only a frame still open, and with the run's
      // own reported status — a finished run is not "stopped".
      return found
        ? close(found, outcomeOf(stateStatus(body.state)) ?? "stopped")
        : idle;
    default:
      // Everything else only reports on a run already underway.
      return found ? withFrame(found) : idle;
  }
}

// --- Layout (DR-028: solved once, tiny and fixed) ---------------------------

export interface MachinePlacement {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MachineLayout {
  nodes: Map<string, MachinePlacement>;
  width: number;
  height: number;
}

export const STATE_W = 128;
export const STATE_H = 40;
/** Ranks run top to bottom: the Captain pane is tall and narrow, so
 * the machine reads down the thread like the conversation does
 * (DR-028). */
export const RANK_GAP = 30;
export const ROW_GAP = 22;

/** The graph a frame draws when no definition is served: the observed
 * states and transitions alone (run-view-64). */
export function observedGraph(frame: MachineFrame): MachineGraph {
  const nodes = frame.visited.map((id) => ({
    id,
    kind: "state" as const,
    tags: [],
  }));
  const seen = new Set<string>();
  const edges = frame.transitions
    .filter((t) => t.from !== null)
    .map((t, i) => ({
      id: `${t.from}::${t.event}::${i}::0`,
      from: t.from as string,
      to: t.to,
      event: t.event,
    }))
    .filter((e) => {
      const key = `${e.from}>${e.to}>${e.event}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const initial = frame.transitions[0]?.from ?? frame.visited[0] ?? "";
  return { initial, nodes, edges };
}

/** Top-to-bottom layered layout: BFS ranks from the initial state,
 * stable sibling order, one barycenter pass — deterministic per
 * machine, nothing physical, nothing tuned (DR-028). */
export function layoutMachine(graph: MachineGraph): MachineLayout {
  const ids = graph.nodes.map((n) => n.id);
  const idSet = new Set(ids);
  const out = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (!idSet.has(edge.from) || !idSet.has(edge.to)) continue;
    const list = out.get(edge.from) ?? [];
    if (!list.includes(edge.to)) list.push(edge.to);
    out.set(edge.from, list);
  }

  // BFS ranks from the initial state; unreached states append as a
  // final rank in declaration order, so nothing is dropped.
  const rank = new Map<string, number>();
  if (idSet.has(graph.initial)) rank.set(graph.initial, 0);
  const queue = idSet.has(graph.initial) ? [graph.initial] : [];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const next of out.get(current) ?? []) {
      if (rank.has(next)) continue;
      rank.set(next, (rank.get(current) ?? 0) + 1);
      queue.push(next);
    }
  }
  const maxRank = Math.max(0, ...rank.values());
  for (const id of ids) {
    if (!rank.has(id)) rank.set(id, maxRank + 1);
  }

  const ranks = new Map<number, string[]>();
  for (const id of ids) {
    const r = rank.get(id) as number;
    const list = ranks.get(r) ?? [];
    list.push(id);
    ranks.set(r, list);
  }

  // One barycenter pass orders each rank by the mean row of its
  // predecessors, ties by declaration order — stable and cheap.
  const rowOf = new Map<string, number>();
  const orderedRanks = [...ranks.keys()].sort((a, b) => a - b);
  for (const r of orderedRanks) {
    const members = ranks.get(r) as string[];
    if (r === orderedRanks[0]) {
      members.forEach((id, i) => rowOf.set(id, i));
      continue;
    }
    const keyed = members.map((id, declared) => {
      const preds = graph.edges
        .filter((e) => e.to === id && (rank.get(e.from) ?? 0) < r)
        .map((e) => rowOf.get(e.from) ?? 0);
      const bary =
        preds.length > 0
          ? preds.reduce((a, b) => a + b, 0) / preds.length
          : declared;
      return { id, bary, declared };
    });
    keyed.sort((a, b) => a.bary - b.bary || a.declared - b.declared);
    keyed.forEach((entry, i) => rowOf.set(entry.id, i));
    ranks.set(
      r,
      keyed.map((entry) => entry.id),
    );
  }

  const nodes = new Map<string, MachinePlacement>();
  let width = 0;
  let height = 0;
  // Rank → row (y), position within rank → column (x): the machine
  // flows downward, and ranks wider than the pane still read as one
  // row of alternatives.
  for (const r of orderedRanks) {
    const members = ranks.get(r) as string[];
    members.forEach((id) => {
      const y = r * (STATE_H + RANK_GAP);
      const x = (rowOf.get(id) ?? 0) * (STATE_W + ROW_GAP);
      nodes.set(id, { x, y, width: STATE_W, height: STATE_H });
      width = Math.max(width, x + STATE_W);
      height = Math.max(height, y + STATE_H);
    });
  }
  return { nodes, width: Math.max(width, 1), height: Math.max(height, 1) };
}

// --- Edge routing (run-view-76: arrows land, edges route) -------------------

/** Where an edge meets a state box, and how it gets there. */
export interface RoutedEdge {
  id: string;
  from: string;
  to: string;
  event: string;
  /** SVG path data, ending exactly on the target's border. */
  path: string;
  /** The landing point — on the target's border, by construction. */
  head: { x: number; y: number };
  /** Which border the head lands on. */
  side: "top" | "bottom" | "left" | "right";
}

/** How far the innermost side lane swings clear of the boxes it
 * passes, and how far apart successive lanes track. */
const LANE = 22;
const LANE_PITCH = 13;
/** Minimum gap between two heads sharing one border. */
const PORT_GAP = 12;

type Box = MachinePlacement;

const centerX = (b: Box): number => b.x + b.width / 2;
const centerY = (b: Box): number => b.y + b.height / 2;

/** True when a segment from a to b passes through the box, ignoring
 * boxes the segment merely touches at its own endpoints. */
function segmentHitsBox(
  a: { x: number; y: number },
  b: { x: number; y: number },
  box: Box,
): boolean {
  // Sample the segment; boxes are large relative to the step, so a
  // handful of points is a faithful test and stays cheap.
  const steps = 24;
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    if (
      x > box.x + 0.5 &&
      x < box.x + box.width - 0.5 &&
      y > box.y + 0.5 &&
      y < box.y + box.height - 0.5
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Route a machine's edges over a solved layout: every head lands on
 * its target's border, heads sharing a border spread across it, and
 * no path crosses a state box (run-view-76). Pure over the layout, so
 * the geometry is assertable without rendering (run-view-77).
 */
export function routeEdges(
  graph: MachineGraph,
  layout: MachineLayout,
): RoutedEdge[] {
  const boxes = [...layout.nodes.values()];
  // Reserve one port per incoming edge on each border, so two heads
  // never land on the same point.
  const incoming = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (!layout.nodes.has(edge.from) || !layout.nodes.has(edge.to)) continue;
    if (edge.from === edge.to) continue;
    const list = incoming.get(edge.to) ?? [];
    list.push(edge.id);
    incoming.set(edge.to, list);
  }

  // Edges that need a side lane get their own track, longest span
  // outermost, so lanes nest instead of piling onto one line.
  const laneOrder = new Map<string, number>();
  const laneCandidates = graph.edges
    .filter((edge) => {
      const from = layout.nodes.get(edge.from);
      const to = layout.nodes.get(edge.to);
      if (!from || !to || edge.from === edge.to) return false;
      if (Math.abs(to.y - from.y) < 1) return false;
      const skip = Math.abs(to.y - from.y) > STATE_H + RANK_GAP + 1;
      return skip || to.y < from.y;
    })
    .map((edge) => {
      const from = layout.nodes.get(edge.from) as Box;
      const to = layout.nodes.get(edge.to) as Box;
      return {
        id: edge.id,
        right: centerX(from) >= centerX(to),
        span: Math.abs(to.y - from.y),
      };
    });
  for (const facing of [true, false]) {
    laneCandidates
      .filter((candidate) => candidate.right === facing)
      .sort((a, b) => b.span - a.span || a.id.localeCompare(b.id))
      .forEach((candidate, index) => laneOrder.set(candidate.id, index));
  }

  /** The border an edge lands on — one definition, so an edge and the
   * siblings it shares a border with always agree. */
  const sideOf = (from: Box, to: Box): RoutedEdge["side"] => {
    const sameRank = Math.abs(to.y - from.y) < 1;
    if (sameRank) {
      const blocked = boxes.some(
        (box) =>
          box !== from &&
          box !== to &&
          Math.abs(box.y - from.y) < 1 &&
          box.x > Math.min(from.x, to.x) &&
          box.x + box.width < Math.max(from.x + from.width, to.x + to.width),
      );
      if (blocked) return "top";
      return centerX(to) >= centerX(from) ? "left" : "right";
    }
    return to.y > from.y ? "top" : "bottom";
  };

  const routed: RoutedEdge[] = [];
  for (const edge of graph.edges) {
    const from = layout.nodes.get(edge.from);
    const to = layout.nodes.get(edge.to);
    if (!from || !to) continue;

    if (edge.from === edge.to) {
      // A self-loop arcs beside its own state and lands back on it.
      const head = { x: from.x + from.width, y: from.y + from.height * 0.72 };
      routed.push({
        id: edge.id,
        from: edge.from,
        to: edge.to,
        event: edge.event,
        side: "right",
        head,
        path:
          `M ${from.x + from.width} ${from.y + from.height * 0.28}` +
          ` C ${from.x + from.width + 26} ${from.y}` +
          ` ${from.x + from.width + 26} ${from.y + from.height}` +
          ` ${head.x} ${head.y}`,
      });
      continue;
    }

    const sameRank = Math.abs(to.y - from.y) < 1;
    const side = sideOf(from, to);
    // Same-rank neighbours meet across the row; same-rank states with
    // something standing between them must go over it, not through it.
    const between = sameRank && side === "top";
    const lateral = sameRank && !between;
    const forward = to.y > from.y;

    // Spread the heads that share this border.
    const siblings = incoming.get(edge.to) ?? [];
    const onSide = siblings.filter((id) => {
      const other = graph.edges.find((e) => e.id === id);
      const otherFrom = other ? layout.nodes.get(other.from) : undefined;
      return otherFrom !== undefined && sideOf(otherFrom, to) === side;
    });
    const slot = Math.max(0, onSide.indexOf(edge.id));
    const span = side === "top" || side === "bottom" ? to.width : to.height;
    const usable = Math.max(PORT_GAP, span - 2 * PORT_GAP);
    const offset =
      onSide.length <= 1
        ? span / 2
        : PORT_GAP + (usable * slot) / (onSide.length - 1);

    const head =
      side === "top"
        ? { x: to.x + offset, y: to.y }
        : side === "bottom"
          ? { x: to.x + offset, y: to.y + to.height }
          : side === "left"
            ? { x: to.x, y: to.y + offset }
            : { x: to.x + to.width, y: to.y + offset };

    // The tail leaves the source on the border facing the target.
    const tail = lateral
      ? centerX(to) >= centerX(from)
        ? { x: from.x + from.width, y: centerY(from) }
        : { x: from.x, y: centerY(from) }
      : forward
        ? { x: centerX(from), y: from.y + from.height }
        : { x: centerX(from), y: from.y };

    const rankSkip = Math.abs(to.y - from.y) > STATE_H + RANK_GAP + 1;
    // The clearance test walks the curve the path actually draws, not
    // the straight line between its ends: a cubic bulges, and a bulge
    // through a third box is exactly what the law forbids.
    const control = [
      tail,
      { x: tail.x, y: tail.y + 14 },
      { x: head.x, y: head.y - 14 },
      head,
    ];
    const straightClear =
      !lateral &&
      !rankSkip &&
      forward &&
      !boxes.some(
        (box) =>
          box !== from &&
          box !== to &&
          control.some((point, i) =>
            i + 1 < control.length
              ? segmentHitsBox(point, control[i + 1], box)
              : false,
          ),
      );

    let path: string;
    if (between) {
      // Over the row: up into the gap above, across, and down onto the
      // target's top border — never through the state in between.
      const gapY = from.y - RANK_GAP / 2;
      path =
        `M ${centerX(from)} ${from.y}` +
        ` L ${centerX(from)} ${gapY}` +
        ` L ${head.x} ${gapY}` +
        ` L ${head.x} ${head.y}`;
    } else if (straightClear) {
      // A clean one-rank hop reads best as a plain curve.
      path = `M ${tail.x} ${tail.y} C ${tail.x} ${tail.y + 14} ${head.x} ${head.y - 14} ${head.x} ${head.y}`;
    } else if (lateral) {
      // Same-rank neighbours meet across the row, never looping under
      // it — the case that used to draw a head into empty space.
      const dip = Math.min(18, Math.abs(head.x - tail.x) / 3 + 6);
      path = `M ${tail.x} ${tail.y} C ${tail.x + (head.x - tail.x) / 3} ${tail.y - dip} ${head.x - (head.x - tail.x) / 3} ${head.y - dip} ${head.x} ${head.y}`;
    } else {
      // Skips and returns take a side lane. The lane runs beside every
      // box whose rows it passes — clearing only the two endpoints
      // would cut straight through their neighbours — and it reaches
      // that lane through the gaps between ranks, never across a row.
      const spanTop = Math.min(from.y, to.y);
      const spanBottom = Math.max(from.y + from.height, to.y + to.height);
      const crossed = boxes.filter(
        (box) => box.y < spanBottom + 1 && box.y + box.height > spanTop - 1,
      );
      const goRight = centerX(from) >= centerX(to);
      const track = laneOrder.get(edge.id) ?? 0;
      const reach = LANE + track * LANE_PITCH;
      const laneX = goRight
        ? Math.max(...crossed.map((box) => box.x + box.width)) + reach
        : Math.min(...crossed.map((box) => box.x)) - reach;

      // Leave through the gap on the side the target lies, and arrive
      // through the gap on the target's landing border.
      // Successive lanes also spread within the rank gaps they share,
      // so their horizontal runs never lie on top of one another.
      const gap = 9 + (track % 2) * 7;
      const exit = forward
        ? { x: centerX(from), y: from.y + from.height }
        : { x: centerX(from), y: from.y };
      const exitLane = forward ? exit.y + gap : exit.y - gap;
      const approachLane = side === "bottom" ? head.y + gap : head.y - gap;
      path =
        `M ${exit.x} ${exit.y}` +
        ` L ${exit.x} ${exitLane}` +
        ` L ${laneX} ${exitLane}` +
        ` L ${laneX} ${approachLane}` +
        ` L ${head.x} ${approachLane}` +
        ` L ${head.x} ${head.y}`;
    }

    routed.push({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      event: edge.event,
      path,
      head,
      side,
    });
  }

  // Reciprocal pairs stay apart: nudge the second of a mirrored pair.
  const seen = new Map<string, RoutedEdge>();
  for (const edge of routed) {
    const key = `${edge.from}>${edge.to}`;
    const mirror = seen.get(`${edge.to}>${edge.from}`);
    if (mirror && mirror.path === edge.path) {
      edge.path = edge.path.replace(/^M ([\d.-]+) ([\d.-]+)/, (_m, x, y) =>
        `M ${Number(x) + 6} ${Number(y)}`,
      );
    }
    seen.set(key, edge);
  }
  return routed;
}

/** True when a routed path visibly crosses a state box it neither
 * starts nor ends at — the invariant run-view-76 forbids. */
export function edgeCrossesBox(
  edge: RoutedEdge,
  layout: MachineLayout,
): boolean {
  const points = samplePath(edge.path);
  for (const [id, box] of layout.nodes) {
    if (id === edge.from || id === edge.to) continue;
    for (const point of points) {
      if (
        point.x > box.x + 0.5 &&
        point.x < box.x + box.width - 0.5 &&
        point.y > box.y + 0.5 &&
        point.y < box.y + box.height - 0.5
      ) {
        return true;
      }
    }
  }
  return false;
}

/** Flatten an SVG path of M/C/L commands into sample points — enough
 * to test containment without a DOM. */
export function samplePath(path: string): { x: number; y: number }[] {
  const numbers = path.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) {
    points.push({ x: numbers[i], y: numbers[i + 1] });
  }
  if (points.length < 2) return points;
  // Sample between successive control points; a control polygon that
  // clears every box implies the curve does too, for these shapes.
  const dense: { x: number; y: number }[] = [];
  for (let i = 0; i + 1 < points.length; i += 1) {
    for (let step = 0; step <= 12; step += 1) {
      const t = step / 12;
      dense.push({
        x: points[i].x + (points[i + 1].x - points[i].x) * t,
        y: points[i].y + (points[i + 1].y - points[i].y) * t,
      });
    }
  }
  return dense;
}
