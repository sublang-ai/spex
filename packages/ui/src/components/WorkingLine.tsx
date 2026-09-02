// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The working line (run-view-90) above the Boss composer, naming the
// open intent the lane serves, with Drop (run-view-113): behind the
// inline confirm, since work is underway, the intent closes dropped
// over the protocol while the turn keeps running. The outcome lands
// in a status line where the working line stood, and focus never
// strands — Keep returns it to the control, a drop hands it to the
// composer once the line has left with its control.

import { useEffect, useRef, useState } from "react";
import type { IntentInfo } from "@sublang/spex-core/protocol";

import { intentTitle } from "./DeliveryCard.js";
import { InlineConfirm } from "./InlineConfirm.js";

/** How long the outcome line stays. */
const NOTE_MS = 6_000;

export function WorkingLine({
  intent,
  onDrop,
}: {
  /** The newest open dispatched intent, or none: the line then yields
   * to any outcome note still standing. */
  intent?: IntentInfo;
  onDrop: (intent: IntentInfo) => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [note, setNote] = useState<string>();
  const [refocus, setRefocus] = useState(false);
  const dropRef = useRef<HTMLButtonElement>(null);
  const noteRef = useRef<HTMLDivElement>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!refocus || confirming) return;
    setRefocus(false);
    if (dropRef.current) {
      dropRef.current.focus();
      return;
    }
    // The line left with its control: the composer below is the next
    // sensible place (DR-010 §6).
    noteRef.current
      ?.closest('[data-testid="captain-column"]')
      ?.querySelector("textarea")
      ?.focus();
  }, [refocus, confirming]);
  useEffect(
    () => () => {
      if (noteTimer.current) clearTimeout(noteTimer.current);
    },
    [],
  );

  const drop = async (target: IntentInfo) => {
    const title = intentTitle(target);
    setConfirming(false);
    setDropping(true);
    try {
      await onDrop(target);
      setNote(`Dropped “${title}” — the turn keeps running.`);
    } catch (cause) {
      setNote(`Couldn't drop “${title}”: ${(cause as Error).message}`);
    } finally {
      setDropping(false);
      setRefocus(true);
    }
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(undefined), NOTE_MS);
  };

  return (
    <>
      {intent ? (
        // Re-entry answered where the eye lands (run-view-90): the
        // lane names what it is working on, raw text in the tooltip.
        <div
          data-testid="working-line"
          title={intent.text}
          className="flex items-center gap-1.5 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300"
        >
          <span className="shrink-0 font-medium">Working:</span>
          <span className="min-w-0 flex-1 truncate">{intentTitle(intent)}</span>
          {confirming ? (
            <InlineConfirm
              question="Drop this intent? Work is underway."
              confirmLabel="Drop"
              cancelLabel="Keep"
              onConfirm={() => void drop(intent)}
              onCancel={() => {
                setConfirming(false);
                setRefocus(true);
              }}
            />
          ) : (
            <button
              ref={dropRef}
              type="button"
              data-testid="working-drop"
              disabled={dropping}
              aria-label={`Drop ${intentTitle(intent)}`}
              title="Close this intent as dropped — the turn keeps running"
              onClick={() => setConfirming(true)}
              className="min-h-6 shrink-0 rounded border border-neutral-300 px-1.5 py-0.5 text-neutral-600 hover:border-red-300 hover:text-red-600 disabled:animate-pulse dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-red-800 dark:hover:text-red-400"
            >
              {dropping ? "Dropping…" : "Drop"}
            </button>
          )}
        </div>
      ) : null}
      {note ? (
        <div
          ref={noteRef}
          role="status"
          data-testid="working-note"
          className={`rounded-md border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs dark:border-neutral-800 dark:bg-neutral-900 ${
            note.startsWith("Couldn't")
              ? "text-red-600 dark:text-red-400"
              : "text-neutral-500"
          }`}
        >
          {note}
        </div>
      ) : null}
    </>
  );
}
