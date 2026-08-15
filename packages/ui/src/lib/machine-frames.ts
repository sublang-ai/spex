// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Machine frames (run-view-60..64, DR-028): the pure model behind the
// Captain pane's statechart cards. A frame opens when a playbook
// run's trace starts, moves with every fsm.transition, carries the
// player activity of its active state, and closes into chat history
// when the run settles. Folding is pure over the record stream, so a
// replayed session reproduces identical cards (run-view-14).

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
  /** Park/failure coloring hints from the trace's state tags. */
  activeTags: string[];
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
  /** Set when a fold call closed a frame: the settled history entry
   * the reducer turns into a thread line (run-view-62). */
  closed?: MachineFrame;
}

/** Folds one playbook.trace payload into the open frames. Returns the
 * next state; `closed` carries at most the one frame this record
 * settled. */
export function foldTrace(
  open: readonly MachineFrame[],
  payload: unknown,
  at: number,
): FrameFoldState {
  const trace = payload as TraceLike;
  const traceSessionId = asString(trace?.sessionId);
  const playbookId = asString(trace?.playbookId);
  const type = asString(trace?.type);
  if (!traceSessionId || !playbookId || !type) return { open: [...open] };
  const depth = typeof trace.depth === "number" ? trace.depth : 0;
  if (!drawable(playbookId, depth)) return { open: [...open] };

  const index = open.findIndex((f) => f.traceSessionId === traceSessionId);
  const found = index >= 0 ? open[index] : undefined;
  const body = (trace.payload ?? {}) as Record<string, unknown>;

  const withFrame = (frame: MachineFrame): FrameFoldState => {
    const next = [...open];
    if (index >= 0) next[index] = frame;
    else {
      next.push(frame);
      next.sort((a, b) => a.depth - b.depth || a.openedAt - b.openedAt);
    }
    return { open: next };
  };

  const close = (
    frame: MachineFrame,
    outcome: MachineFrame["outcome"],
  ): FrameFoldState => {
    const settled: MachineFrame = {
      ...frame,
      outcome: frame.outcome ?? outcome,
      closedAt: at,
      activePlayer: undefined,
    };
    return {
      open: open.filter((f) => f.traceSessionId !== traceSessionId),
      closed: settled,
    };
  };

  const opened = (): MachineFrame =>
    found ?? {
      traceSessionId,
      playbookId,
      depth,
      ...(asString(trace.parentSessionId)
        ? { parentSessionId: asString(trace.parentSessionId) }
        : {}),
      active: null,
      visited: [],
      transitions: [],
      activeTags: [],
      openedAt: at,
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
      if (status === "done") return close(moved, "done");
      if (status === "error") return close(moved, "failed");
      if (status === "stopped") return close(moved, "stopped");
      return withFrame(moved);
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
    case "session.disposed":
      return found ? close(found, found.outcome ?? "stopped") : { open: [...open] };
    default:
      return withFrame(opened());
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

/** Left-to-right layered layout: BFS ranks from the initial state,
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
