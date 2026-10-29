<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-159: Projects in Groups, Opened Where You Work

## Status

Accepted (2026-10-28) on the owner's direction: a member signs in to a space once, finds a project in one of their groups and opens it where they want to work — on this computer or on one of the group's servers — in one act; the records' Git, the seats and the sync stay beneath the surfaces, reached from a row and shown on none.
Amended by [DR-164](164-the-seat-signs-in-on-its-ticket.md) in "A seat opens when needed": the open hands the ticket it presented to the seat's sign-in, and the approval page is opened only where the space still asks for it; the declined item on the ticket's consent is decided there.
Amends, under [DR-046](046-decision-record-evolution.md):

- [DR-057](057-space-surface.md) and [DR-103](103-the-home-and-its-groups.md) in the Space surface's rows: a row is a project, named as its code is, never a spex repository named `<name>-spex`; a group's own repository reads as the group's own sessions; the Git of the records is reached from a row's overflow and shown on no row.
- [DR-120](120-the-instance-is-the-space.md) in the groups list's headings: your namespace heads nothing while it lists only your own group's repository; another account's login heads "Shared by @<login>"; the servers of a space stand under their group.
- [DR-128](128-a-spex-repository-placed-at-several-instances.md) in its presentation alone: a placement's line, "Place at…", "Leave…" and Attach move behind one overflow control per row, their meanings standing.
- [DR-133](133-one-desktop-over-several-cores.md) in "The relay" and "Remote projects": a seat opens by the first act that needs it, the contract shown by that act; the open starts the seat's sign-in at the space and names where to approve it; the welcome page and the project palette offer the groups' projects at every place.
- [DR-135](135-a-welcome-page-before-the-first-project.md) and [DR-137](137-specs-first-welcome-and-distinct-project-paths.md) in the welcome page's actions: a signed-in home's page also opens a project from the member's groups, and one not signed in leads to the sign-in.
- [DR-065](065-repairs-the-reader-answers.md) in a repair's naming: by the project and its group, the folder it remembers secondary.
- [DR-041](041-chrome-that-fits.md) in its label budget: a menu's entry, and a row's act this record fixes as a whole phrase — "Add to a group…", "Merge histories…", "Not on this computer", "Open on <server>" among them — may exceed fourteen characters and wraps within its row.
- [DR-132](132-team-servers.md) in "A client presents a ticket": every admission mints a bearer of its own, those of the person's earlier admissions standing while the lease lasts; and in "The helper creates the account on first admission": the account is made without the host's login skeleton, and one bound covers the whole admission — the account, the unit and the seat's socket — which the client's wait exceeds.

## Context

- The Space surface today lists spex repositories named `<name>-spex` under each group, each with Sync, an ahead-and-behind count, placement lines and "Place at…" and "Leave…"; every group heading carries Members, New subgroup, Rename and Delete; a namespace heading reads "ada-spex stands under your own group"; the servers stand in one flat list at the instance's foot with Open.
- "Join", "Pick a group", "Attach", "Place at…", "Leave…" and "Needs your choice" name the acts of [DR-103](103-the-home-and-its-groups.md) and [DR-128](128-a-spex-repository-placed-at-several-instances.md) on the records' Git; a member who wants to work on a project cannot tell which of them opens it, and "Join" names two acts — cloning a repository here, and merging two unrelated histories — under one phrase.
- A team server is opened as an act of its own: Open, the contract, then the place selector, then "Sign in again" on the seat's own Space, then the project palette's "From your groups on <server>", which lists nothing until that sign-in and says nothing of why.
- The palette offers a group's project for a server and never for this computer, where the only door is Join on the Space surface.
- The first open of a seat creates its OS account with the host's login skeleton copied into its home — a gigabyte on the CI runner, read from a cold disk — which took 41 seconds on the privileged lane and over 60 at `main`, while a seat's own start costs a second; the hub's thirty-second bound covers only the wait for the seat's socket, not the account's creation, so the desktop gives up at 45 seconds with the single-use ticket spent and the seat still starting.
- Each admission replaces the person's one bearer at the hub, so the same member's second desktop ends the first's relay without a word.
- A repair names its spex repository and a path — "slalph-spex · in slalph · 5 sessions ran in /private/tmp/…" — where the member knows the project by its name and its group.
- A sync's conflict reads "Needs your choice" on the row, its picker in the Sync tab the row opens; the row itself offers no choice.
- The owner's direction: one instance is one Git host with its servers, access is the groups'; a fresh member should understand Projects, Space and Settings and reach work with the least burden; simple and reliable over complete.

## Decision

### One model

- A **space** holds **groups**; a group holds **projects**, **members** and **servers**; a project is **open** at one or more **places** — this computer, or a server — where its sessions run.
- The member meets no spex repository, placement, unit, namespace or seat by name: the records, their Git and the seat are means, reached from a project's or a group's row where needed and shown nowhere else.

### Projects

