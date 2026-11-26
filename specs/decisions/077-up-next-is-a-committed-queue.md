<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-077: Up Next Is a Committed Queue

## Status

Accepted (2026-09-17); revised (2026-11-26).
Amends [DR-035](035-intent-ledger.md), [DR-051](051-runtime-held-for-a-turn.md).
Amended by [DR-088](088-playbook-17-slc-0-12-cligent-0-27-adoption.md), [DR-103](103-the-home-and-its-groups.md), [DR-134](134-execution-ownership.md).

## Context

- The owner asked that completed queued work start the next intent automatically while its finish confirmation stays visible: waiting to send the next intent is unnecessary once work has completed, and reviewing the delivery remains a separate human responsibility.
- The ledger calls every open, unbound intent Queued, but Up next shows Start on one row, disabled Start on blocked rows, and no state on the rest.
  A row that will advance automatically therefore looks like work waiting for a click, while rows behind it do not say that they are committed at all.
- Advancement first required a typed successful governed-root terminal.
  The Boss instead rules that a normal Captain reply and a clean turn answering a question advance without that proof, and that only failure, abort, or a run still waiting on him holds an otherwise eligible handoff.
- A passive record and an executable queue row would need two capture choices, two ordering meanings, and a new state to groom.
  Issues, pull requests, and intent records already remain records until the Boss queues them.
- A run may remain parked after its turn and runtime settle ([DR-074](074-a-parked-run-survives.md)), so a conversation is not free merely because no turn is active.

## Decision

**Up next is one committed queue.**
Every row in Up next is queued work in one project queue, oldest first ([DR-103](103-the-home-and-its-groups.md)), and carries a neutral `Queued` mark.
There is no passive, saved, manual-only, or auto-enabled kind of intent.
The project's next intent is the oldest queued intent assigned to this runtime ([DR-134](134-execution-ownership.md)); `Next` is position, not lifecycle state.
The next row alone may carry Start, and every later row relies on its place in the queue rather than another Start.

**The next row says what precedes it.**
Its standing is derived from the current conversation and record stream, never stored, and reads as a key phrase ([DR-069](069-key-phrases-not-sentences.md)) with any cause from the failure catalogue ([DR-075](075-a-failure-says-what-and-what-now.md)):

| Condition | Phrase on the next row | Start |
| --- | --- | --- |
| Any turn in the project's current conversation is active or settling | `after current work` | absent; an eligible attributed settlement hands off automatically, while any other settlement reveals the next standing |
| A run remains parked on a failure | `waiting — current work failed`, followed by the catalogue cause when known | absent |
| A run is waiting on a question | `waiting — your reply` | absent |
| No run remains parked, and either the latest lane turn ended failed or an unparked failure condition still stands | `waiting — previous work failed`, followed by the catalogue cause when known | shown as the Boss's explicit decision to proceed |
| The latest lane turn aborted, ran an ending control, or was a restore's report ([DR-088](088-playbook-17-slc-0-12-cligent-0-27-adoption.md)) | `waiting — previous work stopped` | shown as the Boss's explicit restart or move-on |
| None of the preceding conditions holds, including first capture into an idle project or capture after settlement | none | shown |

The table is ordered: the first matching condition is the standing, so active or settling work wins first, a surviving failure park wins over a question park, either park wins over the turn that left it, and an unparked failure wins over a stopped outcome.
`Waiting` means automatic handoff is held; where Start is present it is the explicit way to proceed, and where Start is absent the named current prerequisite must resolve elsewhere.
A standing phrase replaces an inert Start rather than explaining a disabled control.
The same next, phrase, and Start availability appear in Up next, the attention all-clear, a resolved delivery card, and the Captain home.

**Clean settlement advances.**
After a locally owned intent-attributed turn completes full settlement and publishes its released conversation, the core submits the project's then-next intent into that same conversation exactly once when all of these hold:

