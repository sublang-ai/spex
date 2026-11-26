<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-060: A Control For A Failed Workflow

## Status

Accepted (2026-09-12) on the owner's report.
Amends [DR-047](047-explicit-session-recovery.md).
Amended by [DR-061](061-run-state-from-frames.md), [DR-062](062-ending-a-failed-workflow.md), [DR-073](073-letting-go-ends-the-parked-run.md), [DR-075](075-a-failure-says-what-and-what-now.md).

## Context

- The owner reported that a `/dev` turn parked in its recoverable failure state offered no way back but prose in the composer.
- A workflow that fails recoverably parks and narrates `◆ workflow failed; awaiting Boss recovery.`, and the session's state chip reads failure — but the interface offered nothing to activate.
  The only route back was prose the Boss invents, and whether it is understood is the session Captain's judgment.
- Playbook already owns the correct recovery: the parked leaf advertises its own runtime actions, a retry among them, withheld while the failed attempt's repository effects are unresolved.
  The shell executes one only when the leaf's current control view still advertises it.
- The published Playbook surface did not then reach that list [[1]].
- The failure this control exists to recover from was a refused model call.
  A recovery that itself depends on a model call shares that failure mode.

## Decision

- Extends [DR-047](047-explicit-session-recovery.md) from the uncertain turn to the settled-but-parked workflow; the two conditions never stand together.
- The run view stands a notice, between the Captain pane and the composer, while a continuable session's leaf run is parked in its recoverable failure state or on a Boss question ([DR-073](073-letting-go-ends-the-parked-run.md)), read from the run's own frames ([DR-061](061-run-state-from-frames.md)).
- The notice speaks plainly — why the run failed and what to do, from data ([DR-075](075-a-failure-says-what-and-what-now.md)) — and wraps its controls under its words in a narrow pane.
- Its controls are the run's advertised runtime actions, each its own control and executed as a host-submitted selection with no model call on the recovery path, with Drop beside them ([DR-062](062-ending-a-failed-workflow.md)); where the run advertises no recovery, none is offered.
- An uncertain session shows the interrupted-turn controls instead, never both.
- Spex requests what it needs from Playbook rather than working around it: no prompt is parsed, no internal record is scraped, and no reconstructed request text is delivered in a retry's name.

## Consequences

- A provider refusal cannot block recovery the way it blocked the turn, since recovery makes no model call.
- Spex draws only what the leaf advertises — a retry, a resumable jump, unresolved-effect reconciliation or abandonment.

## References

[1]: https://github.com/sublang-ai/playbook/blob/main/reference/sdlc/code.playbook/session-host.d.ts "Playbook SessionHostController: the host's session surface"
