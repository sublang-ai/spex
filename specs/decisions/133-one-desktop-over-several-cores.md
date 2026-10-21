<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-133: One Desktop Over Several Cores

## Status

Proposed (2026-10-21) on the owner's direction: one locally running Spex controls different projects at once, on this computer and on the seats the person holds on team servers ([DR-132](132-team-servers.md)).
Proposes to amend, under [DR-046](046-decision-record-evolution.md):

- [DR-002](002-desktop-app-architecture.md) in "the UI is a static bundle that knows nothing but that protocol" and its one connection: the UI holds one connection per core, every connection over the same protocol, and merges nothing but what this record names.
- [DR-029](029-session-history-home.md) and [DR-035](035-intent-ledger.md) in the Dashboard's attention: one queue joins every connected core's attention, the projects of each core grouped under its place.
- [DR-033](033-remote-gui-serving.md) in "the browser is a pure protocol client": a served page may hold the same relayed connections as the desktop.

## Context

- The UI holds one WebSocket, one store and one connection banner; its project ids are repository keys, which name the instance and not the machine, so one repository cloned on two machines has one id on both; draft ids are unique within a repository alone; session, intent and approval ids are UUIDs.
- The desktop's content security policy admits connections to loopback alone, the renderer's origin is `file://`, and the core admits a `file://` origin wherever it listens [[core-service-24](../packages/core-service.md#core-service-24)]; a browser cannot set a WebSocket header, so a bearer the renderer presents travels in the URL.
- The UI and a core must agree on the protocol version exactly; a mismatch stops reconnecting and says so.
- The local core already holds the home's app tokens and the HTTPS client that talks to each instance ([DR-127](127-a-home-signed-in-to-several-instances.md)), and the shell carries no app feature over IPC ([DR-002](002-desktop-app-architecture.md)).
- A seat is one core of the person's own on a server, reached at an endpoint with a bearer the hub issues at admission ([DR-132](132-team-servers.md)).

## Decision

### Places

- The desktop's one window holds one connection per **core**: the local core and one per seat the person opens.
  Each core is shown by its **place**: "This computer", or the server's name.
- Nothing is re-keyed: each core's projects, sessions, drafts, config, readiness, environments, Groups state and approvals are held in a store of that core's own, selected by place, and every saved per-project preference carries the place.
- Three surfaces join the cores: the sidebar lists projects under their place; the Dashboard's attention queue joins every core's attention in one order by time, and the badge counts them all; the approvals inbox shows every core's pending requests, each answered at its own core with that core's generation.
- Settings, Library, Groups and Environments show one place at a time, named by a selector; a seat's are the seat's own.
- A connection, its banner and a protocol mismatch are per place; one core failing leaves the others.

### The relay

- The local core opens and holds the seat connections, on three commands: list the servers the person may open, read from the instance; open a seat, by the contract, the ticket and the admission of [DR-132](132-team-servers.md), the seat's endpoint and bearer kept under `local/`, never sent to a client; close it.
- For each open seat the local core exposes a loopback endpoint of its own, admitted as its own endpoint is [[core-service-24](../packages/core-service.md#core-service-24)], and pipes frames both ways to the seat over TLS, presenting the bearer in the `Authorization` header and no `Origin`.
  The renderer connects to loopback alone, so the content security policy and the shell stand unchanged.
- The relay reconnects as the UI's client does, relays the seat's hello, and ends the loopback endpoint when the seat is closed or its lease ends.
- A served page holds the same relayed connections through its own core, so the browser client, when it comes, needs nothing of its own here.

### Remote projects

- A project on a seat is opened from the desktop by naming it among the group's projects; the seat allocates its working folder ([DR-132](132-team-servers.md)).
  The local pickers, reveal and path entry are not offered for a remote place.
- One spex repository cloned here and on a seat is two projects, one per place; which runtime may execute a session or an intent is [DR-131](131-execution-ownership.md).
- A seat's prose comes in the seat home's language, set from the desktop's choice when the seat is opened.

### Considered and declined

- The local core proxying remote cores behind one UI connection: a routing of every command, place-qualified ids on every message, a protocol change, and every failure crossing two hops; the UI would still need the place for Settings, Groups and pickers.
- One window per core: the attention queue split across windows, and every `file://` window sharing one local storage.
- The relay in the shell's main process: app state and a credential in the shell, which [DR-002](002-desktop-app-architecture.md) keeps out of it, and a browser client with no relay.
- Widening the content security policy to remote hosts: a bearer in the renderer, and a seat admitting `file://` from the Internet.
- A protocol negotiation across versions: a seat runs the same release as the desktop; a mismatch is shown for that place.

## Consequences

- The UI's one store becomes a store per core behind a place selector, with the sidebar, the attention queue and the approvals inbox joined; the local core gains the three server commands and the relay endpoint; the shell changes nothing but the badge's count.
- These specs change: `app-shell` for the window's places and the badge; `dashboard` for the joined queue; `core-service` for the server commands and the relay endpoint; `settings`, `space` and the library for the place selector; `git-host` for the ticket and admission calls.
- Acceptance checks, against a stand-in hub: the local core and two seats open at once, each place listing its own projects; one queue carrying all three cores' attention and a badge counting them; an approval answered at its seat; a seat whose protocol differs shown as mismatched alone; the seat's bearer absent from every message the renderer receives; a closed seat's endpoint gone.
