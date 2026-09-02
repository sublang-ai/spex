<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-040: History Verdict Grammar

## Status

Done

## Intent

Render History rows by what they are — a check for done work, a struck title under a red bug tag for a fixed bug, a quiet dropped tag for abandoned work, the record's word for a superseded record — per [DR-038](../decisions/038-history-is-done-work.md).

## Deliverables

- [x] History rows carry the check, the bug tag with strike-through, the dropped tag, the record tag, and the superseded tag, in both themes.

## Tasks

1. UI: the row grammar with its accessible names and coverage.

## Verification

ui 263 green over fixture rows of each kind; live in light and dark: checks on done rows, the "superseded" tag dimmed, record IDs as mono tags opening the records reader; the bug strike and dropped tag verified in the vitest fixtures.
