// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Captain thread (RUN-1, RUN-30): an IM-style conversation — the
// user's messages as their own bubbles, Captain speech as
// counterpart bubbles, player questions as first-class incoming
// messages, shell status lines as compact system lines between them.

import { useEffect, useState, type ReactNode } from "react";

import type { CaptainLine, SessionView } from "../state/reducer.js";
import { stateLabel } from "../lib/labels.js";
import { useStickToBottom, jumpPillClasses } from "../lib/useStickToBottom.js";
import { Markdown } from "./Markdown.js";
import { MachineCard } from "./MachineCard.js";
import { SourceChip } from "./DeliveryCard.js";
import type { IntentSource, MachineGraph } from "@sublang/spex-core/protocol";

/** A node the thread hosts after a given line — the run view anchors
 * an intent's delivery card at its final turn's end (run-view-87). */
export interface ThreadExtra {
  key: string;
  afterIndex: number;
  /** Focus/highlight identity for attention activation (run-view-91). */
  focusKey?: string;
  node: ReactNode;
}

function Line({
  line,
  graphs,
  source,
}: {
  line: CaptainLine;
  graphs?: Record<string, MachineGraph | null>;
  /** The dispatched intent's provenance, worn by the bound turn's
   * Boss bubble (run-view-89). */
  source?: IntentSource;
}) {
  const time = new Date(line.at).toLocaleString();
  switch (line.kind) {
    case "machine":
      // A finished run's drawn record settles into the thread
      // (run-view-62); without its frame it degrades to a plain line
      // per run-view-17.
      return line.frame ? (
        <div title={time}>
          <MachineCard
            frame={line.frame}
            graph={graphs?.[line.frame.playbookId]}
            graphs={graphs}
            settled
          />
        </div>
      ) : (
        <div className="text-center font-mono text-xs text-neutral-500 dark:text-neutral-400">
          {line.text}
        </div>
      );
    case "boss":
      return (
        <div className="flex justify-end" title={time}>
          <div
            data-testid="boss-bubble"
            className="max-w-[85%] rounded-2xl rounded-br-md bg-brand-600 px-3 py-1.5 text-sm text-white"
          >
            {source ? (
              <div className="mb-0.5 flex justify-end">
                <SourceChip source={source} onDark />
              </div>
            ) : null}
            <span className="whitespace-pre-wrap">{line.text}</span>
          </div>
        </div>
      );
    case "speech":
      return (
        <div className="flex justify-start" title={time}>
          <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-neutral-100 px-3 py-1.5 dark:bg-neutral-800">
            <Markdown text={line.text} links="web-only" />
          </div>
        </div>
      );
    case "question":
      // A player asking the Boss — the moment the product is built
      // around — renders as an incoming message from a named sender.
      return (
        <div className="flex justify-start" title={time}>
          <div
            data-testid="question-bubble"
            className="max-w-[85%] rounded-2xl rounded-bl-md border-l-4 border-amber-400 bg-neutral-100 px-3 py-1.5 dark:border-amber-500 dark:bg-neutral-800"
          >
            {line.player ? (
              <div className="font-mono text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                {line.player}
              </div>
            ) : null}
            <div className="text-sm">
              <Markdown text={line.text} links="web-only" />
            </div>
          </div>
        </div>
      );
    case "error":
      return (
        <div
          title={time}
          className="mx-auto max-w-[90%] rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          {line.text}
        </div>
      );
    default:
      return (
        <div
          title={time}
          className="whitespace-pre-wrap text-center font-mono text-[11px] text-neutral-500 dark:text-neutral-500"
        >
          {line.text}
        </div>
      );
  }
}

const TEN_MINUTES = 10 * 60 * 1000;

/** Visible time separator before the first line, after >10 minute
 * gaps, and on day boundaries — so a reopened transcript reads in
 * time without hovering line by line (DR-010 §2). */
export function timeSeparator(
  previousAt: number | undefined,
  at: number,
): string | undefined {
  if (!Number.isFinite(at)) return undefined;
  const current = new Date(at);
  if (previousAt === undefined) {
    return formatSeparator(current, true);
  }
  const previous = new Date(previousAt);
  const dayChanged = current.toDateString() !== previous.toDateString();
  if (dayChanged) return formatSeparator(current, true);
  if (at - previousAt > TEN_MINUTES) return formatSeparator(current, false);
  return undefined;
}

