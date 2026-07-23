<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# SCAF: Scaffold

## Intent

This spec defines the `scaffold` subcommand: its user-visible
behavior, the implementation requirements behind it, and the
integration coverage it needs — particularly for `--update` paths
whose outcome depends on combinations of working-tree state,
manifest history, and bundled content.

## External Behavior

### Target Resolution

#### SCAF-1

Where the `scaffold` subcommand is invoked with a `<path>` argument,
the CLI shall create the specs directory structure inside the
specified path. The path must exist and be a directory; otherwise the
CLI shall exit non-zero.

#### SCAF-2

Where the `scaffold` subcommand is invoked without a path argument inside a
git repository, the CLI shall create the specs directory structure
at the repository root.

#### SCAF-3

Where the `scaffold` subcommand is invoked without a path argument outside
any git repository, the CLI shall create the specs directory
structure in the current working directory.

### Idempotency

#### SCAF-4

Where the `scaffold` subcommand is invoked and target directories or
template files already exist, the CLI shall skip those entries with
an `(already exists)` indicator, leaving existing content
unmodified.

### License

#### SCAF-36

Where the `scaffold` subcommand is invoked without `--update`, when no
`LICENSE` file exists at the target root, the CLI shall write a
top-level `LICENSE` file whose content is the verbatim Apache License
2.0 text and report it with its path.

While a `LICENSE` file already exists at the target root, the CLI shall
leave it unmodified and report it with an `(already exists)` indicator,
so an existing downstream license is never overwritten.

The CLI shall not write a `NOTICE` file, per-file license headers, or a
README license section, since the downstream project is unknown.

### Update

#### SCAF-11

Where the `scaffold` subcommand is invoked with `--update` and no
`<path>` argument from within a git repository, while the `specs/`
working tree is clean, the CLI shall:

1. Migrate files from the legacy `specs/items/user/`,
   `specs/items/dev/`, and `specs/items/test/` layout to the
   corresponding flat `specs/user/`, `specs/dev/`, and `specs/test/`
   paths without overwriting existing flat paths.
