// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Captain home's next card (run-view-88): the project's head
// unblocked intent with Start, and Remove beside it (run-view-114) —
// the Up next row's one-click removal with its six-second Undo, which
// re-queues the same text and provenance at the head. The card stays
// while the Undo line stands, even once the queue behind it is empty.

import { useEffect, useRef, useState, type RefObject } from "react";
import type {
  IntentInfo,
  QueueSchedule,
} from "@sublang/spex-core/protocol";

import { useAppStore } from "../state/store.js";
import { activatedByKeyboard, useUndoLine } from "../lib/useUndoLine.js";
import { intentTitle } from "./DeliveryCard.js";
import {
  QueuedMark,
  QueueStandingPhrase,
} from "./QueuedIntentPresentation.js";

export interface NextCardIntent {
  intent: IntentInfo;
  schedule: QueueSchedule;
  more: number;
}

interface Removal {
  intent: IntentInfo;
  error?: string;
}

export function NextCard({
  next,
  connected,
  composerRef,
  onStartIntent,
}: {
  /** The core-published next queued intent with the count of the rest. */
  next?: NextCardIntent;
  connected: boolean;
  /** Start hands focus to the composer it staged into. */
  composerRef: RefObject<HTMLTextAreaElement | null>;
  /** Stage the intent into the home composer (run-view-86/88). */
  onStartIntent?: (intent: IntentInfo) => Promise<void> | void;
}) {
  const closeIntent = useAppStore((state) => state.closeIntent);
  const queueIntent = useAppStore((state) => state.queueIntent);
  const [staging, setStaging] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [refocusIntentId, setRefocusIntentId] = useState<string>();
  const startRef = useRef<HTMLButtonElement>(null);
  const removeRef = useRef<HTMLButtonElement>(null);
  // The six-second Undo line, taking focus only from a keyboard-driven
  // removal (run-view-114).
  const { removed, undoRef, show, dismiss } = useUndoLine<Removal>();

  // A restored intent gets its available action under focus once the
  // ledger serves that exact recreated row. An intervening head must
  // not consume the focus handoff while the ledger reload is in flight.
  useEffect(() => {
    if (!refocusIntentId || next?.intent.id !== refocusIntentId) return;
    (next.schedule.manualStart ? startRef : removeRef).current?.focus();
    setRefocusIntentId(undefined);
  }, [refocusIntentId, next]);

  const remove = async (byKeyboard: boolean) => {
    if (!next || removing) return;
    const { intent } = next;
    setRemoving(true);
    try {
      // A queued intent has never run, so the core's drop leaves no
      // trace: the card's Remove.
      await closeIntent(intent.id, "dropped");
      show({ intent }, { byKeyboard });
    } catch (cause) {
      show(
        {
          intent,
          error: `Couldn't remove “${intentTitle(intent)}”: ${(cause as Error).message}`,
        },
        { byKeyboard },
      );
    } finally {
      setRemoving(false);
    }
  };

  const undo = async () => {
    if (!removed || removed.error) return;
    const { intent } = removed;
    dismiss();
    try {
      const restored = await queueIntent({
        projectId: intent.projectId,
        text: intent.text,
        source: intent.source,
        at: "head",
      });
      setRefocusIntentId(restored.id);
    } catch (cause) {
      show(
        { intent, error: `Couldn't undo: ${(cause as Error).message}` },
        { byKeyboard: true },
      );
    }
  };

  if (!next && !removed) return null;
  return (
    <div
      data-testid="next-card"
      className="ml-8 flex max-w-[85%] flex-col gap-1 rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <span className="text-xs font-semibold text-neutral-500">Up next</span>
      {next ? (
        <div
          data-testid="next-row"
          className="@container flex flex-wrap items-center gap-2"
        >
          <div
            data-testid="next-text"
            className="flex min-w-0 flex-1 basis-full flex-col @md:basis-0"
          >
            <div className="flex min-w-0 flex-col @md:flex-row @md:items-baseline @md:gap-2">
              <span
                data-testid="next-title"
                className="min-w-0 truncate text-sm @md:flex-1"
                title={next.intent.text}
              >
                {intentTitle(next.intent)}
              </span>
              <QueueStandingPhrase
                schedule={next.schedule}
                testId="next-standing"
                className="min-w-0 truncate text-xs text-neutral-500 dark:text-neutral-400 @md:max-w-[45%]"
              />
            </div>
            {next.more > 0 ? (
              <span className="text-xs text-neutral-500">
                +{next.more} more queued
              </span>
            ) : null}
          </div>
          <QueuedMark testId="next-queued" />
          {next.schedule.manualStart ? (
            <button
              ref={startRef}
              type="button"
              data-testid="next-start"
              aria-label={`Start ${intentTitle(next.intent)}`}
              disabled={staging || !connected}
              title="Put this task in the message — Send starts it"
              onClick={() => {
                setStaging(true);
                void Promise.resolve(onStartIntent?.(next.intent))
                  .catch(() => {})
                  .finally(() => {
                    setStaging(false);
                    composerRef.current?.focus();
                  });
              }}
              className="shrink-0 rounded-md bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-500 disabled:opacity-40"
            >
              {staging ? "Starting…" : "Start"}
            </button>
          ) : null}
          <button
            ref={removeRef}
            type="button"
            data-testid="next-remove"
            disabled={removing || !connected}
            aria-label={`Remove ${intentTitle(next.intent)}`}
            title="Take this task out of the queue — Undo puts it back"
            onClick={(event) => void remove(activatedByKeyboard(event))}
            className="shrink-0 rounded-md border border-neutral-300 px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-50 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            {removing ? "Removing…" : "Remove"}
          </button>
        </div>
      ) : null}
      {removed ? (
        <div
          role="status"
          data-testid="next-removed"
          className="flex items-center gap-1.5 text-xs text-neutral-500"
        >
          {removed.error ? (
            <span className="min-w-0 truncate text-red-600 dark:text-red-400">
              {removed.error}
            </span>
          ) : (
            <>
              <span className="min-w-0 truncate">
                Removed “{intentTitle(removed.intent)}”
              </span>
              <span aria-hidden="true">—</span>
              <button
                ref={undoRef}
                type="button"
                onClick={() => void undo()}
                className="min-h-6 rounded px-1 text-brand-600 hover:underline dark:text-brand-300"
              >
                Undo
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
