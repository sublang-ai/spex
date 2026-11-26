<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-055: Queue Advancement Independent Of Confirmation

## Status

Accepted (2026-09-09) on the owner's request.
Amends [DR-035](035-intent-ledger.md).
Amended by [DR-077](077-up-next-is-a-committed-queue.md), [DR-134](134-execution-ownership.md).

## Context

- The owner asked that completed queued work automatically start the next intent while its finish confirmation stays visible.
- Sending the next queued intent is unnecessary waiting after work has completed; reviewing the delivery remains a separate human responsibility.

## Decision

- Amends [DR-035](035-intent-ledger.md): its manual-only successor dispatch and confirmation-pulls-next policy give way to advancement on settlement; human verdicts stand.
- After a locally owned intent-attributed turn settles cleanly by [DR-077](077-up-next-is-a-committed-queue.md)'s gate, the core submits the project's current first queued intent assigned to this runtime ([DR-134](134-execution-ownership.md)) into the same conversation through normal admission ([DR-051](051-runtime-held-for-a-turn.md)).
  The dispatch uses its current text and identity, and attribution changes only when the turn starts.
- The prior intent remains finished and unconfirmed, with its delivery card and attention entry retained until a human verdict ([DR-038](038-history-is-done-work.md)).
  An older delivery does not hide newer work in the Running band, and its follow-up promise appears only while that intent still owns the conversation.
- Settlement alone triggers advancement; there is no retained runner state or automatic retry of refused admission.

## Consequences

- Completed work can accumulate pending confirmations while later queued work runs; only verdicts close intents and enter them into History.
- Follow-up messages belong to the newest dispatched intent, and confirming an older delivery neither dispatches work nor changes that attribution.