2. Migrate the legacy flat `specs/user/`, `specs/dev/`, and
   `specs/test/` layout into `specs/packages/` per
   [SCAF-39](#scaf-39), rewrite legacy citations per
   [SCAF-40](#scaf-40), and restructure a customized `specs/map.md`
   per [SCAF-41](#scaf-41).
3. Write every **framework file** from the bundled template,
   creating framework files that are missing in older specs trees.
   When the framework file being replaced holds content that matches no
   recognized bundled version — a genuine user modification rather than
   an older pristine version — the CLI shall still replace it, report
   it with an `(overwritten — user-modified)` indicator, and warn
   clearly before completing, naming the file and pointing the user to
   where the change can be reviewed and reconciled. Unmodified and
   older-pristine framework files shall be replaced without this
   warning or indicator.
4. For every **seed file**, refresh it with the bundled template
   when the user has not customized it — that is, when the
   working-tree content matches a previously distributed bundled
   version of that file, or when the seed is absent. Customized
   seeds shall be left unmodified and reported as
   `(kept — user-modified)`. Absent seeds shall be reported as
   `(created)`, except a `.gitkeep` seed whose directory already
   holds other entries, which shall not be recreated. Users who do
   not want a refreshed or newly created seed shall remove it after
   `--update`.
5. Refresh the managed agent-instruction section of existing
   `CLAUDE.md`/`AGENTS.md` files per [SCAF-5](#scaf-5) without
   creating absent ones.
6. Leave any file outside the framework, seed, migration, and
   citation-rewrite sets unmodified.
7. Print per-file indicators, a clear completion message that
   points to `spex lint`, a copy-paste-ready LLM merge prompt, and —
   under the conditions of [SCAF-42](#scaf-42) — a compositions
   prompt after it. Per-file indicators shall be the only path-level
   summary printed to stdout for the run, with exactly one indicator
   line per path; no path summary shall follow the prompts. The
   stderr diagnostics of step 3 and [SCAF-39](#scaf-39) are not
   stdout path-level summaries and are exempt from this rule.
   Migration of seed-path targets shall be reported inline with seed
   state in one combined indicator line; other migrations, conflicts,
   and citation rewrites shall be reported before framework and seed
   indicators.

#### SCAF-12

Where the `scaffold` subcommand is invoked with `--update` while
any precondition of [SCAF-11](#scaf-11) does not hold (no `<path>`
argument, cwd inside a git repository, `specs/` working tree
clean), the CLI shall exit non-zero with an error explaining the
failed precondition so that overwritten files remain recoverable.

#### SCAF-19

Where files bundled under `scaffold/specs/` are concerned, each
file shall be classified as either **framework** or **seed**:

- **Framework** — spex-authoritative content that users do not
  author. Refreshed unconditionally on `--update`; when a refresh
  replaces content that matches no recognized bundled version,
  `--update` warns before completing (see [SCAF-11](#scaf-11)).
  - `specs/meta.md`
  - `specs/decisions/000-spec-structure-format.md`
- **Seed** — starter content that users are expected to edit,
  extend, or replace. Written once on initial `scaffold` and only
  refreshed by `--update` when the user has not customized it.
  - `specs/map.md`
  - `specs/iterations/000-spdx-headers.md`
  - `specs/packages/git.md`
  - `specs/packages/licensing.md`
  - `specs/compositions/.gitkeep`

When a new file is added under `scaffold/specs/`, it shall be
assigned to exactly one of these classes.

Bundled support assets outside `scaffold/specs/` (for example,
`scaffold/update-merge-prompt.md`, `scaffold/compositions-prompt.md`,
the file-history manifests, and `scaffold/LICENSE`) are not framework
or seed files.
The bundled root `scaffold/LICENSE` is emitted to the target root by
[SCAF-36](#scaf-36) on initial scaffold rather than refreshed by
`--update`, and it is not localized.

Localized overlay files under `scaffold/i18n/<lang>/` shall inherit
the class of the target path they replace.

#### SCAF-39

Where the `scaffold` subcommand is invoked with `--update` while any
of `specs/user/`, `specs/dev/`, or `specs/test/` exists, the CLI
shall migrate that legacy layout into `specs/packages/`:

- Item files sharing a relative path under the legacy group
  directories form one package. Each package shall be written to
  `specs/packages/<path>.md` and its source files deleted only after
  the target is written.
- When every present source matches a recognized legacy bundled
  version, the target shall be the current bundled package seed and
  the combined indicator of [SCAF-11](#scaf-11) shall name the
  sources (e.g. `migrated from specs/dev/licensing.md,
  specs/test/licensing.md`).
- Otherwise the sources shall be merged per [SCAF-44](#scaf-44) and
  reported as `(migrated from <sources>)`.
- When the target already exists, every source shall be kept
  unmodified and reported as
  `(kept — target exists at <target>)`; a source that arrived via
  the same run's item-layout migration reports both steps in that
  one line (`migrated from <items path>; kept — …`).
- Non-markdown files under the legacy directories shall move to the
  same relative path under `specs/packages/`, except a `.gitkeep`
  matching a recognized bundled version, which shall be deleted.
- Emptied legacy directories shall be removed.
- When merging creates duplicate heading anchors inside one target
  file, the CLI shall print a stderr note naming each file and
  anchor.

#### SCAF-40

Where `--update` runs, the CLI shall rewrite relative link, image,
and reference-definition URLs in markdown files under `specs/` that
resolve into `specs/user/`, `specs/dev/`, `specs/test/`, or the
legacy `specs/items/` layout, remapping them to the corresponding
`specs/packages/` path and preserving anchors; links that resolve to
the containing file shall collapse to their `#anchor`.

A URL shall be rewritten only when the legacy target no longer
exists and the migrated target exists, so citations to conflict-kept
files stay intact and an interrupted run self-repairs on rerun.
Files whose pre-run content matched a recognized bundled version
shall be skipped (they are replaced wholesale by
[SCAF-11](#scaf-11) steps 3–4).
Rewritten files outside the framework, seed, and migration-target
sets shall be reported as `(citations rewritten)`.

#### SCAF-41

Where `--update` migrated at least one package per
[SCAF-39](#scaf-39), while `specs/map.md` exists and its pre-run
content matched no recognized bundled version, the CLI shall
restructure the map in place and report it as
`(restructured for the packages layout)`:

- In the first fenced layout block containing lines starting with
  `user/`, `dev/`, or `test/`, those lines shall be replaced by
  active-language `packages/` and `compositions/` lines.
- Each table whose first-column body cells are all `user`, `dev`, or
  `test` shall be reshaped to a single row without the group column,
  keeping the remaining header cells, pointing the file cell at the
  `specs/packages/` path, and joining distinct summaries with `; `
  in user, dev, test order.
- A Compositions section shall be appended when the map has none.
- All other map content shall be preserved.

#### SCAF-50

Where `--update` runs while `specs/interactions/` exists, the CLI
shall move each of its entries to the same path under
`specs/compositions/`, keeping any entry whose target already
exists in place and reporting it as a conflict; rewrite every
relative citation across `specs/` that resolved into
`specs/interactions/` to the `specs/compositions/` path; rewrite each
moved file's `Verifies:` metadata blocks as inline `Verifies …`
sentences ([SCAF-44](#scaf-44)); rename a
`## Interactions` map heading and an `interactions/` layout-block
line to the active-language Compositions forms; drop a pristine
bundled `interactions/.gitkeep` via the legacy manifest; and
remove the emptied directory.
Moved files shall be reported as
`(migrated from specs/interactions/...)` indicator lines.
The CLI shall not reshape a moved file into the META-34 section
grammar; lint findings remaining inside moved files are
reconciliation work owned by the printed compositions prompt
([SCAF-42](#scaf-42)).

#### SCAF-42

Where `--update` completes after migrating at least one package per
[SCAF-39](#scaf-39) or at least one file per [SCAF-50](#scaf-50), or
while `specs/compositions/` contains no markdown file although
`specs/packages/` contains at least one, the CLI shall print — after
the merge prompt — a copy-paste-ready agent prompt for filling
`specs/compositions/` with bindings, integrated scenarios, and the
tests that span packages.
Otherwise no compositions prompt shall be printed.

### Language Selection

#### SCAF-28

Where the `scaffold` subcommand is invoked without `--update`,
when `--lang <code>` is provided, the CLI shall generate localized
bundled specs for that language.

Supported language codes shall be `en` and `zh`.
The `zh` code shall mean Simplified Chinese.
When `--lang` is omitted and no existing `specs/meta.md` declares an
authoring language, the CLI shall use `en`.
When an unsupported language code is provided, the CLI shall exit
non-zero and list the supported language codes.

#### SCAF-29

Where the `scaffold` subcommand is invoked without `--update` while
`specs/meta.md` exists, the CLI shall treat the existing
authoring-language declaration as active, or `en` when no declaration
is present.

When an explicit `--lang` does not match the active language, the CLI
shall exit non-zero without changing the existing scaffold.

#### SCAF-30

Where the `scaffold` subcommand is invoked with `--update`, the CLI
shall reject `--lang` and exit non-zero.

The update language shall be read from the existing `specs/meta.md`
authoring-language declaration, or `en` when no declaration is present.

### Agent Instructions

#### SCAF-5

Where the `scaffold` subcommand is invoked, the CLI shall update agent spec
instructions in `CLAUDE.md` and `AGENTS.md`. When neither file
exists, the CLI shall create both on the initial (non-`--update`)
flow; on `--update`, absent files shall stay absent. When only one
exists, only that file shall be updated. When a file contains a
matching specs section heading, the CLI shall replace that section
in place; when the replacement is identical, the CLI shall skip the
file.

### Error Handling

#### SCAF-6

Where the `scaffold` subcommand encounters an unrecoverable error, the CLI
shall print an error message to stderr and exit non-zero.

## Internal Behavior

### Directory Structure

#### SCAF-7

Where `createSpecsStructure()` is called, it shall create a
`specs/` directory with subdirectories `decisions/`, `iterations/`,
`packages/`, and `compositions/` under the resolved base path, and
shall not create the legacy `user/`, `dev/`, or `test/` directories.

### Template Copying

#### SCAF-8

Where `copyTemplates()` is called, it shall recursively copy files
from the bundled `scaffold/specs/` directory to the target `specs/`
directory. Files that already exist at the destination shall not be
overwritten.

When a language is provided by the caller, `copyTemplates()` shall
resolve bundled content using [SCAF-31](#scaf-31).

#### SCAF-9

Where `getScaffoldDir()` resolves the bundled scaffold path, it
shall navigate from the `dist/` output directory up to the package
root and return the `scaffold/` directory path.

In this repository the bundle's source of truth is the top-level
`scaffold/` directory — CLI implementation detail, kept outside both
the package sources and `specs/`.
The package build shall stage it into `packages/cli/scaffold/`
(gitignored) so the npm `files` entry can ship it; the resolver and
tests read the staged copy.

#### SCAF-37

Where `copyRootLicense(basePath)` is called, it shall copy the bundled
`scaffold/LICENSE` to `<basePath>/LICENSE`:

- When no file exists at `<basePath>/LICENSE`, it shall write the
  bundled `LICENSE` and report the `LICENSE` path.
- When a file exists at `<basePath>/LICENSE`, it shall leave it
  unmodified and report an `(already exists)` indicator.

The bundled `scaffold/LICENSE` shall hold the full, verbatim Apache
License 2.0 text from its authoritative source [[1]].
`copyRootLicense()` is invoked only on the initial (non-`--update`)
scaffold flow; it shall not localize the file, and the bundled root
`LICENSE` shall not participate in `--update` refresh or the
file-history manifest ([SCAF-21](#scaf-21)).

#### SCAF-13

Where `getFrameworkSpecFiles()` is called, it shall return the
file paths classified as **framework** by
[SCAF-19](#scaf-19), relative to the target
repository root, using POSIX path separators.

#### SCAF-14

Where `overwriteFrameworkSpecFiles()` is called with a base path and
active language, it shall, for each path returned by
`getFrameworkSpecFiles()`, classify the target's pre-write state with
`isPristine` ([SCAF-22](#scaf-22)) over the active-language history and
refresh it from the active-language bundled template, reporting:

- On `"missing"`, it shall create target parent directories as needed,
  write the bundled template, and report an `(updated)` indicator.
- When the target's canonical SHA-256 ([SCAF-21](#scaf-21)) equals the
  active-language bundled template's, it shall leave the target
  unwritten and report an `(unchanged)` indicator.
- On `"pristine"` with a canonical SHA-256 that differs from the
  bundled template's (an older recognized version), it shall overwrite
  the target and report an `(updated)` indicator.
- On `"modified"` (content matching no recognized bundled version), it
  shall overwrite the target, report an
  `(overwritten — user-modified)` indicator, and include the path in
  its returned list.

Framework files are refreshed unconditionally
([SCAF-19](#scaf-19)); the `"modified"` case still
overwrites. The returned list of overwritten user-modified paths drives
the warning required by [SCAF-18](#scaf-18). The list shall be empty
when no target was overwritten while user-modified.

#### SCAF-20

Where `getSeedSpecFiles()` is called, it shall return the file
paths classified as **seed** by
[SCAF-19](#scaf-19), relative to the target
repository root, using POSIX path separators.

#### SCAF-21

Where `getFileHistory(relPath)` is called, it shall load the
bundled file-history manifest at `scaffold/.file-history.json`
and return the array of canonical SHA-256 content hashes recorded
for that path, or an empty array when the path is not present.

Canonical content hashing shall normalize CRLF and CR line endings
to LF for text content before hashing. Content containing NUL bytes
shall be hashed byte-for-byte.

The manifest shall satisfy the following invariants:

- It shall contain an entry for every file under `scaffold/specs/`,
  regardless of framework/seed classification, and every file under
  `scaffold/i18n/<lang>/specs/`, so that any caller can detect
  whether a target file matches a recognized bundled version.
- Each entry's hash array shall list, in chronological order, the
  canonical SHA-256 of every recognized bundled version of that
  file's content. The final entry shall equal the current bundled
  file content's canonical SHA-256.
- When bundled content changes, the new canonical SHA-256 shall be
  appended as the final entry before the change is committed.

The manifest schema shall be a flat JSON object mapping POSIX
relative paths to arrays of `sha256-`-prefixed hex strings, e.g.:

```json
{
  "specs/dev/git.md": ["sha256-...", "sha256-..."]
}
```

#### SCAF-22

Where `isPristine(basePath, relPath, language)` is called, it shall:

1. Return `"missing"` when no file exists at `<basePath>/<relPath>`.
2. Otherwise, compute the canonical SHA-256 hash of the file's
   content and return `"pristine"` when the hash is a member of
   the history for either the English base path or the
   caller-provided active-language overlay path
   ([SCAF-21](#scaf-21)), or `"modified"` otherwise.

#### SCAF-23

Where `refreshPristineSeeds()` is called with a base path and active
language, it
shall, for each seed path returned by `getSeedSpecFiles()`,
consult `isPristine` ([SCAF-22](#scaf-22)) and:

- On `"pristine"`, when the target's canonical SHA-256 differs
  from the active-language bundled template's, overwrite the target and report
  the path with an `(updated)` indicator; when they match, leave
  the target unwritten and report the path with an `(unchanged)`
  indicator.
- On `"modified"`, leave the target file unmodified and report
  the path with a `(kept — user-modified)` indicator.
- On `"missing"`, create target parent directories as needed,
  write the active-language bundled template, and report the path with an
  `(created)` indicator. Users who do not want a seed shall
  remove it after `--update`.

When `refreshPristineSeeds()` receives migration context for a seed
path, it shall combine the migration source(s) and seed refresh
status into one indicator for that path. If the migrated seed is
already at the current bundled content, the indicator shall only
report the migration source(s).

When it receives an indicator override for a user-modified seed
(e.g. the restructured map of [SCAF-41](#scaf-41) or a kept seed
whose citations were rewritten by [SCAF-40](#scaf-40)), the override
text shall replace `kept — user-modified` in that path's indicator.

Where a seed path ends in `.gitkeep`, while the file is missing and
its directory exists with other entries, `refreshPristineSeeds()`
shall skip the path without writing or reporting it.

#### SCAF-26

Where `migrateLegacyItemLayout()` is called with a base path, it
shall move every file under `specs/items/user/`, `specs/items/dev/`,
and `specs/items/test/` to the corresponding `specs/user/`,
`specs/dev/`, and `specs/test/` path, preserving relative subpaths
and file content.

It shall create target parent directories as needed.
When the target path already exists, it shall leave the legacy file
unmodified and return a conflict result identifying both paths
without overwriting either file.
When it moves a file, it shall return a migration result identifying
both the legacy and target paths.
After successful moves, it shall remove empty legacy item directories.
It shall not alter files outside the legacy item directories.
It shall not write to stdout; the caller owns per-file reporting.
This migration shall remain part of `--update` permanently, so late
upgraders from legacy layouts keep a supported path.
It composes with the package-layout migration
([SCAF-43](#scaf-43)) in a single run: files moved from
`specs/items/` continue into `specs/packages/`, and indicators name
the original `specs/items/` paths.

### Package Migration

#### SCAF-43

Where `migratePackageLayout()` is called with a base path, active
language, and the provenance map of this run's
`migrateLegacyItemLayout()` results, it shall implement
[SCAF-39](#scaf-39):

- Markdown files under `specs/user/`, `specs/dev/`, and
  `specs/test/` shall be grouped by their group-relative path; each
  group becomes one target under `specs/packages/`.
- A target shall be written before its sources are deleted, so an
  interrupted run loses no bytes and a rerun picks up the remainder.
- Legacy-pristine classification shall use `isLegacyPristine()`
  ([SCAF-47](#scaf-47)); the all-pristine fast path shall write the
  active-language bundled seed.
- Returned results shall carry the target path, a status
  (`seeded`, `merged`, `moved`, or `conflict`), and the pre-run
  source paths with provenance composed, so indicators name the
  paths the user actually had. Conflict results shall name the
  on-disk source paths.
- Duplicate base heading anchors in merged output shall be returned
  for the caller's stderr note; the `-N` suffixes that renderers add
  to repeats shall not be treated as distinct anchors, and item IDs
  ending in `-N` shall not be misdetected as duplicates.
- It shall not write to stdout; the caller owns per-file reporting.

#### SCAF-44

Where `mergePackageSources()` merges a package's legacy sources, it
shall produce one markdown file with:

- the distinct leading HTML comment blocks (SPDX headers) of the
  sources;
- an H1 `# <SHORT>: <Title>` where `<SHORT>` comes from the first
  source H1 (falling back to the first item-ID prefix, then to the
  file name) and `<Title>` keeps identical source titles, else the
  first source title stripped of group-role qualifiers, else the
  humanized file name;
- one `## Intent` holding each source's intent body with exact
  duplicates removed;
- the user, dev, and test source bodies under `## External
  Behavior`, `## Internal Behavior`, and `## Verification`
  respectively, with every heading demoted one level (setext
  headings rewritten as ATX; depth capped at six) and empty sections
  omitted;
- one trailing `## References` merging the sources' numeric
  reference definitions: renumbered sequentially, identical
  URL-plus-title definitions deduplicated, unused definitions kept,
  and every `[N]`-style marker in the moved content renumbered to
  match.

Body content shall move byte-faithfully except for the heading,
reference-number, and line-ending changes above — CRLF and CR line
endings are normalized to LF — and `Verifies:` metadata blocks:
each block, including wrapped continuation lines holding only
citations and separators, collapses to one inline `Verifies …`
sentence with no trailing separator.
The rewrite preserves the declared relationships but does not place
citations at their assertions; weaving them inline per
[META-20](../meta.md#meta-20) is reconciliation work for the merge
prompt of [SCAF-11](#scaf-11) step 7, and lint marks each unwoven
sentence until then.
Localized Intent and References section names from the bundled
templates shall be recognized.

#### SCAF-45

Where `rewriteAllSpecCitations()` is called with a base path and the
set of pre-run pristine framework/seed paths, it shall apply
[SCAF-40](#scaf-40) to every markdown file under `specs/` outside
that set, returning the rewritten paths.
Only link, image, and reference-definition URLs change; all other
bytes are preserved.
URL edits shall be skipped when the raw URL cannot be located
verbatim inside the node's source span.

#### SCAF-46

Where `restructureMap()` is called with a map's text and the active
language, it shall implement the transform of [SCAF-41](#scaf-41)
and return the new text, or null when nothing changed.
Group tables shall be detected by their first-column cell values,
not by localized header names, and the replacement layout lines and
Interactions section shall come from the active language.

#### SCAF-47

Where `getLegacyFileHistory(relPath)` is called, it shall load the
bundled `scaffold/.legacy-file-history.json` manifest and return the
recorded canonical hash history for that path, or an empty array
when the path is absent or the manifest is missing.

The legacy manifest shall hold exactly the previously bundled paths
that no longer ship (the old `specs/dev/`, `specs/test/`, and
`specs/user/` seeds), with their full hash histories, and shall stay
disjoint from the live manifest of [SCAF-21](#scaf-21).

Where `isLegacyPristine(basePath, relPath)` is called, it shall
classify the file at that path as `missing`, `pristine`, or
`modified` against the legacy manifest using the canonical content
hash of [SCAF-21](#scaf-21).

### Update Orchestration

#### SCAF-15

Where `getGitRoot()` is called, it shall return the current git
repository root, or throw an error when the current working directory
is outside a git repository.

#### SCAF-16

Where `assertCleanSpecsTree()` is called with a base path, it shall
verify that `git status --porcelain -- specs` is empty in that
repository, or throw an error when the `specs/` working tree is not
clean.

#### SCAF-17

Where `updateScaffoldTemplates()` is called on a clean `specs/`
working tree, missing framework files shall not be a failed
precondition.
The CLI shall create them from bundled templates through
`overwriteFrameworkSpecFiles()` ([SCAF-14](#scaf-14)).

#### SCAF-18

Where `updateScaffoldTemplates()` is called, it shall resolve the
current git repository root, enforce update preconditions
([SCAF-15](#scaf-15), [SCAF-16](#scaf-16)), allow missing
framework files ([SCAF-17](#scaf-17)), and then, in order:
snapshot the pristine state of every framework and seed path before
any byte edits (so [SCAF-40](#scaf-40)/[SCAF-41](#scaf-41) never
dirty a file that steps below replace wholesale), migrate the legacy
item layout ([SCAF-26](#scaf-26)), migrate the package layout
([SCAF-43](#scaf-43)), migrate `specs/interactions/` to
`specs/compositions/` ([SCAF-50](#scaf-50)), rewrite legacy citations
([SCAF-45](#scaf-45)), restructure a user-modified map
([SCAF-46](#scaf-46)), overwrite framework files
([SCAF-14](#scaf-14)), refresh pristine seeds with the combined
migration sources and indicator overrides ([SCAF-23](#scaf-23)),
refresh existing agent files ([SCAF-10](#scaf-10)), read the bundled
prompts from `scaffold/update-merge-prompt.md` and
`scaffold/compositions-prompt.md`, and print the per-file
indicators, clear completion message, and prompts specified by
[SCAF-11](#scaf-11) and [SCAF-42](#scaf-42).

When `overwriteFrameworkSpecFiles()` ([SCAF-14](#scaf-14)) returns one
or more overwritten user-modified framework paths, it shall print a
warning to stderr that names each such path and points the user to
where the replaced content can be reviewed and reconciled (for example,
`git diff -- specs` and git history). When that list is empty, it shall
print no such warning.

Where `updateScaffoldTemplates()` is called, it shall read the active
language from `specs/meta.md` before selecting bundled templates,
falling back to `en` when no authoring-language declaration is present.
It shall pass that active language to framework overwrite and seed
refresh helpers.

### Localization

#### SCAF-31

Where bundled scaffold content is resolved for language `en`, the
resolver shall return the English file under `scaffold/`.

Where bundled scaffold content is resolved for a non-English language,
when `scaffold/i18n/<lang>/<relPath>` exists, the resolver shall
return that overlay file.

Where no overlay file exists, the resolver shall return the English
file under `scaffold/<relPath>`.

#### SCAF-32

Where a localized `meta.md` overlay exists, the overlay shall include
every English `META-*` item.

For each untranslated item, the overlay item body shall remain
byte-identical to the English item body.

For each translated item, the overlay item shall carry the canonical
SHA-256 hash of its English source item so source changes cannot leave
a stale translation undetected.

### Agent Spec Appending

#### SCAF-10

Where `appendAgentSpecs()` is called, it shall read
`scaffold/agent-specs.txt` and process `CLAUDE.md` and `AGENTS.md`
at the base path. When neither file exists, both shall be created,
unless the caller passes `createMissing: false` (the `--update`
flow), in which case absent files shall stay absent. When only one
exists, only that file shall be updated. Detection of
an existing specs section shall use
a case-sensitive match on the heading `## Specs (Source of Truth)`;
when found, the section shall be replaced in place and reported as
updated, or skipped when the replacement is identical. When the
heading is absent (including case mismatches), the content shall be
appended to the file.

## Verification

### Update Coverage

#### SCAF-24
Where `--update` is exercised ([SCAF-11](#scaf-11)), the test
suite shall cover each row of the state matrix below — the
framework ([SCAF-14](#scaf-14)) and seed ([SCAF-23](#scaf-23))
refresh paths — and shall assert both (a) the printed indicator
for that path and (b) the post-run file-system state, so that an
over-eager indicator cannot pass while bytes remain unchanged or
vice versa.

Hash comparisons shall use the canonical content hash from
[SCAF-21](#scaf-21). A text file with CRLF
line endings and otherwise bundled-current content shall remain
in the bundled-current cell and preserve its existing bytes.

| File class | Working-tree state vs manifest | Indicator | Post-run file-system state |
| --- | --- | --- | --- |
| framework | hash equals bundled current | `(unchanged)` | bytes unchanged |
| framework | hash is in history but not current | `(updated)` | bytes equal bundled current |
| framework | hash is not in history (user-modified) | `(overwritten — user-modified)` | bytes equal bundled current |
| framework | file absent (including missing parent directories) | `(updated)` | bytes equal bundled current |
| seed | hash is in history and equals bundled current | `(unchanged)` | bytes unchanged |
| seed | hash is in history but not current | `(updated)` | bytes equal bundled current |
| seed | hash is not in history | `(kept — user-modified)` | bytes unchanged |
| seed | file absent (including missing parent directories) | `(created)` | bytes equal bundled current |
| `.gitkeep` seed | file absent, directory holds other entries | no indicator line | file stays absent |

#### SCAF-25
Where `--update` is exercised over any cell of the
[SCAF-24](#scaf-24) matrix, the test suite shall additionally
assert that `(updated)` does not appear in the output for any
path whose post-run content equals its pre-run content
([SCAF-23](#scaf-23)), so that a regression to the prior
over-eager indicator cannot pass.

#### SCAF-27
Where `--update` is exercised on a repository using the legacy
`specs/items/user/`, `specs/items/dev/`, or `specs/items/test/`
layout, the test suite shall assert that legacy item files chain
through both migrations ([SCAF-26](#scaf-26),
[SCAF-43](#scaf-43)) into `specs/packages/` in one run, that the
indicators name the original `specs/items/` paths, and that the
emptied `specs/items/` and group directories are removed.
It shall cover both a recognized bundled legacy seed (asserting the
target equals the current bundled package seed) and a custom item
file (asserting its content survives the merge transform).

### Migration Coverage

#### SCAF-48
Where `--update` is exercised on a repository using the flat legacy
`specs/user/`, `specs/dev/`, `specs/test/` layout
([SCAF-39](#scaf-39)), the test suite shall run the real CLI and
cover at least:

- all-pristine legacy seeds: the targets' bytes equal the current
  bundled package seeds ([SCAF-43](#scaf-43)), one combined
  indicator names every source, and the legacy directories
  (including a pristine `.gitkeep`) are gone;
- a customized legacy seed: the target holds the merge transform of
  the user's content ([SCAF-44](#scaf-44)) and the indicator
  combines the migration sources with `kept — user-modified`;
- a custom multi-file package: the merged target carries the
  Intent/External Behavior/Internal Behavior/Verification sections
  in order with demoted headings, and its `Verifies:` citations
  collapse to same-file anchors ([SCAF-44](#scaf-44));
- a conflicting target: every legacy source is kept byte-identical
  and reported, and the existing target is untouched
  ([SCAF-43](#scaf-43));
- indicator ordering: migration, conflict, and citation-rewrite
  lines precede framework and seed indicator lines
  ([SCAF-11](#scaf-11) step 7);
- a second run after migration: no `migrated from` indicator and no
  byte changes;
- a zh tree: overlays refresh from the active language and the
  migrated tree lints clean.

#### SCAF-49
Where `--update` migrates packages, the test suite shall assert
end to end that:

- citations in decision records and other spec files are rewritten
  to the `specs/packages/` paths ([SCAF-40](#scaf-40),
  [SCAF-45](#scaf-45)) and reported as `(citations rewritten)`;
- a customized legacy-shape map is restructured in place — layout
  block lines replaced, group tables reshaped to one `File | Summary`
  row with `; `-joined summaries, a Compositions section appended —
  and reported as `(restructured for the packages layout)`
  ([SCAF-41](#scaf-41), [SCAF-46](#scaf-46));
- a tree with `specs/interactions/` files has them moved to
  `specs/compositions/` with citations, the map heading, and an
  `interactions/` layout-block line rewritten, a wrapped
  `Verifies:` block collapsing to one inline sentence, and the
  remaining lint errors confined to the moved composition files
  plus package citations into `specs/compositions/` kept navigable
  by the rewrite ([SCAF-50](#scaf-50));
- the compositions prompt is printed after a migrating run
  ([SCAF-42](#scaf-42)); a package-layout migration of pristine
  seeds leaves a tree `spex lint` passes with zero errors, and in
  custom content the converted `Verifies …` sentences are the only
  errors it reports;
- the packaged npm artifact ships both file-history manifests, both
  prompts ([SCAF-42](#scaf-42)), and the bundled `specs/packages/`
  and `specs/compositions/` seeds.

#### SCAF-35
Where `--update` replaces a framework file, the test suite shall run
the real CLI and cover both the warn and the quiet paths:

- Given a framework file ([SCAF-19](#scaf-19)) whose committed
  content matches no recognized bundled version, the suite shall
  assert the run exits zero, the file's indicator is
  `(overwritten — user-modified)` with the bytes equal to the
  bundled current ([SCAF-14](#scaf-14)), and a stderr warning names
  the file and points to reviewing and reconciling the replaced
  content ([SCAF-11](#scaf-11)).
- Given a pre-localization specs tree whose `specs/meta.md` is a
  recognized older bundled version carrying no authoring-language
  declaration, the suite shall assert the run exits zero, refreshes
  `specs/meta.md` to the bundled current with an `(updated)`
  indicator ([SCAF-18](#scaf-18)), and prints no
  replaced-user-content warning.

### License Coverage

#### SCAF-38
Where the `scaffold` subcommand creates a project, the test suite shall
assert that a top-level `LICENSE` file is written whose bytes equal the
bundled `scaffold/LICENSE` ([SCAF-36](#scaf-36)), that its canonical
content hash equals the authoritative Apache License 2.0 hash
([SCAF-37](#scaf-37)), and that no `NOTICE` file is written.

Where a `LICENSE` file already exists at the target root, the test suite
shall assert that `scaffold` leaves its bytes unchanged and reports it
with an `(already exists)` indicator ([SCAF-36](#scaf-36)).

### Localization Coverage

#### SCAF-33
Where the `scaffold` subcommand is exercised with language selection,
the test suite shall cover a Chinese fresh scaffold
([SCAF-28](#scaf-28)), a localized update refresh on a Chinese specs
tree, an unsupported language code ([SCAF-28](#scaf-28)), a
mismatched language on an existing scaffold ([SCAF-29](#scaf-29)),
and `--update` with `--lang` ([SCAF-30](#scaf-30)).

The Chinese fresh scaffold case shall assert that localized overlay
files are written for paths that have overlays and that fallback files
remain byte-identical to their English bundled templates
([SCAF-31](#scaf-31)).

The localized update case shall assert that `--update` on a Chinese
specs tree ([SCAF-30](#scaf-30)) refreshes a pristine framework
([SCAF-14](#scaf-14)) or seed ([SCAF-23](#scaf-23)) file from the
active Chinese overlay ([SCAF-18](#scaf-18)) rather than the English
base template.

#### SCAF-34

For each localized `meta.md` overlay, the test suite shall enforce
completeness, kept-English parity, and translated-item source hashes
([SCAF-32](#scaf-32)).

## References

[1]: https://www.apache.org/licenses/LICENSE-2.0.txt "Apache License, Version 2.0"
