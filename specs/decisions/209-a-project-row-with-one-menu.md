<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-209: A Project Row with One Menu

## Status

Accepted (2026-11-02) after the owner approved the project-row refinement and directed delivery.
Amends [DR-041](041-chrome-that-fits.md), [DR-172](172-surfaces-a-fresh-user-reads.md).
Amended by [DR-226](226-project-names-align-with-their-actions.md), [DR-246](246-remove-groups-and-team-servers-from-the-clients.md).

## Context

- A project row offered Show and an overflow, beside a count with no noun and an amber statement that code was only on this computer.
  Their wording and separate triggers made the jobs of opening, syncing and managing records hard to distinguish.
- The Space and its Git host store a project's records, never its code: code is on the person's own Git host, or only in a folder.
- The missing-code status means the project records name no code remote, not that its folder is not a Git repository or that no backup exists.
- Opening code and reading records are separate: a missing code remote prevents cloning the project's code on another computer, while access to saved sessions follows the records' availability.
- The owner requested consistency with the containing page and the app's shared components.

## Decision

- Amends [DR-172](172-surfaces-a-fresh-user-reads.md) in the row vocabulary and actions.
- Keep the compact, flat project row and the existing type, spacing, button, menu, focus, theme and attached-panel grammar.
- The direct action reads Open project, opening the project on this computer; one More overflow holds every secondary action, and the project palette uses that same overflow idiom.
- The records status names its counted object: 1 record to sync or the plural count.
  Activating a row's standing phrase opens its existing Sync details; Sync records names the overflow's synchronization action.
- A missing code remote reads Code remote not configured in the neutral tone and opens a quiet attached explanation.
  The explanation directs the reader to configure the working folder's Git origin and sync records to update the project's recorded code address.
- A new project is always this computer's; the Space never holds a project's code.
- Amends [DR-041](041-chrome-that-fits.md): clickable standing phrases and code statuses retain their informative wording outside the fourteen-character action-label budget and fit within the row's width.

### Considered and declined

- Hosting a project's code at the Space beside its records: the Space keeps to records, and a project's code lives on the person's own Git host.
- "Code: no remote": Git's word for what is missing, not the reader's word for where the code is.

## Consequences

- The Space row and project palette expose one secondary menu while preserving their existing opening, synchronization and records-reading behavior.
- The Space specifications and their verification distinguish code configuration from records synchronization and use the same labels across interface languages.
- Existing metadata refresh on record sync remains the recovery path after a folder's origin changes; no separate linking operation is introduced.
