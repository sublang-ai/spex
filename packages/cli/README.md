<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# spex

[![npm version](https://img.shields.io/npm/v/@sublang/spex)](https://www.npmjs.com/package/@sublang/spex)
[![Node.js](https://img.shields.io/node/v/@sublang/spex)](https://nodejs.org/)
[![CI](https://github.com/sublang-ai/spex/actions/workflows/ci.yml/badge.svg)](https://github.com/sublang-ai/spex/actions/workflows/ci.yml)

*The essential spec layer AI agents need to build software reliably.*

Scaffolds a `specs/` directory so AI coding agents can read and follow
your project's requirements and design. It is also the package manager for
spec packages: it adds, installs and publishes specs, skills and playbooks
in a folder, with no running app. Requires Node.js 22 or later.

## Install

```sh
npm install -g @sublang/spex
```

Or run once without installing:

```sh
npx @sublang/spex scaffold
```

## Quick start

The package commands act on the folder you run them in. They need no
running Spex app and no project registered anywhere.

Make a package from a skill you already have, then publish it:

```sh
spex login
spex new my-org/my-skill --skill .claude/skills/my-skill --move
spex publish my-org/my-skill --dry-run
spex publish my-org/my-skill
```

`spex login` signs this device in to the environment's registry. Open the URL it prints and
enter the code it shows. `spex new` makes `spex-packages/my-org/my-skill/`
from the skill, requests it in `spex.yaml` and installs it. `--move` moves
the skill into the package, and Spex exports it back to
`.claude/skills/`. The dry run shows the destination, the version and the
files, and uploads nothing. Publishing needs an org you may publish to at
that registry.

Use published packages in a project:

```sh
cd my-project
spex search toolkit
spex add my-org/toolkit
spex list
git add spex.yaml spex.lock
```

`spex add` requests the newest release as `^<version>`. To choose the
requirement, write it after the name: `spex add my-org/toolkit@~1.2.0`.
After a clone, `spex install` installs what `spex.lock` records. Public
packages need no sign-in; private ones need `spex login` first. Put real
names in place of the examples.

## The environment

A folder's environment is its `spex.yaml`, its `spex.lock` and its
`.spex/` folder. Each package command acts on the environment whose root
is the nearest folder holding `spex.yaml`, the current one included,
else the top level of the Git work tree, else the current folder.

| Path at the root | Holds | In Git |
| --- | --- | --- |
| `spex.yaml` | the packages you request | commit it |
| `spex.lock` | the exact versions, sources and file digests resolved | commit it |
| `.spex/` | the installed files, the generated skills and the install record | ignored by its own `.gitignore` |
| `spex-packages/<org>/<pkg>/` | each package you develop here | commit it |
| `.claude/skills/`, `.agents/skills/` | the exported skills | ignored through `.git/info/exclude` |

A `spex.yaml` looks like this:

```yaml
format: 1
registry: https://spex.sublang.ai
space: https://your-space.example
language: en
packages:
  my-org/toolkit:
    version: ^1.2.0
  my-org/my-skill:
    path: spex-packages/my-org/my-skill
```

- `registry` selects package resolution, private access and publication by
  origin. New manifests explicitly select `https://spex.sublang.ai`.
- `space`, optional, independently selects records and Git-source credential
  brokerage. It supplies no package registry authority.
- Existing manifests without `registry` keep their former Space/default
  package source until explicitly migrated. Locked versions, checksums and
  origins remain authoritative: inspect the source before setting `registry`,
  especially before publishing private packages. Locked downloads use their
  recorded registry or an explicitly trusted equivalent; another signed-in
  Space does not add a package source.
- `language`, optional, picks each artifact's language where the package
  has it, else its original.
- Each request has one source: `version` from the registry, `path` for a
  folder inside the root, used in place, or `git` with `rev` and an
  optional `path` for a Git repository.
- A version requirement is exact (`1.2.3`), caret (`^1.2.3`) or tilde
  (`~1.2.3`).

`spex install` installs the lock as it stands, so every clone installs
the same files. It resolves first only where the lock is missing or
stale: `spex.yaml` changed since it was resolved, or a path package's
`meta.yaml` no longer matches it. `spex update` resolves again on
purpose. Downloaded files are checked against the lock's digests and
kept once in the home's `store/`, then linked or copied into
`.spex/packages/`.

Installed skills reach every agent. Each one is exported to
`.claude/skills/<name>/` for Claude Code and `.agents/skills/<name>/` for
Codex, Gemini CLI, Kimi Code and OpenCode. A spec is exported as a skill
named `<org>-<pkg>` that holds the spec file. A playbook's launch skill
goes to `.claude/skills/` only. A folder of yours under an exported name
stays as it is, and the command says the export left it out.

The Spex app reads the same files. Open the folder as a project in the
app, before or after you use the CLI, and its Playbooks surface shows
the same environment. What one writes, the other reads at its next use.
Only the app:

- enables a playbook, by choosing a player for each role, and runs it
  in a session;
- prepares each installed playbook to run on its engine;
- seeds its built-in package, `sublang/playbooks`. `spex install` uses a
  copy in the same home or a registry where available; otherwise it leaves
  that package to the app and says so.

## Commands

| Command | What it does | Options |
| --- | --- | --- |
| `spex add <org>/<pkg>[@<requirement>]` | Request a package from the registry at the requirement, else at `^` its newest release; then resolve, install and export | |
| `spex add <org>/<pkg> --path <folder>` | Request a folder inside the root, used in place; then resolve, install and export | `--path <folder>` |
| `spex remove <org>/<pkg>`, alias `rm` | Drop a request, then install what remains | |
| `spex install`, alias `i` | Install the lock and export, resolving first where the lock is missing or stale | |
| `spex update` | Resolve again from `spex.yaml`, install and export, and print each version that moved | |
| `spex list`, alias `ls` | Show the registry, Space, requests, each locked package with its state, the exported skills and what the export left out | |
| `spex search <query>` | Search the environment's registry, and print each match with its versions, newest first | |
| `spex new <org>/<pkg>` | Make `spex-packages/<org>/<pkg>/` from skills and a spec, request it by path and install it | `--skill <folder>` (once per skill), `--spec <file>`, `--language <tag>`, `--description <text>`, `--license <id>`, `--move` |
| `spex publish [<org>/<pkg>]` | Publish the package's folder to the environment's registry | `--dry-run` |
| `spex login` | Sign in to the selected registry or Space | `--registry <origin>` or `--space <origin>`, `--force` |
| `spex logout` | Sign out of the selected registry or Space | `--registry <origin>` or `--space <origin>` |
| `spex whoami` | Show the selected registry or Space sign-in | `--registry <origin>` or `--space <origin>` |

`scaffold` and `lint` are described under [Usage](#usage) and
[Linting](#linting). `spex --help` lists every command.

### `spex new`

- `<org>` and `<pkg>` are lowercase letters, digits and single hyphens,
  at most 64 characters each.
- Each `--skill` folder needs a `SKILL.md` whose frontmatter `name` is an
  Agent Skills name. It lands at `skills/<language>/<name>/`.
- The `--spec` file must be named `<pkg>.md`. It lands at
  `specs/<language>/<pkg>.md`. A package holds at most one spec.
- `<language>` is `--language`, else `en`.
- The manifest, `meta.yaml`, starts at version `0.1.0`. Its description
  is `--description`, else the first skill's `description`, else the
  spec's first paragraph under its Intent heading. Its license is
  `--license`, else `MIT` where the root's `LICENSE` begins with
  "MIT License", else `Apache-2.0`. The root's `LICENSE` is copied in.
- `--move` moves the skill folders instead of copying them. A skill moved
  out of `.claude/skills/` comes back there as Spex's export. Without
  `--move`, your own folder stays, and the export leaves it alone.
- Every rule is checked before anything is written. A refusal writes
  nothing.

### `spex publish`

- With a name, it publishes the folder `spex.yaml` requests that name by,
  else `spex-packages/<org>/<pkg>/`. With no name, it publishes the one
  package under `spex-packages/`, and lists them where there are several.
- It publishes to the environment's registry with that registry's grant.
  Signed out there, it refuses and names `spex login`. Namespace eligibility
  follows registry permission, independently of Space membership.
- The manifest needs a `description` and a `license`.
- `--dry-run` prints the destination, `<org>/<pkg>@<version>` and the
  files, and uploads nothing. A publish prints the package's page at the
  registry.
- A release never changes. Raise `version` in `meta.yaml` before you
  publish again.

## Signing in

Registry and Space grants are independent, even at the same origin:

```sh
spex login
spex login --registry https://spex.sublang.ai
spex login --space https://your-space.example
spex whoami
spex logout --registry https://spex.sublang.ai
```

- Without a target flag, `login`, `logout` and `whoami` use registry purpose
  at the environment's package origin, or the public registry when no
  manifest exists. `--registry` and `--space` are mutually exclusive.
- `spex login` prints a verification URL and code. Open the URL, enter the
  code and approve. It waits until the selected service confirms or the
  code expires. Ctrl-C stops it and records nothing.
- Public packages need no sign-in. Private packages and publishing need
  their registry's own grant on the machine running the package manager,
  including a team server seat. Space admission supplies no registry grant.
- An origin is `https://<host>`, with a port where it is not the default;
  `http` is accepted only on a loopback host.
- An existing selected grant is reported unless `--force` replaces it.
  Registry sign-in creates no Space entry or repository consent.
- Registry `whoami` reads that registry's account; explicit Space `whoami`
  reports the recorded Space account or that it is signed out.
- Logout revokes and removes only the selected grant. Signing out of a
  registry keeps Space grants, and signing out of a Space keeps registry
  grants. Space entries remain listed as signed out.
- The home is `SPEX_HOME`, else `~/.spex`. Space entries are in `home.yaml`;
  purpose-specific credentials are in owner-readable `local/credentials.yaml`.
  Existing origin-only slots remain Space credentials and are never promoted
  to registry credentials. No command prints a token.

## Exit codes

The package commands exit with these codes. `scaffold` and `lint` keep
their own.

| Code | Meaning |
| --- | --- |
| `0` | the command succeeded |
| `1` | a refusal or a failure, its cause on standard error after `spex <command>:` |
| `130` | interrupted, as by Ctrl-C |

A cause names what refused: the registry, the Space or a file. Where
there is one thing to do, it says what. An interrupted install leaves the
last installed files and lock in place. An interrupted publish cannot
take back an upload the registry already accepted.

## Limits

- The CLI acts on a folder's environment. Your own group's environment
  is the app's alone.
- `spex update` resolves the whole environment again. It takes no
  package name.
- No command adds a Git source. A `git` request you write in `spex.yaml`
  by hand is resolved and installed as written. A signed-in Space may
  broker its permitted Git sources; other sources use this device's Git
  access. Registry sign-in supplies no Git transport credential.
- The built-in package `sublang/playbooks` is the app's. `spex install`
  installs it from the copy the app keeps in the same home, where there
  is one, or from its registry, else leaves it to the app.

## Usage

```sh
spex scaffold
```

This creates:

- **`specs/`** — the spec tree and its law:
  - `specs/packages/` holds one file per spec package: a self-contained `## Intent`, the behavior its users may rely on (`## External Behavior`), implementation hidden from them (`## Internal Behavior`), and the tests of its own claims (`## Verification`) — one read covers one package.
    Behavior that emerges from several packages working together is itself a spec package citing the peers' External Behavior — there is no compositions directory.
  - `specs/decisions/` and `specs/intents/` hold decision records (DRs) and intent records (IRs); `specs/map.md` indexes decisions and packages and `specs/meta.md` is the spec of specs.
  - Two starter packages (`git.md`, `licensing.md`) and a sample intent record seed the tree.
- **`LICENSE`** — the verbatim Apache-2.0 text at the target root, written only when no `LICENSE` exists there.
- **Agent instruction files** — a managed section that tells coding
  agents to read relevant specs, resolve conflicts there first, and keep
  specs and code aligned: `CLAUDE.md` for Claude Code, `AGENTS.md` for
  Codex, Kimi Code, and OpenCode, and `GEMINI.md` for Gemini CLI.

See `specs/decisions/000-spec-structure-format.md` and `specs/meta.md` for the spec format and naming conventions.

Idempotency: rerunning `scaffold` is safe — authored specs and content
outside Spex's managed `## Specs (Source of Truth)` sections stay
untouched. Agent instruction files are reconciled as described below.
(`--update` edits more, mechanically; see below.)

### Agent instructions

Interactive scaffold and update runs infer the current instruction
targets and ask for a quick default-yes confirmation. If you have
changed agents, decline and select the agents you use now. A fresh
project defaults to all supported targets.

For a non-interactive run, or to select directly, pass agent names:

```sh
spex scaffold --agents=claude,codex
spex scaffold --update --agents=gemini,kimi
```

Supported names are `claude`, `codex`, `gemini`, `kimi`, and
`opencode`; `all` selects all of them. The selection is the desired
state: Spex adds or refreshes selected managed sections and removes its
managed section from deselected targets, preserving all other content.
An otherwise empty deselected instruction file is removed.

### Linting

Check the specs tree at any time:

```sh
spex lint
```

The linter validates the layout, package file sections and their order, item IDs — lowercase `<pack>-<N>` matching the file's basename, unique across the tree — citations (enclosed inline links like `[[pack-3](pack.md#pack-3)]` whose files and anchors exist), Verification items citing the behaviors they check, reference markers, record sections, and the `map.md` index.
Relationship-metadata lines like `Verifies:` are errors — the citations woven into an item's statement are the single source of its relationships.
Directories of previous spec generations (`specs/compositions/`, `specs/user/`, …) are errors pointing to `spex scaffold --update` for the migration prompt (see [Upgrading](#upgrading-from-an-earlier-release)).
Errors exit non-zero; warnings do not.

**Try it:** review the sample intent record `specs/intents/000-spdx-headers.md` and the header format the scaffold pinned in `licensing-9` of `specs/packages/licensing.md`, replacing any `<license>` or `<holder>` placeholder it left, then prompt your AI coding agent:

```text
Complete IR-000
```

### Localization

Specs are scaffolded in English by default. To scaffold in another language, pass `--lang`:

```sh
spex scaffold --lang zh
```

Chinese (`zh`) is currently bundled. Any file without a localized template falls back to English, so the tree is always complete. The chosen language is recorded in `specs/meta.md` and reused automatically on `spex scaffold --update`.

To switch an existing tree to another language:

```bash
spex scaffold --update --lang zh
```

This rewrites the bundled specs in the target language and prints a prompt you can hand an AI agent to translate the project's own specs; passing the language the tree already uses is just an ordinary update.

### Updating templates

When a new release ships updated templates, refresh them with:

```sh
spex scaffold --update
```

It runs from within a git repository and requires a clean `specs/` working tree, so every edit stays reviewable.

- Spex-authoritative *framework* files (`specs/meta.md` and the spec-format decision record) are refreshed unconditionally, including when they are absent. If you had modified one of these, `--update` warns and names it so you can reapply your changes from git history.
- Starter *seed* files (`map.md`, the sample intent record, the starter packages) are refreshed when you have not customized them, and written from the bundled template when they are absent. `licensing.md`, whose `licensing-9` the scaffold pins to your project, counts as customized and is kept. Customized starter files are kept as-is. Remove a starter file *after* `--update` if you do not want it.
- Agent instruction files are reconciled with the confirmed or explicit
  selection; a non-interactive run infers existing managed targets and
  defaults to all targets when none exist.
- Files outside the framework and seed sets and the supported agent
  instruction targets are never edited.

Review the changes with
`git diff -- specs CLAUDE.md AGENTS.md GEMINI.md` and run `spex lint`.
The command prints a per-file indicator for every framework and seed path, plus a copy-paste-ready prompt for your AI agent to reconcile citations and local extensions with the refreshed law.

## Upgrading from an earlier release

### From 4.x

Spex 5.0 replaces the commands that attached to a running app with
top-level commands that need no app:

| 4.x | 5.0 |
| --- | --- |
| `spex package init <org>/<name> ...` | `spex new <org>/<pkg> ...`, writing `spex-packages/<org>/<pkg>/` |
| `spex package add <org>/<pkg> --version <requirement>` | `spex add <org>/<pkg>@<requirement>` |
| `spex package add <org>/<pkg> --path <folder>` | `spex add <org>/<pkg> --path <folder>` |
| `spex package install` | `spex install` |
| `spex package resolve` | `spex update` |
| `spex package remove <org>/<pkg>` | `spex remove <org>/<pkg>` |
| `spex package search <query>` | `spex search <query>` |
| `spex package status` | `spex list` |
| `spex package publish <folder> [--dry-run]` | `spex publish <org>/<pkg> [--dry-run]` |
| `spex auth login --instance <origin>` | `spex login --space <origin>` |
| `spex auth status` | `spex whoami --space <origin>` |
| none | `spex logout` |
| `spex project add <folder>`, `spex project list` | none: no project registration is needed |
| `--server`, `SPEX_SERVER_URL`, `--project`, `--timeout` | none: no app is needed |

The package manager now runs inside the CLI on the folder's own files,
and the Spex app runs the same code. An environment's files stand at the
folder's root, with the installed files under `.spex/`; an environment
an earlier app kept in the project's records moves into the working
folder at the app's next start.
The move preserves explicit registry selection and locked provenance. An old
manifest without `registry` keeps its previous package destination; adding the
field is an explicit migration, not permission to retarget a private publish.
Old Space credentials remain Space-only, so private registry access needs a
separate `spex login --registry <origin>`.

A folder `spex package init` made at `spex-packages/<name>/` still
publishes by name while `spex.yaml` requests it by that path. Exit code
`2` is gone. Deep imports such as `@sublang/spex/dist/cli.js` no longer
resolve; the package's `exports` name its modules.

### From 2.x

Spex 3.0 makes intent records disposable planning artifacts: no other
spec may cite or name an IR, and `specs/map.md` indexes decisions and
packages only. Run `spex scaffold --update`, remove intent rows from a
customized map and references to IRs from other specs, then reconcile
until `spex lint` passes.

### From 1.x

Spex 2.0 tightens the packages-only law introduced in 1.0. Run
`spex scaffold --update`, review the refreshed law and printed merge prompt,
then reconcile your packages until `spex lint` passes. In particular,
every package now requires Verification of its own behavior, behavior
citations from Verification stay inside that package, DR citations
use their exact IDs, and every item-bearing basename is tree-wide unique.

### From 0.x

A tree scaffolded by a spex 0.x release carries the older structural
generation of the law. Spex 2.0 and later use the following structure:

| | Previous generations (spex 0.x) | Packages generation (spex 2.0+) |
| --- | --- | --- |
| Layout | `specs/user`/`dev`/`test`, later `packages/` + `compositions/` | `packages/` only — composition is a package pattern |
| Cross-package behavior | binding and scenario items in composition files | behavior items binding inline to peers' External Behavior |
| Item IDs | ALLCAPS short form (`AUTH-3`) | lowercase file basename (`github-login-3`) |
| Item citations | `[AUTH-3](auth.md#auth-3)` | enclosed: `[[github-login-3](github-login.md#github-login-3)]` |
| Intent records | Goal, Deliverables, Tasks, Acceptance criteria | Status, Intent, Deliverables, Tasks, Verification |

The CLI detects but does not restructure a legacy tree:

- `spex scaffold --update` still refreshes the spex-owned law files, leaves all legacy content untouched, and prints a self-contained migration prompt instead of the ordinary update prompt when it recognizes a legacy generation.
- Plain `spex scaffold` refuses a tree with a legacy directory — it writes nothing and points at `--update` — so two generations never entangle.
- `spex lint` reports legacy directories as errors pointing the same way.

The structural migration itself — items reclassify, compositions fold into packages, intents get rewritten — is judgment work, not a script.
Give the printed prompt to any capable AI agent, let it loop until `spex lint` passes, and review the resulting diff.

## Workflow

Spex does *not* enforce a heavyweight workflow.
We believe spec-driven development is a flexible combination of a few primitives.

1. **Make Decisions** — Discuss requirements, architecture, and design with AI agents. Let AI generate and review decision records in `specs/decisions/`.
2. **Record Intents** — Break down work into tasks with AI agents. Let AI generate and review intent records in `specs/intents/`.
3. **Agents Execute** — Let AI agents complete the tasks autonomously. They generate code and update `specs/packages/`.

Then loop back to the next decision or intent.

## Requirements

- Node.js >= 22
- Git (optional, used for repo root detection)

## Contributing

We welcome contributions of all kinds. If you'd like to help:

- 🌟 Star our repo if you find spex useful.
- [Open an issue](https://github.com/sublang-ai/spex/issues) for bugs or feature requests.
- [Open a PR](https://github.com/sublang-ai/spex/pulls) for fixes or improvements.
- Discuss on [Discord](https://discord.gg/XxTPjNqy9g) for support or new ideas.

## License

[Apache-2.0](LICENSE)
