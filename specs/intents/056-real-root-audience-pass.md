<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-056: Real-Root Audience Pass

## Status

In progress.

## Intent

Walk the served UI over the owner's real state root — real projects, CLI-run session records, the demo project's specs — as the demo audience will see it, and fix what a fixture-fed journey could not show.

## Deliverables

- [x] The Boss composer keeps one row through a first paint with no viewport height and refits when the viewport resizes (run-view-106).
- [x] A session whose roster binds no player — a record the CLI wrote — shows the Captain column alone at the home's reading width, with no divider to a blank half (run-view-7).
- [x] A nested machine state — a region of /decide's parallel proposals — goes by its own segment with its parent as caption, its whole path in tooltips and the status line, instead of a truncated dotted id (run-view-60).

## Tasks

1. Floor the composer field at one row in both the auto-grow hook and its CSS cap, refit on viewport resize, and pin it with a fit journey that opens at a one-pixel-tall viewport.
2. Lay a lane-less session out as a solo Captain column: no divider, no player grid, the home's measure.
3. Name nested machine states by their own segment on the card, with the parent as caption and the path in tooltips, exit-label tooltips, and the status line.

## Verification

- `npm test -w packages/ui`, the hermetic journey suite (`npm run e2e`), and `spex lint` pass on every commit.
- The served UI on the real root is walked surface by surface at 1280×800 with no clipped, overlapping, or empty chrome.
