<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-161: An Applet Is a Page the IDE Serves

## Status

Accepted (2026-10-29), under the owner's goal that a spec package in every form — a spec, a skill, a playbook, a playbook with an applet showing a local page — publishes and installs end to end for a fresh user, the IDE showing the applet through an embedded browser component with no setup.
Extends [DR-104](104-spec-package-format-and-client-environments.md) in the one thing it left undecided: what an applet's native layout is and what Spex does with it.
Amends, under [DR-046](046-decision-record-evolution.md):

- [DR-011](011-project-workspace.md) in the project's tabs: an installed applet stands as a tab of the project's workspace beside Start, Specs and Overview.
- [DR-033](033-remote-gui-serving.md) and [DR-097](097-media-and-browser-tools-across-hosts.md) in the core's endpoint: beside its WebSocket, the endpoint answers HTTP reads under one capability path per open applet; every other content transfer stays as it is.

## Context

- DR-104 made `applets/<id>/` an artifact kind — "a browser-server application in its native layout; nothing more about applets is decided here". The core accepts and installs the files, the Playbooks surface lists the kind, the registry stores it, and nothing opens one.
- The owner's case: a playbook does the work and an applet shows a local page over it — a report, a board, a drawing of what the agents produced — and the IDE should show that page itself, through an embedded browser component, as soon as the package is installed.
- The core's endpoint carries WebSocket alone; the UI reads files through protocol commands and blob URLs; the desktop renderer is a `file://` page whose policy frames nothing, and the served page stands at the shell's own origin.
- A page from an installed package is someone else's code running inside the reader's IDE. It must reach neither the control plane — the endpoint's token — nor the home, nor the network with what it reads.
- The simple, reliable thing is a static page: nothing to build, start, port or stop, and nothing that runs outside the browser.

## Decision

### The layout

- An applet is a static web application: `applets/<id>/index.html` is its entry, and every file beside it — scripts, styles, images, data — is served as it is. Spex builds, installs and runs nothing of it; what a toolchain produces is what the publisher puts in the folder.
- The core reads an applet without `index.html` at its folder's root as an invalid release, naming the applet, wherever it reads a release; the registry keeps checking nothing inside the folder (DR-104).

### Where it shows

- A project's workspace shows one tab per applet that the project's environment or your own group's installs, after Start, Specs and Overview, named by the applet's id; the tab stands while the applet is installed and present on this device and leaves with it. No act is needed for it to appear.
- The tab is the embedded browser frame filling the pane, under one line naming the spec package and version the applet comes from and offering Reload. The frame loads when the tab is shown.
- A project open on a team server's seat shows no applet tab for now: the seat's relay carries the protocol alone.

### How it is served

- The UI opens an applet with `applet.open { repository, applet, project }`: the spex repository whose environment installs the applet, the applet's id, and the spex repository of the project whose tab shows it. The core answers with a path `/applets/<capability>/` on its own endpoint — the loopback server it binds, or the shell's server it is attached to.
- The capability is a random 256-bit value the core mints once per applet and project and keeps in memory until it stops; the same ask returns the same path, so a reload keeps working, and nothing is persisted.
- Under that path, by `GET` and `HEAD` alone, the core serves: the entry at `/` and `index.html`; a file of the applet's folder — the installed copy under `packages/`, or a path source's folder in place — at its relative path; a regular file of the project's working folder at `~/<path>`, read-only; and a JSON listing of a folder of the working folder at `~/<folder>/`. A path leading out of either root, one reached through a link that leads out, a `.git` entry, a WebSocket handshake, and any other method are refused.
- The page runs confined: every response carries a `Content-Security-Policy` naming the endpoint's own origin as the only source — inline scripts and styles allowed, `data:` and `blob:` images allowed — with `connect-src` and `form-action` at that origin and `base-uri 'none'`; the IDE frames it with `sandbox="allow-scripts allow-forms allow-modals allow-downloads"` and no `allow-same-origin`, so the page's origin is opaque: it reaches neither the IDE page nor its token, keeps no storage, and reaches only its capability's own paths. The endpoint's token never appears in an applet's URL.
- The UI's own policy gains `frame-src` for itself and the loopback origins, so the desktop's `file://` page and the served page may frame the core's endpoint.

### What an applet can do

- It reads its own files and the project's working folder; it writes nothing and runs nothing outside the browser. A playbook that wants to show something writes files the applet reads.
- An applet that writes, one with a server process of its own, and one shown for a project on a seat are later decisions, taken when a case needs them.

### Considered and declined

- A server process per applet, started on a port: arbitrary code run at open, a lifecycle, ports and logs for every applet, and a mixed-content wall on a served page; a static page over a read-only window covers the goal and runs nothing.
- The applet served from the IDE page's own origin without a sandbox: the page would read the IDE's token from the page session.
- Opening applets in the system browser only: no embedded component, which the owner asked for; an act that opens the capability path there may be added later.
- An applet manifest naming a title or an entry: the folder's name and `index.html` suffice, a `<title>` cannot be read across the sandbox, and a manifest can come when a field is needed.
- Opening the tab by itself when the package installs: the tab's presence already says the applet is there, and a reader's working set is theirs.

## Consequences

- A new spec package, `applets`, states the layout the core requires, the tab, the open command and its capability, the served paths, the confinement and their verification; `environments-1` names the entry; `core-service-1` admits the HTTP reads on the endpoint; `server-shell-4` hands the applet paths to the attached core; `app-shell` and `server-shell` state the UI's framing policy.
- The stand-in registry's fixtures gain a release with an applet, and a browser journey installs it, finds the tab, reads a file of the working folder through the frame, and is refused outside the capability.
- The Spex Space guide describes the layout and what an applet can read; the registry's checks are unchanged.
