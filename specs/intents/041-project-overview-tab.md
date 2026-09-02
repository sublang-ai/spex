<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-041: The Project Overview Tab

## Status

Done

## Intent

Replace the Workspace's Repo tab with an Overview tab drawing the project's ledger group under its repository header, one component with the Dashboard, per [DR-038](../decisions/038-history-is-done-work.md).

## Deliverables

- [x] The pinned tab reads Overview; the ledger group and the repository header render there; the Repo tab retires.
- [x] The Sources empty state carries the GitHub setup guidance in place.

## Tasks

1. UI: the shared ledger-group component and the Overview tab with the repository header; tests and shortcuts follow.

## Verification

ui 263 green; live: the pinned tab reads Overview and shows the repository header (branch, dirty state, GitHub slug, path, refresh, Remove project) over History, Now, Up next, and Sources for the current project, with no project filter; the Repo tab is gone.
