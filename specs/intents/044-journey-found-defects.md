<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-044: Defects the Journeys Found

## Status

Done

## Intent

Fix what the first browser journeys and the accessibility scan surfaced, so a first-time user is never stranded and the interface holds [DR-010](../decisions/010-interface-craft.md)'s accessibility law.

## Deliverables

- [x] A page that never reaches its core says so: the endpoint named with a Retry after a few seconds, and "Connecting" rather than "Reconnecting" on a first boot.
- [x] GitHub state named where it matters: the collapsed Sources line reads "GitHub not connected" instead of zero counts, and the Overview header carries the guidance.
- [x] Add never initializes a repository: a non-repo path is refused with the way to Create.
- [x] Adding a player never overwrites one: an existing id is turned back to its editor.
- [x] The tab strip is one valid tablist; close controls leave the accessibility tree and Delete closes a focused tab.
- [x] Muted text moves up one contrast step app-wide; the composer drops the ARIA attributes a textbox may not carry; the notification selects and the graph separator carry their names and values.
- [x] The live region no longer announces "restored" on the first connection.

## Tasks

1. Connection banner and placeholders.
2. Sources summary and Overview header.
3. Palette add path; Settings player add.
4. Tab strip, contrast pass, ARIA fixes.

## Verification

The journeys `run-view-100`, `projects-28`, `dashboard-39`, `settings-29`, and `run-view-102` (light and dark, no serious or critical axe violation) green; ui 263 green.
