// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The package citation graph (spec-view-20 and spec-view-22 through
// spec-view-29): one node per spec file, one directed edge per
// citing→cited pair. Under meta-14 every peer reliance is a citation,
// so this graph is the complete architecture.
//
// Every encoding here answers DR-026 as DR-158 amends it: node area
// counts items and says so with a numeral; at rest the backbone draws
// one undirected line per strong pair, and a selection draws its own
// citations directed, with the counts written beside its neighbors'
// names and in a list rather than encoded in width; the two roles are
// achromatic so brand purple stays interaction's alone; names take a
// free place or wait; and every channel is keyed below the picture.
// The pane is layered: controls that change the picture above it, a
// key that changes nothing below it, and one package card, floating
// beside an inspected node and pinned for the selection. Layout and camera come from d3-force and d3-zoom; the
// rendering stays ours.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { select } from "d3-selection";
import { zoom as d3Zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from "d3-zoom";
import type { SpecFileInfo } from "@sublang/spex-core/protocol";
import {
  buildGraphModel,
  createSimulation,
  drawnAt,
  placeLabels,
  presentLayout,
  settle,
  stopAt,
  EDGE_WIDTH,
  GRAPH_GROUP_ORDER,
  LABEL_FONT_SIZE,
  type GraphEdge,
  type GraphNode,
  type GraphPair,
  type LabelRequest,
  type Placement,
} from "../lib/spec-graph-layout.js";
import { GROUP_NAME, GROUP_WORD, type SpecGroup } from "../lib/spec-view-model.js";
import { i18n } from "../i18n.js";

export {
  buildGraphModel,
  stopAt,
  type GraphEdge,
  type GraphNode,
} from "../lib/spec-graph-layout.js";

/** The card waits for the pointer to settle, so crossing the canvas
 * does not flash a card per mark (spec-view-26). */
const HOVER_DELAY_MS = 130;

/** The card's shape before it has been measured — the width its class
 * asks for, and a height under its smallest form (spec-view-26). */
const CARD_SIZE = { width: 224, height: 132 };
/** Breathing room between the card and the edge of the graph pane. */
const CARD_GAP = 8;

/**
 * Where the details card sits in the graph pane: centred on its mark,
 * moved in so the whole card lies inside the pane (spec-view-26). The
 * card's own measured size decides — a guessed half-width paints it
 * over the outline beside the pane at either edge.
 */
export function cardPlacement(
  anchor: { left: number; top: number },
  pane: { width: number; height: number },
  card: { width: number; height: number },
): { left: number; top: number } {
  const half = Math.min(card.width, pane.width) / 2;
  return {
    left: Math.min(Math.max(anchor.left, half), Math.max(pane.width - half, half)),
    top: Math.max(
      Math.min(anchor.top, pane.height - card.height - CARD_GAP),
      CARD_GAP,
    ),
  };
}
/** How far the selection halo reaches past a node's rim: its offset
 * and half its stroke. */
const HALO_REACH = 6;

type Box = { x0: number; y0: number; x1: number; y1: number };

/** What a floating package card would rather not cover, mildest first:
 * the pinned card, the selected node and its name, the inspected
 * node's own name, the inspected node itself (spec-view-26). */
export type CardObstacles = {
  pinned: Box | null;
  selection: readonly Box[];
  label: Box | null;
  node: Box;
};

const overlaps = (a: Box, b: Box) =>
  a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** Lexicographic order on scores, telling sub-pixel noise from a
 * real difference. */
function ranksBefore(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < a.length; i++) {
    const delta = (a[i] ?? 0) - (b[i] ?? 0);
    if (Math.abs(delta) > 1e-6) return delta < 0;
  }
  return false;
}

const overlapArea = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) *
  Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

/**
 * Where a node's floating card stands: above or below the node, wholly
 * inside `view`, at the place that covers least by the order of
 * yielding — the pinned card gives way first, the node itself last
 * (spec-view-26). Each place is scored by what it covers, gravest
 * first; ties go to the place covering less of the node, then to the
 * one nearest centred on it, below before above. Returns the card's
 * top-left corner.
 */
export function floatingCardPlacement(
  card: { width: number; height: number },
  view: Box,
  obstacles: CardObstacles,
  gap: number,
): { left: number; top: number } {
  const { node, label, selection, pinned } = obstacles;
  const centre = (node.x0 + node.x1) / 2;
  const lefts = [centre - card.width / 2];
  for (const box of [pinned, label, ...selection]) {
    if (box) lefts.push(box.x0 - gap - card.width, box.x1 + gap);
  }
  const tops = [node.y1 + gap, node.y0 - gap - card.height];
  const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), Math.max(max, min));
  type Scored = { left: number; top: number; key: number[] };
  let best: Scored | null = null;
  for (const [side, rawTop] of tops.entries()) {
    for (const rawLeft of lefts) {
      const left = clamp(rawLeft, view.x0 + gap, view.x1 - gap - card.width);
      const top = clamp(rawTop, view.y0 + gap, view.y1 - gap - card.height);
      const box = { x0: left, y0: top, x1: left + card.width, y1: top + card.height };
      const key = [
        overlaps(box, node) ? 1 : 0,
        label && overlaps(box, label) ? 1 : 0,
        selection.some((mark) => overlaps(box, mark)) ? 1 : 0,
        pinned && overlaps(box, pinned) ? 1 : 0,
        overlapArea(box, node),
        Math.abs(left + card.width / 2 - centre),
        side,
      ];
      if (!best || ranksBefore(key, best.key)) best = { left, top, key };
    }
  }
  return { left: best!.left, top: best!.top };
}

/** Where edges stop short of a ringed node's rim: past the halo or
 * focus ring with a little air, so no ring covers a glyph
 * (spec-view-23). */
const HALO_CLEARANCE = HALO_REACH + 2;

/** What a reveal leaves between the selected node and the frame's
 * edge or the panel (spec-view-43). */
const REVEAL_GAP = 5;

/** How far past the fitted whole the camera may zoom in. The base
 * picture is the fit, so the reader's transform starts at identity
 * and only ever adds to it (spec-view-27). */
const MAX_ZOOM_FACTOR = 4;

/**
 * Bounds the camera by the fitted frame — the pane at identity — so
 * the view overlaps it by at least half the view's own extent on each
 * axis (spec-view-27). In pane pixels the view spans [−t/k, (span−t)/k],
 * which keeps the half overlap while t lies in [span/2 − k·span,
 * span/2]. The bound depends on the frame alone, never on how far the
 * layout reaches, so a tree of one package pans as freely as a large
 * one, and every reveal pan — at most half a view — lies inside it.
 */
export function boundCamera(
  transform: ZoomTransform,
  frame: { width: number; height: number },
): ZoomTransform {
  const clamp = (value: number, span: number) =>
    Math.min(span / 2, Math.max(span / 2 - transform.k * span, value));
  const x = clamp(transform.x, frame.width);
  const y = clamp(transform.y, frame.height);
  return x === transform.x && y === transform.y
    ? transform
    : zoomIdentity.translate(x, y).scale(transform.k);
}

/**
 * The least move that brings `box` inside `view` and clear of `panel`,
 * each by `gap` (spec-view-43). The panel stands in the view's
 * top-right corner, so the box clears it by passing below it or to its
 * left; of the moves that fit, the shortest wins, and where none fits
 * the move below the panel still keeps the two apart. Null when the
 * box already stands clear.
 */
export function revealShift(
  box: Box,
  view: Box,
  panel: Box | null,
  gap: number,
): { dx: number; dy: number } | null {
  const into = (lo: number, hi: number, min: number, max: number) =>
    lo < min ? Math.min(min - lo, max - hi) : hi > max ? Math.max(max - hi, min - lo) : 0;
  const inside = {
    dx: into(box.x0, box.x1, view.x0 + gap, view.x1 - gap),
    dy: into(box.y0, box.y1, view.y0 + gap, view.y1 - gap),
  };
  const clear = (dx: number, dy: number) =>
    !panel ||
    box.x1 + dx + gap <= panel.x0 ||
    box.x0 + dx - gap >= panel.x1 ||
    box.y1 + dy + gap <= panel.y0 ||
    box.y0 + dy - gap >= panel.y1;
  const fits = (dx: number, dy: number) =>
    box.x0 + dx >= view.x0 + gap - 0.5 &&
    box.x1 + dx <= view.x1 - gap + 0.5 &&
    box.y0 + dy >= view.y0 + gap - 0.5 &&
    box.y1 + dy <= view.y1 - gap + 0.5;
  if (clear(inside.dx, inside.dy)) {
    return inside.dx === 0 && inside.dy === 0 ? null : inside;
  }
  const below = { dx: inside.dx, dy: panel!.y1 + gap - box.y0 };
  const left = { dx: panel!.x0 - gap - box.x1, dy: inside.dy };
  const moves = [below, left]
    .filter((move) => fits(move.dx, move.dy))
    .sort((a, b) => Math.hypot(a.dx, a.dy) - Math.hypot(b.dx, b.dy));
  return moves[0] ?? below;
}

