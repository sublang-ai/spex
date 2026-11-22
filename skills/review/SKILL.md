---
name: review
description: Reviews committed work in up to three rounds. An independent Reviewer reports findings, a Coder accepts or rebuts each one and fixes the accepted ones in one new commit per round, until no unsettled findings remain. Use when the user asks to review commits, a branch or a finished change, or when another skill such as code or decide hands over its commits for review. Not for uncommitted work or for reviewing a pull request on a Git host.
license: Apache-2.0
compatibility: Requires git and a repository with committed work. Review independence needs an agent that can run subagents. The bundled prompts assume a Spex-scaffolded repository (specs/map.md, specs/meta.md, specs/packages/git.md). Not for a folder where Spex already places its own skill named review, which starts the playbook instead.
metadata:
  author: sublang-ai
  version: "1.0.0"
---

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Review

Run a bounded review of committed work and return whether any finding is left unsettled.

## Roles

You are the **Captain**: you relay prompts, read replies and decide what happens next.
You never review, edit files or commit yourself.

| Role | Does | Run as |
| --- | --- | --- |
| Reviewer | Reads the scope, reports findings, edits nothing | A subagent that has not seen the Coder's reasoning |
| Coder | Accepts or rejects each finding, fixes accepted ones | A subagent, or the agent that wrote the work under review |

Continue the same subagent for a role across rounds when the host allows it, so it keeps its context; otherwise start a fresh one and relay the previous round in full.
Without subagents, play each role yourself in turn and say in your final report that the Reviewer was not independent.

## Input

The caller supplies:

- the original intent;
- the review scope, in the caller's own words;
- optional context and run results.

If the scope is missing, names nothing committed, or does not end at the checked-out revision of the checked-out branch, ask the user what to review before starting.

## Workflow

### Step 1: Fix the scope

Record the caller's input verbatim, the checked-out branch (`git symbolic-ref --short -q HEAD`, empty when detached) and the checked-out revision (`git rev-parse HEAD`).
Resolve the scope to the revisions it names; it must end at the checked-out revision, and a branch it names must be the checked-out branch, since the Coder fixes and commits on what is checked out.
A scope naming another branch or revision is asked of the user first: check it out, or review what is checked out instead.
Never review one history and fix another.
The caller's scope is the baseline for every round.
Each review-fix commit joins the scope as it lands, so a later round reviews the cumulative committed state.

After every role's turn, read the branch and revision again.
A changed branch ends the run as a failed review.
A Reviewer's turn leaves the revision unchanged, and a Coder's adds at most one review-fix commit on top of the revision last recorded; any other move ends the run as a failed review.

### Step 2: Run a Reviewer round

Build the Reviewer's prompt from [references/reviewer-round.md](references/reviewer-round.md): the opener that matches this round, the quoted context it lists, then the every-round instruction.
Send it to the Reviewer and wait for the reply, then check the branch and revision are unchanged.

### Step 3: Judge the Reviewer's reply

Decide from what the reply establishes, never from its format or numbering.

| The reply | Next |
| --- | --- |
| Affirms the review is complete and no unsettled findings remain | Step 5, passed |
| Raises or keeps a finding, in round 1 or 2 | Step 4 |
| Raises or keeps a finding, in round 3 | Step 5, unsettled |
| Is a progress report, a status update or a promise of a later result | No outcome; ask the Reviewer to finish this round |

### Step 4: Get the Coder's disposition

Send the Coder the prompt in [references/coder-disposition.md](references/coder-disposition.md) with the quoted context it lists.
When the Coder returns, read the repository rather than the reply to learn what happened: compare the branch, `git rev-parse HEAD` and `git log` with what you last recorded.

- One new commit on the recorded branch whose parent is the revision you last recorded: record it as this round's review-fix commit and return to Step 2 with the *after a review-fix commit* opener.
- No new commit and every finding rejected: return to Step 2 with the *every finding rejected* opener.
- Anything else (several commits, a rewritten commit, or another branch or revision checked out): stop and report it to the caller as a failed review.

There are at most three Reviewer rounds: the first, and one more after each of at most two Coder dispositions.

### Step 5: Return the result

The evaluated revision is the one last recorded before the final Reviewer round, which `git rev-parse HEAD` must still read on the recorded branch; take it from the repository, not from either role's prose.

- **Passed**: return that exact revision and the fact that no unsettled findings remain within the scope.
- **Unsettled**: return that exact revision, the Reviewer's remaining findings, and the fact that unsettled findings remain within the scope. The Coder makes no further disposition.

## Customizing

The prompts each role receives are plain files in `references/`.
Edit them to change what the Reviewer looks for, what the Coder may reject, or which project conventions they consult.
