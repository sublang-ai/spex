<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-133: The First Project Picker Leads With a Folder

## Status

Accepted (2026-10-22) for the owner's P0-0 iteration.
Amends [DR-132](132-a-welcome-page-before-the-first-project.md) in the own-project entry and [DR-011](011-project-workspace.md) in that palette entry alone.
The folder treatment and distinction between existing and new paths are amended by [DR-134](134-specs-first-welcome-and-distinct-project-paths.md).

## Context

- The first-project palette gives a plain folder row less visual weight than its focused path field, even though the native folder picker is the simplest desktop route.
- Existing-project registration and new-project creation share one path row, leaving their different effects unclear.
- The welcome page's own-project action reads less clearly than the action it opens.

## Decision

- The welcome page names its own-project action "Add a local project".
- That action opens the existing palette in a first-project layout with separate existing-project and new-project sections.
- On desktop, a prominent "Choose a project folder" action leads and receives focus; manual path entry is an alternative for an existing repository.
- Where no native folder picker exists, the existing-project path receives focus instead.
- New-project creation expands its own path and specs-scaffold option within the same palette, without a separate wizard.
- The ordinary palette for switching among registered projects retains its current keyboard and list behavior.

## Consequences

- The first-project choice makes the simplest desktop action visible and keeps registration distinct from repository creation.
- The welcome page's Academy versus local-project prominence remains a separate decision.
