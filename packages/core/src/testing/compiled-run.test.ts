// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The substitute judge of the compiled-fixture journey reads what
// Playbook's own renderer declares: each case builds its judgment's
// outcome list with `renderGovernedOutcomeContract`, so a change in
// that rendering fails here before it parks the journey's run.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  renderGovernedOutcomeContract,
  type XStateGovernedOutcomeSpec,
} from "@sublang/playbook/xstate-runtime";

import { declaredOutcomes, judgeDeclaredOutcome } from "./compiled-run.js";

type Declared = [guard: string, description: string, outcome: XStateGovernedOutcomeSpec];

/** A judgment as Playbook composes it: the player's output, then the
 * declared outcomes in their order. */
function judgment(role: string, output: string, outcomes: Declared[]): string {
  return [
    "This is hidden control work. Do not call tools, inspect files, or seek external evidence.",
    `The ${role} role just produced this output:`,
    "",
    "```",
    output,
    "```",
    "",
    "Pick exactly one declared `guard` and reply with exactly that outcome's reply shape below: `guard` plus its semantic-owned fields and nothing else.",
    "",
    ...outcomes.flatMap(([guard, description, outcome]) =>
      renderGovernedOutcomeContract(guard, description, outcome),
    ),
  ].join("\n");
}

const unchanged = (fields: XStateGovernedOutcomeSpec["fields"] = {}): XStateGovernedOutcomeSpec => ({
  fields,
  repositoryDisposition: "unchanged",
});

test("the judge takes the committed change over a question for the Boss", () => {
  const prompt = judgment("coder", "Added NOTES.md and committed it.\n- `done` in my own words", [
    [
      "needsBossReply",
      "Coder needs the Boss to answer a question. Output shall include `question: <verbatim final text>`.",
      unchanged({ question: "presentation" }),
    ],
    [
      "done",
      "Coder modified the code for the input task and committed it.",
      { fields: {}, repositoryDisposition: "one-descendant-commit" },
    ],
  ]);
  // The player's own output never counts as a declared outcome.
  assert.deepEqual(declaredOutcomes(prompt).map((outcome) => outcome.guard), ["needsBossReply", "done"]);
  assert.equal(judgeDeclaredOutcome(prompt), JSON.stringify({ guard: "done" }));
});

test("the judge takes the review that raises no findings", () => {
  const prompt = judgment("reviewer", "No findings.", [
    [
      "findings",
      "Reviewer raised findings to hand back to Coder. Output shall include `reviewFindings: <verbatim final text>`.",
      unchanged({ reviewFindings: "presentation" }),
    ],
    ["noFindings", "Reviewer raised no reasonable findings.", unchanged()],
  ]);
  assert.equal(judgeDeclaredOutcome(prompt), JSON.stringify({ guard: "noFindings" }));
});

test("the judge gives a straight outcome's semantic members the player's output", () => {
  const prompt = judgment("reviewer", "Looks right.", [
    ["disagree", "Reviewer disagrees and argues its case.", unchanged()],
    [
      "approved",
      "Reviewer approves the commit. Output shall include `summary: <one line>`.",
      unchanged({ summary: "semantic" }),
    ],
  ]);
  assert.equal(judgeDeclaredOutcome(prompt), JSON.stringify({ guard: "approved", summary: "Looks right." }));
});

test("the judge blocks when every outcome turns aside", () => {
  const prompt = judgment("coder", "I need to know which file.", [
    ["needsBossReply", "Coder asks the Boss a question.", unchanged()],
    ["failed", "Coder could not complete the task.", unchanged()],
  ]);
  assert.deepEqual(JSON.parse(judgeDeclaredOutcome(prompt)), {
    blocked: "the substitute judge found no straight outcome among needsBossReply, failed",
  });
});
