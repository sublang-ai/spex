<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-072: The Graph Pane's Height and the Short-Pane Picture

## Status

Done.

## Intent

Since the graph split learned to scroll as one, the split beside the outline has had no definite height, so the graph pane's own `h-full` resolved to nothing and its drawing surface fell to an svg's 150-pixel default; in a pane that short the fit solver's margins ate the whole drawing span and every package landed on one point. The split takes the box's height beside the outline, the stacked graph pane keeps a floor a picture can be read in, and the solver never gives its margins more than half the drawing area, so a short pane squashes the picture rather than collapsing it.

## Deliverables

- [x] Beside the outline, the graph's drawing surface fills its pane's height below the legend; stacked below it, the pane keeps a floor and the split scrolls as one (spec-view).
- [x] In a pane too short for its marks, the arrangement still spans half the drawing area (spec-view).
- [x] The fit journey measures the drawing surface at every size, and the picture test renders a short pane.

## Tasks

1. Split height, pane floor, solver span floor; spec items amended; unit case and journey assertion.

## Verification

Task 1: the split carries `h-full` from the side-by-side step, the graph half's floor rises to 18rem in both arrangements, and `presentLayout` floors each axis's available span at half the padded area.
Accepted with eyes open: in a 400-pixel-tall window the floor puts the stacked outline below the first fold behind the graph, reached by the split's own scroll, and a pane under about 150 pixels lets its edge marks cross the padding — the graph toggle is the way out of both, and the picture is worth more than either.
Amended spec-view-28 (half-span floor), spec-view-59 (the drawing surface fills its half), spec-view-40 (the short-pane case), and spec-view-56 (the drawing surface measured at every size).
Green on `npx tsc --noEmit -p packages/ui`, `packages/ui` vitest, the `e2e` fit and popover journeys, and `spex lint`; the journey's new assertion, run against the unfixed build, named the graph half standing 220 pixels tall beside the outline in a 622-pixel box, and the served 0.4.0 build showed cligent's twelve packages on one point where the fixed build spreads them across the pane.
