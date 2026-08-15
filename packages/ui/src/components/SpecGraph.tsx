// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { useEffect, useMemo, useRef, useState } from "react";
import type { SpecFileInfo } from "@sublang/spex-core/protocol";

/**
 * The package citation graph (spec-view-20): one node per spec file,
 * one directed edge per citing→cited package pair, weighted by the
 * number of cross-file citations. Under meta-14 every peer reliance
 * is a citation, so this graph is the complete architecture — cited
 * packages are the contracts the system rests on, zero-inbound
 * packages are the compositions built over them, and the two roles
 * carry distinct colors.
 */

export interface GraphNode {
  key: string;
  basename: string;
  items: number;
  inbound: number;
  outbound: number;
  x: number;
  y: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
}

export function buildSpecGraph(files: readonly SpecFileInfo[]): {
  nodes: GraphNode[];
  edges: GraphEdge[];
} {
  // Longest-first so "course-catalog-3" resolves to course-catalog,
  // never to a shorter accidental prefix (basenames are tree-unique
  // identifiers per meta-10).
  const basenames = files
    .map((f) => f.basename)
    .sort((a, b) => b.length - a.length);
  // Case-insensitive: the parser also serves legacy ALLCAPS ids.
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
  const edges: GraphEdge[] = [];
  for (const [key, weight] of weights) {
    const [source, target] = key.split(" ");
    edges.push({ source, target, weight });
    inbound.set(target, (inbound.get(target) ?? 0) + weight);
    outbound.set(source, (outbound.get(source) ?? 0) + weight);
  }

  // Deterministic layout: seeded initial ring + a small force
  // relaxation. Same tree, same picture — a map you cannot memorize
  // is a bad map.
  let seed = 42;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const nodes: GraphNode[] = files.map((f, i) => ({
    key: f.key,
    basename: f.basename,
    items: f.items.length,
    inbound: inbound.get(f.basename) ?? 0,
    outbound: outbound.get(f.basename) ?? 0,
    x: 400 + 260 * Math.cos((2 * Math.PI * i) / files.length) + rand() * 20,
    y: 320 + 230 * Math.sin((2 * Math.PI * i) / files.length) + rand() * 20,
  }));
  const byName = new Map(nodes.map((n) => [n.basename, n]));
  const k = 190;
  for (let step = 0; step < 300; step++) {
    const t = 1 - step / 300;
    const fx = new Map<string, number>();
    const fy = new Map<string, number>();
    for (const a of nodes) {
      // A light pull to the center keeps disconnected packages from
      // drifting into the frame edge.
      let dx = (400 - a.x) * 0.002;
      let dy = (320 - a.y) * 0.002;
      for (const b of nodes) {
        if (a === b) continue;
        const ddx = a.x - b.x;
        const ddy = a.y - b.y;
        const d2 = Math.max(ddx * ddx + ddy * ddy, 25);
        const rep = (k * k) / d2;
        dx += ddx * rep * 0.02;
        dy += ddy * rep * 0.02;
      }
      fx.set(a.basename, dx);
      fy.set(a.basename, dy);
    }
    for (const e of edges) {
      const s = byName.get(e.source);
      const d = byName.get(e.target);
      if (!s || !d) continue;
      const ddx = d.x - s.x;
      const ddy = d.y - s.y;
      const dist = Math.sqrt(Math.max(ddx * ddx + ddy * ddy, 1));
      const att = (dist / k) * 0.9;
      fx.set(s.basename, (fx.get(s.basename) ?? 0) + ddx * att * 0.02);
      fy.set(s.basename, (fy.get(s.basename) ?? 0) + ddy * att * 0.02);
      fx.set(d.basename, (fx.get(d.basename) ?? 0) - ddx * att * 0.02);
      fy.set(d.basename, (fy.get(d.basename) ?? 0) - ddy * att * 0.02);
    }
    for (const n of nodes) {
      n.x += Math.max(-8, Math.min(8, (fx.get(n.basename) ?? 0) * t));
      n.y += Math.max(-8, Math.min(8, (fy.get(n.basename) ?? 0) * t));
      n.x = Math.max(70, Math.min(730, n.x));
      n.y = Math.max(46, Math.min(594, n.y));
    }
  }

  // Fill the frame: rescale the settled layout into the padded
  // canvas so no run wastes margin, whatever shape the forces chose.
  const padX = 80;
  const padTop = 40;
  const padBottom = 64;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    maxX = Math.max(maxX, n.x);
    minY = Math.min(minY, n.y);
    maxY = Math.max(maxY, n.y);
  }
  for (const n of nodes) {
    n.x =
      maxX - minX < 1
        ? 400
        : padX + ((n.x - minX) / (maxX - minX)) * (800 - 2 * padX);
    n.y =
      maxY - minY < 1
        ? 320
        : padTop + ((n.y - minY) / (maxY - minY)) * (640 - padTop - padBottom);
  }

  // Declutter: labels hang under their nodes, so resolve circle and
  // label-box collisions with deterministic nudges — a map with
  // stacked names is unreadable at any size.
  const labelHalf = (n: GraphNode) => n.basename.length * 3.3 + 6;
  for (let pass = 0; pass < 40; pass++) {
    let moved = false;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const dx = b.x - a.x;
        const dyc = b.y - a.y;
        const circles = nodeRadius(a) + nodeRadius(b) + 10;
        const labelYA = a.y + nodeRadius(a) + 13;
        const labelYB = b.y + nodeRadius(b) + 13;
        const circleHit =
          Math.abs(dx) < circles && Math.abs(dyc) < circles;
        const labelHit =
          Math.abs(dx) < labelHalf(a) + labelHalf(b) &&
          Math.abs(labelYA - labelYB) < 14;
        if (!circleHit && !labelHit) continue;
        moved = true;
        // Labels are wide and short: separate them vertically;
        // circle hits part along their wider gap.
        if (labelHit || Math.abs(dyc) >= Math.abs(dx)) {
          const dir = dyc >= 0 ? 1 : -1;
          a.y -= 7 * dir;
          b.y += 7 * dir;
        } else {
          const dir = dx >= 0 ? 1 : -1;
          a.x -= 7 * dir;
          b.x += 7 * dir;
        }
      }
    }
    if (!moved) break;
    for (const n of nodes) {
      n.x = Math.max(padX, Math.min(800 - padX, n.x));
      n.y = Math.max(padTop, Math.min(640 - padBottom, n.y));
    }
  }

  return { nodes, edges };
}

