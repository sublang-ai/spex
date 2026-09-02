<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-049: Chrome That Fits

## Status

In progress

## Intent

Make every row, toolbar, and composer fit its pane at any width, per [DR-041](../decisions/041-chrome-that-fits.md): the composer rebuilt to its shape, labels within budget, the outline rows yielding, and a browser journey that measures overlap so no one finds the next one by hand.

## Deliverables

- [ ] The composer: field on top growing to a maximum with no native grip, an action row beneath that wraps, "Send" and "Send next", placeholders within 24 characters, one caption line for hints and acknowledgments — on the Captain home and in sessions alike.
- [ ] Rows that yield: the Specs outline and item rows, the Up next blocked note, forge labels, the attention row, inline confirms, notification rows, the ended notice, the collapsed rail's badge, the session split stacking under a container width.
- [ ] Labels within budget: "New session", "Compiling…", "Re-check", the "+" tab as an icon.
- [ ] The fit journey: surfaces × rail states × widths from 320px to 1280px, asserting no sideways scroll, no overlap, containment, and stable accessible names.

## Tasks

1. Specs: the amended items and the journey items.
2. The composer and the rows.
3. The journey, then the defects it finds.

## Verification

Pending.
