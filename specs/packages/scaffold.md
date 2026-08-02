<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# scaffold: Scaffold CLI

## Intent

This spec defines the `scaffold` subcommand: its user-visible behavior, the implementation requirements behind it, and the integration coverage it needs — particularly for `--update` paths whose outcome depends on combinations of working-tree state, manifest history, and bundled content.

## External Behavior

### Target Resolution

#### scaffold-1

Where the `scaffold` subcommand is invoked with a `<path>` argument, the CLI shall create the specs directory structure inside the specified path:

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

1. Write every **framework file** from the bundled template, creating framework files that are missing in older specs trees:
   - when the framework file being replaced holds content that matches no recognized bundled version — a genuine user modification rather than an older pristine version — the CLI still replaces it, reports it with an `(overwritten — user-modified)` indicator, and warns clearly before completing, naming the file and pointing the user to where the change can be reviewed and reconciled;
   - unmodified and older-pristine framework files are replaced without this warning or indicator.
2. For every **seed file**, refresh it with the bundled template when the user has not customized it — that is, when the working-tree content matches a previously distributed bundled version of that file, or when the seed is absent:
   - customized seeds are left unmodified and reported as `(kept — user-modified)`;
   - absent seeds are reported as `(created)`;
   - users who do not want a refreshed or newly created seed remove it after `--update`.
