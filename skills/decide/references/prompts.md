<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Decide prompts

Text in angle brackets is filled in by the Captain.

## Proposal

Sent to the Coder and the Reviewer concurrently.
Quote first:

> Original topic: <caller-topic>

Then the instruction:

```markdown
Assess whether the topic is better expressed as a few spec items under specs/packages/ or requires one or more DRs under specs/decisions/.
Propose your design.
Keep your proposal coherent, focused, and concise.
Consult specs/map.md for relevant context and specs/meta.md for spec requirements, if needed.
Do not change any files.
```

## Synthesis

Sent to the Coder once both proposals are complete.

```markdown
Synthesize your independent proposal with Reviewer's proposal below.
Keep to the original topic below and follow what it asks.
Keep the best, essential parts of either proposal and reject any point that is unsound, unnecessary, or outside the topic.
Turn the resulting design into the necessary DRs and/or spec items.
Follow specs/meta.md and update specs/map.md when needed.
Do not change code or implement the design.

Commit the result as one new commit, following specs/packages/git.md.
Make the commit message explain concisely what changed and why.
Identify every new commit you make.
Credit every AI that contributed to this commit: Coder <coder-model> and Reviewer <reviewer-model>, whose proposal it carries.
```

Quote after it:

> Original topic: <caller-topic>
> Reviewer's independent proposal: <reviewer-proposal>
