<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-158: A Legible Graph and Outline

## Status

Accepted (2026-10-27).
Amends [DR-026](026-data-graphics-craft.md) §1 (edge width no longer carries a count), §4 (a label without room waits for inspection or the selection; the camera is bounded by the fitted frame rather than the layout), §5 (direction reads under the selection; the resting backbone is undirected), §6 (unlinked packages leave the arrangement for a row of their own), §2 (one hue outside the reserved sets, orange, joins the budget for the selection's own citations, and the internal group's hue is lime), §7 (the selection hides the edges it does not touch, besides dimming; the card answers hover and keyboard focus alone) and §8 (the split's bounds are pixel floors; the threshold stands above the graph, the fit in its corner and the key below, with no gesture tips).
Amends [DR-013](013-sublang-brand.md)'s interaction hue on the spec view: its selection and pressed controls wear ink, brand purple keeping to links, text actions and the focus ring.
Amends [DR-011](011-project-workspace.md) and [DR-015](015-reference-content.md) in the internal group's hue: lime rather than fuchsia.
Amends [DR-027](027-linked-views-contract.md)'s selection voice (its isolation hides the edges it does not touch and draws its own directed), rule 3 (the graph reveals a node the pinned package card covers, and the camera returns after the selection) and the footer's place (in the outline pane).

## Context

- Measured on this repository's own tree — 25 packages, 114 citing pairs, 34 of them reciprocal, 20 packages on one cycle — the graph reads as one knot:
  - the two packages no citation reaches sit apart under repulsion alone, and the fit that frames them squeezes the other 23 into half the canvas;
  - all 114 edges draw, reciprocal pairs doubled, with an 11px head on each, so the middle of the picture shows no start or end of any line;
  - names lie on circles (git-host over a 63, forge-work-lists over a 39), and the 12-package Academy example still carries 48 name–edge crossings at 1440px;
  - width reads no count: at `2·√n` capped at 6px every pair of nine or more citations draws equally thick, so 58 citations and one look alike, and the counts are reached only by hovering edge after edge.
- The outline beside it shows "external / internal / test" as counts in filter-like pills with the group word repeated on every row, the `##` headings in their raw uppercased English, backlinks behind a toggle, and a file rollup that counts a citation of an absent ID as outbound while the graph drops it — the two projections disagree on the same pair.
- The split is bounded only by share (25–65%), so a graph beside the outline can be 168px wide.
- In use, three more things got in the way:
  - the omitted lines were explained by one legend sentence, with no way to see or change how many were drawn;
  - a click focuses the node, so its card stayed beside the relationship list after the pointer left, and the list moved to whichever corner covered the fewest neighbors — often over the selection itself — growing with the neighbor count;
  - the legend row mixed keys, the omission note and the fit button, the unlinked row carried a caption no other part of the canvas has, and `meta · map` under the graph read as the graph's own.
- The first remedy's own wording got in the way next:
  - a slider labeled "Lines ≥" beside "each package keeps one · showing 33 / 80 pairs" named its rule, not what the reader sees, and moving it right drew fewer lines;
  - "Fit to window" read as a mode beside the threshold, though it only moves the camera;
  - the panel could not step aside from the marks it covered, and the selection's halo lay over the arrowheads at its own node;
  - "size = items" and "click opens · drag moves · scroll zooms" repeated what the numerals and the gestures already say.
- The panel and the card then said one package twice: hovering the selected node raised its card beside the panel, both stating its totals in different words, the card leading with the item groups and the panel with the neighbors, because each had been added on its own; dropping the card would leave no way to preview a second package while one is selected.
- The stacked graph narrows with the window: with the 224px rail open it is 328px wide at a 600px window and 48px at 320px.

## Decision

1. **The overview draws the backbone; the reader sets how much.**
   At rest the graph draws one undirected line per package pair whose citations in both directions total at least a threshold, plus each package's heaviest pair — a tie going to the partner first by name — so no linked package looks unlinked; a node with no line therefore has no cross-package citation.
   A sentence above the graph — "Only pairs with ≥ N citations" — sets the threshold through a number field stepping up and down, from 1 to the largest pair total and a last stop drawing the heaviest pairs alone, skipping every stop that draws what its neighbor below draws, so each step changes the picture; the sentence names neither the floor nor the pair counts, which the lines and the citation list carry.
   The default is the lowest threshold whose backbone holds at most 1.5 pairs per linked package; the last stop holds at most one per package, so a default always exists.
   The arrangement settles once over the default backbone, so moving the control changes which lines draw and never moves a node — it is a visibility filter, not the density control DR-026 declines.
   While a package is selected the sentence yields to how many packages share citations with the selection and two line samples keying its two edge hues; the threshold lasts while the view stays open.
   Backbone lines are a mid-gray at uniform width, clearing DR-026 §3's 3:1 floor in both themes.
   A selected package's citations all draw, directed and of uniform width — what it cites in orange, what cites it in ink — ending clear of any ring a node wears — the selection's halo or the focus ring, with every other edge hidden and every other mark dimmed.
2. **Counts are written, not encoded in width.**
   Edge width stops carrying the citation count: past its cap it already could not.
   Under the selection each neighbor's name carries `→N` (the selection cites it N times) and `←N` (it cites the selection N times), cites before cited by as every other count in the view reads.
   One package card states a package wherever it shows: its name; its item total, what it cites and what cites it, in ink and in the outline's own count grammar, or that it has no citations with other packages; then its items by group, each count beside its group's name, a zero as a dash.
   Color in the card is the item groups' alone: the interaction hue there would read as a fourth group beside the internal one, and an arrow beside a count names no line the card stands on. A line's card says the same in a sentence — "a cites b 4 times", one per direction carrying citations — rather than an arrow between two names.
   Hover or keyboard focus raises the card beside its node; a selection pins the same card in the graph's top-right corner, and the selected node raises no second one.
   The pinned card ends in a control naming how many packages share citations with the selection, opening its citation list: column heads naming the two directions, then every neighbor by total count with both counts, scrolling inside; an entry focused or hovered lifts its node and edges, and activating one selects that package.
   The list starts closed and stays as the reader left it across selections while the view stays open: the picture already shows the neighbors, and the list stays for the pair counts a hidden label or a screen reader reaches no other way.
3. **The pinned card never hides the selection, and the camera comes back.**
   When the selected node with its name lies outside the viewport less the pinned card's measured box, the camera pans the least that brings it clear — never zooming, never counting as the reader's move; while the selection holds, a change of that box — the list opening or closing, the language, the canvas — reveals again by the same rule; deselecting returns the camera to where it stood before the first such pan, unless the reader moved it meanwhile.
   The camera is bounded by the fitted frame rather than the layout: the view overlaps the frame by at least half its own size on each axis, which a sparse tree satisfies too and which leaves room for any reveal pan.
   The pinned card spans at most 45% of the canvas height, its own lines held to fixed line counts so they fit in it and only the list scrolling, so a node at its top moves down by at most 0.45H plus a gap; with about 120px for the node, its name and the edge clearance, the canvas needs H ≥ 261px, and the graph pane's floor keeps it at 438px or more.
   The pan is vertical when it must be, so the node never meets the card whatever the graph's width.
4. **Inspection cards answer inspection.**
   A node's card floats on hover or keyboard focus alone; a click that focuses the node does not hold it once the pointer leaves, and the selection's own summary rides the pinned card.
   A card floating beside another node stands above or below it and, as room runs out, gives up covering the pinned card first, then the selected node and its name, then its own node's name, its own node last: at the fitted zoom a node spans at most 30% of the canvas's short side, so one side keeps 0.35H, about 153px at the 438px floor, for a card of about 130px.
   Escape closes a floating card first — keyboard focus staying on its node, its card not returning until focus moves on — and then the selection, for the pointer and the keyboard alike.
5. **Names are placed, not imposed.**
   Each name takes the first free place around its node — below, above, right, left, then below or above flush with its rim — clearing other circles by 5px, other names, and the canvas edge by 10px, the larger package placing first and fewer edge crossings preferred; a name with no place waits for hover, focus or the selection, and the node's accessible name always carries it.
6. **Unlinked packages stand apart, quietly.**
   A package with no cross-package citation either way sits in one row at the canvas's foot, outside the arrangement and the fit, in the same scale and spacing as the rest and with no rule or caption; its card's second line says it has no citations with other packages; node radii keep a 2.4 ratio across the tree.
7. **One citation index serves both projections.**
   Pair counts, the graph's in and out totals and the outline's file rollups come from one index keyed by item ID; a citation of an absent ID counts in no total and is carried as a neutral warning mark after the row's rollup at every width, its count in the mark's name — a quality warning, not a property every package has, so it holds no column.
8. **The outline reads as a table.**
   Group names read in full (External behavior, Internal behavior, Tests) with a one-line definition on each filter; package rows carry numerals in aligned columns under one pinned heading row, a zero as a dash, an expanded package's row pinned beneath it while its contents scroll so its name stays in sight; a group filtered off hides its column with a status line restoring it; section headings read as the localized group name with their count, topics keep their author's words as sub-headings, and the per-row group word retires.
   The filters lead with checkboxes, so they read as filters rather than tags; the graph's toggle is an icon at the graph's top right, beside the divider it folds toward, while it shows, and heading the outline's filter row while it is hidden, named for its act.
   An expanded package heads its items with a line under a rule above it alone, stating the item count and holding "Expand all items", marked by an expand-all glyph rather than a disclosure chevron, and "Edit spec file", so neither reads as acting on the intent above or on a row of its own.
   Every in-view jump records the place it left, a package's intent included, and the head of the outline offers the walk back, as do Alt+Left and the pointer's back button: a reader cannot tell an item citation, which jumps in place, from a record link, which opens the reader with its own Back, so both must come back; the record is one reading excursion — a repeated jump from one place counts once, it holds 20 places, the control states the steps it holds, and selecting a package, searching or collapsing a package clears it.
   A package row is one target across its width, with a pointer cursor and a hover tint over all of it and its focus ring on the whole row for the keyboard alone; activating the selected row while expanded collapses it, as file trees do.
   An item's citation summary raises a card listing up to five items in each direction and opens the item onto its citation block; backlinks list directly.
9. **The split holds pixel floors, and the window holds the graph's.**
   The panes stand side by side only while the box holds a 320px graph beside a 28rem outline, stacking otherwise, and the divider never takes either below its floor.
   The desktop window refuses a width below 600px, so the stacked graph keeps its 320px.
   A browser cannot be held, so the graph's drawing keeps 320px and scrolls sideways in its own box where the pane is narrower — the one place DR-041 lets content scroll sideways — while the controls, the pinned card and the key stay in view; a selection first scrolls the drawing to its node, then pans as item 3 states.
10. **The graph pane is layered, and the tree's documents belong to the outline.**
    Above the graph stands only the threshold sentence; the fit is an icon in the canvas's bottom-right corner, as maps place it, named "Fit to window" by its title and accessible name and inert while the camera rests on the fitted frame.
    Below the graph a key that is never a control and does not change with the selection names only the two role treatments: the numerals state what size counts, the selection's sentence the selection's hues, and the gestures are the conventional ones, so no tip states them.
    `map.md` and `meta.md` stand in a footer of the outline pane, outside its scroll, named by file and purpose, through search and filters and in the empty and legacy trees alike.
11. **The item groups' hues keep clear of interaction purple.**
    Brand purple `#890FBC` and the internal group's former fuchsia stood about thirteen degrees of hue apart, so purple links, text actions, the sidebar's selected project and the citation lines all read as the internal group.
    The internal group takes lime — about 90° from the tests' teal, 77° from emerald status, 68° from orange and 160° from brand purple — its text at the step holding 4.55:1 on the paper surface, level with the other two groups' text, and its fills a step brighter; links and text actions keep brand purple, since a reader must find them.
    The selection's own citations draw in orange, a hue outside every reserved set and keyed by its line sample; the selected row, the selected node's halo, the search's match rings and pressed controls wear ink, so purple on the view means something to activate or keyboard focus.
Considered and declined for now:

- re-laying the selection's neighbors in a ring around it — it reads best in the prototype but moves marks the camera contract keeps still, so it waits on this decision's results;
- an adjacency matrix — clearer for dense trees, but it replaces the graph and belongs to the scale-envelope revisit of DR-026.

## Consequences

- spec-view-1, 2, 3, 4, 7, 19, 20, 22, 23, 24, 25, 26, 27, 28, 43, 59 and 61 change; spec-view-60 adds the citation summary card and spec-view-66 the graph's threshold control; the tests spec-view-21, 37, 38, 39, 40, 41 and 56 follow, and spec-view-65 covers the outline's columns and filters.
- app-shell-40 holds the desktop window's minimum width, which the fresh-install smoke reads back.
- DR-026's "arrows hidden at rest" refusal stands for directed drawing: the resting backbone draws no direction because it draws pairs, not citations; its refusal of density sliders stands, since the threshold never moves a node.
- The localization catalogs gain the full group names, their short forms and definitions, and the new graph and outline wording.
