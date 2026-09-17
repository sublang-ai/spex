<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-077: Up Next Is a Committed Queue

## Status

Accepted (2026-09-17) on the Boss's ruling that an ordinary settled Captain reply, including a turn that answered a question, advances queued work once the conversation is free, while failure, abort, or a run still waiting on him holds it with the reason shown.
Amends [DR-035](035-intent-ledger.md) in scope: every Up next row is visibly queued work, only the first unblocked row is next, Start is its manual-kickoff doorway rather than a queued state, and capture offers one queueing gesture; the stored acts, lifecycle states, verdicts, rank, and after-links stand.
Amends [DR-055](055-queue-advancement.md) in scope: a clean settled turn and a free conversation replace typed governed-root success as the advancement gate; verdict independence, settlement-only triggering, actual-start attribution, normal admission, explicit after-links, and the absence of a retained runner or automatic retry stand.
Amends [DR-051](051-runtime-held-for-a-turn.md) in scope: the latest owned conversation remains the queue's lane while its recovery boundary stands, even when ordinary continuation is unavailable; the runtime-held-for-a-turn and one-working-turn rules stand.
Applies [DR-069](069-key-phrases-not-sentences.md) to the next row's standing and [DR-075](075-a-failure-says-what-and-what-now.md) to any failure cause it carries.

## Context

- The ledger calls every open, unbound intent Queued, but Up next shows Start on one row, disabled Start on blocked rows, and no state on the rest.
  A row that will advance automatically therefore looks like work waiting for a click, while rows behind it do not say that they are committed at all.
- [DR-055](055-queue-advancement.md) authorizes advancement only from a typed successful governed-root terminal.
  The Boss instead rules that a normal Captain reply and a clean turn answering a question advance without that proof, and that only failure, abort, or a run still waiting on him holds an otherwise eligible handoff.
- A passive record and an executable queue row would need two capture choices, two ordering meanings, and a new state to groom.
  Issues, pull requests, and intent records already remain records until the Boss queues them.
- A run may remain parked after its turn and runtime settle ([DR-074](074-a-parked-run-survives.md)), so a conversation is not free merely because no turn is active.

## Decision

**Up next is one committed queue.**
Every row in Up next is queued work in one manually ranked project queue and carries a neutral `Queued` mark.
There is no passive, saved, manual-only, or auto-enabled kind of intent.
The project's next intent is the first queued row not blocked by an after-link; `Next` is position, not lifecycle state.
The next row alone may carry Start, and every later row relies on rank rather than another Start.

**The next row says what precedes it.**
Its standing is derived from the current conversation and record stream, never stored:

| Condition | Phrase on the next row | Start |
| --- | --- | --- |
| Any turn in the project's current conversation is active or settling | `after current work` | absent; an eligible attributed settlement hands off automatically, while any other settlement reveals the next standing |
| A run remains parked on a failure | `waiting — current work failed`, followed by the catalogue cause when known | absent |
| A run is waiting on a question | `waiting — your reply` | absent |
| No run remains parked, and either the latest lane turn ended failed or an unparked failure condition still stands | `waiting — previous work failed`, followed by the catalogue cause when known | shown as the Boss's explicit decision to proceed |
| The latest lane turn aborted or ran an ending control | `waiting — previous work stopped` | shown as the Boss's explicit restart or move-on |
| None of the preceding conditions holds, including first capture into an idle project or capture after settlement | none | shown |

The table is ordered: the first matching condition is the standing, so active or settling work wins first, a surviving failure park wins over a question park, either park wins over the turn that left it, and an unparked failure wins over a stopped outcome.
`Waiting` means automatic handoff is held; where Start is present it is the explicit way to proceed, and where Start is absent the named current prerequisite must resolve elsewhere.
An intent whose after-link names an open predecessor is not next, carries `after ⟨title⟩` with the other project named when needed, and carries no Start.
A standing phrase replaces an inert Start rather than explaining a disabled control.
The same next, phrase, and Start availability appear in Up next, the attention all-clear, a resolved delivery card, and the Captain home.

**Clean settlement advances.**
After a locally owned intent-attributed turn completes full settlement and publishes its released conversation, the core submits the project's then-first queued, unblocked intent into that same conversation exactly once when all of these hold:

- the just-settled turn ended finished rather than failed or aborted;
- the turn would have left its attributed owner Finished rather than Interrupted had no verdict closed it;
- the turn did not run an ending control;
- no run of the conversation remains parked on the Boss;
- the turn, dispatch boundary, project lane, and conversation remain current and normal admission accepts the submission.

A Done or Drop racing an eligible settlement neither authorizes nor cancels its handoff, and a verdict or later removal never initiates advancement.
An ordinary Captain reply qualifies without playbook trace evidence.
A reply that merely sounds like a question also qualifies unless the runtime actually parks a run; Spex does not classify prose.
A Boss answer qualifies after its own turn settles cleanly and the question park has left.
A failure, a stopped turn — aborted or run by an ending control — or a question or failure park starts nothing automatically; a later clean attributed follow-up or recovery may advance.
A permission record and absent, unsupported, child, or non-terminal trace evidence add no gate of their own.
Explicit after-links remain eligibility blockers independent of the predecessor-outcome gate.
Queue capture or edits, ledger reads, verdicts, adoption, and restart initiate no advancement, and a refused admission is not retried automatically.

**Capture has one gesture.**
Sources rows offer Queue, the inline add row offers Queue with Enter as its shortcut, and the composer offers Add to Up next.
None offers Start beside its capture action, and capture itself sends no turn.
Capture during attributed queued work joins its next eligible handoff; capture during other active work waits for the lane to free and then reveals the next standing, while capture into a queue at rest reveals a next row whose Start is available.

**Verdict and dispatch remain independent.**
A finished intent continues to owe Confirm or Drop while later work runs.
A verdict may reveal a different next standing, but it neither starts, cancels, nor attributes an otherwise eligible turn.

**Considered and declined:**

- a record-versus-queued or manual-versus-automatic flag: Up next would cease to be one ordered commitment and gain state to groom;
- Start on every row: rank is the one gesture that chooses what is next;
- disabled Start as status: the standing phrase says what actually precedes the work without implying a click will later be required;
- Start beside Queue or capture-and-start: it offers an impossible immediate act while a lane works and bypasses the queue when it does not;
- a queue pause switch or retained runner: the conversation's derived standing already governs handoff;
- typed root-success evidence or prose classification: neither is the Boss's completion rule.

## Consequences

- The core ledger read publishes each project's next intent and its derived standing so every surface uses one answer.
- Dashboard rows gain the `Queued` mark, the next standing, conditional Start, and an explicit Queue action in the inline add row; Sources retain their single Queue action.
- Delivery and Captain-home next cards use the same standing instead of manufacturing an unconditional Start.
- The automatic-advancement integration matrix moves from trace shapes to ordinary finish, answered question, failure, stopped turn, parked run, verdict race, dependency, and admission-race cases.
- Typed playbook traces remain available for machine presentation but no longer decide whether the ledger advances.
