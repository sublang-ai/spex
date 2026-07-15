<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-009: At-Hand Interaction Principle

## Status

Accepted

## Context

- The owner's review (2026-07-11): configuring the captain jumped to Settings mid-conversation — an interruption.
  The general principle behind the complaint: a user in a flow should find every needed piece of information and operation **at hand**, instead of jumping between surfaces and internalizing the app's layout.
- Several existing affordances already violated or nearly violated this: profile editing only in Settings, playbook discovery only in the Library, ended-session transcripts unreachable, attention visible only on the Dashboard or the dock.

## Decision

- **Primary flows never require a surface switch.**
  Starting a run, steering it, answering a question, switching or tweaking the agents involved, and reviewing what happened all complete inside Sessions.
- **Objects are editable where they are shown.**
  Wherever a profile is referenced (captain identity, role mappings), a small affordance opens an **anchored popover** that switches the profile and edits its essentials (model, reasoning effort) in place, with the same fail-closed validation as Settings.
  Full editors (Settings, Library) remain the canonical deep views; in-place popovers cover the common 90%.
- **Attention is visible from anywhere.**
  The Sessions navigation entry carries a badge with the count of sessions needing a human (questions, failures), consistent with the dock badge.
- **Creation flows may navigate; dependence may not.**
  Heavyweight creation (compiling a playbook) lives on its surface, but is discoverable from the flow (a "compile a new playbook" entry at the end of the slash menu).
- **Nothing the user produced becomes unreachable.**
  Ended sessions stay browsable: the Captain home lists recent past sessions, and opening one shows its full read-only transcript with an affordance to start a fresh session.
- New surfaces and affordances are held to these rules; deviations need a recorded decision.

## Consequences

- Popovers duplicate slices of Settings; the shared validation path (one `config.edit` protocol op) keeps them consistent.
- The nav badge derives from the same attention rules as the Dashboard ([DASH-11](../packages/dashboard.md#dash-11)), so the two never disagree.
- Read-only transcripts reuse the run view with input disabled rather than a separate viewer.
