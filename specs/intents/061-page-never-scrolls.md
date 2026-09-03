<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-061: The Page Never Scrolls

## Status

Done (2026-09-02).

## Intent

The app shell fills the window at every size and every surface scrolls inside its own box, vertically as well as sideways, so the page as a whole never scrolls and a short or resized window never cuts the shell off ([DR-041](../decisions/041-chrome-that-fits.md)); the fit journey measures it at two heights on every surface, so this class of defect is caught in CI rather than in a demo.

## Deliverables

- [x] Every surface root — the Captain home, the run view, the Dashboard, a project's Overview, the Specs tab, Playbooks, Settings — is a height-constrained box that scrolls its own content; the document's scroll height never exceeds the viewport on any surface at 400 and 800 pixels tall, with the sidebar open and collapsed.
- [x] The fit journey measures height as it measures width: at 400 and 800 pixels tall, on every surface, the document does not scroll vertically, no scroll container's box extends past the viewport, and a window resized taller or shorter after load re-fits without a reload.
- [x] The chrome-that-fits decision and the fit test items name the vertical law.

## Tasks

1. The vertical fit measurement in the journey, naming every offender.
2. Surface roots fixed until the journey is green; specs amended.

## Verification

- `e2e/tests/fit.spec.ts` now sweeps six widths at 800 and 400 pixels tall in both sidebar states, plus a tall/short/tall re-fit pass per surface: 175 measurements over seven surfaces, the run in 11 seconds.
  Each measurement adds three vertical assertions — the page does not scroll, no outermost scrolling box ends past the viewport, and no absolutely or fixed positioned element lies past it with no scrolling box containing it.
- Against the unfixed build it named 683 offenders. By surface:

| Surface | Offenders | The line |
| --- | --- | --- |
| Dashboard | 462 | `document scrolls vertically: 1158 > 800`, and `span.sr-only "done" is positioned past the viewport with no scroll box containing it (bottom 822 of 800)` — one per History mark below the fold |
| Overview | 156 | `document scrolls vertically: 742 > 400`, with the same screen-reader marks |
| Settings | 50 | `document scrolls vertically: 1682 > 400`, and `caption.sr-only "Keyboard shortcuts" is positioned past the viewport with no scroll box containing it` |
| Captain home | 15 | `document scrolls vertically: 585 > 400`, and `div.flex.flex-col.gap-3.overflow-y-auto "CHello! This is demo-project…" scrolls but ends past the viewport (bottom 407 of 400)` |

- Two causes: the Captain home's root was not height-constrained, and no scroll box in the app was a positioned box, so screen-reader-only spans below the fold took the page as their containing block and stretched the document.
- After the fix the journey is green, and so is the rest: 27 hermetic journeys, 387 UI unit tests, `tsc --noEmit` on `packages/ui` and `e2e`, and `spex lint`.
