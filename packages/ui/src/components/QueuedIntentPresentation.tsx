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
import { i18n } from "../i18n.js";

const QUEUED_CLASS =
  "shrink-0 rounded-full bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400";

/** The exact phrase for a published scheduling standing. */
export function queueStandingPhrase(
  schedule: QueueSchedule,
): string | undefined {
  const failure = causePhrase(schedule.cause);
  switch (schedule.standing) {
    case "after-current-work":
      return i18n._({
        id: "after current work",
        comment: "queued row standing: it runs once the current work ends",
      });
    case "question-park":
      return i18n._({
        id: "waiting — your reply",
        comment: "queued row standing: the work ahead parked on a question",
      });
    case "failure-park":
      // One whole phrase per case, never a translated stem with a
      // cause glued on (localization-4).
      return failure
        ? i18n._("waiting — current work failed — {failure}", { failure })
        : i18n._("waiting — current work failed");
    case "failed":
      return failure
        ? i18n._("waiting — previous work failed — {failure}", { failure })
        : i18n._("waiting — previous work failed");
    case "stopped":
      return i18n._("waiting — previous work stopped");
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
  return foreignProject
    ? i18n._("after {title} ({project})", {
        title: blockedBy.title,
        project: foreignProject,
      })
    : i18n._("after {title}", { title: blockedBy.title });
}

/** The neutral lifecycle mark every committed queue row carries. */
export function QueuedMark({ testId }: { testId?: string }) {
  return (
    <span data-testid={testId} className={QUEUED_CLASS}>
      {i18n._({
        id: "Queued",
        comment: "lifecycle mark on every committed queue row (DR-077)",
      })}
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
