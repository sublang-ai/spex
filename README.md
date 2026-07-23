<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Spex

[![npm version](https://img.shields.io/npm/v/@sublang/spex)](https://www.npmjs.com/package/@sublang/spex)
[![Node.js](https://img.shields.io/node/v/@sublang/spex)](https://nodejs.org/)
[![CI](https://github.com/sublang-ai/spex/actions/workflows/ci.yml/badge.svg)](https://github.com/sublang-ai/spex/actions/workflows/ci.yml)

*See and act on your specs.*

**Spex** is a spec tool. It builds on a small convention — a
`specs/` tree of decision records, iteration records, and spec
packages (external behavior, internal behavior, verification) that
people and AI agents both build against. Spex helps you author that
tree, read it, and drive work through it:

- **`@sublang/spex`** — a published CLI that scaffolds and lints the
  `specs/` convention.
- **The desktop app** — an interactive view of a project's `specs/`
  tree, plus *playbooks*: workflows that drive AI coding agents to
  build against those specs.

Playbooks are workflows around your specs; the specs are the point.

## Specs

The convention Spex scaffolds is shared across the SubLang repos:
decision records, iteration records, spec packages (one file per
package with External Behavior / Internal Behavior / Verification
sections), and cross-package composition specs — bindings,
scenarios, and the tests that span packages.

```sh
npx @sublang/spex scaffold            # seed specs/ in the current repo
npx @sublang/spex scaffold --update   # refresh templates, migrate legacy layouts
npx @sublang/spex lint                # check structure, IDs, and citations
```

Rerunning is safe: `scaffold` skips files that already exist, and
your own spec content is never touched
(`CLAUDE.md`/`AGENTS.md` only get their managed specs section added
or refreshed). `--update` requires a clean `specs/` tree, migrates
the legacy `user/`/`dev/`/`test/` layout into `specs/packages/` and
`specs/interactions/` into `specs/compositions/` (merging files and
rewriting citations with a real Markdown parser), and refreshes the
spex-owned framework files and uncustomized starters — warning
before it replaces locally modified framework content, so the
previous version stays recoverable in git.
`--lang zh` selects the bundled Chinese templates.

## Desktop app

The app opens a project's `specs/` tree as an interactive map —
packages, items, group filters, and jump-to citation links — and
runs playbooks against it. You are the *Boss*: you talk to a
*Captain* that routes work to *player* coding agents, and every
session streams live: transcripts, tool use, cost, and the
questions that need your answer.

### Install

No packaged release yet — run it from source. Packaged builds
(macOS Apple Silicon first) will land on
[GitHub Releases](https://github.com/sublang-ai/spex/releases) under
`app-v*` tags.

You need Node.js >= 20.6, and a signed-in
[Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview)
CLI (or `ANTHROPIC_API_KEY` in your shell profile). The GitHub
issue/PR panels also use a locally-authenticated
[`gh`](https://cli.github.com) CLI.

```sh
git clone https://github.com/sublang-ai/spex.git
cd spex
npm ci
npm run build
npm run rebuild:electron -w apps/desktop   # native sqlite for Electron's ABI
npm start -w apps/desktop
```

### Surfaces

| Surface | What it does |
| --- | --- |
| **Workspace** | Project-scoped, with a Cmd/Ctrl+P project palette and per-project tabs. **Specs** is the interactive reader for the project's `specs/` tree; **Repo** shows branch/dirty/ahead-behind plus GitHub issues & PRs; session tabs are the run view — Captain pane, read-only streaming player transcripts, and the Boss composer with queueing, abort, and a banner when a player asks |
| **Dashboard** | Cross-project attention queue (questions, failures, idle sessions), running sessions, issues to do / PRs to review, usage rollups |
| **Playbooks** | Configured workflows with role→profile mapping, plus the compile flow: prose → [`slc`](https://github.com/sublang-ai/slc) → a registry bundle registered into the shared config |
| **Settings** | Profiles (adapter, model, effort, permissions) with readiness checks, captain selection, notifications, theme — comment-preserving edits to the shared config |

Configuration lives in
`${XDG_CONFIG_HOME:-$HOME/.config}/playbook/playbook.config.yaml`,
shared with the [`playbook`](https://github.com/sublang-ai/playbook)
CLI: Spex validates it with the same rules as the `playbook`
launcher, so the file stays portable between the app and the CLI.
Spex is the GUI successor of
[cligent](https://github.com/sublang-ai/cligent)'s `tmux-play` —
the same headless runtime drives both.

## Monorepo layout

| Path | What | Distribution |
| --- | --- | --- |
| [`specs/`](specs) | Specifications for everything below | — |
| [`packages/cli`](packages/cli) | `@sublang/spex` — specs scaffold + lint CLI | [npm](https://www.npmjs.com/package/@sublang/spex) (`v*` tags) |
| [`scaffold/`](scaffold) | Template bundle the CLI ships (staged into `packages/cli` at build) | with the CLI |
| [`packages/core`](packages/core) | Headless core service: config, sessions, spec parsing, embedded playbook runtime, SQLite store, WebSocket protocol | with the app |
| [`packages/ui`](packages/ui) | Web UI (React + Vite + Tailwind) speaking only the protocol | with the app |
| [`apps/desktop`](apps/desktop) | Electron shell: core in-process, sandboxed renderer, notifications, dock badge | GitHub Releases (`app-v*` tags) |

The architecture is recorded as decision records DR-002 onward;
start at the [spec map](specs/map.md). The core/UI split is
web-first: a cloud deployment swaps only the Electron shell.

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
fake run with a seeded `specs/` tree):

```sh
npm run dev:fake -w packages/core   # ws://127.0.0.1:8137
npm run dev -w packages/ui          # Vite dev server
```

Compiling playbooks from the Playbooks surface requires a system
Node >= 23.6 and the [`slc`](https://github.com/sublang-ai/slc) CLI,
resolved from `SPEX_SLC` or `PATH`; compilation drives a
credentialed coding agent.

## Contributing

We welcome contributions of all kinds.

- 🌟 Star our repo if you find Spex useful.
- [Open an issue](https://github.com/sublang-ai/spex/issues) for bugs or feature requests.
- [Open a PR](https://github.com/sublang-ai/spex/pulls) for fixes or improvements.
- Discuss on [Discord](https://discord.gg/XxTPjNqy9g) for support or new ideas.

## License

[Apache-2.0](LICENSE)
