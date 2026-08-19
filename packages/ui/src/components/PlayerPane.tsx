// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Read-only streaming player transcript (RUN-2/4/5): markdown text,
// collapsed tool-use cards, collapsed thinking, per-turn usage.

import { useState } from "react";
import type { SessionInfo } from "@sublang/spex-core/protocol";

import type { PlayerView, TranscriptSegment, UsageView } from "../state/reducer.js";
import { useStickToBottom, jumpPillClasses } from "../lib/useStickToBottom.js";
import { Markdown } from "./Markdown.js";

const RENDER_WINDOW = 200;

function timeTitle(at: number): string {
  return Number.isFinite(at) ? new Date(at).toLocaleString() : "";
}

/** Prints only what the call reported. A runtime that told us nothing
 * about tokens gets silence, not a zero it never measured (DR-032). */
function Usage({ usage }: { usage: UsageView }) {
  const tokens =
    usage.inputTokens !== undefined || usage.outputTokens !== undefined
      ? `${(usage.inputTokens ?? 0).toLocaleString()}→${(
          usage.outputTokens ?? 0
        ).toLocaleString()} tok`
      : undefined;
  const cost =
    usage.totalCostUsd !== undefined
      ? `${usage.costSource === "provider-reported" ? "" : "≈"}$${usage.totalCostUsd.toFixed(2)}`
      : undefined;
  const parts = [tokens, cost].filter(Boolean);
  if (parts.length === 0) return null;
  return (
    <span
      className="text-xs text-neutral-500"
      title={
        usage.costSource && usage.costSource !== "provider-reported"
          ? `cost ${usage.costSource.replace("-", " ")}`
          : undefined
      }
    >
      {parts.join(" · ")}
    </span>
  );
}

/** The keys a tool call names its subject with, in the order the
 * card reads them (run-view-4). */
const SUBJECT_KEYS = [
  "command",
  "file_path",
  "path",
  "pattern",
  "url",
  "query",
  "prompt",
  "description",
] as const;

/** What the call acts on, in one line: a collapsed card that says only
 * "Bash" leaves the reader guessing at every step of a run. */
function toolSubject(input: unknown): string | undefined {
  const raw =
    typeof input === "string"
      ? input
      : input && typeof input === "object"
        ? SUBJECT_KEYS.map(
            (key) => (input as Record<string, unknown>)[key],
          ).find((value): value is string => typeof value === "string")
        : undefined;
  const line = raw?.trim().replace(/\s+/g, " ");
  return line ? line : undefined;
}

