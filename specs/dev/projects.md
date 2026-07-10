<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# PROJ: Projects Implementation Requirements

## Intent

This spec defines implementation requirements for the Projects
surface inside the core service of
[DR-002](../decisions/002-desktop-app-architecture.md): registry
persistence in the app-local SQLite store of
[DR-004](../decisions/004-config-and-persistence.md), repository
state from local git only, and forge access exclusively through the
forge adapter interface of
[DR-006](../decisions/006-projects-and-forge.md).

## Registry

### PROJ-10

Where the core service manages projects, the project registry shall
persist one entry per project — identifier, display name, absolute
repository path, and creation time — in the app-local SQLite store
([DR-004](../decisions/004-config-and-persistence.md)), and shall
restore all entries on core startup so registered projects survive
app restarts.

When a project is removed, the project registry shall delete only
that project's registry entries; it shall not delete or modify any
file under the repository path.

## Repository State

### PROJ-11

Where project repository state is collected — current branch or
detached HEAD, dirty flag, ahead/behind counts, and `origin` remote
URL — the repo-state provider shall obtain it exclusively by
running local git commands against the project work tree.

The repo-state provider shall perform no network operation while
collecting state, so ahead/behind counts reflect the locally
recorded upstream ref.

### PROJ-12

While projects are registered, when the app window gains focus,
and on a periodic interval bounded between 10 seconds and 5
minutes, the repo-state provider shall refresh the projects'
repository state.

When a refresh attempt fails for a project, the repo-state provider
shall keep that project's last successfully collected state
available, marked stale, and shall not terminate the core service.

## Forge Access

### PROJ-13

Where a project's `origin` remote URL matches a GitHub HTTPS or SSH
remote form, the binding detector shall derive the bound
`owner/repo` from the URL.

Where a project has no `origin` remote, or its URL matches neither
form, the binding detector shall report the project as unbound
rather than guessing a binding.

### PROJ-14

Where core code needs forge data or forge authentication status,
the core service shall obtain it exclusively through the forge
adapter interface of
[DR-006](../decisions/006-projects-and-forge.md); no module outside
adapter implementations shall invoke a forge CLI or forge HTTP API
directly, so further forges can be added without changing callers.

### PROJ-15

Where the GitHub forge adapter performs an operation — auth status,
issue listing, or pull-request listing — it shall shell out to the
locally authenticated `gh` CLI [[1]] requesting machine-readable
JSON output, and parse that output.

The GitHub forge adapter shall never read, persist, or log tokens
or other credentials; authentication state shall remain solely in
gh's own storage.

### PROJ-16

When a forge adapter operation fails — executable missing, not
authenticated, network failure, non-zero exit, or unparsable
output — the forge adapter shall return a typed failure carrying a
condition category and human-readable guidance.

The core service shall forward that guidance as the forge panel
state for the affected project and shall neither crash nor stop
serving the project's other state.

## References

[1]: https://cli.github.com/manual/ "GitHub CLI manual"
