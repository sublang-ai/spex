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
//
// Every phrase is a message of the catalog, composed when the row is
// read rather than when this module loads (localization-4), and every
// join is a message of its own: a language orders and punctuates
// "<phrase>: <detail>" its own way.

import type { FailureCause } from "@sublang/spex-core/protocol";

import { i18n } from "../i18n.js";
import { failureRemedy, humanizeId, plainFailure } from "./labels.js";

// The codes this catalogue must cover are Playbook's own closed list,
// reaching the interface as `PLAYBOOK_FAILURE_CODES` through the
// protocol boundary that reads it (core-service-49, DR-076). Nothing
// here restates it: the coverage test holds the catalogue against that
// export, so a code Playbook adds is a failing test until it has
// words.

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
  if (more > 0) {
    list.push(
      i18n._({
        id: "… and {count} more",
        values: { count: more },
        comment: "tail of a list the runtime cut short",
      }),
    );
  }
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

/** A phrase and what it stands on, joined — one message, so a language
 * may order or punctuate the join its own way. */
const joined = (label: string, why: string): string =>
  i18n._({
    id: "{label}: {why}",
    values: { label, why },
    comment: "a phrase followed by the detail it stands on",
  });

/** `<phrase>: <detail>` where a detail was given, the phrase alone
 * where none was — an empty evidence never leaves a dangling colon. */
const withDetail = (phrase: string, detail: string | undefined): string =>
  detail ? joined(phrase, detail) : phrase;

/** The agent an evidence names, for a step that speaks to it. */
const agentOf = (evidence: Evidence): string | undefined =>
  text(evidence?.playerId) ?? text(evidence?.roleId);

/** The adapter's own message, however the runtime attached it:
 * Playbook carries `{ name, message }` (Playbook DR-063 §1), and a
 * record from a runtime that carried a bare string still reads. */
const errorMessage = (value: unknown): string | undefined =>
  text(value) ?? text(object(value)?.message);

/** How much of an adapter's message the why line will carry: enough
 * for the provider's own sentence ("Selected model is at capacity.
 * Please try a different model."), and not so much that one runtime
 * message becomes the notice (run-view-147). */
const SAID_LIMIT = 120;

/** What the adapter said, in as many words as the line will hold: the
 * plain phrase where the message is one the runtime mapping knows
 * (run-view-2), and otherwise the message itself — a message no
 * pattern matches is the only account of the failure there is, so it
 * is printed rather than dropped, bounded to `SAID_LIMIT` with an
 * ellipsis. */
function adapterSaid(value: unknown): string | undefined {
  const message = errorMessage(value);
  if (!message) return undefined;
  const said = plainFailure(message).text;
  return said.length <= SAID_LIMIT
    ? said
    : `${said.slice(0, SAID_LIMIT - 1).trimEnd()}…`;
}

// ---------------------------------------------------------------------------
// The catalogue
// ---------------------------------------------------------------------------

