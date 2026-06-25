<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# SCAF: Scaffold Implementation Requirements

## Intent

This spec defines implementation requirements for the
`scaffold` subcommand.

## Directory Structure

### SCAF-7

Where `createSpecsStructure()` is called, it shall create a
`specs/` directory with subdirectories `decisions/`, `iterations/`,
`user/`, `dev/`, and `test/` under the resolved
base path.

## Template Copying

### SCAF-8

Where `copyTemplates()` is called, it shall recursively copy files
from the bundled `scaffold/specs/` directory to the target `specs/`
directory. Files that already exist at the destination shall not be
overwritten.

When a language is provided by the caller, `copyTemplates()` shall
resolve bundled content using [SCAF-31](#scaf-31).

### SCAF-9

Where `getScaffoldDir()` resolves the bundled scaffold path, it
shall navigate from the `dist/` output directory up to the package
root and return the `scaffold/` directory path.

### SCAF-13

Where `getFrameworkSpecFiles()` is called, it shall return the
file paths classified as **framework** by
[SCAF-19](../user/scaffold.md#scaf-19), relative to the target
repository root, using POSIX path separators.

### SCAF-14

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
([SCAF-19](../user/scaffold.md#scaf-19)); the `"modified"` case still
overwrites. The returned list of overwritten user-modified paths drives
the warning required by [SCAF-18](#scaf-18). The list shall be empty
when no target was overwritten while user-modified.

### SCAF-20

Where `getSeedSpecFiles()` is called, it shall return the file
paths classified as **seed** by
[SCAF-19](../user/scaffold.md#scaf-19), relative to the target
repository root, using POSIX path separators.

### SCAF-21

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

### SCAF-22

Where `isPristine(basePath, relPath, language)` is called, it shall:

1. Return `"missing"` when no file exists at `<basePath>/<relPath>`.
2. Otherwise, compute the canonical SHA-256 hash of the file's
   content and return `"pristine"` when the hash is a member of
   the history for either the English base path or the
   caller-provided active-language overlay path
   ([SCAF-21](#scaf-21)), or `"modified"` otherwise.

### SCAF-23

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
path, it shall combine the migration source and seed refresh status
into one indicator for that path. If the migrated seed is already at
the current bundled content, the indicator shall only report the
migration source.

### SCAF-26

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

## Update Orchestration

### SCAF-15

Where `getGitRoot()` is called, it shall return the current git
repository root, or throw an error when the current working directory
is outside a git repository.

### SCAF-16

Where `assertCleanSpecsTree()` is called with a base path, it shall
verify that `git status --porcelain -- specs` is empty in that
repository, or throw an error when the `specs/` working tree is not
clean.

### SCAF-17

Where `updateScaffoldTemplates()` is called on a clean `specs/`
working tree, missing framework files shall not be a failed
precondition.
The CLI shall create them from bundled templates through
`overwriteFrameworkSpecFiles()` ([SCAF-14](#scaf-14)).

### SCAF-18

Where `updateScaffoldTemplates()` is called, it shall resolve the
current git repository root, enforce update preconditions
([SCAF-15](#scaf-15), [SCAF-16](#scaf-16)), allow missing
framework files ([SCAF-17](#scaf-17)), migrate legacy item layout
([SCAF-26](#scaf-26)), overwrite framework files
([SCAF-14](#scaf-14)), refresh pristine seeds
([SCAF-23](#scaf-23)), read the bundled merge prompt from
`scaffold/update-merge-prompt.md`, and print the per-file
indicators, clear completion message, and merge prompt specified
by [SCAF-11](../user/scaffold.md#scaf-11).

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

## Localization

### SCAF-31

Where bundled scaffold content is resolved for language `en`, the
resolver shall return the English file under `scaffold/`.

Where bundled scaffold content is resolved for a non-English language,
when `scaffold/i18n/<lang>/<relPath>` exists, the resolver shall
return that overlay file.

Where no overlay file exists, the resolver shall return the English
file under `scaffold/<relPath>`.

### SCAF-32

Where a localized `meta.md` overlay exists, the overlay shall include
every English `META-*` item.

For each untranslated item, the overlay item body shall remain
byte-identical to the English item body.

For each translated item, the overlay item shall carry the canonical
SHA-256 hash of its English source item so source changes cannot leave
a stale translation undetected.

## Agent Spec Appending

### SCAF-10

Where `appendAgentSpecs()` is called, it shall read
`scaffold/agent-specs.txt` and process `CLAUDE.md` and `AGENTS.md`
at the base path. When neither file exists, both shall be created;
when only one exists, only that file shall be updated. Detection of
an existing specs section shall use
a case-sensitive match on the heading `## Specs (Source of Truth)`;
when found, the section shall be replaced in place and reported as
updated, or skipped when the replacement is identical. When the
heading is absent (including case mismatches), the content shall be
appended to the file.
