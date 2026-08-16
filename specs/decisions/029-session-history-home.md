<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-029: Sessions In The Sidebar

## Status

Accepted.
Realizes [DR-009](009-at-hand-interaction.md)'s "nothing the user produced becomes unreachable" as first-class law; extends [DR-007](007-conversational-session-start.md)'s start view into the session home.

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
  Dashboard is the sidebar's first entry and carries the app's attention count across every project — the aggregate view owning the aggregate signal ([DR-009](009-at-hand-interaction.md)); the Workspace section below it is the project perspective.
  A project whose sessions need a human shows that on its own row, so a collapsed project never hides a waiting question.
- **Sessions read as conversations.**
  Each row carries its session's title — the first Boss turn — with a status mark: running, ended, ended holding a failure, or a session that never spoke.
  A row's fuller scent — its relative time, turn count, and cost — rides in its tooltip, because a sidebar is too narrow for a full listing and status is what the eye scans for.
  The active row wears the app's interaction hue, the same treatment the navigation entries already use, so what is open is unmistakable.
- **Every project shows a recent window, never an unbounded list.**
  A project lists its most recent sessions with one control that reveals the rest in place, so the sidebar's height stays a function of attention rather than of history's age.
- **Ending a session moves nothing.**
  The transcript stays where the eye already is, transitioning read-only with a fresh-session affordance in the composer's place, while its rows — in the sidebar and on its tab — mark it ended.
  Closing its tab files it back to the sidebar, where it stays reachable forever.
- **The chrome folds.**
  The sidebar collapses to an icon rail and restores under [DR-030](030-workspace-chrome.md), keeping the Dashboard badge and every accessible name; its width is fixed at each state, because two good widths beat a knob.
- **The project bar retires.**
  The sidebar carries project identity, so the bar above the tabs would be a second, quieter answer to the same question; the project palette stays the keyboard's fast path, and the affordances the bar carried — adding and creating projects — move into the sidebar's Workspace section beside the projects they make.

**Considered and declined**, so the alternatives cannot re-enter piecemeal:

- a session list inside the Captain home (the first design): history sat behind the same door that hid it, and vanished the moment a session filled the surface;
- a History dropdown on the tab strip (the second): a labeled door is still a door, and it left the strip owning two different jobs;
- a separate sessions column beside the sidebar: two navigators competing for the same axis, when the sidebar was already there;
- sessions as tabs alone (the shipped design): tabs are a working set, not an archive — everything unopened was invisible;
- motion replay or scrubbing of a past run: the thread and its settled machine cards are the record; animating history is its own future decision;
- session deletion and retention: destructive, and wants its own guardrail design (DR-010 §4);
- searching history: the recent window plus titles suffices at today's volumes; search earns a decision when volume demands it.

## Consequences

- The core-service package gains the session-listing contract item — the reply's lifecycle fields plus title, turn count, failure marker, and cost — with coverage.
- The run-view package gains items for the session-home list, the end-of-session handoff, and the past-session reader, with fixture coverage; the Captain-home empty-canvas item stands.
- The `spex-academy` demo flow becomes self-evidencing: a finished demo run is findable by its own first message minutes later.
