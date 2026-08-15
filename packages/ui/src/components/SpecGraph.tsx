// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The package citation graph (spec-view-20 and spec-view-22 through
// spec-view-29): one node per spec file, one directed edge per
// citing→cited pair. Under meta-14 every peer reliance is a citation,
// so this graph is the complete architecture.
//
// Every encoding here answers DR-026: node area counts items and says
// so with a numeral, edge width counts citations on an absolute
// scale, direction reads at rest through constant-size glyphs, the
// two roles are achromatic so brand purple stays interaction's alone,
// and every channel is keyed by the legend. Layout and camera come
// from d3-force and d3-zoom; the rendering stays ours.

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
  edgeWidth,
  layoutBounds,
  settle,
  GRAPH_GROUP_ORDER,
  LABEL_FONT_SIZE,
  LABEL_GAP,
  type GraphEdge,
  type GraphNode,
} from "../lib/spec-graph-layout.js";
import type { SpecGroup } from "../lib/spec-view-model.js";

export {
  buildGraphModel,
  type GraphEdge,
  type GraphNode,
} from "../lib/spec-graph-layout.js";

/** The card waits for the pointer to settle, so crossing the canvas
 * does not flash a card per mark (spec-view-26). */
const HOVER_DELAY_MS = 130;
/** Camera padding around the fitted layout, in pixels. */
const FIT_PADDING = 28;
/** How far past the fitted whole the camera may zoom in. */
const MAX_ZOOM_FACTOR = 4;

/** Group hues for the card's breakdown, matching the outline's chips
 * (spec-view-2): color is never the only channel — every count keeps
 * its group word. */
