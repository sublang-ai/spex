// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The failure catalogue (run-view-147, DR-075): one table turning
// Playbook's closed failure codes into the words the interface says.
// The runtime decides what failed and states it as `{ code, evidence }`
// (Playbook DR-063); this file only phrases it, so no model stands
// between the facts and the reader, and no surface composes its own
// account of a failure.
//
// The voice is DR-069's: a phrase where it applies, never a sentence
// explaining what a control already shows. A `bossStep` names what the
// Boss does outside Spex, and exists only where something out there
// answers the failure.

import type { FailureCause } from "@sublang/spex-core/protocol";

import { failureRemedy, humanizeId, plainFailure } from "./labels.js";

/** Playbook's closed failure-code list (Playbook DR-063 §1). Adopting
 * Playbook 14.1 replaces this constant with that package's own export;
 * until it is installed the list is held here, so the coverage test
 * still checks the catalogue against the contract rather than against
 * itself. */
export const PLAYBOOK_FAILURE_CODES = [
  "commit-missing",
  "commit-residual",
  "pre-existing-lost",
  "commits-more-than-one",
  "history-rewritten",
  "foreign-change",
  "observation-unstable",
  "attribution-ambiguous",
  "receipt-missing",
  "judge-failed",
  "player-failed",
  "aborted",
  "child-failed",
  "runtime-defect",
] as const;

export type Evidence = Record<string, unknown> | undefined;

/** One code's words: the phrase that says why, and what the Boss can
 * do about it outside Spex. */
export interface FailureRow {
  phrase(evidence: Evidence): string;
  bossStep?(evidence: Evidence): string | undefined;
}

// ---------------------------------------------------------------------------
// Reading the evidence
// ---------------------------------------------------------------------------

const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;

const object = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

/** A short commit id: the reader recognizes a commit by its head. */
const shortOid = (value: unknown): string | undefined =>
  text(value)?.slice(0, 8);

/** The named path lists, printed as one comma-separated run with the
 * omitted count the runtime bounded them by (Playbook DR-063 §1: every
 * list is sorted, unique, capped, with `truncated` carrying the rest).
 * Paths only — the evidence never holds content. */
function paths(evidence: Evidence, ...keys: string[]): string {
  const holder = object(evidence?.paths);
  const list: string[] = [];
  for (const key of keys) {
    const entries = holder?.[key];
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const path = text(entry);
      if (path && !list.includes(path)) list.push(path);
    }
  }
  const omitted = holder?.truncated;
  const more =
    typeof omitted === "number" && Number.isFinite(omitted) && omitted > 0
      ? Math.trunc(omitted)
      : 0;
  if (more > 0) list.push(`… and ${more} more`);
  return list.join(", ");
}

/** The count a path list stands for, the omitted included. */
function pathCount(evidence: Evidence, ...keys: string[]): number {
  const holder = object(evidence?.paths);
  const seen = new Set<string>();
  for (const key of keys) {
    const entries = holder?.[key];
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const path = text(entry);
      if (path) seen.add(path);
    }
  }
  const omitted = holder?.truncated;
  return (
    seen.size +
    (typeof omitted === "number" && Number.isFinite(omitted) && omitted > 0
      ? Math.trunc(omitted)
      : 0)
  );
}

/** `<phrase>: <detail>` where a detail was given, the phrase alone
 * where none was — an empty evidence never leaves a dangling colon. */
const withDetail = (phrase: string, detail: string | undefined): string =>
  detail ? `${phrase}: ${detail}` : phrase;

/** The agent an evidence names, for a step that speaks to it. */
const agentOf = (evidence: Evidence): string | undefined =>
  text(evidence?.playerId) ?? text(evidence?.roleId);

// ---------------------------------------------------------------------------
// The catalogue
// ---------------------------------------------------------------------------

