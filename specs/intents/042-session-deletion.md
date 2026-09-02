<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-042: Session Deletion

## Status

Done

## Intent

Let an ended Spex session be deleted from the sidebar, with one inline confirmation, removing its files and every trace while foreign sessions stay served, per [DR-038](../decisions/038-history-is-done-work.md).

## Deliverables

- [x] `session.delete` in the core with the live and foreign refusals, file removal, and the removed broadcast.
- [x] The sidebar's delete control with its inline confirmation; the tab closes and the lists update.

## Tasks

1. Core: the command, the store's deletion, the broadcast, and coverage.
2. UI: the row control, confirmation, and reaction to the broadcast.

## Verification

core 171 (core-service-71: an ended session deletes with files gone and the removal broadcast, a live one refuses busy, a foreign one refuses with files byte-identical) and ui 263 green; live: the trash control appears on hover over an ended Spex session and not over the CLI-written ones.
