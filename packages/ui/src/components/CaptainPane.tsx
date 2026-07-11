// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Captain thread (RUN-1, RUN-30): an IM-style conversation — the
// user's messages as their own bubbles, Captain speech as
// counterpart bubbles, shell status lines (glyphs rendered as-is)
// as compact system lines between them.

import { useEffect, useRef } from "react";

import type { CaptainLine, SessionView } from "../state/reducer.js";
import { Markdown } from "./Markdown.js";

function Line({ line }: { line: CaptainLine }) {
  const time = new Date(line.at).toLocaleString();
  switch (line.kind) {
    case "boss":
      return (
        <div className="flex justify-end" title={time}>
          <div
            data-testid="boss-bubble"
            className="max-w-[85%] rounded-2xl rounded-br-md bg-indigo-600 px-3 py-1.5 text-sm text-white"
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

export function CaptainPane({ view }: { view: SessionView }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  });

  return (
    <section
      data-testid="captain-pane"
      className="flex min-h-0 flex-1 flex-col rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
    >
      <header className="flex items-center gap-2 border-b border-neutral-200 px-3 py-1.5 dark:border-neutral-800">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white">
          C
        </span>
        <span className="text-sm font-semibold">Captain</span>
        {view.captainMode ? (
          <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[11px] text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
            {view.captainMode}
          </span>
        ) : null}
        {view.fsmState ? (
          <span className="ml-auto rounded bg-indigo-50 px-1.5 py-0.5 font-mono text-[11px] text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300">
            {view.fsmState}
          </span>
        ) : null}
      </header>
      <div
        ref={scrollRef}
        onScroll={(event) => {
          const el = event.currentTarget;
          stick.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-2"
      >
        {view.captain.map((line, index) => (
          <Line key={index} line={line} />
        ))}
        {view.captainDraft ? (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-neutral-100 px-3 py-1.5 dark:bg-neutral-800">
              <Markdown text={view.captainDraft} />
            </div>
          </div>
        ) : null}
        {view.captain.length === 0 && !view.captainDraft ? (
          <div className="m-auto text-xs text-neutral-400">
            The Captain will report here.
          </div>
        ) : null}
      </div>
    </section>
  );
}
