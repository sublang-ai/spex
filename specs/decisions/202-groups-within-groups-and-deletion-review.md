<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-202: Groups Within Groups and Deletion Review

## Status

Accepted (2026-11-02) on the owner's request for complete, simple group creation and a way to collapse and revisit scheduled deletions.
Amends [DR-172](172-surfaces-a-fresh-user-reads.md) in creating a group inside another group, and [DR-193](193-group-deletion-follows-the-space-policy.md) in scheduled groups' presentation.
Applies [DR-198](198-consistent-inline-group-actions.md)'s editor, focus and pending-mutation guarantees.

## Context

The Space can retain a scheduled group for its recovery period, but an undismissable warning gives no explanation of the wait and crowds the active groups.
The client learns that deletion has completed through a fresh Space read; elapsed time alone proves neither completion nor failure.
The protocol already supports creating a group inside a permitted parent, while the interface offers creation only at the root.

## Decision

- Each Space separates pending groups into one initially collapsed **Scheduled for deletion (N)** section, retaining their names, full paths and compatible nesting inside it.
  The disclosure reopens the section; Hide or Escape collapses it without changing deletion or restoration.
  A count includes every pending group, including inherited schedules; active replacements at the same path stay in the active list.
  The section retains its open or closed state through Refresh while this surface remains mounted; no stored dismissal records are needed.
- The expanded section explains that the Space controls when deletion takes effect and that Refresh checks completion, without inventing a recovery period, countdown or deadline.
  A completed fresh read removes groups no longer reported and removes the section when empty.
  A scheduled group carries quiet status and permitted Restore, with the deletion root named for an inherited schedule.
- A newly accepted scheduled deletion opens its section and leaves focus on a surviving control there.
  A successful restoration returns the group to the active list and focus to its heading control.
  Mutations retain their task and disable collapse or duplicate submission until the reply; failures remain visible and focus never follows a removed control.
- A permitted active group's More menu offers **New group…**, reusing the existing creation editor under that heading.
  The editor names the parent, its full path and Space and explains that the parent's members gain access to the new group.
  Creation sends that parent's stable id; the same action on the Space heading still creates at the root.
  Lost permission or connection disables submission through both pointer and keyboard, preserving the draft and Cancel.

## Consequences

One disclosure handles dismissal and return without a second trash system or permanent-deletion shortcut.
Deletion timing stays authoritative at the Space; a long wait alone is not presented as a failed deletion.
Nested creation uses existing contracts, terms, permissions and controls.
Rendered integration and served-browser journeys cover transitions, errors, focus, permissions and narrow layouts; the core integration suite verifies eventual disappearance on Refresh without removing a same-path replacement.