3. Refresh the managed agent-instruction section of existing `CLAUDE.md`/`AGENTS.md` files per [[scaffold-5](#scaffold-5)] without creating absent ones.
4. Leave any file outside the framework and seed sets unmodified.
5. Print per-file indicators, a clear completion message that points to `spex lint`, a copy-paste-ready LLM merge prompt, and — on a tree carrying a legacy generation — the migration guidance of [[scaffold-26](#scaffold-26)]:
   - per-file indicators are the only path-level summary printed to stdout for the run, with exactly one indicator line per path, and no path summary follows the merge prompt or the guidance;
   - the stderr diagnostics of step 1 are not stdout path-level summaries and are exempt from this rule.

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
- Bundled support assets outside `scaffold/specs/` (for example, `scaffold/update-merge-prompt.md`, the file-history manifests, and `scaffold/LICENSE`) are not framework or seed files.
- The bundled root `scaffold/LICENSE` is emitted to the target root by [[scaffold-36](#scaffold-36)] on initial scaffold rather than refreshed by `--update`, and it is not localized.
- Localized overlay files under `scaffold/i18n/<lang>/` inherit the class of the target path they replace.

#### scaffold-26

Where `--update` targets a tree whose `specs/` carries a legacy generation — a legacy directory (`user/`, `dev/`, `test/`, `items/`, `interactions/`, `compositions/`, `iterations/`) or an old-generation marker — the CLI shall complete the template refresh ([[scaffold-11](#scaffold-11)]) and print migration guidance after the completion message:

- structural migration of a legacy generation is agent-skill work, not CLI code ([DR-021](../decisions/021-skill-based-migration.md)): the run moves, merges, rewrites, and deletes no legacy content;
- the guidance directs the user to the bundled `spec-structure-migration` skill (at `skills/spec-structure-migration/` in the spex repo) and its guide `docs/spec-migration.md`;
- the guidance names `spex lint` as the mechanical gate the migrated tree must pass;
- an old-generation marker is target content the bundled histories recognize as a retired generation — a `specs/meta.md` matching a pre-packages bundled version in its chronological history ([[scaffold-21](#scaffold-21)]), or content matching a retired bundled seed in the legacy manifest ([[scaffold-47](#scaffold-47)]).

#### scaffold-52

Where plain `scaffold` targets a tree whose `specs/` contains a legacy directory — `user/`, `dev/`, `test/`, `items/`, `interactions/`, `compositions/`, or `iterations/` — the CLI shall write nothing, exit non-zero, and direct the user to `spex scaffold --update` and its migration guidance ([[scaffold-26](#scaffold-26)]): creating current seed targets beside legacy files would entangle two spec generations before the migration skill has run.

### Language Selection

#### scaffold-28

Where the `scaffold` subcommand is invoked without `--update`, when `--lang <code>` is provided, the CLI shall generate localized bundled specs for that language:

- supported language codes are `en` and `zh`, with `zh` meaning Simplified Chinese;
- when `--lang` is omitted and no existing `specs/meta.md` declares an authoring language, the CLI uses `en`;
- when an unsupported language code is provided, the CLI exits non-zero and lists the supported language codes.

#### scaffold-29

Where the `scaffold` subcommand is invoked without `--update` while `specs/meta.md` exists, the CLI shall treat the existing authoring-language declaration as active, or `en` when no declaration is present:

- When an explicit `--lang` does not match the active language, the CLI exits non-zero without changing the existing scaffold.

#### scaffold-30

Where the `scaffold` subcommand is invoked with `--update`, the CLI shall reject `--lang` and exit non-zero:

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

Where `getScaffoldDir()` resolves the bundled scaffold path, it shall navigate from the `dist/` output directory up to the package root and return the `scaffold/` directory path:

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

Where `getFileHistory(relPath)` is called, it shall load the bundled file-history manifest at `scaffold/.file-history.json` and return the array of canonical SHA-256 content hashes recorded for that path, or an empty array when the path is not present:

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

#### scaffold-47

Where `getLegacyFileHistory(relPath)` is called, it shall load the bundled `scaffold/.legacy-file-history.json` manifest and return the recorded canonical hash history for that path, or an empty array when the path is absent or the manifest is missing:

- The legacy manifest holds exactly the previously bundled paths that no longer ship — the old `specs/user/`, `specs/dev/`, and `specs/test/` seeds and the retired `.gitkeep` placeholders of `specs/interactions/` and `specs/compositions/` — with their full hash histories, and it stays disjoint from the live manifest of [[scaffold-21](#scaffold-21)].
- Where `isLegacyPristine(basePath, relPath)` is called, it classifies the file at that path as `missing`, `pristine`, or `modified` against the legacy manifest using the canonical content hash of [[scaffold-21](#scaffold-21)].

#### scaffold-23

Where `refreshPristineSeeds()` is called with a base path and active language, it shall, for each seed path returned by `getSeedSpecFiles()`, consult `isPristine` ([[scaffold-22](#scaffold-22)]) and refresh or report the seed:

- on `"pristine"`, when the target's canonical SHA-256 differs from the active-language bundled template's, it overwrites the target and reports the path with an `(updated)` indicator; when they match, it leaves the target unwritten and reports the path with an `(unchanged)` indicator;
- on `"modified"`, it leaves the target file unmodified and reports the path with a `(kept — user-modified)` indicator;
- on `"missing"`, it creates target parent directories as needed, writes the active-language bundled template, and reports the path with a `(created)` indicator — users who do not want a seed remove it after `--update`.

### Update Orchestration

#### scaffold-15

Where `getGitRoot()` is called, it shall return the current git repository root, or throw an error when the current working directory is outside a git repository.

#### scaffold-16

Where `assertCleanSpecsTree()` is called with a base path, it shall verify that `git status --porcelain -- specs` is empty in that repository, or throw an error when the `specs/` working tree is not clean.

#### scaffold-17

Where `updateScaffoldTemplates()` is called on a clean `specs/` working tree, missing framework files shall not be a failed precondition: the CLI creates them from bundled templates through `overwriteFrameworkSpecFiles()` ([[scaffold-14](#scaffold-14)]).

#### scaffold-18

Where `updateScaffoldTemplates()` is called, it shall resolve the current git repository root, enforce update preconditions ([[scaffold-15](#scaffold-15)], [[scaffold-16](#scaffold-16)]), allow missing framework files ([[scaffold-17](#scaffold-17)]), and then run the update pipeline in order:

1. overwrite framework files ([[scaffold-14](#scaffold-14)]);
2. refresh pristine seeds ([[scaffold-23](#scaffold-23)]);
3. refresh existing agent files ([[scaffold-10](#scaffold-10)]);
4. read the bundled merge prompt from `scaffold/update-merge-prompt.md`, and print the per-file indicators, clear completion message, merge prompt, and legacy-generation migration guidance specified by [[scaffold-11](#scaffold-11)] and [[scaffold-26](#scaffold-26)].

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

Where `--update` is exercised ([[scaffold-11](#scaffold-11)]), the test suite shall cover each row of the state matrix below — the framework ([[scaffold-14](#scaffold-14)]) and seed ([[scaffold-23](#scaffold-23)]) refresh paths — asserting both (a) the printed indicator for that path and (b) the post-run file-system state, so that an over-eager indicator cannot pass while bytes remain unchanged or vice versa:

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

Where `--update` is exercised on a repository whose `specs/` contains a legacy directory, the test suite shall run the real CLI and assert the legacy-generation contract ([[scaffold-26](#scaffold-26)]):

- the run exits zero and completes the template refresh;
- the migration guidance prints after the completion message, naming the `spec-structure-migration` skill, the `docs/spec-migration.md` guide, and `spex lint` as the mechanical gate;
- every file under the legacy directories stays byte-identical and in place.

#### scaffold-35

Where `--update` replaces a framework file, the test suite shall run the real CLI and cover both the warn and the quiet paths:

- given a framework file ([[scaffold-19](#scaffold-19)]) whose committed content matches no recognized bundled version, the suite asserts the run exits zero, the file's indicator is `(overwritten — user-modified)` with the bytes equal to the bundled current ([[scaffold-14](#scaffold-14)]), and a stderr warning names the file and points to reviewing and reconciling the replaced content ([[scaffold-11](#scaffold-11)]);
- given a pre-localization specs tree whose `specs/meta.md` is a recognized older bundled version carrying no authoring-language declaration, the suite asserts the run exits zero, refreshes `specs/meta.md` to the bundled current with an `(updated)` indicator ([[scaffold-18](#scaffold-18)]), and prints no replaced-user-content warning.

### License Coverage

#### scaffold-38

Where the `scaffold` subcommand creates a project, the test suite shall assert that a top-level `LICENSE` file is written whose bytes equal the bundled `scaffold/LICENSE` ([[scaffold-36](#scaffold-36)]), that its canonical content hash equals the authoritative Apache License 2.0 hash ([[scaffold-37](#scaffold-37)]), and that no `NOTICE` file is written:

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
