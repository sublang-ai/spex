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
the target to the enclosing git repository root, or to the current
working directory outside any repository.

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

- an error for each legacy directory (`specs/user/`, `specs/dev/`,
  `specs/test/`, `specs/items/`, `specs/interactions/`), pointing at
  `spex scaffold --update`;
- an error when `specs/meta.md` or `specs/map.md` is missing;
- a warning for any other unexpected top-level entry under `specs/`;
- an error for a `packages/` or `compositions/` file or directory
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

Where a file under `specs/compositions/` is linted, it shall satisfy
[META-34](../meta.md#meta-34): an error shall be reported for a
missing H1 short form, a missing `## Intent` or `## Tests`, the
absence of both `## Binding` and `## Scenario`, an unexpected or
duplicate `##` section, or sections out of the order Intent,
Binding, Scenario, Tests, References.
The localized section names of the bundled templates shall be
accepted here too.
A warning shall be reported when a compositions file name is a
composition of existing package names or short forms.

#### LINT-6

Where item-ID headings (`<PACK>-<N>`) are linted across
`specs/packages/`, `specs/compositions/`, and `specs/meta.md`,
errors shall be reported for an item whose prefix differs from its
file's short form, an item ID defined more than once across
`specs/`, and a short form used by more than one file
([META-10](../meta.md#meta-10), [META-11](../meta.md#meta-11)).
A warning shall be reported for an item sitting inside an Intent or
References section of a package or compositions file.

#### LINT-7

Where item relationships are linted, the citations in an item's
clauses are the single source ([META-20](../meta.md#meta-20)):

- a relationship-metadata line (`Verifies:`, `Binds:`, `Composes:`,
  `Clients:`, `Suppliers:`, `Scope:`, `Requires:`, or `Uses:` at the
  start of a line inside an item) shall be an error;
- a package `## Verification` item citing no same-file item anchor
  shall be an error;
- a composition `## Tests` item citing no same-file Binding or
  Scenario item anchor shall be an error;
- a Binding or Scenario item cited by no same-file Tests item shall
  be an error ([META-21](../meta.md#meta-21));
- in a file holding both Binding and Scenario items, a Binding item
  cited by no same-file Scenario item shall be an error pointing at
  a bindings-only file ([META-34](../meta.md#meta-34));
- a package Verification item citing another package's file shall be
  a warning pointing at `specs/compositions/`;
- a Tests item that cites a same-file Scenario item while citing
  items in fewer than two distinct package files shall be an error
  ([META-21](../meta.md#meta-21)); a file link without an item
  anchor counts toward no package.

Where a `## Binding` item is linted, a `When` or `While` clause
keyword in its text shall be an error: a binding is static
([META-36](../meta.md#meta-36)).
The zh trigger keywords of the bundled templates — `当` and `如果`
at a clause start — shall be detected likewise.

#### LINT-8

Where citations are linted, an error shall be reported for a
relative link whose target file does not exist, a link into the
legacy layout, and a fragment that matches no heading anchor of the
target file (GitHub anchor semantics).
An error shall also be reported for a link from a `packages/` file
into `specs/compositions/` ([META-33](../meta.md#meta-33)), and for
a link into `specs/iterations/` from any file but `specs/map.md`
([META-18](../meta.md#meta-18)); a textual `IR-<n>` reference
outside `specs/map.md` is likewise an error — naming an IR is
citing it — where an iteration record is exempt only for its own
ID.
A reference-style link with a non-numeric identifier in a
`packages/` or `compositions/` file shall be an error: item
citations are inline links ([META-16](../meta.md#meta-16)), and
numbered markers stay reserved for `## References`
([META-19](../meta.md#meta-19)).
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

Where the map is linted, a `packages/` or `compositions/` file not
linked from `specs/map.md` shall be a warning.

#### LINT-13

Where citation discipline is linted:

- an item body line that is a detached relationship sentence —
  `Verifies` followed by citations and separators only — shall be
  an error pointing at weaving each citation into the assertion it
  supports ([META-20](../meta.md#meta-20)), so a mechanically
  migrated tree cannot pass the gate unreconciled;
- a citation link inside a package file's `## Intent` section shall
  be an error ([META-15](../meta.md#meta-15));
- a link in a package file resolving to a peer package item outside
  that peer's `## External Behavior` section shall be an error — a
  peer may rely only on External Behavior
  ([META-14](../meta.md#meta-14), [META-28](../meta.md#meta-28));
- in a package behavior item, a peer citation is legal only when
  it belongs to a precondition or trigger clause and resolves to a
  peer item: its nearest preceding clause keyword — `Where`,
  `While`, `When` (给定, 如果, clause-start 当), with a list
  attached to its lead-in when that lead-in ends in a colon — is a
  precondition keyword with no `shall` (应) after it, a clause
  boundary (a separator not introducing a further citation) stands
  between the citation and any following `shall`, and its anchor
  is an item of the peer file; every other peer citation shall be
  an error ([META-13](../meta.md#meta-13),
  [META-14](../meta.md#meta-14)).

## Internal Behavior

### Rule Engine

#### LINT-10

Where `lintSpecs(basePath)` is called, it shall parse every markdown
file under `specs/` once with the same GFM-capable parser the
migration uses, derive heading anchors with GitHub slug semantics,
and return the finding list; printing and exit codes belong to the
CLI layer.
An item's body shall span from its heading to the next heading of
the same or shallower depth, and relationship-metadata and clause
keywords shall be detected outside code blocks only, using the
parsed tree's code spans — GFM fences of any delimiter length and
indented code — so a literal fence inside a longer fence cannot
leak lines into detection.
Binding trigger keywords shall be matched over the parsed inline
text, so list markers, blockquotes, and emphasis cannot hide a
trigger and inline code cannot fake one.

## Verification

### Lint Coverage

#### LINT-11

Where the linter is exercised, the test suite shall cover at least
one fixture per rule family, asserting rule IDs and severities:
structure and naming ([LINT-4](#lint-4)); package sections with
localized zh names, composition sections in both languages, and
name composition ([LINT-5](#lint-5)); item IDs and misplaced items
([LINT-6](#lint-6)); relationship metadata, uncited Verification
and Tests items, uncovered Binding and Scenario items, a Binding
uncited by any same-file Scenario in a mixed file, cross-package
Verification, the scenario two-package floor with an anchor-less
file link not counting, and a triggered Binding in each language
including a list-wrapped zh trigger ([LINT-7](#lint-7));
citations — broken link, broken anchor, legacy path, a package
link into `specs/compositions/`, and iteration references outside
the map, linked and textual ([LINT-8](#lint-8)); reference
markers, records, and map listing ([LINT-9](#lint-9)); citation
discipline — an Intent citation, a peer citation outside External
Behavior, out-of-clause peer citations in both languages beside
accepted precondition forms, and a detached `Verifies` sentence
([LINT-13](#lint-13));
an item body spanning a nested subheading whose citations count
for the item, and a literal triple-backtick line inside a longer
fence staying undetected ([LINT-10](#lint-10)); finding format
and summary ([LINT-3](#lint-3)); plus a clean fixture asserting
zero findings.

#### LINT-12

Where the real CLI is exercised, the test suite shall assert that a
failing tree exits non-zero with `<path>:<line>` findings and a
summary ([LINT-3](#lint-3)), that a clean freshly scaffolded tree
exits zero with the no-problems line ([LINT-1](#lint-1)), and that
a missing specs tree exits non-zero ([LINT-2](#lint-2)).
