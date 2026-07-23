<!-- Vendored from sublang-ai/playbook reference/sdlc/discuss.md (DR-015):
     the published package omits this source; sync when adopting a
     new @sublang/playbook release. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Discuss

Players:

- Host
- Participant
- Committer = Host | Participant

When Boss gives a topic, Captain shall relay it to both players concurrently and independently, without waiting for either proposal before asking the other, along with the following prompt:

> Assess whether Boss's topic above is better expressed as a few spec items (per @specs/meta.md) or requires one or more DRs added to @specs/decisions/.
> Consult @specs/map.md, if necessary, to find relevant context.
> Each DR should be coherent and focused.
> Propose your design in reply.
> DRs, if any, need not include full detail here — describe the key points at a high level.
> Don't change any code.

The initial discussion shall go round by round.
In each round, Captain shall prompt both players concurrently.
Both players each shall make a new proposal using only the completed proposals from the previous round; neither shall see the other's current-round result before replying.
Captain shall join both results before beginning the next round, using the following prompt:

> Consider the other agent's proposal below.
> (1) If there are essentially different points (including creation or division of DRs), list them, accept any reasonable ones, and challenge the rest with strong reasoning, solid evidence, and comprehensive thinking — make your argument.
> (2) Only if your proposal of the previous round is equivalent to the other's, with nothing to reconcile, state the end of initial discussion.
> Don't change any code.

A Boss interrupt into parallel discussion shall restart the whole initial-proposal or reconciliation round so both independent branches receive one coherent prior-round input. An individual branch that asks Boss a question may still resume on its own; branch working states are not Boss-interrupt destinations.

When both players state the end of initial discussion, Captain shall ask Host to write spec items or DRs according to the agreement, along with the following prompt:

> Update @specs/map.md to reflect your changes (if any) when done.

When Committer commits at the end of the initial discussion, or when Host addresses findings with changes, Captain shall ask Participant to review the spec changes in a round, without waiting for Boss.
In the first step of each round, Participant shall review the latest changes, address any rebuttals, and raise any findings.
In the second step of each round, Host shall address any findings.
Rounds continue until Participant raises no findings.

While any new or updated spec item (under @specs/user, @specs/dev or @specs/test) is under review, Captain shall include the following prompt for Participant:

> Verify any new or updated spec items are:
>
> - Complete & coherent: sufficient for you to reimplement code.
> - Right level: user requirements (in @specs/user) or system behavior (in @specs/dev), not implementation specifics; integration/system testing (in @specs/test), not unit testing.
> - Minimal: essential and concise; every item earns its place; also check with other items.
> - Well organized: spec packages are finely scoped, with high cohesion and low coupling.
>
> Flag anything missing, redundant, over-specified, or under-specified.

While any new or updated DR is under review, Captain shall include the following prompt for Participant:

> Review any new/updated decision following @specs/meta.md (reread if necessary).
> Flag any issues or propose any design suggestions (numbered; no duplication), with strong reasoning and evidence.
> Key statements must be backed by references unless they are common sense or widely acknowledged best practices.
>
> If the decision is well-thought-out and well-written, don't raise nitpicks.
> Remember to keep the DR simple and minimal.

When Participant begins any review, Captain shall include the following prompt:

> Think thoroughly — don't just approve or reject.
> For context discovery, consult @specs/map.md; @specs/meta.md describes the spec format.
> Verify @specs/map.md reflects the changes.
> If the change is ready to commit or push, don't raise nitpicks.
> Do not edit files or commit; report findings only.

When Participant raises any findings, Captain shall relay them to Host along with the following prompt:

> For each review item below for the above changes, challenge or accept it, with strong reasoning, solid evidence, and comprehensive thinking.
> Stage all current changes that belong in the repo before making any edits, and leave your edits unstaged/untracked.

When Host raises any rebuttals, Captain shall relay them to Participant along with the following prompt:

> For each rebuttal below, challenge or accept it, with strong reasoning, solid evidence, and comprehensive thinking.

When the spec items or DRs are written at the end of the initial discussion, or Participant raises no findings on uncommitted changes, Captain shall ask Committer to commit with the following prompt:

> Then make a commit of the changes that belong in the repo, following @specs/dev/git.md (reread if necessary).
> Write the commit message concisely.
> Host is \<host-llm\>.
> Participant is \<participant-llm\>.

`<*-llm>` shall be the conventional human form of the substituted ID (e.g., `claude-opus-4-7` → `Claude-Opus-4.7`, `gpt-5.5` → `GPT-5.5`).
