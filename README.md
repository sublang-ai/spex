<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Spex

[![npm version](https://img.shields.io/npm/v/@sublang/spex)](https://www.npmjs.com/package/@sublang/spex)
[![Node.js](https://img.shields.io/node/v/@sublang/spex)](https://nodejs.org/)
[![CI](https://github.com/sublang-ai/spex/actions/workflows/ci.yml/badge.svg)](https://github.com/sublang-ai/spex/actions/workflows/ci.yml)

*See and act on your specs.*

Spex makes a project's specifications readable and actionable by both
people and AI agents:

- **`@sublang/spex`** scaffolds and lints a shared `specs/` convention.
- **Spex Desktop** reads those specs and runs AI-agent playbooks against
  local projects.

## CLI

Requires Node.js 20 or later. Install globally with
`npm install -g @sublang/spex`, or run it directly:

```sh
npx @sublang/spex scaffold                         # create specs/
npx @sublang/spex scaffold --agents=claude,codex # choose coding agents
npx @sublang/spex scaffold --lang zh              # use Chinese templates where available
npx @sublang/spex scaffold --update               # refresh the scaffold
npx @sublang/spex scaffold --update --lang zh     # switch a tree to Chinese
npx @sublang/spex lint                             # check the tree
```

The scaffold contains decision records, intent records, and one Markdown
file per spec package. A package states its intent, External Behavior that
its users—people or software components—may rely on, optional hidden Internal
Behavior, and Verification. Behavior that emerges across packages is itself
a package citing its peers; there is no special compositions directory
([meta-30](specs/meta.md#meta-30), [DR-000](specs/decisions/000-spec-structure-format.md)).
An initial scaffold also writes an Apache-2.0 `LICENSE` when none exists
([scaffold-36](specs/packages/scaffold.md#scaffold-36)).

Scaffolding also installs a managed specs section for the selected coding
agents: `CLAUDE.md` for Claude Code, `AGENTS.md` for Codex, Kimi Code, and
OpenCode, and `GEMINI.md` for Gemini CLI. Interactive reruns infer the current
targets and let you confirm or replace them without touching unrelated content
([scaffold-5](specs/packages/scaffold.md#scaffold-5)).

Plain `scaffold` reruns preserve authored files. `--update` requires a clean
`specs/` working tree, refreshes Spex-owned framework files—warning when it
overwrites local changes—refreshes only uncustomized starter files,
reconciles agent instructions, and prints an agent prompt for judgment work
([scaffold-11](specs/packages/scaffold.md#scaffold-11)).

In `--update --lang zh`, **`zh` is the target language**: Spex switches the
bundled files with Chinese templates to Simplified Chinese; other bundled
files remain in English. It prints a prompt for an AI agent to translate
project-authored specs rather than machine-translating them. If the tree
already declares `zh`, the command is an ordinary update
([scaffold-39](specs/packages/scaffold.md#scaffold-39)).

`spex lint` checks layout, package sections, IDs, citations, records, and the
spec map. Errors fail the command; advisory warnings do not
([lint-3](specs/packages/lint.md#lint-3)).

For a spex 0.x tree, `--update` refreshes the law but leaves legacy content
untouched and prints a self-contained migration prompt
([scaffold-26](specs/packages/scaffold.md#scaffold-26)). Give that prompt to
any capable AI agent, then review the diff and require `spex lint` to pass.

## Desktop app

Spex Desktop is a project workspace for reading specs and supervising
playbook-driven development:

- a searchable package outline renders complete items, inbound and outbound
  citations, record links, and in-view citation jumps
  ([spec-view-1](specs/packages/spec-view.md#spec-view-1),
  [spec-view-6](specs/packages/spec-view.md#spec-view-6));
- live sessions show the Captain, streaming read-only player transcripts,
  tool use, cost, questions needing the Boss, queued replies, and aborts
  ([run-view-1](specs/packages/run-view.md#run-view-1),
  [run-view-8](specs/packages/run-view.md#run-view-8));
- the Dashboard prioritizes attention across projects, Playbooks can be
  browsed or compiled, and each agent is configured inline with its adapter,
  model, effort, and permissions
  ([dashboard-1](specs/packages/dashboard.md#dashboard-1),
  [playbook-library-5](specs/packages/playbook-library.md#playbook-library-5),
  [run-view-32](specs/packages/run-view.md#run-view-32)).

Run the desktop app from source:

```sh
git clone https://github.com/sublang-ai/spex.git
cd spex
npm ci
npm start
```

`npm start` builds the workspaces, launches Electron, and restores the native
module ABI for system Node when the app exits.

Real playbook runs require a ready coding-agent adapter. GitHub issue and PR
panels use an authenticated `gh` CLI. Compiling new playbooks requires
[`slc`](https://github.com/sublang-ai/slc) and its supported Node.js version.
App releases on
[GitHub Releases](https://github.com/sublang-ai/spex/releases) (`app-v*` tags)
ship as source with their changelog: check out the tag and run the commands
above. Binaries follow once the app can be signed.

## Remote access

Run Spex on a machine you own and browse it from another: the server shell
serves the UI and the core over one port, behind a token in the URL
([server-shell-1](specs/packages/server-shell.md#server-shell-1)).

```sh
npm ci
npm run start:server     # prints http://127.0.0.1:8137/?token=...
```

Open the printed URL. The server binds loopback by default; to reach it from
another machine, use the SSH tunnel the startup line prints. To bind a public
address, pass `--tls-cert`/`--tls-key` — a plaintext public bind is refused
unless you also pass `--insecure`
([server-shell-2](specs/packages/server-shell.md#server-shell-2)).

## Repository

| Path | Purpose |
| --- | --- |
| [`specs/`](specs) | Source of truth for this repository; start at the [spec map](specs/map.md) |
| [`scaffold/`](scaffold), [`packages/cli`](packages/cli) | Shipped templates and the npm CLI |
| [`packages/core`](packages/core), [`packages/ui`](packages/ui) | Headless service and protocol-only web UI |
| [`apps/desktop`](apps/desktop) | Electron shell |
| [`apps/server`](apps/server) | Server shell for remote browser access |
| [`demo/`](demo) | Academy example and spec-package case study |

For development, run `npm ci`, `npm run build`, and `npm test`; `npm run e2e`
drives the served UI through its user journeys in Chromium (after a one-time
`npx playwright install chromium`). Maintainers also use the
[release smoke checklist](docs/release-smoke.md).

Contributions are welcome through
[issues](https://github.com/sublang-ai/spex/issues),
[pull requests](https://github.com/sublang-ai/spex/pulls), and
[Discord](https://discord.gg/XxTPjNqy9g).

Licensed under [Apache-2.0](LICENSE).
