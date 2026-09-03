<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-069: Citation Previews at Hand

## Status

Done.

## Intent

Every citation in the Specs view — an entry in an item's cites row, a backlink in its cited-by row, and a citation inline in an item's body — previews the cited item at hand ([DR-009](../decisions/009-at-hand-interaction.md)): a rendered card with the cited item's chip, first line, and the opening of its body, shown almost at once on hover and at once on keyboard focus, replacing the browser's slow native tooltip; and the item's footer keeps its citations together while its Edit action moves to the item's header.

## Deliverables

- [x] One citation preview card shared by the cites row, the cited-by row, and inline body citations: the cited item's ID chip in its group color, its first line, and its body's opening capped with a fade, "not in the tree" for an unknown target; opens after a short hover intent (about 120 ms) and immediately on keyboard focus; closes on leave, blur, Escape, or the jump (spec-view-61, spec-view-6, spec-view-19).
- [x] The item footer lists cites and cited-by as two aligned rows under one citations block, and the Edit control moves to the item's header row, right-aligned, revealed on hover and focus-within and always reachable by keyboard (spec-view-3, spec-view-19, spec-view-48).
- [x] The card fits the pane at every width and never scrolls the page (DR-041); unit coverage of the card's timing and both anchors; one browser journey hovering a cites entry and focusing an inline citation.

## Tasks

1. The preview card, its timing, and the three anchors; spec items amended.
2. The footer layout and the Edit control's move; tests and the journey.

## Verification

- `npx vitest run` in `packages/ui`: 435 tests in 25 files pass, including the seven new SPECV-61 cases (hover intent under fake timers, focus-immediate, Escape, one card at a time, an absent target, a backlink entry, an inline body citation) and the Gears rows' preview in `library-surface.test.tsx`.
- `npx tsc --noEmit -p packages/ui`: clean.
- `npx playwright test` in `e2e`: 39 journeys pass, including the new `spec-view-62` (a settled hover raises the card within 400 ms, it lies inside the box the split scrolls in with the page scrolling in neither direction, a leave drops it, keyboard focus on an inline citation raises it and Escape drops it) and `run-view-105`, which caught the item row's Edit control leaving its box at 480px and now passes with the row wrapping.
- `node packages/cli/dist/cli.js lint`: no problems found.
- Seen in the served page at 1280×800 and 700×520: the card flips above its entry near the box's bottom edge and clamps to the pane's right edge.