- The welcome page of a home signed in to a space offers "Open a project from your groups" beside its local-project action; one not signed in offers "Sign in to your Space", which leads to the sign-in; a server's welcome page keeps its form.
- The project palette lists "From your groups" for this computer as it does for a server: each project the member may open, with the place it would open at, and nothing of a place whose seat is not yet signed in except that it is signing in.
- Opening a group's project on this computer clones its records and its code into a folder the member picks, the picker opened by the act itself; on a server, into the folder the server allocates ([DR-132](132-team-servers.md)).

### Space

- Under each space's heading the member's groups stand as a tree, a subgroup within its group; a group's heading carries its name, its member count where read, and one overflow control holding Members, New subgroup, Rename and Delete where the host lets the person act ([DR-114](114-groups-and-sharing-from-spex.md), [DR-120](120-the-instance-is-the-space.md)).
- Under a group, one row per project: its name, where its code lives in a few words, the places it is open at, one phrase for its records' standing, one primary control and one overflow control:
  - the primary control is Open, offering this computer and each server of the space the member may open, an entry reading "Open here" or "Open on <server>", or "Show" where the project is already open there; where this computer is the only place, the control reads "Open here" alone;
  - the phrase reads "Synced <age>", "Syncing…", "<n> to send", "Changed here and at <space> — Resolve", "Read-only: <reason>", "Unreachable: <cause>" or "On this computer only", Resolve opening the conflicts' picker in place beneath the row;
  - the overflow holds Sync now, Members, Explore records, Move to another group, Place at another space, Leave this space, and the records' Git acts the row's state offers.
- A group's own records stand first under the group as one row, "Group sessions", opened and synced as a project's are.
- Your own records stand first in the list under the heading "Only you · @<login>" — your sessions outside any project, and each project on this computer that is in no group, whose primary control reads "Add to a group…" and opens the group picker with "Only you" first.
- Your namespace at a space heads nothing while it lists only your own group's repository; a listing under another account's login heads "Shared by @<login>".
- A space's servers stand under their group, one line each, reading "<server> · Connected" with Disconnect in its overflow once a seat is open there, and "<server>" with Connect otherwise.

### A seat opens when needed

- "Open on <server>" on a project, and Connect on a server's line, open the member's seat there where none is open: the contract once per device, then "Connecting to <server>…" for as long as the admission may take, the first start of a seat saying it can take a minute.
- The open then starts the seat's sign-in at the space by the device flow of [DR-132](132-team-servers.md), the desktop opening the approval page, the line reading "Approve Spex on <server> in your browser" with the link until the sign-in completes, and "Sign in again" with the cause where it fails.
- Once the seat is signed in, the project's open proceeds there; a project opened on a seat that is still signing in waits for it, and says so.
- The hub keeps every bearer it minted for a person while the lease lasts, so a second device's admission ends no relay.
- A seat's account is made with an empty home, no login skeleton copied, so a first admission costs what a later one does; one bound covers the whole admission at the hub — the account, the unit and the seat's socket — and the client waits longer than that bound, so an admission the hub still runs is never one the client has given up on.

### Repairs and conflicts

- A repair names the project and its group, "<project> in <group>: its folder on this computer is missing", the folder it remembers secondary, its controls "Choose folder…" and "Not on this computer".
- A unit changed on both sides reads "Changed here and at <space>" on its row with Resolve, the picker's choices reading "Keep this computer's" and "Take <space>'s"; merging two unrelated histories reads "Merge histories…", never Join.

### Settings

- Settings keeps its sections; its header names the place and the config file's path shortened under the user's home, and on a seat its Credentials section ([DR-132](132-team-servers.md)).
- A phrase naming "this device" on a seat's surface names the server instead.

### Considered and declined

- One merged Space over every place, retiring the selector: a seat's sign-in, credentials and sync state are its own ([DR-133](133-one-desktop-over-several-cores.md)); the local Space instead says where each project is open.
- Approving the seat's sign-in by the ticket's consent, with no approval page: a decision of the space's, recorded later at spex.space; this record starts the flow and names the approval.
- A sync on a timer: [DR-103](103-the-home-and-its-groups.md) reads the host on events alone.
- Renaming the members panel's Share: [DR-114](114-groups-and-sharing-from-spex.md)'s names stand, so a project's act is "Add to a group…".
- Creating a project inside a group from the group's heading: a local project is added and then put in a group, as today.

**Accepted loss:** a member who wants the records' Git acts — a placement's line, Place at…, Leave…, Attach, Sync now — takes one more click, into the overflow.

## Consequences

- These specs change: `space` for the rows, the headings, the phrases, the servers under their group, Resolve in place and the repair's naming; `run-view` for the welcome page's actions, the palette, the servers' lines and a seat's open with its sign-in; `core-service` for `server.open` starting the seat's sign-in and `server.state` carrying it, and the admission's wait; `hub` for a bearer per admission and the seat start's bound; `settings` for the header.
- The UI's Space, palette, welcome page and sidebar change; the core's places and the hub's seats change; the protocol gains the seat's sign-in state and loses nothing.
- Acceptance: a fresh member signed in to the stand-in instance opens a group's project on this computer from the palette and on a server from the Space surface, the seat's sign-in approved through the page alone, and the project appears under the server's heading; two desktops of one member hold the same seat at once; the first open of a seat on the privileged lane lands within the client's wait.
