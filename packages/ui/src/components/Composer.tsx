// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The single Boss composer (RUN-3/6/7/8): free text and /commands,
// queueing while a turn is active, awaitBossReply banner, abort.
// Failed submissions keep the draft and surface the error here.

import { useEffect, useRef, useState } from "react";
import type { PlaybookSummary } from "@sublang/spex-core/protocol";

import type { ComposerState } from "../state/store.js";
import type { SessionView } from "../state/reducer.js";
import { SlashMenuList, slashMatches } from "./SlashMenu.js";

export function Composer({
  view,
  composer,
  connected,
  error,
  playbooks = [],
  onSubmit,
  onAbort,
  onRemoveQueued,
  onDismissError,
}: {
  view: SessionView;
  composer: ComposerState;
  connected: boolean;
  error?: string;
  playbooks?: PlaybookSummary[];
  onSubmit: (text: string) => Promise<void>;
  onAbort: () => void;
  onRemoveQueued: (index: number) => void;
  onDismissError: () => void;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const slash = slashMatches(text, playbooks);

  function insertCommand(command: string) {
    setText(`/${command} `);
    setSlashIndex(0);
    textareaRef.current?.focus();
  }

  const awaiting = view.pendingQuestion !== undefined;

  // Keep the composer ready to type: focus on mount and the moment a
  // player question arrives.
  useEffect(() => {
    textareaRef.current?.focus();
  }, [awaiting]);

  function submit() {
    const trimmed = text.trim();
    if (!trimmed || sending || !connected) return;
    setSending(true);
    onSubmit(trimmed)
      .then(() => setText(""))
      .catch(() => {
        // Draft is kept; the error strip explains what happened.
      })
      .finally(() => {
        setSending(false);
        textareaRef.current?.focus();
      });
  }

  return (
    <div className="flex flex-col gap-1.5">
      {error ? (
        <div
          data-testid="run-error"
          className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          <span className="min-w-0 flex-1">{error}</span>
          <button
            type="button"
            onClick={onDismissError}
            className="text-red-400 hover:text-red-600"
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      ) : null}
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
              title={entry}
              className="flex items-center gap-1 rounded-full bg-neutral-200 px-2 py-0.5 dark:bg-neutral-800"
            >
              queued: {entry.length > 40 ? `${entry.slice(0, 40)}…` : entry}
              <button
                type="button"
                title="Remove from queue"
                onClick={() => onRemoveQueued(index)}
                className="text-neutral-400 hover:text-red-500"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="relative flex items-end gap-2">
        {slash ? (
          <SlashMenuList
            items={slash}
            activeIndex={Math.min(slashIndex, slash.length - 1)}
            onPick={(playbook) => insertCommand(playbook.command)}
          />
        ) : null}
        <textarea
          ref={textareaRef}
          data-testid="boss-composer"
          autoFocus
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setSlashIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || event.keyCode === 229) return;
            if (slash) {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setSlashIndex((index) => (index + 1) % slash.length);
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setSlashIndex(
                  (index) => (index - 1 + slash.length) % slash.length,
                );
                return;
              }
              if (event.key === "Tab" || event.key === "Enter") {
                event.preventDefault();
                insertCommand(
                  slash[Math.min(slashIndex, slash.length - 1)].command,
                );
                return;
              }
            }
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          rows={2}
          placeholder={
            !connected
              ? "Reconnecting to the Spex core…"
              : awaiting
                ? "Answer the question (or give a new directive)…"
                : "Message the Captain — free text or /command…"
          }
          disabled={!connected}
          className="max-h-[40vh] min-h-[3rem] flex-1 resize-y rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={submit}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
            disabled={text.trim().length === 0 || sending || !connected}
            title={!connected ? "not connected" : undefined}
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
