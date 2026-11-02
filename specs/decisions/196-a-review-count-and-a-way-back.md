<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-196: A Review Count and a Way Back

## Status

Accepted (2026-11-02) on the owner's request for one shared explanation, a meaningful warning count and a clear return path after Not now.
Amends [DR-194](194-saved-work-is-a-choice-not-setup-debt.md) in the header's attention marker and count, and [DR-195](195-read-saved-conversations-before-locating-files.md) in explanation placement and deferred navigation.
Amends [DR-175](175-projects-shown-where-they-are-open.md) in sidebar availability: a place with a saved-record folder task has a useful review entry even without a registered project.

Amended by [DR-197](197-dismiss-reminders-without-losing-history.md) in unified dismissal, separated active and dismissed items, and preserved-history notice acknowledgement.

## Context

Saved work names neither the problem nor an action.
A postponed task needs a stable way back after the warning is acknowledged, including when no project folder has been registered.
The count includes unrelated stored-file diagnostics as well as folder tasks, so it cannot claim to count missing projects or files.
The existence of a saved conversation does not establish whether its project files are absent from the computer.

## Decision

- Explain once above the folder tasks: conversation history is saved on this computer, identified conversations can be read now, and work on a project needs its files to be located; name the selected server instead where appropriate, explain only the required files when no conversations are recorded, and make no unsupported claim that project files are absent.
- Remove the repeated per-project explanation and the extra sentence about leaving missing files for later.
- The top-right control is Review with the core's pending-notice count and a warning icon while that count is positive; with only postponed tasks it remains neutral Review without an icon or zero badge.
- Opening review alone acknowledges nothing; Not now removes exactly its folder task from the count, preserving unrelated notices and its saved conversations.
- Locate project files remains under Projects in the sidebar while any saved-record folder task exists, including postponed tasks; it opens that place's existing review directly and is available in collapsed navigation too.
- The entry is a navigation action, never a fabricated registered project or an archive of all conversations.
- Not now acknowledges the choice by naming the sidebar return path; a successful folder selection removes the task, and the sidebar entry leaves only after the last such task is gone.
- Nonblocking review stays initially closed and neutral; only an actual blocker opens it automatically and colours the panel as a warning.

## Consequences

The warning is dismissible without making the task undiscoverable.
A shared explanation replaces repeated instructions, while project-specific titles, conversations and recorded folders remain together.
The existing local postponement preference remains authoritative across restarts.
