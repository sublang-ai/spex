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
`items/user/`, `items/dev/`, and `items/test/` under the resolved
base path.

## Template Copying

### SCAF-8

Where `copyTemplates()` is called, it shall recursively copy files
from the bundled `scaffold/specs/` directory to the target `specs/`
directory. Files that already exist at the destination shall not be
overwritten.

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

Where `overwriteFrameworkSpecFiles()` is called with a base path,
it shall overwrite each target file returned by
`getFrameworkSpecFiles()` with the corresponding bundled template
and report each overwritten file with an `(updated)` indicator.

### SCAF-20

Where `getSeedSpecFiles()` is called, it shall return the file
paths classified as **seed** by
[SCAF-19](../user/scaffold.md#scaf-19), relative to the target
repository root, using POSIX path separators.

### SCAF-21

Where `getFileHistory(relPath)` is called, it shall load the
bundled file-history manifest at `scaffold/.file-history.json`
and return the array of SHA-256 content hashes recorded for that
path, or an empty array when the path is not present.

The manifest shall satisfy the following invariants:

- It shall contain an entry for every file under `scaffold/specs/`,
  regardless of framework/seed classification, so that any caller
  can detect whether a target file matches a previously
  distributed bundled version.
- Each entry's hash array shall be ordered chronologically across
  published versions, with the SHA-256 of the current bundled
  content as its final entry, and shall include the SHA-256 of
  every prior published version so that users upgrading from any
  prior published version are recognized as pristine.

The manifest schema shall be a flat JSON object mapping POSIX
relative paths to arrays of `sha256-`-prefixed hex strings, e.g.:

```json
{
  "specs/items/dev/git.md": ["sha256-...", "sha256-..."]
}
```

### SCAF-22

Where `isPristine(basePath, relPath)` is called, it shall:

1. Return `"missing"` when no file exists at `<basePath>/<relPath>`.
2. Otherwise, compute the SHA-256 hash of the file's content and
   return `"pristine"` when the hash is a member of the array
   returned by `getFileHistory(relPath)` ([SCAF-21](#scaf-21)),
   or `"modified"` otherwise.

### SCAF-23

Where `refreshPristineSeeds()` is called with a base path, it
shall, for each seed path returned by `getSeedSpecFiles()`,
consult `isPristine` ([SCAF-22](#scaf-22)) and:

- On `"pristine"`, overwrite the target file with the bundled
  template and report the path with an `(updated)` indicator.
- On `"modified"`, leave the target file unmodified and report
  the path with a `(kept — user-modified)` indicator.
- On `"missing"`, leave the target absent and report the path
  with a `(kept — missing)` indicator, so that seeds the user
  has deliberately deleted are not resurrected.

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

Where `assertFrameworkFilesTracked()` is called with a base path,
it shall verify that every path returned by
`getFrameworkSpecFiles()` exists in `HEAD`, or throw an error
listing the missing paths.

### SCAF-18

Where `updateScaffoldTemplates()` is called, it shall resolve the
current git repository root, enforce update preconditions
([SCAF-15](#scaf-15), [SCAF-16](#scaf-16),
[SCAF-17](#scaf-17)), overwrite framework files
([SCAF-14](#scaf-14)), refresh pristine seeds
([SCAF-23](#scaf-23)), and print the merge prompt specified by
[SCAF-11](../user/scaffold.md#scaf-11) tailored to the set of
files actually modified.

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