function Segment({ segment }: { segment: TranscriptSegment }) {
  switch (segment.kind) {
    case "prompt":
      return (
        <details
          title={timeTitle(segment.at)}
          className="rounded border border-neutral-200 bg-neutral-100/60 px-2 py-1 text-xs text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900/60 dark:text-neutral-400"
        >
          <summary className="cursor-pointer select-none">
            {/* A lane answers several roles over a session, so the call
                that opens here says which one it served (DR-032). */}
            {segment.role ? (
              <span
                data-testid={`call-role-${segment.seq}`}
                className="mr-2 rounded bg-brand-50 px-1.5 py-0.5 font-mono text-[11px] text-brand-700 dark:bg-brand-950 dark:text-brand-300"
              >
                {segment.role}
              </span>
            ) : null}
            Prompt
            <span className="ml-2 text-xs text-neutral-400">
              {new Date(segment.at).toLocaleTimeString()}
            </span>
          </summary>
          <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px]">
            {segment.text}
          </pre>
        </details>
      );
    case "text":
      return (
        <div>
          <Markdown text={segment.text} links="web-only" />
          {segment.streaming ? (
            <span className="inline-block h-3 w-1.5 animate-pulse bg-neutral-400 align-baseline" />
          ) : null}
        </div>
      );
    case "thinking":
      return (
        <details className="rounded border border-dashed border-neutral-300 px-2 py-1 text-xs italic text-neutral-500 dark:border-neutral-700">
          <summary className="cursor-pointer select-none not-italic">
            Thinking
          </summary>
          <div className="mt-1 whitespace-pre-wrap">{segment.summary}</div>
        </details>
      );
    case "tool": {
      const subject = toolSubject(segment.input);
      return (
        <details className="rounded border border-neutral-200 bg-white px-2 py-1 text-xs dark:border-neutral-800 dark:bg-neutral-900">
          <summary className="cursor-pointer select-none font-mono">
            {/* The row stays one line: the subject takes the rest of it
                and elides, so a long command never widens the pane. */}
            <span className="inline-flex w-[calc(100%-1.25rem)] items-baseline gap-1.5 align-middle">
              <span
                aria-hidden="true"
                className={
                  segment.status === "error" || segment.status === "denied"
                    ? "text-red-600 dark:text-red-400"
                    : segment.status === "success"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-neutral-500"
                }
              >
                ⚒
              </span>
              <span className="shrink-0">{segment.toolName}</span>
              {segment.durationMs !== undefined ? (
                <span className="shrink-0 text-neutral-400">
                  · {segment.durationMs}ms
                </span>
              ) : null}
              {subject ? (
                <span
                  data-testid={`tool-subject-${segment.seq}`}
                  className="min-w-0 flex-1 truncate text-neutral-500 dark:text-neutral-400"
                >
                  {subject}
                </span>
              ) : null}
            </span>
          </summary>
          <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-neutral-600 dark:text-neutral-400">
            {JSON.stringify(segment.input, null, 2)}
            {segment.output !== undefined
              ? `\n\u2192 ${typeof segment.output === "string" ? segment.output : JSON.stringify(segment.output, null, 2)}`
              : ""}
          </pre>
        </details>
      );
    }
    case "error":
      return (
        <div className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {segment.message}
        </div>
      );
    case "result":
      return (
        <div
          title={timeTitle(segment.at)}
          className="flex items-center gap-2 border-t border-neutral-200 pt-1 text-xs dark:border-neutral-800"
        >
          <span
            className={
              segment.status === "ok"
                ? "text-emerald-600 dark:text-emerald-400"
                : segment.status === "aborted"
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-red-600 dark:text-red-400"
            }
          >
            {segment.status === "ok"
              ? "✓ finished"
              : segment.status === "aborted"
                ? "◇ aborted"
                : `✗ ${segment.error ?? "error"}`}
          </span>
          {segment.usage ? <Usage usage={segment.usage} /> : null}
        </div>
      );
  }
}

export function PlayerPane({
  view,
  meta,
}: {
  view: PlayerView;
  meta?: SessionInfo["players"][number];
}) {
  const [windowSize, setWindowSize] = useState(RENDER_WINDOW);
  const { scrollRef, onScroll, newBelow, jump, stuckRef } = useStickToBottom(
    view.segments.length,
  );

  const segments = view.segments.slice(-windowSize);

  return (
    <section
      data-testid={`player-pane-${view.id}`}
      className="@container flex min-h-0 min-w-[280px] flex-1 flex-col rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
    >
      {/* One line at any pane width: the lane's name is never abridged,
          a long model name elides, and the at-a-glance usage — which
          the transcript's own result line repeats — gives way first. */}
      <header className="flex items-center gap-2 border-b border-neutral-200 px-3 py-1.5 dark:border-neutral-800">
        <span className="shrink-0 font-mono text-sm font-semibold">
          {view.id}
        </span>
        {meta ? (
          <span
            title={meta.model ?? meta.adapter}
            className="min-w-0 truncate rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] whitespace-nowrap text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
          >
            {meta.model ?? meta.adapter}
          </span>
        ) : null}
        <span className="ml-auto shrink-0">
          {view.running ? (
            <span
              data-testid="player-running"
              className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500"
              title="running"
            />
          ) : view.turnUsage ? (
            <span className="hidden whitespace-nowrap @[22rem]:inline">
              <Usage usage={view.turnUsage} />
            </span>
          ) : null}
        </span>
      </header>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-2"
        >
          {view.segments.length > windowSize ? (
            <button
              type="button"
              onClick={() => {
                stuckRef.current = false;
                setWindowSize((size) => size + RENDER_WINDOW);
              }}
              className="text-center text-[11px] text-neutral-400 hover:text-brand-500"
            >
              show {Math.min(RENDER_WINDOW, view.segments.length - windowSize)}{" "}
              of {view.segments.length - windowSize} earlier entries
            </button>
          ) : null}
          {segments.map((segment) => (
            <Segment key={segment.seq} segment={segment} />
          ))}
          {view.segments.length === 0 ? (
            <div className="m-auto text-xs text-neutral-400">
              waiting for the first prompt
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
