<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-006: Projects and Forge

## Goal

Implement the Projects surface per the PROJ spec package: git-aware
project registration and creation, repo state cards, and the gh-CLI
GitHub forge adapter behind the adapter interface (DR-006).

## Deliverables

- [x] Core git module: work-tree validation, branch/dirty/
  ahead-behind status via local git only
- [x] Core create flow: git init + optional spex scaffold + initial
  commit
- [x] Forge adapter interface with the gh-CLI GitHub adapter
  (auth status, repo binding from origin, issues, PRs)
- [x] Protocol commands: project.create, project.status, forge.items
- [x] Projects UI: status-rich cards, forge panels with guidance
  states, create-new flow
- [x] Tests per PROJ test items with a fixture repo and stubbed gh

## Tasks

1. **Core git + forge modules** — injectable command runner;
   registration validates a git work-tree root
   ([PROJ-1](../user/projects.md#proj-1)); status from local git
   ([PROJ-3](../user/projects.md#proj-3),
   [PROJ-11](../dev/projects.md#proj-11)); gh adapter with JSON
   output and no credential storage
   ([PROJ-13](../dev/projects.md#proj-13)).

2. **Protocol + service handlers** — project.create/status and
   forge.items with bounded caching
   ([PROJ-12](../dev/projects.md#proj-12)).

3. **Projects UI** — cards with branch/dirty/ahead-behind, forge
   panel (issues/PRs or setup guidance), create-new flow
   ([PROJ-2..8](../user/projects.md)).

4. **Tests** — fixture-repo registration and status, create flow,
   stubbed-gh forge states, removal keeps disk
   ([PROJ-16..19](../test/projects.md)).

## Acceptance criteria

- Root build/test green including new coverage.
- Registering a non-repo directory is rejected with guidance; a
  fixture repo yields correct card state.
- With gh stubbed authenticated, issues/PRs render; with gh absent,
  panels degrade to guidance and everything else works.
