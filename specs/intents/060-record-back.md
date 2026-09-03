<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-060: Back Returns to the Record's Origin

## Status

Done.

## Intent

A record opened from the Dashboard, a project's Overview, or the Captain thread reads in the records reader, and the reader's Back control returns the reader to exactly where the record was clicked — the same surface, the same group in view — instead of leaving them in the Specs tree ([DR-009](../decisions/009-at-hand-interaction.md)).

## Deliverables

- [x] Opening a record from another surface carries its origin; the reader's Back control returns to that surface with the originating group or row in view, and reads "← Back to Dashboard" (or the origin's name) so the reader knows where it leads (spec-view, dashboard-40).
- [x] A record opened from within the Specs tab keeps today's Back to the tree.
- [x] Unit coverage of both origins and one browser journey opening a History record and returning to the Dashboard group.

## Tasks

1. Origin carried with the open request; Back returns to it; spec items amended.
2. Tests and the journey.

## Verification

- Specs: spec-view-7 amended, spec-view-57 added, spec-view-45 extended to cite it; dashboard-40 amended, dashboard-46 added as the journey item; `spex lint` clean.
- Unit: `packages/ui` vitest 23 files, 381 tests green — spec-view.test.tsx gains "a record asked from another surface names it on Back and hands the origin back" and "a record picked in the view keeps Back to the tree"; app.test.tsx gains Back from the Overview and from the Dashboard, each asserting the surface, the row's focus, and the scroll-into-view; dashboard-surface.test.tsx asserts the origin control of a History row, a menu item, and a Sources row.
- Journeys: `e2e` Playwright 25 passed, fit.spec.ts included; dashboard.spec.ts "dashboard-46: a History record opens in the reader and Back returns to its row" covers the Dashboard and the Overview round trips.
- Type-check: `tsc --noEmit -p packages/ui` clean.
- No Captain-thread record opener exists in the code, so no session origin was added.
