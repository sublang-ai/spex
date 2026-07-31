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

- **`specs/`** — the spec tree and its law:
  - `specs/packages/` holds one file per spec package: a self-contained `## Intent`, the behavior its users may rely on (`## External Behavior`), implementation hidden from them (`## Internal Behavior`), and the tests of its own claims (`## Verification`) — one read covers one package.
    Behavior that emerges from several packages working together is itself a spec package citing the peers' External Behavior — there is no compositions directory.
  - `specs/decisions/` and `specs/intents/` hold decision records (DRs) and intent records (IRs); `specs/map.md` indexes the tree and `specs/meta.md` is the spec of specs.
  - Two starter packages (`git.md`, `licensing.md`) and a sample intent record seed the tree.
- **`LICENSE`** — the verbatim Apache-2.0 text at the target root, written only when no `LICENSE` exists there.
- **`CLAUDE.md` / `AGENTS.md`** — instructions that tell AI agents (Claude, Codex, etc.) to read and follow the specs before writing code.

See `specs/decisions/000-spec-structure-format.md` and `specs/meta.md` for the spec format and naming conventions.

Idempotency: rerunning `scaffold` is safe — it only adds missing files.
The one in-place edit it makes is to an existing `CLAUDE.md`/`AGENTS.md`, whose managed `## Specs (Source of Truth)` section is added or refreshed.
(`--update` edits more, mechanically; see below.)

### Linting

Check the specs tree at any time:

```sh
spex lint
```

The linter validates the layout, package file sections and their order, item IDs — lowercase `<pack>-<N>` matching the file's basename, unique across the tree — citations (enclosed inline links like `[[pack-3](pack.md#pack-3)]` whose files and anchors exist), Verification items citing the behaviors they check, reference markers, record sections, and the `map.md` index.
Relationship-metadata lines like `Verifies:` are errors — the citations woven into an item's statement are the single source of its relationships.
Directories of previous spec generations (`specs/compositions/`, `specs/user/`, …) are errors pointing at the migration skill (see [Upgrading](#upgrading-from-a-previous-generation)).
Errors exit non-zero; warnings do not.

**Try it:** review the sample intent record `specs/intents/000-spdx-headers.md`, update the copyright text, then prompt your AI coding agent:

```text
Complete IR-000
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

It runs from within a git repository and requires a clean `specs/` working tree, so every edit stays reviewable.

- Spex-authoritative *framework* files (`specs/meta.md` and the spec-format decision record) are refreshed unconditionally, including when they are absent. If you had modified one of these, `--update` warns and names it so you can reapply your changes from git history.
- Starter *seed* files (`map.md`, the sample intent record, the starter packages) are refreshed when you have not customized them, and written from the bundled template when they are absent. Customized starter files are kept as-is. Remove a starter file *after* `--update` if you do not want it.
- The managed specs section of an existing `CLAUDE.md`/`AGENTS.md` is refreshed; absent agent files are not created.
- Files you authored are never edited.

Review the changes with `git diff -- specs CLAUDE.md AGENTS.md` and run `spex lint`.
The command prints a per-file indicator for every framework and seed path, plus a copy-paste-ready prompt for your AI agent to reconcile citations and local extensions with the refreshed law.

## Upgrading from a previous generation

Spex 1.0 rewrote the spec convention — the law in `specs/meta.md` and the spec-format decision record.
A tree scaffolded by any spex 0.x release carries a previous generation of that law; a future rewrite would be a 2.0.
What changed:

| | Previous generations (spex 0.x) | Current generation (spex 1.0) |
| --- | --- | --- |
| Layout | `specs/user`/`dev`/`test`, later `packages/` + `compositions/` | `packages/` only — composition is a package pattern |
| Cross-package behavior | binding and scenario items in composition files | ordinary packages citing peers' External Behavior |
| Item IDs | ALLCAPS short form (`AUTH-3`) | lowercase file basename (`github-login-3`) |
| Item citations | `[AUTH-3](auth.md#auth-3)` | enclosed: `[[github-login-3](github-login.md#github-login-3)]` |
| Intent records | Goal, Deliverables, Tasks, Acceptance criteria | Status, Intent, Deliverables, Tasks, Verification |

The CLI detects but does not restructure a legacy tree:

- `spex scaffold --update` still refreshes the spex-owned law files, leaves all legacy content untouched, and prints migration guidance when it recognizes a legacy generation.
- Plain `spex scaffold` refuses a tree with a legacy directory — it writes nothing and points at `--update` — so two generations never entangle.
- `spex lint` reports legacy directories as errors pointing the same way.

The structural migration itself — items reclassify, compositions fold into packages, intents get rewritten — is judgment work done by an AI agent following the **spec-structure-migration** skill shipped in the spex repo, not by a script (the scripted migration of earlier releases is retired).
Follow the walkthrough in [docs/spec-migration.md](https://github.com/sublang-ai/spex/blob/main/docs/spec-migration.md), install the skill per [its README](https://github.com/sublang-ai/spex/blob/main/skills/spec-structure-migration/README.md), and let the agent loop until its checker and `spex lint` — the mechanical gate — pass clean.

## Workflow

Spex does *not* enforce a heavyweight workflow.
We believe spec-driven development is a flexible combination of a few primitives.

1. **Make Decisions** — Discuss requirements, architecture, and design with AI agents. Let AI generate and review decision records in `specs/decisions/`.
2. **Record Intents** — Break down work into tasks with AI agents. Let AI generate and review intent records in `specs/intents/`.
3. **Agents Execute** — Let AI agents complete the tasks autonomously. They generate code and update `specs/packages/`.

Then loop back to the next decision or intent.

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
