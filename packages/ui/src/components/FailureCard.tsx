// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The failure card (run-view-2, run-view-147, DR-075): at the failure's
// place in the Captain thread, in place of the bare status line, three
// lines — what failed, why, and what now. Every word comes from data:
// the run's command and the step it left, the catalogue's phrase for
// the cause the runtime attached, the Boss step that cause carries,
// and the standing each published control reports. No model composes
// any of it, and the runtime's own message stays in the tooltip.

import type { ReactNode } from "react";

import type { FailureCause, ParkedRunAction } from "@sublang/spex-core/protocol";

import { causePhrase, causeStep, standingLine } from "../lib/failure-catalogue.js";
import { stateName } from "../lib/machine-labels.js";

/** What the thread knows about the run the failure belongs to
 * (run-view-147): its command, the step it failed in, and the controls
 * its session summary publishes. Every member is absent where the
 * record stream or the summary does not name it — the card then says
 * less rather than guessing. */
export interface FailureContext {
  /** The command a configured playbook gives the run; an identifier is
   * never dressed as one (DR-010 §2). */
  command?: string;
  /** The raw state the run left for its failure state — the step that
   * failed. The copy humanizes it, the tooltip keeps it. */
  step?: string;
  /** The parked run's advertised controls, as the session summary
   * publishes them (core-service-32). */
  actions?: readonly ParkedRunAction[];
}

/** The card's three lines, derived once so the run view and its tests
 * read the same words the thread draws. */
export function failureCardLines(
  cause: FailureCause | undefined,
  message: string | undefined,
  context: FailureContext | undefined,
): { what: string; why: string; next?: string; title?: string } {
  const step = context?.step ? stateName(context.step) : undefined;
  const command = context?.command ? `/${context.command}` : undefined;
  const what =
    command && step
      ? `${command} failed at ${step}`
      : command
        ? `${command} failed`
        : step
          ? `Failed at ${step}`
          : "The workflow failed";
  // The catalogue phrases the cause; a record from before the runtime
  // attached one falls back to the runtime's own words, spoken plain
  // (run-view-2).
  const why = causePhrase(cause) ?? message ?? "No reason was reported";
  // What now: the Boss step the cause carries, then what each
  // published control would do — a no-op named here is a control the
  // reader can see is pointless before pressing it (DR-075).
  const parts: string[] = [];
  const bossStep = causeStep(cause);
  if (bossStep) parts.push(bossStep);
  for (const action of context?.actions ?? []) {
    const standing = standingLine(action);
    if (standing) parts.push(standing);
  }
  // The runtime's own message and the raw state id ride the tooltip
  // and never the copy (DR-010 §2).
  const title =
    [message, context?.step ? `step: ${context.step}` : undefined]
      .filter(Boolean)
      .join(" · ") || undefined;
  return {
    what,
    why,
    ...(parts.length > 0 ? { next: parts.join(" · ") } : {}),
    ...(title ? { title } : {}),
  };
}

export function FailureCard({
  cause,
  message,
  context,
  count,
  extra,
}: {
  cause?: FailureCause;
  /** What the runtime said, which the why line falls back to and the
   * tooltip keeps either way. */
  message?: string;
  context?: FailureContext;
  /** Repeat folding, as the plain failure line carries it
   * (run-view-2). */
  count?: number;
  /** The readiness link a failure line offers while the Captain's
   * adapter is not ready (run-view-2). */
  extra?: ReactNode;
}) {
  const lines = failureCardLines(cause, message, context);
  return (
    <div
      data-testid="failure-card"
      title={lines.title}
      className="mx-auto flex max-w-[90%] flex-col gap-0.5 rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
    >
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span
          data-testid="failure-card-what"
          className="min-w-0 font-medium [overflow-wrap:anywhere]"
        >
          {lines.what}
        </span>
        {count !== undefined && count > 1 ? (
          <span
            data-testid="failure-count"
            title={`The same failure ${count} times in this turn`}
            className="shrink-0 font-medium"
          >
            <span aria-hidden="true">×{count}</span>
            <span className="sr-only">, {count} times</span>
          </span>
        ) : null}
        {extra}
      </div>
      <span
        data-testid="failure-card-why"
        className="min-w-0 [overflow-wrap:anywhere]"
      >
        {lines.why}
      </span>
      {lines.next ? (
        <span
          data-testid="failure-card-next"
          className="min-w-0 [overflow-wrap:anywhere] text-red-600/80 dark:text-red-300/80"
        >
          {lines.next}
        </span>
      ) : null}
    </div>
  );
}
