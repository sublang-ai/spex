---
name: code
description: Implements a coding request as a sequence of single-commit phases, then has the whole change reviewed once. A small change is one phase; a larger one is first planned as an intent record (IR) with one-commit tasks, then built task by task. Use when the user asks to implement, fix, change or continue work in a repository and wants committed, reviewed results. Not for design decisions with no code (use decide) or for reviewing existing commits (use review).
license: Apache-2.0
compatibility: Requires git and the review skill installed beside this one. Works best with an agent that can run subagents. The bundled prompts assume a Spex-scaffolded repository (specs/map.md, specs/meta.md, specs/intents/, specs/packages/git.md). Not for a folder where Spex already places its own skills named code and review, which start the playbooks instead.
metadata:
  author: sublang-ai
  version: "1.1.0"
---

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Code

Turn a coding request into reviewed commits: one commit per phase, one review at the end.

## Roles

You are the **Captain**: you relay prompts, read replies and decide the next phase.
You never write code or commit yourself.

| Role | Does | Run as |
| --- | --- | --- |
| Coder | Plans, implements, tests and commits each phase | One subagent, continued across phases when the host allows it |

Without subagents, play the Coder yourself, one phase at a time, and say so in your final report.

## Input

The caller supplies a coding request with any relevant context.
Keep it verbatim; every phase and the review receive it unchanged.

## Workflow

### Step 1: Run the first phase

Record the current revision (`git rev-parse HEAD`).
Send the Coder the *first phase* prompt followed by the *every phase* instruction, both from [references/coder-phases.md](references/coder-phases.md), with the request and any run results quoted as that file shows.

### Step 2: Judge the phase

Decide from what the Coder's reply affirmatively establishes, never from its format.
A statement that a commit was made does not by itself establish an outcome.

| Outcome | Applies to | Next |
| --- | --- | --- |
| Direct implementation: the change is complete in this commit | a new intent | Step 4 |
| New IR: the Coder wrote an IR and implemented none of its tasks | a new intent | Step 3 |
| More tasks: an IR task is done and another is unfinished | an IR task | Step 3 |
| Final task: the IR's last unfinished task is done | an IR task | Step 4 |
| A question the Coder needs answered | any phase | Ask the user, relay the answer, and let the same phase finish; it commits only then |

Learn the phase's commit from the repository, not the reply: exactly one new commit since the revision you last recorded.
Keep every phase's commit in order; together they are this run's *code-owned commits*.
If the evidence is contradictory or insufficient, or the repository shows no commit, several commits or a rewritten commit, stop and report a failure with the last code-owned commit.

### Step 3: Run the next IR task

Send the Coder the *later IR-task phase* prompt followed by the *every phase* instruction, with the request, the IR number and run results quoted.
Do not review between phases.
Return to Step 2.

### Step 4: Have the change reviewed once

Invoke the `review` skill with this input, the commits listed oldest first:

> Original intent: <caller-input>
> Review scope: every commit of this coding intent, namely <code-commits>, and its resulting repository state.
> Coder output: <coder-output>

For an IR, add:

> IR number: <ir-number>

The `review` skill owns every review round and every review-fix commit.
Use this run's Coder as its Coder.

### Step 5: Return the result

| The review | Return to the caller |
| --- | --- |
| Applies to the scope you gave, names the evaluated revision, and affirms no unsettled findings remain | The last code-owned commit, the evaluated revision, and that the review passed |
| Ends with unsettled findings, an abort or a result that does not establish the above | The failure and the last code-owned commit; start no further phase |
| Could not run or broke outside its own result contract | Stop as failed and report the error as it is, not as a review outcome |

## Rules that hold throughout

- Never rewrite an existing commit.
- One completed phase is one new commit; a phase waiting on the user's answer has none.
- Standalone documentation or status maintenance that implements no unfinished IR task is a new intent, even when it mentions a finished IR.

## Customizing

The Coder's instructions are plain files in `references/`.
Edit them to change how work is sized, which project conventions the Coder consults, or what a commit must contain.
