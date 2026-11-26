<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-027: Linked-Views Contract

## Status

Accepted.
Amends [DR-026](026-data-graphics-craft.md).
Amended by [DR-030](030-workspace-chrome.md), [DR-158](158-a-legible-graph-and-outline.md).

## Context

- The graph and the outline shipped with linkage by accretion: expanding a package selected it, expanding a second moved the selection, and collapsing the first cleared it — arrangement gestures writing the selection, the exact crosstalk the owner rejected.
- Density had been tuned twice through force constants — first airy, then crowded — because no principle owned it; tuning constants toward a visual outcome is the failure DR-026 §6 names, relocated rather than removed.
- The records row predated design: a footer popover held decisions, intents, and meta together, while the outline spent a permanent row on a root naming the only thing the view shows.
- The owner's direction: design the relationships among graph, tree, and filter from principles, and keep the rule set small enough to predict from one reading.
- Grounding: the coordinated-views rules — consistency, self-evidence, attention management, parsimony [[1]]; the brushing canon — selection is one shared channel over item identity, orthogonal to each view's own focusing and arranging [[2]] [[3]] [[4]]; the row-selects/chevron-discloses idiom converged on by mature tree UIs [[5]]; corpus-wide query scope [[6]]; ghost-don't-drop for a selected item a query would exclude [[7]].

## Decision

**The shared model.**
Four shared axes, each written by its own gestures and by nothing else: selection (one package or none, living for the session, graph on screen or not), arrangement (the persisted expansions, plus the search's transient overlay and the reveal set with their stated lifetimes), query (the search text), and lens (the group filters).
Inspection (hover and keyboard focus) and the camera are per-view state, never shared and never persisted.

**The contract card** — the whole coupling in seven rules:

1. Selecting is its own gesture — a package row activated in the outline, a node in the graph — never a side effect of anything else.
2. Arranging is its own gesture — the chevron and the arrow keys — and never selects, deselects, or moves the camera.
3. A new selection reveals in both projections: the package and its ancestors open and scroll into view in the outline, and the graph pans only if the node sits off-viewport or under the pinned card, returning the camera after the selection unless the reader moved it ([DR-158](158-a-legible-graph-and-outline.md)); reveal only opens, never closes, and never counts as the reader moving the camera.
4. Query and lens change visibility alone: they never write the selection, the camera, or any arrangement beyond the search's transient overlay.
5. The selected package is never dropped: a narrowing search retains it at full selection emphasis with the shown-despite grammar reveals already use [[7]].
6. Inspection shows the details card and lifts the inspected mark to full strength; it never dims others, never isolates, never selects.
7. One Escape ladder everywhere: the focused widget dismisses first — search box, list, card — then the selection; a graph-canvas press that never became a drag clears it too.

An in-view citation jump is item navigation under rule 4's spirit: it reveals and flashes its target and never writes the package selection.

**One voice per axis.**
Selection speaks ink — the halo and neighborhood isolation in the graph, hiding the edges it does not touch and drawing its own citations directed, and the highlighted row in the outline ([DR-158](158-a-legible-graph-and-outline.md)); the query speaks ink match rings and the narrowed outline; the lens speaks item visibility alone; inspection speaks the card and ring.
Composed voices hold full strength together, the match ring included while a selection isolates.

**Density is solved, not tuned** (amending [DR-026](026-data-graphics-craft.md) §4; inspection never taking the emphasis amends its §7):

- the settled arrangement stays a pure function of the tree and its label metrics — deterministic, pane-independent, holding a minimum separation between whole marks, names included, because an arrangement blind to names leaves the presentation a scale it cannot solve above the activation floor;
- the rendered picture is a pure function of the arrangement and the pane: positions span the drawing area within a bounded aspect relaxation (axis-scale ratio at most ~1.25) — bounded fill, unlike the unbounded stretching §4 condemned [[8]];
- with positions fixed, marks take one solved scale: the largest at which no circle-plus-label mark touches another, computed exactly over pairs rather than searched — the predicate is not monotone in the scale, so a search finds an arbitrary boundary;
- the 24px activation-target floor [[9]] wins over overlap, the size cap applies last, and label widths are capped with an ellipsis so one long pair cannot shrink the whole map;
- degenerate spans fall back to the identity scale, centered; a pane change recomputes the base fit and re-composes the reader's own camera delta over it.

Force constants return to topology duty; density never again lives in physics.

**Records find their places.**

- The outline drops its root row: collection directories and files list at the top level — the header already counts the packages.
- The outline pane's footer holds `map.md`, `meta.md` and the decision records as reference, the records opening their own list in place of the view ([DR-158](158-a-legible-graph-and-outline.md)), present whenever decision records exist — file-less and legacy trees included; links inside the reader follow the view's own link semantics instead of dying inert.
- Intent records leave the view: they are work items, so the Dashboard's next-work lists carry each project's intents, and activating one opens that record in its project's Specs surface — reachable, in its home.

**Considered and declined**, so the alternatives cannot re-enter piecemeal:

- filter-clears-selection-and-expansion (floated as the simplest possible rule): a keystroke destroying the reader's arrangement trades predictability for amnesia, and visibility-only lenses are exactly as simple while losing nothing;
- selection-scoped search: a silently narrowed scope makes items vanish for reasons the reader cannot see [[6]];
- multi-select and compare: one selection is what keeps the graph's isolation meaningful; comparison is a future decision with its own design;
- hover or focus taking the emphasis: inspecting must never look like choosing;
- intents in the spec view: intents are work, and the owner routed work to work surfaces.

## Consequences

- The spec-view package holds this contract: the projection and gesture split, the emphasis and inspection model, the camera, the layout function, search narrowing, jumps and reader links, the root removal and voice composition, each with its verification.
- The records-listing contract has an external user — the Dashboard — which cites it.

## References

[1]: https://www.semanticscholar.org/paper/631b8ecb91442fecb78cb12f620cbe38d981eac8 "M. Q. Wang Baldonado, A. Woodruff, A. Kuchinsky, Guidelines for Using Multiple Views in Information Visualization, AVI 2000"
[2]: https://www.tandfonline.com/doi/abs/10.1080/00401706.1987.10488204 "R. A. Becker & W. S. Cleveland, Brushing Scatterplots, Technometrics 29(2), 1987"
[3]: https://www.tandfonline.com/doi/abs/10.1080/10618600.1996.10474696 "A. Buja, D. Cook, D. F. Swayne, Interactive High-Dimensional Data Visualization, JCGS 5(1), 1996"
[4]: https://drum.lib.umd.edu/items/07850e75-b5aa-4238-904e-dabfd97e27ad "C. North & B. Shneiderman, Snap-Together Visualization, AVI 2000"
[5]: https://primer.style/product/components/tree-view/guidelines/ "GitHub Primer: TreeView guidelines (caret discloses, row selects)"
[6]: https://www.nngroup.com/articles/scoped-search/ "K. Sherwin, Scoped Search: Dangerous, but Sometimes Useful, Nielsen Norman Group"
[7]: https://learn.microsoft.com/en-us/power-bi/create-reports/power-bi-reports-filters-and-highlighting "Microsoft Power BI: Filters and highlighting in reports (cross-highlight vs cross-filter)"
[8]: https://graphviz.org/docs/attrs/ratio/ "Graphviz: the ratio attribute (uniform size vs fill distortion)"
[9]: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html "WCAG 2.2, Understanding SC 2.5.8: Target Size (Minimum)"
