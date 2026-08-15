// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The citation graph's data model and its settled layout
// (spec-view-22, spec-view-23, spec-view-28). Physics comes from
// d3-force under our own rendering (DR-026 §6): this module owns the
// counting, the encodings' scales, and a deterministic settle; the
// component owns every pixel.

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

// --- Encoding scales (DR-026 §1) -------------------------------------------
//
// Node area carries the item count, so the radius runs on a square
// root; the band keeps the largest node under ~3x the smallest, which
// is the range size can be read as an ordering rather than a value.

export const NODE_MIN_RADIUS = 14;
export const NODE_MAX_RADIUS = 38;
/** Edge width band, in canvas units. */
export const EDGE_MIN_WIDTH = 1.5;
export const EDGE_MAX_WIDTH = 6;
/** Label and numeral size floor, in on-screen pixels. */
export const LABEL_FONT_SIZE = 12;
/** Gap between a node's rim and its label's cap height. */
export const LABEL_GAP = 7;

/** Area carries the count: r grows with its square root, floored so
 * the smallest package stays a legible target and capped so the
 * largest cannot dominate the layout. */
export function nodeRadius(items: number, maxItems: number): number {
  if (maxItems <= 0) return NODE_MIN_RADIUS;
  const scaled = NODE_MAX_RADIUS * Math.sqrt(items / maxItems);
  return Math.min(NODE_MAX_RADIUS, Math.max(NODE_MIN_RADIUS, scaled));
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
  r: number;
  /** Measured label width in on-screen pixels at LABEL_FONT_SIZE. */
  labelWidth: number;
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
  /** Perpendicular offset separating a reciprocally citing pair
   * (spec-view-23); 0 for every one-way edge. */
  offset: number;
}

export interface GraphModel {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** Measures a label's width in pixels at LABEL_FONT_SIZE. Injected so
 * the layout is a pure function of the tree and its metrics, and so a
 * headless renderer still settles deterministically. */
export type MeasureLabel = (text: string) => number;

export function buildGraphModel(
  files: readonly SpecFileInfo[],
  measure: MeasureLabel,
): GraphModel {
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
  // always settles to the same picture (spec-view-28).
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
    const radius = 24 * Math.sqrt(i + 0.5);
    return {
      key: file.key,
      basename: file.basename,
      items: file.items.length,
      groups,
      inbound: inbound.get(file.basename) ?? 0,
      outbound: outbound.get(file.basename) ?? 0,
      cited: (inbound.get(file.basename) ?? 0) > 0,
      r: nodeRadius(file.items.length, maxItems),
      labelWidth: measure(file.basename),
      x: radius * Math.cos(angle),
      y: radius * Math.sin(angle),
    };
  });

  const edges: GraphEdge[] = [];
  for (const key of [...weights.keys()].sort()) {
    const [sourceKey, targetKey] = key.split(" ");
    // A reciprocal pair draws as two offset edges rather than one
    // ambiguous double-headed line (spec-view-23).
    const reciprocal = weights.has(`${targetKey} ${sourceKey}`);
    edges.push({
      source: sourceKey,
      target: targetKey,
      sourceKey,
      targetKey,
      weight: weights.get(key) ?? 0,
      offset: reciprocal ? (sourceKey < targetKey ? 7 : -7) : 0,
    });
  }

  return { nodes, edges };
}

// --- Settle ----------------------------------------------------------------

/** Fixed-seed LCG standing in for Math.random inside the simulation,
 * so even coincident-node jiggle is reproducible (spec-view-28). */
function seededRandom(seed = 0x5eed): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Half-extents of a node's whole mark: the circle, and the label
 * hanging under it. Collision runs on these boxes rather than on the
 * circles, so labels are separated by construction (DR-026 §4). */
