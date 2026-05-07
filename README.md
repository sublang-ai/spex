<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# spex

[![npm version](https://img.shields.io/npm/v/@sublang/spex)](https://www.npmjs.com/package/@sublang/spex)
[![Node.js](https://img.shields.io/node/v/@sublang/spex)](https://nodejs.org/)
[![CI](https://github.com/sublang-ai/spex/actions/workflows/ci.yml/badge.svg)](https://github.com/sublang-ai/spex/actions/workflows/ci.yml)

*The essential spec layer AI agents need to build software reliably.*

Scaffolds a `specs/` directory so AI coding agents can read and follow
your project's requirements and design.

## Install

```sh
npm install -g @sublang/spex
```

Or run once without installing:

```sh
npx @sublang/spex scaffold
```

## Usage

```sh
spex scaffold
```

This creates:

- **`specs/`** — directories and starter templates for writing behavioral
  specs, decision records, and iteration plans
- **`CLAUDE.md` / `AGENTS.md`** — instructions that tell AI agents (Claude,
  Codex, etc.) to read and follow the specs before writing code

See `specs/decisions/000-spec-structure-format.md` for the spec format and naming conventions.

Idempotency: Rerunning is safe — existing files and directories are skipped.

**Try it:** review the sample iteration `specs/iterations/000-spdx-headers.md`, update the copyright text, then prompt your AI coding agent:

```text
Complete Iteration #0
```

### Updating templates

When a new spex release ships updated scaffold templates, refresh them with:

```sh
spex scaffold --update
```

This overwrites every scaffold-shipped file in your working tree with the
latest version — including `meta.md`, `map.md`, the starter decision
record, the starter iteration, and boilerplate items under `items/dev/`
and `items/test/`. Files you added yourself (new decision records, new
iterations, new items, anything under `items/user/`) are untouched.

Review the diff with `git diff -- specs` and reconcile your edits to the
overwritten files with the new versions.

Preconditions:

- Run from inside a git repository.
- `specs/` working tree must be clean (commit or stash local changes first).
- The scaffold-provided files must be tracked in `HEAD`.

After the command runs, it prints a merge prompt you can hand to your AI
agent to reconcile the new framework templates (working tree) with your
prior customizations (`HEAD`). To discard the update, run
`git checkout -- specs`.

## Workflow

Spex does *not* enforce a heavyweight workflow.
We believe spec-driven development is a flexible combination of a few primitives.

1. **Make Decisions** — Discuss requirements, architecture, and design with AI agents. Let AI generate and review decision records in `specs/decisions/`.
2. **Plan Iterations** — Break down work into tasks with AI agents. Let AI generate and review iteration records in `specs/iterations/`.
3. **Agents Execute** — Let AI agents complete the tasks autonomously. They generate code and update `specs/items/`.

Then loop back to the next decision or iteration.

## Requirements

- Node.js >= 20
- Git (optional, used for repo root detection)

## Contributing

We welcome contributions of all kinds. If you'd like to help:

- 🌟 Star our repo if you find spex useful.
- [Open an issue](https://github.com/sublang-ai/spex/issues) for bugs or feature requests.
- [Open a PR](https://github.com/sublang-ai/spex/pulls) for fixes or improvements.
- Discuss on [Discord](https://discord.gg/XxTPjNqy9g) for support or new ideas.

## License

[Apache-2.0](LICENSE)
