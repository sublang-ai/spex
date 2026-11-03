<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-214: Project Navigation and Contextual Recovery

## Status

Accepted (2026-11-03) on the owner's request to review the purpose and priority of every left-panel entry.
Amends [DR-196](196-a-review-count-and-a-way-back.md) and [DR-197](197-dismiss-reminders-without-losing-history.md) in naming the saved-file review Files & history and in the return path for optional folder recovery: Space → Files & history → Dismissed replaces Locate project files in the sidebar.
Amends [DR-175](175-projects-shown-where-they-are-open.md) in sidebar availability by restoring headings only for places holding or opening projects.
Amends [DR-195](195-read-saved-conversations-before-locating-files.md) in returning from saved history directly to its place's review.

## Context

The sidebar's daily destinations and project tree describe where work happens.
Locate project files restores the folder relationship of saved conversations; it neither searches files nor opens a file browser.
Giving optional recovery a project-tree row, and another folder icon per place in collapsed navigation, makes an occasional maintenance action look like a project or a permanent destination.
Dismissed reminders can retain those entries indefinitely.
Space already keeps its review available while any diagnostic remains, including at zero pending notices, and its Dismissed section retains the conversations and folder actions.
Review names an action without saying what is inside.
The panel holds project-folder choices and notices about unreadable conversations or other saved files; it is no archive of all history, and its presence does not establish that data was lost.

## Decision

- Keep Dashboard, Projects, Playbooks, Space and Settings as the sidebar's destinations; reserve its tree for projects and their conversations, with place headings only while a server holds or is opening a project.
- Remove Locate project files from expanded and collapsed navigation; optional recovery adds no destination, badge or task-only place heading.
- Name the Space control Files & history, retaining the pending-notice count and its existing warning meaning; its accessible name spells out that the count is notices.
- Keep Files & history and its count-bearing form as whole phrases outside the compact control-label budget, wrapping within their available width.
- Return to dismissed folder tasks through Space → Files & history → Dismissed, selecting the relevant computer or server on Space where needed; an ordinary Files & history visit keeps Dismissed collapsed.
- Dismissal confirmation names Dismissed within Space → Files & history and confirms that saved work is preserved; saved-conversation guidance names Space → Files & history, since its folder task may still be active.
- A saved conversation remains readable at its own place even when that place holds no registered project.
- Back to Space in a saved conversation opens review at that conversation's own place and reveals dismissed folder tasks, placing focus on Files & history and returning focus there when review closes, without registering a project, changing a dismissal or starting work.
- Keep Locate project files as the contextual heading inside review, where its explanation and project-specific folder actions make its purpose clear.

## Consequences

Daily project navigation loses recovery-only rows and repeated collapsed icons.
Optional recovery remains reachable without a registered project, a positive warning count or a sign-in.
Saved conversations provide a direct return to the folder choices they depend on, while dismissal stays quiet until the reader returns.
