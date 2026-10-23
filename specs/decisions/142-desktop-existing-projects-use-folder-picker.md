<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-142: Desktop Existing Projects Use the Folder Picker

## Status

Accepted (2026-10-22) for the owner's P0-0 project-add review.
Amends [DR-136](136-the-first-project-picker-leads-with-a-folder.md) and [DR-137](137-specs-first-welcome-and-distinct-project-paths.md) for existing-repository entry on desktop.

## Context

- The desktop add form still exposes a manual existing-repository path beneath the folder picker. The owner wants one clear way to add an existing local project.
- The ordinary project switcher also has a typed-path Add action. Keeping that path on desktop would make the add form's folder-only rule inconsistent.
- The browser shell has no native folder picker and still needs a path entry.

## Decision

- Where the native folder picker exists, both the local-project add form and the ordinary project switcher add an existing repository only through that picker. The add form keeps its separate new-project path and optional specs scaffold.
- The desktop switcher keeps project search, Academy, and the folder action; creating a new project remains available in the local-project add form from the sidebar.
- Where no native picker exists, the add form and ordinary palette keep path entry for existing repositories. The add form keeps existing and new path entry distinct.
- Choosing a folder still uses the existing project-registration action and preserves its Git validation and refusal behavior.

## Consequences

- Desktop readers no longer need to decide between a folder action and an almost identical path field for an existing project.
- Browser readers retain a usable project-add route without introducing a separate wizard.
