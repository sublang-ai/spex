<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Coder disposition prompt

Sent to the Coder whenever the Reviewer raises or keeps a finding in round 1 or 2.
Text in angle brackets is filled in by the Captain; the model names go into the commit's credit line.

Quote first, together with the review scope, its context and any relevant run results:

> Original request: <caller-input>
> Reviewer findings: <reviewer-output>

Then the instruction:

```markdown
For each review item, accept or reject it.
Before deciding, understand the full picture and think systematically about the underlying design.
Keep to the original intent and follow what it asks.
Reject anything that is not essential or is not worth fixing now.
If you accept an item, fix its root cause, including any fundamental design flaw — do not patch around it; if it represents a class of defect, find every instance within the review scope worth fixing rather than addressing one or two per round, which drags out the review.
If you reject an item, give the reasoning and cite code or test output that supports it.
Do not re-run tests or builds whose inputs have not changed since any previous reported run.

If you accept any item, make minimal changes and add one new review-fix commit; never rewrite any existing commit.
Follow specs/packages/git.md.
Make the commit message explain concisely what changed and why, including relevant verification.
Identify every new commit you make.
Credit every AI that contributed to this commit: Coder <coder-model> and Reviewer <reviewer-model>, whose findings it answers.

If you reject every item, change nothing and make no commit.
Report every disposition, all relevant run results, and every rebuttal.
```
