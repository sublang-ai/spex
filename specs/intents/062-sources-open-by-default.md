<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-062: Sources Open by Default

## Status

In progress.

## Intent

A project group's Sources band opens expanded, its three tabs in view, so a first-time reader learns that issues, pull requests, and open records are there to queue from; the reader can still fold it to its one-line summary, and the fold is remembered per project while the app runs ([DR-038](../decisions/038-history-is-done-work.md)).

## Deliverables

- [ ] The Sources band renders expanded by default with its tabs and first page; the summary line stays as its header and folds it on demand (dashboard-20).
- [ ] The fold is remembered per project while the app runs and applies to the Dashboard group and the project's Overview alike (dashboard-20).
- [ ] Unit coverage and the Dashboard journeys updated.

## Tasks

1. Default expanded, fold remembered per project; spec item amended.
2. Tests and journeys.

## Verification

Recorded on completion.
