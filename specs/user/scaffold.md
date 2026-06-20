<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# SCAF: User-Facing Scaffold Behavior

## Intent

This spec defines user-visible behavior of the `scaffold`
subcommand.

## Target Resolution

### SCAF-1

Where the `scaffold` subcommand is invoked with a `<path>` argument,
the CLI shall create the specs directory structure inside the
specified path. The path must exist and be a directory; otherwise the
CLI shall exit non-zero.

### SCAF-2

Where the `scaffold` subcommand is invoked without a path argument inside a
git repository, the CLI shall create the specs directory structure
at the repository root.

### SCAF-3

Where the `scaffold` subcommand is invoked without a path argument outside
any git repository, the CLI shall create the specs directory
structure in the current working directory.

## Idempotency

### SCAF-4

Where the `scaffold` subcommand is invoked and target directories or
template files already exist, the CLI shall skip those entries with
an `(already exists)` indicator, leaving existing content
unmodified.

## Update

### SCAF-11

Where the `scaffold` subcommand is invoked with `--update` and no
`<path>` argument from within a git repository, while the `specs/`
working tree is clean, the CLI shall:

1. Migrate files from the legacy `specs/items/user/`,
   `specs/items/dev/`, and `specs/items/test/` layout to the
   corresponding flat `specs/user/`, `specs/dev/`, and `specs/test/`
   paths without overwriting existing flat paths.
2. Write every **framework file** from the bundled template,
   creating framework files that are missing in older specs trees.
3. For every **seed file**, refresh it with the bundled template
   when the user has not customized it — that is, when the
   working-tree content matches a previously distributed bundled
   version of that file, or when the seed is absent. Customized
   seeds shall be left unmodified and reported as
   `(kept — user-modified)`. Absent seeds shall be reported as
   `(created)`. Users who do not want a refreshed or newly created
   seed shall remove it after `--update`.
4. Leave any file outside the framework, seed, and legacy item
   migration sets unmodified.
5. Print per-file indicators, a clear completion message, and a
   copy-paste-ready LLM merge prompt. Per-file indicators shall be
   the only path-level summary printed for the run; no path summary
   shall follow the merge prompt.
   When a legacy item migration target is also a seed path, the
   migration and seed refresh status shall be reported in one
   indicator line for that target.
   Migration of seed paths shall be reported inline with seed state;
   migration of non-seed paths and conflicts shall be reported before
   framework and seed indicators.

### SCAF-12

Where the `scaffold` subcommand is invoked with `--update` while
any precondition of [SCAF-11](#scaf-11) does not hold (no `<path>`
argument, cwd inside a git repository, `specs/` working tree
clean), the CLI shall exit non-zero with an error explaining the
failed precondition so that overwritten files remain recoverable.

### SCAF-19

Where files bundled under `scaffold/specs/` are concerned, each
file shall be classified as either **framework** or **seed**:

- **Framework** — spex-authoritative content that users do not
  author. Refreshed unconditionally on `--update`.
  - `specs/meta.md`
  - `specs/decisions/000-spec-structure-format.md`
- **Seed** — starter content that users are expected to edit,
  extend, or replace. Written once on initial `scaffold` and only
  refreshed by `--update` when the user has not customized it.
  - `specs/map.md`
  - `specs/iterations/000-spdx-headers.md`
  - `specs/dev/git.md`
  - `specs/dev/licensing.md`
  - `specs/test/licensing.md`
  - `specs/user/.gitkeep`

When a new file is added under `scaffold/specs/`, it shall be
assigned to exactly one of these classes.

Bundled support assets outside `scaffold/specs/` (for example,
`scaffold/update-merge-prompt.md`) are not framework or seed files.

Localized overlay files under `scaffold/i18n/<lang>/` shall inherit
the class of the target path they replace.

## Language Selection

### SCAF-28

Where the `scaffold` subcommand is invoked without `--update`,
when `--lang <code>` is provided, the CLI shall generate localized
bundled specs for that language.

Supported language codes shall be `en` and `zh`.
The `zh` code shall mean Simplified Chinese.
When `--lang` is omitted and no existing `specs/meta.md` declares an
authoring language, the CLI shall use `en`.
When an unsupported language code is provided, the CLI shall exit
non-zero and list the supported language codes.

### SCAF-29

Where the `scaffold` subcommand is invoked without `--update` while
`specs/meta.md` exists, the CLI shall treat the existing
authoring-language declaration as active, or `en` when no declaration
is present.

When an explicit `--lang` does not match the active language, the CLI
shall exit non-zero without changing the existing scaffold.

### SCAF-30

Where the `scaffold` subcommand is invoked with `--update`, the CLI
shall reject `--lang` and exit non-zero.

The update language shall be read from the existing `specs/meta.md`
authoring-language declaration, or `en` when no declaration is present.

## Agent Instructions

### SCAF-5

Where the `scaffold` subcommand is invoked, the CLI shall update agent spec
instructions in `CLAUDE.md` and `AGENTS.md`. When neither file
exists, the CLI shall create both; when only one exists, only that
file shall be updated. When a file contains a matching specs
section heading, the CLI shall replace that section in place; when
the replacement is identical, the CLI shall skip the file.

## Error Handling

### SCAF-6

Where the `scaffold` subcommand encounters an unrecoverable error, the CLI
shall print an error message to stderr and exit non-zero.
