// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The failed-workflow notice (run-view-128..130, run-view-112, DR-060,
// DR-062): a workflow parked in its recoverable failure state used to
// offer nothing to activate — the only way back was prose the Boss
// invented. The notice stands between the Captain pane and the composer
// with two controls, and says in words what each does. Both are now
// deterministic: Retry runs the recovery the run itself advertises, and
// Drop ends the run through the shell's own give-up, which spends no
// model call — so the exit works when the provider is what failed.

import { useRef, useState } from "react";

export interface SessionControl {
  readonly id: string;
  readonly label: string;
}

/** The busy form is the longer word, so each control reserves its width
 * once and nothing reflows on activation (DR-041: a busy form never
 * widens its control). The reserve is measured against the busy form in
 * a real browser (run-view-132), which is how 5.5rem was caught coming
 * up short of "Retrying…" by a pixel and a half. */
const CONTROL_WIDTH = "min-w-[6rem]";

export function FailedWorkflow({
  command,
  playbookId,
  state,
  connected,
  turnActive,
  recovery,
  ending,
  onControl,
}: {
  /** The command that started the failed run, where a configured
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
  /** The recovery this run advertises, absent where it advertises none
   * — Retry then stands rather than being offered and refused
   * (run-view-128). */
  recovery?: SessionControl;
  /** The shell's own ending. Absent only where the session offers none. */
  ending?: SessionControl;
  onControl(kind: "recovery" | "ending", controlId: string): Promise<void>;
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

  async function run(kind: "recovery" | "ending", controlId: string): Promise<void> {
    if (busy.current || disabled) return;
    busy.current = true;
    setPending(kind);
    setError(undefined);
    setConfirming(false);
    try {
      await onControl(kind, controlId);
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

  const controlClass = `${CONTROL_WIDTH} shrink-0 rounded-md border border-red-300 px-2.5 py-1 text-center font-medium hover:bg-red-100 disabled:opacity-40 dark:border-red-800 dark:hover:bg-red-900`;

  return (
    <section
      aria-label="Failed workflow"
      data-testid="failed-workflow"
      title={[
        playbookId ? `playbook: ${playbookId}` : undefined,
        state ? `state: ${state}` : undefined,
      ]
        .filter(Boolean)
        .join(" · ") || undefined}
      className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
    >
      {/* The row yields as the pane narrows (DR-041): the words own the
          slack, and the controls wrap under them as one group rather
          than splitting — a pair that wrapped independently is the
          stray-control failure DR-041 §9 was written against. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <div className="min-w-0 flex-1 basis-40">
          <p data-testid="failed-workflow-what">
            {command
              ? `The /${command} workflow failed and is waiting for you.`
              : "The workflow failed and is waiting for you."}
          </p>
          <p className="text-neutral-600 dark:text-neutral-400">
            {recovery
              ? "Retry runs its recovery. Drop ends the run."
              : "Drop ends the run."}
          </p>
        </div>
        <div
          ref={group}
          className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-x-2 gap-y-1"
        >
          {recovery ? (
            <button
              type="button"
              data-testid="failed-workflow-retry"
              disabled={disabled || confirming}
              aria-busy={pending === "recovery" || undefined}
              title={blocked ?? `Run ${recovery.label}.`}
              onClick={() => void run("recovery", recovery.id)}
              className={controlClass}
            >
              {pending === "recovery" ? "Retrying…" : "Retry"}
            </button>
          ) : null}
          {ending ? (
            confirming ? (
              // DR-010 §4: ending a run is the Boss's ruling, so it
              // asks in place. Keep backs out having sent nothing.
              <>
                <span data-testid="failed-workflow-confirm-ask">Drop it?</span>
                <button
                  type="button"
                  data-testid="failed-workflow-drop-confirm"
                  disabled={disabled}
                  onClick={() => void run("ending", ending.id)}
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
            )
          ) : null}
        </div>
      </div>
      {pending !== undefined ? (
        <p className="sr-only" role="status">
          {pending === "recovery" ? "Retrying the workflow" : "Dropping the workflow"}
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
