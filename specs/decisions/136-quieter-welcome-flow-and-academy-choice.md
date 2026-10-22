<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-136: Quieter Welcome Flow and Academy Choice

## Status

Accepted (2026-10-22) for the owner's P0-0 refinement.
Amends [DR-135](135-welcome-flow-copy-and-scoped-academy-note.md) in the welcome value explanation and Academy caption, and aligns the sidebar's project-add action with the welcome add flow.

## Context

- The stacked arrows make the specs-to-delivery path clear but give the supporting copy the weight of another set of actions.
- The two-line Academy caption hangs under the secondary action and makes the action row visually unbalanced.
- The Academy action already names an example project and does not promise a recorded replay.
- The sidebar's Projects plus currently opens the older switch-and-add palette, even though its plus icon promises adding a project.

## Decision

- The welcome keeps the specs-first headline and presents specs, playbooks, and delivery as three compact, connected steps with short labels and descriptions instead of large arrow-prefixed sentences.
- The page keeps the local-project primary action and Academy example secondary action without an Academy caption beneath the buttons.
- Academy remains an example project, and the action does not promise a recorded task replay.
- The sidebar's Projects plus opens the same local-project add form as the welcome action, even when projects are already registered; the project-switch shortcut keeps the searchable switcher.

## Consequences

- The value sequence remains scannable while the actions regain visual priority.
- The Academy button remains legible as a secondary path without a hanging caveat.
- Both add entrances use one form, while switching projects remains available separately.
