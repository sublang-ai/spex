// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Captain thread (RUN-1, RUN-30): an IM-style conversation — the
// user's messages as their own bubbles, Captain speech as
// counterpart bubbles, player questions as first-class incoming
// messages, shell status lines as compact system lines between them.

import type { CaptainLine, SessionView } from "../state/reducer.js";
import { stateLabel } from "../lib/labels.js";
import { useStickToBottom, jumpPillClasses } from "../lib/useStickToBottom.js";
import { Markdown } from "./Markdown.js";

function Line({ line }: { line: CaptainLine }) {
  const time = new Date(line.at).toLocaleString();
  switch (line.kind) {
    case "boss":
      return (
        <div className="flex justify-end" title={time}>
          <div
            data-testid="boss-bubble"
            className="max-w-[85%] rounded-2xl rounded-br-md bg-brand-600 px-3 py-1.5 text-sm text-white"
          >
            <span className="whitespace-pre-wrap">{line.text}</span>
          </div>
        </div>
      );
    case "speech":
      return (
        <div className="flex justify-start" title={time}>
          <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-neutral-100 px-3 py-1.5 dark:bg-neutral-800">
            <Markdown text={line.text} />
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
              <Markdown text={line.text} />
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
          className="whitespace-pre-wrap text-center font-mono text-[11px] text-neutral-400 dark:text-neutral-500"
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

export function CaptainPane({ view }: { view: SessionView }) {
  const { scrollRef, onScroll, newBelow, jump } = useStickToBottom(
    view.captain.length + view.captainDraft.length + (view.turnActive ? 1 : 0),
  );

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
            return (
              <div key={index} className="flex flex-col gap-2">
                {separator ? (
                  <div className="text-center text-[11px] text-neutral-400 dark:text-neutral-600">
                    {separator}
                  </div>
                ) : null}
                <Line line={line} />
              </div>
            );
          })}
          {view.captainDraft ? (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-neutral-100 px-3 py-1.5 dark:bg-neutral-800">
                <Markdown text={view.captainDraft} />
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
            <div className="m-auto text-xs text-neutral-400">
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
