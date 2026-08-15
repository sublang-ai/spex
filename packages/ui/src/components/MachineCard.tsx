// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The machine card (run-view-60..64, DR-028): one playbook run drawn
// as a statechart — states as labeled boxes, transitions as directed
// edges, the run's life told through the status palette: emerald for
// the active state, amber for a park awaiting the Boss, red for
// failure, quiet ink for everything else. Read-only; layout solved
// once per machine; direction shows at rest with constant glyphs.

import { useMemo } from "react";
import type { MachineGraph } from "@sublang/spex-core/protocol";
import {
  layoutMachine,
  observedGraph,
  STATE_H,
  STATE_W,
  type MachineFrame,
} from "../lib/machine-frames.js";
import { humanizeId } from "../lib/labels.js";

/** Fired-edge flash decay; a CSS transition absorbs rapid streams and
 * collapses to an instant change under reduced motion (run-view-61). */
const FLASH_MS = 700;

const PAD = 14;

interface MachineCardProps {
  frame: MachineFrame;
  /** The served definition; absent draws the observed truth alone
   * (run-view-64). */
  graph?: MachineGraph | null;
  /** Static history rendering (run-view-62) vs the live card. */
  settled?: boolean;
  /** Recent-flash marker for the live card, from the frame. */
  now?: number;
}

function stateTone(
  frame: MachineFrame,
  id: string,
  kind: "state" | "final",
  settled: boolean,
): { box: string; label: string } {
  const active = !settled && frame.active === id;
  const finalOutcome =
    settled && frame.active === id
      ? frame.outcome ?? "done"
      : undefined;
  if (active || finalOutcome) {
    const parked =
      frame.activeTags.includes("playbook.parked") && id !== "failed";
    if (id === "failed" || finalOutcome === "failed") {
      return {
        box: "fill-red-50 stroke-red-600 dark:fill-red-950 dark:stroke-red-400",
        label: "fill-red-700 dark:fill-red-300",
      };
    }
    if (!settled && parked) {
      return {
        box: "fill-amber-50 stroke-amber-600 dark:fill-amber-950 dark:stroke-amber-400",
        label: "fill-amber-700 dark:fill-amber-300",
      };
    }
    return {
      box: "fill-emerald-50 stroke-emerald-600 dark:fill-emerald-950 dark:stroke-emerald-400",
      label: "fill-emerald-700 dark:fill-emerald-300",
    };
  }
  const visited = frame.visited.includes(id);
  // Both rest states clear the 3:1 non-text floor on the card's own
  // ground (DR-026 §3); the unvisited state is distinguished by a
  // dashed border — "not yet walked" — never by dropping below it.
  return {
    box: visited
      ? "fill-white stroke-neutral-600 dark:fill-neutral-900 dark:stroke-neutral-300"
      : "fill-white stroke-neutral-500 dark:fill-neutral-900 dark:stroke-neutral-500 [stroke-dasharray:3_3]",
    label: visited
      ? "fill-neutral-700 dark:fill-neutral-200"
      : "fill-neutral-500 dark:fill-neutral-400",
  };
}

