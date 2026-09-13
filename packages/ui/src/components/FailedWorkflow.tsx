// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The failed-workflow notice (run-view-128..130, DR-060): a workflow
// parked in its recoverable failure state used to offer nothing to
// activate — the only way back was prose the Boss invented. The notice
// stands between the Captain pane and the composer with one control,
// and says in words what that control does: it asks the Captain to run
// the workflow's own advertised recovery. It never claims to be the
// recovery, because until Playbook advertises its runtime actions to
// hosts the submission is an ordinary, visible Boss turn.

import { useRef, useState } from "react";

import { RECOVER_FAILED_WORKFLOW } from "../lib/labels.js";

/** The busy form is the longer word, so the control reserves its width
 * once and nothing reflows on activation (DR-041: a busy form never
 * widens its control). The reserve is measured against the busy form
 * in a real browser (run-view-132), which is how 5.5rem was caught
 * coming up short of "Retrying…" by a pixel and a half. */
const CONTROL_WIDTH = "min-w-[6rem]";

export function FailedWorkflow({
  command,
  playbookId,
  state,
  connected,
  turnActive,
  onSubmit,
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
  onSubmit(text: string): Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const busy = useRef(false);
  const control = useRef<HTMLButtonElement>(null);

  const blocked = !connected
    ? "Reconnecting…"
    : turnActive
      ? "Wait for the running turn"
      : undefined;
  const disabled = pending || blocked !== undefined;

  async function recover(): Promise<void> {
    if (busy.current || disabled) return;
    busy.current = true;
    setPending(true);
    setError(undefined);
    try {
      await onSubmit(RECOVER_FAILED_WORKFLOW);
      // The turn is away and the control is about to disable itself:
      // focus belongs where the next thing happens (DR-010 §6).
      control.current
        ?.closest('[data-testid="captain-column"]')
        ?.querySelector("textarea")
        ?.focus();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

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
      {/* The row yields as the pane narrows (DR-041): the words own
          the slack, the control wraps under them below about 22rem. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <div className="min-w-0 flex-1 basis-40">
          <p data-testid="failed-workflow-what">
            {command
              ? `The /${command} workflow failed and is waiting for you.`
              : "The workflow failed and is waiting for you."}
          </p>
          <p className="text-neutral-600 dark:text-neutral-400">
            Retry asks the Captain to run its recovery.
          </p>
        </div>
        <button
          ref={control}
          type="button"
          data-testid="failed-workflow-retry"
          disabled={disabled}
          aria-busy={pending || undefined}
          title={
            blocked ??
            "Send the Captain a request to run the workflow's advertised recovery."
          }
          onClick={() => void recover()}
          className={`ml-auto ${CONTROL_WIDTH} shrink-0 rounded-md border border-red-300 px-2.5 py-1 text-center font-medium hover:bg-red-100 disabled:opacity-40 dark:border-red-800 dark:hover:bg-red-900`}
        >
          {pending ? "Retrying…" : "Retry"}
        </button>
      </div>
      {pending ? (
        <p role="status" className="mt-1 text-xs">
          Asking the Captain to run the workflow's recovery…
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          data-testid="failed-workflow-error"
          className="mt-1 text-xs"
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}
