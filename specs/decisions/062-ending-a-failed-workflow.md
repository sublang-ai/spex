<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-062: Ending a Failed Workflow

## Status

Accepted.
Amends [DR-035](035-intent-ledger.md), [DR-061](061-run-state-from-frames.md).
Amended by [DR-066](066-every-summons-has-a-door.md), [DR-073](073-letting-go-ends-the-parked-run.md), [DR-074](074-a-parked-run-survives.md), [DR-075](075-a-failure-says-what-and-what-now.md), [DR-088](088-playbook-17-slc-0-12-cligent-0-27-adoption.md).

## Context

The first failed-workflow notice gave a parked workflow a Retry and said it would stop being a request and start being a call once Playbook advertised its runtime actions to hosts.
Playbook advertises them, and advertises one control of its own besides: a give-up that spends no model call.

Retry answers "make it work".
Nothing answered "I am letting this go".
A Boss whose retry keeps failing could type prose and hope the Captain read it as a stop request, or delete the session with its whole conversation — and when the failure is a refused model call, as a refused adjudication once was, prose fails the same way the workflow did.

Attention meanwhile disagrees with itself.
The notice, the state chip and the project palette read the run's own frames and keep summoning while it stands parked [[run-view-59](../packages/run-view.md#run-view-59)].
The core's ledger stands the Dashboard badge, the sidebar mark and the tab dot down as soon as any later Boss turn starts [[dashboard-10](../packages/dashboard.md#dashboard-10)].
One unrelated message therefore makes the interface half-forget a failure nothing has resolved.

That rule is not careless: until now it was the only thing that could clear a failure at all.
Without an exit, holding the summons would have meant holding it forever, which is why the exit and the rule have to change together.

## Decision

- The failed-workflow notice carries the run's recovery controls and Drop, and says what each does.
- A recovery control selects one of the run's own advertised runtime actions through the runtime rather than asking the Captain in prose, one control per advertised action ([DR-075](075-a-failure-says-what-and-what-now.md)).
  Where the run advertises none, none is offered.
- Drop ends the run through the shell's own give-up, which spends no model call, so the exit works when the provider is what failed.
  It is the Boss's ruling, so it stands behind an inline confirm.
- Where the session serves an open intent, Drop takes the ledger's Drop verdict in the same gesture: one ruling, not two.
- A failure that parked a run summons until that run leaves its failure state, whether a recovery control recovered it or Drop ended it.
  A later Boss turn no longer acknowledges it.
- A failure that parked no run keeps the rule it has: nothing is stuck, so moving on is acknowledgment.
- Dropping records nothing of its own. Ending the run is what clears the attention, on every surface, because every surface already asks the same question — is that run still parked.
- The run's machine card keeps its failure emphasis and its History row keeps the dropped tag it already has ([DR-038](038-history-is-done-work.md)): the work did fail, and the record says so after the summons stops.
- Amends [DR-061](061-run-state-from-frames.md): the ledger holds a parked failure on the terms the frames do, closing the divergence that record left; reading a leaf's state from its own frames stands.
- Amends [DR-035](035-intent-ledger.md): a later Boss turn no longer clears a failure that parked a run; the verdict acts, the two-band queue, and every other fold contract stand.

## Consequences

- Neither control depends on a model reading prose, so a failing provider no longer blocks both the recovery and the exit.
- The surfaces agree by construction rather than by coincidence: one question, asked of the run, answered the same way by the notice, the chip, the palette, the badge, the sidebar and the tab.
- A parked failure can now stand indefinitely, which is correct only because Drop exists; the two halves of this record are not separable.
- Dropping is not resumable — Playbook clears the run's retained generation — so a Boss who wants the work back runs the command again.
- Nothing durable records the drop itself, so a drop on a session serving no intent leaves only the conversation and the run's own history as its account.
- A session already holding an uncertain turn shows the interrupted-turn controls instead [[run-view-110](../packages/run-view.md#run-view-110)]: it is restored first, and Discard stands only where nothing was recorded ([DR-088](088-playbook-17-slc-0-12-cligent-0-27-adoption.md)).
