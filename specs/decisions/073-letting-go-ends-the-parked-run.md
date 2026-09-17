<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-073: Letting Go Ends The Parked Run

## Status

Accepted (2026-09-17) on the owner's report that a `/dev` run parked on the Analyst's question, Drop on its intent recorded the verdict and nothing else, and the next message reached that Analyst as its answer — "it began another playbook in a messy state".

Amends [DR-062](062-ending-a-failed-workflow.md), which remains accepted, in scope: dropping interrupted work is the whole ruling rather than a verdict alone, and the run's own control extends from a failed run to any run parked on the Boss.
Its deterministic Retry, the model-free give-up, the one-ruling gesture, the History tag, and every other contract of that record stand.

Amends [DR-060](060-failed-workflow-control.md), which remains accepted, in scope: the notice stands for a run parked on a question as it does for a run parked in its recoverable failure state.

Cites [DR-066](066-every-summons-has-a-door.md) for the law this record applies: every summons has a door, and a control is offered and its refusal reported.

## Context

- A run parked on a question is stuck in exactly the way a run parked in its failure state is: nothing moves until the Boss acts, and any ordinary message reaches the parked run as its answer.
- [DR-062](062-ending-a-failed-workflow.md) gave the failure park a door and said a verdict rules on the intent alone, leaving the run to "the conversation's own control".
  That control is the failed-workflow notice, which exists only for the failure state.
  A question park therefore had no control anywhere.
- Dropping such an intent recorded `close … dropped` and changed nothing else.
  The fold then reraised the same question as a session stand-in, the Now band read the dropped text as the session's latest Boss turn, and the only ways out left were prose the Captain had to read as a dismissal, or deleting the whole conversation.
- The defect is the split, not the missing control: a Drop taken on work whose run is parked is one act in the reader's hand and two rulings in the product's.

## Decision

**Drop takes the whole ruling.**
Where a client closes an open intent as `dropped` while a run of its session stands parked on the Boss within that intent's turn range, the core ends that run first, through the shell's own ending, and records the verdict once that turn has settled with the run ended.
The two land together or not at all: an ending refused, or settling with the run still parked, refuses the close with that cause and leaves the intent open.
Because this lives in the close itself, every Drop on interrupted work takes the whole ruling — no surface orchestrates two commands.
Where no run stands parked, Drop is the verdict it has always been.

**Every parked run has the same door.**
The run view's notice stands for a run parked on a Boss question as it does for a failure park: it says what the run waits for and what each control does, in phrases ([DR-069](069-key-phrases-not-sentences.md)).
Retry stands only where the run advertises a recovery, so a question park shows Drop alone.
Drop ends the run through the same ending, and where the session serves an open intent it takes the verdict in the same gesture.
The composer stays the door that answers a question.

**The Dashboard names both doors.**
A session's question entry says in its row that answering or dropping the run ends it, and activating it lands on the composer with the notice's Drop beside it.
An interrupted intent's row keeps its "Drop this work?" confirm, and reports a refused ending with its cause, the entry standing.

**The fold's rules do not move.**
The ending disposes the run inside a turn, which is already how the fold stops a park from summoning; the verdict closes the intent; History lists it dropped where a turn of it ended finished ([DR-038](038-history-is-done-work.md)).

## Consequences

- No summons outlives the act that was meant to end it: a dropped intent leaves no orphaned park behind it.
- A Drop can now be refused — the session held by another device, a turn in flight, a shell advertising no ending — and says so where it was taken, the work still owed a ruling.
- The ending appears in the thread as the Boss's own stop line, as [DR-062](062-ending-a-failed-workflow.md) already gives it, so the conversation records that the Boss stopped the run.
- A parked question in a session serving no intent gains an exit that spends no model call, where before only prose could dismiss it.
- Drop is no longer instantaneous where a run is parked: it waits out one turn, which is why it reports its own refusal rather than assuming the ledger write stands alone.