export interface SpecGraphProps {
  files: readonly SpecFileInfo[];
  /** The node last opened from the graph — kept emphasized so the
   * map and the outline share one visible selection. */
  selectedKey?: string | null;
  /** Files currently expanded in the outline — lightly ringed. */
  expandedKeys: ReadonlySet<string>;
  /** Open this file in the parallel outline; the graph stays. */
  onOpenFile: (fileKey: string) => void;
  /** Clicking empty space (not a pan) clears the selection. */
  onClearSelection?: () => void;
}

export function SpecGraph({
  files,
  selectedKey,
  expandedKeys,
  onOpenFile,
  onClearSelection,
}: SpecGraphProps) {
  const { nodes, edges } = useMemo(() => buildSpecGraph(files), [files]);
  const [hover, setHover] = useState<string | null>(null);

  // The viewport is dynamic: drag pans, the wheel zooms toward the
  // pointer, double-click resets — a large tree is explored by moving
  // the camera, never by re-laying-out the map.
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, w: 800, h: 640 });
  const pan = useRef<{ id: number; x: number; y: number } | null>(null);
  // Distinguishes a pan release from a plain background click.
  const panned = useRef(false);

  const onNode = (target: EventTarget): boolean =>
    target instanceof Element &&
    target.closest('[data-testid^="graph-node-"]') !== null;

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      setView((v) => {
        const w = Math.min(1600, Math.max(160, v.w * Math.exp(e.deltaY * 0.0015)));
        const h = w * 0.8;
        // Exact xMidYMid-meet inverse: letterboxed panes center the
        // drawing, so anchor the zoom at the true pointer position.
        const s = Math.min(rect.width / v.w, rect.height / v.h);
        const px =
          v.x + (e.clientX - rect.left - (rect.width - v.w * s) / 2) / s;
        const py =
          v.y + (e.clientY - rect.top - (rect.height - v.h * s) / 2) / s;
        return {
          x: px - ((px - v.x) * w) / v.w,
          y: py - ((py - v.y) * h) / v.h,
          w,
          h,
        };
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  const selectedName = useMemo(
    () => nodes.find((n) => n.key === selectedKey)?.basename ?? null,
    [nodes, selectedKey],
  );
  // Hover trumps selection for focus; either isolates a neighborhood.
  const focus = hover ?? selectedName;
  const neighbors = useMemo(() => {
    if (!focus) return null;
    const set = new Set<string>([focus]);
    for (const e of edges) {
      if (e.source === focus) set.add(e.target);
      if (e.target === focus) set.add(e.source);
    }
    return set;
  }, [focus, edges]);

  const byName = new Map(nodes.map((n) => [n.basename, n]));
  const maxWeight = Math.max(1, ...edges.map((e) => e.weight));

  return (
    <div data-testid="spec-graph" className="flex h-full min-h-0 flex-col">
      <svg
        ref={svgRef}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        preserveAspectRatio="xMidYMid meet"
        className="min-h-0 w-full flex-1 cursor-grab select-none touch-none active:cursor-grabbing"
        role="img"
        aria-label="Spec package citation graph"
        onPointerDown={(e) => {
          if (onNode(e.target)) return;
          pan.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
          panned.current = false;
          (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          const p = pan.current;
          if (!p || p.id !== e.pointerId) return;
          const rect = e.currentTarget.getBoundingClientRect();
          if (!rect.width || !rect.height) return;
          if (Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y) > 3) {
            panned.current = true;
          }
          // Units per pixel under xMidYMid meet: the letterboxed
          // axis must not slow the drag.
          const scale = Math.max(view.w / rect.width, view.h / rect.height);
          setView((v) => ({
            ...v,
            x: v.x - (e.clientX - p.x) * scale,
            y: v.y - (e.clientY - p.y) * scale,
          }));
          pan.current = { id: p.id, x: e.clientX, y: e.clientY };
        }}
        onClick={(e) => {
          if (onNode(e.target) || panned.current) return;
          onClearSelection?.();
        }}
        onPointerUp={() => {
          pan.current = null;
        }}
        onPointerCancel={() => {
          pan.current = null;
        }}
        onDoubleClick={(e) => {
          if (onNode(e.target)) return;
          setView({ x: 0, y: 0, w: 800, h: 640 });
        }}
      >
        <defs>
          <marker
            id="spec-graph-arrow"
            viewBox="0 0 10 10"
            refX="8.5"
            refY="5"
            markerWidth="4.5"
            markerHeight="4.5"
            orient="auto-start-reverse"
          >
            <path
              d="M 0 0 L 10 5 L 0 10 z"
              className="fill-brand-400 dark:fill-brand-500"
            />
          </marker>
        </defs>
        {edges.map((e) => {
          const s = byName.get(e.source);
          const d = byName.get(e.target);
          if (!s || !d) return null;
          const inFocus =
            focus !== null && (e.source === focus || e.target === focus);
          const dim = neighbors !== null && !inFocus;
          const r = nodeRadius(d) + 5;
          const dx = d.x - s.x;
          const dy = d.y - s.y;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          const tx = d.x - (dx / len) * r;
          const ty = d.y - (dy / len) * r;
          // A gentle bow keeps parallel edges apart and reads organic.
          const mx = (s.x + tx) / 2 - (dy / len) * 18;
          const my = (s.y + ty) / 2 + (dx / len) * 18;
          return (
            <path
              key={`${e.source}->${e.target}`}
              data-testid={`graph-edge-${e.source}--${e.target}`}
              d={`M ${s.x} ${s.y} Q ${mx} ${my} ${tx} ${ty}`}
              fill="none"
              strokeWidth={0.6 + (2.2 * e.weight) / maxWeight}
              className={
                inFocus
                  ? "stroke-brand-400 dark:stroke-brand-500"
                  : "stroke-neutral-400 dark:stroke-neutral-600"
              }
              opacity={dim ? 0.08 : inFocus ? 0.85 : 0.25}
              // Direction on demand: arrowheads appear with focus,
              // keeping the resting picture calm.
              markerEnd={inFocus ? "url(#spec-graph-arrow)" : undefined}
            />
          );
        })}
        {nodes.map((n) => {
          const dim = neighbors !== null && !neighbors.has(n.basename);
          const r = nodeRadius(n);
          const contract = n.inbound > 0;
          const selected = n.basename === selectedName;
          return (
            <g
              key={n.key}
              data-testid={`graph-node-${n.basename}`}
              data-role={contract ? "contract" : "composition"}
              className="cursor-pointer"
              opacity={dim ? 0.18 : 1}
              onMouseEnter={() => setHover(n.basename)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onOpenFile(n.key)}
            >
              <title>
                {`${n.basename} — ${n.items} items · ${n.inbound} inbound · ${n.outbound} outbound`}
              </title>
              {selected ? (
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={r + 4.5}
                  className="fill-none stroke-brand-500"
                  strokeWidth={1.5}
                  opacity={0.9}
                />
              ) : null}
              <circle
                cx={n.x}
                cy={n.y}
                r={r}
                className={
                  contract
                    ? "fill-brand-400 stroke-brand-600 dark:fill-brand-500 dark:stroke-brand-300"
                    : "fill-neutral-300 stroke-neutral-400 dark:fill-neutral-600 dark:stroke-neutral-500"
                }
                strokeWidth={expandedKeys.has(n.key) ? 2 : 0.75}
                opacity={contract ? 0.95 : 0.9}
              />
              {/* Paper-colored halo keeps names readable over edges. */}
              <text
                x={n.x}
                y={n.y + r + 14}
                textAnchor="middle"
                paintOrder="stroke"
                strokeLinejoin="round"
                strokeWidth={3}
                className="fill-neutral-500 stroke-neutral-50 text-[11px] dark:fill-neutral-400 dark:stroke-neutral-950"
              >
                {n.basename}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 px-1 pt-1 text-[11px] text-neutral-400 dark:text-neutral-500">
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="h-2.5 w-2.5 rounded-full bg-brand-400 dark:bg-brand-500" />
          contract — cited by peers
        </span>
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="h-2.5 w-2.5 rounded-full bg-neutral-300 dark:bg-neutral-600" />
          composition — cites only
        </span>
        <span className="ml-auto whitespace-nowrap">
          hover to trace · click to open · drag to pan · scroll to zoom
        </span>
      </div>
    </div>
  );
}

function nodeRadius(n: { items: number; inbound: number }): number {
  return 9 + Math.min(13, Math.sqrt(n.inbound) * 2.2 + n.items * 0.3);
}
