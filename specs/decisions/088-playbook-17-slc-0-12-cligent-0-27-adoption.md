<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-088: Playbook 17, slc 0.12 and Cligent 0.27 Adoption

## Status

Accepted (2026-09-28).
Amends [DR-076](076-playbook-14-1-adoption.md) in its Playbook floor alone: the core requires `^17.0.0`; the catalogue import and the re-captured fixtures stand.
Amends [DR-053](053-model-options-adoption.md) in its Cligent floor alone: the core requires `^0.27.0`; the discovery export stands.
Amends [DR-081](081-the-app-supplies-the-compiler.md) in the compiler's version alone: both shells declare `@sublang/slc` `^0.12.0`; how the compiler is found, run and checked stands.
Amends [DR-047](047-explicit-session-recovery.md) in its two controls: Restore replaces Retry and repeats nothing, and Discard is offered only where nothing was recorded; the lease, the blocked submissions and the preserved history stand.
Completes [DR-085](085-boss-talks-through-captain.md), whose Captain-worded questions needed Playbook's question relay.

## Context

- Playbook 17 saves each step's start and result before the next transition ([DR-073 in Playbook](https://github.com/sublang-ai/playbook/blob/main/specs/decisions/073-durable-step-progress.md)).
  Reopening an interrupted run restores the saved position and reports what was recorded; no work is repeated and no recorded input re-run.
  Its documented entry is the session host's recover mode with `recover()`; `retry()` reaches the same path.
- A turn that stops after saving progress — an abort or a failure — settles at the saved position instead of standing uncertain.
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
  The Boss then continues with the run's advertised actions ([DR-074](074-a-parked-run-survives.md), [DR-075](075-a-failure-says-what-and-what-now.md)) or a new message; a restore hands no queued intent on, since Playbook leaves the next work to the Boss.
  Restore asks no confirmation — it repeats and discards nothing — and its tooltip reads "Nothing is repeated" ([DR-069](069-key-phrases-not-sentences.md)).
- **Discard where nothing was recorded.** The session summary carries Playbook's discard predicate; Discard is drawn with its confirm only where it holds and is otherwise absent, unexplained ([DR-069](069-key-phrases-not-sentences.md)); the interface never guesses it from the saved input.
- **The protocol names the act.** `session.retry` becomes `session.restore`, the uncertain entry gains `discardable`, and the protocol version bumps.
- **A saved stop settles.** The core follows Playbook's settlement of a turn stopped after saving progress: the session continues, and only a stop before any save stands uncertain.
- **Prefix phase.** The compile's phase row reads Normalize, Spec items, Optimize, Prefix, Machine, Link, Package.
- **One effect per outcome.** The authoring preamble teaches that each outcome has exactly one repository effect, an outcome that may either commit or leave the repository unchanged being two.
- **Fixtures re-captured.** The machine graphs and the parked-failure fixtures are re-captured from the installed built-ins and a real core with substitute agents, as [DR-076](076-playbook-14-1-adoption.md) did; tests, narrations and demos follow the renamed states.
- **The relay proven.** A hermetic browser journey drives a real shell whose player asks a question and shows it reaching the Boss as the Captain's reply alone.

Considered and declined:

- keeping the protocol's `session.retry` over the new behavior: a command named for repeating work that repeats none;
- a confirm before Restore: it guards nothing, since nothing is repeated or discarded.

## Consequences

- Once this build saves a session, a host on Playbook 16 or older sharing the Spex home — a playbook CLI, another Space device — cannot open it; they upgrade together, after a snapshot of the home ([DR-050](050-shared-storage-cutover.md)).
- A session parked on a question inside a renamed built-in state no longer resumes from the answer; the Boss drops it or sends a new request.
- An interrupted step that had not finished is reported as unfinished, and continues only by the Boss's choice.
- The compiler's nested engine and Cligent (Playbook 16, Cligent 0.26) trail the app's until slc adopts Playbook 17; the engine check refuses a compiler whose engine stops agreeing ([DR-081](081-the-app-supplies-the-compiler.md)).
