<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-047: Session View Craft

## Status

Done

## Intent

Fix what the heuristic audit found in the session view — the composer, the Captain thread, the player panes, and the tab strip — so every control says what it does in plain words, no state rests on color alone, no link navigates the app away, and no action strands focus, per [DR-010](../decisions/010-interface-craft.md).

## Deliverables

- [x] The composer speaks plainly: "Send after this turn" while a turn runs, the placeholder, caption, and control agreeing on "sends when this turn ends", "Add to Up next" with a note naming the Overview, the staged chip and its control in plain verbs, and the Send tooltip naming its keys.
- [x] Failure lines fold: a repeat within one turn becomes a count, and while the Captain's adapter is not ready each line links to Settings.
- [x] The tab strip is one Tab stop walked by arrows, Home, and End; a tab's name carries its attention; shortcut tooltips print the platform's modifier.
- [x] Color is never the only channel: the player pane's running mark and tool outcomes carry their words.
- [x] External links open outside the page without a referrer — the source chip and every Markdown link.
- [x] Focus is never stranded: ending a session lands on its tab, backing out of the confirm returns to its control, aborting stays in the composer, closing the last session tab lands on the new-session control.
- [x] Hit targets of 24px on the composer's remove and detach controls; the delivery card's duration from the shared vocabulary; sentence case across the session view.

## Tasks

1. Reducer folds repeated failures; the Captain pane counts and links them.
2. Composer labels, tooltips, hit targets, and abort focus.
3. Player pane channels, delivery card links and duration, Markdown links.
4. Tab strip roving focus, attention names, shortcut tooltips, end and close focus.
5. Journeys for the new labels and the strip's keyboard; the intent record.

## Verification

`npm test -w packages/ui` green with the new reducer, run view, and app cases; the journeys `run-view-98` and `run-view-101` extended and green with `run-view-102`'s axe scan.