function markBox(node: GraphNode): {
  halfWidth: number;
  halfHeight: number;
  centerY: number;
} {
  const labelBottom = node.r + LABEL_GAP + LABEL_FONT_SIZE;
  return {
    halfWidth: Math.max(node.r, node.labelWidth / 2),
    halfHeight: (node.r + labelBottom) / 2,
    centerY: (labelBottom - node.r) / 2,
  };
}

/** Rectangular separation over the mark boxes — the label-aware
 * collision d3's circular collide cannot express. O(n²) is free at
 * the tree sizes DR-026 scopes. */
function forceMarkBoxes(padding: number): Force<GraphNode, GraphEdge> {
  let nodes: GraphNode[] = [];
  const force = (alpha: number) => {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const boxA = markBox(a);
        const boxB = markBox(b);
        const dx = b.x - a.x;
        const dy = b.y + boxB.centerY - (a.y + boxA.centerY);
        const overlapX = boxA.halfWidth + boxB.halfWidth + padding - Math.abs(dx);
        const overlapY =
          boxA.halfHeight + boxB.halfHeight + padding - Math.abs(dy);
        if (overlapX <= 0 || overlapY <= 0) continue;
        // Part along the axis needing the smaller correction.
        const strength = 0.5 * alpha;
        if (overlapX < overlapY) {
          const push = (dx >= 0 ? 1 : -1) * overlapX * strength;
          a.x -= push;
          b.x += push;
        } else {
          const push = (dy >= 0 ? 1 : -1) * overlapY * strength;
          a.y -= push;
          b.y += push;
        }
      }
    }
  };
  force.initialize = (next: GraphNode[]) => {
    nodes = next;
  };
  return force as Force<GraphNode, GraphEdge>;
}

/** Builds the simulation behind the graph. It is created stopped: the
 * caller settles it synchronously for the first paint, and reheats it
 * only under the reader's hand (spec-view-28). */
export function createSimulation(
  model: GraphModel,
): Simulation<GraphNode, GraphEdge> {
  const link = forceLink<GraphNode, GraphEdge>(model.edges)
    .id((node) => node.basename)
    .distance((edge) => {
      const source = edge.source as GraphNode;
      const target = edge.target as GraphNode;
      return source.r + target.r + 70;
    })
    .strength(0.4);

  return forceSimulation(model.nodes)
    .randomSource(seededRandom())
    .force("link", link)
    .force("charge", forceManyBody<GraphNode>().strength(-520).distanceMax(700))
    // forceCenter only recenters the whole system; the weak positional
    // pull is what keeps a package no citation reaches from drifting
    // off the canvas (spec-view-28).
    .force("x", forceX<GraphNode>(0).strength(0.045))
    .force("y", forceY<GraphNode>(0).strength(0.045))
    .force("center", forceCenter<GraphNode>(0, 0))
    .force("marks", forceMarkBoxes(14))
    .alphaDecay(0.02)
    .stop();
}

/** Runs the simulation to rest without painting a frame, so the graph
 * opens on its settled picture instead of animating into one. */
export function settle(simulation: Simulation<GraphNode, GraphEdge>): void {
  simulation.alpha(1);
  const ticks = Math.ceil(
    Math.log(simulation.alphaMin()) / Math.log(1 - simulation.alphaDecay()),
  );
  for (let i = 0; i < ticks; i++) simulation.tick();
  simulation.stop();
}

/** The layout's extent, including each label's box — what the camera
 * fits on open (spec-view-27). */
export function layoutBounds(nodes: readonly GraphNode[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  if (nodes.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    const halfWidth = Math.max(node.r, node.labelWidth / 2);
    minX = Math.min(minX, node.x - halfWidth);
    maxX = Math.max(maxX, node.x + halfWidth);
    minY = Math.min(minY, node.y - node.r);
    maxY = Math.max(maxY, node.y + node.r + LABEL_GAP + LABEL_FONT_SIZE);
  }
  return { minX, minY, maxX, maxY };
}

/** Group order for the details card's breakdown (spec-view-26). */
export const GRAPH_GROUP_ORDER = GROUP_ORDER;
