<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-007: Conversational Session Start

## Status

Accepted

## Context

- v1 landed with Sessions empty until the user first visited Projects, registered a repo by typing an absolute path, and clicked "Open session" — three surfaces before the first conversation.
- The product owner's review (2026-07-10): opening the app must feel like opening Claude Desktop or Codex Desktop — a Captain conversation front and center, where the user can naturally pick or add a project, see and invoke playbooks, and see or change the captain's agent/model.
- All the needed capabilities already exist on the protocol (project register/create, session create, turn submit, config summary, readiness, config.edit); this is a presentation-layer decision ([DR-003](003-runtime-reuse.md) semantics are untouched).

## Decision

### Sessions is the landing surface, and it is never blank

- The app opens on **Sessions**.
- While no live session exists (and whenever the active tab is the start tab), Sessions shows the **start view**: a Captain composer front and center, styled as the app's home.
- The start view carries, around the composer:

| Element | Behavior |
| --- | --- |
| Project selector | Registered projects in a dropdown; "Choose folder…" opens the native picker ([DR-008](008-native-shell-bridge.md)); a chosen unregistered folder is registered on start (git repos directly, with a create flow offered otherwise) |
| Playbook chips | One chip per configured playbook: `/command — intent`; clicking inserts the slash command into the composer; an "add" chip links to the Library |
| Captain summary | The captain's profile id and model with a profile switcher (writes `captain.set`) and its readiness state with fix instructions |
| Readiness notices | Not-ready adapters used by the selected lineup surface before the first message, not after a failed turn |

- Submitting the first message performs one motion: create the session for the selected project, then dispatch the text as the first Boss turn.

### Session tabs

- Tabs are titled by project basename; colliding basenames are disambiguated with the parent directory.
- A dedicated "+" tab returns to the start view to launch a session for another project.

## Consequences

- Zero-to-first-turn happens on one surface; Projects becomes a management view rather than a required doorway.
- The start view duplicates small slices of Library/Settings (chips, captain switcher); acceptable — they are entry points, and the full editors stay canonical.
- tmux-play has no equivalent surface; this is presentation only, so the verification-twin property of [DR-003](003-runtime-reuse.md) is unaffected.
