<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Spex

*Run playbooks from your desktop.*

**Spex** is a desktop app for compiling, configuring, running, and
monitoring [playbooks](https://github.com/sublang-ai/playbook) —
state-machine agents that orchestrate AI coding agents over your
local projects. It is the GUI successor of cligent's `tmux-play`
surface: the same headless runtime and Playbook Captain shell drive
both, so tmux-play remains a behavioral verification twin.

## Install

Download the latest Spex zip (macOS Apple Silicon) from
[GitHub Releases](https://github.com/sublang-ai/spex/releases) and
unzip it. The build is not yet signed or notarized, so on first
launch either right-click `Spex.app` → Open, or clear the quarantine
flag:

```sh
xattr -dr com.apple.quarantine Spex.app
```

The first run seeds
`~/.config/playbook/playbook.config.yaml` and needs a signed-in
`claude` CLI (or `ANTHROPIC_API_KEY` exported in your shell profile).

## Surfaces

| Surface | What it does |
| --- | --- |
| **Dashboard** | Ranked attention queue (questions, failures, idle sessions), running sessions, issues to do / PRs to review, usage rollups |
| **Sessions** | The run view: Captain pane with the shell's status glyphs, read-only streaming player transcripts (markdown, tool use, thinking, cost), and the single Boss composer with awaitBossReply banner, queueing, and abort |
| **Projects** | Local git repos as run environments: register or create (with optional `spex scaffold`), branch/dirty/ahead-behind cards, GitHub issues & PRs via the locally-authenticated `gh` CLI |
| **Library** | Configured playbooks with role→profile mapping, plus the compile flow: prose → `slc playbook` → bundled registry, registered into the shared config |
| **Settings** | Profiles (adapter, model, effort, permissions) with readiness checks, captain selection, notifications, theme — comment-preserving edits to the shared `playbook.config.yaml` |

Configuration lives in
`${XDG_CONFIG_HOME:-$HOME/.config}/playbook/playbook.config.yaml`,
shared with the `playbook` CLI: a config Spex accepts also launches
under tmux-play, enforced by launcher-parity validation.

## Monorepo layout

| Path | What | Distribution |
| --- | --- | --- |
| [`packages/cli`](packages/cli) | `@sublang/spex` — specs scaffold CLI | [npm](https://www.npmjs.com/package/@sublang/spex) (`v*` tags) |
| [`packages/core`](packages/core) | Headless core service: config, sessions, embedded playbook runtime, SQLite store, WebSocket protocol | with the app |
| [`packages/ui`](packages/ui) | Web UI (React + Vite + Tailwind) speaking only the protocol | with the app |
| [`apps/desktop`](apps/desktop) | Electron shell: core in-process, sandboxed renderer, notifications, dock badge | GitHub Releases (`app-v*` tags) |
| [`specs/`](specs) | Specifications for everything above | — |

The architecture is recorded in
[DR-002](specs/decisions/002-desktop-app-architecture.md) through
[DR-006](specs/decisions/006-projects-and-forge.md); start at the
[spec map](specs/map.md). The core/UI split is web-first: a cloud
deployment swaps only the Electron shell.

## Develop

```sh
npm ci
npm run build
npm test
```

Run the desktop app (rebuilds the native sqlite module for
Electron's ABI first):

```sh
npm run rebuild:electron -w apps/desktop
npm start -w apps/desktop
```

Switch back before running core tests on system Node:

```sh
npm run rebuild:node -w apps/desktop
```

UI development against a scripted core (no credentials, streams a
fake CODE run):

```sh
npm run dev:fake -w packages/core   # ws://127.0.0.1:8137
npm run dev -w packages/ui          # Vite dev server
```

Compiling playbooks from the Library requires a system Node >= 23.6
and the `slc` CLI (resolved from `SPEX_SLC`, `PATH`, or `npx
@sublang/slc`); compilation drives a credentialed coding agent.

## License

[Apache-2.0](LICENSE)
