// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The machine card (run-view-60..64, 74..78, DR-031): one playbook
// run drawn as a statechart — states as labeled boxes, transitions as
// routed edges that land on borders, the run's life told through the
// status palette. A call is containment: the child card nests under
// its caller, joined by a connector leaving the calling state itself.
// Cards breathe between the full drawing and a one-line strip; the
// reader's disclosure is arrangement only and touches no fold state.

import { useMemo, useState } from "react";
import type { MachineGraph } from "@sublang/spex-core/protocol";
import {
  edgeCrossesBox,
  layoutMachine,
  observedGraph,
  routeEdges,
  type MachineFrame,
} from "../lib/machine-frames.js";
import { humanizeId } from "../lib/labels.js";
import { RunningMark } from "./RunningMark.js";
import { Icon } from "./Icon.js";

/** Fired-edge flash decay; a CSS transition absorbs rapid streams and
 * collapses to an instant change under reduced motion (run-view-61). */
const FLASH_MS = 700;

const PAD = 16;

export interface MachineCardProps {
  frame: MachineFrame;
  /** The served definition; absent draws the observed truth alone
   * (run-view-64). */
  graph?: MachineGraph | null;
  /** Every served definition, so nested cards find their own. */
  graphs?: Record<string, MachineGraph | null>;
  /** Static history rendering (run-view-62) vs the live card. */
  settled?: boolean;
  /** Recent-flash marker for the live card, from the frame. */
  now?: number;
  /** Frames whose caller is this one, still running (run-view-63). */
  openChildren?: MachineFrame[];
  /** Every open frame, so a nested card can find its own children. */
  openFrames?: readonly MachineFrame[];
}

function outcomeWord(frame: MachineFrame): string {
  return frame.outcome ?? "done";
}