export function MachineCard({ frame, graph, settled = false, now }: MachineCardProps) {
  const drawn = useMemo(
    () => graph ?? observedGraph(frame),
    [graph, frame.visited.length, frame.transitions.length],
  );
  // Layout is solved once per machine, never on telemetry (DR-028).
  const layout = useMemo(() => layoutMachine(drawn), [drawn]);

  const flash =
    !settled &&
    frame.lastFired !== undefined &&
    (now === undefined || now - frame.lastFired.at < FLASH_MS)
      ? frame.lastFired
      : undefined;

  const width = layout.width + 2 * PAD;
  const height = layout.height + 2 * PAD;

  return (
    <div
      data-testid={`machine-card-${frame.traceSessionId}`}
      data-playbook={frame.playbookId}
      data-settled={settled ? "true" : undefined}
      className={`rounded-lg border ${
        settled
          ? "border-neutral-200 dark:border-neutral-800"
          : "border-neutral-300 dark:border-neutral-700"
      } bg-white dark:bg-neutral-900 ${frame.depth > 1 ? "ml-6" : ""}`}
    >
      <div className="flex items-center gap-2 border-b border-neutral-100 px-3 py-1.5 text-xs dark:border-neutral-800">
        <span className="font-mono font-semibold text-neutral-700 dark:text-neutral-200">
          /{frame.playbookId}
        </span>
        {frame.depth > 1 ? (
          <span className="text-neutral-500 dark:text-neutral-400">
            called by its parent
          </span>
        ) : null}
        {settled ? (
          <span
            className={`ml-auto rounded-full px-2 py-0.5 text-[11px] ${
              frame.outcome === "failed"
                ? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
                : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
            }`}
          >
            {frame.outcome ?? "finished"}
          </span>
        ) : (
          <span className="ml-auto flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500 motion-reduce:animate-none" />
            running
          </span>
        )}
      </div>
      <div className={settled ? "" : "overflow-x-auto"}>
        <svg
          role="img"
          aria-label={`${frame.playbookId} state machine${
            frame.active ? `, ${humanizeId(frame.active)} active` : ""
          }`}
          viewBox={`${-PAD} ${-PAD} ${width} ${height}`}
          {...(settled
            ? { className: "block h-auto w-full" }
            : { width, height, className: "block" })}
        >
          <defs>
            <marker
              id={`machine-arrow-${frame.traceSessionId}`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerUnits="userSpaceOnUse"
              markerWidth="9"
              markerHeight="9"
              orient="auto-start-reverse"
            >
              <path
                d="M 0 0 L 10 5 L 0 10 z"
                className="fill-neutral-500 dark:fill-neutral-400"
              />
            </marker>
          </defs>

          {drawn.edges.map((edge) => {
            const from = layout.nodes.get(edge.from);
            const to = layout.nodes.get(edge.to);
            if (!from || !to) return null;
            const fired =
              flash !== undefined &&
              flash.from === edge.from &&
              flash.to === edge.to &&
              (flash.event === edge.event || edge.event === "");
            const walked = frame.transitions.some(
              (t) =>
                t.from === edge.from &&
                t.to === edge.to &&
                (t.event === edge.event || edge.event === ""),
            );
            const marker = `url(#machine-arrow-${frame.traceSessionId})`;
            if (edge.from === edge.to) {
              // Self-loop arced beside its state (DR-028).
              const path = `M ${from.x + from.width} ${
                from.y + from.height * 0.3
              } C ${from.x + from.width + 26} ${from.y + from.height * 0.1} ${
                from.x + from.width + 26
              } ${from.y + from.height * 0.9} ${from.x + from.width} ${
                from.y + from.height * 0.7
              }`;
              return (
                <path
                  key={edge.id}
                  data-testid={`machine-edge-${edge.id}`}
                  d={path}
                  fill="none"
                  strokeWidth={fired ? 2.5 : 1.5}
                  markerEnd={marker}
                  className={`transition-[stroke,stroke-width] duration-500 motion-reduce:transition-none ${
                    fired
                      ? "stroke-emerald-600 dark:stroke-emerald-400"
                      : walked
                        ? "stroke-neutral-500 dark:stroke-neutral-400"
                        : "stroke-neutral-300 dark:stroke-neutral-600"
                  }`}
                >
                  <title>{edge.event ? humanizeId(edge.event) : "always"}</title>
                </path>
              );
            }
            const backward = to.y < from.y;
            const sx = from.x + from.width / 2;
            const sy = from.y + (backward ? 0 : from.height);
            const ex = to.x + to.width / 2;
            const ey = to.y + (backward ? to.height : 0) + (backward ? 3 : -3);
            // Backward edges swing out the side so they read as
            // returns, never as another downward lane (DR-028).
            const side = from.x + from.width / 2 >= to.x + to.width / 2 ? -1 : 1;
            const path = backward
              ? `M ${from.x + (side > 0 ? from.width : 0)} ${
                  from.y + from.height / 2
                } C ${from.x + (side > 0 ? from.width : 0) + side * 46} ${
                  from.y
                } ${to.x + (side > 0 ? to.width : 0) + side * 46} ${
                  to.y + to.height
                } ${to.x + (side > 0 ? to.width : 0)} ${to.y + to.height / 2}`
              : `M ${sx} ${sy} C ${sx} ${sy + 16} ${ex} ${ey - 16} ${ex} ${ey}`;
            return (
              <path
                key={edge.id}
                data-testid={`machine-edge-${edge.id}`}
                d={path}
                fill="none"
                strokeWidth={fired ? 2.5 : 1.5}
                markerEnd={marker}
                className={`transition-[stroke,stroke-width] duration-500 motion-reduce:transition-none ${
                  fired
                    ? "stroke-emerald-600 dark:stroke-emerald-400"
                    : walked
                      ? "stroke-neutral-500 dark:stroke-neutral-400"
                      : "stroke-neutral-300 dark:stroke-neutral-600"
                }`}
              >
                <title>{edge.event ? humanizeId(edge.event) : "always"}</title>
              </path>
            );
          })}

          {drawn.nodes.map((node) => {
            const place = layout.nodes.get(node.id);
            if (!place) return null;
            const tone = stateTone(frame, node.id, node.kind, settled);
            const active = frame.active === node.id;
            const player =
              frame.activePlayer && frame.activePlayer.stateId === node.id
                ? frame.activePlayer
                : undefined;
            return (
              <g
                key={node.id}
                data-testid={`machine-state-${frame.traceSessionId}-${node.id}`}
                data-active={active ? "true" : undefined}
              >
                <title>
                  {node.description ?? node.id}
                  {node.role ? ` — runs ${node.role}` : ""}
                </title>
                <rect
                  x={place.x}
                  y={place.y}
                  width={place.width}
                  height={place.height}
                  rx={8}
                  strokeWidth={active ? 2 : 1.25}
                  className={`transition-colors duration-300 motion-reduce:transition-none ${tone.box}`}
                />
                {node.kind === "final" ? (
                  <rect
                    x={place.x + 3}
                    y={place.y + 3}
                    width={place.width - 6}
                    height={place.height - 6}
                    rx={6}
                    fill="none"
                    strokeWidth={1}
                    className={tone.box.split(" ").filter((c) => c.startsWith("stroke") || c.startsWith("dark:stroke")).join(" ")}
                  />
                ) : null}
                <text
                  x={place.x + place.width / 2}
                  y={place.y + (node.role || player ? 16 : place.height / 2 + 4)}
                  textAnchor="middle"
                  fontSize={12}
                  fontWeight={active ? 600 : 400}
                  className={tone.label}
                >
                  {humanizeId(node.id)}
                </text>
                {node.role || player ? (
                  <text
                    x={place.x + place.width / 2}
                    y={place.y + place.height - 9}
                    textAnchor="middle"
                    fontSize={10.5}
                    className={
                      player?.running
                        ? "fill-emerald-600 dark:fill-emerald-400"
                        : "fill-neutral-500 dark:fill-neutral-400"
                    }
                  >
                    {player
                      ? `${player.playerId}${player.running ? " ●" : ""}`
                      : humanizeId(node.role ?? "")}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
