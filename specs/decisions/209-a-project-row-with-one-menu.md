<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-209: A Project Row with One Menu

## Status

Accepted (2026-11-02) after the owner approved the project-row refinement and directed delivery with language scoped to opening code on a server.
Amends [DR-159](159-projects-in-groups-opened-where-you-work.md) in its project-row controls and palette, [DR-172](172-surfaces-a-fresh-user-reads.md) in its row vocabulary and actions, [DR-175](175-projects-shown-where-they-are-open.md) in its code phrase and opening controls, and [DR-041](041-chrome-that-fits.md) in the label budget for clickable status text.

## Context

- A project row offered Show, a separate opening-destination arrow and an overflow, beside Here, a count with no noun, and an amber statement that code was only on this computer.
- Show opens the project workspace; the arrow chooses another place; the overflow holds records and management actions.
  Their wording and separate triggers made those jobs hard to distinguish.
- The missing-code status means the project records name no code remote, not that its folder is not a Git repository or that no backup exists.
- Code opening and records access are separate: a missing code remote prevents opening the project's code on a server, while access to saved sessions follows the records' availability and membership.
- The owner requested consistency with the containing page and the app's shared components.

## Decision

- Keep the compact, flat project row and the existing type, spacing, button, menu, focus, theme and attached-panel grammar.
- The direct action for an already-open project reads Open project; server destinations read Open on the server's name whether opening or showing an existing project there.
- One More overflow holds secondary actions and alternate opening destinations, the latter grouped under Open elsewhere.
  The project palette uses that same overflow idiom.
- Local availability reads This computer as plain secondary text; a server's name identifies availability at that place.
- The records status names its counted object: 1 record to sync or the plural count.
  Activating a row's standing phrase opens its existing Sync details; Sync records names the overflow's synchronization action.
- A missing code remote reads Code remote not configured in the neutral tone and opens a quiet attached explanation.
  The explanation directs the reader to configure the working folder's Git origin and sync records to update the project's recorded code address.
- A server-opening entry blocked for that condition gives its reason visibly: "A Git remote is required to open this project's code on a server."
  It makes no claim about general server use or reading saved sessions.
- Clickable standing phrases and code statuses retain their informative wording outside the fourteen-character action-label budget and fit within the row's width.

## Consequences

- The Space row and project palette expose one secondary menu while preserving their existing opening, synchronization and records-reading behavior.
- The Space specifications and their verification distinguish code configuration from records synchronization and use the same labels across places and interface languages.
- Existing metadata refresh on record sync remains the recovery path after a folder's origin changes; no separate linking operation is introduced.
