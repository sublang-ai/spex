// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The single Boss composer (RUN-3/6/7/8): free text and /commands,
// queueing while a turn is active, awaitBossReply banner, abort.

import { useState } from "react";

import type { ComposerState } from "../state/store.js";
import type { SessionView } from "../state/reducer.js";

export function Composer({
  view,
  composer,
  onSubmit,
  onAbort,
}: {
  view: SessionView;
  composer: ComposerState;
  onSubmit: (text: string) => void;
  onAbort: () => void;
}) {
  const [text, setText] = useState("");

  function submit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setText("");
  }

  const awaiting = view.pendingQuestion !== undefined;

  return (
    <div className="flex flex-col gap-1.5">
      {awaiting ? (
        <div
          data-testid="boss-reply-banner"
          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
        >
          <span className="font-semibold">A player is waiting for you.</span>{" "}
          {view.pendingQuestion || "Your next message is the reply."}
        </div>
      ) : null}
      {composer.queued.length > 0 ? (
        <div
          data-testid="queue-indicator"
          className="flex flex-wrap gap-1 text-xs text-neutral-500"
        >
          {composer.queued.map((entry, index) => (
            <span
              key={index}
              className="rounded-full bg-neutral-200 px-2 py-0.5 dark:bg-neutral-800"
            >
              queued: {entry.length > 40 ? `${entry.slice(0, 40)}…` : entry}
            </span>
          ))}
        </div>
      ) : null}
      <div className="flex items-end gap-2">
        <textarea
          data-testid="boss-composer"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          rows={2}
          placeholder={
            awaiting
              ? "Answer the question (or give a new directive)…"
              : "Message the Captain — free text or /command…"
          }
          className="min-h-[3rem] flex-1 resize-y rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={submit}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
            disabled={text.trim().length === 0}
          >
            {view.turnActive ? "Queue" : "Send"}
          </button>
          {view.turnActive ? (
            <button
              type="button"
              data-testid="abort-button"
              onClick={onAbort}
              className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950"
            >
              Abort
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
