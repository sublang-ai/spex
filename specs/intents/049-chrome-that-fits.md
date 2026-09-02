<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-049: Chrome That Fits

## Status

Done

## Intent

Make every row, toolbar, and composer fit its pane at any width, per [DR-041](../decisions/041-chrome-that-fits.md): the composer rebuilt to its shape, labels within budget, the outline rows yielding, and a browser journey that measures overlap so no one finds the next one by hand.

## Deliverables

- [x] The composer: field on top growing to a maximum with no native grip, an action row beneath that wraps, "Send" and "Send next", placeholders within 24 characters, one caption line for hints and acknowledgments — on the Captain home and in sessions alike.
- [x] Rows that yield: the Specs outline and item rows, the Up next blocked note, forge labels, the attention row, inline confirms, notification rows, the ended notice, the collapsed rail's badge, the session split stacking under a container width.
- [x] Labels within budget: "New session", "Compiling…", "Re-check", the "+" tab as an icon.
- [x] The fit journey: surfaces × rail states × widths from 320px to 1280px, asserting no sideways scroll, no overlap, containment, and stable accessible names.

## Tasks

1. Specs: the amended items and the journey items.
2. The composer and the rows.
3. The journey, then the defects it finds.

## Verification

- `npm test -w packages/ui`: 19 files, 333 tests passing — the composer's shape, placeholders, and caption; the ended notice's two forms with "New session"; the End confirm's question; the split's custom property; the badge past nine; two forge labels plus "+N"; "Re-check".
- `npm run e2e`: 23 journeys passing (the live lane skipped), `tests/a11y.spec.ts` in both themes and the continue journey among them; `tests/fit.spec.ts` measures seven surfaces at eleven sidebar-and-width combinations each — 77 measurements — with no sideways overflow, no overlap, every child inside its parent, every control's name stable, and the collapsed badge at "9+".
- The journey found and the intent fixed, beyond the rows it set out for: the Now row's age and playbook name, the built-in and example card headers, agent chips that never truncated, the Settings path and the Overview's GitHub line, the agent editor's fields, the graph legend's tip, the item row's group word, and a running mark whose hidden word widened the page from inside a scrolling pane.
- `spex lint`: no problems found.
