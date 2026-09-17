<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-075: A Failure Says What, Why, and What Now

## Status

Accepted (2026-09-17) on the owner's report that a failed `/code` run in spex-pub gave no usable reason and offered a Retry that could not work.
Amends [DR-062](062-ending-a-failed-workflow.md) in scope: the notice carries one control per advertised action, each with its standing, instead of one Retry; Drop, its confirm, and the one-ruling gesture stand.
Amends [DR-060](060-failed-workflow-control.md) in scope: the notice says why the run failed and what to do, from data, and fulfils that record's promise to draw each advertised action as its own control.
Extends [DR-069](069-key-phrases-not-sentences.md): a failure's cause is a phrase where it applies, from a catalogue, never a sentence a model composed.
Requires Playbook 14.1, whose [DR-063](https://github.com/sublang-ai/playbook/blob/main/specs/decisions/063-failures-explain-themselves.md) attaches a closed `{ code, evidence }` cause to every parked failure and a standing to every advertised action.

## Context

- The Boss saw "workflow failed; awaiting Boss recovery", a notice naming no cause, and a hedged model reply carrying two commit hashes.
  The runtime's reason reached the client inside the status record's data, and no component rendered it.
- Retry sent the first of two advertised actions, a reconciliation that can never resolve a complete receipt; the abandonment beside it was unreachable.
- Every surface that mentions a failure — the notice, the Captain thread, the Dashboard's interrupted row, the session marker — says only that one happened.
- Playbook now states the cause as data with a closed code list and bounded evidence, and states each action's standing.
  The interface's job is to phrase, not to diagnose.

## Decision

- **One catalogue.**
  The interface holds one table mapping every failure code Playbook exports to a plain phrase, an optional Boss step naming what to do outside Spex, and the evidence it prints.
  A test imports Playbook's code list and fails when a code has no row, so no failure kind ships unexplained.
- **The card.**
  At the failure's place in the Captain thread, replacing the bare status line, a failure card says in three lines what failed (the workflow's command and the step's plain name), why (the catalogue phrase with its evidence, paths included), and what now (the Boss step where the catalogue has one, and each control's standing).
  The runtime's own message stays in the tooltip.
- **One control per advertised action.**
  The parked-run notice carries the why and what-now lines and one control per action the session summary publishes, labelled with the action's own label, plus Drop.
  A `no-op` or `blocked` action stays visible, disabled, its reason a phrase; no control is chosen for the Boss, and the first-advertised rule goes.
- **A failure that parked no run** keeps its notice and gains the why line and the Boss step.
- **Every mention phrases the cause**: the Dashboard's interrupted row and the session marker's tooltip use the catalogue phrase.
- **The card survives a restart**: the cause lives in the stored stream and the published summary.
- **A carried change is Playbook's to say**: the report a settled commit's absorbed or altered pre-existing changes earn reaches the Boss inside the Captain's reply, and the interface adds nothing of its own to it.

## Consequences

- The Boss reads what happened and what each control will do without a model between the facts and the words.
- The catalogue is a product surface: its phrases follow [DR-069](069-key-phrases-not-sentences.md), and a new Playbook code is a failing test until it is phrased.
- A run's own advertised actions replace the interface's notion of "a retry", so abandonment and reconciliation become distinct, honestly labelled controls.
- The fixtures that park a run must carry a cause, so the recorded streams are re-captured from a real core.
