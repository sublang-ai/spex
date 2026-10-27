// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The citation graph's model, its settled arrangement, and the
// presentation that turns one into a picture (spec-view-22,
// spec-view-23, spec-view-28).
//
// Two stages, kept apart on purpose (DR-027). The arrangement is a
// pure function of the tree — topology only, no label extents, no
// pane — settled deterministically by d3-force over the backbone's
// pairs (DR-158). The presentation is a pure function of that
// arrangement and the pane: it maps positions onto the drawing area
// within a bounded aspect relaxation, sets the packages no citation
// reaches in a row along the foot, then solves the one mark scale at
// which nothing overlaps. Density is solved here; it is never tuned
// into the force constants. Labels are placed last, around the
// picture as drawn.

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
import {
  buildCitationModel,
  GROUP_ORDER,
  type SpecGroup,
} from "./spec-view-model.js";

// --- Encoding bands (DR-026 §1) --------------------------------------------

/** Node area carries the item count, so the radius runs on a square
 * root. Radii are unit-free here: the presentation multiplies them by
 * the one solved scale, which is what keeps the band's ratio — the
 * largest node 2.4x the smallest (DR-158) — true at every pane size. */
export const NODE_UNIT_MIN = 1;
export const NODE_UNIT_MAX = 2.4;
/** Smallest rendered radius, in pixels: a 24px activation target
 * (WCAG 2.2 SC 2.5.8), which outranks overlap. */
export const MARK_SCALE_FLOOR = 12;
/** Largest rendered radius, as a fraction of the pane's short side. */
export const MARK_CAP_FRACTION = 0.15;
/** Every edge's width, in pixels: width carries no count (DR-158). */
export const EDGE_WIDTH = 2;
/** A pair whose citations in both directions total this many belongs
 * to the resting backbone (spec-view-23). */
export const BACKBONE_MIN = 6;
/** Label size and the gap under a node's rim, in pixels. */
export const LABEL_FONT_SIZE = 12;
export const LABEL_GAP = 6;
/** What a drawn label claims below its baseline: descenders plus the
 * halo that keeps it readable over edges. The solve measures the mark
 * as drawn, so marks clear rather than merely touch. */
export const LABEL_DESCENT = 5;
/** No label may claim more width than this; past it the name
 * ellipsizes, so one long pair cannot shrink the whole map. */
export const LABEL_MAX_WIDTH = 116;
/** Padding between the drawing area's edge and any mark. */
export const FIT_PADDING = 14;
/** A placed label's clearance from another node's circle, and from
 * the canvas edge (spec-view-22). */
export const LABEL_CIRCLE_CLEARANCE = 5;
export const LABEL_EDGE_CLEARANCE = 10;
/** A label's box height as placement reserves it. */
export const LABEL_HEIGHT = LABEL_FONT_SIZE + 4;
/** The foot row's caption line, above its marks (spec-view-28). */
export const FOOT_CAPTION = 18;
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

/** Measures a label's drawn width in pixels at LABEL_FONT_SIZE. */
export type MeasureLabel = (text: string) => number;

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
  /** Cites or is cited by a peer; an unlinked package stands in the
   * foot row, outside the arrangement (spec-view-28). */
  linked: boolean;
  /** Unit radius; the presentation scales it into pixels. */
  unit: number;
  /** Half the label's drawn width, in pixels. The arrangement keeps
   * room for it: a name is a mark, and an arrangement blind to names
   * leaves the presentation a scale it cannot solve above the
   * activation floor (spec-view-28). */
  labelHalf: number;
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

/** One package pair, both directions together — what the resting
 * backbone draws as a single undirected line (spec-view-23). */
export interface GraphPair {
  /** Basenames, ordered so `a < b`. */
  a: string;
  b: string;
  /** Citations a→b and b→a. */
  ab: number;
  ba: number;
  total: number;
  /** Drawn at rest: heavy enough, or some package's heaviest pair. */
  backbone: boolean;
}

export interface GraphModel {
  nodes: GraphNode[];
  /** Every citing→cited pair, directed — what the selection draws. */
  edges: GraphEdge[];
  /** Every pair, undirected — what the resting backbone draws. */
  pairs: GraphPair[];
}

