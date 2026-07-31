<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-001: First Cut

## Goal

A user can keep a task list and get the morning digest.
Lands the LIST and REM packages and the daily-digest
composition.

## Deliverables

- [x] Task add, complete, archive with persistent ordering (LIST)
- [x] Reminder schedule, fire, snooze (REM)
- [ ] Digest delivery at the configured hour (DIG)

## Tasks

1. Implement the JSON store and the task lifecycle.
2. Implement reminders over the store.
3. Bind the digest and stand up the acceptance suite.

## Acceptance criteria

- LIST-6 and REM-4 pass.
- DIG-3 passes against a seeded deployment.
