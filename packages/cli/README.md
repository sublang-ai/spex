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
  specs, decision records, and iteration plans:
  - `specs/packages/` holds one file per spec package, with its
    user-visible behavior (`## External Behavior`), implementation
    requirements (`## Internal Behavior`), and the tests of its own
    claims (`## Verification`) — one read covers one package.
  - `specs/interactions/` holds cross-package behaviors and scenarios,
    including the integration and acceptance tests that span packages.
- **`CLAUDE.md` / `AGENTS.md`** — instructions that tell AI agents (Claude,
  Codex, etc.) to read and follow the specs before writing code

See `specs/decisions/000-spec-structure-format.md` for the spec format and naming conventions.

Idempotency: Rerunning is safe — existing files and directories are skipped.

### Linting

Check the specs tree at any time:

```sh
spex lint
```

The linter validates the layout, package file sections, item ID uniqueness
and prefixes, `Verifies:` lines, citations (files and anchors), reference
markers, and the `map.md` index. Errors exit non-zero; warnings do not.

**Try it:** review the sample iteration `specs/iterations/000-spdx-headers.md`, update the copyright text, then prompt your AI coding agent:

```text
Complete Iteration #0
```

### Localization

Specs are scaffolded in English by default. To scaffold in another language, pass `--lang`:

```sh
spex scaffold --lang zh
```

Chinese (`zh`) is currently bundled. Any file without a localized template falls back to English, so the tree is always complete. The chosen language is recorded in `specs/meta.md` and reused automatically on `spex scaffold --update`.

### Updating templates

When a new release ships updated templates, refresh them with:

```sh
spex scaffold --update
```

- Trees on the legacy `specs/user`/`specs/dev`/`specs/test` layout are
  migrated automatically: each package's files are merged into one
  `specs/packages/<name>.md` (sections in place, heading levels adjusted,
  reference markers renumbered), citations across `specs/` are rewritten to
  the new paths, and a customized `map.md` is restructured in place.
- Spex-authoritative files (`specs/meta.md` and the spec-format decision record) are refreshed unconditionally, including when they are absent. If you had modified one of these, `--update` warns and names it so you can reapply your changes from git history.
- Starter files (`map.md`, the sample iteration, boilerplate items) are refreshed when you have not customized them, and written from the bundled template when they are absent. Customized starter files are kept as-is. Remove a starter file *after* `--update` if you do not want it.
- Anything you authored outside the bundled framework and starter files is left alone.
- The managed specs section of an existing `CLAUDE.md`/`AGENTS.md` is
  refreshed; absent agent files are not created.

Review the changes with `git diff -- specs` and run `spex lint`.
The command prints clear next steps plus two copy-paste-ready prompts for
your AI agent: one to reconcile citations and local extensions, and one to
fill `specs/interactions/` with the cross-package behavior and tests that
the mechanical migration cannot infer.

## Workflow

Spex does *not* enforce a heavyweight workflow.
We believe spec-driven development is a flexible combination of a few primitives.

1. **Make Decisions** — Discuss requirements, architecture, and design with AI agents. Let AI generate and review decision records in `specs/decisions/`.
2. **Plan Iterations** — Break down work into tasks with AI agents. Let AI generate and review iteration records in `specs/iterations/`.
3. **Agents Execute** — Let AI agents complete the tasks autonomously. They generate code and update `specs/packages/` and `specs/interactions/`.

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