export function buildGraphModel(
  files: readonly SpecFileInfo[],
  measure: MeasureLabel,
): GraphModel {
  // The one citation index the outline's rollups read too, keyed by
  // item ID: a citation of an absent ID counts in no pair, so both
  // projections agree on every count (spec-view-19, spec-view-23).
  const basenameOf = new Map(files.map((f) => [f.key, f.basename]));
  const weights = new Map<string, number>();
  for (const [key, weight] of buildCitationModel(files).pairs) {
    const [source, target] = key.split(" ");
    const pair = `${basenameOf.get(source)} ${basenameOf.get(target)}`;
    weights.set(pair, (weights.get(pair) ?? 0) + weight);
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
    const into = inbound.get(file.basename) ?? 0;
    const out = outbound.get(file.basename) ?? 0;
    return {
      key: file.key,
      basename: file.basename,
      items: file.items.length,
      groups,
      inbound: into,
      outbound: out,
      cited: into > 0,
      linked: into + out > 0,
      unit: nodeUnit(file.items.length, maxItems),
      labelHalf: Math.min(measure(file.basename), LABEL_MAX_WIDTH) / 2,
      x: radius * Math.cos(angle),
      y: radius * Math.sin(angle),
    };
  });

  const edges: GraphEdge[] = [];
  const pairsByKey = new Map<string, GraphPair>();
  for (const key of [...weights.keys()].sort()) {
    const [sourceKey, targetKey] = key.split(" ");
    const weight = weights.get(key) ?? 0;
    const reciprocal = weights.has(`${targetKey} ${sourceKey}`);
    edges.push({
      source: sourceKey,
      target: targetKey,
      sourceKey,
      targetKey,
      weight,
      offset: reciprocal ? (sourceKey < targetKey ? 1 : -1) : 0,
    });
    const forward = sourceKey < targetKey;
    const [a, b] = forward ? [sourceKey, targetKey] : [targetKey, sourceKey];
    const pairKey = `${a} ${b}`;
    const pair = pairsByKey.get(pairKey) ?? {
      a,
      b,
      ab: 0,
      ba: 0,
      total: 0,
      backbone: false,
    };
    if (forward) pair.ab += weight;
    else pair.ba += weight;
    pair.total += weight;
    pairsByKey.set(pairKey, pair);
  }

  // The backbone: every heavy pair, and each package's heaviest, so no
  // linked package looks unlinked at rest (spec-view-23). Ties go to
  // the pair sorting first, keeping the picture a function of the tree.
  const pairs = [...pairsByKey.values()];
  const heaviest = new Map<string, GraphPair>();
  for (const pair of pairs) {
    for (const end of [pair.a, pair.b]) {
      const held = heaviest.get(end);
      if (!held || pair.total > held.total) heaviest.set(end, pair);
    }
  }
  for (const pair of pairs) {
    pair.backbone =
      pair.total >= BACKBONE_MIN ||
      heaviest.get(pair.a) === pair ||
      heaviest.get(pair.b) === pair;
  }

  return { nodes, edges, pairs };
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

/** Model-space separation over each node's whole mark — its circle
 * and the name under it. Rectangular, because a name is wide and
 * short: separating circles alone leaves two long names side by side,
 * and the presentation then has no scale that both clears them and
 * holds the activation floor (spec-view-28). */
