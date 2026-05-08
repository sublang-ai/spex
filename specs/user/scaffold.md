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
   only when the user has not customized it — that is, when the
   working-tree content matches a previously distributed bundled
   version of that file. Customized seeds shall be left
   unmodified and reported as `(kept — user-modified)`.
4. Leave any file outside the framework, seed, and legacy item
   migration sets unmodified.
5. Print per-file indicators, a clear completion message, and a
   copy-paste-ready LLM merge prompt.

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
