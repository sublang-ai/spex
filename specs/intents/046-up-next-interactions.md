<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-046: Up Next Interactions

## Status

Done

## Intent

Fix what the heuristic audit found in the Dashboard's queue and attention box, so a queue is worked without a pointer, a removal is never final by accident, no state is claimed before it is known, and focus is never stranded ([DR-010](../decisions/010-interface-craft.md) §3, §6, §7, §8).

## Deliverables

- [x] No false all-clear: the attention box says it is loading until the ledger is read, and shows only the failure strip with Retry while a load has failed.
- [x] Up next rows reorder without dragging: Move up and Move down in the row's ⋯ menu, naming Alt+↑/↓ and disabled at the ends, with a grip at the row's left.
- [x] One popover idiom behind the ⋯ menu and the binding editor: focus in on open, Escape and an outside click close, focus back on the trigger, menu roles, one row menu open at a time.
- [x] Remove offers a six-second Undo that re-queues the same text and provenance at its place.
- [x] One time vocabulary: every age says "ago" with the absolute moment in its tooltip, the Now band reads "started 3m ago", and durations come from the shared helper.
- [x] Focus hands on after Confirm and Drop, after Keep, and after Remove project.
- [x] Sentence-case buttons and progress labels, Confirm/Cancel and Remove/Keep, hit targets of at least 24px, and external links opening in a new tab without a referrer.

## Tasks

1. The popover hook, with the binding editor on it.
2. The row menu: Move up and Move down, the grip, the menu roles, Undo.
3. Honest attention states and the focus hand-offs.
4. The time vocabulary, sentence case, hit targets.
5. The journey: move by menu, Remove then Undo, Escape back to the trigger.

## Verification

ui 274 green (dashboard-surface 30, binding-editor 3); the hermetic journeys green — `dashboard-39` as two tests and `run-view-102` in light and dark with no serious or critical axe violation — with the Library's confirm naming its act; `spex lint` clean.
