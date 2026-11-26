<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-029: Sessions In The Sidebar

## Status

Accepted.
Amends [DR-007](007-conversational-session-start.md), [DR-009](009-at-hand-interaction.md), [DR-011](011-project-workspace.md).
Amended by [DR-038](038-history-is-done-work.md), [DR-042](042-sessions-continue.md), [DR-044](044-no-money-in-the-interface.md), [DR-051](051-runtime-held-for-a-turn.md), [DR-057](057-space-surface.md), [DR-066](066-every-summons-has-a-door.md), [DR-246](246-remove-groups-and-team-servers-from-the-clients.md).

## Context

- Ended sessions are already browsable — the Captain home lists them, and opening one replays its full read-only transcript — yet the product's own owner could not find a finished session minutes after watching it run.
  A feature the owner cannot find is not discoverable by anyone.
- The diagnosis, in order of harm:
  - the list lives behind the `+` tab — a door labeled "new", not "history" — and while a session runs, its own tab fronts and the home stays hidden;
  - entries carry no scent: a project name and an absolute timestamp, so no conversation is recognizable — every row reads alike;
  - a just-ended session gives the eye no handoff to its new home, so the mental model "ended sessions live on the home" never forms;
  - the read-only replay's header names the project, not the conversation.
- The thread itself became the run's record — bubbles and settled machine cards replaying identically ([DR-028](028-run-machine-view.md)) — so an ended session is now a complete, legible artifact worth shelving properly.
- The instant messenger is the pane's stated form (DR-010 §1), and messengers — like editors before them — put the navigator in the sidebar and the working set in tabs: the sidebar says what exists, tabs say what is open.
- The four navigation entries were peers, which said the app has four equal places; in truth one of them (Dashboard) answers "what needs me anywhere" and another (Workspace) answers "what am I doing in this project" — a difference the flat list hid.

## Decision

- **The sidebar is the navigator; tabs are the working set.**
  The sidebar lists what exists — every project, and under each its sessions; the tab strip holds what is open.
  Activating a session anywhere in the sidebar makes the workspace show that session's project and opens the session as a tab, so one gesture crosses projects ([DR-011](011-project-workspace.md)'s project-first workspace stands: the sidebar is now how a project is chosen).
- **Attention sits at the top, globally.**
  Dashboard is the sidebar's first entry and carries the app's attention count across every project — the aggregate view owning the aggregate signal ([DR-009](009-at-hand-interaction.md)); the Projects section below it ([DR-057](057-space-surface.md)) is the project perspective, listing the projects of the one core the IDE connects to ([DR-246](246-remove-groups-and-team-servers-from-the-clients.md)).
  A project whose sessions need a human shows that on its own row, so a collapsed project never hides a waiting question.
- **Sessions read as conversations.**
  Each row carries its session's title — the first Boss turn — its relative time, and a status mark.
  The mark speaks attention first and life second, in the app's one status palette: a session waiting on the human is amber and an unacknowledged failure is red, exactly as its tab and its Dashboard row already say, each in its entry's own words ([DR-066](066-every-summons-has-a-door.md)); the session states [DR-051](051-runtime-held-for-a-turn.md) names are the quieter rest.
  A failure that is history, not a summons, wears a quieter mark and counts toward no badge, so red always means "chase this".
  The fuller scent — the turn count — rides in the row's accessible description, never a cost ([DR-044](044-no-money-in-the-interface.md)), reachable by pointer, keyboard, and screen reader alike, because a sidebar is too narrow to print it and hover is not a channel ([DR-026](026-data-graphics-craft.md) §5).
  The active row wears the app's interaction hue, the same treatment the navigation entries already use, so what is open is unmistakable.
- **Disclosure is its own axis.**
  A project's chevron discloses; its row selects.
  Expansion is never a function of which project is current, so history in another project is browsable without moving the workspace into it — the axis split [DR-027](027-linked-views-contract.md) already legislated for the spec view, applied to the same shapes here.
- **Closing files a session away.**
  A tab's close control files the session back to the sidebar and never stops an agent; a session is a conversation a message continues, with no ending control ([DR-042](042-sessions-continue.md), [DR-051](051-runtime-held-for-a-turn.md)).
  A project's "new session" control opens that project's start tab.
- **Every project shows a recent window, never an unbounded list.**
  A project lists its most recent sessions with one control that reveals the rest in place, so the sidebar's height stays a function of attention rather than of history's age.
- **The working set belongs to this launch.**
  Which tabs are open is per project and not persisted: a launch restores the current project and opens its working session if it has one, else its start tab, and the sidebar — which is durable — is how everything else comes back.
- **The chrome folds, and folding costs nothing.**
  The sidebar collapses to an icon rail and restores under [DR-030](030-workspace-chrome.md), keeping the Dashboard badge and every accessible name; its width is fixed at each state, because two good widths beat a knob.
  Collapse is chrome only: the open tabs remain the reach, so nothing becomes unreachable behind it.
- **The project bar retires.**
  The sidebar carries project identity, so the bar above the tabs would be a second, quieter answer to the same question; the project palette stays the keyboard's fast path, and the affordances the bar carried — adding and creating projects — move into the sidebar's Projects section beside the projects they make.

**Considered and declined**, so the alternatives cannot re-enter piecemeal:

- a session list inside the Captain home (the first design): history sat behind the same door that hid it, and vanished the moment a session filled the surface;
- a History dropdown on the tab strip (the second): a labeled door is still a door, and it left the strip owning two different jobs;
- a separate sessions column beside the sidebar: two navigators competing for the same axis, when the sidebar was already there;
- sessions as tabs alone (the shipped design): tabs are a working set, not an archive — everything unopened was invisible;
- motion replay or scrubbing of a past run: the thread and its settled machine cards are the record; animating history is its own future decision;
- searching history: the recent window plus titles suffices at today's volumes; search earns a decision when volume demands it;
- persisting the open tabs across launches: the sidebar already restores everything.

## Consequences

- The core-service package holds the session-listing contract — the reply's lifecycle fields plus title, turn count and failure marker — and the matching state a session broadcasts, since a row watched live must not blank when its turn settles.
- The run-view package holds the sidebar's structure, its session rows, the session-to-tab gesture and the tab strip as the working set.
- The `spex-academy` demo flow becomes self-evidencing: a finished demo run is findable by its own first message minutes later.