function formatSeparator(date: Date, withDay: boolean): string {
  const time = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (!withDay) return time;
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return time;
  return `${date.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
}

const STATE_TONE_CLASSES: Record<string, string> = {
  amber:
    "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  red: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  emerald:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  neutral:
    "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400",
};

export function CaptainPane({
  view,
  machineGraphs,
  bossSources,
  extras,
  focusKey,
  onFocusHandled,
}: {
  view: SessionView;
  /** Served machine definitions by playbook id (run-view-64: absent
   * definitions degrade to the observed drawing). */
  machineGraphs?: Record<string, MachineGraph | null>;
  /** Intent provenance by dispatched turn id (run-view-89). */
  bossSources?: Map<number, IntentSource>;
  /** Nodes anchored after specific lines (run-view-87). */
  extras?: ThreadExtra[];
  /** Scroll to and briefly highlight this line ("line-<index>") or
   * extra (its focusKey) — attention activation lands at the intent's
   * place (run-view-91). */
  focusKey?: string;
  onFocusHandled?: () => void;
}) {
  const { scrollRef, onScroll, newBelow, jump } = useStickToBottom(
    view.captain.length +
      view.captainDraft.length +
      (view.turnActive ? 1 : 0) +
      (extras?.length ?? 0),
  );
  const [highlightKey, setHighlightKey] = useState<string>();

  // Attention focus (run-view-91): land at the intent's place and
  // light it briefly, so the reader sees why they were summoned. The
  // target may fold in a render later than the request (a delivery
  // card mounts after the ledger settles), so an unfound key waits for
  // more content instead of being consumed.
  useEffect(() => {
    if (!focusKey) return;
    const target = scrollRef.current?.querySelector<HTMLElement>(
      `[data-focus-key="${focusKey}"]`,
    );
    if (!target) return;
    target.scrollIntoView?.({ block: "center" });
    setHighlightKey(focusKey);
    onFocusHandled?.();
    // The scroll ref and callback are stable for a mounted pane.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, view.captain.length, extras]);

  useEffect(() => {
    if (!highlightKey) return;
    const timer = setTimeout(() => setHighlightKey(undefined), 2400);
    return () => clearTimeout(timer);
  }, [highlightKey]);

  /** Focusable wrapper: identity plus the brief reveal highlight. */
  function focusProps(key: string | undefined): {
    "data-focus-key"?: string;
    "data-focused"?: string;
    className: string;
  } {
    const focused = key !== undefined && highlightKey === key;
    return {
      ...(key !== undefined ? { "data-focus-key": key } : {}),
      ...(focused ? { "data-focused": "1" } : {}),
      className: focused
        ? "rounded-lg ring-2 ring-brand-400 dark:ring-brand-500"
        : "",
    };
  }

  const anyPlayerRunning = Object.values(view.players).some(
    (playerView) => playerView.running,
  );
  const status = stateLabel(view.fsmState, {
    pendingQuestion: view.pendingQuestion !== undefined,
    turnActive: view.turnActive,
  });

  return (
    <section
      data-testid="captain-pane"
      className="flex min-h-0 flex-1 flex-col rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
    >
      <header className="flex items-center gap-2 border-b border-neutral-200 px-3 py-1.5 dark:border-neutral-800">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white">
          C
        </span>
        <span className="text-sm font-semibold">Captain</span>
        {view.fsmState || view.turnActive ? (
          <span
            data-testid="state-chip"
            title={view.fsmState ? `state: ${view.fsmState}` : undefined}
            className={`ml-auto rounded px-1.5 py-0.5 text-[11px] ${STATE_TONE_CLASSES[status.tone]}`}
          >
            {status.text}
          </span>
        ) : null}
      </header>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-2"
        >
          {view.captain.map((line, index) => {
            const separator = timeSeparator(
              index > 0 ? view.captain[index - 1].at : undefined,
              line.at,
            );
            const lineFocus = focusProps(`line-${index}`);
            return (
              <div key={index} className="flex flex-col gap-2">
                {separator ? (
                  <div className="text-center text-[11px] text-neutral-500 dark:text-neutral-500">
                    {separator}
                  </div>
                ) : null}
                <div
                  data-focus-key={lineFocus["data-focus-key"]}
                  data-focused={lineFocus["data-focused"]}
                  className={lineFocus.className}
                >
                  <Line
                    line={line}
                    graphs={machineGraphs}
                    source={
                      line.kind === "boss" && line.turnId !== null
                        ? bossSources?.get(line.turnId)
                        : undefined
                    }
                  />
                </div>
                {extras
                  ?.filter((extra) => extra.afterIndex === index)
                  .map((extra) => {
                    const extraFocus = focusProps(extra.focusKey);
                    return (
                      <div
                        key={extra.key}
                        data-focus-key={extraFocus["data-focus-key"]}
                        data-focused={extraFocus["data-focused"]}
                        className={extraFocus.className}
                      >
                        {extra.node}
                      </div>
                    );
                  })}
              </div>
            );
          })}
          {view.frames.length > 0 ? (
            // The live call tree: roots here, each card owning its own
            // children — including a child whose caller the pane never
            // saw, which renders at the top level rather than vanishing
            // (run-view-63/78).
            <div data-testid="live-machines" className="flex flex-col gap-2">
              {view.frames
                .filter(
                  (frame) =>
                    !frame.parentSessionId ||
                    !view.frames.some(
                      (other) =>
                        other.traceSessionId === frame.parentSessionId,
                    ),
                )
                .map((frame) => (
                  <MachineCard
                    key={frame.traceSessionId}
                    frame={frame}
                    graph={machineGraphs?.[frame.playbookId]}
                    graphs={machineGraphs}
                    openFrames={view.frames}
                    openChildren={view.frames.filter(
                      (other) =>
                        other.parentSessionId === frame.traceSessionId,
                    )}
                  />
                ))}
            </div>
          ) : null}
          {view.captainDraft ? (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-neutral-100 px-3 py-1.5 dark:bg-neutral-800">
                <Markdown text={view.captainDraft} links="web-only" />
              </div>
            </div>
          ) : view.turnActive ? (
            // Life sign while agents work and the Captain is silent
            // (DR-010 §3): the thread is never inert mid-turn.
            <div
              className="flex justify-start"
              data-testid="working-indicator"
            >
              <div className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-neutral-100 px-3 py-2 dark:bg-neutral-800">
                <span className="flex gap-1">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400 [animation-delay:0ms]" />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400 [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400 [animation-delay:300ms]" />
                </span>
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  {anyPlayerRunning
                    ? "players working…"
                    : "Captain is thinking…"}
                </span>
              </div>
            </div>
          ) : null}
          {view.captain.length === 0 &&
          !view.captainDraft &&
          !view.turnActive ? (
            <div className="m-auto text-xs text-neutral-500">
              The Captain will report here.
            </div>
          ) : null}
        </div>
        {newBelow ? (
          <button type="button" onClick={jump} className={jumpPillClasses()}>
            ↓ latest
          </button>
        ) : null}
      </div>
    </section>
  );
}
