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

Where the `scaffold` subcommand is invoked with `--update` inside a
git repository while the `specs/` working tree is clean, the CLI
shall overwrite scaffold-provided files with the bundled templates,
leave files outside the scaffold's path set unmodified, and print a
copy-paste-ready LLM merge prompt as the user's next action.

Example merge prompt:

```text
I just ran `spex scaffold --update` in this repo. My working tree
now has the new spex framework templates in `specs/`; my prior
customized versions are in HEAD.

Merge them: keep my project content from HEAD (my DRs, IRs, items,
map.md entries, any sections I added) while adopting the new
framework content from the working tree (meta.md rules, scaffolded
examples, conventions). For files in both, update my citations to
follow renamed sections or renumbered IDs.

Write the merged result to the working tree. Stop and ask if
framework intent is ambiguous; don't guess.
```

### SCAF-12

Where the `scaffold` subcommand is invoked with `--update` outside a
git repository, or while the `specs/` working tree has uncommitted
changes, the CLI shall exit non-zero with an error stating that
`--update` requires a clean `specs/` tree under git so overwritten
files remain recoverable.

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
