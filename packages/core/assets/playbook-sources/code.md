<!-- Vendored from sublang-ai/playbook reference/sdlc/code.md (DR-015):
     the published package omits this source; sync when adopting a
     new @sublang/playbook release. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Code

Players:

- Coder
- Reviewer
- Committer = Coder | Reviewer

## Coder

When Boss gives a coding intent, Captain shall relay it to Coder along with the following prompt:
> Assess whether this can be completed in a single commit, following best practices.
> If yes, implement and test, updating both code and specs; otherwise, decompose into tasks as a new IR under @specs/iterations and stop without implementing any IR task.
> For context discovery, @specs/map.md indexes all spec files and @specs/meta.md describes the spec format.
> Ensure @specs/map.md reflects the changes.
> Do not commit.
The resulting changes are regarded as Initial Changes.

When Reviewer raises any findings, Captain shall relay them to Coder along with the following prompt:
> For each review item below for the above changes, challenge or accept it, with strong reasoning, solid evidence, and comprehensive thinking.
> Stage all current changes that belong in the repo before making any edits, and leave your edits unstaged/untracked.

When a new IR or IR task passes review and is committed, Captain shall prompt Coder:
> Continue to implement IR-<#> if not all deliverables and tasks are done.
> Implement one task at a time (including corresponding tests if any).
> Stop after each task for review — do not commit yet.
> If relevant, mark progress in the IR.
The resulting changes are regarded as Initial Changes.

When an IR is done, Captain shall prompt Coder:
> Read IR-<#> and corresponding commits.
> According to @specs/meta.md, add or update spec items to fully capture:
>
> - the user requirements in @specs/user,
> - the system behavior in @specs/dev, and
> - the integration/system test cases in @specs/test.
>
> The spec items should be the *minimal* set needed to reimplement code without the IR.
> The set should be complete and coherent.
> Avoid implementation specifics.
> Avoid redundant spec items.
> Ensure @specs/map.md reflects the changes.

## Reviewer

For each finding in a review round, Coder either addresses it with changes or challenges it with a rebuttal.
Any code change to address findings starts a new round of review, even if some findings are also rebutted.
Rounds continue until Reviewer raises no findings.

When Reviewer begins the first review round on changes from a Boss coding intent, Captain shall relay the intent to Reviewer.

When Reviewer begins the first review round on changes from an IR task, Captain shall relay the IR's task description to Reviewer.

When Committer commits Initial Changes, Captain shall prompt Reviewer to begin a review round:
> Review the latest commit.
> Refer to the commit message.

When any changes are made by Coder but not reviewed (outside of any Initial Changes), Captain shall prompt Reviewer to begin a review round:
> Review the unstaged and untracked changes in the context of the staged changes.
> Understand the intent.

When Reviewer begins a review round involving @specs/user/, @specs/dev/, or @specs/test/, Captain shall prompt Reviewer:
> Verify any affected spec items are:
>
> - Complete & coherent: sufficient for you to reimplement code.
> - Right level: user requirements (in @specs/user) or system behavior (in @specs/dev), not implementation specifics; integration/system testing (in @specs/test), not unit testing.
> - Minimal: essential and concise; every item earns its place; also check with other items.
> - Well organized: spec packages are finely scoped, with high cohesion and low coupling.
>
> Flag anything missing, redundant, over-specified, or under-specified.

When Reviewer begins a review round involving any changes outside @specs/user/, @specs/dev/, and @specs/test/, Captain shall prompt Reviewer:
> Flag any issues or improvements (numbered; no duplication).
> Think thoroughly — don't just approve or reject.

When Reviewer begins any review round, Captain shall prompt Reviewer:
> For context discovery, @specs/map.md indexes all spec files and @specs/meta.md describes the spec format.
> Verify @specs/map.md reflects the changes.
> If the change is ready to commit or push, don't raise nitpicks.
> Do not edit files or commit; report findings only.

When Coder raises any rebuttals, Captain shall relay them to Reviewer along with the following prompt:
> For each rebuttal below, challenge or accept it, with strong reasoning, solid evidence, and comprehensive thinking.
> Do not edit files or commit; report findings only.

## Committer

When Coder makes any Initial Changes or Reviewer raises no findings on uncommitted changes, Captain shall prompt Committer:
> Make a commit of the changes that belong in the repo, following @specs/dev/git.md (reread if necessary).
> Write the commit message concisely.

When Captain prompts Committer and only Coder has played since the last commit, Captain shall also append:
> Coder is \<coder-llm\>.

When Captain prompts Committer and both Coder and Reviewer have played since the last commit, Captain shall also append:
> Coder is \<coder-llm\>; Reviewer is \<reviewer-llm\>.

When Captain prompts Committer, Captain shall also append:
> Format the `Co-authored-by` `<model>` token as the conventional human form of the substituted id (e.g., `claude-opus-4-7` → `Claude-Opus-4.7`, `gpt-5.5` → `GPT-5.5`).
