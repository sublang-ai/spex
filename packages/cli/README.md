<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# spex

[![npm version](https://img.shields.io/npm/v/@sublang/spex)](https://www.npmjs.com/package/@sublang/spex)
[![Node.js](https://img.shields.io/node/v/@sublang/spex)](https://nodejs.org/)
[![CI](https://github.com/sublang-ai/spex/actions/workflows/ci.yml/badge.svg)](https://github.com/sublang-ai/spex/actions/workflows/ci.yml)

*The essential spec layer AI agents need to build software reliably.*

Scaffolds a `specs/` directory so AI coding agents can read and follow
your project's requirements and design. It also manages spec packages:
it adds, installs and publishes specs, skills and playbooks in a
folder, with no running app. Requires Node.js 22 or later.

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
running Spex app.

Use published packages in a project:

```sh
cd my-project
spex search toolkit
spex add my-org/toolkit
spex list
git add spex.yaml spex.lock
```

`spex add` adds the newest version as `^<version>`. To choose the
version, write it after the name: `spex add my-org/toolkit@~1.2.0`.
After a clone, `spex install` installs what `spex.lock` records. Public
packages need no sign-in; private ones need `spex login` first. Put real
names in place of the examples.

Start a package from a skill you already have, then publish it:

```sh
spex login
spex new my-org/my-skill --skill .claude/skills/my-skill --move
spex publish my-org/my-skill --dry-run
spex publish my-org/my-skill
```

`spex login` signs you in to the registry with a code in your browser:
open the address it prints and enter the code it shows. `spex new`
starts `spex-packages/my-org/my-skill/` from the skill, adds it to
`spex.yaml` and installs it. `--move` moves the skill into the package,
and Spex places it back in `.claude/skills/` for your agent. The dry run
shows the registry, the version and the files, and uploads nothing.
Publishing needs an org that is yours at that registry.

## spex.yaml and spex.lock

A folder's packages are listed in two files at its top, `spex.yaml` and
`spex.lock`, and installed under `.spex/`. Each package command acts on
the nearest folder holding `spex.yaml`, the current one included, else
the top level of the Git work tree, else the current folder.

| Path | Holds | In Git |
| --- | --- | --- |
| `spex.yaml` | the packages you add and the registry they come from | commit it |
| `spex.lock` | the exact version, source and file digests of every package installed | commit it |
| `.spex/` | the installed files and the skills made for your agents | ignored by its own `.gitignore` |
| `spex-packages/<org>/<pkg>/` | each package you develop here | commit it |
| `.claude/skills/`, `.agents/skills/` | the skills placed for your agents | ignored through `.git/info/exclude` |

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

- `registry` is where packages come from, and where `spex publish`
  sends yours. A new `spex.yaml` names the public registry, Spex Space
  at `https://spex.sublang.ai`.
- `space`, optional, is the Space this project's records sync with. It
  changes nothing about where packages come from.
- `language`, optional, picks each package's files in that language
  where the package has them, else its original.
- Each package has one source: `version` from the registry, `path` for a
  folder in this project, used in place, or `git` with `rev` and an
  optional `path` for a Git repository.
- A version is exact (`1.2.3`), caret (`^1.2.3`: any 1.x from 1.2.3) or
  tilde (`~1.2.3`: any 1.2.x from 1.2.3).

`spex install` installs what `spex.lock` records, so every clone
installs the same files. It updates `spex.lock` first only where the
file is missing or out of date: `spex.yaml` changed since, or a folder
package's `meta.yaml` no longer matches it. `spex update` moves to the
newest versions `spex.yaml` allows, on purpose. Downloaded files are
checked against the digests in `spex.lock` and kept once in the home's
`store/`, then linked or copied into `.spex/packages/`.

Installed skills reach every agent. Each one is placed in
`.claude/skills/<name>/` for Claude Code and `.agents/skills/<name>/` for
Codex, Gemini CLI, Kimi Code and OpenCode. A spec is placed as a skill
named `<org>-<pkg>` that holds the spec file. A playbook's launch skill
goes to `.claude/skills/` only. A folder of yours under the same name
stays as it is, and the command says it left that skill out.

The Spex app reads the same files. Open the folder as a project in the
app, before or after you use the CLI, and its **Packages** tab shows the
same packages. What one writes, the other reads at its next use. Only
the app:

- enables a playbook, by choosing a player for each role, and runs it
  in a session;
- prepares each installed playbook to run on its engine;
- holds the built-in playbooks, `sublang/playbooks`, which come with
  Spex. `spex install` uses a copy the app keeps in the same home, or a
  registry, where it can; otherwise it leaves them to the app and says so.

## Commands

The tables follow `spex --help`. `spex <command> --help` prints a
command's lines and every option it takes; `spex --version` prints the
installed version.

### Packages in this folder (spex.yaml, spex.lock, .spex/)

| Command | What it does |
| --- | --- |
| `spex add <org>/<pkg>[@<version>]` | Add a package (newest by default) |
| `spex add <org>/<pkg> --path <folder>` | Add a package from a folder in this project |
| `spex remove <org>/<pkg>`, alias `rm` | Remove a package |
| `spex install`, alias `i` | Install what `spex.lock` records |
| `spex update` | Update to the newest versions `spex.yaml` allows |
| `spex list`, alias `ls` | What is added, installed, and placed for your agents |
| `spex search <query>` | Find packages at the registry |

### Your packages

| Command | What it does |
| --- | --- |
| `spex new <org>/<pkg> [--skill <folder>]… [--spec <file>]` | Start a package in `spex-packages/<org>/<pkg>/` |
| `spex publish [<org>/<pkg>] [--dry-run]` | Publish it to the registry |

### Sign-in

| Command | What it does |
| --- | --- |
| `spex login [--registry <url> \| --space <url>]` | Sign in with a code in your browser |
| `spex logout` | Sign out at this folder's registry, or at the one given |
| `spex whoami` | Who you are signed in as at the registry and at each Space |

### Specs

| Command | What it does |
| --- | --- |
| `spex scaffold` | Create `specs/` with its templates, and point your agents at it |
| `spex lint` | Check `specs/` for structure, item IDs and citations |

[Scaffolding specs](#scaffolding-specs) and [Linting](#linting) describe
them in full.

### `spex add`, `remove`, `update` and `list`

- `spex add <org>/<pkg>` adds the newest version the registry lists
  that is no prerelease, as `^<version>`; `@<version>` adds the one you
  write. `--path` adds a folder in this project instead, read in place.
  A malformed name or version, a version and `--path` together, a folder
  outside this project, and a package the registry does not list to you
  are each refused before anything is written.
- `spex remove` drops a package you added, with what only it needed,
  and refuses one `spex.yaml` does not list. The built-in playbooks
  cannot be removed: "sublang/playbooks comes with Spex".
- `spex update` updates every package at once and prints each one whose
  version changed. It takes no package name.
- `spex list` heads with the folder and the registry, then lists what
  is **Added** to `spex.yaml`, what is **Installed** with its version
  and source — from the registry, from a folder, from Git or built in —
  and the **Skills for agents** with the folders each is placed in. In a
  folder with no packages, it says so and names `spex add`.

### `spex new`

- `<org>` and `<pkg>` are lowercase letters, digits and single hyphens,
  at most 64 characters each.
- Each `--skill` folder needs a `SKILL.md` whose frontmatter `name` is an
  Agent Skills name. It lands at `skills/<language>/<name>/`.
- The `--spec` file must be named `<pkg>.md`. It lands at
  `specs/<language>/<pkg>.md`. A package holds at most one spec.
- `--language <tag>` sets `<language>`, else `en`.
- `meta.yaml` starts at version `0.1.0`. Its description is
  `--description <text>`, else the first skill's `description`, else the
  spec's first paragraph under its Intent heading. Its license is
  `--license <id>`, else `MIT` where the folder's `LICENSE` begins with
  "MIT License", else `Apache-2.0`. The folder's `LICENSE` is copied in.
- `--move` moves the skill folders instead of copying them. A skill moved
  out of `.claude/skills/` comes back there, placed by Spex. Without
  `--move`, your own folder stays, and Spex leaves it alone.
- Every rule is checked before anything is written. A refusal writes
  nothing.

### `spex publish`

- With a name, it publishes the folder `spex.yaml` adds that package
  from, else `spex-packages/<org>/<pkg>/`. With no name, it publishes the
  one package under `spex-packages/`, and lists them where there are
  several.
- It publishes to the registry `spex.yaml` names, as the account you
  signed in with there. Signed out, it refuses and names `spex login`.
- The org must be yours at that registry; at Spex Space, claim it on
  `https://spex.sublang.ai/account/orgs`. A Space group gives you no
  org.
- `meta.yaml` needs a `description` and a `license`.
- `--dry-run` prints the registry, `<org>/<pkg>@<version>` and the
  files, and uploads nothing. A publish prints the package's page at the
  registry.
- A release never changes. Raise `version` in `meta.yaml` before you
  publish again.

## Signing in

A registry sign-in and a Space sign-in are separate, even at one
address: the first reads private packages and publishes, the second
syncs a project's records.

```sh
spex login
spex login --registry https://spex.sublang.ai
spex login --space https://your-space.example
spex whoami
spex logout --registry https://spex.sublang.ai
```

- With no flag, `login` and `logout` act on the registry `spex.yaml`
  names, or on the public registry where there is no `spex.yaml`.
  `--registry <url>` or `--space <url>` picks another; the two cannot be
  combined.
- `spex login` signs in with a code in your browser: it prints an
  address and a code, and waits until you approve or deny there, or the
  code expires. Ctrl-C stops it and saves nothing.
- A sign-in you already have is reported and kept; `--force` replaces
  it. Signing in to a registry adds no Space.
- `spex whoami` prints one line for the registry and one for each Space
  you have signed in to on this computer, each with `@<login>` or
  `signed out`, marking `(default)` the Space a `spex.yaml` without
  `space` uses; with a flag, it prints that line alone:

  ```text
  Registry  Spex Space  @me
  Space     Spex Space  @me (default)
  ```

- `spex logout` signs out of the one it acts on. Signing out of a
  registry keeps your Space sign-ins, and signing out of a Space keeps
  your registry sign-in. A Space you signed out of stays listed as
  `signed out`.
- Public packages need no sign-in. Private packages and publishing need
  a registry sign-in on the computer running the command, a team server
  included; a Space sign-in gives none.
- A `<url>` is just the address, like `https://spex.sublang.ai`: the
  host, with a port where it is not the default, and no path. `http` is
  accepted only for a loopback address such as `localhost`.
- The home is `SPEX_HOME`, else `~/.spex`. The Spaces you signed in to
  are listed in its `home.yaml`; sign-ins are kept in
  `local/credentials.yaml`, readable by you alone. No command prints a
  token.

## Exit codes

The package commands exit with these codes. `scaffold` and `lint` keep
their own.

| Code | Meaning |
| --- | --- |
| `0` | the command succeeded |
| `1` | a refusal or a failure, its cause on standard error |
| `130` | interrupted, as by Ctrl-C |

A cause is one line naming the registry, the Space or the file by its
name, and ends in what to do where there is something to do:

```text
acme/secret: not at Spex Space, or private — spex login, then retry
Spex Space could not be reached — check the connection, then retry
my-org is not yours at Spex Space — claim it at https://spex.sublang.ai/account/orgs
sign-in expired at Spex Space — spex login
spex.lock is from a newer Spex — update Spex
```

An interrupted install leaves the last installed files and `spex.lock`
in place. An interrupted publish cannot take back an upload the registry
already accepted.

## Limits

- The CLI acts on a project folder's packages. Your Personal packages,
  available in every project of yours, are managed in the app.
- No command adds a Git source. A `git` package you write in `spex.yaml`
  by hand is installed as written. The Space `spex.yaml` names, else your
  default Space, lends its Git access to the repositories it holds while
  you are signed in there; other repositories use this computer's Git
  access. A registry sign-in gives no Git access.
- The built-in playbooks, `sublang/playbooks`, come with the Spex app.
  `spex install` installs them from the copy the app keeps in the same
  home, where there is one, or from the registry, else leaves them to
  the app.

## Scaffolding specs

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
  agents to read relevant specs, settle conflicts in them first, and keep
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
| `spex package add <org>/<pkg> --version <requirement>` | `spex add <org>/<pkg>@<version>` |
| `spex package add <org>/<pkg> --path <folder>` | `spex add <org>/<pkg> --path <folder>` |
| `spex package install` | `spex install` |
| `spex package resolve` | `spex update` |
| `spex package remove <org>/<pkg>` | `spex remove <org>/<pkg>` |
| `spex package search <query>` | `spex search <query>` |
| `spex package status` | `spex list` |
| `spex package publish <folder> [--dry-run]` | `spex publish <org>/<pkg> [--dry-run]` |
| `spex auth login --instance <origin>` | `spex login --space <url>` |
| `spex auth status` | `spex whoami --space <url>` |
| none | `spex logout` |
| `spex project add <folder>`, `spex project list` | none: no project needs adding |
| `--server`, `SPEX_SERVER_URL`, `--project`, `--timeout` | none: no app is needed |

The package commands now run inside the CLI on the folder's own files,
and the Spex app runs the same code. `spex.yaml` and `spex.lock` stand
at the top of the project folder, with the installed files under
`.spex/`; the two files an earlier app kept in a project's records move
into its project folder at the app's next start.

- A `spex.yaml` without `registry` keeps the package source it had, a
  Space or the default, until you add `registry` yourself. Before you
  add it, check where its packages came from, above all before you
  publish a private package: nothing moves a private package or a
  publish to another registry for you. Publishing from such a
  `spex.yaml` needs a registry sign-in at that same address.
- `spex.lock` keeps each package's registry, version and checksum as
  recorded. An install downloads only from the registry it records,
  never from another Space you signed in to.
- A sign-in an earlier release saved stays a Space sign-in and never
  counts at a registry: run `spex login --registry <url>` once for
  private packages and publishing.

A folder `spex package init` made at `spex-packages/<name>/` still
publishes by name while `spex.yaml` adds it from that path. Exit code
`2` is gone. Deep imports such as `@sublang/spex/dist/cli.js` are no
longer importable; the `exports` of `package.json` name its modules.

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
