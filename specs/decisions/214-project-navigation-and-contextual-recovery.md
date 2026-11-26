<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-214: Project Navigation and Contextual Recovery

## Status

Accepted (2026-11-03) on the owner's request to review the purpose and priority of every left-panel entry.
Amends [DR-194](194-saved-work-is-a-choice-not-setup-debt.md), [DR-195](195-read-saved-conversations-before-locating-files.md), [DR-197](197-dismiss-reminders-without-losing-history.md).
Amended by [DR-246](246-remove-groups-and-team-servers-from-the-clients.md).

## Context

The sidebar's daily destinations and project tree describe where work happens.
Locate project files restores the folder relationship of saved conversations; it neither searches files nor opens a file browser.
Giving optional recovery a project-tree row, and another folder icon in collapsed navigation, makes an occasional maintenance action look like a project or a permanent destination, and dismissed reminders can retain those entries indefinitely.
A dismissed task still needs a stable way back, including when no project folder has been registered.
Space already keeps its review available while any diagnostic remains, including at zero pending notices, and its Dismissed section retains the conversations and folder actions.
The review holds project-folder choices and notices about unreadable conversations or other saved files, so its count cannot claim to count missing projects or files; it is no archive of all history, and its presence does not establish that data was lost.

## Decision

### Navigation

- Keep Dashboard, Projects, Playbooks, Space and Settings as the sidebar's destinations, and reserve its tree for projects and their conversations.
- Optional recovery adds no destination, badge or tree row in expanded or collapsed navigation.

### Files & history

- Amends [DR-194](194-saved-work-is-a-choice-not-setup-debt.md) and [DR-197](197-dismiss-reminders-without-losing-history.md): the Space control opening the saved-file review is named Files & history, and the return to optional folder recovery is through Space → Files & history → Dismissed.
- Files & history carries the core's pending-notice count with a warning icon while that count is positive; with only dismissed tasks it stays neutral, with no icon or zero badge; its accessible name spells out that the count is notices.
- Files & history and its count-bearing form are whole phrases outside the compact control-label budget, wrapping within their available width.
- Opening review acknowledges nothing; dismissing a folder task removes exactly that task from the count, preserving unrelated notices and its saved conversations.
- Nonblocking review stays initially closed and neutral; only an actual blocker opens it automatically and colours the panel as a warning.
- One explanation stands above the folder tasks, not under each project: conversation history is saved on this computer, identified conversations can be read now, and work on a project needs its files located; with no conversations recorded it explains only the required files, and it never claims that project files are absent.
- Keep Locate project files as the contextual heading inside review, where its explanation and project-specific folder actions make its purpose clear.
- An ordinary Files & history visit keeps Dismissed collapsed; a dismissal's confirmation names Dismissed within Space → Files & history and confirms that saved work is preserved.

### Saved conversations

- Amends [DR-195](195-read-saved-conversations-before-locating-files.md): saved-conversation guidance names Space → Files & history, since its folder task may still be active, and the reader returns there directly.
- A saved conversation remains readable even when the home holds no registered project.
- Back to Space in a saved conversation opens review and reveals dismissed folder tasks, placing focus on Files & history and returning focus there when review closes, without registering a project, changing a dismissal or starting work.

## Consequences

Daily project navigation loses recovery-only rows and repeated collapsed icons.
Optional recovery remains reachable without a registered project, a positive warning count or a sign-in.
Saved conversations provide a direct return to the folder choices they depend on, while dismissal stays quiet until the reader returns.
