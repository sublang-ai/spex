// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The citation graph's model, its settled arrangement, and the
// presentation that turns one into a picture (spec-view-22,
// spec-view-23, spec-view-28).
//
// Two stages, kept apart on purpose (DR-027). The arrangement is a
// pure function of the tree — topology only, no label extents, no
// pane — settled deterministically by d3-force. The presentation is a
// pure function of that arrangement and the pane: it maps positions
// onto the drawing area within a bounded aspect relaxation, then
// solves the one mark scale at which nothing overlaps. Density is
// solved here; it is never tuned into the force constants.

import {
  forceCenter,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Force,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import type { SpecFileInfo } from "@sublang/spex-core/protocol";
import { GROUP_ORDER, type SpecGroup } from "./spec-view-model.js";

// --- Encoding bands (DR-026 §1) --------------------------------------------

/** Node area carries the item count, so the radius runs on a square
 * root. Radii are unit-free here: the presentation multiplies them by
 * the one solved scale, which is what keeps the band's ratio — the
 * largest node under ~3x the smallest — true at every pane size. */
export const NODE_UNIT_MIN = 1;
export const NODE_UNIT_MAX = 2.7;
/** Smallest rendered radius, in pixels: a 24px activation target
 * (WCAG 2.2 SC 2.5.8), which outranks overlap. */
export const MARK_SCALE_FLOOR = 12;
/** Largest rendered radius, as a fraction of the pane's short side. */
export const MARK_CAP_FRACTION = 0.15;
/** Edge width band, in pixels. */
export const EDGE_MIN_WIDTH = 2;
export const EDGE_MAX_WIDTH = 6;
/** Label size and the gap under a node's rim, in pixels. */
export const LABEL_FONT_SIZE = 12;
export const LABEL_GAP = 6;
/** No label may claim more width than this; past it the name
 * ellipsizes, so one long pair cannot shrink the whole map. */
export const LABEL_MAX_WIDTH = 116;
/** Padding between the drawing area's edge and any mark. */
export const FIT_PADDING = 14;
/** How far the two axis scales may differ — bounded fill, never the
 * unbounded stretch DR-026 §4 condemned. */
export const ASPECT_RELAXATION = 1.25;

/** Model-space radius unit for the simulation. Arbitrary but fixed:
 * it sets the arrangement's internal scale, never the picture's. */
const NOMINAL_RADIUS = 16;

/** Area carries the count: the unit radius grows with its square
 * root, floored so the smallest package keeps a share of the band. */
export function nodeUnit(items: number, maxItems: number): number {
  if (maxItems <= 0) return NODE_UNIT_MIN;
  return Math.min(
    NODE_UNIT_MAX,
    Math.max(NODE_UNIT_MIN, NODE_UNIT_MAX * Math.sqrt(items / maxItems)),
  );
}

/** Width carries the citation count on an absolute scale — never
 * normalized against the tree's heaviest edge — so a weight-2 edge
 * looks the same in every project. */
export function edgeWidth(weight: number): number {
  return Math.min(
    EDGE_MAX_WIDTH,
    Math.max(EDGE_MIN_WIDTH, EDGE_MIN_WIDTH * Math.sqrt(Math.max(weight, 1))),
  );
}

// --- Model -----------------------------------------------------------------

export interface GraphNode extends SimulationNodeDatum {
  /** File key (collection-relative path minus .md). */
  key: string;
  /** Package identifier and simulation id (meta-10). */
  basename: string;
  /** Total items; the variable node area encodes. */
  items: number;
  /** Per-group item counts for the details card (spec-view-26). */
  groups: Record<SpecGroup, number>;
  /** Cross-file citations in and out. */
  inbound: number;
  outbound: number;
  /** Cited by at least one peer — the role node fill encodes. */
  cited: boolean;
  /** Unit radius; the presentation scales it into pixels. */
  unit: number;
  x: number;
  y: number;
}

export interface GraphEdge extends SimulationLinkDatum<GraphNode> {
  source: GraphNode | string;
  target: GraphNode | string;
  sourceKey: string;
  targetKey: string;
  /** Cross-file citations from source to target. */
  weight: number;
  /** Which side of a reciprocal pair this edge takes; 0 when the pair
   * is one-way (spec-view-23). */
  offset: number;
}

export interface GraphModel {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function buildGraphModel(files: readonly SpecFileInfo[]): GraphModel {
  // Longest-first so "course-catalog-3" resolves to course-catalog,
  // never to a shorter accidental prefix (basenames are tree-unique
  // identifiers per meta-10).
  const basenames = files
    .map((f) => f.basename)
    .sort((a, b) => b.length - a.length);
  const fileOf = (id: string): string | undefined => {
    const lower = id.toLowerCase();
    return basenames.find((b) => lower.startsWith(`${b}-`));
  };

  const weights = new Map<string, number>();
  for (const file of files) {
    for (const item of file.items) {
      for (const cite of item.cites ?? []) {
        const target = fileOf(cite);
        if (!target || target === file.basename) continue;
        const key = `${file.basename} ${target}`;
        weights.set(key, (weights.get(key) ?? 0) + 1);
      }
    }
  }

  const inbound = new Map<string, number>();
  const outbound = new Map<string, number>();
  for (const [key, weight] of weights) {
    const [source, target] = key.split(" ");
    inbound.set(target, (inbound.get(target) ?? 0) + weight);
    outbound.set(source, (outbound.get(source) ?? 0) + weight);
  }

  // Stable order fixes the seeded starting positions, so the same tree
  // always settles to the same arrangement (spec-view-28).
  const ordered = [...files].sort((a, b) =>
    a.basename < b.basename ? -1 : a.basename > b.basename ? 1 : 0,
  );
  const maxItems = ordered.reduce((max, f) => Math.max(max, f.items.length), 0);

  const nodes: GraphNode[] = ordered.map((file, i) => {
    const groups = { external: 0, internal: 0, test: 0 } as Record<
      SpecGroup,
      number
    >;
    for (const item of file.items) groups[item.group] += 1;
    // Deterministic phyllotaxis seed placement: no random start, so
    // the settle below has nothing to vary on.
    const angle = i * Math.PI * (3 - Math.sqrt(5));
    const radius = 26 * Math.sqrt(i + 0.5);
    return {
      key: file.key,
      basename: file.basename,
      items: file.items.length,
      groups,
      inbound: inbound.get(file.basename) ?? 0,
      outbound: outbound.get(file.basename) ?? 0,
      cited: (inbound.get(file.basename) ?? 0) > 0,
      unit: nodeUnit(file.items.length, maxItems),
      x: radius * Math.cos(angle),
      y: radius * Math.sin(angle),
    };
  });

  const edges: GraphEdge[] = [];
  for (const key of [...weights.keys()].sort()) {
    const [sourceKey, targetKey] = key.split(" ");
    const reciprocal = weights.has(`${targetKey} ${sourceKey}`);
    edges.push({
      source: sourceKey,
      target: targetKey,
      sourceKey,
      targetKey,
      weight: weights.get(key) ?? 0,
      offset: reciprocal ? (sourceKey < targetKey ? 1 : -1) : 0,
    });
  }

  return { nodes, edges };
}

// --- Arrangement ------------------------------------------------------------

/** Fixed-seed LCG standing in for Math.random inside the simulation,
 * so even coincident-node jiggle is reproducible (spec-view-28). */
function seededRandom(seed = 0x5eed): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Model-space separation: nodes never settle closer than their own
 * radii plus a margin, which is what lower-bounds the scale the
 * presentation can solve (spec-view-28). */
function forceSeparation(margin: number): Force<GraphNode, GraphEdge> {
  let nodes: GraphNode[] = [];
  const force = (alpha: number) => {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 0.001;
        const wanted =
          (a.unit + b.unit) * NOMINAL_RADIUS + margin;
        if (distance >= wanted) continue;
        const push = ((wanted - distance) / distance) * 0.5 * alpha;
        a.x -= dx * push;
        a.y -= dy * push;
        b.x += dx * push;
        b.y += dy * push;
      }
    }
  };
  force.initialize = (next: GraphNode[]) => {
    nodes = next;
  };
  return force as Force<GraphNode, GraphEdge>;
}

