<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Spec Map

Quick-reference index for locating spec files.
Spec items are the source of truth.

## Layout

```text
decisions/     Decision records (DRs)
intents/       Intent records (IRs)
packages/      Spec packages (one file per package)
compositions/  Cross-package compositions: scenarios, bindings, tests
map.md         This index
meta.md        The spec of specs
```

## Decisions

| ID | File | Summary |
| --- | --- | --- |
| DR-001 | [001-storage-choice.md](decisions/001-storage-choice.md) | Plain-file JSON store; no database until the digest ships |

## Intents

| ID | File | Goal |
| --- | --- | --- |
| IR-001 | [001-first-cut.md](intents/001-first-cut.md) | List CRUD and reminders proven end to end |

## Packages

| Short | File | Summary |
| --- | --- | --- |
| LIST | [todo-list.md](packages/todo-list.md) | Task list: add, complete, archive; ordering and overdue marking |
| REM | [reminders.md](packages/reminders.md) | Per-task reminders: schedule, fire, snooze |

## Compositions

| Short | File | Summary |
| --- | --- | --- |
| DIG | [daily-digest.md](compositions/daily-digest.md) | Binds list and reminders into the morning digest |
