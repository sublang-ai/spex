<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-071: The Sidebar's Selection Follows the Surface

## Status

Done.

## Intent

The sidebar shows one place as current — the surface the reader is on — so a project row reads as selected only while its workspace is the surface, and Playbooks, Settings, or the Dashboard never leave a project row highlighted beside their own lit entry ([DR-029](../decisions/029-session-history-home.md), [DR-030](../decisions/030-workspace-chrome.md)); the remembered current project still opens when Workspace is chosen again.

## Deliverables

- [x] While the Dashboard, Playbooks, or Settings is the surface, no project or session row carries the selected state; the surface's own entry does; choosing Workspace restores the remembered project's selection (run-view sidebar items).
- [x] Unit coverage of the selection per surface and one browser journey clicking Playbooks and asserting the project row is not selected.

## Tasks

1. Selection derived from the surface; spec item amended; tests and the journey.

## Verification

- Selection is derived from the surface in the sidebar's tree, so the current project's row and its shown session's row carry it only while the Workspace is the surface (run-view-67).
- `cd packages/ui && npx vitest run` — 25 files, 424 tests pass, including the new `run-view-70` case: both rows selected on the Workspace, no row selected on Playbooks with its entry alone current, and the remembered project selected again on return (it fails against the pre-change component).
- `npx tsc --noEmit -p packages/ui` and `npx tsc --noEmit -p e2e` — clean.
- `cd e2e && npx playwright test` — 37 journeys pass, `fit.spec.ts` and `a11y.spec.ts` included, with the new `run-view-122` journey clicking Dashboard, Playbooks, and back to the Workspace through the page.
- `npm test --workspaces --if-present` — every workspace green.
- `node packages/cli/dist/cli.js lint` — no problems found.
