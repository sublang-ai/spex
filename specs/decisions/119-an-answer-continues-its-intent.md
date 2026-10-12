<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-119: An Answer Continues Its Intent

## Status

Accepted (2026-10-11) on the 2026-10-11 workshop's finding that a finished row read "Yes." for a `/release` run.
Amends [DR-035](035-intent-ledger.md) in what a Boss turn sent while a question waits belongs to: it continues the work that asked, a conversation serving no intent keeps the turn that opened that work as its rows' title, and a dispatch waits for the answer; the intent's fields, turn ranges, derived states, bands and verdicts stand.

## Context

- In the workshop, runs of `/release` and `/incident` asked the Boss a question ([DR-085](085-boss-talks-through-captain.md)) and were answered; each finished row on the Dashboard then read the answer — "Yes.", a waiver's text, a reply about a checker — and the command and its request were not on it.
- Those turns went to the project's current conversation with no intent bound, so each row was a session entry standing in for an intent, and the fold titled such an entry with the conversation's latest Boss turn: after a question, the answer.
- A bound intent did not show this: a turn carrying no intent belongs to the newest open intent's turns, so an answer already folds under the intent that asked, whose title stays its own text.
- One path still let an answer open work of its own: a queued intent dispatched while the question waited, its text reaching the Captain, which routes Boss messages to the waiting question ([DR-085](085-boss-talks-through-captain.md)), while the dispatch stamped a new intent over the asking run's turns.
- [DR-085](085-boss-talks-through-captain.md) names that hazard — queued text answering a question by accident — and the queue already withholds Start while a run waits on the Boss's reply ([DR-077](077-up-next-is-a-committed-queue.md)), but a row menu's Start and a staged chip still reach the core.

## Decision

**An answer is a turn of the work that asked.**
A Boss turn that starts while a run of the conversation stands parked on a Boss question — raised, and not yet reported gone, the fact the fold reads for an interrupted question — answers that run or asks it back, and opens no work of its own.

- **With an intent bound**, the answer is one of that intent's turns by the ranges [DR-035](035-intent-ledger.md) draws: the title stays the intent's first line, its entry moves from Interrupted to Working and on to Finished as before, and its stats count the answer among its turns; nothing is written for it.
- **With no intent bound**, the conversation's entries — its question, its failure, its unread finished turn — lead with the turn that opened the work they stand for: the latest Boss turn, at or before the entry's own, that started while no question stood, the answers and clarifications folding under it.
- **A dispatch is new work, never an answer**: while a run of the conversation waits on a Boss question, a submission carrying a queued intent is refused, starting no turn and stamping nothing, and the intent stays queued until the question is answered or its work is dropped ([DR-073](073-letting-go-ends-the-parked-run.md)).
- **A turn sent while no question stands is new work, as before**: a dispatch opens its intent, and in a conversation serving no intent that turn titles the rows that follow it.

**Considered and declined:**

- recording each answer as an act in the intent's file: the turn ranges already attribute it, and a second record of the same fact could disagree with the stream it repeats;
- sending a dispatched intent's text as the answer and leaving the intent queued: the queue hands the oldest queued intent on once the run finishes, so one Enter would send the same text twice;
- titling a conversation's rows by its first Boss turn, as the sidebar names a session: a project's current conversation serves many runs over its life ([DR-051](051-runtime-held-for-a-turn.md)), so its first turn names the oldest work, not the work the row stands for.

## Consequences

- The core-service package's ledger read titles a session's stand-in entries by the turn that opened their work, and its submission validation refuses a dispatch while a run of the session waits on a Boss question; the protocol's shapes are unchanged.
- The dashboard package's stand-in rows lead with that turn; intent rows, their stats and History read as before.
- The storage package is unchanged: an intent's file keeps provenance and stamps only.
- An intent stamped by a dispatch made during a question before this decision keeps the turns its stamp gives it.
