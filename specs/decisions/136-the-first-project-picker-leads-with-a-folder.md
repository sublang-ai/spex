<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-136: The First Project Picker Leads With a Folder

## Status

Accepted (2026-10-22).
Amends [DR-011](011-project-workspace.md), [DR-135](135-a-welcome-page-before-the-first-project.md).
Amended by [DR-137](137-specs-first-welcome-and-distinct-project-paths.md), [DR-142](142-desktop-existing-projects-use-folder-picker.md).

## Context

- The first-project palette gives a plain folder row less visual weight than its focused path field, even though the native folder picker is the simplest desktop route.
- Existing-project registration and new-project creation share one path row, leaving their different effects unclear.
- The welcome page's own-project action reads less clearly than the action it opens.

## Decision

- Amends [DR-135](135-a-welcome-page-before-the-first-project.md) in the own-project entry and [DR-011](011-project-workspace.md) in that palette entry alone.
- The welcome page names its own-project action "Add a local project".
- That action opens the existing palette in a first-project layout with distinct existing-project and new-project routes ([DR-137](137-specs-first-welcome-and-distinct-project-paths.md)).
- On desktop, a "Choose a project folder" action leads and receives focus, the only way to add an existing repository there ([DR-142](142-desktop-existing-projects-use-folder-picker.md)).
- Where no native folder picker exists, the existing-project path receives focus instead.
- New-project creation expands its own path and specs-scaffold option within the same palette, without a separate wizard.
- The ordinary palette for switching among registered projects retains its keyboard and list behavior.

## Consequences

- The first-project choice makes the simplest desktop action visible and keeps registration distinct from repository creation.