function stateTone(
  frame: MachineFrame,
  id: string,
  settled: boolean,
): { box: string; label: string } {
  const active = !settled && frame.active === id;
  const finalOutcome =
    settled && frame.active === id ? frame.outcome ?? "done" : undefined;
  const delegating = !settled && frame.delegating?.stateId === id;
  if (delegating) {
    // The call voice: this state is running another machine.
    return {
      box: "fill-brand-50 stroke-brand-500 dark:fill-brand-950 dark:stroke-brand-400",
      label: "fill-brand-700 dark:fill-brand-300",
    };
  }
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

/** The strip's own sentence — also its accessible name, so the
 * relation never depends on the connector alone (run-view-75). */
export function stripLabel(frame: MachineFrame, running: boolean): string {
  const where = running
    ? frame.delegating
      ? `at ${humanizeId(frame.delegating.stateId)} — calling /${frame.delegating.playbookId}`
      : frame.active
        ? `at ${humanizeId(frame.active)}`
        : "starting"
    : outcomeWord(frame);
  const from = frame.callerStateId
    ? `, called from ${humanizeId(frame.callerStateId)}`
    : "";
  return `/${frame.playbookId} — ${where}${from}`;
}

export function MachineCard({
  frame,
  graph,
  graphs,
  settled = false,
  now,
  openChildren = [],
  openFrames = [],
}: MachineCardProps) {
  const running = !settled;
  // Disclosure is the reader's arrangement axis (DR-027): component
  // state only, never folded, so a replay renders the same either way.
  const [override, setOverride] = useState<boolean>();
  // The default partitions the whole tree (run-view-75): a running
  // leaf is the work, so it is what is drawn; running ancestors and
  // settled runs are strips.
  const expanded = override ?? (running && openChildren.length === 0);

  const drawn = useMemo(
    () => graph ?? observedGraph(frame),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [graph, frame.visited.length, frame.transitions.length],
  );
  // Layout is solved once per machine, never on telemetry (DR-028).
  const layout = useMemo(() => layoutMachine(drawn), [drawn]);
  const routed = useMemo(() => routeEdges(drawn, layout), [drawn, layout]);
  const lines = routed.filter((edge) => edge.kind === "line");
  const exits = routed.filter((edge) => edge.kind === "exit");

  const flash =
    running &&
    frame.lastFired !== undefined &&
    (now === undefined || now - frame.lastFired.at < FLASH_MS)
      ? frame.lastFired
      : undefined;

  // Both live and settled drawings scroll rather than scale: shrinking
  // a settled machine to the pane's width makes its state names
  // unreadable, and the names are the point.
  const width = layout.width + 2 * PAD + 40;
  const height = layout.height + 2 * PAD;
  const label = stripLabel(frame, running);

  const nested = (
    <>
      {/* Settled calls sit under the state that made them, in
          invocation order (run-view-62). */}
      {frame.settledCalls.map((child) => (
        <MachineCard
          key={child.traceSessionId}
          frame={child}
          graph={graphs?.[child.playbookId]}
          graphs={graphs}
          openFrames={openFrames}
          settled
        />
      ))}
      {openChildren.map((child) => (
        <MachineCard
          key={child.traceSessionId}
          frame={child}
          graph={graphs?.[child.playbookId]}
          graphs={graphs}
          now={now}
          openFrames={openFrames}
          openChildren={openFrames.filter(
            (f) => f.parentSessionId === child.traceSessionId,
          )}
        />
      ))}
    </>
  );

  const header = (
    <div className="flex items-center gap-2 px-2.5 py-1.5 text-xs">
      <button
        type="button"
        data-testid={`machine-disclose-${frame.traceSessionId}`}
        aria-expanded={expanded}
        aria-label={`${expanded ? "Collapse" : "Expand"} ${label}`}
        onClick={() => setOverride(!expanded)}
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
      >
        <Icon
          name={expanded ? "caretDown" : "caretRight"}
          className="h-3 w-3"
        />
      </button>
      {running ? (
        <RunningMark running data-testid={`machine-running-${frame.traceSessionId}`} />
      ) : (
        <span
          aria-hidden
          className={`h-2 w-2 shrink-0 rounded-full border-2 ${
            frame.outcome === "failed"
              ? "border-red-500"
              : "border-neutral-500"
          }`}
        />
      )}
      <span className="font-mono font-semibold text-neutral-700 dark:text-neutral-200">
        /{frame.playbookId}
      </span>
      <span className="min-w-0 flex-1 truncate text-neutral-500 dark:text-neutral-400">
        {running
          ? frame.delegating
            ? `at ${humanizeId(frame.delegating.stateId)} → calling /${frame.delegating.playbookId}`
            : frame.active
              ? `at ${humanizeId(frame.active)}`
              : "starting"
          : frame.callerStateId
            ? `from ${humanizeId(frame.callerStateId)}`
            : ""}
      </span>
      <span
        data-testid={`machine-outcome-${frame.traceSessionId}`}
        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${
          running
            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
            : frame.outcome === "failed"
              ? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
              : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
        }`}
      >
        {running ? "running" : outcomeWord(frame)}
      </span>
    </div>
  );

  return (
    <div
      data-testid={`machine-card-${frame.traceSessionId}`}
      data-playbook={frame.playbookId}
      data-settled={settled ? "true" : undefined}
      data-expanded={expanded ? "true" : "false"}
      data-caller-state={frame.callerStateId}
      aria-label={label}
      className={`rounded-lg border ${
        settled
          ? "border-neutral-200 dark:border-neutral-800"
          : "border-neutral-300 dark:border-neutral-700"
      } bg-white dark:bg-neutral-900`}
    >
      {header}
      {expanded ? (
        <div className="overflow-x-auto">
          <svg
            role="img"
            aria-label={`${frame.playbookId} state machine${
              frame.active ? `, ${humanizeId(frame.active)} active` : ""
            }`}
            viewBox={`${-PAD} ${-PAD} ${width} ${height}`}
            width={width}
            height={height}
            className="block"
          >
            <defs>
              <marker
                id={`machine-arrow-${frame.traceSessionId}`}
                viewBox="0 0 10 10"
                refX="9.5"
                refY="5"
                markerUnits="userSpaceOnUse"
                markerWidth="8"
                markerHeight="8"
                orient="auto-start-reverse"
              >
                <path
                  d="M 0 0 L 10 5 L 0 10 z"
                  className="fill-neutral-500 dark:fill-neutral-400"
                />
              </marker>
            </defs>

            {lines.map((edge) => {
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
              return (
                <path
                  key={edge.id}
                  data-testid={`machine-edge-${edge.id}`}
                  data-head={`${edge.head!.x},${edge.head!.y}`}
                  d={edge.path}
                  fill="none"
                  strokeWidth={fired ? 2.5 : 1.5}
                  markerEnd={`url(#machine-arrow-${frame.traceSessionId})`}
                  className={`transition-[stroke,stroke-width] duration-500 motion-reduce:transition-none ${
                    fired
                      ? "stroke-emerald-600 dark:stroke-emerald-400"
                      : walked
                        ? "stroke-neutral-500 dark:stroke-neutral-400"
                        : "stroke-neutral-300 dark:stroke-neutral-600"
                  }`}
                >
                  <title>
                    {edge.event ? humanizeId(edge.event) : "always"}
                  </title>
                </path>
              );
            })}

            {/* Distance speaks in words (run-view-76): a transition
                that is no layout neighbour is an exit label inside its
                source, walked, fired and dashed like any edge. */}
            {exits.map((edge) => {
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
              return (
                <text
                  key={edge.id}
                  data-testid={`machine-exit-${edge.id}`}
                  x={edge.anchor!.x}
                  y={edge.anchor!.y}
                  fontSize={10}
                  fontWeight={fired ? 600 : 400}
                  className={`transition-[fill] duration-500 motion-reduce:transition-none ${
                    fired
                      ? "fill-emerald-600 dark:fill-emerald-400"
                      : walked
                        ? "fill-neutral-600 dark:fill-neutral-300"
                        : "fill-neutral-400 dark:fill-neutral-500"
                  }`}
                >
                  {`\u2192 ${humanizeId(edge.to)}`}
                  <title>
                    {edge.event ? humanizeId(edge.event) : "always"}
                  </title>
                </text>
              );
            })}

            {drawn.nodes.map((node) => {
              const place = layout.nodes.get(node.id);
              if (!place) return null;
              const tone = stateTone(frame, node.id, settled);
              const active = frame.active === node.id;
              const delegating =
                running && frame.delegating?.stateId === node.id;
              // From the call onward the calling state names its callee
              // (run-view-63) — in the live drawing and the settled one.
              const call = [...frame.calls]
                .reverse()
                .find((entry) => entry.stateId === node.id);
              const player =
                frame.activePlayer && frame.activePlayer.stateId === node.id
                  ? frame.activePlayer
                  : undefined;
              // A running call names the role the machine asked for and
              // the player answering it; a lane several roles share
              // makes the pair the only unambiguous label (DR-032).
              const caption = call
                ? `call /${call.playbookId}`
                : player
                  ? player.playerId && player.playerId !== player.role
                    ? `${player.role} · ${player.playerId}`
                    : player.role
                  : node.role
                    ? humanizeId(node.role)
                    : undefined;
              return (
                <g
                  key={node.id}
                  data-testid={`machine-state-${frame.traceSessionId}-${node.id}`}
                  data-active={active ? "true" : undefined}
                  data-delegating={delegating ? "true" : undefined}
                >
                  <title>
                    {node.description ?? node.id}
                    {node.role ? ` — runs ${node.role}` : ""}
                    {call ? ` — called /${call.playbookId}` : ""}
                  </title>
                  <rect
                    x={place.x}
                    y={place.y}
                    width={place.width}
                    height={place.height}
                    rx={8}
                    strokeWidth={active || delegating ? 2 : 1.25}
                    // Stroke and width only: a transition over `fill`
                    // sticks at its interpolated value when the OS
                    // theme flips, leaving light boxes dark.
                    className={`transition-[stroke,stroke-width] duration-300 motion-reduce:transition-none ${tone.box}`}
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
                      className={tone.box
                        .split(" ")
                        .filter(
                          (c) =>
                            c.startsWith("stroke") ||
                            c.startsWith("dark:stroke"),
                        )
                        .join(" ")}
                    />
                  ) : null}
                  <text
                    x={place.x + place.width / 2}
                    y={place.y + (caption ? 18 : 26)}
                    textAnchor="middle"
                    fontSize={12}
                    fontWeight={active || delegating ? 600 : 400}
                    className={tone.label}
                  >
                    {humanizeId(node.id)}
                  </text>
                  {caption ? (
                    <text
                      x={place.x + place.width / 2}
                      y={place.y + 33}
                      textAnchor="middle"
                      fontSize={10.5}
                      className={
                        call
                          ? "fill-brand-600 dark:fill-brand-300"
                          : player?.running
                            ? "fill-emerald-600 dark:fill-emerald-400"
                            : "fill-neutral-500 dark:fill-neutral-400"
                      }
                    >
                      {caption}
                    </text>
                  ) : null}
                  {player?.running ? (
                    <circle
                      cx={place.x + 13}
                      cy={place.y + 29.5}
                      r={3}
                      className="fill-emerald-500 motion-safe:animate-pulse"
                    />
                  ) : null}
                </g>
              );
            })}
          </svg>
        </div>
      ) : null}
      {frame.settledCalls.length > 0 || openChildren.length > 0 ? (
        <div className="flex">
          {/* The connector leaves the calling state, not the card. */}
          <div
            aria-hidden
            data-testid={`machine-connector-${frame.traceSessionId}`}
            className="ml-4 w-5 shrink-0 border-l-2 border-brand-400 dark:border-brand-500"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-2 py-2 pr-2">
            {nested}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Test seam for run-view-77: the routed geometry of a drawn machine. */
export function drawnGeometry(graph: MachineGraph) {
  const layout = layoutMachine(graph);
  const edges = routeEdges(graph, layout);
  return {
    layout,
    edges,
    crossings: edges.filter((edge) => edgeCrossesBox(edge, layout)),
  };
}
