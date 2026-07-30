<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# lint: Spec Linter

## Intent

This spec defines the `lint` subcommand — the checker that keeps a specs tree structurally sound after scaffolding, migration, and hand editing — covering its user-visible behavior, rule engine requirements, and integration coverage.

## External Behavior

### Invocation

#### lint-1

When the `lint` subcommand is invoked, the CLI shall resolve the lint target and lint the specs tree inside it:

- with a `<path>` argument, the target is that path, which must exist and be a directory — otherwise the CLI exits non-zero with an error on stderr;
- without a path argument, the target is the enclosing git repository root, or the current working directory outside any repository.

#### lint-2

While the resolved target has no `specs/` directory, the `lint` subcommand shall report a single error finding and exit non-zero.

#### lint-3

When linting completes, the CLI shall print one line per finding in the form `<path>:<line>: <severity> <rule>: <message>`, sorted by path then line, followed by a summary counting errors and warnings — or a no-problems line when the tree is clean — and exit non-zero exactly when at least one error-severity finding exists.

- Printed paths use forward-slash separators on every platform.
- A base path equal to the working directory prints bare tree-relative paths however either is spelled.
- Warnings alone never fail the run.

### Rules

#### lint-4

Where the specs tree is linted, structural rules shall report:

- an error for each legacy directory (`specs/user/`, `specs/dev/`, `specs/test/`, `specs/items/`, `specs/interactions/`, `specs/compositions/`), pointing at `spex scaffold --update`;
- an error when `specs/meta.md` or `specs/map.md` is missing;
- a warning for any other unexpected top-level entry under `specs/` [[meta-1](../meta.md#meta-1)];
- a warning when a legacy `specs/iterations/` directory coexists with `specs/intents/` ([DR-017](../decisions/017-intent-records.md));
- an error for a `packages/` file or directory segment that is not kebab-case, and for a `decisions/`, `intents/`, or legacy `iterations/` file not named `<NNN>-<kebab-case>.md` [[meta-1](../meta.md#meta-1)];
- an error when two record files of one kind carry the same leading number — `decisions/` for DRs, `intents/` together with legacy `iterations/` for IRs — since the leading number is the record ID [[meta-39](../meta.md#meta-39)].

#### lint-5

Where a file under `specs/packages/` is linted, the linter shall report each breach of the package layout of [[meta-30](../meta.md#meta-30)]:

- an error for a missing or malformed `# <pack>: <Title>` heading, or an H1 whose `<pack>` is not the file's basename [[meta-10](../meta.md#meta-10)];
- an error for a missing `## Intent` or `## External Behavior`;
- an error for an unexpected or duplicate `##` section, or sections out of the order Intent, External Behavior, Internal Behavior, Verification, References;
- a warning for a missing `## Verification` — verification is required unless irrelevant [[meta-38](../meta.md#meta-38)].

The localized section names of the bundled templates are accepted.
`specs/meta.md` and `specs/map.md` are exempt from these package-file rules.

#### lint-6

Where item-ID headings are linted across `specs/packages/` and `specs/meta.md`, the linter shall report:

- an error for an item heading not of the lowercase `<pack>-<N>` form [[meta-11](../meta.md#meta-11)];
- an error for an item whose prefix differs from its file's basename [[meta-11](../meta.md#meta-11)];
- an error for an item ID defined more than once across `specs/`, and for a package basename used by more than one file [[meta-10](../meta.md#meta-10)];
- a warning for an item sitting inside an `Intent` or `References` section of a package file [[meta-30](../meta.md#meta-30)].

#### lint-7

Where item relationships are linted, the citations in an item's statement shall be the single relationship source [[meta-14](../meta.md#meta-14)]:

- a relationship-metadata line (`Verifies:`, `Binds:`, `Composes:`, `Clients:`, `Suppliers:`, `Scope:`, `Requires:`, or `Uses:` at the start of a line inside an item) shall be an error;
- a `## Verification` item citing no same-file behavior item anchor shall be an error [[meta-20](../meta.md#meta-20)];
- a behavior item citation resolving to a peer package item outside that peer's `## External Behavior` section shall be an error [[meta-14](../meta.md#meta-14)].

#### lint-8

Where citations are linted, the linter shall report:

- an error for a relative link whose target file does not exist, a link into the legacy layout (including `specs/compositions/`), and a fragment that matches no heading anchor of the target file (GitHub anchor semantics);
- an error for a link into `specs/intents/` — or the legacy `specs/iterations/` — from any file but `specs/map.md` [[meta-18](../meta.md#meta-18)]; a textual `IR-<n>` reference outside `specs/map.md` is likewise an error — naming an IR is citing it — where an intent record is exempt only for its own ID;
- an error for an item citation not written as an enclosed inline link — the relative link wrapped in an outer bracket pair, e.g. `[[<pack>-<N>](<path>#<pack>-<N>)]` — or whose link text is not the target item ID [[meta-16](../meta.md#meta-16)] [[meta-11](../meta.md#meta-11)];
- an error for a reference-style link in a `packages/` file unless it is a literal `[[N]]` reference marker — a numeric shortcut reference wrapped in the outer brackets [[meta-19](../meta.md#meta-19)]; a bare `[N]`, a collapsed `[N][]`, and a full-form reference are errors even with numeric labels, since item citations are inline links [[meta-16](../meta.md#meta-16)];
- a warning for duplicate heading anchors within one file — item IDs ending in `-<N>` are not misdetected as duplicates of their base heading.

Scheme, protocol-relative, and absolute URLs are not checked.

#### lint-9

Where reference markers, records, and the map are linted, the linter shall report:

- an error for a `[[N]]` marker without a matching numbered definition, and a warning for a numbered definition that is never cited [[meta-19](../meta.md#meta-19)];
- an error for a numbered definition sitting outside `## References` or targeting a spec file — the marker mechanism cannot smuggle an item citation [[meta-19](../meta.md#meta-19)];
- a warning for a DR missing a section of [[meta-4](../meta.md#meta-4)] or an IR missing a section of [[meta-5](../meta.md#meta-5)];
- a warning for a `packages/` file not linked from `specs/map.md`.

#### lint-14

Where an item is linted, prose outside fenced blocks, lists, tables, blockquotes, and headings carrying more than one sentence shall be an advisory warning to review the item for a second governing statement [[meta-29](../meta.md#meta-29)].

- An ASCII terminator counts only before whitespace or line end, the fullwidth `。`/`！`/`？` count anywhere, and `e.g.`/`i.e.` never end a sentence.
- Sentence count neither defines nor decides conformance: an item stating one contract's cases and outcomes may run to several sentences and still conform, while a second contract can hide inside one.
- The rule stays a warning.

#### lint-13

Where citation discipline is linted, the linter shall report:

- an error for an item body line that is a detached relationship sentence — `Verifies` followed by citations and separators only — pointing at weaving each citation into the assertion it supports [[meta-41](../meta.md#meta-41)], so a mechanically migrated tree cannot pass the gate unreconciled;
- an error for a citation link or reference marker inside a package file's `## Intent` section — a package reads standalone [[meta-15](../meta.md#meta-15)];
- an error for a `## Verification` item citation resolving to a peer package anchor outside that peer's `## External Behavior` and `## Internal Behavior` items — a test item may cite Internal Behavior its assertion materially needs [[meta-20](../meta.md#meta-20)], while behavior items are held to External Behavior alone [[lint-7](#lint-7)];
- an error for a link in a package file resolving to a peer package file from section prose outside every item body — item statements are the single relationship source [[meta-14](../meta.md#meta-14)], so free prose declares no dependency.

## Internal Behavior

### Rule Engine

#### lint-10

Where `lintSpecs(basePath)` is called, it shall parse every markdown file under `specs/` once with the same GFM-capable parser the migration uses, derive heading anchors with GitHub slug semantics, and return the finding list — printing and exit codes belong to the CLI layer.

- Structure lives on root-level headings only: the H1, the `##` sections, and item headings count when they are direct children of the document, so a heading nested in a blockquote or list is content that neither satisfies nor disturbs structure — while anchors still cover every heading per GitHub semantics.
- An item's body spans from its heading to the next root-level heading of the same or shallower depth.
- Relationship-metadata lines and sentence terminators are detected outside code blocks only, using the parsed tree's code spans — GFM fences of any delimiter length and indented code — so a literal fence inside a longer fence cannot leak lines into detection.
- Citation links, reference markers, and detached relationship sentences are matched over the parsed inline text — excluding inline code — so markup can neither hide a violation nor fake a citation.

## Verification

### Lint Coverage

#### lint-11

Where the linter is exercised, the test suite shall cover at least one fixture per rule family, asserting rule IDs and severities:

- structure and naming, including a legacy `specs/compositions/` directory and duplicate record numbers ([[lint-4](#lint-4)]);
- package sections with localized zh names, an H1 whose identifier is not the basename, and the missing-Verification warning ([[lint-5](#lint-5)]);
- item IDs — an uppercase heading, a mismatched prefix, a duplicate ID, a duplicate basename — and misplaced items ([[lint-6](#lint-6)]);
- relationship metadata, an uncited Verification item, and a behavior citation into a peer's Internal Behavior ([[lint-7](#lint-7)]);
- citations — broken link, broken anchor, legacy path, an unenclosed or mislabeled item citation, and intent-record references outside the map, linked and textual ([[lint-8](#lint-8)]);
- reference markers, records, and map listing ([[lint-9](#lint-9)]);
- citation discipline — an Intent citation, a section-prose peer citation, a detached `Verifies` sentence, and a Verification citation of peer Internal Behavior yielding no finding ([[lint-13](#lint-13)]);
- the multi-sentence advisory ([[lint-14](#lint-14)]);
- an item body spanning a nested subheading whose citations count for the item, a blockquote-wrapped package failing structure, and a literal triple-backtick line inside a longer fence staying undetected ([[lint-10](#lint-10)]);
- finding format and summary ([[lint-3](#lint-3)]);
- plus a clean fixture asserting zero findings.

#### lint-12

Where the real CLI is exercised, the test suite shall assert that a failing tree exits non-zero with `<path>:<line>` findings and a summary [[lint-3](#lint-3)], that a clean freshly scaffolded tree exits zero with the no-problems line [[lint-1](#lint-1)], and that a missing specs tree exits non-zero [[lint-2](#lint-2)].
