// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The machine card (run-view-60..64, 74..78, DR-031): one playbook
// run drawn as a statechart — states as labeled boxes, transitions as
// routed edges that land on borders, the run's life told through the
// status palette. A call is containment: the child card nests under
// its caller, joined by a connector leaving the calling state itself.
// Cards breathe between the full drawing and a one-line strip; the
// reader's disclosure is arrangement only and touches no fold state.

import { useCallback, useMemo, useRef, useState } from "react";
import type { MachineGraph } from "@sublang/spex-core/protocol";
import {
  EXIT_LINE_H,
  STATE_BASE_H,
  edgeCrossesBox,
  layoutMachine,
  observedGraph,
  routeEdges,
  type MachineFrame,
  type RoutedEdge,
} from "../lib/machine-frames.js";
import {
  CAPTION_PX,
  EXIT_PX,
  NAME_PX,
  drawingWidthRule,
  fitCaption,
  fitName,
  isRestState,
  scaleFloor,
  stateCaption,
  stateName,
  statePath,
  widenLayout,
} from "../lib/machine-labels.js";
import { humanizeId } from "../lib/labels.js";
import { i18n } from "../i18n.js";
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
  /** The one root of the live tree: it stays drawn while it delegates
   * (run-view-75), so the only drawing never folds the moment it
   * calls. */
  onlyRoot?: boolean;
}

/** How a settled run ended, in words: the runtime's closed outcome set,
 * each read where it is shown (localization-4). */
const OUTCOME_WORDS: Record<
  NonNullable<MachineFrame["outcome"]>,
  () => string
> = {
  done: () =>
    i18n._({ id: "done", comment: "how a run ended: it finished its work" }),
  failed: () =>
    i18n._({ id: "failed", comment: "how a run ended: it failed" }),
  stopped: () =>
    i18n._({ id: "stopped", comment: "how a run ended: it was stopped" }),
};

function outcomeWord(frame: MachineFrame): string {
  return OUTCOME_WORDS[frame.outcome ?? "done"]();
}

/** An edge with no event of its own: it is walked as soon as its state
 * is entered. */
const alwaysWord = (): string =>
  i18n._({
    id: "always",
    comment: "a transition with no event: it is taken unconditionally",
  });

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
      ? i18n._("at {state} — calling /{playbookId}", {
          state: statePath(frame.delegating.stateId),
          playbookId: frame.delegating.playbookId,
        })
      : frame.active
        ? i18n._({
            id: "at {state}",
            values: { state: statePath(frame.active) },
            comment: "where a running machine stands",
          })
        : i18n._({ id: "starting", comment: "a run that has entered no state yet" })
    : outcomeWord(frame);
  const from = frame.callerStateId
    ? i18n._({
        id: ", called from {state}",
        values: { state: statePath(frame.callerStateId) },
        comment: "tail of a run's one-line strip: the state that called it",
      })
    : "";
  return i18n._({
    id: "/{playbookId} — {where}{from}",
    values: { playbookId: frame.playbookId, where, from },
    comment: "a run's one-line strip: the workflow, where it stands, who called it",
  });
}

/** Whether an edge's transition has been walked by the run. */
/** The trailing fade says more drawing lies beyond the edge, and only
 * the last inch of scroll retires it (run-view-81). The end is a fact
 * about the box as much as about the scroll position, so a pane that
 * narrows brings the fade back. */
function markEdge(box: HTMLElement): void {
  const atEnd = box.scrollLeft + box.clientWidth >= box.scrollWidth - 1;
  box.style.maskImage = atEnd ? "none" : "";
}

function walkedBy(frame: MachineFrame, edge: RoutedEdge): boolean {
  return frame.transitions.some(
    (t) =>
      t.from === edge.from &&
      t.to === edge.to &&
      (t.event === edge.event || edge.event === ""),
  );
}

