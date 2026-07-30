<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# scaffold: Scaffold CLI

## Intent

This spec defines the `scaffold` subcommand: its user-visible behavior, the implementation requirements behind it, and the integration coverage it needs — particularly for `--update` paths whose outcome depends on combinations of working-tree state, manifest history, and bundled content.

## External Behavior

### Target Resolution

#### scaffold-1

Where the `scaffold` subcommand is invoked with a `<path>` argument, the CLI shall create the specs directory structure inside the specified path.

- The path must exist and be a directory; otherwise the CLI exits non-zero.

#### scaffold-2

Where the `scaffold` subcommand is invoked without a path argument inside a git repository, the CLI shall create the specs directory structure at the repository root.

#### scaffold-3

Where the `scaffold` subcommand is invoked without a path argument outside any git repository, the CLI shall create the specs directory structure in the current working directory.

### Idempotency

#### scaffold-4

Where the `scaffold` subcommand is invoked and target directories or template files already exist, the CLI shall skip those entries with an `(already exists)` indicator, leaving existing content unmodified.

### License

#### scaffold-36

Where the `scaffold` subcommand is invoked without `--update`, the CLI shall emit a top-level `LICENSE` file at the target root:

- when no `LICENSE` file exists there, it writes a `LICENSE` whose content is the verbatim Apache License 2.0 text and reports it with its path;
- while a `LICENSE` file already exists at the target root, it leaves the file unmodified and reports it with an `(already exists)` indicator, so an existing downstream license is never overwritten;
- it writes no `NOTICE` file, per-file license headers, or README license section, since the downstream project is unknown.

### Update

#### scaffold-11

Where the `scaffold` subcommand is invoked with `--update` and no `<path>` argument from within a git repository, while the `specs/` working tree is clean, the CLI shall:

