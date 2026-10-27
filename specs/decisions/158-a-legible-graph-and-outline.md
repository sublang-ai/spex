<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-158: A Legible Graph and Outline

## Status

Accepted (2026-10-27).
Amends [DR-026](026-data-graphics-craft.md) §1 (edge width no longer carries a count), §4 (a label without room waits for inspection or the selection), §5 (direction reads under the selection; the resting backbone is undirected), §6 (unlinked packages leave the arrangement for a row of their own), §7 (the selection hides the edges it does not touch, besides dimming) and §8 (the split's bounds are pixel floors).
Amends [DR-027](027-linked-views-contract.md)'s selection voice (its isolation hides the edges it does not touch and draws its own directed).

## Context

- Measured on this repository's own tree — 25 packages, 114 citing pairs, 34 of them reciprocal, 20 packages on one cycle — the graph reads as one knot:
  - the two packages no citation reaches sit apart under repulsion alone, and the fit that frames them squeezes the other 23 into half the canvas;
  - all 114 edges draw, reciprocal pairs doubled, with an 11px head on each, so the middle of the picture shows no start or end of any line;
  - names lie on circles (git-host over a 63, forge-work-lists over a 39), and the 12-package Academy example still carries 48 name–edge crossings at 1440px;
  - width reads no count: at `2·√n` capped at 6px every pair of nine or more citations draws equally thick, so 58 citations and one look alike, and the counts are reached only by hovering edge after edge.
- The outline beside it shows "external / internal / test" as counts in filter-like pills with the group word repeated on every row, the `##` headings in their raw uppercased English, backlinks behind a toggle, and a file rollup that counts a citation of an absent ID as outbound while the graph drops it — the two projections disagree on the same pair.
- The split is bounded only by share (25–65%), so a graph beside the outline can be 168px wide.

## Decision

1. **The overview draws the backbone; the selection draws the detail.**
   At rest the graph draws one undirected line per package pair whose citations in both directions total at least six, plus each package's heaviest pair, so no linked package looks unlinked; the arrangement settles over those pairs alone, so clusters show.
   Backbone lines are a mid-gray at uniform width, clearing DR-026 §3's 3:1 floor in both themes.
   A selected package's citations all draw, directed and of uniform width — what it cites in the interaction hue, what cites it in ink — with every other edge hidden and every other mark dimmed; the legend says the overview omits the weaker relationships.
   The threshold and the heaviest-pair rule are a starting point, held to fixtures of sparse, dense and evenly weighted trees.
2. **Counts are written, not encoded in width.**
   Edge width stops carrying the citation count: past its cap it already could not.
   Under the selection each neighbor's name carries `←N` (it cites the selection N times) and `→N` (the selection cites it N times); where the names do not all find room, a relationship list in the graph lists every neighbor by total count, scrolling and keyboard-reachable.
3. **Names are placed, not imposed.**
   Each name takes the first of four places around its node — below, above, right, left — clearing other circles by 5px, other names, and the canvas edge by 10px, the larger package placing first and fewer edge crossings preferred; a name with no place waits for hover, focus or the selection, and the node's accessible name always carries it.
4. **Unlinked packages stand apart, honestly.**
   A package with no cross-package citation either way sits in a captioned row at the canvas's foot, outside the arrangement and the fit; node radii keep a 2.4 ratio across the tree.
5. **One citation index serves both projections.**
   Pair counts, the graph's in and out totals and the outline's file rollups come from one index keyed by item ID; a citation of an absent ID counts in no total and is carried as a muted "unresolved N" on its file row at every width.
6. **The outline reads as a table.**
   Group names read in full (External behavior, Internal behavior, Tests) with a one-line definition on each filter; package rows carry numerals in aligned columns under one pinned heading row, a zero as a dash; a group filtered off hides its column with a status line restoring it; section headings read as the localized group name with their count, topics keep their author's words as sub-headings, and the per-row group word retires.
   An item's citation summary raises a card listing up to five items in each direction and opens the item onto its citation block; backlinks list directly.
7. **The split holds pixel floors.**
   The panes stand side by side only while the box holds a 320px graph beside a 28rem outline, stacking otherwise, and the divider never takes either below its floor.

Considered and declined for now:

- re-laying the selection's neighbors in a ring around it — it reads best in the prototype but moves marks the camera contract keeps still, so it waits on this decision's results;
- an adjacency matrix — clearer for dense trees, but it replaces the graph and belongs to the scale-envelope revisit of DR-026.

## Consequences

- spec-view-1, 2, 3, 4, 19, 20, 22, 23, 24, 25, 26, 28 and 61 change; spec-view-60 adds the citation summary card; the tests spec-view-21, 37, 38, 40 and 56 follow, and spec-view-65 covers the outline's columns and filters.
- DR-026's "arrows hidden at rest" refusal stands for directed drawing: the resting backbone draws no direction because it draws pairs, not citations.
- The localization catalogs gain the full group names, their short forms and definitions, and the new graph and outline wording.
