<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-056: Real-Root Audience Pass

## Status

In progress.

## Intent

Walk the served UI over the owner's real state root — real projects, CLI-run session records, the demo project's specs — as the demo audience will see it, and fix what a fixture-fed journey could not show.

## Deliverables

- [x] The Boss composer keeps one row through a first paint with no viewport height and refits when the viewport resizes (run-view-106).

## Tasks

1. Floor the composer field at one row in both the auto-grow hook and its CSS cap, refit on viewport resize, and pin it with a fit journey that opens at a one-pixel-tall viewport.

## Verification

- `npm test -w packages/ui`, the hermetic journey suite (`npm run e2e`), and `spex lint` pass on every commit.
- The served UI on the real root is walked surface by surface at 1280×800 with no clipped, overlapping, or empty chrome.
