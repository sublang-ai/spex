<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-175: Projects Shown Where They Are Open

## Status

Accepted (2026-11-02) on the owner's direction, after a fresh-user walk of the first sign-in to a space with a team server: the left panel lists projects and nothing that reads as a group or a server, the Space stores records and never code, and a project reaches a server from a group alone.
Amends, under [DR-046](046-decision-record-evolution.md):

- [DR-133](133-one-desktop-over-several-cores.md) in "Places" and "Remote projects": a place's heading stands in the sidebar only while a seat holds a project or is opening one; a seat holding none shows no heading and no page of its own, so the welcome page has no server form.
- [DR-159](159-projects-in-groups-opened-where-you-work.md) in "Projects", "Space" and "A seat opens when needed": the palette lists the groups' projects once, every row carrying its Space row's Open control; a server's line offers no Connect, the seat opening on "Open on <server>" alone; a project whose code is on no Git host says so and offers no server.
- [DR-172](172-surfaces-a-fresh-user-reads.md) in its vocabulary: the code glyph's phrase for code on no Git host.

## Context

- A member signed in to a space, opened a seat on its server and saw, in the left panel, the server's name as a heading over nothing, beside "This computer" and its projects; it read as the group they had joined, broken.
- "Open a project from your groups" on the server's welcome page opened the palette with two sections, "From your groups" and "From your groups on <server>", both reading "Nothing more to open from your groups" over an empty group; "more" implied something missed, and nothing said why or what came next.
- The one act left, "Open folder…", added the folder on this computer, as its footnote said; the member wanted it on the server and found no door, since no surface said that a server opens projects from a group, with the code on a Git host.
- The owner's principles: the Space and its Git host store records, never code; the package registry, the Space and the team server are three independent things; three members of a group never share one working copy, each seat holding its own clone, so code converges through Git and records through the Space.
- The owner's direction: simple and reliable over complete; few users yet, so no compatibility carried.

## Decision

### The model, restated

- Three stores, independent: the registry holds packages; the Space holds groups, members, records and the list of servers; a server holds, per member, a working copy of each project's code and records, the agent sign-ins and the member's code-host token.
- A place — this computer or a server — holds projects. A project arrives on this computer by a folder, and at any place from a group; a server takes no folder and no URL.
- Records are local to this computer until shared into a group at the Space; code is on a Git host, or only in a folder, and the Space never holds it.
- A project whose code is on no Git host opens on no server; its row says where the code is.

### The panel

- The sidebar lists projects under a heading per place only while a seat holds a project or is opening one; "This computer" heads its rows only then.
- A seat holding no project adds nothing to the panel and has no page of its own; the welcome page keeps its local form alone.

### The palette

- One "From your groups" lists each project of the member's groups that this computer lacks, once.
- Every row of the palette — an open project's or a group's — carries the Open control of its Space row: "Open here", "Show", "Open on <server>" and "Show on <server>", a server entry reading "Signing in to <Space>…" disabled while its seat signs in.
- The empty list reads "No projects in your groups yet" while the groups hold no project, and "All your groups' projects are open here" while this computer holds them all.
- The footnote naming where a new project lands goes: a new project is always this computer's.

### The server line

- A server's line under its group reads its name, and "Connected" with Disconnect in its overflow while a seat is open there.
- It offers no Connect: the seat opens on the first "Open on <server>", the only act that needs it, and a refused open reads its cause on the line with the row's entry offered again.

### The code phrase

- A project whose `project.json` names no remote reads, in the attention tone, "Code only on this computer" while it is open here and "Code not on a Git host" otherwise.
- Its "Open on <server>" entries are disabled, titled "Needs the code on a Git host"; a seat refuses such a join with the same phrase.

### Considered and declined

- Hosting a project's code at the Space beside its records: the owner's principle keeps the Space to records; a project's code lives on the member's own Git host.
- "Add a Git project…" by URL on a server: one act this model admits later; not needed for the first flows, and a second door before the first is understood.
- Keeping a server's heading in the panel while it holds no project, as a door to a server page: an empty heading reads as a broken group, and the Space surface's server line is the server's place.
- "Code: no remote": Git's word for what is missing, not the reader's word for where the code is.

**Accepted loss:** a member who wants a seat open before any project — to place a token under its Settings first — opens a project there and adds the token when the row asks.

## Consequences

- These specs change: `run-view` in the sidebar's headings, the places, the palette, the server's line and their tests, its server welcome page items retired; `space` in the code glyph's phrase, the Open entries, the seat's join and their tests.
- The UI's sidebar, palette, welcome page and Space servers change; the seat refuses a join of a project with no code remote; the server-welcome journey retires and a journey of the panel and the palette replaces it.
- Acceptance: a fresh member signed in to the stand-in instance sees no server heading until a project opens on the server, finds the group's project once in the palette with "Open here" and "Open on <server>", and reads "No projects in your groups yet" over an empty group.
