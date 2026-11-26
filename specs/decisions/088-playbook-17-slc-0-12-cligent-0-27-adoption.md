<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-088: Restore Reports What Was Recorded

## Status

Accepted (2026-09-28).
Amends [DR-047](047-explicit-session-recovery.md), [DR-062](062-ending-a-failed-workflow.md), [DR-077](077-up-next-is-a-committed-queue.md), [DR-080](080-the-config-directory-is-named-config.md), [DR-085](085-boss-talks-through-captain.md).
Amended by [DR-090](090-readiness-names-what-cligent-finds-missing.md).

## Context

- Playbook saves each step's start and result before the next transition [[1]].
  Reopening an interrupted run restores the saved position and reports what was recorded; no work is repeated and no recorded input re-run.
  Its documented entry is the session host's recover mode with `recover()`; `retry()` reaches the same path.
- The report moves no traced state: a run restored into its failure state leaves no transition in the stream, which still shows where the lost turn last was.
- Recover mode opens a settled session as continuation does, and `recover()` without input then fails the turn inside it.
- A turn that stops after saving progress — an abort or a failure — settles at the saved position instead of standing uncertain, its run parked where it stopped.
- Playbook's shared `isUncertainTurnDiscardable` allows Discard only with no recorded step, no abandonment and unchanged repository evidence, and its store refuses any other Discard.
- A failed invocation's retry follows its saved checkpoint: `retry:<EVENT>`, `retry:step`, `retry:adjudication`, `retry:restored-step`.
- Playbook's Captain relays each player question in its own words and marks the runtime's raw question status `{ kind: "boss-question" }`; the interface already draws only the Captain's reply ([DR-085](085-boss-talks-through-captain.md)).
- slc runs a `prefix` pass between `optimize` and `gears2fsm`.
- slc's link gives each outcome exactly one repository disposition (artifact schema 3), so an authored outcome that may either commit or leave the repository unchanged does not link.

## Decision

- **Restore, not Retry.** An interrupted session offers Restore: the core opens it in Playbook's recover mode and runs one turn that restores the saved position and reports what was recorded.
  The Boss then continues with the run's advertised actions ([DR-074](074-a-parked-run-survives.md), [DR-075](075-a-failure-says-what-and-what-now.md)) or a new message.
  Restore asks no confirmation — it repeats and discards nothing — and its tooltip reads "Nothing is repeated" ([DR-069](069-key-phrases-not-sentences.md)).
  A Restore of a session with nothing interrupted is refused before anything opens.
- **The restored position is recorded.** Since the report traces no move, the core appends one visible record of where each engaged run stands after it — state, pending questions, the cause its failure carries — which the ledger and the run view read as the runs' position, and the parked run's controls are captured at the restore's settlement as at any other.
  A visible marker carrying the saved input precedes the restore and names its report, so the report reads as one and its message is drawn once whatever stops the core; a position a stopped core left unrecorded is completed from the settled checkpoint by the next core to hold or read the session.
- **A report finishes nothing.** The ledger reads the restore's report as the stop of the turn it reports: it finishes no intent, raises no review, reads stopped in the queue whatever the lost attempt recorded, and hands no queued intent on, since Playbook leaves the next work to the Boss; a run it moves into its failure state summons as a failure, while a run the Boss had already stopped there stays his stop.
- **Discard where nothing was recorded.** The session summary carries Playbook's discard predicate; Discard is drawn with its confirm only where it holds and is otherwise absent, unexplained ([DR-069](069-key-phrases-not-sentences.md)); the interface never guesses it from the saved input.
- **The protocol names the act.** `session.retry` becomes `session.restore`, the uncertain entry gains `discardable`, and the protocol version bumps.
- **A saved stop settles.** The core follows Playbook's settlement of a turn stopped after saving progress: the session continues, its parked run's controls captured as at any settlement, and only a stop before any save stands uncertain; a stop during the Captain's own call parks no run, the shell's own machine being none.
- **Prefix phase.** The compile's phase row reads Normalize, Spec items, Optimize, Prefix, Machine, Link, Package.
- **One effect per outcome.** The authoring preamble teaches that each outcome has exactly one repository effect, an outcome that may either commit or leave the repository unchanged being two.
- **The relay proven.** A hermetic browser journey drives a real shell whose player asks a question and shows it reaching the Boss as the Captain's reply alone.

Considered and declined:

- keeping the protocol's `session.retry` over the new behavior: a command named for repeating work that repeats none;
- a confirm before Restore: it guards nothing, since nothing is repeated or discarded;
- reading the restored park from the settled checkpoint alone: a replayed transcript, the ledger and a restarted core read the stream, which would go on showing the lost turn's last trace.

## Consequences

- An interrupted step that had not finished is reported as unfinished, and continues only by the Boss's choice.
- A restored dispatch is released to its rank like an aborted one, its stamps kept as history; a run it brought back parked holds the queue until the Boss resolves it.

## References

[1]: https://github.com/sublang-ai/playbook/blob/main/specs/decisions/073-durable-step-progress.md "Playbook DR-073: Save progress before work"