/** Builds the simulation behind the graph. Topology only: no label
 * extents, no pane, no density tuning — those belong to the
 * presentation (DR-027). Created stopped; the caller settles it. */
export function createSimulation(
  model: GraphModel,
): Simulation<GraphNode, GraphEdge> {
  const link = forceLink<GraphNode, GraphEdge>(model.edges)
    .id((node) => node.basename)
    .distance((edge) => {
      const source = edge.source as GraphNode;
      const target = edge.target as GraphNode;
      return (source.unit + target.unit) * NOMINAL_RADIUS + 46;
    })
    .strength(0.35);

  return forceSimulation(model.nodes)
    .randomSource(seededRandom())
    .force("link", link)
    .force("charge", forceManyBody<GraphNode>().strength(-380).distanceMax(900))
    // forceCenter only recenters the whole system; the weak positional
    // pull is what keeps a package no citation reaches from drifting
    // away from it (spec-view-28).
    .force("x", forceX<GraphNode>(0).strength(0.05))
    .force("y", forceY<GraphNode>(0).strength(0.05))
    .force("center", forceCenter<GraphNode>(0, 0))
    .force("separation", forceSeparation(18))
    .alphaDecay(0.02)
    .stop();
}

/** Runs the simulation to rest without painting a frame, so the graph
 * opens on its settled arrangement instead of animating into one. */
