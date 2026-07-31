<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# REM: Reminders

## Intent

This spec covers per-task reminders: scheduling one against a
task, firing it, and snoozing it.
The REM package holds only the schedule; what a fired reminder
looks like to the user is the composition's concern.

## External Behavior

### Scheduling

#### REM-1

When a user sets a reminder time on an open task
([LIST-1](todo-list.md#list-1)), the reminders package shall
record exactly one pending reminder for that task, replacing any
earlier one.

#### REM-2

When a reminder's time arrives while its task is still open, the
reminders package shall fire it once and mark it fired;
reminders on done tasks ([LIST-2](todo-list.md#list-2)) shall be
discarded unfired.

#### REM-3

When a user snoozes a fired reminder, the reminders package
shall re-schedule it for the snooze interval and return it to
pending.

## Verification

### Firing Coverage

#### REM-4

Where a task has a pending reminder set for a past instant, the
suite shall assert the reminder fires once ([REM-2](#rem-2)),
snoozing returns it to pending ([REM-3](#rem-3)), and completing
the task discards it ([LIST-2](todo-list.md#list-2),
[REM-2](#rem-2)).
