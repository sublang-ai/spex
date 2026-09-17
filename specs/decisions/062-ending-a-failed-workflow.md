<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-062: Ending a Failed Workflow

## Status

Accepted.
Amends [DR-060](060-failed-workflow-control.md)'s single-control notice: Drop stands beside Retry, and Retry becomes the deterministic selection that record deferred; the notice's placement, its plain wording, and its busy and disabled forms stand.
Amends [DR-061](061-run-state-from-frames.md)'s failure attention: the divergence that record scoped as a consequence closes, the ledger now holding a parked failure on the same terms the frames do; reading a leaf's state from its own frames stands.
Amends [DR-035](035-intent-ledger.md)'s failure acknowledgment: a later Boss turn no longer clears a failure that parked a run; the verdict acts, the two-band queue, and every other fold contract stand.
Amended by [DR-073](073-letting-go-ends-the-parked-run.md) in scope: dropping interrupted work is the whole ruling rather than a verdict alone, and the run's own control covers any run parked on the Boss, a question park included; the deterministic Retry, the model-free give-up, the one-ruling gesture and the History tag stand.
Amended by [DR-074](074-a-parked-run-survives.md): a session whose run ended with unresolved effects recorded is continuable, and every advertised action is published rather than the first taken.
Amended by [DR-075](075-a-failure-says-what-and-what-now.md): one control per advertised action, each with its standing, replaces the single Retry.

## Context

[DR-060](060-failed-workflow-control.md) gave a parked workflow a Retry and said it would stop being a request and start being a call once Playbook advertised its runtime actions to hosts.
Playbook 13.3 advertises them, and advertises one control of its own besides: a give-up that spends no model call.

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

- The failed-workflow notice carries two controls, Retry and Drop, and says what each does.
- Retry selects the run's own advertised recovery action through the runtime rather than asking the Captain in prose.
  Where the run advertises none, Retry is absent rather than offered and refused.
- Drop ends the run through the shell's own give-up, which spends no model call, so the exit works when the provider is what failed.
  It is the Boss's ruling, so it stands behind an inline confirm.
- Where the session serves an open intent, Drop takes the ledger's Drop verdict in the same gesture: one ruling, not two.
- A failure that parked a run summons until that run leaves its failure state, whether Retry recovered it or Drop ended it.
  A later Boss turn no longer acknowledges it.
- A failure that parked no run keeps the rule it has: nothing is stuck, so moving on is acknowledgment.
- Dropping records nothing of its own. Ending the run is what clears the attention, on every surface, because every surface already asks the same question — is that run still parked.
- The run's machine card keeps its failure emphasis and its History row keeps the dropped tag it already has ([DR-038](038-history-is-done-work.md)): the work did fail, and the record says so after the summons stops.
- Spex requires Playbook 13.3 or later.

## Consequences

- Neither control depends on a model reading prose, so a failing provider no longer blocks both the recovery and the exit.
- The surfaces agree by construction rather than by coincidence: one question, asked of the run, answered the same way by the notice, the chip, the palette, the badge, the sidebar and the tab.
- A parked failure can now stand indefinitely, which is correct only because Drop exists; the two halves of this record are not separable.
- Dropping is not resumable — Playbook clears the run's retained generation — so a Boss who wants the work back runs the command again.
- Nothing durable records the drop itself, so a drop on a session serving no intent leaves only the conversation and the run's own history as its account.
- A session already holding an uncertain turn shows the interrupted-turn controls instead [[run-view-110](../packages/run-view.md#run-view-110)], so the route there stays Discard first.
