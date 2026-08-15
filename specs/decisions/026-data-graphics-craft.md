<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-026: Data-Graphics Craft

## Status

Accepted.
Extends [DR-010](010-interface-craft.md)'s interface principles to data graphics, occasioned by the spec citation graph.

## Context

- The graph view's first release drew ten owner findings in one review sitting; an adversarial audit confirmed all ten and surfaced fourteen more, so the failures are systemic, not incidental.
- The shared root cause is process: the graph was designed by accretion against no data-graphics principles and landed with no rendered design check, although [DR-010](010-interface-craft.md) and [DR-013](013-sublang-brand.md) already legislated the neighboring territory.
- Measured examples from the shipped rendering (dark page `#0a0a0a`, warm paper `#f7f4ef`):
  - resting edges composite to 1.16:1 (dark) and 1.20:1 (light) against the 3:1 non-text floor [[1]] — the resting architecture picture is nearly invisible in both themes;
  - direction markers render only on focused edges, and SVG markers default to stroke-width scaling [[2]], so a light edge's arrowhead is a same-hue wedge a few pixels wide — direction effectively does not exist;
  - node radius blends item count and inbound citation weight in one capped formula, so neither variable can be read back, and the legend keys one of at least seven active encodings;
  - the composition role wears the same neutral ramp the app's disabled and dimmed states wear, below the contrast floor in both themes, while the contract role wears the brand purple that [DR-013](013-sublang-brand.md) reserves for interaction — so one category reads switched-off and the other camouflages the selection ring;
  - the legend's "composition — cites only" is false today: five of the sixteen packages (git, licensing, playbook-library, release, settings) cite nothing and are cited by nothing;
  - the layout is ~130 lines of hand-tuned physics constants, settled once and frozen: nodes cannot be dragged, spacing comes from a fixed repulsion constant, and the frame is filled by stretching the axes independently, maximizing empty space between small marks.
- The owner's direction: stop serial one-pixel fixes — establish the principles, record them, prefer a mature interaction engine, and check every change like a designer.

## Decision

Nine principles govern data graphics in Spex — the spec graph today, any chart, map, or diagram later.
Numeric floors below are deliberate defaults, revisable only by a recorded decision, because numbers are what makes the design gate mechanical.

1. **One channel, one meaning, keyed.**
   A mark's visual channel encodes exactly one named variable, and every channel in use is decodable on the surface — from the legend, an on-mark label, or the hover card; an encoding nobody can decode is decoration and is removed [[3]].
   Quantities map honestly: circle area (not radius) carries a count, stroke width follows a square-root ramp on an absolute scale comparable across trees, and both run in clamped bands — node diameters within about a 3× ratio above a hit-target floor, strokes within roughly 1.5–6 canvas units [[3]].
   Applied to the graph: node area carries the package's item count, stated by a numeral on the node that holds text AA against its fill in both themes — direct labeling beats decoding; edge width carries the pair's citation count; degree needs no size channel because it is already drawn as the edges themselves.
2. **Reserved hues stay reserved; no gray categories.**
   The hue budget is enumerated: brand purple marks interaction alone ([DR-013](013-sublang-brand.md)); emerald/amber/red mark status and neutral marks idle or de-emphasis (DR-010 §8); sky/fuchsia/teal mark the item groups ([DR-011](011-project-workspace.md)); a new categorical hue may come only from outside every reserved set, with a recorded decision.
   A category never wears the gray that elsewhere means disabled or de-emphasized [[4]]; de-emphasis is one uniform axis — opacity — orthogonal to what a mark is.
   Applied to the graph: the map adds no new hue at all — its two roles are achromatic ink at text-grade contrast, distinguished by fill treatment: solid ink where peers cite the package, ink ring on a tinted fill where none do, worded in the legend as "cited by peers" and "not cited by peers" so both classes stay true for the packages no citation reaches at all.
   The weight asymmetry is intended hierarchy — contracts anchor the architecture — with both treatments unmistakably active, and interaction purple pops against the monochrome ground.
