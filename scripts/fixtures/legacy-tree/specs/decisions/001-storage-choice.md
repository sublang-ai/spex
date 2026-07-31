<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-001: Storage Choice

## Status

Accepted

## Context

The list must survive restarts from day one, but the project has
no operational budget for a database yet.
Options considered:

- SQLite — rejected for now: native-module build friction in the
  target environment.
- A hosted database — rejected: operational cost before the
  digest proves the product.
- A plain JSON file with atomic rewrites — chosen.

## Decision

- Tasks and reminders persist in one JSON file, rewritten
  atomically on every acknowledged mutation
  ([LIST-5](../packages/todo-list.md#list-5)).
- Revisit once the digest ships and real usage sizes the data.

## Consequences

- Zero external dependencies on day zero.
- Whole-file rewrites bound the list size; acceptable for a
  personal task list.
- A migration to a database is a later decision record.