export const FAILURE_CATALOGUE: Record<string, FailureRow> = {
  "commit-missing": {
    phrase: (evidence) => {
      const count = pathCount(evidence, "uncommitted");
      return count === 0
        ? i18n._("Committed nothing")
        : withDetail(
            i18n._(
              "{count, plural, one {Changed # file without committing} other {Changed # files without committing}}",
              { count },
            ),
            paths(evidence, "uncommitted"),
          );
    },
    bossStep: (evidence) =>
      pathCount(evidence, "uncommitted") > 0
        ? i18n._("Commit or discard them")
        : undefined,
  },
  "commit-residual": {
    phrase: (evidence) => {
      const oid = shortOid(evidence?.commitOid);
      return withDetail(
        oid
          ? i18n._("Committed {oid} but left changes uncommitted", { oid })
          : i18n._("Committed, but left changes uncommitted"),
        paths(evidence, "uncommitted", "altered"),
      );
    },
    bossStep: () => i18n._("Commit or discard what is left"),
  },
  "pre-existing-lost": {
    phrase: (evidence) =>
      withDetail(
        i18n._("Uncommitted changes you had were lost"),
        paths(evidence, "lost"),
      ),
    bossStep: () =>
      i18n._("Recover them from your editor's history, if it keeps one"),
  },
  "commits-more-than-one": {
    phrase: () => i18n._("Made more than one commit"),
    bossStep: () => i18n._("Squash or reset them yourself"),
  },
  "history-rewritten": {
    phrase: (evidence) => {
      const head = shortOid(evidence?.baselineHead);
      return withDetail(
        i18n._("Rewrote history"),
        head ? i18n._("{head} is no longer an ancestor", { head }) : undefined,
      );
    },
    bossStep: () => i18n._("Restore the branch yourself"),
  },
  "foreign-change": {
    phrase: (evidence) =>
      withDetail(
        i18n._("Changed the repository in a step that changes nothing"),
        paths(evidence, "changed"),
      ),
  },
  "observation-unstable": {
    phrase: () => i18n._("Couldn't read the repository's state"),
  },
  "attribution-ambiguous": {
    phrase: () => i18n._("Changes could not be attributed to the step"),
  },
  "receipt-missing": {
    phrase: () => i18n._("The step left no record of what it changed"),
  },
  "judge-failed": {
    // The runtime's reason names the step that failed ("judge
    // transport failed"); what the adapter said is why it did, so the
    // phrase carries both where both were attached.
    phrase: (evidence) => {
      const head = withDetail(
        i18n._("Couldn't judge the result"),
        text(evidence?.reason),
      );
      const said = adapterSaid(evidence?.error);
      return said
        ? i18n._({
            id: "{head} — {said}",
            values: { head, said },
            comment: "what failed, then what the agent said about it",
          })
        : head;
    },
  },
  "player-failed": {
    // The adapter's own plain phrase (run-view-2): one mapping of
    // known runtime messages serves the thread's failure lines and
    // this catalogue alike; a message it does not know is printed as
    // itself rather than swallowed (run-view-147).
    phrase: (evidence) => {
      const who = agentOf(evidence);
      return withDetail(
        who ? i18n._("{who} failed", { who }) : i18n._("An agent failed"),
        adapterSaid(evidence?.error),
      );
    },
    bossStep: (evidence) => {
      // A message no pattern matches answers to nothing outside Spex,
      // so it carries no step.
      const error = errorMessage(evidence?.error);
      const remedy = error ? failureRemedy(error) : undefined;
      if (!remedy) return undefined;
      const who = agentOf(evidence);
      // The remedy is recognized by its kind, never by its words: the
      // words are the catalog's and change with the language.
      return remedy.kind === "sign-in" && who
        ? i18n._("Sign in to {who} again", { who })
        : remedy.text;
    },
  },
  aborted: {
    phrase: () => i18n._("Stopped before it finished"),
  },
  "child-failed": {
    // The child's own cause is the reason this run failed, so it is
    // phrased rather than named (Playbook DR-063 §2).
    phrase: (evidence) => {
      const playbookId = text(evidence?.playbookId);
      const child = causePhrase(readCause(evidence?.cause));
      return withDetail(
        playbookId
          ? i18n._("/{playbookId} failed", { playbookId })
          : i18n._("A nested workflow failed"),
        child,
      );
    },
    bossStep: (evidence) => causeStep(readCause(evidence?.cause)),
  },
  "runtime-defect": {
    phrase: (evidence) =>
      withDetail(i18n._("A Playbook defect"), text(evidence?.reason)),
    bossStep: () =>
      i18n._({ id: "Report it", comment: "what to do about a Playbook defect" }),
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

/** Playbook's standing reasons, phrased (Playbook DR-063 §3), each a
 * thunk read at the moment it is shown (localization-4). An unreported
 * reason reads as its humanized id, so a reason this catalogue has not
 * met still says something true. */
const STANDING_REASONS: Record<string, () => string> = {
  "receipt-complete": () =>
    i18n._({
      id: "nothing has changed since it failed",
      comment: "why a control published by the parked run would do nothing",
    }),
};

export function standingReason(reason: string | undefined): string | undefined {
  const key = text(reason);
  if (!key) return undefined;
  return STANDING_REASONS[key]?.() ?? humanizeId(key);
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
    (action.standing === "no-op"
      ? i18n._({
          id: "it would do nothing",
          comment: "why a control is offered but inert",
        })
      : i18n._({
          id: "it can't run now",
          comment: "why a control is offered but blocked",
        }));
  // The label is the runtime's own word; only the join is ours.
  return joined(action.label, why);
}
