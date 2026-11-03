<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-192: Choose a Group Before Adding

## Status

Accepted (2026-11-02) on the owner's approval of a visible task title, labelled Space, selectable groups and explicit confirmation before adding a local project.
Amends [DR-172](172-surfaces-a-fresh-user-reads.md) in the group picker's wording and hierarchy, and [DR-159](159-projects-in-groups-opened-where-you-work.md) in the flow opened by "Add to a group…".
Amends [DR-011](011-project-workspace.md) in palette dismissal while a group submission is pending.
Extends [DR-069](069-key-phrases-not-sentences.md): destination and record-access consequences belong beside the confirmation they inform.

Amended by [DR-187](187-the-group-chooser-belongs-to-its-project.md) in the chooser’s attachment to its project row and consistent typography.

Amended by [DR-198](198-consistent-inline-group-actions.md) in repeated activation of the chooser, which focuses and preserves its existing state.

Amended by [DR-215](215-add-to-a-group-and-start-working.md) in the sharing review and the action continuing to the selected server.

## Context

"Add to a group…" opened an untitled panel headed by a Space's address and "Share into".
The group rows looked like fields, and choosing one immediately created or connected records.
The user could neither distinguish Space from group nor review the effect before it began.

## Decision

- One bounded inline form, visibly titled "Add <project> to a group", names the Space beside its label on one line, wrapping the value as needed; one eligible Space is static context, several use one selector.
- "Choose group" is a list of radio rows, Personal first with "Your personal group" as its explanation, and no destination selected initially.
  Choosing a destination changes only the form; changing Space clears that choice.
- A separate "Connect to an existing project" section offers matching projects already in the selected Space, naming their groups and explaining that connecting combines records.
- The selected destination's review names its group and Space and names conversations, agent activity and attachments, includes existing and future records, and says that removing access cannot erase copies members already saved.
  Personal makes no unverified privacy promise; public visibility is explicit where known.
- "Add to group", or "Connect project" for an existing project, is the sole committing action.
  The existing-project review carries its required sharing acknowledgement; creating records does not pre-acknowledge the fresh access check of the first sync.
- Pending submission stays visible and blocks duplicates and dismissal, including Escape, Cmd/Ctrl+P and backdrop clicks; failure retains the choice for retry; cancellation restores focus; success acknowledges the accepted operation without claiming that a later sync has completed.

## Consequences

The Space contract, English and Chinese copy, integration tests and browser journeys change together.
Selection and submission are tested separately, including existing-project acknowledgement, multiple Spaces, refusal and keyboard use.
The form follows the existing fit and theme rules; no new navigation destination or protocol command is added.
