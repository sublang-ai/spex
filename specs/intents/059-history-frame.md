<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-059: History in a Capped Frame

## Status

Done (2026-09-02).

## Intent

The Dashboard's History band stops growing the project group each time "Older…" reveals more: the rows scroll inside a frame a fixed number of rows tall, so a long history is browsed quickly in place and the groups below never move ([DR-038](../decisions/038-history-is-done-work.md)).

## Deliverables

- [x] The History band lists every loaded row inside a frame eight rows tall that scrolls when the rows exceed it; the group's height never grows past that frame (dashboard-27).
- [x] The next page loads from the frame's end — the control at the bottom of the scrolled list, or reaching it — so paging keeps its semantics without moving the groups below (dashboard-27).
- [x] Unit coverage of the frame and the paging; the fit journey and the Dashboard journeys updated.

## Tasks

1. The frame and the in-frame paging control, with its unit coverage; spec item amended.
2. The seeded-history journey; test items amended.

## Verification

- `packages/ui`: `npx vitest run` — 23 files, 379 tests green; `dashboard-surface.test.tsx` holds the three frame cases (every loaded row inside the `max-h-48` frame with `h-6` rows, cut edges and focus past eight rows; "Older…" as the frame's last item fetching with the last served row's cursor; a history within eight rows as a plain list).
- `e2e`: `npx playwright test` — 26 journeys green, among them the new `dashboard-44: History scrolls inside a frame eight rows tall that Older… never grows` (seeded with 25 worked, closed intents through the harness's `history` option: frame height equals eight row heights before and after "Older…", the group's height unchanged, `scrollHeight > clientHeight`, End key scrolls the focused frame, the Overview tab draws the same frame) and the unchanged fit journey `run-view-105`.
- `npx tsc --noEmit -p packages/ui`, `-p packages/core`, `-p e2e` clean; `spex lint` clean.
