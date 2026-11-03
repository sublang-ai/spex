<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-212: Panel Dismissal as Quiet Chrome

## Status

Accepted (2026-11-03) following the owner's review of the wide and narrow application screenshots and approval to merge and push.
Amends [DR-211](211-a-panel-carries-its-own-way-out.md) in header dismissal presentation.
The dismissal, focus, pending-operation and attention-preservation behavior of [DR-211](211-a-panel-carries-its-own-way-out.md) remains.

## Context

A bordered text Close gave temporary-view dismissal the weight of a task action.
A close-only strip and a narrow Members header also separated the control from the visible edge of the surface it closes.
The refinement needs evaluation with the owning group and neighboring content visible, not only as an isolated card.

## Decision

- Header dismissal uses the app's existing cross icon as quiet, borderless chrome with a neutral resting tone, hover feedback, a visible keyboard-focus indicator and a target at least 24 by 24 pixels.
  Its localized accessible name and tooltip say Close, including the target where context helps; browser preparation retains the tooltip explaining that closing cancels setup while it runs.
  Cancel for an unfinished form and Close beside a completed result remain text actions.
- The cross sits inside the visible panel frame at the trailing edge of its header, without an otherwise empty close-only strip.
  The project palette integrates it with its title or search row, including the existing group-chooser title.
  Browser setup has a named, fixed header; only its body scrolls.
- An attached Members header spans its owning expansion, with the title and count on the leading side, Invite members before an independent trailing cross.
  The title and invitation action can wrap within their own region at narrow widths while the cross retains its corner position; the editor and roster below keep their bounded reading width.
  The standalone Members view remains bounded with its own frame.
  A dismissed-only review places its cross inside the Dismissed card, outside that disclosure's summary control.
- Visual review covers the complete containing surface at a wide viewport and the 320-pixel floor in English and Chinese, in light and dark themes.
  Space evidence includes the owning group and neighboring groups or project rows so header alignment and expansion width can be assessed in context.

## Consequences

The dismissal affordance reads as panel chrome while task actions retain their visible verbs.
The package requirements describe the accepted refinement, verified through functional tests and visual review in the containing application.