function forceSeparation(margin: number): Force<GraphNode, GraphEdge> {
  let nodes: GraphNode[] = [];
  const force = (alpha: number) => {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const wantX =
          Math.max(a.unit * NOMINAL_RADIUS, a.labelHalf) +
          Math.max(b.unit * NOMINAL_RADIUS, b.labelHalf) +
          margin;
        const wantY = (a.unit + b.unit) * NOMINAL_RADIUS + margin;
        const overX = wantX - Math.abs(dx);
        const overY = wantY - Math.abs(dy);
        if (overX <= 0 || overY <= 0) continue;
        // Part along the axis needing the smaller correction.
        const push = 0.5 * alpha;
        if (overX < overY) {
          const shift = (dx >= 0 ? 1 : -1) * overX * push;
          a.x -= shift;
          b.x += shift;
        } else {
          const shift = (dy >= 0 ? 1 : -1) * overY * push;
          a.y -= shift;
          b.y += shift;
        }
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
  // The arrangement follows the backbone alone, so the clusters it
  // draws show; weak pairs would only knot them together (DR-158).
  const links: GraphEdge[] = model.pairs
    .filter((pair) => pair.backbone)
    .map((pair) => ({
      source: pair.a,
      target: pair.b,
      sourceKey: pair.a,
      targetKey: pair.b,
      weight: pair.total,
      offset: 0,
    }));
  const link = forceLink<GraphNode, GraphEdge>(links)
    .id((node) => node.basename)
    .distance((edge) => {
      const source = edge.source as GraphNode;
      const target = edge.target as GraphNode;
      return (source.unit + target.unit) * NOMINAL_RADIUS + 46;
    })
    .strength(0.35);

  // An unlinked package stands in the foot row, outside the
  // arrangement (spec-view-28).
  return forceSimulation(model.nodes.filter((node) => node.linked))
    .randomSource(seededRandom())
    .force("link", link)
    // Repulsion only opens the topology; the separation force below
    // is what sets how close marks may sit. Keeping charge modest
    // stops the arrangement from sprawling, which is what leaves the
    // presentation room to solve a larger mark scale (spec-view-28).
    .force("charge", forceManyBody<GraphNode>().strength(-90).distanceMax(600))
    // forceCenter only recenters the whole system; the weak positional
    // pull keeps the clusters the backbone leaves apart from drifting
    // off (spec-view-28).
    .force("x", forceX<GraphNode>(0).strength(0.05))
    .force("y", forceY<GraphNode>(0).strength(0.05))
    .force("center", forceCenter<GraphNode>(0, 0))
    .force("separation", forceSeparation(16))
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
  /** Where the foot row begins, its caption line included; absent
   * when every package is linked (spec-view-28). */
  footTop?: number;
  /** Presentation pixels back to model space — what a drag needs, so
   * the pointer can address the arrangement the simulation holds. */
  toModel: (x: number, y: number) => { x: number; y: number };
}

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
  const gap = LABEL_GAP + LABEL_FONT_SIZE + LABEL_DESCENT;
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

/** The foot row's height at a mark scale: its caption, its tallest
 * circle, and the label hung beneath (spec-view-28). */
function footHeight(foot: readonly GraphNode[], scale: number): number {
  if (foot.length === 0) return 0;
  const tallest = Math.max(...foot.map((node) => node.unit * scale));
  return FOOT_CAPTION + 2 * tallest + LABEL_GAP + LABEL_HEIGHT + FIT_PADDING;
}

/** Maps a settled arrangement onto the pane and solves the picture's
 * one mark scale (spec-view-28). Pure in (nodes, area, metrics). The
 * packages no citation reaches stand in a row along the foot, so the
 * arrangement fills the area above it. */
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
  const arranged = nodes.filter((node) => node.linked);
  const foot = nodes.filter((node) => !node.linked);

  const shortSide = Math.min(area.width, area.height);
  const cap = Math.max(
    MARK_SCALE_FLOOR,
    (shortSide * MARK_CAP_FRACTION) / NODE_UNIT_MAX,
  );

  // A landscape arrangement in a portrait pane — or the reverse — is
  // turned a quarter, so the picture spends the pane's long side on
  // its own (spec-view-28). Position in model space is never touched:
  // the turn is the presentation's alone, and `toModel` undoes it.
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const node of arranged) {
    minX = Math.min(minX, node.x);
    maxX = Math.max(maxX, node.x);
    minY = Math.min(minY, node.y);
    maxY = Math.max(maxY, node.y);
  }
  const turned =
    arranged.length > 1 &&
    (maxX - minX > maxY - minY) !== (area.width > area.height);
  const ax = (node: { x: number; y: number }) => (turned ? node.y : node.x);
  const ay = (node: { x: number; y: number }) => (turned ? -node.x : node.y);
  if (turned) {
    [minX, maxX, minY, maxY] = [minY, maxY, -maxX, -minX];
  }
  const spanX = arranged.length > 0 ? maxX - minX : 0;
  const spanY = arranged.length > 0 ? maxY - minY : 0;
  const midX = arranged.length > 0 ? (minX + maxX) / 2 : 0;
  const midY = arranged.length > 0 ? (minY + maxY) / 2 : 0;

  // Margins reserve room for the marks themselves, which are only
  // known once the scale is solved; three passes settle the mutual
  // dependency, and the loop is fixed-length so the result stays a
  // pure function of its inputs. The foot row's height rides the
  // same scale, so it settles in the same passes.
  let marginX = 0;
  let marginY = 0;
  let scale = heldScale ?? MARK_SCALE_FLOOR;
  let footH = footHeight(foot, scale);
  let positions = new Map<string, { x: number; y: number }>();
  let finalKx = 1;
  let finalKy = 1;
  let height = area.height;

  for (let pass = 0; pass < 3; pass++) {
    // The arrangement fills what the foot row leaves, never less than
    // half the pane.
    height = Math.max(area.height / 2, area.height - footH);
    // The margins never take more than half the padded area: a pane
    // too short for its marks lets the marks at its edges reach past
    // the edge rather than collapsing the arrangement onto one point.
    const spanFloorX = (area.width - 2 * FIT_PADDING) / 2;
    const spanFloorY = (height - 2 * FIT_PADDING) / 2;
    const availableX = Math.max(
      1,
      spanFloorX,
      area.width - 2 * FIT_PADDING - 2 * marginX,
    );
    const availableY = Math.max(
      1,
      spanFloorY,
      height - 2 * FIT_PADDING - 2 * marginY,
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
    for (const node of arranged) {
      positions.set(node.key, {
        x: area.width / 2 + (ax(node) - midX) * kx,
        y: height / 2 + (ay(node) - midY) * ky,
      });
    }

    // The largest scale at which nothing touches: the smallest contact
    // scale over every pair.
    const marks: SolveMark[] = arranged.map((node) => {
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
    footH = footHeight(foot, scale);

    // Does a circle now sit outside the drawing area? Only circles are
    // reserved for: a name takes whichever side of its node has room,
    // or waits (spec-view-22), so reserving every name's full width at
    // every edge would squeeze a narrow pane's picture onto half of it.
    let overflowX = 0;
    let overflowY = 0;
    for (const node of arranged) {
      const place = positions.get(node.key)!;
      const r = node.unit * scale;
      overflowX = Math.max(
        overflowX,
        FIT_PADDING - (place.x - r),
        place.x + r - (area.width - FIT_PADDING),
      );
      overflowY = Math.max(
        overflowY,
        FIT_PADDING - (place.y - r),
        place.y + r - (height - FIT_PADDING),
      );
    }
    if (
      overflowX <= 0.5 &&
      overflowY <= 0.5 &&
      Math.abs(height - Math.max(area.height / 2, area.height - footH)) <= 0.5
    ) {
      break;
    }
    marginX += Math.max(0, overflowX);
    marginY += Math.max(0, overflowY);
  }

  for (const node of arranged) {
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

  // The foot row: in name order, left to right, each slot as wide as
  // its circle or its name; a row longer than the pane closes up
  // rather than leaving it (spec-view-28).
  let footTop: number | undefined;
  if (foot.length > 0) {
    footTop = arranged.length > 0 ? height : FIT_PADDING;
    const tallest = Math.max(...foot.map((node) => node.unit * scale));
    const cy = footTop + FOOT_CAPTION + tallest;
    const slots = foot.map((node) =>
      Math.max(2 * node.unit * scale, labels.get(node.key)!.width),
    );
    const gap = 24;
    const needed = slots.reduce((sum, w) => sum + w, 0) + gap * (slots.length - 1);
    const room = area.width - 2 * FIT_PADDING;
    const squeeze = needed > room && slots.length > 1
      ? (room - slots.reduce((sum, w) => sum + w, 0)) / (slots.length - 1)
      : gap;
    let x = FIT_PADDING;
    foot.forEach((node, i) => {
      const label = labels.get(node.key)!;
      places.set(node.key, {
        key: node.key,
        x: x + slots[i] / 2,
        y: cy,
        r: node.unit * scale,
        label: label.label,
        labelWidth: label.width,
      });
      x += slots[i] + squeeze;
    });
  }

  const toModel = (x: number, y: number) => {
    const px = midX + (x - area.width / 2) / (finalKx || 1);
    const py = midY + (y - height / 2) / (finalKy || 1);
    // Undo the quarter turn: presented (y, -x) back to model (x, y).
    return turned ? { x: -py, y: px } : { x: px, y: py };
  };
  return { places, scale, footTop, toModel };
}

// --- Labels -----------------------------------------------------------------

/** A label as the picture places it: its box's top-left corner and
 * size, in presentation pixels. */
export interface LabelBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LabelRequest {
  key: string;
  /** The text's drawn width. */
  width: number;
  /** Placed first, and placed even without a free place: the label
   * the selection or an inspection needs (spec-view-22). */
  forced?: boolean;
  /** Larger packages place first. */
  priority: number;
  /** Where the label's own region ends, if above the canvas's foot:
   * an arranged node's name stays out of the foot row (spec-view-28). */
  bottom?: number;
}

type Segment = readonly [number, number, number, number];

/** Whether a segment crosses a box. */
function crosses(s: Segment, box: LabelBox): boolean {
  const [ax, ay, bx, by] = s;
  const x0 = box.x;
  const y0 = box.y;
  const x1 = box.x + box.width;
  const y1 = box.y + box.height;
  if (
    Math.max(ax, bx) < x0 ||
    Math.min(ax, bx) > x1 ||
    Math.max(ay, by) < y0 ||
    Math.min(ay, by) > y1
  ) {
    return false;
  }
  const side = (x: number, y: number) => (bx - ax) * (y - ay) - (by - ay) * (x - ax);
  const corners = [side(x0, y0), side(x1, y0), side(x0, y1), side(x1, y1)];
  return !(corners.every((v) => v > 0) || corners.every((v) => v < 0));
}

/** The gap between a box and a circle; negative when they overlap. */
function boxCircleGap(box: LabelBox, place: Placement): number {
  const nx = Math.max(box.x, Math.min(place.x, box.x + box.width));
  const ny = Math.max(box.y, Math.min(place.y, box.y + box.height));
  return Math.hypot(place.x - nx, place.y - ny) - place.r;
}

function boxesMeet(a: LabelBox, b: LabelBox, margin: number): boolean {
  return !(
    a.x + a.width + margin <= b.x ||
    b.x + b.width + margin <= a.x ||
    a.y + a.height + margin <= b.y ||
    b.y + b.height + margin <= a.y
  );
}

/** Places each requested label at the first of four places around its
 * node — below, above, right, left — that keeps clear of every other
 * circle, every label already placed, and the canvas edge, preferring
 * the place that crosses the fewest drawn segments (spec-view-22).
 * Forced labels go first and stand at their best place even where
 * none is free; any other label without a free place is left out. */
export function placeLabels(
  requests: readonly LabelRequest[],
  places: ReadonlyMap<string, Placement>,
  segments: readonly Segment[],
  area: { width: number; height: number },
): Map<string, LabelBox> {
  const placed = new Map<string, LabelBox>();
  const order = [...requests].sort(
    (a, b) =>
      Number(Boolean(b.forced)) - Number(Boolean(a.forced)) ||
      b.priority - a.priority ||
      (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  );
  const circles = [...places.values()];
  for (const request of order) {
    const place = places.get(request.key);
    if (!place) continue;
    const w = request.width;
    const h = LABEL_HEIGHT;
    const side = LABEL_CIRCLE_CLEARANCE;
    const candidates: LabelBox[] = [
      { x: place.x - w / 2, y: place.y + place.r + LABEL_GAP - 2, width: w, height: h },
      { x: place.x - w / 2, y: place.y - place.r - LABEL_GAP - h + 2, width: w, height: h },
      { x: place.x + place.r + side, y: place.y - h / 2, width: w, height: h },
      { x: place.x - place.r - side - w, y: place.y - h / 2, width: w, height: h },
    ];
    let best: LabelBox | undefined;
    let bestCost = Infinity;
    for (const box of candidates) {
      let blocked = 0;
      if (
        box.x < LABEL_EDGE_CLEARANCE ||
        box.y < LABEL_EDGE_CLEARANCE ||
        box.x + box.width > area.width - LABEL_EDGE_CLEARANCE ||
        box.y + box.height >
          (request.bottom ?? area.height) - LABEL_EDGE_CLEARANCE
      ) {
        blocked += 1;
      }
      for (const other of circles) {
        if (other.key === request.key) continue;
        if (boxCircleGap(box, other) < LABEL_CIRCLE_CLEARANCE) blocked += 1;
      }
      for (const other of placed.values()) {
        if (boxesMeet(box, other, 2)) blocked += 1;
      }
      let crossings = 0;
      for (const segment of segments) if (crosses(segment, box)) crossings += 1;
      // Any block outweighs every crossing: a free place always wins.
      const cost = blocked * 10_000 + crossings;
      if (cost < bestCost) {
        bestCost = cost;
        best = box;
      }
    }
    if (best && (bestCost < 10_000 || request.forced)) {
      placed.set(request.key, best);
    }
  }
  return placed;
}

/** Group order for the details card's breakdown (spec-view-26). */
export const GRAPH_GROUP_ORDER = GROUP_ORDER;