export function settle(simulation: Simulation<GraphNode, GraphEdge>): void {
  simulation.alpha(1);
  const ticks = Math.ceil(
    Math.log(simulation.alphaMin()) / Math.log(1 - simulation.alphaDecay()),
  );
  for (let i = 0; i < ticks; i++) simulation.tick();
  simulation.stop();
}

// --- Presentation -----------------------------------------------------------

export interface Placement {
  key: string;
  x: number;
  y: number;
  /** Rendered radius in pixels: unit × the solved scale. */
  r: number;
  /** Label as drawn, ellipsized to LABEL_MAX_WIDTH. */
  label: string;
  /** Drawn label's width in pixels. */
  labelWidth: number;
}

export interface Presentation {
  places: Map<string, Placement>;
  /** The one solved mark scale (pixels per unit radius). */
  scale: number;
  /** Presentation pixels back to model space — what a drag needs, so
   * the pointer can address the arrangement the simulation holds. */
  toModel: (x: number, y: number) => { x: number; y: number };
}

export type MeasureLabel = (text: string) => number;

/** Cuts a label to the width cap, keeping the measurement honest by
 * re-measuring the truncation. */
function ellipsize(
  text: string,
  measure: MeasureLabel,
): { label: string; width: number } {
  const full = measure(text);
  if (full <= LABEL_MAX_WIDTH) return { label: text, width: full };
  let cut = text;
  while (cut.length > 1) {
    cut = cut.slice(0, -1);
    const candidate = `${cut}…`;
    const width = measure(candidate);
    if (width <= LABEL_MAX_WIDTH) return { label: candidate, width };
  }
  return { label: "…", width: measure("…") };
}

/** The smallest scale at which two marks touch, or Infinity if they
 * never do.
 *
 * A mark is the axis-aligned box around its circle and the label
 * hanging under it: half-width max(unit·s, labelHalf), top y−unit·s,
 * bottom y+unit·s+gap+font. Every edge of that box moves outward as s
 * grows, so overlap is monotone in s and each axis contributes one
 * threshold; the pair's contact scale is the larger of the two. That
 * monotonicity is what makes an exact solve possible — a label-only
 * box would translate rather than grow, and no such threshold would
 * exist. */
interface SolveMark {
  x: number;
  y: number;
  unit: number;
  labelHalf: number;
}

function pairContactScale(a: SolveMark, b: SolveMark): number {
  const gap = LABEL_GAP + LABEL_FONT_SIZE;
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  const units = a.unit + b.unit;

  // Vertical: the boxes span [y − unit·s, y + unit·s + gap], so they
  // meet once |dy| < units·s + gap.
  const vertical = Math.max(0, (dy - gap) / units);

  // Horizontal: half-widths are max(unit·s, labelHalf) — piecewise
  // linear and non-decreasing, with a breakpoint per node.
  const labels = a.labelHalf + b.labelHalf;
  let horizontal: number;
  if (dx < labels) {
    horizontal = 0;
  } else {
    const breakA = a.labelHalf / a.unit;
    const breakB = b.labelHalf / b.unit;
    const first = Math.min(breakA, breakB);
    const second = Math.max(breakA, breakB);
    // Between the breakpoints one side still rides its label.
    const risingUnit = breakA <= breakB ? a.unit : b.unit;
    const heldLabel = breakA <= breakB ? b.labelHalf : a.labelHalf;
    const middle = (dx - heldLabel) / risingUnit;
    if (middle >= first && middle <= second) {
      horizontal = middle;
    } else {
      horizontal = dx / units;
    }
  }
  return Math.max(vertical, horizontal);
}

/** Maps a settled arrangement onto the pane and solves the picture's
 * one mark scale (spec-view-28). Pure in (nodes, area, metrics). */
