<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-203: The Outline Gives Its Width to the Intent

## Status

Accepted (2026-11-02) on the owner's direction during the Workshop's manual verification.
Amends [DR-158](158-a-legible-graph-and-outline.md) in the outline's table and the split: the counts share one cell of labeled counts under no heading row, the cross-package rollup reads by labeled counts, a collapsed intent holds one line, an expanded package's header pins at the outline's top, and the graph starts at a third of the split.
Its full group names on the filters, the group colors, the filters' status line, the unresolved mark and the split's pixel floors stand.

## Context

- In a pane of about 690 pixels the three count columns took 72 pixels each and the rollup's 96, so the intent — the line that says what a package is for — kept about 200 pixels and was cut after a few words.
- The column headings repeated the filters' names and colors directly above them, and "cites · cited by" needed its title to be read at all.
- Bare numerals in one cell, keyed only by color, and the rollup's arrows were hard to read without a legend; a two-line intent made every row tall.
- At two-fifths of the split the graph took more of a typical window than its drawing needed beside a full outline.

## Decision

- A package row's counts stand in one right-aligned cell, one labeled count per group still on and holding any, reading the group's short name with the count in parentheses (`Ext (7)`, `对外(7)`), in its group's color, each named in full in its own title and accessible name.
- A group with no items in the package is left out of the cell rather than shown as a dash.
- No heading row stands over the rows: each count names its own group, and the group filters above, in the same colors, give those names in full.
- The cross-package rollup stands after the counts, unheaded and muted, labeled as the counts are — `Cites (17)` for what the package cites in other packages and `Cited by (9)` for what cites it — a direction with none left out and each named in words in its title.
- A collapsed package's intent holds one line, its whole text in its title.
- With no heading row, an expanded package's header pins at the outline's top while its contents scroll, and a revealed package lands at that top.
- The boundary between graph and outline starts at a third of the split's width; a share already saved for a project stands.
- Leaving the counts out of the row was rejected: a package's size and its ties to others are what the outline shows at a glance, ahead of opening it.

## Consequences

- The intent gets the width the columns gave up and reads to its point in one line in most packages, with every row one line tall.
- The counts and the rollup read without a legend; the labeled cell is wider than numerals alone and varies from row to row, so its counts no longer align as columns.
- A project whose split was saved at two-fifths keeps it until the reader drags the boundary.
- Below 28rem the intent and the rollup still leave the row, as before.
