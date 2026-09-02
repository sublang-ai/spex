// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The single Boss composer (RUN-3/6/7/8): free text and /commands,
// queueing while a turn is active, awaitBossReply banner, abort.
// Failed submissions keep the draft and surface the error here.
// Drafts live in the store so tab/surface switches never eat text.

import { useEffect, useRef, useState } from "react";
import type { PlaybookSummary } from "@sublang/spex-core/protocol";

import type { ComposerState, StagedIntent } from "../state/store.js";
import type { SessionView } from "../state/reducer.js";
import { SlashMenuList, slashMatches } from "./SlashMenu.js";
import { Icon } from "./Icon.js";

export function Composer({
  view,
  composer,
  connected,
  error,
  playbooks = [],
  staged,
  onCompileNew,
  onDraftChange,
  onSubmit,
  onAbort,
  onRemoveQueued,
  onDismissError,
  onDetachStaged,
  onQueueInstead,
}: {
  view: SessionView;
  composer: ComposerState;
  connected: boolean;
  error?: string;
  playbooks?: PlaybookSummary[];
  /** The staged dispatch this composer wears (DR-035). */
  staged?: StagedIntent;
  onCompileNew?: () => void;
  /** Persist the draft in the store (DR-010: drafts survive). */
  onDraftChange?: (draft: string) => void;
  onSubmit: (text: string) => Promise<void>;
  onAbort: () => void;
  onRemoveQueued: (index: number) => void;
  onDismissError: () => void;
  /** Detach the staged chip without sending (DR-035). */
  onDetachStaged?: () => void;
  /** Queue instead of send (DR-035): the typed text becomes a queued
   * intent for this project; nothing is sent. */
  onQueueInstead?: (text: string) => Promise<void>;
}) {
  const [localText, setLocalText] = useState("");
  const text = onDraftChange ? (composer.draft ?? "") : localText;
  const setText = onDraftChange ?? setLocalText;
  const [sending, setSending] = useState(false);
  const [aborting, setAborting] = useState(false);
  /** Transient queue-instead-of-send acknowledgment (run-view-85). */
  const [queuedNote, setQueuedNote] = useState<string>();
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashDismissed, setSlashDismissed] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const slashItems = slashMatches(text, playbooks);
  const slash = slashDismissed ? undefined : slashItems;

  function insertCommand(command: string) {
    setText(`/${command} `);
    setSlashIndex(0);
    setSlashDismissed(false);
    textareaRef.current?.focus();
  }

  const awaiting = view.pendingQuestion !== undefined;

  // Keep the composer ready to type: focus on mount and the moment a
  // player question arrives.
  useEffect(() => {
    textareaRef.current?.focus();
  }, [awaiting]);

  // "Aborting…" clears itself when the abort lands (turn ends) or
  // the attempt failed and the error strip explains why.
  useEffect(() => {
    if (!view.turnActive) setAborting(false);
  }, [view.turnActive]);
  useEffect(() => {
    if (error) setAborting(false);
  }, [error]);

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
          role="status"
          className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          <span className="min-w-0 flex-1">{error}</span>
          <button
            type="button"
            onClick={onDismissError}
            className="flex h-6 w-6 items-center justify-center rounded text-red-600 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-900"
            title="Dismiss"
            aria-label="Dismiss error"
          >
            <Icon name="close" className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
      {awaiting ? (
        <div
          data-testid="boss-reply-banner"
          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
        >
          {view.pendingQuestionPlayer ? (
            <>
              <span className="font-mono font-semibold">
                {view.pendingQuestionPlayer}
              </span>{" "}
              is waiting for your reply — your next message answers it.
            </>
          ) : (
            <>Waiting for your reply — your next message answers it.</>
          )}
        </div>
      ) : null}
      {queuedNote ? (
        <div
          data-testid="queued-intent-note"
          role="status"
          className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300"
        >
          {queuedNote}
        </div>
      ) : null}
      {composer.queued.length > 0 ? (
        <div
          data-testid="queue-indicator"
          className="flex flex-col items-end gap-1"
        >
          {composer.queued.map((entry, index) => (
            <div
              key={index}
              className="flex max-w-[85%] flex-col rounded-2xl rounded-br-md border border-brand-300 px-3 py-1.5 text-sm text-brand-700 dark:border-brand-700 dark:text-brand-300"
            >
              <span className="whitespace-pre-wrap">{entry.text}</span>
              <span className="mt-0.5 flex items-center gap-1 text-[11px] text-neutral-400">
                {entry.intentId !== undefined ? (
                  <span
                    data-testid="queued-intent-chip"
                    className="rounded-full border border-brand-300 px-1.5 font-medium text-brand-600 dark:border-brand-700 dark:text-brand-300"
                  >
                    intent
                  </span>
                ) : null}
                sends when this turn ends
                <button
                  type="button"
                  title="Remove from queue"
                  aria-label="Remove queued message"
                  onClick={() => onRemoveQueued(index)}
                  className="flex h-5 w-5 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 hover:text-red-500 dark:hover:bg-neutral-800"
                >
                  <Icon name="close" className="h-3 w-3" />
                </button>
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {staged ? (
        <div
          data-testid="staged-intent-chip"
          className="flex items-center gap-2 self-start rounded-full border border-brand-300 bg-brand-50 py-0.5 pl-3 pr-1 text-xs font-medium text-brand-700 dark:border-brand-700 dark:bg-brand-950 dark:text-brand-300"
        >
          <span className="max-w-[24rem] truncate">
            Dispatching: {staged.title}
          </span>
          <button
            type="button"
            title="Detach the intent — sending then stamps nothing"
            aria-label="Detach the staged intent"
            onClick={onDetachStaged}
            className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-brand-100 dark:hover:bg-brand-900"
          >
            <Icon name="close" className="h-3 w-3" />
          </button>
        </div>
      ) : null}
      <div className="relative">
        {slash ? (
          <SlashMenuList
            items={slash}
            activeIndex={Math.min(slashIndex, slash.length - 1)}
            onPick={(playbook) => insertCommand(playbook.command)}
            onCompileNew={onCompileNew}
          />
        ) : null}
        {/* One composer shape across the app (DR-010 §8): the box is
            the control, the buttons sit inside it, and focus reads as
            the box's own border rather than a ring around it. */}
        <div className="flex items-end gap-2 rounded-xl border border-neutral-300 bg-white p-2 focus-within:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:focus-within:border-neutral-400">
          <textarea
            ref={textareaRef}
            data-testid="boss-composer"
            autoFocus
            value={text}
            aria-haspopup="listbox"
            aria-expanded={Boolean(slash)}
            aria-controls={slash ? "slash-listbox" : undefined}
            aria-activedescendant={
              slash
                ? `slash-option-${Math.min(slashIndex, slash.length - 1)}`
                : undefined
            }
            onChange={(event) => {
              setText(event.target.value);
              setSlashIndex(0);
              setSlashDismissed(false);
              setQueuedNote(undefined);
              // Emptying the composer detaches the staged intent
              // (DR-035): sending something else stamps nothing.
              if (staged && event.target.value.trim().length === 0) {
                onDetachStaged?.();
              }
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing || event.keyCode === 229)
                return;
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
                if (event.key === "Escape") {
                  // Hide the menu, never the draft (DR-010 §4).
                  event.preventDefault();
                  setSlashDismissed(true);
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
                  : view.turnActive
                    ? "A turn is running — your message is delivered when it finishes…"
                    : "Message the Captain — free text or /command…"
            }
            disabled={!connected}
            className="max-h-[40vh] min-h-[2.5rem] flex-1 resize-y border-0 bg-transparent px-1 py-1 text-sm outline-none disabled:opacity-60"
          />
          <div className="flex shrink-0 items-center gap-1.5">
            {onQueueInstead && !staged ? (
              <button
                type="button"
                data-testid="queue-intent-button"
                title="Queue as an intent instead of sending"
                onClick={() => {
                  const trimmed = text.trim();
                  if (!trimmed || sending) return;
                  setSending(true);
                  onQueueInstead(trimmed)
                    .then(() => {
                      setText("");
                      setQueuedNote("Queued for later — see Up next in Overview.");
                    })
                    .catch(() => {
                      // Draft kept; the error strip explains.
                    })
                    .finally(() => {
                      setSending(false);
                      textareaRef.current?.focus();
                    });
                }}
                disabled={text.trim().length === 0 || sending || !connected}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                Queue intent
              </button>
            ) : null}
            {view.turnActive ? (
              <button
                type="button"
                data-testid="abort-button"
                onClick={() => {
                  setAborting(true);
                  onAbort();
                }}
                disabled={aborting || !connected}
                title={!connected ? "not connected" : undefined}
                className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-40 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
              >
                {aborting ? "Aborting…" : "Abort"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={submit}
              className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-40"
              disabled={text.trim().length === 0 || sending || !connected}
              title={!connected ? "not connected" : undefined}
            >
              {view.turnActive ? "Queue" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
