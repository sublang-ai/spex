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

Where `getScaffoldSpecFiles()` is called, it shall resolve the
bundled `scaffold/specs/` directory and return the scaffold-provided
file paths relative to the target repository root, using POSIX path
separators and excluding `.DS_Store` entries.

### SCAF-14

Where `overwriteScaffoldSpecFiles()` is called with a base path, it
shall overwrite each target file returned by `getScaffoldSpecFiles()`
with the corresponding bundled template and report each overwritten
file with an `(updated)` indicator.

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

Where `assertScaffoldFilesTracked()` is called with a base path, it
shall verify that every path returned by `getScaffoldSpecFiles()`
exists in `HEAD`, or throw an error listing the missing paths.

### SCAF-18

Where `updateScaffoldTemplates()` is called, it shall resolve the
current git repository root, enforce update preconditions, overwrite
scaffold-provided files, and print the merge prompt specified by
[SCAF-11](../user/scaffold.md#scaf-11).

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
