<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Reviewer prompts

The Captain assembles one prompt per round: an opener, the quoted context, then the every-round instruction.
Text in angle brackets is filled in by the Captain.

## Contents

- [Opener: first round](#opener-first-round)
- [Opener: after a review-fix commit](#opener-after-a-review-fix-commit)
- [Opener: every finding rejected](#opener-every-finding-rejected)
- [Every round](#every-round)

## Opener: first round

```markdown
A new review begins for the review scope.
Keep to the original intent and follow what it asks.
When the scope names commits, read each commit message for its context and rationale; otherwise use repository history and commit messages wherever they help establish that context.
```

Quote after it:

> Original request: <caller-input>

## Opener: after a review-fix commit

```markdown
A new review round begins for the review scope in the cumulative committed state, with particular attention to the latest review-fix commit.
Keep to the original intent and follow what it asks.
Read the latest review-fix commit's message and see Coder's feedback below.
```

Quote after it:

> Original request: <caller-input>
> Latest commit: <latest-commit>
> Coder output: <coder-output>

## Opener: every finding rejected

```markdown
No new commit was made because Coder rejected every finding.
See Coder's feedback below.
```

Quote after it:

> Original request: <caller-input>
> Coder output: <coder-output>

## Every round

In every round the quoted context also carries the original intent, the review scope and its context, and any relevant run results.
Append this instruction at the end of the prompt:

```markdown
Understand the full picture and think systematically about the underlying design.
Continue to identify issues or improvements, if any, without duplication.
Number the findings consistently across rounds.
Flag only what materially affects correctness, behavior, or spec quality — not style, equally valid alternatives, or theoretical threats.
For specs, flag stale, missing, over-specified, or under-specified ones, if any.
Avoid unnecessary complexity in code or tests, but flag any fundamental design flaw when leaving it would cost more in later patches than fixing it now.

If an issue represents a class of defect, find every instance within the review scope worth fixing rather than surfacing one or two per round, which drags out the review.
For any rebuttal, accept or challenge it.
Treat as settled, and do not raise again, any finding in this review rejected twice with reasoning.

Do not re-run tests or builds whose inputs have not changed since any previous reported run.
Do not edit files or commit; report findings only.

Consult specs/map.md for context if needed; verify it remains accurate.
Consult specs/meta.md for spec requirements if needed; verify affected specs follow it.
```

Finding numbers are references within one review only.
