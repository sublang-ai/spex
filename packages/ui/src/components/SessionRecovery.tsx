// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { useEffect, useRef, useState } from "react";
import { i18n } from "../i18n.js";
import { InlineConfirm } from "./InlineConfirm.js";

type Action = "restore" | "discard";

/** The acts an interrupted turn offers (run-view-110, DR-088), each
 * read where it is shown so the control and its confirm always say the
 * same word. */
const restoreLabel = (): string =>
  i18n._({
    id: "Restore",
    comment: "act: bring back the interrupted work's saved position and report what was recorded; nothing runs again",
  });
const discardLabel = (): string =>
  i18n._({ id: "Discard", comment: "act: throw the interrupted attempt away" });

/** Restore repeats and discards nothing, so it acts at once; Discard,
 * drawn only where the summary says nothing was recorded, asks first.
 * Where Discard is not offered it is simply absent (DR-069). */
export function SessionRecovery({ input, discardable, connected, onRecover }: {
  input: string;
  discardable: boolean;
  connected: boolean;
  onRecover?: (action: Action) => Promise<void>;
}) {
  const [confirm, setConfirm] = useState<"discard">();
  const [pending, setPending] = useState<Action>();
  const [error, setError] = useState<string>();
  const busy = useRef(false);
  const controls = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<Action | undefined>(undefined);
  useEffect(() => {
    if (!confirm && returnFocus.current) {
      controls.current?.querySelector<HTMLButtonElement>(`[data-action="${returnFocus.current}"]`)?.focus();
      returnFocus.current = undefined;
    }
  }, [confirm]);

  async function recover(action: Action) {
    if (busy.current || !connected || !onRecover) return;
    busy.current = true;
    setPending(action);
    setConfirm(undefined);
    setError(undefined);
    try {
      await onRecover(action);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      busy.current = false;
      setPending(undefined);
    }
  }

  const disabled = !connected || !!pending || !onRecover;
  return (
    <section aria-label={i18n._("Interrupted turn")} className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm dark:border-amber-800 dark:bg-amber-950">
      <p className="font-medium">{i18n._("Interrupted turn")}</p>
      <details className="my-1" open>
        <summary>{i18n._("Saved input")}</summary>
        <p className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words">{input}</p>
      </details>
      {error ? <p role="alert" className="my-2 text-red-700 dark:text-red-300">{error}</p> : null}
      {pending ? <p role="status">{pending === "restore" ? i18n._("Restoring…") : i18n._("Discarding…")}</p> : null}
      <div ref={controls}>
        {confirm ? (
          <InlineConfirm
            question={i18n._({
              id: "Discard the unprocessed message? A session with no earlier turn is removed.",
              comment: "confirm before Discard, offered only when the interrupted attempt recorded nothing",
            })}
            confirmLabel={discardLabel()}
            disabled={disabled}
            onConfirm={() => void recover("discard")}
            onCancel={() => { returnFocus.current = "discard"; setConfirm(undefined); }}
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-action="restore"
              disabled={disabled}
              title={i18n._({
                id: "Nothing is repeated",
                comment: "Restore's tooltip: restoring reports what was recorded and runs no work again",
              })}
              onClick={() => void recover("restore")}
              className="min-h-6 rounded border border-neutral-400 px-2 py-1 disabled:opacity-40 dark:border-neutral-600"
            >{restoreLabel()}</button>
            {discardable ? (
              <button
                type="button"
                data-action="discard"
                disabled={disabled}
                onClick={() => setConfirm("discard")}
                className="min-h-6 rounded border border-neutral-400 px-2 py-1 disabled:opacity-40 dark:border-neutral-600"
              >{discardLabel()}</button>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
