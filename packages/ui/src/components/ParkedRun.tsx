// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The parked-run notice (run-view-128..130, run-view-112, DR-060,
// DR-062, DR-073): a run standing parked on the Boss used to offer
// nothing to activate — the only way back was prose the Boss invented.
// The notice stands between the Captain pane and the composer and says
// in phrases what the run waits for and what each control does. Drop
// stands on either park and ends the run through the shell's own
// give-up, which spends no model call, so the exit works when the
// provider is what failed. Retry stands only where a recovery answers
// the park — the failure state — and a run waiting for a reply carries
// Drop alone, the composer being its other door.
//
// Drop sends one command and no more (run-view-112): a session serving
// an open intent is ruled on by that intent's close, which ends the run
// on the way; one serving none takes the ending control itself.
//
// The test ids read `failed-workflow`: they are held from the notice's
// first name so the browser journeys keep their grip on it.

import { useRef, useState } from "react";

/** The busy form is the longer word, so each control reserves its width
 * once and nothing reflows on activation (DR-041: a busy form never
 * widens its control). The reserve is measured against the busy form in
 * a real browser (run-view-132) — which is how 5.5rem was caught coming
 * up short of "Retrying…" by a pixel and a half, and how 6rem was caught
 * holding "Dropping…" on one platform's fonts but not on the Linux
 * fonts CI renders with. It must clear the longest busy word on the
 * widest font the journey runs under, not on the author's. */
const CONTROL_WIDTH = "min-w-[6.75rem]";

export function ParkedRun({
  reason,
  command,
  playbookId,
  state,
  connected,
  turnActive,
  onControl,
}: {
  /** Which park the run stands in: the failure a recovery answers, or
   * the reply it waits for (run-view-128). */
  reason: "failure" | "question";
  /** The command that started the parked run, where a configured
   * playbook names one; absent when none does (run-view-128). */
  command?: string;
  /** The run's own playbook id, carried only where no command names
   * it: an identifier belongs in the tooltip, never in the copy
   * (DR-010 §2). */
  playbookId?: string;
  /** The raw state id, which rides the notice's tooltip and never the
   * copy (DR-010 §2). */
  state?: string;
  connected: boolean;
  turnActive: boolean;
  onControl(kind: "recovery" | "ending"): Promise<void>;
}) {
  const [pending, setPending] = useState<"recovery" | "ending">();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const busy = useRef(false);
  const group = useRef<HTMLDivElement>(null);

  const blocked = !connected
    ? "Reconnecting…"
    : turnActive
      ? "Wait for the running turn"
      : undefined;
  // run-view-130: while either turn is in flight neither control may be
  // activated, so the whole group disables together.
  const disabled = pending !== undefined || blocked !== undefined;
  const failed = reason === "failure";

  async function run(kind: "recovery" | "ending"): Promise<void> {
    if (busy.current || disabled) return;
    busy.current = true;
    setPending(kind);
    setError(undefined);
    setConfirming(false);
    try {
      await onControl(kind);
      // The turn is away and the controls are about to disable
      // themselves: focus belongs where the next thing happens
      // (DR-010 §6).
      group.current
        ?.closest('[data-testid="captain-column"]')
        ?.querySelector("textarea")
        ?.focus();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      busy.current = false;
      setPending(undefined);
    }
  }

  const tone = failed
    ? "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
    : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200";
  const controlClass = `${CONTROL_WIDTH} shrink-0 rounded-md border px-2.5 py-1 text-center font-medium disabled:opacity-40 ${
    failed
      ? "border-red-300 hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-900"
      : "border-amber-300 hover:bg-amber-100 dark:border-amber-700 dark:hover:bg-amber-900"
  }`;

  return (
    <section
      aria-label={failed ? "Failed workflow" : "Workflow waiting for you"}
      data-testid="failed-workflow"
      data-reason={reason}
      title={
        [
          playbookId ? `playbook: ${playbookId}` : undefined,
          state ? `state: ${state}` : undefined,
        ]
          .filter(Boolean)
          .join(" · ") || undefined
      }
      className={`rounded-md border px-3 py-2 text-sm ${tone}`}
    >
      {/* The row yields as the pane narrows (DR-041): the words own the
          slack, and the controls wrap under them as one group rather
          than splitting — a pair that wrapped independently is the
          stray-control failure DR-041 §9 was written against. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <div className="min-w-0 flex-1 basis-40">
          <p data-testid="failed-workflow-what">
            {failed
              ? command
                ? `The /${command} workflow failed and is waiting for you.`
                : "The workflow failed and is waiting for you."
              : command
                ? `The /${command} workflow is waiting for your answer.`
                : "The workflow is waiting for your answer."}
          </p>
          <p className="text-neutral-600 dark:text-neutral-400">
            {failed
              ? "Retry runs the workflow's own recovery. Drop ends the run."
              : "Answer below. Drop ends the run."}
          </p>
        </div>
        <div
          ref={group}
          className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-x-2 gap-y-1"
        >
          {failed ? (
            <button
              type="button"
              data-testid="failed-workflow-retry"
              disabled={disabled || confirming}
              aria-busy={pending === "recovery" || undefined}
              title={blocked ?? "Run the recovery this workflow offers."}
              onClick={() => void run("recovery")}
              className={controlClass}
            >
              {pending === "recovery" ? "Retrying…" : "Retry"}
            </button>
          ) : null}
          {confirming ? (
            // DR-010 §4: ending a run is the Boss's ruling, so it
            // asks in place. Keep backs out having sent nothing.
            <>
              <span data-testid="failed-workflow-confirm-ask">Drop it?</span>
              <button
                type="button"
                data-testid="failed-workflow-drop-confirm"
                disabled={disabled}
                onClick={() => void run("ending")}
                className={controlClass}
              >
                {pending === "ending" ? "Dropping…" : "Drop"}
              </button>
              <button
                type="button"
                data-testid="failed-workflow-drop-keep"
                disabled={disabled}
                onClick={() => setConfirming(false)}
                className={controlClass}
              >
                Keep
              </button>
            </>
          ) : (
            <button
              type="button"
              data-testid="failed-workflow-drop"
              disabled={disabled}
              title={blocked ?? "End this run. It will not be resumed."}
              onClick={() => setConfirming(true)}
              className={controlClass}
            >
              Drop
            </button>
          )}
        </div>
      </div>
      {pending !== undefined ? (
        <p className="sr-only" role="status">
          {pending === "recovery"
            ? "Retrying the workflow"
            : "Dropping the workflow"}
        </p>
      ) : null}
      {error ? (
        <p
          data-testid="failed-workflow-error"
          className="mt-1 text-neutral-600 dark:text-neutral-400"
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}
