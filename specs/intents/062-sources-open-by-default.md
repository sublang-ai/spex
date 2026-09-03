<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-062: Sources Open by Default

## Status

Done (2026-09-02).

## Intent

A project group's Sources band opens expanded, its three tabs in view, so a first-time reader learns that issues, pull requests, and open records are there to queue from; the reader can still fold it to its one-line summary, and the fold is remembered per project while the app runs ([DR-038](../decisions/038-history-is-done-work.md)).

## Deliverables

- [x] The Sources band renders expanded by default with its tabs and first page; the summary line stays as its header and folds it on demand (dashboard-20).
- [x] The fold is remembered per project while the app runs and applies to the Dashboard group and the project's Overview alike (dashboard-20).
- [x] Unit coverage and the Dashboard journeys updated.

## Tasks

1. Default expanded, fold remembered per project; spec item amended.
2. Tests and journeys.

## Verification

- The band's fold moved from the component's own `useState` to `foldedSources` in the app store, keyed by project and never persisted — the same shape the collapsed player lanes take.
  The Dashboard's group and the Overview tab draw one `SourcesBand`, so both read that one fold.
- dashboard-20 now states the band unfolded on first draw with the line folding it, the fold per project for the app's run; dashboard-19 covers it; dashboard-40's origin rule keeps the summary line as an Open records row's control, for the band's tab — not its fold — is what resets on return.
- Unit coverage: `dashboard-19/20/24/25/30/37: the Sources band` reads the tabs where they now stand and gains "the band folds to its summary, per project, for the app's run", which folds p1 while p2 stays open, redraws on the Overview and the Dashboard, and unfolds again.
  388 UI unit tests pass.
- Journeys: `dashboard-39: capture, start, confirm, and History through the page` now asserts `aria-expanded="true"` with the GitHub guidance already in view, then folds and reopens the band.
  27 hermetic journeys pass, the fit journey with the Dashboard's taller surface among them.
- `tsc --noEmit` on `packages/ui` and `spex lint` are clean.
