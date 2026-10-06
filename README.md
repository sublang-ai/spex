<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Spex: the spec-first IDE

[![npm version](https://img.shields.io/npm/v/@sublang/spex)](https://www.npmjs.com/package/@sublang/spex)
[![Node.js](https://img.shields.io/node/v/@sublang/spex)](https://nodejs.org/)
[![CI](https://github.com/sublang-ai/spex/actions/workflows/ci.yml/badge.svg)](https://github.com/sublang-ai/spex/actions/workflows/ci.yml)

*Specs are the source.*

## Why Spex

When programming shifts from code to specifications, four problems keep
showing up:

1. **Flat, lengthy spec text** burdens people and AI alike. Ambiguity,
   redundancy, and inconsistency hide in prose.
2. **Skills written in natural language drift.** Editing and managing them
   is unpredictable, so long-running tasks are hard to trust.
3. **A single agent's work is often defective** and cannot be delivered with
   confidence.
4. **Supervising several agents is exhausting.** Attention scatters, intents
   get forgotten, and the mental burden grows.

Spex answers each with one systematic design:

1. **Structured specs.** Requirements become itemized, normalized statements,
   grouped into spec packages that cite one another. The structure exposes
   ambiguity and redundancy, drives out inconsistency, and gives the system's
   concept design high cohesion and loose coupling: the ground for long-term
   maintainability.
2. **A natural-language compiler.** A workflow described in prose compiles
   into a state machine whose predefined states and transitions form a
   deterministic control mechanism. Agents act within those boundaries, so
   long tasks run reliably.
3. **Playbooks of mutually checking agents.** Several agents on several LLMs
   challenge and verify each other, cutting hallucinations and defects before
   delivery.
4. **A Dashboard that decouples intents from sessions.** Work is organized
   around what you intend rather than around chats, which sharply lowers the
   mental burden.

## Getting started

Requires Node.js 22.19 or later. The desktop compiles playbooks on the Node
inside its Electron; the server shell compiles them only when its Node, or a
`node` on `PATH`, is 23.6 or later.

**1. Scaffold `specs/` in your project.**

```sh
npx @sublang/spex scaffold                        # create specs/
npx @sublang/spex scaffold --agents=claude,codex  # choose coding agents
npx @sublang/spex scaffold --lang zh              # Chinese templates where available
npx @sublang/spex scaffold --update               # refresh the scaffold
npx @sublang/spex lint                            # check the tree
```

The scaffold holds decision records, intent records, and one Markdown file
per spec package, each stating its intent, External Behavior, optional
Internal Behavior, and Verification
([meta-30](specs/meta.md#meta-30),
[DR-000](specs/decisions/000-spec-structure-format.md)).
It also installs a managed specs section in the instruction file of each
chosen agent: `CLAUDE.md`, `AGENTS.md`, or `GEMINI.md`
([scaffold-5](specs/packages/scaffold.md#scaffold-5)).
`spex lint` checks layout, sections, IDs, citations, records, and the map
([lint-3](specs/packages/lint.md#lint-3)).
`--update` needs a clean `specs/` tree, refreshes Spex-owned files, and
prints an agent prompt for the judgment work, including migration of a
spex 0.x tree ([scaffold-11](specs/packages/scaffold.md#scaffold-11),
[scaffold-26](specs/packages/scaffold.md#scaffold-26)).
The instruction files the scaffold installs tell agents to run
`npx @sublang/spex lint`, or `spex lint` where the CLI is installed
(`npm install -g @sublang/spex`)
([scaffold-56](specs/packages/scaffold.md#scaffold-56)).

**2. Develop through playbook workflows that keep the specs in sync.**
Use the built-ins, typically `/decide` to record a decision and `/code` to
implement an intent under review, or compile your own workflow from prose
in the IDE with the [`slc`](https://github.com/sublang-ai/slc) it ships.

**3. Work in the Spex IDE**, where specs, playbook runs and compilation, and
the intent Dashboard live together. Desktop and server hosts require macOS
or Linux and a filesystem that enforces private POSIX permissions. Windows
supports the scaffold CLI and browser access to a Spex server.
Run the app from source:

```sh
git clone https://github.com/sublang-ai/spex.git
cd spex
npm ci
npm start
```

`npm ci` fetches the packages and the first `npm start` fetches the
Electron binary, so the first run needs the network. `npm start` builds
the workspaces, rebuilds the `better-sqlite3` native module for Electron
from source, and launches the desktop app; the rebuild needs a C/C++
toolchain — the Xcode Command Line Tools on macOS, Python 3, `make` and
`g++` on Linux.
Real playbook runs need a ready coding-agent adapter: Claude Code signed
in (run `claude` once in a terminal, or set `ANTHROPIC_API_KEY`) or Codex
signed in (`codex`, or `OPENAI_API_KEY`); the SDKs in this checkout do
not sign you in. Settings → Agents shows each adapter's readiness and
what it still needs. Compiling playbooks needs only a ready adapter,
since the compiler is installed in this checkout.
The Claude, Codex and OpenCode SDKs are pinned by `package-lock.json` to
the releases Cligent tests; `npm ci` restores them, and is the app's own
repair when one is missing.

**First run.** The app opens on Projects. Add a project from the palette:
register an existing repository, create a new one at a path, or "Try the
Academy example", which seeds a sample project with a complete `specs/`
tree built from [`demo/`](demo). Then write to the Captain — a request,
or `/code …`; `/` in the composer lists the playbooks the starter config
enables, including `/code`, `/review`, `/decide`, `/dev`, `/branch`,
`/pr` and `/inspect`, and the quick-start card shows the first of them.
Coding and design workflows commit in your repository, so Git needs `user.name` and
`user.email`; the issue and PR panels and the Dashboard's Sources on a
GitHub remote need `gh auth login`. Config and sessions live in the
Spex home — `~/.spex`, or `SPEX_HOME` — in spex repositories under
`workspace/`: each project's records in its own, and your config at
`workspace/<you>/<you>-spex/config/playbook.config.yaml`
([storage](docs/storage.md)).

**Playbooks come in spec packages.** Each spex repository has an
environment: `spex.yaml` requests spec packages — specs with the skills
and playbooks made from them — from the Git host's registry, a Git
repository, or a folder in the working folder, and `spex.lock` pins what
was resolved ([environments](specs/packages/environments.md)). The app
ships the built-in spec package `sublang/playbooks`, which holds `/code`,
`/review`, `/decide` and the other built-ins: the first start seeds it, so
they run offline, and every new environment requests it. **Playbooks**
shows each environment's spec packages and the playbooks they export;
enable one there by choosing a player for each of its roles.

**Sharing through a Git host.** Spex works offline; sign in on **Groups**
when you want to share. The host is [spex.pub](https://spex.pub) unless
`SPEX_HOST_URL` names another when the home is first created. The desktop
opens the host's sign-in page in your browser; the server shell shows a
code to enter there. Spex then puts your own group's spex repository on
the host, and a project's once you pick a group for it; the host's
members of each spex repository see its records. Git receives the host's
credential through Spex's own credential helper, run on the app's own
runtime, never through a remote URL, and the device's token stays in
`local/credentials.yaml`, readable by you alone
([git-host](specs/packages/git-host.md),
[DR-103](specs/decisions/103-the-home-and-its-groups.md)).

App releases on [GitHub Releases](https://github.com/sublang-ai/spex/releases)
(`app-v*` tags) ship as source with a changelog: check out the tag and run
the commands above.

To use Spex from another machine, run the server shell instead. It serves
the UI and the core on one port behind a token in the URL, binds loopback by
default, and prints an SSH tunnel line; a public bind needs
`--tls-cert`/`--tls-key`
([server-shell-1](specs/packages/server-shell.md#server-shell-1),
[server-shell-2](specs/packages/server-shell.md#server-shell-2)).

```sh
npm run start:server     # prints http://127.0.0.1:8137/?token=...
```

Options take the `--name=value` form after `--` — `--host=`, `--port=`
(default 8137), `--token=` or `SPEX_TOKEN`, `--data-dir=` or `SPEX_HOME`,
`--tls-cert=`/`--tls-key=`, and `--insecure` — e.g.
`npm run start:server -- --port=0`.

## Files and browser tools

Attach files with the composer's file button, paste an image, or drop files
onto the composer. The same controls work for a new conversation, a
follow-up, queued work, and playbook authoring. Files finish uploading
before submission; failed uploads can be retried, and a refused submission
keeps its text and files. A file-only message is accepted and the Captain
can ask what you want done with it. Each file may be up to 100 MiB; one
message may contain up to 16 files and 256 MiB total. The selected agent
and model determine which formats they can interpret. When upgrading a shared
Spex home, stop older desktop, server and Playbook CLI writers first and update
them together before saving sessions with attachments.

For browser work, open the working agent in Settings → Agents, choose
**Set up browser**, and then enable **Browser** and save. Setup checks the
execution host, downloads missing managed Chromium components, and proves
that an isolated headless browser can launch and take a screenshot.
The first download can take several minutes; setup allows up to fifteen
minutes and can be cancelled while it runs.
Checking readiness does not enable access. Conversation agent settings can
override the choice for the next turn or return to the saved setting.
Authoring uses the selected agent's saved setting and offers the same setup
check beside its selector. No MCP package or command needs to be chosen.

Use `/inspect` for a task such as “Open my local app and explain its UX with
screenshots.” An existing home finds it on **Playbooks** among the built-in
spec package's playbooks: choose a player for its Inspector role and select
**Enable**. Enable Browser for the worker assigned to Inspect; the Captain's
routing calls stay tool-free.
Start the app first and include its
URL. Native figures returned by a supported agent appear in the conversation
and remain available when it reopens. Browser readiness is separate from
agent sign-in, model vision support, and the target app's availability.

On a remote server, the browser runs on that server: `localhost` refers to
the server, while files selected in your browser are uploaded as bytes.
A graphical desktop is unnecessary. Missing Linux libraries or a host
policy that prevents Chromium's sandbox produces a setup diagnostic;
setup installs no operating-system packages and does not weaken the sandbox.
An administrator must resolve those host prerequisites before retrying.
This Browser control does not grant control of arbitrary desktop apps.

See [Approvals and human decisions](docs/approvals.md) for one-time tool
permissions, workflow questions, Codex's access-to-Spex prompt, and OS grants.

## Repository

| Path | Purpose |
| --- | --- |
| [`specs/`](specs) | Source of truth for this repository; start at the [spec map](specs/map.md) |
| [`scaffold/`](scaffold), [`packages/cli`](packages/cli) | Shipped templates and the npm CLI |
| [`packages/core`](packages/core), [`packages/ui`](packages/ui) | Headless service and protocol-only web UI |
| [`apps/desktop`](apps/desktop) | Electron shell, specified in [app-shell](specs/packages/app-shell.md) |
| [`apps/server`](apps/server) | Server shell for remote browser access, specified in [server-shell](specs/packages/server-shell.md) |
| [`demo/`](demo) | Academy example and spec-package case study |

For development: `npm ci`, `npm run build`, `npm test`; `npm run e2e` drives
the served UI through its user journeys in Chromium (after a one-time
`npx playwright install chromium`). Maintainers also use the
[release smoke checklist](docs/release-smoke.md).

Contributions are welcome through
[issues](https://github.com/sublang-ai/spex/issues),
[pull requests](https://github.com/sublang-ai/spex/pulls), and
[Discord](https://discord.gg/XxTPjNqy9g).

Licensed under [Apache-2.0](LICENSE).
