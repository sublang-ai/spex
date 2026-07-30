<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-006: Projects and Forge

## Status

Done

## Intent

Implement the Projects surface per the projects spec package: git-aware project registration and creation, repo state cards, and the gh-CLI GitHub forge adapter behind the adapter interface ([DR-006](../decisions/006-projects-and-forge.md)).

## Deliverables

- [x] Core git module: work-tree validation, branch/dirty/ahead-behind status via local git only
- [x] Core create flow: git init + optional spex scaffold + initial commit
- [x] Forge adapter interface with the gh-CLI GitHub adapter (auth status, repo binding from origin, issues, PRs)
- [x] Protocol commands: project.create, project.status, forge.items
- [x] Projects UI: status-rich cards, forge panels with guidance states, create-new flow
- [x] Tests per projects test items with a fixture repo and stubbed gh

## Tasks

1. **Core git + forge modules** — injectable command runner; registration validates a git work-tree root [[projects-1](../packages/projects.md#projects-1)]; status from local git [[projects-3](../packages/projects.md#projects-3)], [[projects-11](../packages/projects.md#projects-11)]; gh adapter with JSON output and no credential storage [[projects-13](../packages/projects.md#projects-13)].

2. **Protocol + service handlers** — project.create/status and forge.items with bounded caching [[projects-12](../packages/projects.md#projects-12)].

3. **Projects UI** — cards with branch/dirty/ahead-behind, forge panel (issues/PRs or setup guidance), create-new flow [[projects-2](../packages/projects.md#projects-2)]..[[projects-8](../packages/projects.md#projects-8)].

4. **Tests** — fixture-repo registration and status, create flow, stubbed-gh forge states, removal keeps disk [[projects-16](../packages/projects.md#projects-16)]..[[projects-19](../packages/projects.md#projects-19)].

## Verification

- Root build/test green including new coverage.
- Registering a non-repo directory is rejected with guidance; a fixture repo yields correct card state.
- With gh stubbed authenticated, issues/PRs render; with gh absent, panels degrade to guidance and everything else works.