export function MachineCard({
  frame,
  graph,
  graphs,
  settled = false,
  now,
  openChildren = [],
  openFrames = [],
  onlyRoot = false,
}: MachineCardProps) {
  const running = !settled;
  // Disclosure is the reader's arrangement axis (DR-027): component
  // state only, never folded, so a replay renders the same either way.
  const [override, setOverride] = useState<boolean>();
  // The default partitions the whole tree (run-view-75): a running
  // leaf is the work, so it is what is drawn, and the only root stays
  // drawn while it delegates; other running ancestors and settled
  // runs are strips.
  const expanded =
    override ?? (running && (openChildren.length === 0 || onlyRoot));
  // A hovered box shows every exit it folded (run-view-76).
  const [hovered, setHovered] = useState<string>();

  // The drawing's scroll box, watched for its own size: the pane it
  // sits in narrows with no scroll of its own, and the fade must
  // return with the content it hides (run-view-81).
  const maskObserver = useRef<ResizeObserver>(undefined);
  const scrollBox = useCallback((box: HTMLDivElement | null) => {
    maskObserver.current?.disconnect();
    maskObserver.current = undefined;
    if (!box || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => markEdge(box));
    observer.observe(box);
    maskObserver.current = observer;
  }, []);

  if ("historicalGraph" in frame) graph = frame.historicalGraph;
  const drawn = useMemo(
    () => graph ?? observedGraph(frame),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [graph, frame.visited.length, frame.transitions.length],
  );
  // Layout is solved once per machine, never on telemetry (DR-028);
  // the boxes then take the width their column's longest label needs
  // (run-view-60), which a new caption may widen once.
  const layout = useMemo(() => layoutMachine(drawn), [drawn]);
  const captionKey = drawn.nodes
    .map((node) => stateCaption(node, frame)?.text ?? "")
    .join("\0");
  const widened = useMemo(
    () => widenLayout(layout, drawn, frame),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layout, drawn, captionKey],
  );
  const routed = useMemo(
    () => routeEdges(drawn, widened),
    [drawn, widened],
  );
  const lines = routed.filter((edge) => edge.kind === "line");
  const exitsOf = new Map<string, RoutedEdge[]>();
  for (const edge of routed) {
    if (edge.kind !== "exit") continue;
    const list = exitsOf.get(edge.from) ?? [];
    list.push(edge);
    exitsOf.set(edge.from, list);
  }
  const nodeById = new Map(drawn.nodes.map((node) => [node.id, node]));

  const flash =
    running &&
    frame.lastFired !== undefined &&
    (now === undefined || now - frame.lastFired.at < FLASH_MS)
      ? frame.lastFired
      : undefined;

  // The drawing's natural size; the pane decides whether it scales or
  // scrolls (run-view-81).
  const width = widened.width + 2 * PAD + 40;
  const height = widened.height + 2 * PAD;
  const rule = drawingWidthRule(width);
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
    <div className="flex items-center gap-1 px-1.5 py-1.5 text-xs @sm:gap-2 @sm:px-2.5">
      <button
        type="button"
        data-testid={`machine-disclose-${frame.traceSessionId}`}
        aria-expanded={expanded}
        aria-label={
          expanded
            ? i18n._("Collapse {run}", { run: label })
            : i18n._("Expand {run}", { run: label })
        }
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
            ? i18n._("at {state} → calling /{playbookId}", {
                state: statePath(frame.delegating.stateId),
                playbookId: frame.delegating.playbookId,
              })
            : frame.active
              ? i18n._({
                  id: "at {state}",
                  values: { state: statePath(frame.active) },
                  comment: "where a running machine stands",
                })
              : i18n._({
                  id: "starting",
                  comment: "a run that has entered no state yet",
                })
          : frame.callerStateId
            ? i18n._({
                id: "from {state}",
                values: { state: statePath(frame.callerStateId) },
                comment: "on a settled run's card: the state that called it",
              })
            : ""}
      </span>
      <span
        data-testid={`machine-outcome-${frame.traceSessionId}`}
        className={`shrink-0 rounded-full px-1 py-0.5 text-xs @sm:px-2 ${
          running
            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
            : frame.outcome === "failed"
              ? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
              : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
        }`}
      >
        {running
          ? i18n._({
              id: "running",
              comment: "the aliveness mark's own word: this thing is at work",
            })
          : outcomeWord(frame)}
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
      // The card is the drawing's container: the pane's width reaches
      // the drawing as a container query, never as a width hook
      // (DR-041).
      className={`@container rounded-lg border ${
        settled
          ? "border-neutral-200 dark:border-neutral-800"
          : "border-neutral-300 dark:border-neutral-700"
      } bg-white dark:bg-neutral-900`}
    >
      {header}
      {expanded ? (
        // A drawing a little wider than the pane scales down to it; one
        // much wider keeps its size and scrolls, and the mask says so —
        // a hard cut reads as broken, a fade reads as "more this way"
        // (run-view-81).
        <div
          ref={scrollBox}
          data-testid={`machine-scroll-${frame.traceSessionId}`}
          // A box that scrolls must be reachable without a pointer
          // (run-view-50): the drawing holds nothing focusable of its
          // own, so the box itself takes the stop and says what it
          // holds.
          tabIndex={0}
          role="group"
          aria-label={i18n._("{playbookId} machine drawing", {
            playbookId: frame.playbookId,
          })}
          style={
            {
              "--fit": rule.fit,
              "--beyond": rule.beyond,
            } as React.CSSProperties
          }
          className="overflow-x-auto [mask-image:linear-gradient(to_right,#000_calc(100%_-_24px_+_var(--beyond,0px)),transparent)] [mask-repeat:no-repeat] [mask-size:100%_100%]"
          onScroll={(event) => markEdge(event.currentTarget)}
        >
          <svg
            role="img"
            aria-label={
              frame.active
                ? i18n._("{playbookId} state machine, {state} active", {
                    playbookId: frame.playbookId,
                    state: statePath(frame.active),
                  })
                : i18n._("{playbookId} state machine", {
                    playbookId: frame.playbookId,
                  })
            }
            viewBox={`${-PAD} ${-PAD} ${width} ${height}`}
            data-natural-width={width}
            data-scale-floor={scaleFloor(width)}
            style={{ width: rule.width, height: "auto" }}
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
              const walked = walkedBy(frame, edge);
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
                    {edge.event ? humanizeId(edge.event) : alwaysWord()}
                  </title>
                </path>
              );
            })}

            {drawn.nodes.map((node) => {
              const place = widened.nodes.get(node.id);
              if (!place) return null;
              const tone = stateTone(frame, node.id, settled);
              const active = frame.active === node.id;
              const delegating =
                running && frame.delegating?.stateId === node.id;
              const call = [...frame.calls]
                .reverse()
                .find((entry) => entry.stateId === node.id);
              const player =
                frame.activePlayer && frame.activePlayer.stateId === node.id
                  ? frame.activePlayer
                  : undefined;
              // From the call onward the calling state names its callee
              // (run-view-63); a running call names the role the machine
              // asked for and the player answering it (DR-032). The
              // caption falls back before it spills (run-view-61).
              const caption = stateCaption(node, frame);
              const captionText = caption
                ? fitCaption(caption, place.width)
                : undefined;
              const name = stateName(node.id);
              const nameText = fitName(name, place.width);
              const path = statePath(node.id);

              // Distance speaks in words (run-view-76): a transition
              // that is no layout neighbour is an exit label inside its
              // source, walked, fired and dashed like any edge. Unwalked
              // exits into rest states fold into one marker until
              // walked or hovered. The labels paint after the box
              // because it carries an opaque fill — drawn under one,
              // the words are silent.
              const exits = exitsOf.get(node.id) ?? [];
              const revealed = hovered === node.id;
              const shown = exits.filter(
                (edge) =>
                  revealed ||
                  walkedBy(frame, edge) ||
                  !isRestState(nodeById.get(edge.to)),
              );
              const folded = exits.filter((edge) => !shown.includes(edge));
              const slotY = (slot: number): number =>
                place.y + STATE_BASE_H + 2 + slot * EXIT_LINE_H;
              return (
                <g
                  key={node.id}
                  data-testid={`machine-state-${frame.traceSessionId}-${node.id}`}
                  data-active={active ? "true" : undefined}
                  data-delegating={delegating ? "true" : undefined}
                  onMouseEnter={() => setHovered(node.id)}
                  onMouseLeave={() =>
                    setHovered((current) =>
                      current === node.id ? undefined : current,
                    )
                  }
                >
                  <title>
                    {nameText !== name || path !== name ? `${path} — ` : ""}
                    {caption && captionText !== caption.text
                      ? `${node.description ?? node.id} — ${caption.text}`
                      : (node.description ?? node.id)}
                    {node.role
                      ? i18n._({
                          id: " — runs {role}",
                          values: { role: node.role },
                          comment:
                            "tooltip tail, after the state's description: the role it runs",
                        })
                      : ""}
                    {call
                      ? i18n._({
                          id: " — called /{playbookId}",
                          values: { playbookId: call.playbookId },
                          comment:
                            "tooltip tail, after the state's description: the workflow it called",
                        })
                      : ""}
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
                    y={place.y + (captionText ? 18 : 26)}
                    textAnchor="middle"
                    fontSize={NAME_PX}
                    fontWeight={active || delegating ? 600 : 400}
                    className={tone.label}
                  >
                    {nameText}
                  </text>
                  {captionText ? (
                    <text
                      data-testid={`machine-caption-${frame.traceSessionId}-${node.id}`}
                      x={place.x + place.width / 2}
                      y={place.y + 33}
                      textAnchor="middle"
                      fontSize={CAPTION_PX}
                      className={
                        call
                          ? "fill-brand-600 dark:fill-brand-300"
                          : player?.running
                            ? "fill-emerald-600 dark:fill-emerald-400"
                            : "fill-neutral-500 dark:fill-neutral-400"
                      }
                    >
                      {captionText}
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
                  {shown.map((edge, slot) => {
                    const fired =
                      flash !== undefined &&
                      flash.from === edge.from &&
                      flash.to === edge.to &&
                      (flash.event === edge.event || edge.event === "");
                    const walked = walkedBy(frame, edge);
                    return (
                      <text
                        key={edge.id}
                        data-testid={`machine-exit-${edge.id}`}
                        x={place.x + 10}
                        y={slotY(slot)}
                        fontSize={EXIT_PX}
                        fontWeight={fired ? 600 : 400}
                        className={`transition-[fill] duration-500 motion-reduce:transition-none ${
                          fired
                            ? "fill-emerald-600 dark:fill-emerald-400"
                            : walked
                              ? "fill-neutral-600 dark:fill-neutral-300"
                              : "fill-neutral-400 dark:fill-neutral-500"
                        }`}
                      >
                        {`→ ${stateName(edge.to)}`}
                        <title>
                          {edge.event ? humanizeId(edge.event) : alwaysWord()}
                        </title>
                      </text>
                    );
                  })}
                  {folded.length > 0 ? (
                    <text
                      data-testid={`machine-exits-folded-${frame.traceSessionId}-${node.id}`}
                      x={place.x + 10}
                      y={slotY(shown.length)}
                      fontSize={EXIT_PX}
                      className="fill-neutral-400 dark:fill-neutral-500"
                    >
                      {`+${folded.length}`}
                      <title>
                        {folded
                          .map(
                            (edge) =>
                              `→ ${statePath(edge.to)} (${
                                edge.event ? humanizeId(edge.event) : alwaysWord()
                              })`,
                          )
                          .join("\n")}
                      </title>
                    </text>
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
