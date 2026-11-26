<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-009: At-Hand Interaction Principle

## Status

Accepted.
Amended by [DR-019](019-inline-agent-configuration.md), [DR-029](029-session-history-home.md), [DR-035](035-intent-ledger.md), [DR-066](066-every-summons-has-a-door.md), [DR-067](067-tuning-for-one-conversation.md).

## Context

- The owner's review (2026-07-11): configuring the captain jumped to Settings mid-conversation — an interruption.
  The general principle behind the complaint: a user in a flow should find every needed piece of information and operation **at hand**, instead of jumping between surfaces and internalizing the app's layout.
- Several existing affordances already violated or nearly violated this: agent editing only in Settings, playbook discovery only in the Library, ended-session transcripts unreachable, attention visible only on the Dashboard or the dock.

## Decision

- **Primary flows never require a surface switch.**
  Starting a run, steering it, answering a question, switching or tweaking the agents involved, and reviewing what happened all complete inside the project's session tabs.
- **Objects are editable where they are shown.**
  Wherever an agent is shown (the Captain's identity, a player, a role binding), its chip opens an **anchored popover** with the agent's editor in place ([DR-019](019-inline-agent-configuration.md)), with the same fail-closed validation as Settings; an in-place editor that writes a scope other than the default names the scope it writes ([DR-067](067-tuning-for-one-conversation.md)).
  Full editors (Settings, Playbooks) remain the canonical deep views; in-place popovers cover the common 90%.
- **Attention is visible from anywhere.**
  The Dashboard navigation entry carries a badge with the count of sessions needing a human (questions, failures) across every project, consistent with the dock badge, the aggregate view owning the aggregate signal ([DR-029](029-session-history-home.md)); inside Projects the same rules mark the project and session rows that need one.
  Every attention entry carries the act that clears it on its own row, so clearing a summons needs no surface switch ([DR-066](066-every-summons-has-a-door.md)).
- **Creation flows may navigate; dependence may not.**
  Heavyweight creation (compiling a playbook) lives on its surface, but is discoverable from the flow (a "compile a new playbook" entry at the end of the slash menu).
- **Nothing the user produced becomes unreachable.**
  Past sessions stay browsable: the sidebar lists every project's sessions ([DR-029](029-session-history-home.md)), and opening one shows its full transcript, which a message continues.
- New surfaces and affordances are held to these rules; deviations need a recorded decision.

## Consequences

- Popovers duplicate slices of Settings; one shared validation path keeps them consistent.
- The nav badge derives from the same attention rules [[dashboard-1](../packages/dashboard.md#dashboard-1)] as the Dashboard [[dashboard-9](../packages/dashboard.md#dashboard-9)], so the two never disagree.
- Past transcripts reuse the run view rather than a separate viewer.
