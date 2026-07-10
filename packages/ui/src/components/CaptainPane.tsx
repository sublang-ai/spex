// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Captain pane (RUN-1): shell status lines rendered as-is (the glyph
// vocabulary ◇ ◆ ▸ ⮕ ⤷ comes from upstream), captain speech as
// markdown, runtime errors highlighted.

import { useEffect, useRef } from "react";

import type { SessionView } from "../state/reducer.js";
import { Markdown } from "./Markdown.js";

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
        className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-3 py-2"
      >
        {view.captain.map((line, index) =>
          line.kind === "status" ? (
            <div
              key={index}
              className="whitespace-pre-wrap font-mono text-xs text-neutral-600 dark:text-neutral-400"
            >
              {line.text}
            </div>
          ) : line.kind === "error" ? (
            <div
              key={index}
              className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
            >
              {line.text}
            </div>
          ) : (
            <div key={index}>
              <Markdown text={line.text} />
            </div>
          ),
        )}
        {view.captainDraft ? <Markdown text={view.captainDraft} /> : null}
        {view.captain.length === 0 && !view.captainDraft ? (
          <div className="m-auto text-xs text-neutral-400">
            the Captain will report here
          </div>
        ) : null}
      </div>
    </section>
  );
}