3. **Contrast is computed, not eyeballed — and pinned.**
   Every resting mark meets the 3:1 non-text floor and every text mark meets 4.5:1, verified as computed composites — opacity times color over the actual theme token — in both themes [[1]].
   A transient state (a dimmed non-neighbor during hover) may drop below the floor; the resting picture never does.
   The composites are not review folklore: the surface's verification items pin them as assertions over the rendered component's classes and tokens, so a regression fails a test, not a reviewer.
4. **Content sets density; the camera fits content.**
   Layout extent grows from the content — measured label boxes and node radii set collision and link distances — and is never stretched to fill a viewport; proximity is meaning, and inflating all distances erases it.
   The initial camera fits the content's bounding box with padding — overview first [[5]] — and re-fits on tree change, pane resize, or toggling the graph, unless the user has moved the camera, in which case a visible fit control is the way home — a hidden gesture that duplicates a visible control only muddies the plain click.
   Zoom is clamped between the fitted overview and a detail ceiling, so the picture can never be lost off-canvas.
   Labels are always on, sit on the app type scale with a 12px on-screen floor at the fitted view — DR-010 §8's no-arbitrary-type rule includes SVG text — and are haloed in the ground color where linework crosses them [[6]].
5. **Direction reads at rest.**
   A directed edge shows its direction without hover: direction is structure, and structure never gates on pointer state [[5]].
   Direction glyphs are constant-size — decoupled from stroke width [[2]] — sit at the target's rim, and take the edge's own hue one step stronger against the surface, never the interaction hue, so they read as glyphs rather than line widening.
   Curvature never carries direction (the cited study found biased curvature the worst direction encoding [[7]]), and a reciprocal pair renders as two parallel-offset edges, never one double-headed line.
   The tapered-edge evidence [[7]] is noted and declined: width already carries weight, so a small constant head is the honest remainder — and a head that never scales with weight dissolves the "huge ugly arrows" dilemma.
6. **A mature engine under our rendering.**
   Force layout, drag, and camera math come from the maintained d3 modules — d3-force and d3-zoom, ISC-licensed, headless [[8]] — under the app's own React SVG rendering; no bespoke physics, and no framework that owns rendering and would evict the app's styling system.
   The settled layout is a pure deterministic function of the tree: seeded, settled synchronously before first paint, with no entrance animation — same tree, same picture.
   Dragging a node pins it to the pointer while the simulation reheats live around it; release cools the layout to a stop within a bounded few seconds — never idling warm, never silently pinning, never persisting positions — so reopening restores the canonical picture (the Obsidian-graph model [[9]]).
   Isolated packages stay on the map, held by the centering force — the map's completeness includes its loners.
   Emphasis transitions are short (on the order of 100–150 ms) so isolation never strobes; under the reduced-motion preference, transitions turn instant and drag feedback may fall back to discrete position updates [[10]].
7. **One focus-state model: selection is stable, hover previews, details on demand.**
   All emphasis states speak the single dim axis of principle 2 — no state recolors, resizes, or moves anything — with precedence base < selection < keyboard focus < hover preview.
   The two gestures do different work: clicking chooses, and only a choice isolates a neighborhood; hovering inspects, showing a mark's numbers while leaving the picture whole — an emphasis on hover would merely restate what a click already says. Escape dismisses the card, then the selection.
   Keyboard focus reaches every node (DR-010 §6), shows the app's one focus ring ([DR-013](013-sublang-brand.md)), and triggers the same isolation hover does; Enter opens, and zoom, pan, and fit have key bindings.
   Details live in an instant, themed hover card — never the native `<title>` tooltip [[11]] — shown on focus as well: identity, the total behind the size encoding, then the per-group breakdown as a list in the group hues following the outline's count grammar [[spec-view-2](../packages/spec-view.md#spec-view-2)] — each count with its group word, zero muted rather than absent, color never the only channel; edges answer hover with their citation count.
8. **Controls sit with what they govern.**
   The outline is the permanent surface; one toggle — on by default, persisted with the project's view state — sets whether the graph stands beside it; the three-state mode control retires, and no maximize mode reintroduces a third state.
   The reader sets the balance between the two panes with a draggable, keyboard-operable divider, bounded so neither pane can be squeezed past reading; a narrower graph pane is absorbed by the space between marks, never by the type, which holds its on-screen size.
   Item filters and search live in the outline pane and scope to it; graph geometry is a function of the tree alone — an active search reflects on the graph only as a non-geometric highlight of matching packages, and filters do not touch it — so the projections differ only where the controls visibly say so.
   Graph affordances — fit, legend, gesture hints — live on the graph pane, and selecting from the graph never rearranges the workspace ([DR-009](009-at-hand-interaction.md)).
