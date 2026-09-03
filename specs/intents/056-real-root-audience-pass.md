<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-056: Real-Root Audience Pass

## Status

Done.

## Intent

Walk the served UI over the owner's real state root — real projects, CLI-run session records, the demo project's specs — as the demo audience will see it, and fix what a fixture-fed journey could not show.

## Deliverables

- [x] The Boss composer keeps one row through a first paint with no viewport height and refits when the viewport resizes (run-view-106).
- [x] A session whose roster binds no player — a record the CLI wrote — shows the Captain column alone at the home's reading width, with no divider to a blank half (run-view-7).
- [x] A nested machine state — a region of /decide's parallel proposals — goes by its own segment with its parent as caption, its whole path in tooltips and the status line, instead of a truncated dotted id (run-view-60).
- [x] A codex coder's tool rows read as commands — the login-shell wrapper unwrapped, the wire name "command_execution" reading "shell" — as a Claude coder's do (run-view-4).
- [x] A lane whose call opens beyond the grid's visible edge scrolls into view, so the working player never hides behind idle lanes (run-view-7).
- [x] A player's question stands in the session and on the Dashboard until the parked machine itself leaves its park; the controller Captain's own state reports no longer clear it (run-view-9, dashboard-10).

## Tasks

1. Floor the composer field at one row in both the auto-grow hook and its CSS cap, refit on viewport resize, and pin it with a fit journey that opens at a one-pixel-tall viewport.
2. Lay a lane-less session out as a solo Captain column: no divider, no player grid, the home's measure.
3. Name nested machine states by their own segment on the card, with the parent as caption and the path in tooltips, exit-label tooltips, and the status line.
4. Unwrap a runner's `<shell> -lc` command wrapper in the tool row's subject and read its shell tool's wire name as "shell".
5. Scroll a lane's pane into view when its call opens out of sight, pinned by a stacked-width journey.
6. Clear a parked question only on the parked machine's own departure, in the UI reducer and the core's attention fold, replaying a real /dev park in both suites.

## Verification

- `npm test -w packages/ui`, the hermetic journey suite (`npm run e2e`), and `spex lint` pass on every commit.
- The served UI on the real root is walked surface by surface at 1280×800 with no clipped, overlapping, or empty chrome.