export const FAILURE_CATALOGUE: Record<string, FailureRow> = {
  "commit-missing": {
    phrase: (evidence) => {
      const count = pathCount(evidence, "uncommitted");
      return count === 0
        ? "Committed nothing"
        : withDetail(
            `Changed ${count} file${count === 1 ? "" : "s"} without committing`,
            paths(evidence, "uncommitted"),
          );
    },
    bossStep: (evidence) =>
      pathCount(evidence, "uncommitted") > 0
        ? "Commit or discard them"
        : undefined,
  },
  "commit-residual": {
    phrase: (evidence) => {
      const oid = shortOid(evidence?.commitOid);
      return withDetail(
        oid
          ? `Committed ${oid} but left changes uncommitted`
          : "Committed, but left changes uncommitted",
        paths(evidence, "uncommitted", "altered"),
      );
    },
    bossStep: () => "Commit or discard what is left",
  },
  "pre-existing-lost": {
    phrase: (evidence) =>
      withDetail(
        "Uncommitted changes you had were lost",
        paths(evidence, "lost"),
      ),
    bossStep: () => "Recover them from your editor's history, if it keeps one",
  },
  "commits-more-than-one": {
    phrase: () => "Made more than one commit",
    bossStep: () => "Squash or reset them yourself",
  },
  "history-rewritten": {
    phrase: (evidence) =>
      withDetail("Rewrote history", shortOid(evidence?.baselineHead)
        ? `${shortOid(evidence?.baselineHead)} is no longer an ancestor`
        : undefined),
    bossStep: () => "Restore the branch yourself",
  },
  "foreign-change": {
    phrase: (evidence) =>
      withDetail(
        "Changed the repository in a step that changes nothing",
        paths(evidence, "changed"),
      ),
  },
  "observation-unstable": {
    phrase: () => "Couldn't read the repository's state",
  },
  "attribution-ambiguous": {
    phrase: () => "Changes could not be attributed to the step",
  },
  "receipt-missing": {
    phrase: () => "The step left no record of what it changed",
  },
  "judge-failed": {
    phrase: (evidence) =>
      withDetail("Couldn't judge the result", text(evidence?.reason)),
  },
  "player-failed": {
    // The adapter's own plain phrase (run-view-2): one mapping of
    // known runtime messages serves the thread's failure lines and
    // this catalogue alike.
    phrase: (evidence) => {
      const who = agentOf(evidence);
      const error = text(evidence?.error);
      const said = error ? plainFailure(error).text : undefined;
      return withDetail(who ? `${who} failed` : "An agent failed", said);
    },
    bossStep: (evidence) => {
      const error = text(evidence?.error);
      const remedy = error ? failureRemedy(error) : undefined;
      if (!remedy) return undefined;
      const who = agentOf(evidence);
      return remedy === "Sign in again with that agent's CLI" && who
        ? `Sign in to ${who} again`
        : remedy;
    },
  },
  aborted: {
    phrase: () => "Stopped before it finished",
  },
  "child-failed": {
    // The child's own cause is the reason this run failed, so it is
    // phrased rather than named (Playbook DR-063 §2).
    phrase: (evidence) => {
      const playbookId = text(evidence?.playbookId);
      const child = causePhrase(readCause(evidence?.cause));
      return withDetail(
        playbookId ? `/${playbookId} failed` : "A nested workflow failed",
        child,
      );
    },
    bossStep: (evidence) => causeStep(readCause(evidence?.cause)),
  },
  "runtime-defect": {
    phrase: (evidence) =>
      withDetail("A Playbook defect", text(evidence?.reason)),
    bossStep: () => "Report it",
  },
};

// ---------------------------------------------------------------------------
// Reading a cause off a record, and phrasing it
// ---------------------------------------------------------------------------

/** A cause as a record carries it, or nothing (DR-075). The shape is
 * the runtime's, so anything that is not `{ code: string }` is dropped
 * rather than half-read. */
export function readCause(value: unknown): FailureCause | undefined {
  const holder = object(value) as
    | { code?: unknown; evidence?: unknown }
    | undefined;
  if (!holder || typeof holder.code !== "string" || holder.code === "") {
    return undefined;
  }
  const evidence = object(holder.evidence);
  return { code: holder.code, ...(evidence ? { evidence } : {}) };
}

/** The failure a record's data reports (run-view-147, DR-075): the
 * runtime marks the error it fails on, so the record carries
 * `lastError` with its message and its structured cause. Absent where
 * the record reports no failure of its own — the card is drawn for a
 * failure the runtime stated, never for any line that looks like one.
 * A record from before the cause existed still reports its failure,
 * with the runtime's message and no cause. */
export function readRecordFailure(
  data: unknown,
): { cause?: FailureCause; message?: string } | undefined {
  const holder = object(data);
  if (!holder) return undefined;
  const lastError = object(holder.lastError);
  const cause = readCause(lastError?.cause) ?? readCause(holder.cause);
  if (!lastError && !cause) return undefined;
  const message = text(lastError?.message) ?? text(holder.message);
  return { ...(cause ? { cause } : {}), ...(message ? { message } : {}) };
}

/** Why the run failed, in the catalogue's words. A code with no row —
 * which the coverage test forbids for every code Playbook exports —
 * reads as its own humanized id rather than as nothing. */
export function causePhrase(cause: FailureCause | undefined): string | undefined {
  if (!cause) return undefined;
  const row = FAILURE_CATALOGUE[cause.code];
  return row ? row.phrase(cause.evidence) : humanizeId(cause.code);
}

/** What the Boss does about it outside Spex, where anything answers it. */
export function causeStep(cause: FailureCause | undefined): string | undefined {
  if (!cause) return undefined;
  return FAILURE_CATALOGUE[cause.code]?.bossStep?.(cause.evidence);
}

// ---------------------------------------------------------------------------
// An advertised control's standing
// ---------------------------------------------------------------------------

/** Playbook's standing reasons, phrased (Playbook DR-063 §3). An
 * unreported reason reads as its humanized id, so a reason this
 * catalogue has not met still says something true. */
const STANDING_REASONS: Record<string, string> = {
  "receipt-complete": "nothing has changed since it failed",
};

export function standingReason(reason: string | undefined): string | undefined {
  const key = text(reason);
  if (!key) return undefined;
  return STANDING_REASONS[key] ?? humanizeId(key);
}

/** What one advertised control's standing says, as the what-now line
 * and the control's tooltip read it: `<label>: <reason>` for a control
 * that would do nothing, and nothing at all for one that is ready. */
export function standingLine(action: {
  label: string;
  standing?: "ready" | "no-op" | "blocked";
  reason?: string;
}): string | undefined {
  if (!action.standing || action.standing === "ready") return undefined;
  const why =
    standingReason(action.reason) ??
    (action.standing === "no-op" ? "it would do nothing" : "it can't run now");
  return `${action.label}: ${why}`;
}
