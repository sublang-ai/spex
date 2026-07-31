<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# LIST: Todo List

## Intent

This spec covers the task list itself: adding, completing, and
archiving tasks, and the order they are shown in.
The LIST package knows nothing about reminders or digests; it
can back any client that needs an ordered task list.

## External Behavior

### Task Lifecycle

#### LIST-1

When a user submits a non-empty task title, the list shall
append a new open task with that title and record its creation
time.

#### LIST-2

When a user completes an open task, the list shall mark it done
and stamp the completion time; completing an already-done task
shall change nothing.

#### LIST-3

When a user archives a done task, the list shall move it out of
the visible list into the archive. Archived tasks shall stay
retrievable. Archiving an open task shall be rejected with a
message naming the task.

### Ordering

#### LIST-4

The visible list shall present open tasks before done tasks,
each group ordered by creation time, oldest first
([LIST-1](#list-1)).

## Internal Behavior

#### LIST-5

The store shall persist every task mutation before reporting
success to the caller, so a crash never loses an acknowledged
change.

## Verification

### Lifecycle Coverage

#### LIST-6

Where a seeded list holds one open and one done task, the suite
shall assert: adding appends open tasks ([LIST-1](#list-1)),
completing stamps and is idempotent ([LIST-2](#list-2)),
archiving moves only done tasks ([LIST-3](#list-3)), and the
visible order holds ([LIST-4](#list-4)).