/** Group hues for the card's breakdown, matching the outline's chips
 * (spec-view-2): color is never the only channel — every count keeps
 * its group word. */
const GROUP_TEXT: Record<SpecGroup, string> = {
  external: "text-sky-700 dark:text-sky-300",
  internal: "text-fuchsia-700 dark:text-fuchsia-300",
  test: "text-teal-700 dark:text-teal-300",
};

/** One direction of a pair as a sentence — "a cites b 4 times" —
 * since an arrow between two names reads as nothing in particular
 * (spec-view-26). */
function citesTimes(from: string, to: string, count: number): string {
  return i18n._({
    id: "{from} cites {to} {count, plural, one {# time} other {# times}}",
    comment: "graph edge card: one package's citations of another",
    values: { from, to, count },
  });
}

/**
 * A package card's lines, the same floating or pinned: the name on one
 * line; the item total and both citation counts in ink, in the item
 * rows' own grammar, on at most two; then one line per item group, its
 * count in a column just past the longest name (spec-view-26). Color
 * is the groups' alone, so the interaction hue never reads as a fourth
 * group. Text cut to its line keeps its whole in the DOM and the hover
 * hint, and a count is never the part cut.
 */
function PackageLines({ node }: { node: GraphNode }) {
  const items = i18n._("{count, plural, one {# item} other {# items}}", {
    count: node.items,
  });
  const totals = `${items} · ${
    node.linked
      ? i18n._("cites {out} · cited by {in}", { out: node.outbound, in: node.inbound })
      : i18n._("No citations with other packages")
  }`;
  return (
    <>
      <div
        title={node.basename}
        className="truncate font-medium text-neutral-900 dark:text-neutral-100"
      >
        {node.basename}
      </div>
      <div
        data-testid="graph-card-totals"
        title={totals}
        className="mt-0.5 line-clamp-2 text-neutral-600 dark:text-neutral-300"
      >
        {totals}
      </div>
      <ul className="mt-1 grid grid-cols-[minmax(0,max-content)_max-content] gap-x-4 gap-y-0.5">
        {GRAPH_GROUP_ORDER.map((group) => (
          <li
            key={group}
            className="col-span-2 grid grid-cols-subgrid"
            aria-label={i18n._("{count} {group} items", {
              count: node.groups[group],
              group: GROUP_WORD[group](),
            })}
          >
            <span title={GROUP_NAME[group]()} className={`min-w-0 truncate ${GROUP_TEXT[group]}`}>
              {GROUP_NAME[group]()}
            </span>
            <span
              className={`text-right tabular-nums ${
                node.groups[group] === 0
                  ? "text-neutral-500 dark:text-neutral-500"
                  : "text-neutral-700 dark:text-neutral-200"
              }`}
            >
              {node.groups[group] === 0 ? "—" : node.groups[group]}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

/** A short run of a selection edge with its arrowhead, keying its hue
 * in the sentence above the graph (spec-view-66). */
function LineSample({ own }: { own: boolean }) {
  return (
    <svg viewBox="0 0 18 8" className="h-2 w-[18px] shrink-0" aria-hidden="true">
      <line
        x1="0"
        y1="4"
        x2="13"
        y2="4"
        strokeWidth={EDGE_WIDTH}
        className={own ? CITES_STROKE : CITER_STROKE}
      />
      <path d="M 11 0.5 L 18 4 L 11 7.5 z" className={own ? CITES_FILL : CITER_FILL} />
    </svg>
  );
}

/** Ink at text-grade contrast on both grounds. The roles are
 * achromatic by design (DR-026 §2): the palette's hues are spoken for
 * — brand purple is interaction, sky/fuchsia/teal are the item
 * groups, emerald/amber/red are status — and a gray *category* would
 * collide with the dim treatment, so the two roles differ by fill
 * treatment instead: solid ink where peers cite, ink ring on a tinted
 * fill where none do. */
const INK_FILL = "fill-neutral-700 dark:fill-neutral-200";
const INK_STROKE = "stroke-neutral-700 dark:stroke-neutral-200";
const TINT_FILL = "fill-neutral-100 dark:fill-neutral-800";
const SURFACE_FILL = "fill-neutral-50 dark:fill-neutral-950";
const SURFACE_STROKE = "stroke-neutral-50 dark:stroke-neutral-950";
/** The resting backbone: a mid-gray clearing the 3:1 floor on both
 * grounds (spec-view-39). */
const EDGE_STROKE = "stroke-neutral-500";
/** The selection's own citations: orange, a hue outside every
 * reserved set and far from the item groups' (DR-158 §11). */
const CITES_STROKE = "stroke-orange-700 dark:stroke-orange-400";
const CITES_FILL = "fill-orange-700 dark:fill-orange-400";
/** Keyboard focus: the app's one focus hue (DR-013). */
const FOCUS_STROKE = "stroke-brand-600 dark:stroke-brand-400";
/** What cites the selection: ink, apart from orange by hue rather
 * than by a lighter gray reading as de-emphasis (spec-view-23). */
const CITER_STROKE = "stroke-neutral-700 dark:stroke-neutral-200";
const CITER_FILL = "fill-neutral-700 dark:fill-neutral-200";
const CITER_TEXT = "fill-neutral-700 dark:fill-neutral-200";

/** Opacity of a mark outside the selection's neighborhood. Only this
 * transient state may fall under the contrast floor (spec-view-39). */
const DIM_OPACITY = 0.15;
/** A selection edge while the relationship panel lifts another
 * neighbor's (spec-view-25). */
const UNLIFTED_OPACITY = 0.3;

/** What the pointer or keyboard inspects: a node, a directed edge
 * ("source--target"), or a backbone pair ("a--b"). */
type Inspection = { kind: "node" | "edge" | "pair"; id: string } | null;

let measureCanvas: CanvasRenderingContext2D | null | undefined;

/** Measures a label in the font the graph actually renders. A
 * headless renderer has no 2D context, so it falls back to a
 * deterministic estimate — the layout stays a pure function of the
 * tree and whatever metrics the environment reports (spec-view-28). */
function measureLabel(text: string): number {
  if (measureCanvas === undefined) {
    try {
      const canvas = document.createElement("canvas");
      measureCanvas = canvas.getContext("2d");
      if (measureCanvas) {
        const font = getComputedStyle(document.body).fontFamily || "sans-serif";
        measureCanvas.font = `${LABEL_FONT_SIZE}px ${font}`;
      }
    } catch {
      measureCanvas = null;
    }
  }
  const measured = measureCanvas?.measureText(text).width;
  return measured && measured > 0 ? measured : text.length * 6.4;
}

/** Pointer identity, tolerating environments that dispatch pointer
 * events without a PointerEvent interface behind them. */
function pointerIdOf(event: { pointerId?: number }): number {
  return event.pointerId ?? 0;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * The threshold's number field: up and down through the stops that
 * change the picture, by its arrows, the arrow keys, Home and End, or a
 * typed number taking the stop that draws the same lines
 * (spec-view-66).
 */
function ThresholdField({
  stops,
  value,
  onChange,
  valueText,
}: {
  stops: readonly number[];
  value: number;
  onChange: (stop: number) => void;
  valueText: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const index = stops.indexOf(value);
  const first = stops[0] ?? 1;
  const last = stops[stops.length - 1] ?? 1;
  const step = (by: number) => {
    const next = stops[Math.min(Math.max(index + by, 0), stops.length - 1)];
    if (next !== undefined && next !== value) onChange(next);
  };
  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    const typed = Number.parseInt(draft, 10);
    if (Number.isFinite(typed)) onChange(stopAt(stops, typed));
  };
  const arrow =
    "flex h-3.5 w-4 items-center justify-center text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 disabled:pointer-events-none disabled:opacity-35 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100";
  return (
    <span className="inline-flex h-7 shrink-0 items-stretch overflow-hidden rounded-md border border-neutral-300 bg-white focus-within:border-brand-600 focus-within:ring-1 focus-within:ring-brand-600 dark:border-neutral-700 dark:bg-neutral-900 dark:focus-within:border-brand-400 dark:focus-within:ring-brand-400">
      <input
        type="text"
        inputMode="numeric"
        role="spinbutton"
        data-testid="graph-threshold"
        aria-label={i18n._({
          id: "Minimum citations per pair",
          comment: "graph threshold field: the fewest citations a drawn package pair has",
        })}
        aria-valuemin={first}
        aria-valuemax={last}
        aria-valuenow={value}
        aria-valuetext={valueText}
        value={draft ?? String(value)}
        size={Math.max(2, String(last).length)}
        onChange={(event) => setDraft(event.currentTarget.value.replace(/[^0-9]/g, ""))}
        onBlur={commit}
        onKeyDown={(event) => {
          const moves: Record<string, () => void> = {
            ArrowUp: () => step(1),
            ArrowDown: () => step(-1),
            Home: () => onChange(first),
            End: () => onChange(last),
            Enter: commit,
          };
          const move = moves[event.key];
          if (!move) return;
          event.preventDefault();
          if (event.key !== "Enter") setDraft(null);
          move();
        }}
        className="w-8 bg-transparent px-1 text-center text-sm tabular-nums text-neutral-800 outline-none dark:text-neutral-100"
      />
      <span className="flex flex-col border-l border-neutral-300 dark:border-neutral-700">
        <button
          type="button"
          tabIndex={-1}
          data-testid="graph-threshold-up"
          aria-label={i18n._("Raise the threshold")}
          disabled={value >= last}
          onClick={() => step(1)}
          className={arrow}
        >
          <svg viewBox="0 0 10 6" className="h-1.5 w-2.5" aria-hidden="true">
            <path d="M1 5l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
        <button
          type="button"
          tabIndex={-1}
          data-testid="graph-threshold-down"
          aria-label={i18n._("Lower the threshold")}
          disabled={value <= first}
          onClick={() => step(-1)}
          className={`${arrow} border-t border-neutral-300 dark:border-neutral-700`}
        >
          <svg viewBox="0 0 10 6" className="h-1.5 w-2.5" aria-hidden="true">
            <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </span>
    </span>
  );
}

/** Stands in for the number field while the sentence is translated, so
 * each language keeps its own word order around it. */
const FIELD_MARK = "\u0001";

export interface SpecGraphProps {
  files: readonly SpecFileInfo[];
  /** The package selected in either projection; emphasized here and
   * expanded in the outline — one selection, two projections. */
  selectedKey?: string | null;
  /** Packages holding search matches, marked without moving a node
   * (spec-view-29). */
  matchedKeys?: ReadonlySet<string>;
  /** Whether a search is running at all. */
  searching?: boolean;
  /** Open this file in the outline beside the graph. */
  onOpenFile: (fileKey: string) => void;
  /** Activating empty space clears the selection. */
  onClearSelection?: () => void;
}

export function SpecGraph({
  files,
  selectedKey,
  matchedKeys,
  searching = false,
  onOpenFile,
  onClearSelection,
}: SpecGraphProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  /** The pane's visible frame: what the panel, the card and the fades
   * stand against while the drawing scrolls beneath (spec-view-59). */
  const frameRef = useRef<HTMLDivElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  /** Set once the reader moves the camera; suspends auto-fit until
   * the fit control brings it back (spec-view-27). */
  const movedRef = useRef(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const [size, setSize] = useState({ width: 0, height: 0 });
  /** The frame's visible width and how far the drawing has scrolled
   * under it; equal to the drawing's width unless the pane is narrower
   * than the drawing's 320px floor (spec-view-59). */
  const [visible, setVisible] = useState({ width: 0, left: 0 });
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);
  const transformRef = useRef(transform);
  transformRef.current = transform;
  /** The camera before the first reveal pan since the selection was
   * last clear, and whether the reader has moved it since: clearing
   * returns it only if not (spec-view-27). */
  const revealRef = useRef<{ saved: ZoomTransform | null; moved: boolean }>({
    saved: null,
    moved: false,
  });
  const [hover, setHover] = useState<Inspection>(null);
  const [keyFocus, setKeyFocus] = useState<string | null>(null);
  /** A focused node whose card Escape closed: it stays closed until
   * focus moves on, the selection's clearing included (spec-view-25). */
  const [dismissed, setDismissed] = useState<string | null>(null);
  // Bumped by simulation ticks: node positions live on the datum
  // objects the simulation mutates, so a counter is what tells React
  // a settled frame changed.
  const [frame, setFrame] = useState(0);
  /** The scale in force while a drag runs, so moving one node never
   * resizes the whole canvas (spec-view-28). */
  const heldScale = useRef<number | undefined>(undefined);

  // The model and its settled layout: rebuilt only when the tree
  // changes, so a drag never survives a remount (spec-view-28).
  const { model, simulation } = useMemo(() => {
    const next = buildGraphModel(files, measureLabel);
    const sim = createSimulation(next);
    settle(sim);
    return { model: next, simulation: sim };
  }, [files]);

  useEffect(() => {
    const sim = simulation;
    sim.on("tick", () => setFrame((frame) => frame + 1));
    return () => {
      sim.on("tick", null);
      sim.stop();
    };
  }, [simulation]);

  // The picture: the settled arrangement mapped onto this pane, with
  // its one solved mark scale. Pure in (arrangement, pane), so it is
  // the base the reader's camera composes over (spec-view-28).
  // The frame counter is a dependency on purpose: the simulation
  // mutates node positions in place, so a tick is the only signal
  // that the arrangement — and therefore the picture — moved.
  const presentation = useMemo(
    () => presentLayout(model.nodes, size, measureLabel, heldScale.current),
    [model, size, frame],
  );
  const placeOf = useCallback(
    (key: string): Placement | undefined => presentation.places.get(key),
    [presentation],
  );

  /** The fitted whole is the identity transform: the presentation
   * already fills the pane, so the camera only ever carries the
   * reader's own pan and zoom on top (spec-view-27). */
  const applyFit = useCallback(() => {
    const svg = svgRef.current;
    const behavior = zoomRef.current;
    if (!svg || !behavior) return;
    movedRef.current = false;
    revealRef.current.moved = true;
    select(svg).call(behavior.transform, zoomIdentity);
  }, []);

  // Track the drawing surface — the svg itself, not the container it
  // shares with the legend, or the picture would be laid out against a
  // viewport taller than it can paint (spec-view-27).
  useEffect(() => {
    const element = svgRef.current;
    const scroller = scrollerRef.current;
    if (!element) return;
    const read = () => {
      const box = element.getBoundingClientRect();
      setSize({ width: box.width, height: box.height });
      setVisible({
        width: scroller?.clientWidth || box.width,
        left: scroller?.scrollLeft ?? 0,
      });
    };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(read);
    observer.observe(element);
    if (scroller) observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  // The camera: d3-zoom owns pan and zoom-toward-pointer, bounded
  // between the fitted whole and a detail limit. Because the base is
  // the fit, a pane change re-lays the base while the reader's own
  // transform rides along unchanged (spec-view-27).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const behavior = d3Zoom<SVGSVGElement, unknown>()
      // The pane is the viewport: stated outright rather than read
      // back off the SVG's geometry attributes.
      .extent((): [[number, number], [number, number]] => [
        [0, 0],
        [size.width, size.height],
      ])
      .scaleExtent([1, MAX_ZOOM_FACTOR])
      .constrain((next) => boundCamera(next, size))
      .filter((event: Event) => {
        // A press on a node starts a drag, never a pan.
        const target = event.target as Element | null;
        if (target?.closest?.("[data-graph-node]")) return false;
        return !(event as MouseEvent).button;
      })
      .on("zoom", (event: { transform: ZoomTransform; sourceEvent: unknown }) => {
        if (event.sourceEvent) {
          movedRef.current = true;
          revealRef.current.moved = true;
        }
        setTransform(event.transform);
      });
    zoomRef.current = behavior;
    const selection = select(svg);
    selection.call(behavior);
    return () => {
      selection.on(".zoom", null);
      zoomRef.current = null;
    };
  }, [size.width, size.height]);

  // --- Emphasis (spec-view-25) ---------------------------------------------

  const selectedName = useMemo(
    () => model.nodes.find((node) => node.key === selectedKey)?.basename ?? null,
    [model, selectedKey],
  );

  // The selection alone isolates; hover and keyboard focus inspect and
  // leave the picture whole (spec-view-25).
  const selectionEdges = useMemo(
    () =>
      selectedName
        ? model.edges.filter(
            (edge) =>
              edge.sourceKey === selectedName || edge.targetKey === selectedName,
          )
        : [],
    [model, selectedName],
  );

  /** Each neighbor's counts against the selection: `in` its citations
   * of the selection, `out` the selection's citations of it. */
  const neighbors = useMemo(() => {
    const counts = new Map<string, { in: number; out: number }>();
    for (const edge of selectionEdges) {
      const out = edge.sourceKey === selectedName;
      const other = out ? edge.targetKey : edge.sourceKey;
      const entry = counts.get(other) ?? { in: 0, out: 0 };
      if (out) entry.out += edge.weight;
      else entry.in += edge.weight;
      counts.set(other, entry);
    }
    return counts;
  }, [selectionEdges, selectedName]);

  const neighborhood = useMemo(() => {
    if (!selectedName) return null;
    return new Set([selectedName, ...neighbors.keys()]);
  }, [selectedName, neighbors]);

  /** The neighbor the citation list lifts, while one of its entries
   * holds focus or the pointer (spec-view-25). */
  const [lifted, setLifted] = useState<string | null>(null);
  useEffect(() => setLifted(null), [selectedName]);

  const setHoverSoon = useCallback((next: Inspection) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHover(next), HOVER_DELAY_MS);
  }, []);

  const clearHover = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setHover(null);
  }, []);

  useEffect(() => () => clearTimeout(hoverTimer.current), []);

  // --- Drag (spec-view-28) --------------------------------------------------

  const dragging = useRef<{
    node: GraphNode;
    pointer: number;
    startX: number;
    startY: number;
  } | null>(null);
  /** The node a pointer is pressing, so the focus the press gives it
   * is told from a keyboard's (spec-view-26). */
  const pressedRef = useRef<string | null>(null);
  /** Set once a press travels far enough to be a drag, so releasing
   * it moves the node instead of opening its file. */
  const draggedRef = useRef(false);
  const reduced = prefersReducedMotion();

  const onNodePointerDown = (
    event: ReactPointerEvent<SVGGElement>,
    node: GraphNode,
  ) => {
    // A non-primary button never drags; a synthetic pointer event
    // carries no button at all, which counts as primary.
    if (event.button) return;
    event.stopPropagation();
    // A foot-row package stands outside the arrangement, so there is
    // nothing for a drag to move (spec-view-28).
    if (!node.linked) return;
    heldScale.current = presentation.scale;
    dragging.current = {
      node,
      pointer: pointerIdOf(event),
      startX: event.clientX,
      startY: event.clientY,
    };
    draggedRef.current = false;
    try {
      (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    } catch {
      // Capture is a convenience: without it the drag still tracks
      // while the pointer stays over the surface.
    }
    node.fx = node.x;
    node.fy = node.y;
  };

  const onNodePointerMove = (event: ReactPointerEvent<SVGGElement>) => {
    const active = dragging.current;
    if (!active || active.pointer !== pointerIdOf(event)) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    // The pointer lands in presentation pixels; the simulation holds
    // model space, so the camera and then the presentation are both
    // inverted before the arrangement hears about it.
    const [px, py] = transform.invert([
      event.clientX - rect.left,
      event.clientY - rect.top,
    ]);
    const { x, y } = presentation.toModel(px, py);
    // A pointer without usable coordinates must never reach the
    // simulation: one NaN there poisons the whole arrangement.
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (
      Math.abs(event.clientX - active.startX) +
        Math.abs(event.clientY - active.startY) >
      3
    ) {
      // The layout adjusts live around the held node once the press
      // travels — a click that selects moves no mark (spec-view-25);
      // under reduced motion only the node itself moves and the rest
      // re-settles once on release (DR-026 §6).
      if (!draggedRef.current && !reduced) simulation.alphaTarget(0.28).restart();
      draggedRef.current = true;
    }
    if (!draggedRef.current) return;
    // The held node follows the pointer this frame; the simulation's
    // own ticks carry the rest of the layout after it.
    active.node.fx = x;
    active.node.fy = y;
    active.node.x = x;
    active.node.y = y;
    setFrame((frame) => frame + 1);
  };

  const endDrag = (event: ReactPointerEvent<SVGGElement>) => {
    const active = dragging.current;
    if (!active || active.pointer !== pointerIdOf(event)) return;
    dragging.current = null;
    heldScale.current = undefined;
    active.node.fx = null;
    active.node.fy = null;
    // A press that never travelled moved nothing to settle.
    if (!draggedRef.current) return;
    // Release and cool: the layout comes to rest, and nothing about
    // the drag is kept (spec-view-28).
    if (reduced) {
      settle(simulation);
      setFrame((frame) => frame + 1);
    } else {
      simulation.alphaTarget(0);
    }
  };

  // --- Keyboard (spec-view-25, spec-view-27) --------------------------------

  const zoomBy = useCallback((factor: number) => {
    const svg = svgRef.current;
    const behavior = zoomRef.current;
    if (!svg || !behavior) return;
    movedRef.current = true;
    revealRef.current.moved = true;
    select(svg).call(behavior.scaleBy, factor);
  }, []);

  const panBy = useCallback((dx: number, dy: number) => {
    const svg = svgRef.current;
    const behavior = zoomRef.current;
    if (!svg || !behavior) return;
    movedRef.current = true;
    revealRef.current.moved = true;
    select(svg).call(behavior.translateBy, dx, dy);
  }, []);

  const onSurfaceKeyDown = (event: ReactKeyboardEvent) => {
    switch (event.key) {
      case "Escape":
        // A floating card first, then the selection it sits over, the
        // pointer's and the keyboard's alike; focus stays where it is
        // and its card stays closed (spec-view-25).
        if (hover && cardSource === "hover") {
          event.preventDefault();
          clearHover();
        } else if (cardSource === "focus" && keyFocus) {
          event.preventDefault();
          setDismissed(keyFocus);
        } else if (selectedName) {
          event.preventDefault();
          clearHover();
          if (keyFocus) setDismissed(keyFocus);
          onClearSelection?.();
        }
        return;
      case "+":
      case "=":
        event.preventDefault();
        zoomBy(1.25);
        return;
      case "-":
        event.preventDefault();
        zoomBy(0.8);
        return;
      case "0":
        event.preventDefault();
        applyFit();
        return;
      case "ArrowLeft":
        event.preventDefault();
        panBy(40, 0);
        return;
      case "ArrowRight":
        event.preventDefault();
        panBy(-40, 0);
        return;
      case "ArrowUp":
        event.preventDefault();
        panBy(0, 40);
        return;
      case "ArrowDown":
        event.preventDefault();
        panBy(0, -40);
        return;
      default:
    }
  };

  // --- Card (spec-view-26) --------------------------------------------------

  // The selected node's card is already pinned, so it never floats a
  // second one (spec-view-26).
  const cardNode = useMemo(() => {
    const id =
      hover?.kind === "node"
        ? hover.id
        : keyFocus !== dismissed
          ? keyFocus
          : null;
    if (!id || id === selectedName) return null;
    return model.nodes.find((node) => node.basename === id) ?? null;
  }, [hover, keyFocus, dismissed, selectedName, model]);

  const cardEdge = useMemo(() => {
    if (hover?.kind !== "edge") return null;
    const [source, target] = hover.id.split("--");
    return (
      model.edges.find(
        (edge) => edge.sourceKey === source && edge.targetKey === target,
      ) ?? null
    );
  }, [hover, model]);

  const cardPair = useMemo((): GraphPair | null => {
    if (hover?.kind !== "pair") return null;
    const [a, b] = hover.id.split("--");
    return model.pairs.find((pair) => pair.a === a && pair.b === b) ?? null;
  }, [hover, model]);

  /** Whose gesture holds the floating card: the pointer's, which
   * Escape closes by dropping the hover, or a keyboard focus's, which
   * it closes in place. */
  const cardSource: "hover" | "focus" | null =
    cardEdge || cardPair || (cardNode && hover?.kind === "node")
      ? "hover"
      : cardNode
        ? "focus"
        : null;

  const nodeAt = (basename: string): GraphNode | undefined =>
    model.nodes.find((node) => node.basename === basename);

  // A line's card stands in the visible frame, so a drawing scrolled
  // sideways beneath it is read back to the frame's own pixels
  // (spec-view-59). A node's card is placed by what it covers, below.
  const cardAnchor = (): { left: number; top: number } | null => {
    const anchor = cardEdge
      ? nodeAt(cardEdge.targetKey)
      : cardPair
        ? nodeAt(cardPair.b)
        : null;
    const place = anchor ? placeOf(anchor.key) : undefined;
    if (!place) return null;
    const [x, y] = transform.apply([place.x, place.y]);
    return { left: x - visible.left, top: y + place.r * transform.k + 14 };
  };

  const anchor = cardAnchor();

  // The card's height varies with its lines, and its width with a
  // narrow pane, so both are read back rather than assumed.
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardBox, setCardBox] = useState(CARD_SIZE);
  useLayoutEffect(() => {
    const box = cardRef.current?.getBoundingClientRect();
    if (!box || box.width <= 0 || box.height <= 0) return;
    setCardBox((current) =>
      current.width === box.width && current.height === box.height
        ? current
        : { width: box.width, height: box.height },
    );
  }, [cardNode, cardEdge, cardPair, size.width, size.height]);

  // --- Threshold (spec-view-66) ----------------------------------------------

  /** The reader's stop, or null for the default; it lasts while the
   * view stays open, and a selection only sets it aside. */
  const [chosen, setChosen] = useState<number | null>(null);
  const threshold = stopAt(model.stops, chosen ?? model.defaultThreshold);
  const drawnPairs = model.pairs.filter((pair) => drawnAt(pair, threshold));
  const firstStop = model.stops[0] ?? 1;
  const lastStop = model.stops[model.stops.length - 1] ?? 1;
  /** At its ends the sentence says what the number cannot: everything,
   * or each package's strongest pair alone. */
  const thresholdNote =
    threshold === firstStop
      ? i18n._({ id: "(all pairs)", comment: "graph threshold at its lowest: every pair draws" })
      : threshold === lastStop
        ? i18n._({
            id: "(each package's strongest only)",
            comment: "graph threshold at its highest: only each package's heaviest pair draws",
          })
        : null;
  const [thresholdBefore, thresholdAfter] = i18n
    ._({
      id: "Only pairs with ≥ {field} {count, plural, one {citation} other {citations}}",
      comment: "graph threshold sentence; {field} is the number field holding {count}",
      values: { field: FIELD_MARK, count: threshold },
    })
    .split(FIELD_MARK);
  const thresholdText = `${thresholdBefore ?? ""}${threshold}${thresholdAfter ?? ""}${
    thresholdNote ? ` ${thresholdNote}` : ""
  }`;
  /** Whether the citation list is open: closed at first, then as the
   * reader left it across selections while the view stays open
   * (spec-view-25). */
  const [listOpen, setListOpen] = useState(false);
  /** The fit control rests while the camera already shows the fitted
   * frame (spec-view-27). */
  const atFit =
    Math.abs(transform.k - 1) < 1e-3 &&
    Math.abs(transform.x) < 0.5 &&
    Math.abs(transform.y) < 0.5;

  // --- Render ----------------------------------------------------------------

  /** Dimming belongs to the selection alone; inspection lifts the
   * mark it reads so a keyboard walk never parks on a ghost
   * (spec-view-25). */
  const inspected = hover?.kind === "node" ? hover.id : keyFocus;
  const dimOf = (name: string): number =>
    neighborhood && !neighborhood.has(name) && name !== inspected
      ? DIM_OPACITY
      : 1;

  /** A line between two placed marks, trimmed to their rims and moved
   * off the centre line by `spread` along the pair's canonical
   * perpendicular, so a reciprocal pair's two edges land on opposite
   * sides instead of both flipping with their own heading. */
  const lineBetween = (
    from: string,
    to: string,
    spread: number,
    headRoom: number,
  ) => {
    const sourceNode = nodeAt(from);
    const targetNode = nodeAt(to);
    const source = sourceNode ? placeOf(sourceNode.key) : undefined;
    const target = targetNode ? placeOf(targetNode.key) : undefined;
    if (!source || !target) return null;
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const length = Math.sqrt(dx * dx + dy * dy) || 1;
    const ux = dx / length;
    const uy = dy / length;
    const forward = from < to;
    const ox = (forward ? -uy : uy) * spread;
    const oy = (forward ? ux : -ux) * spread;
    // A ring — the selection's halo or the focus ring — stands off its
    // node's rim; edges stop outside it.
    const ringed = (name: string) =>
      name === selectedName || name === keyFocus || name === lifted;
    const start = source.r + (ringed(from) ? HALO_CLEARANCE : 0);
    const end = target.r + headRoom + (ringed(to) ? HALO_CLEARANCE : 0);
    return {
      x1: source.x + ux * start + ox,
      y1: source.y + uy * start + oy,
      x2: target.x - ux * end + ox,
      y2: target.y - uy * end + oy,
    };
  };

  // At rest the backbone draws one undirected line per pair at the
  // reader's threshold; with a selection, only its own citations draw,
  // directed (spec-view-23).
  const backbone = selectedName
    ? []
    : drawnPairs.map((pair) => ({ pair, line: lineBetween(pair.a, pair.b, 0, 0) }));
  const directed = selectionEdges.map((edge) => ({
    edge,
    // A reciprocal pair separates by a fixed offset: width is uniform,
    // so the gap need not follow it.
    line: lineBetween(edge.sourceKey, edge.targetKey, edge.offset * 3.5, 1),
  }));
  const segments = [
    ...backbone.map(({ line }) => line),
    ...directed.map(({ line }) => line),
  ]
    .filter((line): line is NonNullable<typeof line> => line !== null)
    .map(({ x1, y1, x2, y2 }) => [x1, y1, x2, y2] as const);

  /** A neighbor's label carries its counts against the selection —
   * `→N` the selection's citations of it, then `←N` its citations of
   * the selection, in the order every other count reads (spec-view-25). */
  const labelParts = (name: string, label: string) => {
    const counts = neighbors.get(name);
    return {
      label,
      cited: counts && counts.in > 0 ? ` ←${counts.in}` : "",
      cites: counts && counts.out > 0 ? ` →${counts.out}` : "",
    };
  };

  // Names are placed around the picture as drawn: the selection's
  // first and always, then its neighbors, then the rest by size; a
  // name with no free place waits (spec-view-22). An inspected name
  // without a place joins last, over the rest, so a hover never moves
  // another name.
  const labelBoxes = useMemo(() => {
    const request = (node: GraphNode, forced: boolean): LabelRequest[] => {
      const place = placeOf(node.key);
      if (!place) return [];
      const parts = labelParts(node.basename, place.label);
      const text = `${parts.label}${parts.cites}${parts.cited}`;
      return [
        {
          key: node.key,
          width: text === place.label ? place.labelWidth : measureLabel(text),
          forced,
          priority: (neighborhood?.has(node.basename) ? 1e6 : 0) + node.items,
          bottom: node.linked ? presentation.footTop : undefined,
        },
      ];
    };
    const boxes = placeLabels(
      model.nodes.flatMap((node) => request(node, node.basename === selectedName)),
      presentation.places,
      segments,
      size,
    );
    const looked = inspected ? nodeAt(inspected) : undefined;
    if (looked && !boxes.has(looked.key)) {
      const [box] = placeLabels(
        request(looked, true),
        presentation.places,
        segments,
        size,
      ).values();
      if (box) boxes.set(looked.key, box);
    }
    return boxes;
    // segments, labelParts and nodeAt follow from the dependencies
    // listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, presentation, size, selectedName, inspected, neighbors, neighborhood, threshold]);

  const relationships = [...neighbors.entries()].sort(
    (a, b) =>
      b[1].in + b[1].out - (a[1].in + a[1].out) || (a[0] < b[0] ? -1 : 1),
  );
  const selectedNode = selectedName ? nodeAt(selectedName) : undefined;

  // --- Reveal (spec-view-43, spec-view-27) -----------------------------------

  /** Brings the selected node and its name into the frame and clear of
   * the panel: the drawing scrolls sideways first, then the camera
   * pans the least that clears the panel — never zooming, never
   * counting as the reader's move. The camera before the first such
   * pan is kept, so clearing the selection can return it. */
  const reveal = useCallback(() => {
    const node = selectedNode;
    const svg = svgRef.current;
    const behavior = zoomRef.current;
    const scroller = scrollerRef.current;
    const frame = frameRef.current;
    if (!node || !svg || !behavior || !frame || size.width <= 0) return;
    const place = placeOf(node.key);
    if (!place) return;
    const t = transformRef.current;
    const label = labelBoxes.get(node.key);
    const [cx, cy] = t.apply([place.x, place.y]);
    // The selection's halo is part of the node as drawn.
    const r = (place.r + HALO_REACH) * t.k;
    const box = {
      x0: Math.min(cx - r, label ? t.applyX(label.x) : Infinity),
      y0: Math.min(cy - r, label ? t.applyY(label.y) : Infinity),
      x1: Math.max(cx + r, label ? t.applyX(label.x + label.width) : -Infinity),
      y1: Math.max(cy + r, label ? t.applyY(label.y + label.height) : -Infinity),
    };
    // Sideways first: the drawing's own scroll, where it has one.
    let left = scroller?.scrollLeft ?? 0;
    const width = scroller?.clientWidth || size.width;
    if (scroller && scroller.scrollWidth > width + 0.5) {
      const room = width - 2 * REVEAL_GAP;
      const wanted =
        box.x1 - box.x0 <= room
          ? Math.min(Math.max(left, box.x1 + REVEAL_GAP - width), box.x0 - REVEAL_GAP)
          : box.x0 - REVEAL_GAP;
      left = Math.min(Math.max(0, wanted), scroller.scrollWidth - width);
      scroller.scrollLeft = left;
    }
    const frameBox = frame.getBoundingClientRect();
    const panelBox = panelRef.current?.getBoundingClientRect();
    const panel = panelBox
      ? {
          x0: panelBox.left - frameBox.left + left,
          y0: panelBox.top - frameBox.top,
          x1: panelBox.right - frameBox.left + left,
          y1: panelBox.bottom - frameBox.top,
        }
      : null;
    const view = { x0: left, y0: 0, x1: left + width, y1: size.height };
    const shift = revealShift(box, view, panel, REVEAL_GAP);
    if (!shift) return;
    if (!revealRef.current.saved) {
      revealRef.current = { saved: t, moved: false };
    }
    select(svg).call(
      behavior.transform,
      zoomIdentity.translate(t.x + shift.dx, t.y + shift.dy).scale(t.k),
    );
    // labelBoxes rides the same frame as placeOf.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNode, placeOf, size, labelBoxes]);

  // A new selection reveals once its panel stands; clearing it returns
  // the camera unless the reader moved it meanwhile.
  useLayoutEffect(() => {
    if (selectedName) {
      reveal();
      return;
    }
    const { saved, moved } = revealRef.current;
    revealRef.current = { saved: null, moved: false };
    const svg = svgRef.current;
    const behavior = zoomRef.current;
    if (saved && !moved && svg && behavior) {
      select(svg).call(behavior.transform, saved);
    }
    // Reveal on the selection's change alone, not on every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedName]);

  /** The pinned card's box in frame pixels, read back after each
   * render: the floating card yields to it, and a change of its size
   * while the selection holds — the list opening or closing, the
   * language, the canvas — reveals again (spec-view-43). The list's
   * state rides along with the size, standing in for it where layout
   * is not measured. */
  const [pinnedBox, setPinnedBox] = useState<Box | null>(null);
  const pinnedShape = useRef<string | null>(null);
  useLayoutEffect(() => {
    const card = panelRef.current;
    const frame = frameRef.current;
    if (!card || !frame) {
      pinnedShape.current = null;
      setPinnedBox((now) => (now ? null : now));
      return;
    }
    const box = card.getBoundingClientRect();
    const origin = frame.getBoundingClientRect();
    const next = {
      x0: box.left - origin.left,
      y0: box.top - origin.top,
      x1: box.right - origin.left,
      y1: box.bottom - origin.top,
    };
    setPinnedBox((now) =>
      now &&
      now.x0 === next.x0 &&
      now.y0 === next.y0 &&
      now.x1 === next.x1 &&
      now.y1 === next.y1
        ? now
        : next,
    );
    const shape = `${box.width}x${box.height}:${listOpen}`;
    const before = pinnedShape.current;
    pinnedShape.current = shape;
    if (before !== null && before !== shape) reveal();
  });

  // --- Card placement (spec-view-26) -----------------------------------------

  const toFrame = (x: number, y: number): [number, number] => {
    const [fx, fy] = transform.apply([x, y]);
    return [fx - visible.left, fy];
  };
  /** A node as drawn, its ring included, in frame pixels. */
  const markBox = (node: GraphNode): Box | null => {
    const at = placeOf(node.key);
    if (!at) return null;
    const [cx, cy] = toFrame(at.x, at.y);
    const r = (at.r + HALO_REACH) * transform.k;
    return { x0: cx - r, y0: cy - r, x1: cx + r, y1: cy + r };
  };
  const nameBox = (node: GraphNode): Box | null => {
    const label = labelBoxes.get(node.key);
    if (!label) return null;
    const [x0, y0] = toFrame(label.x, label.y);
    const [x1, y1] = toFrame(label.x + label.width, label.y + label.height);
    return { x0, y0, x1, y1 };
  };
  const cardMark = cardNode ? markBox(cardNode) : null;
  const place = cardNode
    ? cardMark
      ? floatingCardPlacement(
          cardBox,
          { x0: 0, y0: 0, x1: visible.width, y1: size.height },
          {
            pinned: pinnedBox,
            selection: selectedNode
              ? [markBox(selectedNode), nameBox(selectedNode)].filter(
                  (box): box is Box => box !== null,
                )
              : [],
            label: nameBox(cardNode),
            node: cardMark,
          },
          CARD_GAP,
        )
      : null
    : anchor
      ? (() => {
          const at = cardPlacement(
            anchor,
            { width: visible.width, height: size.height },
            cardBox,
          );
          return { left: at.left - Math.min(cardBox.width, visible.width) / 2, top: at.top };
        })()
      : null;

  const edgeOpacity = (edge: GraphEdge): number =>
    lifted &&
    edge.sourceKey !== lifted &&
    edge.targetKey !== lifted
      ? UNLIFTED_OPACITY
      : 1;

  const scrollable = size.width > visible.width + 0.5;

  return (
    <div
      ref={containerRef}
      data-testid="spec-graph"
      className="@container relative flex min-h-0 flex-1 flex-col"
    >
      {/* Above the picture, only the sentence that changes it; a
          selection sets it aside for its own count, on a line of fixed
          height so the canvas — and every node — stays put
          (spec-view-66). */}
      <div
        data-testid="graph-toolbar"
        className="flex h-9 shrink-0 items-center gap-1.5 overflow-hidden whitespace-nowrap pb-2 text-xs text-neutral-600 dark:text-neutral-400"
      >
        {selectedNode ? (
          <>
            <span data-testid="graph-threshold-selection" className="min-w-0 truncate">
              {i18n._({
                id: "{count, plural, one {# package} other {# packages}} sharing citations with {name}",
                comment: "graph sentence while a package is selected: the packages its lines reach",
                values: { count: neighbors.size, name: selectedNode.basename },
              })}
            </span>
            {/* The selection's two edge hues, keyed by samples of the
                edges themselves rather than by colored text
                (spec-view-66, spec-view-24). */}
            <span
              data-testid="graph-selection-key"
              className="ml-2 flex shrink-0 items-center gap-1.5"
            >
              <span data-testid="graph-key-cites" className="flex items-center gap-1">
                <LineSample own />
                {i18n._("cites")}
              </span>
              <span data-testid="graph-key-cited" className="ml-1.5 flex items-center gap-1">
                <LineSample own={false} />
                {i18n._("cited by")}
              </span>
            </span>
          </>
        ) : model.pairs.length > 0 ? (
          <span
            data-testid="graph-threshold-sentence"
            aria-label={thresholdText}
            className="flex min-w-0 items-center gap-1.5"
          >
            <span className="shrink-0">{thresholdBefore?.trim()}</span>
            <ThresholdField
              stops={model.stops}
              value={threshold}
              onChange={setChosen}
              valueText={thresholdText}
            />
            <span className="flex min-w-0 gap-1">
              <span className="shrink-0">{thresholdAfter?.trim()}</span>
              {thresholdNote ? (
                <span className="min-w-0 truncate text-neutral-500 dark:text-neutral-500">
                  {thresholdNote}
                </span>
              ) : null}
            </span>
          </span>
        ) : null}
      </div>

      <div ref={frameRef} data-testid="graph-frame" className="relative flex min-h-0 flex-1">
        {/* The drawing keeps 320px and scrolls sideways in its own box
            where the pane is narrower; nothing else scrolls with it
            (spec-view-59). */}
        <div
          ref={scrollerRef}
          data-testid="graph-scroller"
          className="flex min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-hidden"
          onScroll={(event) => {
            const left = event.currentTarget.scrollLeft;
            setVisible((now) => (now.left === left ? now : { ...now, left }));
          }}
        >
          <svg
            ref={svgRef}
            className="block min-h-0 min-w-[320px] flex-1 cursor-grab touch-none select-none active:cursor-grabbing"
            role="application"
            tabIndex={0}
            aria-label={i18n._("Spec package citation graph")}
            onKeyDown={onSurfaceKeyDown}
            onClick={(event) => {
              const target = event.target as Element;
              if (target.closest("[data-graph-node]")) return;
              onClearSelection?.();
            }}
          >
            <defs>
              {/* Constant-size glyphs: markerUnits="userSpaceOnUse" keeps
                  the head the same at any stroke (spec-view-23). One per
                  hue, since a marker cannot inherit its line's color. */}
              <marker
                id="spec-graph-arrow-cites"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerUnits="userSpaceOnUse"
                markerWidth="10"
                markerHeight="10"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" className={CITES_FILL} />
              </marker>
              <marker
                id="spec-graph-arrow-cited"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerUnits="userSpaceOnUse"
                markerWidth="10"
                markerHeight="10"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" className={CITER_FILL} />
              </marker>
            </defs>

            <g
              transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}
            >
              {backbone.map(({ pair, line }) => {
                if (!line) return null;
                const id = `${pair.a}--${pair.b}`;
                return (
                  <g key={`pair-${id}`}>
                    <line
                      data-testid={`graph-pair-${id}`}
                      data-weight={pair.total}
                      {...line}
                      strokeWidth={EDGE_WIDTH}
                      strokeLinecap="round"
                      className={EDGE_STROKE}
                    />
                    {/* A wide invisible companion makes the thin line a
                        reachable hover target for its card. */}
                    <line
                      {...line}
                      stroke="transparent"
                      strokeWidth={12}
                      className="cursor-pointer"
                      onMouseEnter={() => setHoverSoon({ kind: "pair", id })}
                      onMouseLeave={clearHover}
                    />
                  </g>
                );
              })}

              {directed.map(({ edge, line }) => {
                if (!line) return null;
                const id = `${edge.sourceKey}--${edge.targetKey}`;
                const own = edge.sourceKey === selectedName;
                return (
                  <g key={`edge-${id}`} opacity={edgeOpacity(edge)}>
                    <line
                      data-testid={`graph-edge-${id}`}
                      data-weight={edge.weight}
                      data-direction={own ? "cites" : "cited"}
                      {...line}
                      strokeWidth={EDGE_WIDTH}
                      className={own ? CITES_STROKE : CITER_STROKE}
                      markerEnd={
                        own
                          ? "url(#spec-graph-arrow-cites)"
                          : "url(#spec-graph-arrow-cited)"
                      }
                    />
                    <line
                      {...line}
                      stroke="transparent"
                      strokeWidth={12}
                      className="cursor-pointer"
                      onMouseEnter={() => setHoverSoon({ kind: "edge", id })}
                      onMouseLeave={clearHover}
                    />
                  </g>
                );
              })}

              {model.nodes.map((node) => {
                const dim = dimOf(node.basename);
                const selected = node.basename === selectedName;
                const focused =
                  node.basename === keyFocus || node.basename === lifted;
                const place = placeOf(node.key);
                if (!place) return null;
                const matched = searching && matchedKeys?.has(node.key);
                // Marks are drawn in presentation pixels, which is exactly
                // what the scale was solved against, so the numeral and
                // label read at their own size (spec-view-22).
                const numeral = Math.max(LABEL_FONT_SIZE, place.r * 0.52);
                return (
                  <g
                    key={node.key}
                    data-graph-node=""
                    data-testid={`graph-node-${node.basename}`}
                    data-role={node.cited ? "cited" : "uncited"}
                    data-items={node.items}
                    data-match={matched ? "true" : undefined}
                    data-foot={node.linked ? undefined : "true"}
                    tabIndex={0}
                    role="button"
                    aria-label={i18n._(
                      "{name}, {items} items, cites {out}, cited by {in}",
                      {
                        name: node.basename,
                        items: node.items,
                        out: node.outbound,
                        in: node.inbound,
                      },
                    )}
                    className="cursor-pointer focus:outline-none"
                    opacity={dim}
                    onMouseEnter={() =>
                      setHoverSoon({ kind: "node", id: node.basename })
                    }
                    onMouseLeave={clearHover}
                    onFocus={() => {
                      // A press focuses the node too, but only a keyboard's
                      // focus inspects: the card leaves with the pointer
                      // (spec-view-26).
                      if (pressedRef.current !== node.basename) setKeyFocus(node.basename);
                      pressedRef.current = null;
                    }}
                    onBlur={() => {
                      setKeyFocus((now) => (now === node.basename ? null : now));
                      // A closed card closes for this stay of focus only.
                      setDismissed((now) => (now === node.basename ? null : now));
                    }}
                    onClick={() => {
                      // A release that moved the node was a drag, not a
                      // choice: it must not also open the file.
                      if (draggedRef.current) {
                        draggedRef.current = false;
                        return;
                      }
                      onOpenFile(node.key);
                      // Re-activating the selection re-fires its reveal
                      // (spec-view-42).
                      if (selected) reveal();
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onOpenFile(node.key);
                        if (selected) reveal();
                      }
                    }}
                    onPointerDown={(event) => {
                      pressedRef.current = node.basename;
                      setKeyFocus((now) => (now === node.basename ? null : now));
                      onNodePointerDown(event, node);
                    }}
                    onPointerMove={onNodePointerMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                  >
                    {/* Selection and search marking wear ink and keyboard
                        focus the focus hue, so none can be mistaken for a
                        category (DR-158 §11) — and they are
                        separate rings, so a marked package still shows
                        plainly whether it is the selected one. */}

                    {(selected || focused) && (
                      <circle
                        data-testid={`graph-halo-${node.basename}`}
                        cx={place.x}
                        cy={place.y}
                        r={place.r + 5}
                        fill="none"
                        strokeWidth={focused ? 3 : 2}
                        className={focused ? FOCUS_STROKE : INK_STROKE}
                      />
                    )}
                    <circle
                      cx={place.x}
                      cy={place.y}
                      r={place.r}
                      strokeWidth={node.cited ? 0 : 2.5}
                      className={
                        node.cited ? INK_FILL : `${TINT_FILL} ${INK_STROKE}`
                      }
                    />
                    <text
                      x={place.x}
                      y={place.y}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={numeral}
                      fontWeight={600}
                      className={node.cited ? SURFACE_FILL : INK_FILL}
                    >
                      {node.items}
                    </text>
                  </g>
                );
              })}

              {/* Match marks stand outside the node groups so an
                  isolation's dimming cannot mute them: selection and query
                  are separate voices that compose (spec-view-44). */}
              {searching
                ? model.nodes.map((node) => {
                    const place = placeOf(node.key);
                    if (!place || !matchedKeys?.has(node.key)) return null;
                    return (
                      <circle
                        key={`match-${node.key}`}
                        data-testid={`graph-match-${node.basename}`}
                        cx={place.x}
                        cy={place.y}
                        r={place.r + 9}
                        fill="none"
                        strokeWidth={2}
                        strokeDasharray="4 3"
                        className={`pointer-events-none ${INK_STROKE}`}
                      />
                    );
                  })
                : null}

              {/* Names last: a label is the one mark that must never be
                  painted over, whatever the node order (spec-view-22). */}
              {model.nodes.map((node) => {
                const place = placeOf(node.key);
                const box = labelBoxes.get(node.key);
                if (!place || !box) return null;
                const parts = labelParts(node.basename, place.label);
                return (
                  <text
                    key={`label-${node.key}`}
                    data-testid={`graph-label-${node.basename}`}
                    x={box.x + box.width / 2}
                    y={box.y + LABEL_FONT_SIZE}
                    textAnchor="middle"
                    fontSize={LABEL_FONT_SIZE}
                    paintOrder="stroke"
                    strokeLinejoin="round"
                    strokeWidth={3}
                    opacity={dimOf(node.basename)}
                    className={`pointer-events-none fill-neutral-700 dark:fill-neutral-300 ${SURFACE_STROKE}`}
                  >
                    {parts.label}
                    {parts.cites ? (
                      <tspan fontWeight={600} className={CITES_FILL}>
                        {parts.cites}
                      </tspan>
                    ) : null}
                    {parts.cited ? (
                      <tspan fontWeight={600} className={CITER_TEXT}>
                        {parts.cited}
                      </tspan>
                    ) : null}
                  </text>
                );
              })}
            </g>
          </svg>
        </div>

        {/* Fades at the edges the drawing scrolls past (spec-view-59). */}
        {scrollable && visible.left > 0.5 ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-neutral-50 to-transparent dark:from-neutral-950"
          />
        ) : null}
        {scrollable && visible.left + visible.width < size.width - 0.5 ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-neutral-50 to-transparent dark:from-neutral-950"
          />
        ) : null}

        {/* The fit, where maps keep it: a corner icon, resting while the
            camera already shows the fitted frame (spec-view-27). */}
        <button
          type="button"
          data-testid="graph-fit"
          aria-label={i18n._({ id: "Fit to window", comment: "control: show the whole graph at once" })}
          aria-keyshortcuts="0"
          title={i18n._("Fit to window (0)")}
          disabled={atFit}
          onClick={applyFit}
          className="absolute bottom-2 right-2 z-[5] flex h-7 w-7 items-center justify-center rounded-md border border-neutral-300 bg-white/95 text-neutral-700 shadow-sm hover:bg-neutral-100 disabled:pointer-events-none disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-900/95 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
            <path
              d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        {/* The selection's package card, pinned at the top-right: the
            card's own lines, then the control opening the citation
            list — every neighbor with both counts, most first, under
            heads in the two edge hues; an entry focused or hovered
            lifts its node and edges, and activating one selects it.
            Only the list scrolls (spec-view-25). */}
        {selectedNode ? (
          <div
            ref={panelRef}
            data-testid="graph-selection-card"
            role="group"
            aria-label={selectedNode.basename}
            className="absolute right-2 top-2 z-[5] flex max-h-[45%] w-56 max-w-[calc(100%-1rem)] flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white text-xs shadow-md dark:border-neutral-700 dark:bg-neutral-900"
          >
            <div className="shrink-0 px-2.5 py-2">
              <PackageLines node={selectedNode} />
            </div>
            {relationships.length > 0 ? (
              <>
                <button
                  type="button"
                  data-testid="graph-citations-toggle"
                  aria-expanded={listOpen}
                  aria-controls="graph-citations"
                  aria-label={
                    listOpen
                      ? i18n._("Collapse {name}'s citation list", { name: selectedNode.basename })
                      : i18n._("Expand {name}'s citation list", { name: selectedNode.basename })
                  }
                  onClick={() => setListOpen((open) => !open)}
                  className="flex w-full shrink-0 items-center gap-1 border-t border-neutral-200 px-2.5 py-1.5 text-left text-neutral-600 outline-none hover:bg-neutral-100 hover:text-neutral-800 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-brand-600 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-neutral-100 dark:focus-visible:ring-brand-400"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {i18n._({
                      id: "Citation list ({count, plural, one {# package} other {# packages}})",
                      comment: "package card: opens the list of packages sharing citations with the selected one",
                      values: { count: relationships.length },
                    })}
                  </span>
                  <svg
                    viewBox="0 0 6 10"
                    className={`h-2.5 w-1.5 shrink-0 transition-transform motion-reduce:transition-none ${
                      listOpen ? "rotate-90" : ""
                    }`}
                    aria-hidden="true"
                  >
                    <path d="M1 1l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                </button>
                {listOpen ? (
                  <>
                    <div
                      aria-hidden="true"
                      className="flex shrink-0 items-center gap-2 px-2.5 pt-1 text-[11px] text-neutral-500 dark:text-neutral-400"
                    >
                      <span className="min-w-0 flex-1" />
                      <span className="flex w-10 shrink-0 justify-end whitespace-nowrap">
                        {i18n._("cites")}
                      </span>
                      <span className="flex w-12 shrink-0 justify-end whitespace-nowrap">
                        {i18n._("cited by")}
                      </span>
                    </div>
                    <ul
                      id="graph-citations"
                      data-testid="graph-citations"
                      aria-label={i18n._("{name}'s citation list", { name: selectedNode.basename })}
                      className="min-h-0 flex-1 overflow-y-auto py-1"
                    >
                      {relationships.map(([name, counts]) => {
                        const neighbor = nodeAt(name);
                        return (
                          <li key={name} data-testid={`graph-citation-${name}`}>
                            <button
                              type="button"
                              aria-label={i18n._("{name}: cites {selected} {in}, cited by {selected} {out}", {
                                name,
                                selected: selectedNode.basename,
                                in: counts.in,
                                out: counts.out,
                              })}
                              onFocus={() => setLifted(name)}
                              onBlur={() => setLifted((now) => (now === name ? null : now))}
                              onMouseEnter={() => setLifted(name)}
                              onMouseLeave={() => setLifted((now) => (now === name ? null : now))}
                              onClick={() => neighbor && onOpenFile(neighbor.key)}
                              className="flex w-full items-center gap-2 px-2.5 py-1 text-left outline-none hover:bg-neutral-100 focus:bg-brand-50 focus:ring-1 focus:ring-inset focus:ring-brand-600 dark:hover:bg-neutral-800 dark:focus:bg-brand-950 dark:focus:ring-brand-400"
                            >
                              <span className="min-w-0 flex-1 truncate font-mono text-neutral-700 dark:text-neutral-200">
                                {name}
                              </span>
                              {[counts.out, counts.in].map((count, i) => (
                                <span
                                  key={i}
                                  className={`${i ? "w-12" : "w-10"} shrink-0 text-right tabular-nums ${
                                    count > 0
                                      ? "text-neutral-700 dark:text-neutral-200"
                                      : "text-neutral-500 dark:text-neutral-500"
                                  }`}
                                >
                                  {count > 0 ? count : "—"}
                                </span>
                              ))}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}

        {/* Details at hand rather than a native tooltip (spec-view-26). */}
        {place && (cardNode || cardEdge || cardPair) ? (
          <div
            ref={cardRef}
            data-testid="graph-card"
            role="tooltip"
            className="pointer-events-none absolute z-10 w-max max-w-[min(14rem,calc(100%-1rem))] rounded-lg border border-neutral-200 bg-white p-2.5 text-xs shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
            style={{ left: place.left, top: place.top }}
          >
            {cardNode ? (
              <PackageLines node={cardNode} />
            ) : cardEdge ? (
              <div className="text-neutral-900 dark:text-neutral-100">
                {citesTimes(cardEdge.sourceKey, cardEdge.targetKey, cardEdge.weight)}
              </div>
            ) : cardPair ? (
              <ul className="space-y-0.5 text-neutral-900 dark:text-neutral-100">
                {(
                  [
                    [cardPair.a, cardPair.b, cardPair.ab],
                    [cardPair.b, cardPair.a, cardPair.ba],
                  ] as const
                )
                  .filter(([, , count]) => count > 0)
                  .map(([from, to, count]) => (
                    <li key={from}>{citesTimes(from, to, count)}</li>
                  ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* The key: what the marks mean, never a control, the same under
          a selection (spec-view-26). */}
      <div
        data-testid="graph-legend"
        className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 px-1 pt-2 text-xs text-neutral-600 dark:text-neutral-400"
      >
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="h-2.5 w-2.5 rounded-full bg-neutral-700 dark:bg-neutral-200" />
          {i18n._("cited by other packages")}
        </span>
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="h-2.5 w-2.5 rounded-full border-2 border-neutral-700 bg-neutral-100 dark:border-neutral-200 dark:bg-neutral-800" />
          {i18n._("not cited by other packages")}
        </span>
      </div>
    </div>
  );
}
