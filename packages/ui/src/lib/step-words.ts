// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The built-in playbooks' step and outcome words (run-view-180,
// localization-12): each step a player runs, keyed by its playbook and
// state id, a short name a person reads; each outcome its words; and
// the outcome fields the runtime itself writes from the repository —
// the only ones a return line shows. A playbook of one's own is not
// listed, so its ids read as their words. Playbook does not publish
// these yet: when it does, the run view reads them from there and this
// table goes.

import { i18n } from "../i18n.js";
import { humanizeId } from "./labels.js";

type Words = () => string;

/** Each built-in step a player runs, by playbook and state id. */
const STEPS: Record<string, Record<string, Words>> = {
  dev: {
    planAnalysis: () => i18n._({ id: "Plan the path", comment: "a step: the analyst chooses which workflows the request takes" }),
  },
  decide: {
    askCoderProposal: () => i18n._({ id: "Propose a design", comment: "a step: a player writes its own design proposal" }),
    askReviewerProposal: () => i18n._({ id: "Propose a design", comment: "a step: a player writes its own design proposal" }),
    synthesizeCommit: () => i18n._({ id: "Merge the proposals", comment: "a step: the coder merges both proposals into specs and commits" }),
  },
  code: {
    firstPhase: () => i18n._({ id: "Implement", comment: "a step: the coder implements the request" }),
    irTaskPhase: () => i18n._({ id: "Implement an IR task", comment: "a step: the coder implements the next task of an intent record" }),
  },
  review: {
    firstReview: () => i18n._({ id: "Review", comment: "a step: the reviewer reviews the change" }),
    fixFindings: () => i18n._({ id: "Fix the findings", comment: "a step: the coder fixes what the review found" }),
    reviewAfterFix: () => i18n._({ id: "Review the fixes", comment: "a step: the reviewer reviews the coder's fixes" }),
    reviewAfterRejection: () => i18n._({ id: "Review again", comment: "a step: the reviewer reviews again after the coder rejected the findings" }),
  },
  branch: {
    createBranch: () => i18n._({ id: "Create a branch", comment: "a step: the coder creates the work branch" }),
  },
  pr: {
    openPullRequest: () => i18n._({ id: "Open a pull request", comment: "a step: the coder opens the pull request" }),
  },
  inspect: {
    inspecting: () => i18n._({ id: "Inspect", comment: "a step: the inspector investigates the request" }),
  },
};

/** Each built-in outcome's words, by outcome id: what a return line
 * says the call came back with. */
const OUTCOMES: Record<string, Words> = {
  directCommit: () => i18n._({ id: "committed", comment: "a call's outcome: it committed its change" }),
  irCommit: () => i18n._({ id: "committed an IR", comment: "a call's outcome: it committed a new intent record" }),
  moreTasks: () => i18n._({ id: "committed a task", comment: "a call's outcome: it committed one task, more remain" }),
  finalTask: () => i18n._({ id: "committed the last task", comment: "a call's outcome: it committed the final task" }),
  committed: () => i18n._({ id: "committed", comment: "a call's outcome: it committed its change" }),
  hasFindings: () => i18n._({ id: "found problems", comment: "a call's outcome: the review raised findings" }),
  noFindings: () => i18n._({ id: "found no problems", comment: "a call's outcome: the review raised nothing" }),
  rejectedAll: () => i18n._({ id: "rejected the findings", comment: "a call's outcome: the coder rejected every finding" }),
  proposed: () => i18n._({ id: "proposed a design", comment: "a call's outcome: it gave its design proposal" }),
  discussionComplete: () => i18n._({ id: "closed the discussion", comment: "a call's outcome: no repository work follows" }),
  code: () => i18n._({ id: "chose /code", comment: "a call's outcome: the analyst chose the code path" }),
  decideThenCode: () => i18n._({ id: "chose /decide, then /code", comment: "a call's outcome: the analyst chose to decide before coding" }),
  codeViaPullRequest: () => i18n._({ id: "chose /code with a pull request", comment: "a call's outcome: the analyst chose to code and deliver by pull request" }),
  decideThenCodeViaPullRequest: () => i18n._({ id: "chose /decide, then /code with a pull request", comment: "a call's outcome: the analyst chose to decide, then code and deliver by pull request" }),
  branched: () => i18n._({ id: "created the branch", comment: "a call's outcome: the branch exists" }),
  refused: () => i18n._({ id: "refused", comment: "a call's outcome: the player declined the step" }),
  opened: () => i18n._({ id: "opened the pull request", comment: "a call's outcome: the pull request exists" }),
  notPublished: () => i18n._({ id: "did not publish", comment: "a call's outcome: no pull request was opened" }),
  completed: () => i18n._({ id: "finished the inspection", comment: "a call's outcome: the inspection is done" }),
  unavailable: () => i18n._({ id: "could not inspect", comment: "a call's outcome: the inspection could not run" }),
  needsBossReply: () => i18n._({ id: "asks you", comment: "a call's outcome: the player asked the Boss a question" }),
};

/** The outcome id that is a question to the Boss. */
export const QUESTION_OUTCOME = "needsBossReply";

/** The outcome fields the runtime writes from the repository's own
 * receipt rather than the judge (Playbook DR-045), by playbook and
 * state id — each a revision, read short. */
const EFFECT_FIELDS: Record<string, Record<string, readonly string[]>> = {
  decide: { synthesizeCommit: ["latestCommit"] },
  code: { firstPhase: ["latestCommit"], irTaskPhase: ["latestCommit"] },
  review: {
    firstReview: ["evaluatedRevision"],
    fixFindings: ["latestCommit"],
    reviewAfterFix: ["evaluatedRevision"],
    reviewAfterRejection: ["evaluatedRevision"],
  },
  branch: { createBranch: ["baseRevision"] },
};

/** Whether the table holds this step. */
export function knownStep(playbookId: string, stateId: string): boolean {
  return Object.hasOwn(STEPS, playbookId) && Object.hasOwn(STEPS[playbookId], stateId);
}

/** A step's short name: the table's words, else its id's. */
export function stepName(playbookId: string, stateId: string): string {
  return knownStep(playbookId, stateId)
    ? STEPS[playbookId][stateId]()
    : humanizeId(stateId);
}

/** An outcome's words: the table's for a built-in step, else its id's. */
export function outcomeWords(playbookId: string, stateId: string, outcome: string): string {
  return knownStep(playbookId, stateId) && Object.hasOwn(OUTCOMES, outcome)
    ? OUTCOMES[outcome]()
    : humanizeId(outcome);
}

/** The repository identities a step's output carries, in the table's
 * order, each read short; none for a step the table does not list. */
export function effectIdentities(
  playbookId: string,
  stateId: string,
  output: unknown,
): string[] {
  const fields = EFFECT_FIELDS[playbookId]?.[stateId] ?? [];
  if (!output || typeof output !== "object") return [];
  return fields
    .map((field) => (output as Record<string, unknown>)[field])
    .filter((value): value is string => typeof value === "string" && /^[0-9a-f]{7,64}$/u.test(value))
    .map((value) => value.slice(0, 7));
}
