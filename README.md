<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Spex

[![npm version](https://img.shields.io/npm/v/@sublang/spex)](https://www.npmjs.com/package/@sublang/spex)
[![Node.js](https://img.shields.io/node/v/@sublang/spex)](https://nodejs.org/)
[![CI](https://github.com/sublang-ai/spex/actions/workflows/ci.yml/badge.svg)](https://github.com/sublang-ai/spex/actions/workflows/ci.yml)

*Run playbooks from your desktop.*

**Spex** is a desktop app for compiling, configuring, running, and
monitoring [playbooks](https://github.com/sublang-ai/playbook) —
state-machine agents that orchestrate AI coding agents over your
local projects. You are the *Boss*: you talk to a *Captain* agent
that routes work to *player* coding agents, and Spex renders every
session live — transcripts, tool use, costs, and the questions that
need your answer.

Spex is the GUI successor of
[cligent](https://github.com/sublang-ai/cligent)'s `tmux-play`
terminal surface. The same headless runtime and Playbook Captain
shell drive both, and they share one config file — a config Spex
accepts also launches under `tmux-play`, and vice versa.

The monorepo also ships **`@sublang/spex`**, a small published CLI
that scaffolds the `specs/` tree this whole project family is built
around.

## Install

The desktop app has no packaged release yet — run it from source.
Packaged builds (macOS Apple Silicon first) will land on
[GitHub Releases](https://github.com/sublang-ai/spex/releases) under
`app-v*` tags.

You need Node.js >= 20.6, and a signed-in
[Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview)
CLI (or `ANTHROPIC_API_KEY` exported in your shell profile). The GitHub
issue/PR panels additionally use a locally-authenticated
[`gh`](https://cli.github.com) CLI.

```sh
git clone https://github.com/sublang-ai/spex.git
cd spex
npm ci
npm run build
npm run rebuild:electron -w apps/desktop   # native sqlite for Electron's ABI
npm start -w apps/desktop
```

The first run seeds `~/.config/playbook/playbook.config.yaml`, shared
with the [`playbook`](https://github.com/sublang-ai/playbook) CLI.

## Surfaces

| Surface | What it does |
| --- | --- |
| **Workspace** | Everything project-scoped: a project bar with a Cmd/Ctrl+P palette, per-project session tabs, and pinned **Specs** and **Repo** tabs. Sessions are the run view — Captain pane, read-only streaming player transcripts (markdown, tool use, thinking, cost), and the single Boss composer with queueing, abort, and a banner when a player asks a question. Specs is an interactive reader for the project's `specs/` tree; Repo shows branch/dirty/ahead-behind cards plus GitHub issues & PRs via the locally-authenticated `gh` CLI |
| **Dashboard** | Cross-project attention queue (questions, failures, idle sessions), running sessions, issues to do / PRs to review, usage rollups |
| **Playbooks** | Configured playbooks with role→profile mapping, plus the compile flow: prose → [`slc`](https://github.com/sublang-ai/slc) → a registry bundle registered into the shared config |
| **Settings** | Profiles (adapter, model, effort, permissions) with readiness checks, captain selection, notifications, theme — comment-preserving edits to the shared `playbook.config.yaml` |

Configuration lives in
`${XDG_CONFIG_HOME:-$HOME/.config}/playbook/playbook.config.yaml`.
Spex validates it with the same rules as the `playbook` launcher, so
the file stays portable between the app and the CLI.

## The scaffold CLI

`@sublang/spex` seeds the spec convention used across the SubLang
repos — decision records, iteration records, spec packages (one file
per package with External Behavior / Internal Behavior / Verification
sections), and cross-package interaction specs that AI agents build
against:

```sh
npx @sublang/spex scaffold            # seed specs/ in the current repo
npx @sublang/spex scaffold --update   # refresh templates, migrate legacy layouts
npx @sublang/spex lint                # check structure, IDs, and citations
```

It is idempotent: existing spec files are never overwritten
(`CLAUDE.md`/`AGENTS.md` only get their managed specs section added or
refreshed). `--update` requires a clean `specs/` tree, migrates the
legacy `user/`/`dev/`/`test/` layout into `specs/packages/` +
`specs/interactions/` (merging files and rewriting citations with a
real Markdown parser), and warns when it replaces locally modified
framework files, so your previous version stays recoverable in git
history. `--lang zh` selects the bundled Chinese templates.

## Monorepo layout

| Path | What | Distribution |
| --- | --- | --- |
| [`packages/cli`](packages/cli) | `@sublang/spex` — specs scaffold CLI | [npm](https://www.npmjs.com/package/@sublang/spex) (`v*` tags) |
| [`scaffold/`](scaffold) | Template bundle the CLI ships (staged into `packages/cli` at build) | with the CLI |
| [`packages/core`](packages/core) | Headless core service: config, sessions, embedded playbook runtime, SQLite store, WebSocket protocol | with the app |
| [`packages/ui`](packages/ui) | Web UI (React + Vite + Tailwind) speaking only the protocol | with the app |
| [`apps/desktop`](apps/desktop) | Electron shell: core in-process, sandboxed renderer, notifications, dock badge | GitHub Releases (`app-v*` tags) |
| [`specs/`](specs) | Specifications for everything above | — |

The architecture is recorded in decision records
[DR-002](specs/decisions/002-desktop-app-architecture.md) through
[DR-011](specs/decisions/011-project-workspace.md); start at the
[spec map](specs/map.md). The core/UI split is web-first: a cloud
deployment swaps only the Electron shell.

## Develop

```sh
npm ci
npm run build
npm test
```

Run the desktop app as shown under [Install](#install). Switch the
native sqlite module back before running core tests on system Node:

```sh
npm run rebuild:node -w apps/desktop
```

UI development against a scripted core (no credentials, streams a
fake run):

```sh
npm run dev:fake -w packages/core   # ws://127.0.0.1:8137
npm run dev -w packages/ui          # Vite dev server
```

Compiling playbooks from the Playbooks surface requires a system
Node >= 23.6 and the [`slc`](https://github.com/sublang-ai/slc) CLI,
currently built from source and resolved from `SPEX_SLC` or `PATH`;
compilation drives a credentialed coding agent.

## Contributing

We welcome contributions of all kinds.

- 🌟 Star our repo if you find Spex useful.
- [Open an issue](https://github.com/sublang-ai/spex/issues) for bugs or feature requests.
- [Open a PR](https://github.com/sublang-ai/spex/pulls) for fixes or improvements.
- Discuss on [Discord](https://discord.gg/XxTPjNqy9g) for support or new ideas.

## License

[Apache-2.0](LICENSE)
