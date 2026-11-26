<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-002: Spex Desktop App Architecture

## Status

Accepted.
Amended by [DR-019](019-inline-agent-configuration.md), [DR-040](040-source-only-app-releases.md), [DR-051](051-runtime-held-for-a-turn.md), [DR-056](056-release-naming.md), [DR-178](178-native-windows-private-storage.md), [DR-246](246-remove-groups-and-team-servers-from-the-clients.md).

## Context

- cligent's `tmux-play` host proved the playbook runtime end to end, but the tmux UI is limited: keystroke interaction, static pane text, no persistence, no dashboard.
- The product owner decided (2026-07-10) to build a downloadable desktop app for running playbooks, in this repo, keeping `tmux-play` as a verification fallback of the playbook logic.
- All orchestration already exists as headless Node libraries: `@sublang/cligent` exports a headless runtime (`createTmuxPlayRuntime`) whose `RecordObserver` stream carries every UI-relevant event, and `@sublang/playbook` exports the Playbook Captain shell with type-only coupling to the host.
- The app must port to a cloud web app with least effort.
- This repo currently is the `@sublang/spex` scaffold CLI, published from the repo root on `v*` tags with a CI-green gate, tag/version match, and changelog extraction.
- The `Spex` brand already fronts the tmux-play surface (its status-line heading); the product owner chose the desktop app as the brand's flagship: the app is Spex.

## Decision

### Product

- The app is named **Spex**: a desktop app to compile, configure, run, and monitor playbooks over local projects.
- Distribution is via GitHub Releases, as source with native downloads ([DR-040](040-source-only-app-releases.md), [DR-184](184-native-desktop-tag-packages.md)); the app itself is not published to npm.
- Supported hosts follow [DR-178](178-native-windows-private-storage.md).

### Three-layer, web-first architecture

- **Core** (`packages/core`): a headless Node service owning all state and side effects — config composition, project sessions, the embedded playbook host (see [DR-003](003-runtime-reuse.md)), compilation, forge access, and persistence.
  It exposes one typed WebSocket API and serves no HTML.
- **UI** (`packages/ui`): a pure web SPA (React + Vite + Tailwind + shadcn/ui) that renders core state and sends commands over the WebSocket API.
  It never imports Node-only modules; everything it knows arrives through the protocol.
- **Shell** (`apps/desktop`): an Electron [[1]] wrapper that boots the core in-process, loads the built UI, and adds OS integration (notifications, dock badge, file dialogs, login-shell environment capture).
- The cloud port is the same core behind a server socket and the same UI served as static assets; only the shell layer is replaced.
  Multi-tenant auth for the cloud variant is explicitly out of scope here.
- Each IDE connects to one core: the desktop to its embedded core, the browser IDE to the core serving the page ([DR-246](246-remove-groups-and-team-servers-from-the-clients.md)).

### Protocol

- The WebSocket protocol is the single seam between core and UI: JSON messages, schema-validated at both ends, versioned, defined once in `packages/core` and imported by the UI as types.
- Commands flow UI→core; state snapshots, deltas, and record streams flow core→UI.
- The protocol shall stay transport-portable (plain WebSocket, no Electron IPC dependency) so the web port does not touch it.

### Concept model

```text
Spex
├── Workspace surfaces
│   ├── Dashboard  — attention queue and per-project intent ledger
│   ├── Projects   — local Git repo + forge binding; a project is the run environment (cwd)
│   ├── Playbooks  — browse, bind roles to players, author and compile
│   ├── Space      — sign-in and sync of the person's project records
│   └── Settings   — Captain agent, adapter readiness, language, config
├── Project session (one working turn per project at a time)
│   ├── Captain pane   — status, engagement state, captain chat
│   ├── Player panes   — read-only streaming transcripts
│   ├── Boss composer  — the single input; slash commands and free text
│   └── Engagement     — one active playbook; parks and resumes; switch = finish or dismiss
└── Foundations
    ├── Core service   — config, sessions, record bus, persistence, WebSocket API
    └── Existing stack — cligent adapters and runtime, playbook captain shell, slc compiler
```

### Monorepo and release preservation

- The repo converts to npm workspaces:

| Path | Package | Published |
| --- | --- | --- |
| `packages/cli` | `@sublang/spex` (existing scaffold CLI) | npm, unchanged identity |
| `packages/core` | `@sublang/spex-core` | private for now |
| `packages/ui` | `@sublang/spex-ui` | private |
| `apps/desktop` | Spex Electron app | GitHub Releases |

- The root `package.json` becomes a private workspace root; `specs/` stays at the repo root and covers all packages.
- The CLI keeps its npm identity, bin, files whitelist, tests, and `CHANGELOG.md` (which moves with it to `packages/cli/`).
- The release workflow builds, validates, version-checks, and publishes the CLI from `packages/cli`.
- CLI and app releases use distinct tag namespaces, `cli-v*` and `app-v*`, with published legacy `v*` CLI tags kept ([DR-056](056-release-naming.md)), so their cadences stay independent.

## Consequences

- The UI is portable by construction; the cloud web app is a deployment task, not a rewrite.
- Everything the panes show comes from one observer stream, so tmux-play and Spex render the same truth — tmux-play remains a faithful verification twin.
- Electron adds ~120 MB download weight; accepted for v1 in exchange for zero-glue reuse of the Node ecosystem (cligent, playbook, agent SDKs).
- Two release channels live in one npm-workspaces [[2]] repo; tag namespaces (`cli-v*` vs `app-v*`) and workspace-scoped workflows must stay disjoint.
- Native binaries spawned by agent SDKs constrain Electron packaging (asar unpacking); handled in the shell layer.

## References

[1]: https://www.electronjs.org/docs/latest "Electron documentation"
[2]: https://docs.npmjs.com/cli/v10/using-npm/workspaces "npm workspaces"