1. Migrate files from the legacy `specs/items/user/`, `specs/items/dev/`, and `specs/items/test/` layout to the corresponding flat `specs/user/`, `specs/dev/`, and `specs/test/` paths without overwriting existing flat paths.
2. Migrate the legacy flat `specs/user/`, `specs/dev/`, and `specs/test/` layout into `specs/packages/` per [[scaffold-39](#scaffold-39)], fold the legacy `specs/interactions/` and `specs/compositions/` directories into `specs/packages/` per [[scaffold-50](#scaffold-50)] and [[scaffold-53](#scaffold-53)], rewrite legacy citations per [[scaffold-40](#scaffold-40)], and restructure a customized `specs/map.md` per [[scaffold-41](#scaffold-41)].
3. Write every **framework file** from the bundled template, creating framework files that are missing in older specs trees:
   - when the framework file being replaced holds content that matches no recognized bundled version — a genuine user modification rather than an older pristine version — the CLI still replaces it, reports it with an `(overwritten — user-modified)` indicator, and warns clearly before completing, naming the file and pointing the user to where the change can be reviewed and reconciled;
   - unmodified and older-pristine framework files are replaced without this warning or indicator.
4. For every **seed file**, refresh it with the bundled template when the user has not customized it — that is, when the working-tree content matches a previously distributed bundled version of that file, or when the seed is absent:
   - customized seeds are left unmodified and reported as `(kept — user-modified)`;
   - absent seeds are reported as `(created)`;
   - users who do not want a refreshed or newly created seed remove it after `--update`.
5. Refresh the managed agent-instruction section of existing `CLAUDE.md`/`AGENTS.md` files per [[scaffold-5](#scaffold-5)] without creating absent ones.
6. Leave any file outside the framework, seed, migration, and citation-rewrite sets unmodified.
7. Print per-file indicators, a clear completion message that points to `spex lint`, a copy-paste-ready LLM merge prompt, and — under the conditions of [[scaffold-42](#scaffold-42)] — a compositions prompt after it:
   - per-file indicators are the only path-level summary printed to stdout for the run, with exactly one indicator line per path, and no path summary follows the prompts;
   - the stderr diagnostics of step 3 and [[scaffold-39](#scaffold-39)] are not stdout path-level summaries and are exempt from this rule;
   - migration of seed-path targets is reported inline with seed state in one combined indicator line; other migrations, conflicts, and citation rewrites are reported before framework and seed indicators.

#### scaffold-12

Where the `scaffold` subcommand is invoked with `--update` while any precondition of [[scaffold-11](#scaffold-11)] does not hold (no `<path>` argument, cwd inside a git repository, `specs/` working tree clean), the CLI shall exit non-zero with an error explaining the failed precondition so that overwritten files remain recoverable.

#### scaffold-19

Where files bundled under `scaffold/specs/` are concerned, each file shall be classified as either **framework** or **seed**:

- **Framework** — spex-authoritative content that users do not author, refreshed unconditionally on `--update`; when a refresh replaces content that matches no recognized bundled version, `--update` warns before completing ([[scaffold-11](#scaffold-11)]):
  - `specs/meta.md`
  - `specs/decisions/000-spec-structure-format.md`
- **Seed** — starter content that users are expected to edit, extend, or replace, written once on initial `scaffold` and only refreshed by `--update` when the user has not customized it:
  - `specs/map.md`
  - `specs/intents/000-spdx-headers.md`
  - `specs/packages/git.md`
  - `specs/packages/licensing.md`
- When a new file is added under `scaffold/specs/`, it is assigned to exactly one of these classes.
- The seeded tree carries the layout of [[meta-1](../meta.md#meta-1)] — `decisions/`, `intents/`, `packages/`, `map.md`, `meta.md` — with no `compositions/` directory, and the seeded packages carry the sections of [[meta-30](../meta.md#meta-30)] and lowercase `<pack>-<N>` item IDs [[meta-11](../meta.md#meta-11)].
- Bundled support assets outside `scaffold/specs/` (for example, `scaffold/update-merge-prompt.md`, `scaffold/compositions-prompt.md`, the file-history manifests, and `scaffold/LICENSE`) are not framework or seed files.
- The bundled root `scaffold/LICENSE` is emitted to the target root by [[scaffold-36](#scaffold-36)] on initial scaffold rather than refreshed by `--update`, and it is not localized.
- Localized overlay files under `scaffold/i18n/<lang>/` inherit the class of the target path they replace.

#### scaffold-39

Where the `scaffold` subcommand is invoked with `--update` while any of `specs/user/`, `specs/dev/`, or `specs/test/` exists, the CLI shall migrate that legacy layout into `specs/packages/`:

- Item files sharing a relative path under the legacy group directories form one package; each package is written to `specs/packages/<path>.md` and its source files are deleted only after the target is written.
- When every present source matches a recognized legacy bundled version, the target is the current bundled package seed and the combined indicator of [[scaffold-11](#scaffold-11)] names the sources (e.g. `migrated from specs/dev/licensing.md, specs/test/licensing.md`).
- Otherwise the sources are merged per [[scaffold-44](#scaffold-44)] and reported as `(migrated from <sources>)`.
- When the target already exists, every source is kept unmodified and reported as `(kept — target exists at <target>)`; a source that arrived via the same run's item-layout migration reports both steps in that one line (`migrated from <items path>; kept — …`).
- Non-markdown files under the legacy directories move to the same relative path under `specs/packages/`, except a `.gitkeep` matching a recognized bundled version, which is deleted.
- Emptied legacy directories are removed.
- When merging creates duplicate heading anchors inside one target file, the CLI prints a stderr note naming each file and anchor.

#### scaffold-40

Where `--update` runs, the CLI shall rewrite legacy citations in markdown files under `specs/` to the migrated paths and the enclosed item-citation form [[meta-16](../meta.md#meta-16)]:

- Relative link, image, and reference-definition URLs that resolve into `specs/user/`, `specs/dev/`, `specs/test/`, or the legacy `specs/items/` layout are remapped to the corresponding `specs/packages/` path with anchors preserved; links that resolve to the containing file collapse to their `#anchor`.
- URLs that resolve into `specs/interactions/`, `specs/compositions/`, or `specs/iterations/` are remapped per [[scaffold-50](#scaffold-50)], [[scaffold-53](#scaffold-53)], and [[scaffold-51](#scaffold-51)].
- An item citation — a relative or same-file link whose fragment is an item anchor and whose text names that item up to case — is rewritten, where not already enclosed, to the enclosed form `[[<pack>-<N>](<path>#<pack>-<N>)]` with its text lowercased to the fragment.
- A URL is remapped only when the legacy target no longer exists and the migrated target exists, so citations to conflict-kept files stay intact and an interrupted run self-repairs on rerun.
- Files whose pre-run content matched a recognized bundled version are skipped (they are replaced wholesale by [[scaffold-11](#scaffold-11)] steps 3–4).
- Rewritten files outside the framework, seed, and migration-target sets are reported as `(citations rewritten)`.

#### scaffold-41

Where `--update` migrated at least one package per [[scaffold-39](#scaffold-39)], while `specs/map.md` exists and its pre-run content matched no recognized bundled version, the CLI shall restructure the map in place for the packages layout and report it as `(restructured for the packages layout)`:

- In the first fenced layout block containing lines starting with `user/`, `dev/`, or `test/`, those lines are replaced by an active-language `packages/` line — the layout of [[meta-1](../meta.md#meta-1)] holds no `compositions/` entry.
- Each table whose first-column body cells are all `user`, `dev`, or `test` is reshaped to a single row without the group column, keeping the remaining header cells, pointing the file cell at the `specs/packages/` path, and joining distinct summaries with `; ` in user, dev, test order.
- No Compositions section is appended or created: a composition is an ordinary package under `specs/packages/` ([DR-000](../decisions/000-spec-structure-format.md)).
- All other map content is preserved.
- Every transform is scoped through the parsed sections: the layout rewrite applies only to the code block under the Layout heading, group tables reshape only under the Packages heading, and the legacy-section heading renames of [[scaffold-50](#scaffold-50)], [[scaffold-53](#scaffold-53)], and [[scaffold-51](#scaffold-51)] edit heading nodes — where a section heading means a root-level `##` node, so a fenced example, a blockquoted or list-nested heading, or a lookalike elsewhere is never rewritten and never suppresses a transform.

#### scaffold-50

Where `--update` runs while `specs/interactions/` exists, the CLI shall fold that legacy directory into `specs/packages/`:

- Each entry moves to the same path under `specs/packages/`; an entry whose target already exists is kept in place and reported as a conflict.
- Every relative citation across `specs/` that resolved into `specs/interactions/` is rewritten to the `specs/packages/` path by the citation rewrite ([[scaffold-45](#scaffold-45)]).
- Each moved file's `Verifies:` metadata blocks are rewritten as inline `Verifies …` sentences ([[scaffold-44](#scaffold-44)]).
- A `## Interactions` map heading, and an `interactions/` line inside the code block under the map's Layout heading, are renamed to the active-language Packages forms — a lookalike block elsewhere in the map is never rewritten.
- A pristine bundled `interactions/.gitkeep` is dropped via the legacy manifest ([[scaffold-47](#scaffold-47)]), and the emptied directory is removed.
- Moved files are reported as `(migrated from specs/interactions/...)` indicator lines.
- The CLI does not reshape a moved file into the package section grammar of [[meta-30](../meta.md#meta-30)]; lint findings remaining inside moved files are reconciliation work owned by the printed compositions prompt ([[scaffold-42](#scaffold-42)]).

#### scaffold-53

Where `--update` runs while `specs/compositions/` exists, the CLI shall fold that legacy directory into `specs/packages/`:

- Each entry moves to the same path under `specs/packages/`; an entry whose target already exists is kept in place and reported as a conflict.
- Every relative citation across `specs/` that resolved into `specs/compositions/` is rewritten to the `specs/packages/` path by the citation rewrite ([[scaffold-45](#scaffold-45)]).
- Each moved file's `Verifies:` metadata blocks are rewritten as inline `Verifies …` sentences ([[scaffold-44](#scaffold-44)]).
- A `## Compositions` map heading, and a `compositions/` line inside the code block under the map's Layout heading, are renamed to the active-language Packages forms — a lookalike block elsewhere in the map is never rewritten.
- A pristine bundled `compositions/.gitkeep` is dropped via the legacy manifest ([[scaffold-47](#scaffold-47)]), and the emptied directory is removed.
- Moved files are reported as `(migrated from specs/compositions/...)` indicator lines.
- The CLI does not reshape a moved file into the package section grammar of [[meta-30](../meta.md#meta-30)]; lint findings remaining inside moved files are reconciliation work owned by the printed compositions prompt ([[scaffold-42](#scaffold-42)]).

#### scaffold-51

Where `--update` runs while `specs/iterations/` exists, the CLI shall move each of its entries to the same path under `specs/intents/` ([DR-017](../decisions/017-intent-records.md)), keeping any entry whose target already exists in place and reporting it as a conflict, and remove the emptied directory.

- The move changes no bytes and precedes the pristine snapshot, so a recognized legacy seed is refreshed wholesale at its migrated path rather than dirtied by the citation rewrite.
- Relative citations across `specs/` that resolved into `specs/iterations/` are rewritten to the `specs/intents/` path by the citation rewrite ([[scaffold-45](#scaffold-45)]).
- A `## Iterations` (or `## 迭代`) map heading and an `iterations/` line inside the code block under the map's Layout heading are renamed to the active-language Intents forms — a lookalike block elsewhere in the map is never rewritten.
- A legacy file whose leading number is already held by a differently named `intents/` file is likewise kept in place and reported as a conflict against that ID holder, since the number is the record ID [[meta-39](../meta.md#meta-39)].
- Moved files are reported as `(migrated from specs/iterations/...)` indicator lines, with a moved seed folding into its seed refresh line.

#### scaffold-52

Where plain `scaffold` targets a tree whose `specs/` contains a legacy directory — `user/`, `dev/`, `test/`, `items/`, `interactions/`, `compositions/`, or `iterations/` — the CLI shall write nothing, exit non-zero, and direct the user to `spex scaffold --update`: creating current seed targets beside legacy files would make every later `--update` conflict-keep the legacy content indefinitely.

#### scaffold-42

Where `--update` completes after migrating at least one package per [[scaffold-39](#scaffold-39)] or at least one file per [[scaffold-50](#scaffold-50)] or [[scaffold-53](#scaffold-53)], the CLI shall print — after the merge prompt — a copy-paste-ready agent prompt for reconciling the migrated content into composition packages: packages under `specs/packages/` stating the behavior that emerges only when several packages work together, with the tests that span packages ([DR-000](../decisions/000-spec-structure-format.md)).

- Otherwise no compositions prompt is printed.

### Language Selection

#### scaffold-28

Where the `scaffold` subcommand is invoked without `--update`, when `--lang <code>` is provided, the CLI shall generate localized bundled specs for that language:

- supported language codes are `en` and `zh`, with `zh` meaning Simplified Chinese;
- when `--lang` is omitted and no existing `specs/meta.md` declares an authoring language, the CLI uses `en`;
- when an unsupported language code is provided, the CLI exits non-zero and lists the supported language codes.

#### scaffold-29

Where the `scaffold` subcommand is invoked without `--update` while `specs/meta.md` exists, the CLI shall treat the existing authoring-language declaration as active, or `en` when no declaration is present.

- When an explicit `--lang` does not match the active language, the CLI exits non-zero without changing the existing scaffold.

#### scaffold-30

Where the `scaffold` subcommand is invoked with `--update`, the CLI shall reject `--lang` and exit non-zero.

- The update language is read from the existing `specs/meta.md` authoring-language declaration, or `en` when no declaration is present.

### Agent Instructions

#### scaffold-5

Where the `scaffold` subcommand is invoked, the CLI shall update agent spec instructions in `CLAUDE.md` and `AGENTS.md`:

- when neither file exists, both are created on the initial (non-`--update`) flow, while on `--update` absent files stay absent;
- when only one exists, only that file is updated;
- when a file contains a matching specs section heading, that section is replaced in place, or the file is skipped when the replacement is identical.

### Error Handling

#### scaffold-6

Where the `scaffold` subcommand encounters an unrecoverable error, the CLI shall print an error message to stderr and exit non-zero.

## Internal Behavior

### Directory Structure

#### scaffold-7

Where `createSpecsStructure()` is called, it shall create a `specs/` directory with subdirectories `decisions/`, `intents/`, and `packages/` [[meta-1](../meta.md#meta-1)] under the resolved base path, creating none of the legacy `user/`, `dev/`, `test/`, or `compositions/` directories.

### Template Copying

#### scaffold-8

Where `copyTemplates()` is called, it shall recursively copy files from the bundled `scaffold/specs/` directory to the target `specs/` directory:

- files that already exist at the destination are not overwritten;
- when a language is provided by the caller, bundled content is resolved using [[scaffold-31](#scaffold-31)].

#### scaffold-9

Where `getScaffoldDir()` resolves the bundled scaffold path, it shall navigate from the `dist/` output directory up to the package root and return the `scaffold/` directory path.

- In this repository the bundle's source of truth is the top-level `scaffold/` directory — CLI implementation detail, kept outside both the package sources and `specs/`.
- The package build stages it into `packages/cli/scaffold/` (gitignored) so the npm `files` entry can ship it; the resolver and tests read the staged copy.

#### scaffold-37

Where `copyRootLicense(basePath)` is called, it shall copy the bundled `scaffold/LICENSE` to `<basePath>/LICENSE`:

- when no file exists at `<basePath>/LICENSE`, it writes the bundled `LICENSE` and reports the `LICENSE` path;
- when a file exists at `<basePath>/LICENSE`, it leaves it unmodified and reports an `(already exists)` indicator;
- the bundled `scaffold/LICENSE` holds the full, verbatim Apache License 2.0 text from its authoritative source [[1]];
- `copyRootLicense()` is invoked only on the initial (non-`--update`) scaffold flow; it does not localize the file, and the bundled root `LICENSE` participates in neither `--update` refresh nor the file-history manifest ([[scaffold-21](#scaffold-21)]).

#### scaffold-13

Where `getFrameworkSpecFiles()` is called, it shall return the file paths classified as **framework** by [[scaffold-19](#scaffold-19)], relative to the target repository root, using POSIX path separators.

#### scaffold-14

Where `overwriteFrameworkSpecFiles()` is called with a base path and active language, it shall, for each path returned by `getFrameworkSpecFiles()`, classify the target's pre-write state with `isPristine` ([[scaffold-22](#scaffold-22)]) over the active-language history and refresh it from the active-language bundled template, reporting:

- on `"missing"`, it creates target parent directories as needed, writes the bundled template, and reports an `(updated)` indicator;
- when the target's canonical SHA-256 ([[scaffold-21](#scaffold-21)]) equals the active-language bundled template's, it leaves the target unwritten and reports an `(unchanged)` indicator;
- on `"pristine"` with a canonical SHA-256 that differs from the bundled template's (an older recognized version), it overwrites the target and reports an `(updated)` indicator;
- on `"modified"` (content matching no recognized bundled version), it overwrites the target, reports an `(overwritten — user-modified)` indicator, and includes the path in its returned list;
- framework files are refreshed unconditionally ([[scaffold-19](#scaffold-19)]), so the `"modified"` case still overwrites;
- the returned list of overwritten user-modified paths drives the warning required by [[scaffold-18](#scaffold-18)] and is empty when no target was overwritten while user-modified.

#### scaffold-20

Where `getSeedSpecFiles()` is called, it shall return the file paths classified as **seed** by [[scaffold-19](#scaffold-19)], relative to the target repository root, using POSIX path separators.

#### scaffold-21

Where `getFileHistory(relPath)` is called, it shall load the bundled file-history manifest at `scaffold/.file-history.json` and return the array of canonical SHA-256 content hashes recorded for that path, or an empty array when the path is not present.

- Canonical content hashing normalizes CRLF and CR line endings to LF for text content before hashing; content containing NUL bytes is hashed byte-for-byte.

The manifest satisfies the following invariants:

- It contains an entry for every file under `scaffold/specs/`, regardless of framework/seed classification, and every file under `scaffold/i18n/<lang>/specs/`, so that any caller can detect whether a target file matches a recognized bundled version.
- Each entry's hash array lists, in chronological order, the canonical SHA-256 of every released version of that file's content, followed by one working entry for the current bundled content; the final entry equals the current bundled file content's canonical SHA-256.
- When bundled content changes between releases, the working entry is rewritten in place rather than appended, so the array grows by one entry per release and not one per commit: only a released version can be the content of a target file, so only a released hash can make a target pristine ([[scaffold-22](#scaffold-22)]).
- When a release is cut, the working entry becomes that release's frozen entry, and a new working entry is added by the next bundled change; a frozen entry is never removed or reordered.

The manifest schema is a flat JSON object mapping POSIX relative paths to arrays of `sha256-`-prefixed hex strings, e.g.:

```json
{
  "specs/packages/git.md": ["sha256-...", "sha256-..."]
}
```

#### scaffold-22

Where `isPristine(basePath, relPath, language)` is called, it shall classify the target file against the recorded bundled history:

1. it returns `"missing"` when no file exists at `<basePath>/<relPath>`;
2. otherwise, it computes the canonical SHA-256 hash of the file's content and returns `"pristine"` when the hash is a member of the history for either the English base path or the caller-provided active-language overlay path ([[scaffold-21](#scaffold-21)]), or `"modified"` otherwise.

#### scaffold-23

Where `refreshPristineSeeds()` is called with a base path and active language, it shall, for each seed path returned by `getSeedSpecFiles()`, consult `isPristine` ([[scaffold-22](#scaffold-22)]) and refresh or report the seed:

- on `"pristine"`, when the target's canonical SHA-256 differs from the active-language bundled template's, it overwrites the target and reports the path with an `(updated)` indicator; when they match, it leaves the target unwritten and reports the path with an `(unchanged)` indicator;
- on `"modified"`, it leaves the target file unmodified and reports the path with a `(kept — user-modified)` indicator;
- on `"missing"`, it creates target parent directories as needed, writes the active-language bundled template, and reports the path with a `(created)` indicator — users who do not want a seed remove it after `--update`;
- when it receives migration context for a seed path, it combines the migration source(s) and seed refresh status into one indicator for that path, reporting only the migration source(s) if the migrated seed is already at the current bundled content;
- when it receives an indicator override for a user-modified seed (e.g. the restructured map of [[scaffold-41](#scaffold-41)] or a kept seed whose citations were rewritten by [[scaffold-40](#scaffold-40)]), the override text replaces `kept — user-modified` in that path's indicator.

#### scaffold-26

Where `migrateLegacyItemLayout()` is called with a base path, it shall move every file under `specs/items/user/`, `specs/items/dev/`, and `specs/items/test/` to the corresponding `specs/user/`, `specs/dev/`, and `specs/test/` path, preserving relative subpaths and file content:

- it creates target parent directories as needed;
- when the target path already exists, it leaves the legacy file unmodified and returns a conflict result identifying both paths without overwriting either file;
- when it moves a file, it returns a migration result identifying both the legacy and target paths;
- after successful moves, it removes empty legacy item directories;
- it does not alter files outside the legacy item directories, and it does not write to stdout — the caller owns per-file reporting;
- this migration remains part of `--update` permanently, so late upgraders from legacy layouts keep a supported path;
- it composes with the package-layout migration ([[scaffold-43](#scaffold-43)]) in a single run: files moved from `specs/items/` continue into `specs/packages/`, and indicators name the original `specs/items/` paths.

### Package Migration

#### scaffold-43

Where `migratePackageLayout()` is called with a base path, active language, and the provenance map of this run's `migrateLegacyItemLayout()` results, it shall implement [[scaffold-39](#scaffold-39)]:

- markdown files under `specs/user/`, `specs/dev/`, and `specs/test/` are grouped by their group-relative path, and each group becomes one target under `specs/packages/`;
- a target is written before its sources are deleted, so an interrupted run loses no bytes and a rerun picks up the remainder;
- legacy-pristine classification uses `isLegacyPristine()` ([[scaffold-47](#scaffold-47)]), and the all-pristine fast path writes the active-language bundled seed;
- returned results carry the target path, a status (`seeded`, `merged`, `moved`, or `conflict`), and the pre-run source paths with provenance composed, so indicators name the paths the user actually had, with conflict results naming the on-disk source paths;
- duplicate base heading anchors in merged output are returned for the caller's stderr note; the `-N` suffixes that renderers add to repeats are not treated as distinct anchors, and item IDs ending in `-N` are not misdetected as duplicates;
- it does not write to stdout — the caller owns per-file reporting.

#### scaffold-44

Where `mergePackageSources()` merges a package's legacy sources, it shall produce one markdown file with:

- the distinct leading HTML comment blocks (SPDX headers) of the sources;
- an H1 `# <pack>: <Title>` whose `<pack>` is the target file's basename [[meta-10](../meta.md#meta-10)], and whose `<Title>` keeps identical source titles, else the first source title stripped of group-role qualifiers, else the humanized file name;
- one `## Intent` holding each source's intent body with exact duplicates removed;
- the user, dev, and test source bodies under `## External Behavior`, `## Internal Behavior`, and `## Verification` respectively [[meta-30](../meta.md#meta-30)], with every heading demoted one level (setext headings rewritten as ATX; depth capped at six) and empty sections omitted;
- one trailing `## References` merging the sources' numeric reference definitions: renumbered sequentially, identical URL-plus-title definitions deduplicated, unused definitions kept, and every `[N]`-style marker in the moved content renumbered to match.

Notes:

- Body content moves byte-faithfully except for the heading, reference-number, and line-ending changes above — CRLF and CR line endings are normalized to LF — and `Verifies:` metadata blocks: each block, including wrapped continuation lines holding only citations and separators, collapses to one inline `Verifies …` sentence with no trailing separator.
- The rewrite preserves the declared relationships but does not place citations at the assertions they verify [[meta-20](../meta.md#meta-20)]; weaving them inline is reconciliation work for the merge prompt of [[scaffold-11](#scaffold-11)] step 7, and lint marks each unwoven sentence until then.
- Localized Intent and References section names from the bundled templates are recognized.

#### scaffold-45

Where `rewriteAllSpecCitations()` is called with a base path and the set of pre-run pristine framework/seed paths, it shall apply [[scaffold-40](#scaffold-40)] to every markdown file under `specs/` outside that set, returning the rewritten paths:

- only link, image, and reference-definition URLs and the enclosing brackets of item citations change; all other bytes are preserved;
- an edit is skipped when the raw link cannot be located verbatim inside the node's source span.

#### scaffold-46

Where `restructureMap()` is called with a map's text and the active language, it shall implement the transform of [[scaffold-41](#scaffold-41)] and return the new text, or null when nothing changed.

- Group tables are detected by their first-column cell values, not by localized header names, and the replacement `packages/` layout line comes from the active language.

#### scaffold-47

Where `getLegacyFileHistory(relPath)` is called, it shall load the bundled `scaffold/.legacy-file-history.json` manifest and return the recorded canonical hash history for that path, or an empty array when the path is absent or the manifest is missing.

- The legacy manifest holds exactly the previously bundled paths that no longer ship — the old `specs/user/`, `specs/dev/`, and `specs/test/` seeds and the retired `.gitkeep` placeholders of `specs/interactions/` and `specs/compositions/` — with their full hash histories, and it stays disjoint from the live manifest of [[scaffold-21](#scaffold-21)].
- Where `isLegacyPristine(basePath, relPath)` is called, it classifies the file at that path as `missing`, `pristine`, or `modified` against the legacy manifest using the canonical content hash of [[scaffold-21](#scaffold-21)].

### Update Orchestration

#### scaffold-15

Where `getGitRoot()` is called, it shall return the current git repository root, or throw an error when the current working directory is outside a git repository.

#### scaffold-16

Where `assertCleanSpecsTree()` is called with a base path, it shall verify that `git status --porcelain -- specs` is empty in that repository, or throw an error when the `specs/` working tree is not clean.

#### scaffold-17

Where `updateScaffoldTemplates()` is called on a clean `specs/` working tree, missing framework files shall not be a failed precondition: the CLI creates them from bundled templates through `overwriteFrameworkSpecFiles()` ([[scaffold-14](#scaffold-14)]).

#### scaffold-18

Where `updateScaffoldTemplates()` is called, it shall resolve the current git repository root, enforce update preconditions ([[scaffold-15](#scaffold-15)], [[scaffold-16](#scaffold-16)]), allow missing framework files ([[scaffold-17](#scaffold-17)]), and then run the update pipeline in order:

1. move `specs/iterations/` records to `specs/intents/` ([[scaffold-51](#scaffold-51)]) — a byte-preserving move that precedes the pristine snapshot;
2. snapshot the pristine state of every framework and seed path before any byte edits, so [[scaffold-40](#scaffold-40)] and [[scaffold-41](#scaffold-41)] never dirty a file that later steps replace wholesale;
3. migrate the legacy item layout ([[scaffold-26](#scaffold-26)]) and the package layout ([[scaffold-43](#scaffold-43)]);
4. fold `specs/interactions/` and `specs/compositions/` into `specs/packages/` ([[scaffold-50](#scaffold-50)], [[scaffold-53](#scaffold-53)]);
5. rewrite legacy citations ([[scaffold-45](#scaffold-45)]);
6. restructure a user-modified map ([[scaffold-46](#scaffold-46)]) and rename the map's iterations entries ([[scaffold-51](#scaffold-51)]);
7. overwrite framework files ([[scaffold-14](#scaffold-14)]);
8. refresh pristine seeds with the combined migration sources and indicator overrides ([[scaffold-23](#scaffold-23)]);
9. refresh existing agent files ([[scaffold-10](#scaffold-10)]);
10. read the bundled prompts from `scaffold/update-merge-prompt.md` and `scaffold/compositions-prompt.md`, and print the per-file indicators, clear completion message, and prompts specified by [[scaffold-11](#scaffold-11)] and [[scaffold-42](#scaffold-42)].

Notes:

- When `overwriteFrameworkSpecFiles()` ([[scaffold-14](#scaffold-14)]) returns one or more overwritten user-modified framework paths, the run prints a warning to stderr that names each such path and points the user to where the replaced content can be reviewed and reconciled (for example, `git diff -- specs` and git history); when that list is empty, no such warning is printed.
- The active language is read from `specs/meta.md` before bundled templates are selected — `en` when no authoring-language declaration is present — and passed to the framework overwrite and seed refresh helpers.

### Localization

#### scaffold-31

Where bundled scaffold content is resolved for a language, the resolver shall return the bundled file for that language:

- for `en`, the English file under `scaffold/`;
- for a non-English language, the overlay file `scaffold/i18n/<lang>/<relPath>` when it exists;
- otherwise, the English file under `scaffold/<relPath>`.

#### scaffold-32

Where a localized `meta.md` overlay exists, the overlay shall include every English `meta-*` item:

- for each untranslated item, the overlay item body remains byte-identical to the English item body;
- for each translated item, the overlay item carries the canonical SHA-256 hash of its English source item, so source changes cannot leave a stale translation undetected.

### Agent Spec Appending

#### scaffold-10

Where `appendAgentSpecs()` is called, it shall read `scaffold/agent-specs.txt` and process `CLAUDE.md` and `AGENTS.md` at the base path:

- when neither file exists, both are created, unless the caller passes `createMissing: false` (the `--update` flow), in which case absent files stay absent;
- when only one exists, only that file is updated;
- detection of an existing specs section uses a case-sensitive match on the heading `## Specs (Source of Truth)`; when found, the section is replaced in place and reported as updated, or skipped when the replacement is identical;
- when the heading is absent (including case mismatches), the content is appended to the file.

## Verification

### Update Coverage

#### scaffold-24

Where `--update` is exercised ([[scaffold-11](#scaffold-11)]), the test suite shall cover each row of the state matrix below — the framework ([[scaffold-14](#scaffold-14)]) and seed ([[scaffold-23](#scaffold-23)]) refresh paths — asserting both (a) the printed indicator for that path and (b) the post-run file-system state, so that an over-eager indicator cannot pass while bytes remain unchanged or vice versa.

- Hash comparisons use the canonical content hash from [[scaffold-21](#scaffold-21)].
- A text file with CRLF line endings and otherwise bundled-current content remains in the bundled-current cell and preserves its existing bytes.

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

#### scaffold-25

Where `--update` is exercised over any cell of the [[scaffold-24](#scaffold-24)] matrix, the test suite shall additionally assert that `(updated)` does not appear in the output for any path whose post-run content equals its pre-run content ([[scaffold-23](#scaffold-23)]), so that a regression to the prior over-eager indicator cannot pass.

#### scaffold-27

Where `--update` is exercised on a repository using the legacy `specs/items/user/`, `specs/items/dev/`, or `specs/items/test/` layout, the test suite shall assert that legacy item files chain through both migrations ([[scaffold-26](#scaffold-26)], [[scaffold-43](#scaffold-43)]) into `specs/packages/` in one run, that the indicators name the original `specs/items/` paths, and that the emptied `specs/items/` and group directories are removed.

- It covers both a recognized bundled legacy seed (asserting the target equals the current bundled package seed) and a custom item file (asserting its content survives the merge transform).

### Migration Coverage

#### scaffold-48

Where `--update` is exercised on a repository using the flat legacy `specs/user/`, `specs/dev/`, `specs/test/` layout ([[scaffold-39](#scaffold-39)]), the test suite shall run the real CLI and cover at least:

- all-pristine legacy seeds: the targets' bytes equal the current bundled package seeds ([[scaffold-43](#scaffold-43)]), one combined indicator names every source, and the legacy directories (including a pristine `.gitkeep`) are gone;
- a customized legacy seed: the target holds the merge transform of the user's content ([[scaffold-44](#scaffold-44)]) and the indicator combines the migration sources with `kept — user-modified`;
- a custom multi-file package: the merged target carries the Intent/External Behavior/Internal Behavior/Verification sections in order with demoted headings, and its `Verifies:` citations collapse to same-file anchors ([[scaffold-44](#scaffold-44)]);
- a conflicting target: every legacy source is kept byte-identical and reported, and the existing target is untouched ([[scaffold-43](#scaffold-43)]);
- indicator ordering: migration, conflict, and citation-rewrite lines precede framework and seed indicator lines ([[scaffold-11](#scaffold-11)] step 7);
- a second run after migration: no `migrated from` indicator and no byte changes;
- a zh tree: overlays refresh from the active language and the migrated tree lints clean.

#### scaffold-49

Where `--update` migrates packages, the test suite shall assert end to end that:

- citations in decision records and other spec files are rewritten to the `specs/packages/` paths and the enclosed item-citation form ([[scaffold-40](#scaffold-40)], [[scaffold-45](#scaffold-45)]) and reported as `(citations rewritten)`;
- a customized legacy-shape map is restructured in place — layout block lines replaced, group tables reshaped to one `File | Summary` row with `; `-joined summaries, no Compositions section appended — and reported as `(restructured for the packages layout)` ([[scaffold-41](#scaffold-41)], [[scaffold-46](#scaffold-46)]);
- a tree with `specs/interactions/` files has them moved to `specs/packages/` with citations, the map heading, and an `interactions/` layout-block line rewritten, a wrapped `Verifies:` block collapsing to one inline sentence, and the remaining lint errors confined to the moved files, whose inbound citations stay navigable through the rewrite ([[scaffold-50](#scaffold-50)]);
- a tree with `specs/compositions/` files has them folded into `specs/packages/` with citations, the map heading, and a `compositions/` layout-block line rewritten, and a pristine `compositions/.gitkeep` dropped ([[scaffold-53](#scaffold-53)]);
- the compositions prompt is printed after a migrating run ([[scaffold-42](#scaffold-42)]); a package-layout migration of pristine seeds leaves a tree `spex lint` passes with zero errors, and in custom content the converted `Verifies …` sentences are the only errors it reports;
- the packaged npm artifact ships both file-history manifests, both prompts ([[scaffold-42](#scaffold-42)]), and the bundled `specs/packages/` seeds.

#### scaffold-35

Where `--update` replaces a framework file, the test suite shall run the real CLI and cover both the warn and the quiet paths:

- given a framework file ([[scaffold-19](#scaffold-19)]) whose committed content matches no recognized bundled version, the suite asserts the run exits zero, the file's indicator is `(overwritten — user-modified)` with the bytes equal to the bundled current ([[scaffold-14](#scaffold-14)]), and a stderr warning names the file and points to reviewing and reconciling the replaced content ([[scaffold-11](#scaffold-11)]);
- given a pre-localization specs tree whose `specs/meta.md` is a recognized older bundled version carrying no authoring-language declaration, the suite asserts the run exits zero, refreshes `specs/meta.md` to the bundled current with an `(updated)` indicator ([[scaffold-18](#scaffold-18)]), and prints no replaced-user-content warning.

### License Coverage

#### scaffold-38

Where the `scaffold` subcommand creates a project, the test suite shall assert that a top-level `LICENSE` file is written whose bytes equal the bundled `scaffold/LICENSE` ([[scaffold-36](#scaffold-36)]), that its canonical content hash equals the authoritative Apache License 2.0 hash ([[scaffold-37](#scaffold-37)]), and that no `NOTICE` file is written.

- Where a `LICENSE` file already exists at the target root, the suite asserts that `scaffold` leaves its bytes unchanged and reports it with an `(already exists)` indicator ([[scaffold-36](#scaffold-36)]).

### Localization Coverage

#### scaffold-33

Where the `scaffold` subcommand is exercised with language selection, the test suite shall cover a Chinese fresh scaffold ([[scaffold-28](#scaffold-28)]), a localized update refresh on a Chinese specs tree, an unsupported language code ([[scaffold-28](#scaffold-28)]), a mismatched language on an existing scaffold ([[scaffold-29](#scaffold-29)]), and `--update` with `--lang` ([[scaffold-30](#scaffold-30)]):

- the Chinese fresh scaffold case asserts that localized overlay files are written for paths that have overlays and that fallback files remain byte-identical to their English bundled templates ([[scaffold-31](#scaffold-31)]);
- the localized update case asserts that `--update` on a Chinese specs tree ([[scaffold-30](#scaffold-30)]) refreshes a pristine framework ([[scaffold-14](#scaffold-14)]) or seed ([[scaffold-23](#scaffold-23)]) file from the active Chinese overlay ([[scaffold-18](#scaffold-18)]) rather than the English base template.

#### scaffold-34

Where a localized `meta.md` overlay ships, the test suite shall enforce its completeness, kept-English parity, and translated-item source hashes ([[scaffold-32](#scaffold-32)]).

## References

[1]: https://www.apache.org/licenses/LICENSE-2.0.txt "Apache License, Version 2.0"
