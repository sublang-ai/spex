// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The parked-run notice (run-view-128..130, run-view-112, DR-060,
// DR-062, DR-073, DR-075): a run standing parked on the Boss used to
// offer nothing to activate — the only way back was prose the Boss
// invented. The notice stands between the Captain pane and the
// composer and says in phrases why the run stopped, what the Boss can
// do about it outside Spex, and what each of its controls would do.
//
// One control per advertised action (DR-075): the run's own actions,
// each with its own label, and no interface notion of "a retry"
// choosing among them. An action the runtime calls a no-op or blocked
// stays visible and disabled with its reason phrased, so the Boss can
// see that it would do nothing rather than press it and find out.
// Where the summary publishes no actions — a session parked before
// this rule, or one whose controls were never captured — Drop stands
// alone and the composer is the other door.
//
// Drop stands on either park and ends the run through the shell's own
// give-up, which spends no model call, so the exit works when the
// provider is what failed.
//
// Drop sends one command and no more (run-view-112): a session serving
// an open intent is ruled on by that intent's close, which ends the run
// on the way; one serving none takes the ending control itself.
//
// The test ids read `failed-workflow`: they are held from the notice's
// first name so the browser journeys keep their grip on it.

import { useRef, useState } from "react";

import type {
  FailureCause,
  ParkedRun as ParkedRunSummary,
} from "@sublang/spex-core/protocol";

import { causePhrase, causeStep, standingLine } from "../lib/failure-catalogue.js";

/** The busy form is the longer word, so each control reserves its width
 * once and nothing reflows on activation (DR-041: a busy form never
 * widens its control). The reserve is measured against the busy form in
 * a real browser (run-view-132) — which is how 5.5rem was caught coming
 * up short of a busy word by a pixel and a half, and how 6rem was caught
 * holding "Dropping…" on one platform's fonts but not on the Linux
 * fonts CI renders with. It must clear the longest busy word — today
 * "Dropping…" and "Working…" — on the widest font the journey runs
 * under, not on the author's. */
const CONTROL_WIDTH = "min-w-[6.75rem]";

/** An advertised action's label is the runtime's, and a runtime's
 * label runs as long as the runtime's own state description ("Retry:
 * Coder is running the first coding phase: a direct implementation, a
 * new intent record, or an existing intent-record task" — 844px of
 * control in a 349px notice, with Drop pushed out of the box and the
 * visible part of the label no longer over the control). The control
 * is therefore bounded by the notice: it yields its width (no
 * `shrink-0`), never exceeds the line it wraps onto (`max-w-full`),
 * and the label ellipses at that width (`truncate`), with the whole
 * of it in the control's tooltip (run-view-128, DR-041). The reserve
 * CONTROL_WIDTH sets is also what lets the control yield at all: an
 * explicit `min-width` replaces a flex item's automatic minimum size,
 * so the control shrinks to the line and stops at the busy form's
 * reserve rather than at its own text. While the control is busy the
 * label stays in the box, invisible, holding the width its busy form
 * is laid over: a label longer than "Working…" cannot narrow on
 * activation, and one shorter than it is held by that same reserve
 * (run-view-130). */
const ACTION_WIDTH = "relative max-w-full";

/** What the notice activates: a recovery the parked run advertises,
 * named by its own id, or the shell's own ending. */
export type ParkedControl = { kind: "recovery" | "ending"; actionId?: string };