- the just-settled turn ended finished rather than failed or aborted;
- the turn would have left its attributed owner Finished rather than Interrupted had no verdict closed it;
- the turn did not run an ending control and was not a restore's report;
- no run of the conversation remains parked on the Boss;
- the turn, dispatch boundary, project lane — counting only this runtime's own sessions ([DR-134](134-execution-ownership.md)) — and conversation remain current and normal admission accepts the submission.

The dispatch uses the intent's current text and identity, and attribution changes only when the turn starts.
Settlement alone triggers advancement; no runner state is retained.
A Done or Drop racing an eligible settlement neither authorizes nor cancels its handoff, and a verdict or later removal never initiates advancement.
An ordinary Captain reply qualifies without playbook trace evidence.
A reply that merely sounds like a question also qualifies unless the runtime actually parks a run; Spex does not classify prose.
A Boss answer qualifies after its own turn settles cleanly and the question park has left.
A failure, a stopped turn — aborted or run by an ending control — or a question or failure park starts nothing automatically; a later clean attributed follow-up or recovery may advance.
A permission record and absent, unsupported, child, or non-terminal trace evidence add no gate of their own.
Queue capture or edits, ledger reads, verdicts, adoption, and restart initiate no advancement, and a refused admission is not retried automatically.

**Capture has one gesture.**
Sources rows offer Queue, the inline add row offers Queue with Enter as its shortcut, and the composer offers Add to Up next.
None offers Start beside its capture action, and capture itself sends no turn.
Capture during attributed queued work joins its next eligible handoff; capture during other active work waits for the lane to free and then reveals the next standing, while capture into a queue at rest reveals a next row whose Start is available.

**Verdict and dispatch remain independent.**
A finished intent continues to owe Confirm or Drop while later work runs.
A verdict may reveal a different next standing, but it neither starts, cancels, nor attributes an otherwise eligible turn.
The prior intent remains finished and unconfirmed, with its delivery card and attention entry retained until a human verdict ([DR-038](038-history-is-done-work.md)).
An older delivery does not hide newer work in the Running band, and its follow-up promise appears only while that intent still owns the conversation.

**Amended decisions.**

- [DR-035](035-intent-ledger.md): its manual-only successor dispatch and confirmation-pulls-next policy give way to advancement on settlement; every Up next row is visibly queued work, only the next row is next, Start is its manual-kickoff doorway rather than a queued state, and capture offers one queueing gesture; the stored acts, lifecycle states and verdicts stand.
- [DR-051](051-runtime-held-for-a-turn.md): the latest owned conversation remains the queue's lane while its recovery boundary stands, even when ordinary continuation is unavailable; the runtime-held-for-a-turn and one-working-turn rules stand.

**Considered and declined:**

- a record-versus-queued or manual-versus-automatic flag: Up next would cease to be one ordered commitment and gain state to groom;
- Start on every row: the queue's order alone chooses what is next;
- disabled Start as status: the standing phrase says what actually precedes the work without implying a click will later be required;
- Start beside Queue or capture-and-start: it offers an impossible immediate act while a lane works and bypasses the queue when it does not;
- a queue pause switch or retained runner: the conversation's derived standing already governs handoff;
- typed root-success evidence or prose classification: neither is the Boss's completion rule.

## Consequences

- Completed work can accumulate pending confirmations while later queued work runs; only verdicts close intents and enter them into History.
- Follow-up messages belong to the newest dispatched intent, and confirming an older delivery neither dispatches work nor changes that attribution.
- The core ledger read publishes each project's next intent and its derived standing so every surface uses one answer.
- Dashboard rows gain the `Queued` mark, the next standing, conditional Start, and an explicit Queue action in the inline add row; Sources retain their single Queue action.
- Delivery and Captain-home next cards use the same standing instead of manufacturing an unconditional Start.
- The automatic-advancement integration matrix moves from trace shapes to ordinary finish, answered question, failure, stopped turn, parked run, verdict race, and admission-race cases.
- Typed playbook traces remain available for machine presentation but no longer decide whether the ledger advances.
