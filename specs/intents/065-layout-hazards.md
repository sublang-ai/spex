<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-065: Layout Hazards from the Systematic Review

## Status

In progress.

## Intent

A three-lens review of the whole interface (height and scroll chains, width and truncation, stale measurement on resize) with two independent refuters per finding left thirteen confirmed defects against the fit law ([DR-041](../decisions/041-chrome-that-fits.md)) and the craft principles ([DR-010](../decisions/010-interface-craft.md)); each is fixed at its cause, and the ones the fit journey can measure join it so they stay fixed.

## Deliverables

- [ ] Queued Boss messages list inside a bounded scroll frame and the composer yields inside its column, so the field and its actions stay in view and the page never grows (run-view).
- [ ] The Captain agent popover on the home opens where the window can show it, never above the top edge (run-view).
- [ ] The agent editor popover fits the pane at every width from the 320px floor, never clipped by its anchor's edge (settings, playbook-library).
- [ ] The role-binding popover fits the pane below 480px without widening the Playbooks surface (playbook-library).
- [ ] A labelled issue or pull-request row yields its trailing cluster before it widens its pane (forge-work-lists, dashboard).
- [ ] A long spec item id never widens the outline row past the outline pane (spec-view).
- [ ] With the graph shown, the Specs outline keeps a readable height instead of collapsing under the root's clip (spec-view).
- [ ] The composer refits its height when its own pane resizes without a window resize (run-view).
- [ ] A transcript following its end keeps following after its pane resizes (run-view).
- [ ] A machine drawing scrolled to its end regains its fade mask when the pane narrows (run-view).
- [ ] The Captain split divider lands where the pointer is, measured against the box the split applies to (run-view).
- [ ] The spec graph's hover card stays inside the graph pane at the minimum split (spec-view).
- [ ] The project palette's message stays reachable in a 400px-tall window (projects).
- [ ] The fit journey measures the queue and the popovers at its widths and heights.

## Tasks

1. Run view and home: queue frame, composer yield, home popover, auto-grow refit, stick-to-bottom, machine mask, divider mapping; spec items amended; journey scenarios.
2. Popovers, rows, specs, palette: agent editor, binding editor, forge row cluster, outline chip and graph squeeze, hover card, palette height; spec items amended; journey scenarios.

## Verification

Recorded on completion.
