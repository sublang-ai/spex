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

function Usage({ usage }: { usage: UsageView }) {
  return (
    <span className="text-xs text-neutral-500">
      {usage.inputTokens.toLocaleString()}→{usage.outputTokens.toLocaleString()} tok
      {usage.totalCostUsd !== undefined
        ? ` · $${usage.totalCostUsd.toFixed(2)}`
        : ""}
    </span>
  );
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
          <Markdown text={segment.text} />
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
    case "tool":
      return (
        <details className="rounded border border-neutral-200 bg-white px-2 py-1 text-xs dark:border-neutral-800 dark:bg-neutral-900">
          <summary className="cursor-pointer select-none font-mono">
            <span
              className={
                segment.status === "error" || segment.status === "denied"
                  ? "text-red-600 dark:text-red-400"
                  : segment.status === "success"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-neutral-500"
              }
            >
              ⚒
            </span>{" "}
            {segment.toolName}
            {segment.durationMs !== undefined ? (
              <span className="text-neutral-400"> · {segment.durationMs}ms</span>
            ) : null}
          </summary>
          <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-neutral-600 dark:text-neutral-400">
            {JSON.stringify(segment.input, null, 2)}
            {segment.output !== undefined
              ? `\n→ ${typeof segment.output === "string" ? segment.output : JSON.stringify(segment.output, null, 2)}`
              : ""}
          </pre>
        </details>
      );
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
      className="flex min-h-0 min-w-[280px] flex-1 flex-col rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
    >
      <header className="flex items-center gap-2 border-b border-neutral-200 px-3 py-1.5 dark:border-neutral-800">
        <span className="font-mono text-sm font-semibold">{view.id}</span>
        {meta ? (
          <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
            {meta.model ?? meta.adapter}
          </span>
        ) : null}
        <span className="ml-auto">
          {view.running ? (
            <span
              data-testid="player-running"
              className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500"
              title="running"
            />
          ) : view.turnUsage ? (
            <Usage usage={view.turnUsage} />
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
              className="text-center text-[11px] text-neutral-400 hover:text-indigo-500"
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
