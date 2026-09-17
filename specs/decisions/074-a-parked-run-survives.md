<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-074: A Parked Run Survives

## Status

Accepted (2026-09-17) on the owner's report of a `/code` run in spex-pub parked with an unresolved repository effect, whose Retry could never work and whose session would have become dead history on the next app restart.
Amends [DR-051](051-runtime-held-for-a-turn.md) in scope: the runtime is released at settlement whether or not unresolved repository effects stand; the held-for-a-turn rule, the one-working-turn-per-project rule, and the current-conversation lane stand.
Amends [DR-062](062-ending-a-failed-workflow.md) in scope: a session whose run was ended with unresolved effects recorded, by Drop or by the run's own abandonment, is continuable; Drop's placement, its confirm, and its one-ruling gesture stand.
Applies [DR-066](066-every-summons-has-a-door.md): a parked run keeps its controls after a restart.

## Context

- The core kept the runtime held when a settled session carried unresolved repository effects, so that the parked run's controls stayed readable.
  A held runtime is what "still working" means to project admission, so a second session of that project was refused as still working while nothing worked.
- After a restart the same session was listed as history that can't be continued, "Reconcile unresolved effects before continuation", with the red failure standing and no control left to end it: a summons without a door.
- The core's continuable rule required an empty unresolved list.
  Playbook records a durable abandonment and keeps the list as evidence when a run ends over unresolved effects, and then says "send the command again to start fresh work"; the core called such a session history forever.
- The core's Retry took the first advertised action.
  The parked run advertised a reconciliation that only re-reads the ledger beside an abandonment that would have ended it; the second was unreachable.

## Decision

- **Release at settlement.**
  A settled session releases its runtime whether or not unresolved effects stand.
  Playbook's restore installs its retained-effect fence, so reopening the session is safe and the fence's controls are what it advertises.
- **A control opens the session it needs.**
  A session control on a settled session opens it first, reads what the opened shell advertises, and runs the selected control; ordinary Boss text on such a session is admitted or refused exactly as Playbook's own lifecycle rules, and the core adds no refusal of its own.
- **Continuable follows Playbook.**
  A session is continuable exactly when Playbook's validation calls it resumable; unresolved effects recorded beside a settled abandonment are history that summons nobody.
- **Busy means busy.**
  A project is refused as still working only while a session's turn is in flight or settling; an idle session never blocks its project.
- **Every advertised action is published.**
  The session summary carries the parked run's advertised actions, each with its id, label and, where the runtime reports one, its standing, captured at settlement and re-validated at activation; a control names the action it selects rather than taking the first.

## Consequences

- A parked run keeps its controls across restarts, and the session it lives in stops blocking its project.
- Dropping a run that left unresolved effects no longer buries the session; the evidence stays in its record as history.
- Publishing the advertised actions is what lets the interface draw one control per action and say which one will do nothing ([DR-063 in Playbook](https://github.com/sublang-ai/playbook/blob/main/specs/decisions/063-failures-explain-themselves.md)).
- The core reads the actions when the shell is held and publishes them with the summary, which is the only time it can read them without opening the session.
