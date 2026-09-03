<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-071: The Sidebar's Selection Follows the Surface

## Status

In progress.

## Intent

The sidebar shows one place as current — the surface the reader is on — so a project row reads as selected only while its workspace is the surface, and Playbooks, Settings, or the Dashboard never leave a project row highlighted beside their own lit entry ([DR-029](../decisions/029-session-history-home.md), [DR-030](../decisions/030-workspace-chrome.md)); the remembered current project still opens when Workspace is chosen again.

## Deliverables

- [ ] While the Dashboard, Playbooks, or Settings is the surface, no project or session row carries the selected state; the surface's own entry does; choosing Workspace restores the remembered project's selection (run-view sidebar items).
- [ ] Unit coverage of the selection per surface and one browser journey clicking Playbooks and asserting the project row is not selected.

## Tasks

1. Selection derived from the surface; spec item amended; tests and the journey.

## Verification

Recorded on completion.
