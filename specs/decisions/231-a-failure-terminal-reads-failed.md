<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-231: A Failure Terminal Reads Failed

## Status

Accepted (2026-11-11) on a packaged-app session in which a workflow ended in the failure terminal it declares and its card read "done".
Amends [DR-031](031-machine-call-tree.md) in its tombstone rule alone: a settled run's own failure terminal record changes its card; every other later record still changes nothing.
Applies the status vocabulary of [DR-160](160-the-captain-dispatches-in-plain-sight.md) to that run.
Leaves the ledger as [DR-077](077-up-next-is-a-committed-queue.md) rules it: typed traces serve machine presentation and decide no standing, attention or advancement.

## Context

- A workflow may end in a final state it declares a failure.
  The runtime publishes that as the run's terminal record — the state's id, the kind `failure`, and the description the workflow authored for the Boss — in the run's own turn-settlement trace.
- The run view settles a run on its closing transition and reads its outcome from the machine's status.
  Every final state reports the status `done`, so a failure terminal reads "done".
- The terminal record arrives after the closing transition.
  By [DR-031](031-machine-call-tree.md) the run is tombstoned by then, so the record changes nothing.
- The Captain's prose was therefore the only place the failure showed, and the card beside it said the opposite.

## Decision

- A settled run whose own turn-settlement trace carries a terminal record of kind `failure` reads "failed", in the status vocabulary's red, wherever the run settled: in the thread for a root, under its calling state for a child.
- That record is the one later record that changes a settled card.
  A status, a disposal, and a settlement carrying a `success` record or none still change nothing.
- The record's description stands on the settled card's header as the reason, in the workflow's own words, trimmed to the header's width with its whole in a tooltip.
- Nothing outside the card changes: the state chip, the attention count, the ledger's standing and queue advancement read what they read before.

## Consequences

- The card and the Captain's reply agree about a run that ended in failure, and the reason is on the card without asking.
- A replay renders the same card: the record is part of the stored trace.
- A failure terminal summons nobody: the run is over and holds no recovery act, so it adds no attention.
