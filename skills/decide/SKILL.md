---
name: decide
description: Settles a design topic as written specs. Two roles propose a design independently and at the same time, one synthesizes both into decision records or spec items in a single commit, and the result is reviewed. Use when the user asks to decide, design or specify something before any code is written, or asks for a decision record or spec items on a topic. Not for implementing the design (use code).
license: Apache-2.0
compatibility: Requires git and the review skill installed beside this one. Independent proposals need an agent that can run subagents in parallel. The bundled prompts assume a Spex-scaffolded repository (specs/map.md, specs/meta.md, specs/decisions/, specs/packages/). Not for a folder where Spex already places its own skills named decide and review, which start the playbooks instead.
metadata:
  author: sublang-ai
  version: "1.1.0"
---

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Decide

Turn a topic into reviewed decision records or spec items, starting from two independent proposals.

## Roles

You are the **Captain**: you relay prompts, read replies and decide what happens next.
You never propose, edit files or commit yourself.

| Role | Does | Run as |
| --- | --- | --- |
| Coder | Proposes, then synthesizes both proposals and commits | A subagent, continued from its proposal to its synthesis |
| Reviewer | Proposes independently | A second subagent, started in the same turn as the Coder |

Without parallel subagents, write the two proposals in separate passes without rereading the first, and say in your final report that they were not independent.

## Input

The caller supplies the topic with any specific context.
Keep it verbatim.

## Workflow

### Step 1: Collect two independent proposals

Send the *proposal* prompt from [references/prompts.md](references/prompts.md) to the Coder and the Reviewer at the same time, with the complete topic quoted.
Do not wait for one proposal before requesting the other, and show neither role the other's proposal until both are complete.

A proposal is complete only when its author affirmatively provides a whole design; a progress report, a status update or a promise of a later proposal is not one.
Judge each reply from what it establishes, never from its format.
If the user interrupts while the pair is running, restart both with the resulting topic so they answer the same topic and stay independent.

### Step 2: Synthesize and commit

Record the current revision (`git rev-parse HEAD`).
Send the Coder the *synthesis* prompt from the same file, with the complete topic and the Reviewer's complete proposal quoted under their own labels.

Learn the result from the repository, not the reply: exactly one new commit since the recorded revision, the *decide-owned commit*.
If there is none, several, or a rewritten commit, stop and report a failure.

### Step 3: Have the decision reviewed

Invoke the `review` skill with this input:

> Original intent: <caller-topic>
> Review scope: the decide-owned commit <decide-commit> and its resulting repository state.
> Coder's independent proposal: <coder-proposal>
> Coder output: <coder-output>

Use this run's Coder and Reviewer as its Coder and Reviewer.

### Step 4: Return the result

| The review | Return to the caller |
| --- | --- |
| Applies to the scope you gave, names the evaluated revision, and affirms no unsettled findings remain | The decide-owned commit and the evaluated revision |
| Ends with unsettled findings, an abort or a result that does not establish the above | The failure and the decide-owned commit |
| Could not run or broke outside its own result contract | Stop as failed and report the error as it is, not as a review outcome |

## Customizing

Both prompts are in `references/prompts.md`.
Edit them to change what a proposal must cover or which records the synthesis may write.