9. **No unexamined pixels.**
   A change that touches rendered UI lands only with a design check recorded in the change: the affected surfaces rendered and inspected in both themes with realistic data, each new color composite contrast-verified numerically, every active encoding confirmed keyed, and the diff read against [DR-010](010-interface-craft.md), [DR-013](013-sublang-brand.md), and this record.
   "It boots" is not "it is designed": the acceptance screenshot proves the first, this check proves the second.

These guarantees are scoped to trees up to roughly 50 packages.
Crossing that envelope is a recorded revisit — the ordered degradations are zoom-linked label fade, collection-level clustering [[meta-31](../meta.md#meta-31)], then a minimap — and none of them ships before that decision.

Considered and declined, so the precedents cannot re-enter piecemeal:

- force/density sliders and switchable size semantics (Obsidian, Gephi) — they multiply the states the design gate must hold and break "same tree, same picture";
- arrows hidden at rest (Obsidian's default) — direction is semantics in a citation graph, not clutter;
- a visible settle animation on open — breaks the deterministic first paint;
- drag pinning or persisted node positions — a new decision with its own persistence design if ever wanted;
- a side inspector panel — [DR-009](009-at-hand-interaction.md) keeps details at hand, not in a second surface;
- local-depth modes, subtree collapse, minimap, colorize-by — analysis-tool features beyond an ambient map, re-enterable only through the scale-envelope revisit.

## Consequences

- The spec-view package decomposes its graph law: `spec-view-20` keeps the projection requirement under its released ID (outline permanent, one graph toggle, one selection across two projections), and the encodings, the focus-state and interaction model, the camera policy, and the search reflection land as new per-concern items [[meta-29](../meta.md#meta-29)]; `spec-view-21` is re-pinned to the two-state round trip.
- Verification gains the mechanical gates: composite-contrast assertions over both themes' tokens, a layout-determinism assertion (same fixture tree, same coordinates), and a legend-completeness check, at integration level [[meta-21](../meta.md#meta-21)].
- The UI package takes d3-force and d3-zoom as dependencies; the hand-rolled physics, label-declutter, and viewport math retire.
- The design check (principle 9) binds all UI work from this decision on, not only the graph.
- Arbitrary sub-scale type retires from the graph surfaces; the legend, hints, and labels move onto the type scale with AA-passing colors.

## References

[1]: https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html "WCAG 2.1, Understanding SC 1.4.11: Non-text Contrast"
[2]: https://www.w3.org/TR/SVG2/painting.html#MarkerUnitsAttribute "SVG 2, Painting: the markerUnits attribute"
[3]: https://www.cs.ubc.ca/~tmm/vadbook/ "T. Munzner, Visualization Analysis and Design, ch. 5: Marks and Channels"
[4]: https://www.datawrapper.de/blog/emphasize-with-color-in-data-visualizations "L. C. Muth, Emphasize what you want readers to see with color, Datawrapper"
[5]: https://ieeexplore.ieee.org/document/545307 "B. Shneiderman, The Eyes Have It, IEEE VL 1996"
[6]: https://doi.org/10.1559/152304075784447304 "E. Imhof, Positioning Names on Maps, The American Cartographer 2(2), 1975"
[7]: https://dl.acm.org/doi/10.1145/1518701.1519054 "D. Holten & J. J. van Wijk, A User Study on Visualizing Directed Edges in Graphs, CHI 2009"
[8]: https://d3js.org/d3-force "d3-force documentation"
[9]: https://help.obsidian.md/plugins/graph "Obsidian Help: Graph view"
[10]: https://www.w3.org/WAI/WCAG21/Understanding/animation-from-interactions.html "WCAG 2.1, Understanding SC 2.3.3: Animation from Interactions"
[11]: https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/title "MDN: SVG title element"
