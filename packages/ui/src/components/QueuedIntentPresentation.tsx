// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The one queued-intent presentation (dashboard-59, DR-077): every
// consumer gets the same standing and after-link phrases. Start
// availability travels beside a published QueueSchedule; callers place
// the control where their surface owns it.

import type {
  DerivedIntent,
  ProjectInfo,
  QueueSchedule,
} from "@sublang/spex-core/protocol";

import { causePhrase } from "../lib/failure-catalogue.js";

const QUEUED_CLASS =
  "shrink-0 rounded-full bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400";

/** The exact phrase for a published scheduling standing. */
export function queueStandingPhrase(
  schedule: QueueSchedule,
): string | undefined {
  const failure = causePhrase(schedule.cause);
  switch (schedule.standing) {
    case "after-current-work":
      return "after current work";
    case "question-park":
      return "waiting — your reply";
    case "failure-park":
      return `waiting — current work failed${failure ? ` — ${failure}` : ""}`;
    case "failed":
      return `waiting — previous work failed${failure ? ` — ${failure}` : ""}`;
    case "stopped":
      return "waiting — previous work stopped";
    case "manual-ready":
      return undefined;
  }
}

/** The exact phrase for a queued row blocked by an after-link. */
export function queueAfterLinkPhrase(
  blockedBy: NonNullable<DerivedIntent["blockedBy"]>,
  ownerProjectId: string,
  projects: readonly ProjectInfo[],
): string {
  const foreignProject =
    blockedBy.projectId === ownerProjectId
      ? undefined
      : (projects.find((project) => project.id === blockedBy.projectId)?.name ??
        blockedBy.projectId);
  return `after ${blockedBy.title}${foreignProject ? ` (${foreignProject})` : ""}`;
}

/** The neutral lifecycle mark every committed queue row carries. */
export function QueuedMark({ testId }: { testId?: string }) {
  return (
    <span data-testid={testId} className={QUEUED_CLASS}>
      Queued
    </span>
  );
}

/** The shared visible phrase. A manual-ready standing renders nothing. */
export function QueueStandingPhrase({
  schedule,
  testId,
  className = "",
}: {
  schedule: QueueSchedule;
  testId?: string;
  className?: string;
}) {
  const phrase = queueStandingPhrase(schedule);
  return phrase ? (
    <span data-testid={testId} title={phrase} className={className}>
      {phrase}
    </span>
  ) : null;
}