export function presentLayout(
  nodes: readonly GraphNode[],
  area: { width: number; height: number },
  measure: MeasureLabel,
  /** Holds the mark scale steady while the reader drags: a local
   * gesture must not resize every mark on the canvas. Overlaps a drag
   * creates are the reader's own (spec-view-28). */
  heldScale?: number,
): Presentation {
  const labels = new Map<string, { label: string; width: number }>();
  for (const node of nodes) labels.set(node.key, ellipsize(node.basename, measure));

  const places = new Map<string, Placement>();
  const identity = (x: number, y: number) => ({ x, y });
  if (nodes.length === 0 || area.width <= 0 || area.height <= 0) {
    return { places, scale: MARK_SCALE_FLOOR, toModel: identity };
  }

  const shortSide = Math.min(area.width, area.height);
  const cap = Math.max(
    MARK_SCALE_FLOOR,
    (shortSide * MARK_CAP_FRACTION) / NODE_UNIT_MAX,
  );

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    maxX = Math.max(maxX, node.x);
    minY = Math.min(minY, node.y);
    maxY = Math.max(maxY, node.y);
  }
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  // Margins reserve room for the marks themselves, which are only
  // known once the scale is solved; three passes settle the mutual
  // dependency, and the loop is fixed-length so the result stays a
  // pure function of its inputs.
  let marginX = 0;
  let marginY = 0;
  let scale = MARK_SCALE_FLOOR;
  let positions = new Map<string, { x: number; y: number }>();
  let finalKx = 1;
  let finalKy = 1;

  for (let pass = 0; pass < 3; pass++) {
    const availableX = Math.max(
      1,
      area.width - 2 * FIT_PADDING - 2 * marginX,
    );
    const availableY = Math.max(
      1,
      area.height - 2 * FIT_PADDING - 2 * marginY,
    );
    // A span too small to map keeps the identity scale, centered.
    let kx = spanX > 0.5 ? availableX / spanX : 1;
    let ky = spanY > 0.5 ? availableY / spanY : 1;
    // Bounded fill: the axes may differ, but only so far.
    if (kx > ky * ASPECT_RELAXATION) kx = ky * ASPECT_RELAXATION;
    if (ky > kx * ASPECT_RELAXATION) ky = kx * ASPECT_RELAXATION;

    finalKx = kx;
    finalKy = ky;
    positions = new Map();
    for (const node of nodes) {
      positions.set(node.key, {
        x: area.width / 2 + (node.x - midX) * kx,
        y: area.height / 2 + (node.y - midY) * ky,
      });
    }

    // The largest scale at which nothing touches: the smallest contact
    // scale over every pair.
    const marks: SolveMark[] = nodes.map((node) => {
      const place = positions.get(node.key)!;
      return {
        x: place.x,
        y: place.y,
        unit: node.unit,
        labelHalf: (labels.get(node.key)?.width ?? 0) / 2,
      };
    });
    if (heldScale !== undefined) {
      scale = heldScale;
    } else {
      let solved = Infinity;
      for (let i = 0; i < marks.length; i++) {
        for (let j = i + 1; j < marks.length; j++) {
          solved = Math.min(solved, pairContactScale(marks[i], marks[j]));
        }
      }
      // The activation-target floor outranks overlap; the cap applies
      // to what the solve allows.
      scale = Math.max(
        MARK_SCALE_FLOOR,
        Math.min(Number.isFinite(solved) ? solved : cap, cap),
      );
    }

    // Does anything now sit outside the drawing area?
    let overflowX = 0;
    let overflowY = 0;
    for (const node of nodes) {
      const place = positions.get(node.key)!;
      const half = Math.max(
        node.unit * scale,
        (labels.get(node.key)?.width ?? 0) / 2,
      );
      overflowX = Math.max(
        overflowX,
        FIT_PADDING - (place.x - half),
        place.x + half - (area.width - FIT_PADDING),
      );
      overflowY = Math.max(
        overflowY,
        FIT_PADDING - (place.y - node.unit * scale),
        place.y +
          node.unit * scale +
          LABEL_GAP +
          LABEL_FONT_SIZE -
          (area.height - FIT_PADDING),
      );
    }
    if (overflowX <= 0.5 && overflowY <= 0.5) break;
    marginX += Math.max(0, overflowX);
    marginY += Math.max(0, overflowY);
  }

  for (const node of nodes) {
    const place = positions.get(node.key)!;
    const label = labels.get(node.key)!;
    places.set(node.key, {
      key: node.key,
      x: place.x,
      y: place.y,
      r: node.unit * scale,
      label: label.label,
      labelWidth: label.width,
    });
  }
  const toModel = (x: number, y: number) => ({
    x: midX + (x - area.width / 2) / (finalKx || 1),
    y: midY + (y - area.height / 2) / (finalKy || 1),
  });
  return { places, scale, toModel };
}

/** Group order for the details card's breakdown (spec-view-26). */
export const GRAPH_GROUP_ORDER = GROUP_ORDER;
