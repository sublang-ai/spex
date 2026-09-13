<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-060: A Control For A Failed Workflow

## Status

Accepted (2026-09-12) on the owner's report that a `/dev` turn parked in its recoverable failure state offered no way back but prose in the composer.
Extends [DR-047](047-explicit-session-recovery.md) from the uncertain turn to the settled-but-parked workflow; the two conditions never stand together.
Extended by [DR-061](061-run-state-from-frames.md), which reads the parked run from the same frames this notice reads for the state chip and the interface's failure attention; the notice's own behavior is unchanged.
Amended by [DR-062](062-ending-a-failed-workflow.md): Drop stands beside Retry, and Retry becomes the deterministic runtime selection this record deferred until Playbook advertised one; the notice's placement, wording, and busy and disabled forms stand.

## Context

- A workflow that fails recoverably parks and narrates `◆ workflow failed; awaiting Boss recovery.`, and the session's state chip reads failure — but the interface offers nothing to activate.
  The only route back is prose the Boss invents, and whether it is understood is the session Captain's judgment.
- Playbook already owns the correct recovery: the parked leaf advertises its own runtime actions, a retry among them, withheld while the failed attempt's repository effects are unresolved.
  The shell executes one only when the leaf's current control view still advertises it.
- The published Playbook surface does not reach that list [[1]].
  The host holds a session controller whose turn entry takes Boss text; the leaf's control view is read only inside the shell, to compose the hidden decision prompt.
  The deterministic command parse resolves to `respond`, `start`, `deliver` or `switch`, never to a runtime action.
- The failure this control exists to recover from was a refused model call.
  A recovery that itself depends on a model call shares that failure mode.

## Decision

- The run view stands a failed-workflow notice while a continuable session's leaf run is parked in its recoverable failure state, between the Captain pane and the composer, carrying one Retry control.
  The notice speaks plainly, says what the control does, and wraps its control under its words in a narrow pane.
  An uncertain session shows the interrupted-turn controls instead, never both.
- Until Playbook advertises its recovery actions to hosts, Retry submits one canonical Boss turn asking the Captain to run the workflow's advertised recovery.
  The submission is an ordinary turn: it appears in the thread as the Boss's own message with its exact words, follows the composer's admission, and its outcome is read from the conversation like any other.
  The interface claims no more than that — it asks; it does not itself recover.
- The destination is deterministic.
  When Playbook publishes the leaf's advertised runtime actions and accepts a host-submitted runtime selection — one that enters with its decision already made, as a parsed command does — Spex renders each advertised action as its own control and executes the chosen one with no model call on the recovery path.
  The core gains one command for that selection and the session report gains the advertised list; the notice, its placement, its label and its busy and disabled forms do not change.
- The interim ends at that adoption, recorded as a floor bump like every other ([DR-053](053-model-options-adoption.md)).
  Spex requests the Playbook change rather than working around it: no prompt is parsed, no internal record is scraped, and no reconstructed request text is delivered in a retry's name.

## Consequences

- The owner stops guessing words today, one release before the guess disappears.
- While the interim stands, Retry can settle as an ordinary Captain reply rather than a retry, and it stands even where the leaf withholds replay — the shell's refusal is then reported in the thread.
  Both are visible in the conversation; neither is silent.
- The recovery path keeps one model call until the adoption lands, so a provider refusal can block recovery the same way it blocked the turn.
- The interim's spec items are written so the adoption rewrites one behavior item and adds one protocol item, leaving placement, wording and verification intact.
- Advertised actions other than retry — a resumable jump, unresolved-effect reconciliation or abandonment — become renderable for free at the adoption; this decision commits only to drawing what the leaf advertises.

## References

[1]: https://github.com/sublang-ai/playbook/blob/main/reference/sdlc/code.playbook/session-host.d.ts "Playbook SessionHostController: the host's session surface"
