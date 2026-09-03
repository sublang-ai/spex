<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-065: Layout Hazards from the Systematic Review

## Status

In progress.

## Intent

A three-lens review of the whole interface (height and scroll chains, width and truncation, stale measurement on resize) with two independent refuters per finding left thirteen confirmed defects against the fit law ([DR-041](../decisions/041-chrome-that-fits.md)) and the craft principles ([DR-010](../decisions/010-interface-craft.md)); each is fixed at its cause, and the ones the fit journey can measure join it so they stay fixed.

## Deliverables

- [x] Queued Boss messages list inside a bounded scroll frame and the composer yields inside its column, so the field and its actions stay in view and the page never grows (run-view).
- [x] The Captain agent popover on the home opens where the window can show it, never above the top edge (run-view).
- [x] The agent editor popover fits the pane at every width from the 320px floor, never clipped by its anchor's edge (settings, playbook-library).
- [x] The role-binding popover fits the pane below 480px without widening the Playbooks surface (playbook-library).
- [x] A labelled issue or pull-request row yields its trailing cluster before it widens its pane (forge-work-lists, dashboard).
- [x] A long spec item id never widens the outline row past the outline pane (spec-view).
- [x] With the graph shown, the Specs outline keeps a readable height instead of collapsing under the root's clip (spec-view).
- [x] The composer refits its height when its own pane resizes without a window resize (run-view).
- [x] A transcript following its end keeps following after its pane resizes (run-view).
- [x] A machine drawing scrolled to its end regains its fade mask when the pane narrows (run-view).
- [x] The Captain split divider lands where the pointer is, measured against the box the split applies to (run-view).
- [x] The spec graph's hover card stays inside the graph pane at the minimum split (spec-view).
- [x] The project palette's message stays reachable in a 400px-tall window (projects).
- [ ] The fit journey measures the queue and the popovers at its widths and heights.

## Tasks

1. Run view and home: queue frame, composer yield, home popover, auto-grow refit, stick-to-bottom, machine mask, divider mapping; spec items amended; journey scenarios.
2. Popovers, rows, specs, palette: agent editor, binding editor, forge row cluster, outline chip and graph squeeze, hover card, palette height; spec items amended; journey scenarios.

## Verification

Task 1: The six run-view hazards are fixed at their causes and measured.
The queue lists inside a positioned frame a few entries tall kept at its end, the composer yields around it, and its own box holds its place, with an unbroken token in a queued message now breaking rather than widening the frame; the Captain home's gear grants its popover the room the window can show on the roomier side, and the popover opens there and scrolls inside that bound; the composer field and both transcript panes observe their own boxes, and a transcript tells a reflow's own scroll event from the reader's by the box it last saw; the machine drawing re-reads its fade on the box's resize; and the split divider maps the pointer against the padded content box the share resolves against, plus the gap it sits behind.
Amended run-view-8's shape item run-view-106 (queue frame, field refit), run-view-32 (popover placement), run-view-81 (divider under the pointer, fade following the width), and the verification items run-view-35, run-view-53, run-view-82, run-view-105; added run-view-120 (a resized pane keeps following) and its journey item run-view-121.
Green on `npm run build`, `npx tsc --noEmit -p packages/ui`, `packages/ui` vitest (24 files, 402 tests), `e2e` Playwright hermetic lane (30 passed), and `spex lint`.
Each journey was checked against the unfixed code first: the queue frame measured 740px tall and carried the send row out of a 700px window; the popover opened 156px above the viewport top with its adapter picker unreachable; the field held 108px for a 128px draft after the sidebar opened; and the thread sat 60px above its end.

Task 2: the two anchored editors go through one measured placement (`packages/ui/src/lib/popover-fit.ts`) that bounds them to the box which must show them and moves them off an edge they would cross; the forge row became its own container whose labels leave below 28rem with a bounded state chip; the outline's item-id chip truncates within 10rem; the graph split gives each half a floor and scrolls as one; the graph's card is placed by its measured size; and the palette's list yields inside a dialog bounded by its overlay's padding.
Amended settings-33 (new), settings-29, playbook-library-43 (new), playbook-library-41, forge-work-lists-1, dashboard-20, dashboard-49 (new), spec-view-3, spec-view-26, spec-view-59, spec-view-56, projects-30 (new), projects-28.
Green after rebasing onto main: `npm run test` across the workspaces (every ui unit test, the new `popover-fit` placement cases and class contracts among them), `npx tsc --noEmit -p packages/ui`, `spex lint`, and `npx playwright test` (every journey, `fit.spec.ts` included) with the new `e2e/tests/popovers.spec.ts` measuring the role editors at 320px, the palette's refusal message at 400px tall, the Specs outline and the graph card at the floor, and a labelled Sources row on the Dashboard — the editor case run against the unfixed component first, where it named the popover starting 25 pixels left of the window.