export function ParkedRun({
  reason,
  command,
  playbookId,
  state,
  parked,
  cause,
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
  /** The controls the session summary publishes for this run
   * (core-service-32); absent where that settlement captured none. */
  parked?: ParkedRunSummary;
  /** The cause the runtime attached to the failure, phrased by the
   * catalogue (run-view-147). */
  cause?: FailureCause;
  connected: boolean;
  turnActive: boolean;
  onControl(control: ParkedControl): Promise<void>;
}) {
  const [pending, setPending] = useState<string>();
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
  // Only a failure park has a recovery to advertise; a run waiting for
  // a reply carries Drop alone, its other door being the composer.
  const actions = failed ? (parked?.actions ?? []) : [];

  async function run(key: string, control: ParkedControl): Promise<void> {
    if (busy.current || disabled) return;
    busy.current = true;
    setPending(key);
    setError(undefined);
    setConfirming(false);
    try {
      await onControl(control);
      // The turn is away and the controls are about to disable
      // themselves: focus belongs where the next thing happens
      // (DR-010 §6).
      group.current
        ?.closest('[data-testid="captain-column"]')
        ?.querySelector("textarea")
        ?.focus();
    } catch (refusal) {
      setError(refusal instanceof Error ? refusal.message : String(refusal));
    } finally {
      busy.current = false;
      setPending(undefined);
    }
  }

  const tone = failed
    ? "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
    : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200";
  // Drop and its confirm carry fixed short words, so they hold their
  // width and stay whole; only an advertised action, whose label is
  // the runtime's, yields (DR-041).
  const fixed = "shrink-0";
  const controlClass = `rounded-md border px-2.5 py-1 text-center font-medium disabled:opacity-40 ${
    failed
      ? "border-red-300 hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-900"
      : "border-amber-300 hover:bg-amber-100 dark:border-amber-700 dark:hover:bg-amber-900"
  }`;

  // Why it stopped and what to do: the catalogue's phrase for the
  // cause the runtime attached, the Boss step where one exists, and
  // the standing of every control the summary published (DR-075).
  const why = failed ? causePhrase(cause) : undefined;
  const nextParts: string[] = [];
  const bossStep = failed ? causeStep(cause) : undefined;
  if (bossStep) nextParts.push(bossStep);
  for (const action of actions) {
    const standing = standingLine(action);
    if (standing) nextParts.push(standing);
  }
  if (!failed) nextParts.push("Answer below, or drop the run");
  else if (actions.length === 0) {
    // No recovery is published, so the composer is the way on
    // (run-view-128): the notice names it rather than leaving the
    // reader with Drop and no account of the other door.
    nextParts.push("Send a message to pick it up, or drop the run");
  }

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
          {why ? (
            <p
              data-testid="failed-workflow-why"
              className="text-neutral-600 dark:text-neutral-400"
            >
              {why}
            </p>
          ) : null}
          {nextParts.length > 0 ? (
            <p
              data-testid="failed-workflow-next"
              className="text-neutral-600 dark:text-neutral-400"
            >
              {nextParts.join(" · ")}
            </p>
          ) : null}
        </div>
        <div
          ref={group}
          // The group wraps under the words as one (DR-041 §9) and
          // yields with them: a group that could not shrink handed a
          // long-labelled control the whole of its own width and let it
          // out of the notice's box (run-view-128).
          className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-1"
        >
          {confirming
            ? null
            : actions.map((action) => {
                // A no-op or blocked action stays visible and disabled,
                // its reason in its tooltip: no control is chosen for
                // the Boss, and none is hidden from him (DR-075).
                const standing = standingLine(action);
                const inert =
                  action.standing === "no-op" || action.standing === "blocked";
                return (
                  <button
                    key={action.id}
                    type="button"
                    data-testid="failed-workflow-action"
                    data-action-id={action.id}
                    disabled={disabled || inert}
                    aria-busy={pending === action.id || undefined}
                    title={standing ?? blocked ?? action.label}
                    onClick={() =>
                      void run(action.id, { kind: "recovery", actionId: action.id })
                    }
                    className={`${CONTROL_WIDTH} ${ACTION_WIDTH} ${controlClass}`}
                  >
                    <span
                      className={`block truncate${
                        pending === action.id ? " invisible" : ""
                      }`}
                    >
                      {action.label}
                    </span>
                    {pending === action.id ? (
                      <span className="absolute inset-0 flex items-center justify-center">
                        Working…
                      </span>
                    ) : null}
                  </button>
                );
              })}
          {confirming ? (
            // DR-010 §4: ending a run is the Boss's ruling, so it
            // asks in place. Keep backs out having sent nothing.
            <>
              <span data-testid="failed-workflow-confirm-ask">Drop it?</span>
              <button
                type="button"
                data-testid="failed-workflow-drop-confirm"
                disabled={disabled}
                onClick={() =>
                  void run("ending", {
                    kind: "ending",
                    ...(parked?.ending ? { actionId: parked.ending.id } : {}),
                  })
                }
                className={`${CONTROL_WIDTH} ${fixed} ${controlClass}`}
              >
                {pending === "ending" ? "Dropping…" : "Drop"}
              </button>
              <button
                type="button"
                data-testid="failed-workflow-drop-keep"
                disabled={disabled}
                onClick={() => setConfirming(false)}
                className={`${CONTROL_WIDTH} ${fixed} ${controlClass}`}
              >
                Keep
              </button>
            </>
          ) : (
            <button
              type="button"
              data-testid="failed-workflow-drop"
              disabled={disabled}
              title={blocked ?? parked?.ending?.label ?? "End this run. It will not be resumed."}
              onClick={() => setConfirming(true)}
              className={`${CONTROL_WIDTH} ${fixed} ${controlClass}`}
            >
              Drop
            </button>
          )}
        </div>
      </div>
      {pending !== undefined ? (
        <p className="sr-only" role="status">
          {pending === "ending"
            ? "Dropping the workflow"
            : "Running the workflow's control"}
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
