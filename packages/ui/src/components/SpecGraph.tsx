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
// names rather than encoded in width; the two roles are achromatic so
// brand purple stays interaction's alone; names take a free place or
// wait; and every channel is keyed by the legend. Layout and camera
// come from d3-force and d3-zoom; the rendering stays ours.

import {
  useCallback,
  useEffect,
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
  placeLabels,
  presentLayout,
  settle,
  EDGE_WIDTH,
  FOOT_CAPTION,
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
/** How far past the fitted whole the camera may zoom in. The base
 * picture is the fit, so the reader's transform starts at identity
 * and only ever adds to it (spec-view-27). */
const MAX_ZOOM_FACTOR = 4;

/** Group hues for the card's breakdown, matching the outline's chips
 * (spec-view-2): color is never the only channel — every count keeps
 * its group word. */
const GROUP_TEXT: Record<SpecGroup, string> = {
  external: "text-sky-700 dark:text-sky-300",
  internal: "text-fuchsia-700 dark:text-fuchsia-300",
  test: "text-teal-700 dark:text-teal-300",
};

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
const EMPHASIS_STROKE = "stroke-brand-600 dark:stroke-brand-400";
const EMPHASIS_FILL = "fill-brand-600 dark:fill-brand-400";
/** What cites the selection: ink, so the interaction hue stays with
 * the selection's own citations (spec-view-23). */
const CITER_STROKE = "stroke-neutral-700 dark:stroke-neutral-200";
const CITER_FILL = "fill-neutral-700 dark:fill-neutral-200";
const CITER_TEXT = "fill-neutral-700 dark:fill-neutral-200";

/** Opacity of a mark outside the selection's neighborhood. Only this
 * transient state may fall under the contrast floor (spec-view-39). */
const DIM_OPACITY = 0.15;
/** A selection edge while the relationship list lifts another
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
  const svgRef = useRef<SVGSVGElement | null>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  /** Set once the reader moves the camera; suspends auto-fit until
   * the fit control brings it back (spec-view-27). */
  const movedRef = useRef(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const [size, setSize] = useState({ width: 0, height: 0 });
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);
  const [hover, setHover] = useState<Inspection>(null);
  const [keyFocus, setKeyFocus] = useState<string | null>(null);
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
    select(svg).call(behavior.transform, zoomIdentity);
  }, []);

  // Track the drawing surface — the svg itself, not the container it
  // shares with the legend, or the picture would be laid out against a
  // viewport taller than it can paint (spec-view-27).
  useEffect(() => {
    const element = svgRef.current;
    if (!element) return;
    const read = () => {
      const box = element.getBoundingClientRect();
      setSize({ width: box.width, height: box.height });
    };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(read);
    observer.observe(element);
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
      .filter((event: Event) => {
        // A press on a node starts a drag, never a pan.
        const target = event.target as Element | null;
        if (target?.closest?.("[data-graph-node]")) return false;
        return !(event as MouseEvent).button;
      })
      .on("zoom", (event: { transform: ZoomTransform; sourceEvent: unknown }) => {
        if (event.sourceEvent) movedRef.current = true;
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

  /** The neighbor the relationship list lifts, while one of its
   * entries holds focus or the pointer (spec-view-25). */
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
    // The layout adjusts live around the held node; under reduced
    // motion only the node itself moves and the rest re-settles once
    // on release (DR-026 §6).
    if (!reduced) simulation.alphaTarget(0.28).restart();
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
      draggedRef.current = true;
    }
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
    select(svg).call(behavior.scaleBy, factor);
  }, []);

  const panBy = useCallback((dx: number, dy: number) => {
    const svg = svgRef.current;
    const behavior = zoomRef.current;
    if (!svg || !behavior) return;
    movedRef.current = true;
    select(svg).call(behavior.translateBy, dx, dy);
  }, []);

  const onSurfaceKeyDown = (event: ReactKeyboardEvent) => {
    switch (event.key) {
      case "Escape":
        // The card first, then the selection it sits over
        // (spec-view-25).
        if (hover) {
          event.preventDefault();
          clearHover();
        } else if (selectedName) {
          event.preventDefault();
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

  const cardNode = useMemo(() => {
    const id = hover?.kind === "node" ? hover.id : keyFocus;
    return id ? model.nodes.find((node) => node.basename === id) ?? null : null;
  }, [hover, keyFocus, model]);

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

  const nodeAt = (basename: string): GraphNode | undefined =>
    model.nodes.find((node) => node.basename === basename);

  const cardAnchor = (): { left: number; top: number } | null => {
    const anchor = cardNode
      ? cardNode
      : cardEdge
        ? nodeAt(cardEdge.targetKey)
        : cardPair
          ? nodeAt(cardPair.b)
          : null;
    const place = anchor ? placeOf(anchor.key) : undefined;
    if (!place) return null;
    const [x, y] = transform.apply([place.x, place.y]);
    return { left: x, top: y + place.r * transform.k + 14 };
  };

  const anchor = cardAnchor();

  // The card's height varies with its group rows, and its width with
  // a narrow pane, so both are read back rather than assumed.
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardBox, setCardBox] = useState(CARD_SIZE);
  useEffect(() => {
    const box = cardRef.current?.getBoundingClientRect();
    if (!box || box.width <= 0 || box.height <= 0) return;
    setCardBox((current) =>
      current.width === box.width && current.height === box.height
        ? current
        : { width: box.width, height: box.height },
    );
  }, [cardNode, cardEdge, cardPair, size.width, size.height]);
  const place = anchor ? cardPlacement(anchor, size, cardBox) : null;

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
    return {
      x1: source.x + ux * source.r + ox,
      y1: source.y + uy * source.r + oy,
      x2: target.x - ux * (target.r + headRoom) + ox,
      y2: target.y - uy * (target.r + headRoom) + oy,
    };
  };

  // At rest the backbone draws one undirected line per strong pair;
  // with a selection, only its own citations draw, directed
  // (spec-view-23).
  const backbone = selectedName
    ? []
    : model.pairs
        .filter((pair) => pair.backbone)
        .map((pair) => ({ pair, line: lineBetween(pair.a, pair.b, 0, 0) }));
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
   * `←N` its citations of it, `→N` the selection's of it
   * (spec-view-25). */
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
      const text = `${parts.label}${parts.cited}${parts.cites}`;
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
  }, [model, presentation, size, selectedName, inspected, neighbors, neighborhood]);

  /** Neighbors whose names found no place: the relationship list
   * names them all (spec-view-25). */
  const crowded =
    selectedName !== null &&
    [...neighbors.keys()].some((name) => {
      const node = nodeAt(name);
      return node !== undefined && !labelBoxes.has(node.key);
    });
  const relationships = [...neighbors.entries()].sort(
    (a, b) =>
      b[1].in + b[1].out - (a[1].in + a[1].out) || (a[0] < b[0] ? -1 : 1),
  );

  // The list stands in the pane's corner holding the fewest of the
  // neighborhood's marks, so it hides as little of the selection as
  // it can without moving a mark (spec-view-25).
  const listCorner = (() => {
    const width = Math.min(208, size.width - 16);
    const height = size.height * 0.45;
    const corners = [
      { key: "top-right", x: size.width - 8 - width, y: 8 },
      { key: "top-left", x: 8, y: 8 },
      { key: "bottom-right", x: size.width - 8 - width, y: size.height - 8 - height },
      { key: "bottom-left", x: 8, y: size.height - 8 - height },
    ] as const;
    const covered = (corner: (typeof corners)[number]) => {
      let count = 0;
      for (const name of neighborhood ?? []) {
        const at = nodeAt(name);
        const place = at ? placeOf(at.key) : undefined;
        if (!place) continue;
        const [x, y] = transform.apply([place.x, place.y]);
        if (
          x + place.r >= corner.x &&
          x - place.r <= corner.x + width &&
          y + place.r >= corner.y &&
          y - place.r <= corner.y + height
        ) {
          count += 1;
        }
      }
      return count;
    };
    return corners.reduce((best, corner) =>
      covered(corner) < covered(best) ? corner : best,
    ).key;
  })();
  const LIST_CORNER: Record<typeof listCorner, string> = {
    "top-right": "right-2 top-2",
    "top-left": "left-2 top-2",
    "bottom-right": "right-2 bottom-20",
    "bottom-left": "left-2 bottom-20",
  };

  const edgeOpacity = (edge: GraphEdge): number =>
    lifted &&
    edge.sourceKey !== lifted &&
    edge.targetKey !== lifted
      ? UNLIFTED_OPACITY
      : 1;

  return (
    <div
      ref={containerRef}
      data-testid="spec-graph"
      className="@container relative flex min-h-0 flex-1 flex-col"
    >
      <svg
        ref={svgRef}
        className="min-h-0 w-full flex-1 cursor-grab touch-none select-none active:cursor-grabbing"
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
            <path d="M 0 0 L 10 5 L 0 10 z" className={EMPHASIS_FILL} />
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
          {presentation.footTop !== undefined ? (
            // The foot row's caption and rule: what stands below them
            // cites nothing and nothing cites it (spec-view-28).
            <g data-testid="graph-foot" className="pointer-events-none">
              <line
                x1={8}
                x2={Math.max(8, size.width - 8)}
                y1={presentation.footTop}
                y2={presentation.footTop}
                strokeWidth={1}
                className="stroke-neutral-200 dark:stroke-neutral-800"
              />
              <text
                x={12}
                y={presentation.footTop + FOOT_CAPTION - 5}
                fontSize={LABEL_FONT_SIZE}
                className="fill-neutral-600 dark:fill-neutral-400"
              >
                {i18n._({
                  id: "Packages without citations",
                  comment: "graph caption over the packages that cite nothing and that nothing cites",
                })}
              </text>
            </g>
          ) : null}

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
                  className={own ? EMPHASIS_STROKE : CITER_STROKE}
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
                onFocus={() => setKeyFocus(node.basename)}
                onBlur={() => setKeyFocus((now) => (now === node.basename ? null : now))}
                onClick={() => {
                  // A release that moved the node was a drag, not a
                  // choice: it must not also open the file.
                  if (draggedRef.current) {
                    draggedRef.current = false;
                    return;
                  }
                  onOpenFile(node.key);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpenFile(node.key);
                  }
                }}
                onPointerDown={(event) => onNodePointerDown(event, node)}
                onPointerMove={onNodePointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              >
                {/* Selection, keyboard focus, and search marking are
                    the only brand marks on the canvas, so none can be
                    mistaken for a category (DR-026 §2) — and they are
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
                    className={EMPHASIS_STROKE}
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
                    className={`pointer-events-none ${EMPHASIS_STROKE}`}
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
                {parts.cited ? (
                  <tspan fontWeight={600} className={CITER_TEXT}>
                    {parts.cited}
                  </tspan>
                ) : null}
                {parts.cites ? (
                  <tspan fontWeight={600} className={EMPHASIS_FILL}>
                    {parts.cites}
                  </tspan>
                ) : null}
              </text>
            );
          })}
        </g>
      </svg>

      {/* The relationship list: where a neighbor's name finds no
          place, every neighbor is named here with both counts, most
          first, and an entry focused or hovered lifts its node and
          edges (spec-view-25). */}
      {crowded ? (
        <div
          data-testid="graph-relationships"
          data-corner={listCorner}
          className={`absolute ${LIST_CORNER[listCorner]} z-[5] flex max-h-[45%] w-52 max-w-[calc(100%-1rem)] flex-col rounded-lg border border-neutral-200 bg-white/95 text-xs shadow-md dark:border-neutral-700 dark:bg-neutral-900/95`}
        >
          <div className="shrink-0 border-b border-neutral-200 px-2.5 py-1.5 font-medium text-neutral-700 dark:border-neutral-700 dark:text-neutral-200">
            {i18n._("{name}'s relationships", { name: selectedName ?? "" })}
          </div>
          <ul
            aria-label={i18n._("{name}'s relationships", { name: selectedName ?? "" })}
            className="min-h-0 overflow-y-auto py-1"
          >
            {relationships.map(([name, counts]) => (
              <li
                key={name}
                data-testid={`graph-relationship-${name}`}
                tabIndex={0}
                aria-label={i18n._("{name}: cites {selected} {in}, cited by {selected} {out}", {
                  name,
                  selected: selectedName ?? "",
                  in: counts.in,
                  out: counts.out,
                })}
                onFocus={() => setLifted(name)}
                onBlur={() => setLifted((now) => (now === name ? null : now))}
                onMouseEnter={() => setLifted(name)}
                onMouseLeave={() => setLifted((now) => (now === name ? null : now))}
                className="flex items-center gap-2 px-2.5 py-1 outline-none hover:bg-neutral-100 focus:bg-brand-50 focus:ring-1 focus:ring-inset focus:ring-brand-600 dark:hover:bg-neutral-800 dark:focus:bg-brand-950 dark:focus:ring-brand-400"
              >
                <span className="min-w-0 flex-1 truncate font-mono text-neutral-700 dark:text-neutral-200">
                  {name}
                </span>
                <span className="shrink-0 tabular-nums font-semibold text-neutral-700 dark:text-neutral-200">
                  {counts.in > 0 ? `←${counts.in}` : ""}
                </span>
                <span className="w-9 shrink-0 text-right tabular-nums font-semibold text-brand-600 dark:text-brand-300">
                  {counts.out > 0 ? `→${counts.out}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Details at hand rather than a native tooltip (spec-view-26). */}
      {place && (cardNode || cardEdge || cardPair) ? (
        <div
          ref={cardRef}
          data-testid="graph-card"
          role="tooltip"
          className="pointer-events-none absolute z-10 w-56 max-w-full -translate-x-1/2 rounded-lg border border-neutral-200 bg-white p-2.5 text-xs shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
          style={{ left: place.left, top: place.top }}
        >
          {cardNode ? (
            <>
              <div className="font-medium text-neutral-900 dark:text-neutral-100">
                {cardNode.basename}
              </div>
              <div className="mt-1 text-neutral-600 dark:text-neutral-300">
                {i18n._("{count, plural, one {# item} other {# items}} in total", {
                  count: cardNode.items,
                })}
              </div>
              <ul className="mt-1 space-y-0.5">
                {GRAPH_GROUP_ORDER.map((group) => (
                  <li
                    key={group}
                    className="flex justify-between gap-3"
                    aria-label={i18n._("{count} {group} items", {
                      count: cardNode.groups[group],
                      group: GROUP_WORD[group](),
                    })}
                  >
                    <span className={GROUP_TEXT[group]}>
                      {GROUP_NAME[group]()}
                    </span>
                    <span
                      className={
                        cardNode.groups[group] === 0
                          ? "text-neutral-500 dark:text-neutral-500"
                          : "text-neutral-700 dark:text-neutral-200"
                      }
                    >
                      {cardNode.groups[group]}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-1.5 border-t border-neutral-200 pt-1.5 text-neutral-600 dark:border-neutral-700 dark:text-neutral-300">
                {i18n._("cites {out} · cited by {in}", {
                  out: cardNode.outbound,
                  in: cardNode.inbound,
                })}
              </div>
            </>
          ) : cardEdge ? (
            <>
              <div className="font-medium text-neutral-900 dark:text-neutral-100">
                {cardEdge.sourceKey} → {cardEdge.targetKey}
              </div>
              <div className="mt-1 text-neutral-600 dark:text-neutral-300">
                {i18n._("{count, plural, one {# citation} other {# citations}}", {
                  count: cardEdge.weight,
                })}
              </div>
            </>
          ) : cardPair ? (
            <>
              <div className="font-medium text-neutral-900 dark:text-neutral-100">
                {cardPair.a} ↔ {cardPair.b}
              </div>
              <ul className="mt-1 space-y-0.5 text-neutral-600 dark:text-neutral-300">
                {(
                  [
                    [cardPair.a, cardPair.b, cardPair.ab],
                    [cardPair.b, cardPair.a, cardPair.ba],
                  ] as const
                ).map(([from, to, count]) => (
                  <li key={from} className="flex justify-between gap-3">
                    <span className="min-w-0 truncate">
                      {from} → {to}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {i18n._("{count, plural, one {# citation} other {# citations}}", {
                        count,
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}

      {/* Every channel and affordance in use, keyed (spec-view-24). */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 px-1 pt-2 text-xs text-neutral-600 dark:text-neutral-400">
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="h-2.5 w-2.5 rounded-full bg-neutral-700 dark:bg-neutral-200" />
          {i18n._("cited by packages")}
        </span>
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="h-2.5 w-2.5 rounded-full border-2 border-neutral-700 bg-neutral-100 dark:border-neutral-200 dark:bg-neutral-800" />
          {i18n._("not cited by packages")}
        </span>
        <span className="whitespace-nowrap">
          {i18n._({ id: "size — items", comment: "graph legend: a node's size counts its items" })}
        </span>
        {selectedName ? (
          <>
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="h-0.5 w-4 shrink-0 bg-brand-600 dark:bg-brand-400" />
              {i18n._({
                id: "→N: {name} cites it N times",
                values: { name: selectedName },
                comment: "graph legend: purple edges and →N count what the selected package cites",
              })}
            </span>
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="h-0.5 w-4 shrink-0 bg-neutral-700 dark:bg-neutral-200" />
              {i18n._({
                id: "←N: it cites {name} N times",
                values: { name: selectedName },
                comment: "graph legend: ink edges and ←N count what cites the selected package",
              })}
            </span>
          </>
        ) : (
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 shrink-0 bg-neutral-500" />
            {i18n._({
              id: "the overview omits weaker relationships — select a package for all",
              comment: "graph legend: resting lines show only the strongest package pairs",
            })}
          </span>
        )}
        <button
          type="button"
          data-testid="graph-fit"
          title={i18n._("Show the whole graph (0)")}
          onClick={applyFit}
          className="rounded border border-neutral-300 px-1.5 py-0.5 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          {i18n._({ id: "Fit", comment: "control: show the whole graph at once" })}
        </button>
        {/* A tip, not a key: it yields first in a narrow pane (DR-041). */}
        <span className="ml-auto hidden whitespace-nowrap @md:inline">
          {i18n._("click opens · drag moves · scroll zooms")}
        </span>
      </div>
    </div>
  );
}
