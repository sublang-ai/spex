// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Captain home's next card (run-view-88): the project's head
// unblocked intent with Start, and Remove beside it (run-view-114) —
// the Up next row's one-click removal with its six-second Undo, which
// re-queues the same text and provenance at the head. The card stays
// while the Undo line stands, even once the queue behind it is empty.

import { useEffect, useRef, useState, type RefObject } from "react";
import type { IntentInfo } from "@sublang/spex-core/protocol";

import { useAppStore } from "../state/store.js";
import { intentTitle } from "./DeliveryCard.js";

/** How long a removal stays undoable. */
const UNDO_MS = 6_000;

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
  /** The head unblocked queued intent with the count of the rest. */
  next?: { intent: IntentInfo; more: number };
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
  const [removed, setRemoved] = useState<Removal>();
  const [refocusStart, setRefocusStart] = useState(false);
  const startRef = useRef<HTMLButtonElement>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // The Undo line stays six seconds — longer while its control holds
  // focus, so a keyboard user is never raced (dashboard-29's rule).
  const armUndo = () => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => {
      if (document.activeElement === undoRef.current) {
        armUndo();
        return;
      }
      setRemoved(undefined);
    }, UNDO_MS);
  };
  useEffect(
    () => () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    },
    [],
  );
  // The removed card's control took focus with it; Undo is the next
  // sensible place for it.
  useEffect(() => {
    if (removed && !removed.error) undoRef.current?.focus();
  }, [removed]);
  // A restored intent gets its Start back under focus once the ledger
  // serves it again.
  useEffect(() => {
    if (!refocusStart || !next) return;
    startRef.current?.focus();
    setRefocusStart(false);
  }, [refocusStart, next]);

  const remove = async () => {
    if (!next || removing) return;
    const { intent } = next;
    setRemoving(true);
    try {
      // A queued intent has never run, so the core's drop leaves no
      // trace: the card's Remove.
      await closeIntent(intent.id, "dropped");
      setRemoved({ intent });
    } catch (cause) {
      setRemoved({
        intent,
        error: `Couldn't remove “${intentTitle(intent)}”: ${(cause as Error).message}`,
      });
    } finally {
      setRemoving(false);
    }
    armUndo();
  };

  const undo = async () => {
    if (!removed || removed.error) return;
    const { intent } = removed;
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setRemoved(undefined);
    try {
      await queueIntent({
        projectId: intent.projectId,
        text: intent.text,
        source: intent.source,
        at: "head",
      });
      setRefocusStart(true);
    } catch (cause) {
      setRemoved({
        intent,
        error: `Couldn't undo: ${(cause as Error).message}`,
      });
      armUndo();
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
        <div className="flex items-center gap-2">
          <span
            className="min-w-0 flex-1 truncate text-sm"
            title={next.intent.text}
          >
            {intentTitle(next.intent)}
          </span>
          <button
            ref={startRef}
            type="button"
            data-testid="next-start"
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
          <button
            type="button"
            data-testid="next-remove"
            disabled={removing || !connected}
            aria-label={`Remove ${intentTitle(next.intent)}`}
            title="Take this task out of the queue — Undo puts it back"
            onClick={() => void remove()}
            className="shrink-0 rounded-md border border-neutral-300 px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-50 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            {removing ? "Removing…" : "Remove"}
          </button>
        </div>
      ) : null}
      {next && next.more > 0 ? (
        <span className="text-[11px] text-neutral-500">
          +{next.more} more queued
        </span>
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
