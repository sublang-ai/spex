<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-088: Playbook 17, slc 0.12 and Cligent 0.27 Adoption

## Status

Accepted (2026-09-28).
Amends [DR-080](080-the-config-directory-is-named-config.md) in its Playbook floor alone: the core requires `^17.0.0` where DR-080 moved it to `^15.0.0`; the config relocation stands.
Amends [DR-053](053-model-options-adoption.md) in its Cligent floor alone: the core requires `^0.27.0`; the discovery export stands.
Follows [DR-081](081-the-app-supplies-the-compiler.md)'s explicit-bump rule: both shells declare `@sublang/slc` `^0.12.0`; nothing DR-081 decided changes.
Amends [DR-047](047-explicit-session-recovery.md) in its two controls: Restore replaces Retry and repeats nothing, and Discard is offered only where nothing was recorded; the lease, the blocked submissions and the preserved history stand.
Amends [DR-077](077-up-next-is-a-committed-queue.md) in its advancement gate alone: a restore's report hands no queued intent on, being the account of a stop; the gate for every other settled turn stands.
Amends [DR-062](062-ending-a-failed-workflow.md) in its last consequence alone: a session holding an uncertain turn is restored first, and Discard stands only where nothing was recorded.
Completes [DR-085](085-boss-talks-through-captain.md), whose Captain-worded questions needed Playbook's question relay.

## Context

- Playbook 17 saves each step's start and result before the next transition [[1]].
  Reopening an interrupted run restores the saved position and reports what was recorded; no work is repeated and no recorded input re-run.
  Its documented entry is the session host's recover mode with `recover()`; `retry()` reaches the same path.
- The report moves no traced state: a run restored into its failure state leaves no transition in the stream, which still shows where the lost turn last was.
- Recover mode opens a settled session as continuation does, and `recover()` without input then fails the turn inside it.
- A turn that stops after saving progress — an abort or a failure — settles at the saved position instead of standing uncertain, its run parked where it stopped.
- Playbook's shared `isUncertainTurnDiscardable` allows Discard only with no recorded step, no abandonment and unchanged repository evidence, and its store refuses any other Discard.
- Every session Playbook 17 saves carries fields hosts through 16.0.x reject, so every host sharing a session store upgrades together.
- Playbook 16 recompiled every built-in, and the compiler named its own states — CODE's `runFirstPhase` is `firstPhase`, REVIEW's `reviewInitial` is `firstReview`, DECIDE's `commitCoderProposal` is `synthesizeCommit`; a question parked by an earlier release inside a renamed state no longer resumes from the answer.
- A failed invocation's retry follows its saved checkpoint: `retry:<EVENT>`, `retry:step`, `retry:adjudication`, `retry:restored-step`.
- Playbook 17's Captain relays each player question in its own words and marks the runtime's raw question status `{ kind: "boss-question" }`; the interface already draws only the Captain's reply ([DR-085](085-boss-talks-through-captain.md)).
- slc 0.11 runs a `prefix` pass between `optimize` and `gears2fsm`, and tests against the first Claude Agent SDK whose bundled Claude Code serves Opus 5.5; slc 0.12 verifies a recovery-capable Captain.
- slc's link gives each outcome exactly one repository disposition (artifact schema 3), so an authored outcome that may either commit or leave the repository unchanged does not link.
- slc 0.12 depends on Playbook 16, so npm nests the compiler's engine beneath it; both engines declare runtime ABI 1 and artifact schema 3, and a compile links the app's own engine into the library directory.

## Decision

- **Floors.** The core requires `@sublang/playbook` `^17.0.0` and `@sublang/cligent` `^0.27.0`; both shells declare `@sublang/slc` `^0.12.0`; the lockfile is regenerated from the public registry with the app's engine at the tree's root, and it locks the Claude Agent SDK the shells declare at `*` to the newest release Cligent 0.27 accepts.
- **Restore, not Retry.** An interrupted session offers Restore: the core opens it in Playbook's recover mode and runs one turn that restores the saved position and reports what was recorded.
  The Boss then continues with the run's advertised actions ([DR-074](074-a-parked-run-survives.md), [DR-075](075-a-failure-says-what-and-what-now.md)) or a new message.
  Restore asks no confirmation — it repeats and discards nothing — and its tooltip reads "Nothing is repeated" ([DR-069](069-key-phrases-not-sentences.md)).
  A Restore of a session with nothing interrupted is refused before anything opens.
- **The restored position is recorded.** Since the report traces no move, the core appends one visible record of where each engaged run stands after it — state, pending questions, the cause its failure carries — which the ledger and the run view read as the runs' position, and the parked run's controls are captured at the restore's settlement as at any other.
- **A report finishes nothing.** The ledger reads the restore's report as the stop of the turn it reports: it finishes no intent, raises no review, reads stopped in the queue, and hands no queued intent on, since Playbook leaves the next work to the Boss; a run it brings back in its failure state summons as a failure.
- **Discard where nothing was recorded.** The session summary carries Playbook's discard predicate; Discard is drawn with its confirm only where it holds and is otherwise absent, unexplained ([DR-069](069-key-phrases-not-sentences.md)); the interface never guesses it from the saved input.
- **The protocol names the act.** `session.retry` becomes `session.restore`, the uncertain entry gains `discardable`, and the protocol version bumps.
- **A saved stop settles.** The core follows Playbook's settlement of a turn stopped after saving progress: the session continues, its parked run's controls captured as at any settlement, and only a stop before any save stands uncertain; a stop during the Captain's own call parks no run, the shell's own machine being none.
- **Prefix phase.** The compile's phase row reads Normalize, Spec items, Optimize, Prefix, Machine, Link, Package.
- **One effect per outcome.** The authoring preamble teaches that each outcome has exactly one repository effect, an outcome that may either commit or leave the repository unchanged being two.
- **Fixtures re-captured.** The machine graphs and the parked-failure fixtures are re-captured from the installed built-ins and a real core with substitute agents, as [DR-076](076-playbook-14-1-adoption.md) did; tests, narrations and demos follow the renamed states.
- **The relay proven.** A hermetic browser journey drives a real shell whose player asks a question and shows it reaching the Boss as the Captain's reply alone.

Considered and declined:

- keeping the protocol's `session.retry` over the new behavior: a command named for repeating work that repeats none;
- a confirm before Restore: it guards nothing, since nothing is repeated or discarded;
- reading the restored park from the settled checkpoint alone: a replayed transcript, the ledger and a restarted core read the stream, which would go on showing the lost turn's last trace.

## Consequences

- Once this build saves a session, a host on Playbook 16 or older sharing the Spex home — a playbook CLI, another Space device — cannot open it; they upgrade together, after a snapshot of the home ([DR-050](050-shared-storage-cutover.md)).
- A session parked on a question inside a renamed built-in state no longer resumes from the answer; the Boss drops it or sends a new request.
- An interrupted step that had not finished is reported as unfinished, and continues only by the Boss's choice.
- slc's nested engine (Playbook 16, with its own Cligent 0.26) trails the app's until slc adopts Playbook 17, while slc itself resolves the app's Cligent 0.27; the engine check refuses a compiler whose engine stops agreeing ([DR-081](081-the-app-supplies-the-compiler.md)).
- A restored dispatch is released to its rank like an aborted one, its stamps kept as history; a run it brought back parked holds the queue until the Boss resolves it.

## References

[1]: https://github.com/sublang-ai/playbook/blob/main/specs/decisions/073-durable-step-progress.md "Playbook DR-073: Save progress before work"
