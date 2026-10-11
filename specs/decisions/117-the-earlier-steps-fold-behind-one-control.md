<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-117: The Earlier Steps Fold Behind One Control

## Status

Accepted (2026-10-11) on the 2026-10-11 workshop's finding that a run interrupted by a core restart offered seven near-identical rows.
Amends [DR-075](075-a-failure-says-what-and-what-now.md) in the parked-run notice's layout alone: the actions resuming from an earlier step fold behind one secondary control; one control per advertised action, each with its own label and standing, the no-op rule, Drop and the card stand.

## Context

- After the core restarted under a running `/shape`, the notice drew one Retry, six "Resume from: …" controls and Drop, each label ellipsed at its control's width.
- Retry was the right act and stood first, but six resumes reading alike asked a participant to understand the machine before continuing.
- Playbook advertises a resume, `jump:<stateId>`, for every earlier step the parked run can re-enter, labelled with that step's description, so their count follows the machine rather than the failure.

## Decision

- **The row keeps the failure's own acts.**
  Every advertised action that is not a resume — a retry, a reconciliation, an abandonment — stands in the notice's row in the order advertised, with Drop beside it.
- **The resumes fold.**
  Where the run advertises any, one secondary control, "Resume from an earlier step…", stands in the row and opens their list in place inside the notice, in the order advertised.
- **A folded row reads whole.**
  Each resume stays a control of its own, its whole label wrapped rather than ellipsed; the list scrolls once it outgrows its bound.
- **Nothing is hidden or chosen.**
  Every resume is one gesture away and shows its standing as any control does; what folds is decided by the action's own verb in Playbook's `<verb>:<target>` grammar, never by the interface judging which act is better.

## Consequences

- The notice reads at a glance: the failure's own act and the way out, the rarer entry points a gesture away.
- A longer machine adds rows to a scrolling list rather than controls to the row, so the notice fits its pane's floor however many steps a run can re-enter.
- The interface reads one verb from Playbook's action grammar; an action of another verb stands in the row until a decision folds it.
