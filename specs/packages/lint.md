<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# LINT: Spec Linter

## Intent

This spec defines the `lint` subcommand — the checker that keeps a
specs tree structurally sound after scaffolding, migration, and hand
editing — covering its user-visible behavior, rule engine
requirements, and integration coverage.

## External Behavior

### Invocation

#### LINT-1

Where the `lint` subcommand is invoked with a `<path>` argument, the
CLI shall lint the specs tree inside that path; the path must exist
and be a directory, otherwise the CLI shall exit non-zero with an
error on stderr.

Where it is invoked without a path argument, the CLI shall resolve
the target like the `scaffold` subcommand: the enclosing git
repository root, or the current working directory outside any
repository ([SCAF-2](scaffold.md#scaf-2), [SCAF-3](scaffold.md#scaf-3)).

#### LINT-2

While the resolved target has no `specs/` directory, the `lint`
subcommand shall report a single error finding and exit non-zero.

#### LINT-3

When linting completes, the CLI shall print one line per finding in
the form `<path>:<line>: <severity> <rule>: <message>`, sorted by
path then line, followed by a summary counting errors and warnings —
or a no-problems line when the tree is clean.

The CLI shall exit non-zero when at least one error-severity finding
exists, and zero otherwise; warnings alone shall not fail the run.

### Rules

#### LINT-4

Where the specs tree is linted, structural rules shall report:

- an error for each legacy item directory (`specs/user/`,
  `specs/dev/`, `specs/test/`, `specs/items/`), pointing at
  `spex scaffold --update`;
- an error when `specs/meta.md` or `specs/map.md` is missing;
- a warning for any other unexpected top-level entry under `specs/`;
- an error for a `packages/` or `interactions/` file or directory
  segment that is not kebab-case, and for a `decisions/` or
  `iterations/` file not named `<NNN>-<kebab-case>.md`.

#### LINT-5

Where a file under `specs/packages/` is linted, it shall satisfy
[META-28](../meta.md#meta-28): an error shall be reported for a
missing or malformed `# <SHORTFORM>: <Title>` heading, a missing
`## Intent`, the absence of both behavior sections, an unexpected or
duplicate `##` section, or sections out of canonical order.
The localized section names of the bundled templates shall be
accepted.
`specs/meta.md` and `specs/map.md` are exempt from these
package-file rules.

Where a file under `specs/interactions/` is linted, an error shall
be reported for a missing H1 short form or `## Intent`; other
sections are free-form ([META-31](../meta.md#meta-31)).
A warning shall be reported when an interactions file name is a
composition of existing package names or short forms.

#### LINT-6

Where item-ID headings (`<PACK>-<N>`) are linted across
`specs/packages/`, `specs/interactions/`, and `specs/meta.md`,
errors shall be reported for an item whose prefix differs from its
file's short form, an item ID defined more than once across
`specs/`, and a short form used by more than one file
([META-10](../meta.md#meta-10), [META-11](../meta.md#meta-11)).
A warning shall be reported for an item sitting inside an Intent or
References section.

#### LINT-7

Where `Verifies:` lines are linted ([META-20](../meta.md#meta-20)):

- an item under a package's `## Verification` section without a
  `Verifies:` line immediately below its heading shall be an error;
- a `Verifies:` line on a package item outside Verification shall be
  a warning;
- a package Verification item whose `Verifies:` cites another
  package's file shall be a warning pointing at
  `specs/interactions/`;
- an interactions test item whose `Verifies:` cites exactly one
  package file shall be a warning suggesting that package's
  Verification section.

#### LINT-8

Where citations are linted, an error shall be reported for a
relative link whose target file does not exist, a link into the
legacy layout, and a fragment that matches no heading anchor of the
target file (GitHub anchor semantics).
Scheme, protocol-relative, and absolute URLs shall not be checked.

A warning shall be reported for duplicate heading anchors within one
file; item IDs ending in `-<N>` shall not be misdetected as
duplicates of their base heading.

#### LINT-9

Where reference markers are linted ([META-19](../meta.md#meta-19)),
a `[[N]]` marker without a matching numbered definition shall be an
error, and a numbered definition that is never cited shall be a
warning.

Where records are linted, a DR missing a section of
[META-4](../meta.md#meta-4) or an IR missing a section of
[META-5](../meta.md#meta-5) shall be a warning.

Where the map is linted, a `packages/` or `interactions/` file not
linked from `specs/map.md` shall be a warning.

## Internal Behavior

### Rule Engine

#### LINT-10

Where `lintSpecs(basePath)` is called, it shall parse every markdown
file under `specs/` once with the same GFM-capable parser the
migration uses, derive heading anchors with GitHub slug semantics,
and return the finding list; printing and exit codes belong to the
CLI layer.
`Verifies:` detection shall anchor to the first non-blank line below
an item heading, never to a file-wide text search.

## Verification

### Lint Coverage

#### LINT-11

Verifies: [LINT-3](#lint-3), [LINT-4](#lint-4), [LINT-5](#lint-5), [LINT-6](#lint-6), [LINT-7](#lint-7), [LINT-8](#lint-8), [LINT-9](#lint-9)

Where the linter is exercised, the test suite shall cover at least
one fixture per rule family — structure, naming, package sections
(including localized zh section names), interaction sections and
name composition, item IDs, Verifies lines (missing, outside,
cross-package, single-package interaction), citations (broken link,
broken anchor, legacy path), reference markers, records, map
listing, and duplicate anchors — asserting rule IDs and severities,
plus a clean fixture asserting zero findings.

#### LINT-12

Verifies: [LINT-1](#lint-1), [LINT-2](#lint-2), [LINT-3](#lint-3)

Where the real CLI is exercised, the test suite shall assert that a
failing tree exits non-zero with `<path>:<line>` findings and a
summary, that a clean freshly scaffolded tree exits zero with the
no-problems line, and that a missing specs tree exits non-zero.