const GROUP_TEXT: Record<SpecGroup, string> = {
  external: "text-sky-700 dark:text-sky-300",
  internal: "text-fuchsia-700 dark:text-fuchsia-300",
  test: "text-teal-700 dark:text-teal-300",
};
const GROUP_LABEL: Record<SpecGroup, string> = {
  external: "External",
  internal: "Internal",
  test: "Tests",
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
const EDGE_STROKE = "stroke-neutral-500";
/** One step stronger than its edge in each theme, so the glyph reads
 * as a mark rather than a thickening. */
const ARROW_FILL = "fill-neutral-600 dark:fill-neutral-400";
const EMPHASIS_STROKE = "stroke-brand-600 dark:stroke-brand-400";
const EMPHASIS_FILL = "fill-brand-600 dark:fill-brand-400";

/** Opacity of a mark outside the emphasized neighborhood. Only this
 * transient state may fall under the contrast floor (spec-view-39). */
const DIM_OPACITY = 0.18;

type Emphasis = { kind: "node" | "edge"; id: string } | null;

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
  const [hover, setHover] = useState<Emphasis>(null);
  const [keyFocus, setKeyFocus] = useState<string | null>(null);
  // Bumped by simulation ticks: node positions live on the datum
  // objects the simulation mutates, so a counter is what tells React
  // a settled frame changed.
  const [, setFrame] = useState(0);

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

  const bounds = useMemo(() => layoutBounds(model.nodes), [model]);

  /** The camera showing the whole layout with padding. */
  const fitTransform = useCallback((): ZoomTransform => {
    const width = size.width;
    const height = size.height;
    const spanX = Math.max(bounds.maxX - bounds.minX, 1);
    const spanY = Math.max(bounds.maxY - bounds.minY, 1);
    if (!width || !height) return zoomIdentity;
    const scale = Math.min(
      (width - 2 * FIT_PADDING) / spanX,
      (height - 2 * FIT_PADDING) / spanY,
    );
    const k = Math.max(scale, 0.05);
    return zoomIdentity
      .translate(
        (width - (bounds.minX + bounds.maxX) * k) / 2,
        (height - (bounds.minY + bounds.maxY) * k) / 2,
      )
      .scale(k);
  }, [bounds, size]);

  const applyFit = useCallback(() => {
    const svg = svgRef.current;
    const behavior = zoomRef.current;
    if (!svg || !behavior || !size.width) return;
    movedRef.current = false;
    select(svg).call(behavior.transform, fitTransform());
  }, [fitTransform, size.width]);

  // Track the drawing surface — the svg itself, not the container it
  // shares with the legend, or the fit would frame the graph against a
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

  // The camera itself: d3-zoom owns pan, zoom-toward-pointer, and the
  // bounds, so none of that math is ours to maintain (DR-026 §6).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const fitted = fitTransform();
    const behavior = d3Zoom<SVGSVGElement, unknown>()
      // The pane is the viewport: stated outright rather than read
      // back off the SVG's geometry attributes.
      .extent((): [[number, number], [number, number]] => [
        [0, 0],
        [size.width, size.height],
      ])
      .scaleExtent([fitted.k, fitted.k * MAX_ZOOM_FACTOR])
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
    // Double-click belongs to the fit control's shortcut, not to
    // d3-zoom's own step zoom (spec-view-27).
    selection.on("dblclick.zoom", null);
    return () => {
      selection.on(".zoom", null);
      zoomRef.current = null;
    };
  }, [fitTransform, size.width, size.height]);

  // Fit on open, and re-fit while the reader has not moved the
  // camera — a tree change, a pane resize, or the toggle (spec-view-27).
  useEffect(() => {
    if (movedRef.current) return;
    applyFit();
  }, [applyFit, model]);

  // --- Emphasis (spec-view-25) ---------------------------------------------

  const selectedName = useMemo(
    () => model.nodes.find((node) => node.key === selectedKey)?.basename ?? null,
    [model, selectedKey],
  );

  // Hover reads a mark's numbers; it never dims the picture. Isolation
  // is what a deliberate choice buys — selection, or the keyboard
  // focus that stands in for it (spec-view-25), so the two gestures
  // never look alike.
  const emphasis: Emphasis = useMemo(() => {
    if (keyFocus) return { kind: "node", id: keyFocus };
    if (selectedName) return { kind: "node", id: selectedName };
    return null;
  }, [keyFocus, selectedName]);

  const neighborhood = useMemo(() => {
    if (!emphasis) return null;
    const set = new Set<string>();
    if (emphasis.kind === "node") {
      set.add(emphasis.id);
      for (const edge of model.edges) {
        if (edge.sourceKey === emphasis.id) set.add(edge.targetKey);
        if (edge.targetKey === emphasis.id) set.add(edge.sourceKey);
      }
    } else {
      const [source, target] = emphasis.id.split("--");
      set.add(source);
      set.add(target);
    }
    return set;
  }, [emphasis, model]);

  const setHoverSoon = useCallback((next: Emphasis) => {
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
    const [x, y] = transform.invert([
      event.clientX - rect.left,
      event.clientY - rect.top,
    ]);
    // A pointer without usable coordinates must never reach the
    // simulation: one NaN there poisons the whole layout.
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

  const nodeAt = (basename: string): GraphNode | undefined =>
    model.nodes.find((node) => node.basename === basename);

  const cardAnchor = (): { left: number; top: number } | null => {
    const anchor = cardNode
      ? cardNode
      : cardEdge
        ? nodeAt(cardEdge.targetKey)
        : null;
    if (!anchor) return null;
    const [x, y] = transform.apply([anchor.x, anchor.y]);
    return { left: x, top: y + anchor.r * transform.k + 14 };
  };

  const anchor = cardAnchor();

  // --- Render ----------------------------------------------------------------

  const dimOf = (name: string): number =>
    neighborhood && !neighborhood.has(name) ? DIM_OPACITY : 1;

  return (
    <div
      ref={containerRef}
      data-testid="spec-graph"
      className="relative flex h-full min-h-0 flex-col"
    >
      <svg
        ref={svgRef}
        className="min-h-0 w-full flex-1 cursor-grab touch-none select-none active:cursor-grabbing"
        role="application"
        tabIndex={0}
        aria-label="Spec package citation graph"
        onKeyDown={onSurfaceKeyDown}
        onClick={(event) => {
          const target = event.target as Element;
          if (target.closest("[data-graph-node]")) return;
          onClearSelection?.();
        }}
      >
        <defs>
          {/* Constant-size glyphs: markerUnits="userSpaceOnUse" is what
              decouples the arrowhead from the edge's width, so weight
              can ride the stroke without the heads turning ugly
              (spec-view-23). */}
          <marker
            id="spec-graph-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerUnits="userSpaceOnUse"
            markerWidth="11"
            markerHeight="11"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className={ARROW_FILL} />
          </marker>
          <marker
            id="spec-graph-arrow-emphasis"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerUnits="userSpaceOnUse"
            markerWidth="11"
            markerHeight="11"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className={EMPHASIS_FILL} />
          </marker>
        </defs>

        <g
          transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}
        >
          {model.edges.map((edge) => {
            const source = edge.source as GraphNode;
            const target = edge.target as GraphNode;
            if (typeof source !== "object" || typeof target !== "object") {
              return null;
            }
            const id = `${edge.sourceKey}--${edge.targetKey}`;
            const inFocus =
              emphasis !== null &&
              (emphasis.kind === "edge"
                ? emphasis.id === id
                : emphasis.id === edge.sourceKey ||
                  emphasis.id === edge.targetKey);
            const dim =
              neighborhood !== null &&
              !(
                neighborhood.has(edge.sourceKey) &&
                neighborhood.has(edge.targetKey)
              );
            const dx = target.x - source.x;
            const dy = target.y - source.y;
            const length = Math.sqrt(dx * dx + dy * dy) || 1;
            const ux = dx / length;
            const uy = dy / length;
            // Straight lines: curvature carries no meaning here, and a
            // reciprocal pair separates by a perpendicular offset
            // instead (spec-view-23). The perpendicular is taken along
            // the pair's canonical direction, so the two edges of a
            // reciprocal pair land on opposite sides instead of both
            // flipping with their own heading.
            const forward = edge.sourceKey < edge.targetKey;
            const px = forward ? -uy : uy;
            const py = forward ? ux : -ux;
            const ox = px * edge.offset;
            const oy = py * edge.offset;
            const x1 = source.x + ux * source.r + ox;
            const y1 = source.y + uy * source.r + oy;
            const x2 = target.x - ux * (target.r + 1) + ox;
            const y2 = target.y - uy * (target.r + 1) + oy;
            return (
              <g key={id}>
                <line
                  data-testid={`graph-edge-${id}`}
                  data-weight={edge.weight}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  strokeWidth={edgeWidth(edge.weight)}
                  strokeLinecap="round"
                  className={inFocus ? EMPHASIS_STROKE : EDGE_STROKE}
                  opacity={dim ? DIM_OPACITY : 1}
                  markerEnd={
                    inFocus
                      ? "url(#spec-graph-arrow-emphasis)"
                      : "url(#spec-graph-arrow)"
                  }
                />
                {/* A wide invisible companion makes the thin line a
                    reachable hover target for its card. */}
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="transparent"
                  strokeWidth={Math.max(12, edgeWidth(edge.weight) + 8)}
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
            const focused = node.basename === keyFocus;
            const matched = searching && matchedKeys?.has(node.key);
            // Type lives in canvas units like every other mark, so
            // the collision that separated the labels and the fit that
            // frames them measure exactly what gets drawn. The layout
            // is compact enough that the fitted camera renders it at
            // the type scale (spec-view-22).
            const numeral = Math.max(LABEL_FONT_SIZE, node.r * 0.52);
            return (
              <g
                key={node.key}
                data-graph-node=""
                data-testid={`graph-node-${node.basename}`}
                data-role={node.cited ? "cited" : "uncited"}
                data-items={node.items}
                data-match={matched ? "true" : undefined}
                tabIndex={0}
                role="button"
                aria-label={`${node.basename}, ${node.items} items, cites ${node.outbound}, cited by ${node.inbound}`}
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
                {matched && (
                  <circle
                    data-testid={`graph-match-${node.basename}`}
                    cx={node.x}
                    cy={node.y}
                    r={node.r + 9}
                    fill="none"
                    strokeWidth={2}
                    strokeDasharray="4 3"
                    className={EMPHASIS_STROKE}
                  />
                )}
                {(selected || focused) && (
                  <circle
                    data-testid={`graph-halo-${node.basename}`}
                    cx={node.x}
                    cy={node.y}
                    r={node.r + 5}
                    fill="none"
                    strokeWidth={focused ? 3 : 2}
                    className={EMPHASIS_STROKE}
                  />
                )}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={node.r}
                  strokeWidth={node.cited ? 0 : 2.5}
                  className={
                    node.cited ? INK_FILL : `${TINT_FILL} ${INK_STROKE}`
                  }
                />
                <text
                  x={node.x}
                  y={node.y}
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

          {/* Names last: a label is the one mark that must never be
              painted over, whatever the node order (spec-view-22). */}
          {model.nodes.map((node) => (
            <text
              key={`label-${node.key}`}
              data-testid={`graph-label-${node.basename}`}
              x={node.x}
              y={node.y + node.r + LABEL_GAP + LABEL_FONT_SIZE * 0.8}
              textAnchor="middle"
              fontSize={LABEL_FONT_SIZE}
              paintOrder="stroke"
              strokeLinejoin="round"
              strokeWidth={3}
              opacity={dimOf(node.basename)}
              className={`pointer-events-none fill-neutral-700 dark:fill-neutral-300 ${SURFACE_STROKE}`}
            >
              {node.basename}
            </text>
          ))}
        </g>
      </svg>

      {/* Details at hand rather than a native tooltip (spec-view-26). */}
      {anchor && (cardNode || cardEdge) ? (
        <div
          data-testid="graph-card"
          role="tooltip"
          className="pointer-events-none absolute z-10 w-56 -translate-x-1/2 rounded-lg border border-neutral-200 bg-white p-2.5 text-xs shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
          style={{
            left: Math.min(Math.max(anchor.left, 96), Math.max(size.width - 96, 96)),
            top: Math.min(anchor.top, Math.max(size.height - 132, 8)),
          }}
        >
          {cardNode ? (
            <>
              <div className="font-medium text-neutral-900 dark:text-neutral-100">
                {cardNode.basename}
              </div>
              <div className="mt-1 text-neutral-600 dark:text-neutral-300">
                {cardNode.items} {cardNode.items === 1 ? "item" : "items"} in
                total
              </div>
              <ul className="mt-1 space-y-0.5">
                {GRAPH_GROUP_ORDER.map((group) => (
                  <li
                    key={group}
                    className="flex justify-between gap-3"
                    aria-label={`${cardNode.groups[group]} ${group} items`}
                  >
                    <span className={GROUP_TEXT[group]}>
                      {GROUP_LABEL[group]}
                    </span>
                    <span
                      className={
                        cardNode.groups[group] === 0
                          ? "text-neutral-400 dark:text-neutral-500"
                          : "text-neutral-700 dark:text-neutral-200"
                      }
                    >
                      {cardNode.groups[group]}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-1.5 border-t border-neutral-200 pt-1.5 text-neutral-600 dark:border-neutral-700 dark:text-neutral-300">
                cites {cardNode.outbound} · cited by {cardNode.inbound}
              </div>
            </>
          ) : cardEdge ? (
            <>
              <div className="font-medium text-neutral-900 dark:text-neutral-100">
                {cardEdge.sourceKey} → {cardEdge.targetKey}
              </div>
              <div className="mt-1 text-neutral-600 dark:text-neutral-300">
                {cardEdge.weight}{" "}
                {cardEdge.weight === 1 ? "citation" : "citations"}
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {/* Every channel and affordance in use, keyed (spec-view-24). */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 px-1 pt-2 text-xs text-neutral-600 dark:text-neutral-400">
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="h-2.5 w-2.5 rounded-full bg-neutral-700 dark:bg-neutral-200" />
          cited by packages
        </span>
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="h-2.5 w-2.5 rounded-full border-2 border-neutral-700 bg-neutral-100 dark:border-neutral-200 dark:bg-neutral-800" />
          not cited by packages
        </span>
        <span className="whitespace-nowrap">size — items</span>
        <span className="whitespace-nowrap">width — citations</span>
        <span className="whitespace-nowrap">arrow — cites</span>
        <button
          type="button"
          data-testid="graph-fit"
          title="Show the whole graph (0)"
          onClick={applyFit}
          className="rounded border border-neutral-300 px-1.5 py-0.5 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          Fit
        </button>
        <span className="ml-auto whitespace-nowrap">
          click opens · drag moves · scroll zooms
        </span>
      </div>
    </div>
  );
}
