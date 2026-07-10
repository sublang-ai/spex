<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# PROJ: Projects Acceptance Tests

## Intent

This spec defines required integration coverage for the Projects
surface: registration and card state against fixture repositories,
the create-project flow, forge panels against a stubbed gh CLI, and
removal without touching the repository on disk.

## Registration and Card Coverage

### PROJ-17
Verifies: [PROJ-1](../user/projects.md#proj-1), [PROJ-2](../user/projects.md#proj-2), [PROJ-4](../user/projects.md#proj-4), [PROJ-11](../dev/projects.md#proj-11)

Where a fixture git repository exists with a named branch checked
out, an uncommitted change, and a local upstream remote that it is
ahead of and behind by known commit counts, when the repository is
registered through the registration flow, the test suite shall
assert that a project card appears showing the project name, the
absolute path, the branch name, a dirty indicator, and the expected
ahead/behind counts, collected without any network access.

The test suite shall also assert that confirming the same path
again creates no duplicate entry, and that confirming a directory
that is not the top level of a git work tree is rejected with a
message and creates no project entry.

### PROJ-18
Verifies: [PROJ-3](../user/projects.md#proj-3)

Where a temporary parent directory exists, when the create-project
flow completes with the scaffold option on, the test suite shall
assert that the project directory exists, is the top level of a git
work tree, contains the generated specs scaffold, and has an
initial commit containing the generated files, and that a project
card for it appears.

When the flow completes with the scaffold option off, the test
suite shall assert that the directory, git repository, initial
commit, and project card still result while no specs scaffold is
generated.

## Forge Coverage

### PROJ-19
Verifies: [PROJ-5](../user/projects.md#proj-5), [PROJ-6](../user/projects.md#proj-6), [PROJ-13](../dev/projects.md#proj-13), [PROJ-15](../dev/projects.md#proj-15)

Where a registered fixture repository's `origin` remote points at a
GitHub repository, and a stub `gh` executable on `PATH` reports an
authenticated account and returns fixture JSON for issue and
pull-request listings, when the project's forge panel is loaded,
the test suite shall assert that the panel shows the bound
`owner/repo` derived from the remote, the authenticated account,
and the fixture issues and pull requests with their numbers and
titles, and that activating an entry passes that entry's GitHub URL
to the stubbed browser opener.

### PROJ-20
Verifies: [PROJ-7](../user/projects.md#proj-7), [PROJ-16](../dev/projects.md#proj-16)

Where the stub `gh` reports a not-authenticated state, or `gh` is
absent from `PATH`, or the registered repository has no GitHub
`origin` remote, when the project's forge panel is loaded, the test
suite shall assert that setup guidance naming the specific unmet
condition is shown instead of issue and pull-request lists, that
the project card still shows repository state, and that the core
keeps serving subsequent commands.

## Removal Coverage

### PROJ-21
Verifies: [PROJ-9](../user/projects.md#proj-9), [PROJ-10](../dev/projects.md#proj-10)

Where a fixture repository is registered, when the project is
removed and the core service is restarted, the test suite shall
assert that no project card or registry entry for it remains after
the restart, and that the repository directory's files and git
state are identical to their state before removal.
