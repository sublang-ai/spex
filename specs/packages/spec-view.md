<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# spec-view: Spec View

## Intent

This spec covers the per-project spec view — its user-visible behavior, the implementation of its data plane, and the coverage that verifies that data plane.
The view is an interactive outline of the current project's `specs/` tree, pinned as the workspace's Specs tab, spanning the outline's shape, package and item presentation, group filters and search, citation navigation, the records reader, the whole-file editor, freshness, and the empty state.
Its data plane — the `specs.get` tree parse, the `specs.read` file fetch, and the `specs.write` file replacement served by the core package — is exercised for coverage against fixture spec trees written to temporary project directories.

## External Behavior

### Tree

#### spec-view-1

When the spec view is opened for a project whose `specs/` tree has been read, the spec view shall present the tree as a left-rooted collapsible outline of the `packages/` collection ([DR-015](../decisions/015-reference-content.md)) — organized by spec files, never by item grouping at the top level ([DR-011](../decisions/011-project-workspace.md)):

- collection subdirectories and root-level file nodes list at the outline's top level, spending no row on a collection root ([DR-027](../decisions/027-linked-views-contract.md)), with directory levels expanded and file nodes collapsed by default;
- directories are ordered by name, and files by basename within their directory;
- each file row fits its own width ([DR-041](../decisions/041-chrome-that-fits.md)): the collapsed intent text yields first, the package-identifier chip then truncates with the full name in its title, and below 28rem the column headings take their short group names [[spec-view-2](#spec-view-2)] and the citation rollup leaves the row for the row's title, while a nonzero unresolved count [[spec-view-19](#spec-view-19)] stays as a compact mark whose accessible name and title state it in full.

#### spec-view-55

While an item row is displayed in a file row narrower than 28rem, the spec view shall yield the row's at-a-glance extras ([DR-041](../decisions/041-chrome-that-fits.md)): the citation summary hides — the expanded row's citation rows carry the counts — and the shown-despite-filter badge wraps rather than overflowing.

### Package Nodes

#### spec-view-2

While a file node is displayed, the spec view shall present the package's header and expanded contents ([DR-158](../decisions/158-a-legible-graph-and-outline.md)):

- the header shows the package-identifier chip, the file's intent — truncated to one line only while the node is collapsed, that line reading each link by its text — and the package's item count per group as a numeral in a fixed-width, right-aligned column in the fixed group colors — external sky, internal lime, test teal ([DR-015](../decisions/015-reference-content.md), [DR-158](../decisions/158-a-legible-graph-and-outline.md)) — a zero reading as a muted dash, every count carrying its group's full name in its accessible name and title, and color never the only channel ([DR-010](../decisions/010-interface-craft.md) §7, §8);
- one heading row stands above the outline's rows and stays while they scroll, naming each count column by its group's full name — "External behavior", "Internal behavior", "Tests" — and the rollup's column "cites · cited by" on the same line, its title naming them cross-package citations [[spec-view-19](#spec-view-19)]; below 28rem the count headings read "External", "Internal" and "Tests", their full names riding their titles and accessible names;
- a count column whose group filter is off leaves the rows and the heading row [[spec-view-4](#spec-view-4)];
- while an expanded package's contents scroll under the heading row, its header stays pinned beneath that row until the next package's header takes its place;
- expanded, the node shows the file's intent in full — rendered as item bodies are [[spec-view-3](#spec-view-3)], its links jumping as [[spec-view-6](#spec-view-6)] states — followed by its items in document order — never sorted by ID [[meta-12](../meta.md#meta-12)] — headed wherever the file's `##` section changes between consecutive items by that section's group full name and item count in the group's color, a section outside the package grammar heading by its own words, and wherever the `###` topic changes by the topic's own words as a sub-heading beneath the section's, along with any file consistency notices;
- expanded, the node heads its items with a line set off from the intent by a rule above it alone, stating the package's item count and holding the package's two controls, each named for what it acts on: one expanding or collapsing every item body at once, marked by an expand-all glyph rather than a disclosure chevron, and one editing the spec file, opening it in the editor [[spec-view-48](#spec-view-48)].

### Items

#### spec-view-3

While an item row is displayed, the spec view shall render the row by its expansion state:

- the row shows the item's ID chip in its group color — bounded at 10rem and truncating there, since a long ID would otherwise widen the row past the outline pane ([DR-041](../decisions/041-chrome-that-fits.md)), with the whole ID in the chip's title and accessible name — its first line, and, collapsed or expanded, a muted citation summary counting its outbound citations and inbound backlinks, which raises the summary card [[spec-view-60](#spec-view-60)];
- expanded, the row renders the item's full markdown body with horizontal overflow contained and its citations as outbound rows and inbound backlinks per [[spec-view-19](#spec-view-19)], every entry an in-view link; Markdown HTML comments are omitted from the rendering, while comment syntax inside code remains visible;
- when the ID chip is activated, the view copies the item ID to the clipboard and acknowledges in words beside the chip ([DR-010](../decisions/010-interface-craft.md) §3);
- the row's header ends with an Edit control opening its file in the editor with the caret on the item's heading [[spec-view-48](#spec-view-48)], shown by the row's hover or a focus within it and always reachable by keyboard ([DR-010](../decisions/010-interface-craft.md) §6).

### Citation Rows

#### spec-view-19

While an expanded item carries citations or is cited, the spec view shall present them as plain inbound and outbound item citations, with no derived classes and no relationship metadata in the protocol ([DR-158](../decisions/158-a-legible-graph-and-outline.md)):

- outbound rows list the item's citations in document order, each entry named by the cited item ID, an entry whose ID the tree does not carry marked unresolved in words;
- inbound citations render as backlink rows on the cited target, every entry listed and named by the citing item ID;
- the two rows stand in one block under the body, their labels in one column and their entries wrapping in the slack beside it;
- every file node, collapsed included, carries a rollup counting the file's inbound and outbound cross-file item citations — those whose source and target items live in different files — from one citation index keyed by item ID that the graph's counts share [[spec-view-23](#spec-view-23)], while item rows and backlink groups keep every citation regardless of file;
- a citation of an ID absent from the tree counts in neither direction: its file node carries a neutral warning mark in a narrow slot after the rollup at every width, under no heading, whose title and accessible name state how many citations name items absent from the tree;
- a record link in an item body stays a plain link, handled per [[spec-view-6](#spec-view-6)].

### Citation Previews

#### spec-view-60

When an item's citation summary [[spec-view-3](#spec-view-3)] takes a settled hover or keyboard focus, the spec view shall answer with one summary card at hand ([DR-158](../decisions/158-a-legible-graph-and-outline.md)) rather than a native tooltip:

- the card lists, under a cites heading and a cited-by heading, up to five items in each direction — each by its ID chip in its group color and its first line — and closes a longer direction with a line counting them all;
- the card opens, closes, stands one at a time with the citation preview, describes its summary, holds nothing focusable, and lies inside the outline's scrolling box as [[spec-view-61](#spec-view-61)] states for an entry's card, each listed item on one line so its height stays bounded;
- activating the summary expands the item if collapsed, scrolls its citation block into view, and moves focus onto that block, and Escape on the summary closes the card with focus staying on the summary.

#### spec-view-61

When a citation entry takes a settled hover or keyboard focus — an entry of an item's outbound or backlink rows [[spec-view-19](#spec-view-19)], or an item citation inside a rendered body [[spec-view-6](#spec-view-6)] — the spec view shall answer with one card at hand ([DR-009](../decisions/009-at-hand-interaction.md)) rather than a native tooltip:

- the card carries the cited item's ID chip in its group color [[spec-view-3](#spec-view-3)], its first line, and what the body holds beneath that statement, cut under a fade — the statement itself never repeated — and, for an ID the tree does not carry, that plain fact;
- hover opens the card only once the pointer has settled on the entry, keyboard focus opens it at once, and a pointer leaving before it settles opens nothing;
- pointer leave, blur, Escape — the rung above the selection's [[spec-view-42](#spec-view-42)] — and the entry's jump [[spec-view-6](#spec-view-6)] each close it, and one card stands at a time;
- the standing card is the entry's description for assistive technology and holds nothing focusable, so closing it strands no focus ([DR-010](../decisions/010-interface-craft.md) §6, §7);
- the card lies inside the box the outline scrolls in [[spec-view-59](#spec-view-59)], below its entry or above it where that box has no room, and never past that box's edges, so it adds neither width nor scroll to the page ([DR-041](../decisions/041-chrome-that-fits.md)).

### Filters

#### spec-view-4

When a group filter toggle is activated, the spec view shall hide or restore that group's items while keeping every package node in the outline ([DR-011](../decisions/011-project-workspace.md), [DR-158](../decisions/158-a-legible-graph-and-outline.md)):

- a package whose items are all filtered away stays visible and, when expanded, states that no items are in the active groups;
- the three group toggles carry each group's full name — its short name below 28rem, as the column headings do [[spec-view-2](#spec-view-2)] — a one-line definition of the group in their title, and project-wide item counts in the group colors, expose their pressed state via aria-pressed — each led by a checkbox, pressed as a box filled in the group's color holding a check, unpressed as an empty box beside a muted name — and default to all-on;
- while any group is off, a status line under the toggles states each hidden group and its item count and offers one control turning every group back on.

### Search

#### spec-view-5

While the spec view's filter box contains text, the spec view shall narrow the outline to the matching items:

- only items whose ID (matched case-insensitively) or text matches are shown, with the current match count displayed;
- a package holding no match leaves the outline for the search's duration — the selected package excepted [[spec-view-44](#spec-view-44)] — as does a collection directory left with nothing to show, unlike a group filter, which keeps every package standing [[spec-view-4](#spec-view-4)];
- packages containing matches auto-expand without persisting that expansion;
- the box offers a control that clears it, and Escape within it clears it too;
- clearing the box restores the expansion state from before the search, and the selection's reveal re-fires after the restore [[spec-view-43](#spec-view-43)].

### Citation Jumps

#### spec-view-6

When a local link inside the view is activated, the spec view shall resolve it against the citing file's `specs/`-relative path and act by target ([DR-011](../decisions/011-project-workspace.md)):

- an item citation or a backlink expands the target item's ancestors, reveals the target even when its group filter is toggled off or an active search excludes it — marking it as shown despite the filter or search — and scrolls to and briefly highlights it, without leaving the view and without writing the package selection [[spec-view-42](#spec-view-42)];
- every in-view jump — from an item's body, a backlink, or a package's intent — records the place it left, and the view offers a return walking back through successive jumps one at a time: a control at the head of the outline naming the place it returns to and, past one, how many steps it holds, Alt+Left, and the pointer's back button, its keyboard reach and announcement already legislated ([DR-010](../decisions/010-interface-craft.md) §6, §7);
- the record is one reading excursion: a jump from the place just recorded adds nothing, it keeps the latest 20 places, and selecting a package, changing the search, or collapsing a package clears it;
- a cited ID that does not exist in the tree shows a transient "not found" note beside the activated link and does not navigate;
- a link resolving to a decision or intent record's exact path, or to the tree's own `meta.md`, opens that record in the records reader [[spec-view-7](#spec-view-7)];
- an item citation inside a rendered body is a focusable link, so the keyboard reaches it and the preview it raises [[spec-view-61](#spec-view-61)] without activating it;
- any other local link stays inert.

### Citation Graph

#### spec-view-20

While the spec tree renders, the spec view shall keep the outline permanent and add the citation graph beside it while the graph toggle is on ([DR-026](../decisions/026-data-graphics-craft.md), [DR-158](../decisions/158-a-legible-graph-and-outline.md)):

- the toggle defaults on and persists with the rest of the project's view state;
- the toggle is an icon control standing at the end of the graph's own line above the drawing, beside the divider the graph folds toward, while the graph shows, and at the head of the outline's filter row while it is hidden, its glyph pointing the way the graph folds or opens, its title and accessible name saying what it does — showing or hiding the citation graph — with its pressed state exposed;
- the graph is directed, carrying one node per spec file and one edge per citing→cited file pair;
- one selection serves both projections [[spec-view-42](#spec-view-42)], revealed in both when it changes [[spec-view-43](#spec-view-43)], and neither projection ever leaves the screen for it ([DR-009](../decisions/009-at-hand-interaction.md));
- the two panes stand side by side only while the split's box holds a 320px graph beside a 28rem outline, and stack otherwise;
- the boundary between the two panes is draggable by pointer and by keyboard, never taking the graph below 320px or the outline below 28rem, and persists with the toggle.

#### spec-view-42

While the spec tree renders, the spec view shall hold one selection — a single package or none — written only by its own gestures and lasting the session, with the graph on screen or not ([DR-027](../decisions/027-linked-views-contract.md)):

- selecting gestures: activating a package row in the outline by click or Enter, and activating a graph node by click or Enter; re-activating the selected package re-selects it and re-fires its reveal [[spec-view-43](#spec-view-43)], except that activating the selected package's row while it is expanded collapses it, the selection standing;
- a package row follows the tree idiom: the row is the single focusable, selectable target across its full width — a pointer cursor and a hover tint over all of it, its focus ring around the whole row and shown for keyboard focus alone — carrying aria-expanded and the selection's marking, its chevron — a pointer target of at least 24px — and the Left/Right arrow keys arrange only, and arranging never selects, deselects, or moves the camera;
- the query and the lens never write the selection [[spec-view-4](#spec-view-4)] [[spec-view-5](#spec-view-5)];
- an in-view citation jump navigates items and never moves the package selection [[spec-view-6](#spec-view-6)];
- clearing gestures: Escape once the focused widget has nothing left to dismiss — search box, records list, floating card — from either pane, and a graph-canvas press released within the drag threshold;
- the outline marks the selected row in ink — a tinted fill and an ink outline drawn whole inside the row — and the graph marks its node with the solid ink halo and isolates its neighborhood [[spec-view-25](#spec-view-25)], neither mark in the interaction hue.

#### spec-view-43

When the selection changes to a package, the spec view shall reveal it in both projections, additively ([DR-027](../decisions/027-linked-views-contract.md), [DR-158](../decisions/158-a-legible-graph-and-outline.md)):

- in the outline, the package and its ancestors open and its row scrolls to the top of the rows clear of the heading row — writing the search's transient overlay while a search runs [[spec-view-5](#spec-view-5)], and re-firing after the search clears so the restore never hides the selection;
- in the graph, where the drawing scrolls sideways in its own box [[spec-view-59](#spec-view-59)], the box first scrolls the node into its visible width; then, only when the node and its label lie outside the viewport less the pinned package card's measured box [[spec-view-25](#spec-view-25)], the camera pans the least that brings them clear of both — downward past the card where nothing shorter clears it — and the pan neither zooms nor counts as the reader moving the camera [[spec-view-27](#spec-view-27)];
- while the selection holds, the graph's reveal runs again by the same rule whenever the pinned card's measured box changes — its citation list opening or closing, the language, the canvas;
- reveal only opens and scrolls; it never collapses, clears, or closes anything.

#### spec-view-44

While a search narrows the outline [[spec-view-5](#spec-view-5)], the spec view shall retain the selected package in the outline whatever the query matches ([DR-027](../decisions/027-linked-views-contract.md)):

- the retained row keeps its full selection emphasis with its ancestors standing, worded as shown despite the search in the grammar of [[spec-view-6](#spec-view-6)]'s reveals;
- on the graph, the selection halo and the query's match marks hold full strength together, isolation included [[spec-view-25](#spec-view-25)] [[spec-view-29](#spec-view-29)].

#### spec-view-22

While the graph renders a node, the spec view shall present the package by the encodings of [DR-026](../decisions/026-data-graphics-craft.md) as [DR-158](../decisions/158-a-legible-graph-and-outline.md) amends them, one variable per channel:

- the node's area carries its package's item count, within a bounded size range, and states that count as a numeral on the node;
- a package cited by a peer is filled solid, and a package no peer cites is drawn as a ring on a tinted fill — neither treatment using the hues reserved for interaction, status, or item groups;
- the node's basename labels it, haloed in the surface color where edges pass beneath, at the first of its places around the node — below, above, right of, left of it, then below or above flush with its rim on either side — that keeps 5px from every other circle, clears every other label, and keeps 10px inside the canvas, larger packages placing first and a place crossing fewer drawn edges preferred;
- a label with no such place stays hidden until its node takes hover, keyboard focus, or the selection [[spec-view-25](#spec-view-25)], and the node's accessible name carries the basename always;
- the numeral and the label never render below their legible floor, the fitted view included [[spec-view-27](#spec-view-27)] [[spec-view-28](#spec-view-28)].

#### spec-view-23

While the graph renders, the spec view shall draw the citations between packages by the encodings of [DR-026](../decisions/026-data-graphics-craft.md) as [DR-158](../decisions/158-a-legible-graph-and-outline.md) amends them:

- with no package selected, it draws the backbone alone: one undirected line per package pair whose citations in both directions total at least the threshold of [[spec-view-66](#spec-view-66)], and per package its heaviest pair — a tie going to the pair whose partner sorts first by name — in a mid-gray of uniform width with no direction glyph, so a linked package always draws a line and a node with none has no cross-file citation;
- with a package selected, it draws every citing→cited pair touching that package as a directed edge of uniform width ending in a glyph of constant size at the cited node's rim — the package's own citations in orange — a hue outside the reserved sets — its citers' in ink — a reciprocal pair as two offset edges, and no other edge, every edge meeting a ringed node — the selection's halo or the focus ring of [[spec-view-25](#spec-view-25)] — outside that ring so no ring covers a glyph;
- an edge's width carries no count; pair counts come from the citation index the outline's rollups share [[spec-view-19](#spec-view-19)], so a citation of an ID absent from the tree counts in no pair.

#### spec-view-24

While the graph renders, the spec view shall key every channel it encodes below the graph, as text that is no control and that the selection leaves unchanged ([DR-026](../decisions/026-data-graphics-craft.md), [DR-158](../decisions/158-a-legible-graph-and-outline.md)):

- the key names the two role treatments as cited by and not cited by other packages [[spec-view-22](#spec-view-22)], and nothing else;
- node size is read off the numeral each node states [[spec-view-22](#spec-view-22)], the selection's two edge hues off the line samples in its sentence above the graph [[spec-view-66](#spec-view-66)], each neighbor's counts off its label or the citation list [[spec-view-25](#spec-view-25)], and what the overview omits off its threshold sentence [[spec-view-66](#spec-view-66)].

#### spec-view-25

While the graph renders, the spec view shall emphasize by the selection [[spec-view-42](#spec-view-42)] alone, never moving or resizing a mark ([DR-027](../decisions/027-linked-views-contract.md), [DR-158](../decisions/158-a-legible-graph-and-outline.md)):

- the selected package keeps its own marks and its citation neighbors at full strength, every other node and label dims, and only the selection's edges draw [[spec-view-23](#spec-view-23)];
- each neighbor's label then carries its counts — `→N` for the selected package's citations of the neighbor, then `←N` for the neighbor's citations of the selected package, the order every other count in the view reads — each in its edge's hue;
- the selected package's card [[spec-view-26](#spec-view-26)] stands pinned at the graph's top-right corner, never moving with the marks, ending — where the selection has neighbors — in a control naming their number that opens and closes the citation list, named for what it does with its state exposed;
- the citation list carries column heads naming the two directions in the order every other count reads — what it cites, then what cites it — over every neighbor in descending order of its total with both counts, each entry's accessible name carrying both counts against the selected package;
- the list starts closed and stays open or closed as the reader left it across selections while the view stays open;
- the pinned card spans at most 224px or the visible width less 16px, and at most 45% of the canvas height, the list alone scrolling inside past that;
- each entry is reachable by keyboard and, while focused or hovered, lifts its node and its edges, and activating one selects that package [[spec-view-42](#spec-view-42)];
- hover and keyboard focus are inspection: they show the floating card [[spec-view-26](#spec-view-26)] and the focus ring and lift the inspected mark and its label to full strength — never dimming others, isolating, or selecting — and a click's focus is no inspection once the pointer leaves;
- keyboard focus reaches every node, with Enter selecting [[spec-view-42](#spec-view-42)];
- the query's match marks hold full strength through an isolation [[spec-view-29](#spec-view-29)];
- Escape follows the ladder of [[spec-view-42](#spec-view-42)] for the pointer and the keyboard alike: a floating card first — keyboard focus staying on its node, whose card returns only once focus moves to another node — then the selection, focus still staying.

#### spec-view-26

When a node or an edge takes hover or keyboard focus — focus a pointer's click gives counting only while the pointer stays — the spec view shall answer with a rendered card at hand ([DR-009](../decisions/009-at-hand-interaction.md), [DR-158](../decisions/158-a-legible-graph-and-outline.md)) rather than a native tooltip:

- a node's card names the package on one line; states on at most two lines, in ink, its item total, then its citations of other packages, then theirs of it, in the count grammar of an item row's citation summary [[spec-view-3](#spec-view-3)] — for a package in the foot row, that it has no citations with other packages [[spec-view-28](#spec-view-28)]; then breaks the total down by item group, one line per group in fixed order, each group's name in its fixed group color with its count in a column just past the longest name and a zero reading as a dash, as in [[spec-view-2](#spec-view-2)]; text cut to its line ends in an ellipsis, never a count, and reads whole in its accessible name and hover hint;
- the selected node raises no floating card, its card standing pinned [[spec-view-25](#spec-view-25)];
- an edge's card states in one sentence, in ink, that the citing package cites the cited one so many times, and a backbone line's card states one such sentence for each direction carrying citations, never an arrow between two names [[spec-view-23](#spec-view-23)];
- the card lies inside the graph pane, placed by its own measured size — never a guess at it — so a mark at any edge and a card of any height stay clear of the pane beside it, the controls above and the key below ([DR-041](../decisions/041-chrome-that-fits.md));
- a node's card stands above or below its node, wholly inside the visible canvas, at the place that covers least by this order of yielding: the pinned card first [[spec-view-25](#spec-view-25)], then the selected node and its label, then its own node's label, its own node last.

#### spec-view-27

While the graph renders, the spec view shall move a camera over a fixed layout rather than re-laying out the tree ([DR-026](../decisions/026-data-graphics-craft.md), [DR-158](../decisions/158-a-legible-graph-and-outline.md)):

- the camera fits the whole layout with padding when the graph opens — the fitted frame; when the tree, the pane size, or the toggle changes, the base fit recomputes and the reader's own pan and zoom re-compose over it, so a resize never discards their navigation;
- a reveal pan [[spec-view-43](#spec-view-43)] never counts as the reader's own camera move, and clearing the selection returns the camera to where it stood before the first reveal pan since the last clear, unless the reader moved the camera meanwhile;
- the camera pans by drag and zooms toward the pointer between the fitted frame and a detail limit, bounded so the view overlaps the fitted frame on each axis by at least half the view's own extent;
- an icon control in the canvas's bottom-right corner, named "Fit to window" by its title and accessible name, returns the camera to the fitted frame, disabled while the camera stands there.

#### spec-view-28

When the graph builds its picture, the spec view shall settle a deterministic arrangement and solve its presentation rather than tune it ([DR-027](../decisions/027-linked-views-contract.md)):

- the settled arrangement is a pure function of the tree and its rendered label extents — never of the pane or the threshold the reader sets — drawn by the pairs of the backbone at the default threshold alone [[spec-view-66](#spec-view-66)] [[spec-view-23](#spec-view-23)], computed to rest before first paint with no opening animation, holding a minimum separation between whole marks, each node's name included;
- the picture maps the arrangement onto the pane: positions span the drawing area within a bounded aspect relaxation, never beyond the bound, and the room reserved for the marks' own extents never takes more than half of the drawing area on either axis — a pane too short for its marks lets the marks at its edges reach past the edge rather than collapsing the picture onto a point;
- marks then take the largest single scale at which no circle-and-label mark touches another, solved exactly over pairs, with the 24px activation-target floor winning over overlap, the size cap applying last, and label widths capped with an ellipsis;
- a span too small to map falls back to the identity scale, centered;
- a node dragged follows the pointer while the rest adjusts live and comes to rest after release; a release that moved its node moves only that node, leaving the selection where it was [[spec-view-42](#spec-view-42)];
- dragged positions are never persisted, so reopening the graph restores the settled arrangement;
- a package with no cross-file citation in either direction stands outside the arrangement, in one row along the canvas's foot at the picture's scale with no rule or caption, and the picture maps the rest onto the area above it ([DR-158](../decisions/158-a-legible-graph-and-outline.md)).

#### spec-view-66

While the graph renders, the spec view shall stand above it a sentence setting the backbone's minimum pair total [[spec-view-23](#spec-view-23)] ([DR-158](../decisions/158-a-legible-graph-and-outline.md)):

- the sentence reads "Only pairs with ≥ N citations", N a number field whose stops run from 1 to the largest pair total and then a last stop drawing each package's heaviest pair alone, and adds "all pairs" at the first stop and "each package's strongest only" at the last;
- the field's up and down arrows, its arrow keys, and Home and End step to the next stop that draws a different set of lines, skipping every stop drawing what its neighbor below draws, an arrow disabled at its end;
- a typed number takes effect on Enter or leaving the field, clamped to the stops and shown as the lowest stop drawing the same lines;
- its default is the lowest stop whose backbone holds at most 1.5 pairs per linked package, the last stop when no other does;
- stepping changes only which lines draw, never a node's position [[spec-view-28](#spec-view-28)], and its value lasts while the view stays open, the default returning when the view reopens;
- while a package is selected the sentence yields to how many packages share citations with the selected one, followed by two line samples, each with its arrowhead, naming the selection's citations in orange and its citers' in ink [[spec-view-23](#spec-view-23)], the line keeping its height, and clearing the selection restores the value it held;
- nothing else stands above the graph.

#### spec-view-29

While the graph renders beside the outline, the spec view shall seat the item filters and the search box within the outline pane and scope them to it ([DR-026](../decisions/026-data-graphics-craft.md)):

- the graph's layout and its counts follow the whole tree, whatever the filters exclude [[spec-view-4](#spec-view-4)];
- an active search [[spec-view-5](#spec-view-5)] marks the packages holding matches on the graph without moving a node, the marks holding full strength through any isolation [[spec-view-25](#spec-view-25)].

### Records

#### spec-view-7

While the spec tree renders, the spec view shall keep the outline for the spec packages and serve the tree's records as reference beside it ([DR-027](../decisions/027-linked-views-contract.md), [DR-158](../decisions/158-a-legible-graph-and-outline.md)) — a reference line in the outline pane's footer naming the decision records with their count, `map.md` and `meta.md` — each opening in place of the view:

- the footer stands below the outline's scroll, outside it, whatever the search and the filters show, naming each document by its file and its use — `map.md` the index, `meta.md` the spec format — and the empty, file-less and legacy trees carry the same footer, the decision records' entry wherever decision records exist;
- the decision records' entry replaces the view with their list, newest first, behind a Back control returning to the specs: a heading with the count, a line saying the records hold the reasons the spec items cite, a filter matching each record's ID and title, and per record the record row the Dashboard's bands share [[dashboard-40](dashboard.md#dashboard-40)] — identifier chip, title, hover, pointer — with its summary line from `map.md` beneath where the index carries one, each row opening the record in the reader;
- the list keeps its filter and scroll position while a record it opened stands, and `map.md` and `meta.md` close it as reference documents;
- intent records do not appear anywhere in the view — they are work items, carried by the Dashboard's next-work lists [[dashboard-24](dashboard.md#dashboard-24)];
- when a record is picked, the view replaces itself with that record's rendered markdown behind a Back control naming where it returns — the decision records' list for a record opened from it, else the specs — and Back restores focus to the invoking control; the specs themselves stand untouched beneath any record or list, so returning finds the selection, expansion, outline scroll and graph camera as they were — a record requested from another surface leads Back there instead [[spec-view-57](#spec-view-57)];
- the reader carries an Edit control opening the record in the editor [[spec-view-48](#spec-view-48)];
- rendered Markdown omits HTML comments such as SPDX headers and source pins, while comment syntax inside code remains visible and raw source remains unchanged for editing [[spec-view-48](#spec-view-48)];
- links inside the reader keep the view's semantics [[spec-view-6](#spec-view-6)]: a path resolving to a record, `meta.md`, or `map.md` opens in the reader, an item citation leaves the reader and jumps to the item, and any other local link stays inert;
- the record fetch shows in progress, and any fetch failure shows with a retry.

#### spec-view-57

Where a record is requested from another surface with its origin — the surface, the project it was listed under, and the control that asked — the spec view shall open it in the reader [[spec-view-7](#spec-view-7)] behind a Back control naming that surface, whose activation closes the reader and hands the origin to the host, which returns to that surface with the origin's control scrolled into view and focused ([DR-009](../decisions/009-at-hand-interaction.md)):

| Origin surface | Back reads | The host returns to |
| --- | --- | --- |
| the Dashboard | "← Back to Dashboard" | the Dashboard |
| a project's Overview | "← Back to Overview" | that project's Overview tab, or the Dashboard when the project is no longer registered |

- the origin is kept with the reader through its fetch, its retry, and an edit closing back into it [[spec-view-48](#spec-view-48)];
- the origin's control is looked up within the project's group on the returned surface; a control no longer there leaves focus unmoved.

### Editor

#### spec-view-48

When an Edit control is activated — in the records reader, on an expanded package node, or on an item row — the spec view shall replace itself with an editor holding that file's whole text as `specs.read` served it ([DR-043](../decisions/043-minimal-spec-editing.md)):

- the header names the file's `specs/`-relative path and carries Cancel, Save — disabled while the draft equals the text as read or a save is in flight — and an Edit/Preview toggle exposing its pressed state via aria-pressed;
- Edit shows the draft in a labeled monospace text field with spell-checking off, taking focus on open; Preview renders the draft as the reader renders a record [[spec-view-7](#spec-view-7)], every link inert;
- opened from an item, the field lands its caret on the item's heading line, scrolled into view;
- Cmd/Ctrl+S saves [[spec-view-50](#spec-view-50)] and Escape cancels [[spec-view-49](#spec-view-49)];
- while the draft differs from the text as read, the editor and the Specs tab carry an unsaved mark;
- the view offers no Edit control where the host wires no write.

#### spec-view-49

While the editor's draft differs from the text as read, the spec view shall ask in place before discarding it ([DR-043](../decisions/043-minimal-spec-editing.md)):

- Cancel, Escape, and a conflict's Reload [[spec-view-50](#spec-view-50)] each show an inline confirm whose safe default keeps the draft, so an accidental Enter loses nothing;
- a draft equal to the text as read closes at once;
- a record requested from another surface [[spec-view-7](#spec-view-7)] opens in the reader beneath the standing editor, discarding nothing;
- the window's leave guard warns while any project's draft is unsaved.

#### spec-view-50

When Save is activated in the editor, the spec view shall write the draft under the token it read [[spec-view-47](#spec-view-47)] and act on the reply ([DR-043](../decisions/043-minimal-spec-editing.md)):

| Reply | Outcome |
| --- | --- |
| success | the editor closes into the reader for a record or the outline for a package, showing the saved text; the tree is re-read; the live region announces the save |
| `conflict` | the draft stays with a strip stating the file changed on disk since it was opened, offering Reload — re-fetch the file and replace the draft, asking first [[spec-view-49](#spec-view-49)] — and Overwrite — write again with no token |
| any other failure | the draft stays with the failure shown and a retry |

#### spec-view-51

While an editor stands for a project, the spec view shall keep its path, text as read, draft, token, and preview mode in the project's lifted view state, so the draft survives the workspace's own navigation — another tab, another project, another surface — and the editor returns as it was when the view remounts ([DR-043](../decisions/043-minimal-spec-editing.md)).

### Freshness

#### spec-view-8

While the spec view renders a read tree, the spec view shall show a manual refresh control labeled with the last read time in relative terms (e.g. "just now", "2m ago") — a save's re-read [[spec-view-50](#spec-view-50)] moving that label like any read — requesting a re-read and acknowledging it when the control is activated — its icon turning for at least 0.6 seconds however fast the read, and the label then stating for 2 seconds that the tree was read again before the relative time returns ([DR-010](../decisions/010-interface-craft.md) §3, §5).

### Empty and Degraded States

#### spec-view-9

Where the tree is absent or only partially parsed, the spec view shall degrade instructively and never render blank ([DR-011](../decisions/011-project-workspace.md)):

- with no `specs/` directory, an instructive empty state states what `specs/` holds and presents the command that scaffolds it (`npx @sublang/spex scaffold`) as a copyable block;
- a file that fails to parse renders a per-file notice inside its node while parsed content stays visible;
- tree-level notices render under the header.

#### spec-view-17

Where the project has no `specs/` directory, the spec view's empty state shall also offer the Academy example ([DR-015](../decisions/015-reference-content.md)) as one action that seeds and opens the example project:

- when the example's target is already a registered project, the action opens that project instead of failing;
- when seeding fails otherwise, the empty state shows the failure beside the offer and clears it on the next attempt.

#### spec-view-18

Where the project's `specs/` tree carries a legacy-generation directory other than `iterations/` [[scaffold-26](scaffold.md#scaffold-26)], whose records still list [[spec-view-14](#spec-view-14)], the spec view shall render a migration notice naming `npx @sublang/spex scaffold --update` as a copyable block instead of a package tree, with the records access of [[spec-view-7](#spec-view-7)] still standing ([DR-015](../decisions/015-reference-content.md)):

- the notice states that the command refreshes the spec law and prints a migration prompt for an AI agent to apply, since the command restructures nothing itself ([DR-022](../decisions/022-prompt-based-migration.md)), so the tree stays legacy — and this notice stays — until that migration lands.

### Records Parsing

#### spec-view-14

The core package shall list `specs/decisions/*.md` as decision records and the union of `specs/intents/*.md` and legacy `specs/iterations/*.md` as intent records ([DR-017](../decisions/017-intent-records.md)), sorted by filename:

- a legacy file whose basename reappears under `intents/` is omitted, and both the shadowing and the directory coexistence are reported as tree notices;
- differently named files sharing a leading number all list, with each duplicated record ID a tree notice;
- each record carries an ID formed from the record kind and the filename's leading number [[meta-22](../meta.md#meta-22)] (e.g. `DR-011`), a title taken from the file's first `#` heading minus any leading `DR-nnn:`/`IR-nnn:` prefix, and a path relative to `specs/`;
- each record additionally carries the first non-empty line of its `## Status` section, verbatim, as its status — absent when the file has no `## Status` section — together with the classification the core derives from the line's first word of letters, case-insensitively, and its last-change time — the last commit touching the file where Git tracks it, else the file's modification time ([DR-038](../decisions/038-history-is-done-work.md)):

| Leading word | Classification |
| --- | --- |
| done, complete, completed, closed, shipped, released, finished | finished, done |
| superseded, cancelled, canceled, dropped, abandoned, withdrawn | finished, superseded |
| any other word, or no status | open |

### Surface Fit

#### spec-view-59

The spec view shall scroll each of its forms — the outline beside the graph, the records reader [[spec-view-7](#spec-view-7)], and the editor [[spec-view-48](#spec-view-48)] — inside its own box, which fills the surface it is given and never grows past it, however long the tree ([DR-041](../decisions/041-chrome-that-fits.md)):

- each such box is a positioned box, so the screen-reader-only text, the graph's own card [[spec-view-26](#spec-view-26)], and a citation's preview [[spec-view-61](#spec-view-61)] are contained by the box they belong to rather than being carried by the page;
- each half of the graph split [[spec-view-20](#spec-view-20)] keeps a readable floor — the graph's at least 320px wide beside the outline, the outline's package tree never squeezed to nothing by its own filter row, the graph half holding one floor beside or below the outline with its drawing surface filling the half rather than resting at an svg's default — and the split scrolls as one where the surface cannot hold both floors, so what does not fit is reached rather than clipped away;
- where the graph pane is narrower than 320px, the graph's drawing keeps 320px and scrolls sideways inside its own box, faded at the edge it scrolls past, while the threshold sentence, the fit control, the pinned package card and the key stay within the pane's visible width.

## Internal Behavior

### Tree Parse

#### spec-view-10

When `specs.get` names a known project, the core package shall parse the project's `specs/` tree within that request — no file watcher, no cache — and reply with the parsed tree carrying its wall-clock read time, so the view can show data freshness:

- files are listed for the `packages/` collection [[meta-1](../meta.md#meta-1)], keyed by collection-relative path minus the extension, with collection subdirectories carried as navigation-only structure [[meta-31](../meta.md#meta-31)];
- each file's items keep document order, never sorted by ID;
- a tree carrying a legacy-generation directory other than `iterations/` [[scaffold-26](scaffold.md#scaffold-26)] is flagged legacy with no files parsed ([DR-015](../decisions/015-reference-content.md));
- a project with no `specs/` directory yields a reply stating absence with empty lists rather than a failure.

#### spec-view-11

The core package shall take a file's package identifier from its basename [[meta-10](../meta.md#meta-10)], carrying a notice on the file naming each disagreement with it:

- a `# <pack>: <Title>` heading whose `<pack>` differs from the basename is a disagreement;
- an item-ID prefix differing from the basename [[meta-11](../meta.md#meta-11)] is a disagreement.

#### spec-view-12

For each parsed item, the core package shall report the fields the view presents:

- the item's ID and its section-kind group — External Behavior external, Internal Behavior internal, Verification test — keeping the fixed three-group model ([DR-015](../decisions/015-reference-content.md));
- its containing `##` section heading, and its nearest `###` topic heading for `####` items;
- its full markdown body, and a one-line plain-prose digest of the body's first paragraph — enclosed citations dropped whole, plain links reduced to their text, inline-code backtick markers stripped with the content kept, and the punctuation gaps closed — cut at the first sentence end or line break;
- its citations, extracted in order and without duplicates from the enclosed inline item citations [[meta-16](../meta.md#meta-16)] of the body;
- for an item under a section outside the package grammar [[meta-30](../meta.md#meta-30)], the external group and a file notice naming the unexpected section.

#### spec-view-13

The core package shall return the first paragraph under `## Intent` [[meta-30](../meta.md#meta-30)] for every file that has one, on that file, together with the H1 title, so the view renders a file's summary without a second fetch.

### Degradation

#### spec-view-15

When the tree holds an unreadable or unparseable file or an entry outside the `specs/` layout, the core package shall still reply successfully, with every other file's parse intact:

- a file that cannot be read or parsed is carried with an error notice and possibly no items;
- entries directly under `specs/` outside the layout of [[meta-1](../meta.md#meta-1)] are ignored and listed in one tree-level notice.

### Confinement

#### spec-view-16

When `specs.get` walks the tree or `specs.read` or `specs.write` names a file, the core package shall confine every filesystem access to the project:

- the tree walk never follows a symlink that escapes the project directory, skipping such entries with a tree notice;
- `specs.read` and `specs.write` resolve the requested path strictly inside the project's `specs/` directory — rejecting absolute paths, `..` segments, non-`.md` targets, and symlink escapes with an `invalid_request` error, and replying `not_found` for a missing file, so a write never creates one — and on success `specs.read` replies with the file's raw markdown, its version token [[spec-view-47](#spec-view-47)], and its last-change time.

### Write

#### spec-view-47

When `specs.write` names a file with content, the core package shall replace the file's bytes atomically under a version token — a digest of the file's bytes — and reply with the token and last-change time of the bytes it wrote ([DR-043](../decisions/043-minimal-spec-editing.md)):

- `specs.read` hands out the file's current token beside its markdown; the token follows the bytes alone, so a checkout touching the file without changing it keeps the token;
- a write carrying a `baseVersion` differing from the file's current token is refused as a `conflict` with the file unchanged, and a write carrying none is unconditional;
- the content lands as sent — no trailing newline added or removed — through a staged sibling dotfile renamed over the original with its mode preserved, so no reader sees a partial file and no stage file outlives the write;
- content identical to the file's bytes writes nothing and replies with the same token.

## Verification

### Parse Coverage

#### spec-view-30

Where a fixture tree defines package files at the collection root and nested in a collection subdirectory, the test suite shall parse the tree and assert the parse contract of [[spec-view-10](#spec-view-10)]:

- files are keyed by collection-relative path, and collection subdirectories carry no semantic grouping;
- items keep document order when it differs from ID order;
- a fixture tree is flagged legacy with no files for a group directory, a retired collection, and each directory the classification adds beyond them [[spec-view-10](#spec-view-10)].

#### spec-view-31

Where a fixture file's `# <pack>: <Title>` heading and its item-ID prefixes disagree with its basename, the test suite shall assert that the basename wins as the package identifier, with a notice naming each disagreement [[spec-view-11](#spec-view-11)].

#### spec-view-32

Where fixture items sit under the package sections, under topic headings, and carry enclosed item citations and fenced code blocks, the test suite shall assert the item fields of [[spec-view-12](#spec-view-12)]: section-kind group mapping, topic attribution for `####` items, digest truncation at the first sentence end, the digest reduced to plain prose — an enclosed citation dropped whole, a plain link reduced to its text, inline-code markers stripped, and the punctuation gaps closed — ordered de-duplicated citation extraction, and that fenced `###` lines start no item and fenced links never cite.

#### spec-view-33

Where a file carries a multi-line first paragraph under `## Intent` followed by further paragraphs, the test suite shall assert that the file's intent is the first paragraph only, joined to one line [[spec-view-13](#spec-view-13)].

### Records Coverage

#### spec-view-34

Where fixture decision and intent files carry prefixed and unprefixed `#` headings, plus one `## Status` section whose first non-empty line starts with "done", one whose line does not, and one file with no Status section, the test suite shall assert record IDs formed from filename numbers, titles with any `DR-nnn:`/`IR-nnn:` prefix stripped, `specs/`-relative paths, and filename ordering [[spec-view-14](#spec-view-14)], and that each record's status is its Status section's first non-empty line verbatim — absent for the file without one — with only the "done"-led line marking its record finished [[spec-view-14](#spec-view-14)].

#### spec-view-63

Where a fixture project is a Git work tree holding a dated and an undated intent record committed more than a day ago, every file's modification time then set to the present, beside one untracked undated record, the test suite shall assert the last change of [[spec-view-14](#spec-view-14)] case by case:

- each committed record reads its commit's time, the dated status line kept verbatim;
- the untracked record reads its file's modification time;
- outside any work tree every record reads its file's modification time;
- `specs.get` serves a committed record's last change as its commit's time.

### Degradation Coverage

#### spec-view-35

Where a fixture tree contains an unreadable file and unknown entries directly under `specs/`, the test suite shall assert the degraded parse of [[spec-view-15](#spec-view-15)]:

- the parse still succeeds, carrying a per-file error for the unreadable file and one tree notice listing the unknown entries;
- every other file's parse stays intact [[spec-view-10](#spec-view-10)];
- a fixture project with no `specs/` directory yields a reply stating absence with empty lists [[spec-view-10](#spec-view-10)].

#### spec-view-58

Where the workspace serves a project whose tree states absence with empty lists [[spec-view-10](#spec-view-10)], when the Specs tab is shown, the test suite shall assert that the empty state renders with its scaffold command and that the tab stands as the shown one [[spec-view-9](#spec-view-9)]:

- the view reads the tree's lists as it renders, so a reply carrying none at all takes the surface down instead of degrading — the state this item exists to hold.

### Citation Coverage

#### spec-view-37

Where a fixture tree carries a package item citing a peer's item, an intra-file citation, a citation of an absent ID, and a test item citing the behavior items it verifies, the test suite shall assert the citation presentation of [[spec-view-19](#spec-view-19)]:

- outbound rows name each cited item in document order, and grouped inbound backlinks sit on each cited target, the intra-file entries included, the two rows standing in one block whose labels share a column [[spec-view-19](#spec-view-19)];
- an entry raises no native tooltip: a settled hover raises the card naming the cited item, its statement carried once, a pointer that leaves first raises nothing, keyboard focus raises it at once and blur drops it, Escape drops it, a second entry leaves one card standing, an ID absent from the tree reads as not in the tree, an inline body citation raises the same card while a record link raises none, and the entry's jump drops it [[spec-view-61](#spec-view-61)];
- outbound rows mark the absent-ID entry unresolved, and backlinks list every entry without a toggle [[spec-view-19](#spec-view-19)];
- every file node, collapsed included, carries the rollup counting cross-file citations only, the absent-ID citation counted in neither direction and shown as the file's unresolved count [[spec-view-19](#spec-view-19)];
- a settled hover or keyboard focus on an item's citation summary raises the summary card listing at most five items per direction with a line counting the rest, Escape closes it with focus kept, and activating the summary expands the item and moves focus onto its citation block [[spec-view-60](#spec-view-60)];
- an in-view jump lands from an outbound row, from a backlink and from a package's intent, and the return control at the outline's head, Alt+Left and the pointer's back button each walk back one jump to the place it left, successive jumps returning in reverse order with the control stating the steps it holds, a repeated jump from one place recording it once, and selecting a package clearing the record [[spec-view-6](#spec-view-6)];
- a jump target excluded by an active search is revealed and marked [[spec-view-6](#spec-view-6)].

#### spec-view-65

Where a fixture tree carries packages under every section kind with a topic heading and a group holding no item in some package, the test suite shall assert the outline's columns, filters and controls:

- each package row carries its counts as numerals in group-colored columns with a zero reading as a dash, each count's accessible name carrying its group's full name, under one heading row naming each column [[spec-view-2](#spec-view-2)];
- an expanded package heads its items by each section's group full name and count and its topics by their own words, and no item row carries a group word [[spec-view-2](#spec-view-2)] [[spec-view-3](#spec-view-3)];
- an expanded package's items heading states its item count under a rule above it alone and holds the expand-all control and the edit control, each named for the items or the spec file it acts on [[spec-view-2](#spec-view-2)];
- the graph's toggle ends the graph's own line while the graph shows and heads the outline's filter row while it is hidden [[spec-view-20](#spec-view-20)];
- activating the refresh control turns its icon for at least 0.6 seconds and then states for 2 seconds that the tree was read again [[spec-view-8](#spec-view-8)];
- the toggles carry the full names and definitions with aria-pressed, each led by its checkbox filled when pressed and empty when not, and turning a group off removes its column and heading, keeps every package standing, and raises the status line whose control turns every group back on [[spec-view-4](#spec-view-4)].

### Graph Coverage

#### spec-view-21

Where a fixture tree carries cross-file citations, the test suite shall assert the toggle round trip: the outline renders with the toggle off and the graph joins it with the toggle on, carrying one node per file and one directed edge per citing→cited pair [[spec-view-20](#spec-view-20)], the toggle's state survives a remount with the rest of the view state [[spec-view-20](#spec-view-20)], selecting a node reveals its package in the outline while the outline stays on screen [[spec-view-43](#spec-view-43)], activating a package row selects it on the graph [[spec-view-42](#spec-view-42)], the divider moves the split within its bounds [[spec-view-20](#spec-view-20)], and a canvas press released within the drag threshold clears the selection [[spec-view-42](#spec-view-42)].

#### spec-view-38

Where a fixture tree carries packages of differing item counts, pairs of light and heavy citation weight, a reciprocally citing pair, a citation of an absent ID, and a package no citation reaches, the test suite shall assert the graph's encodings:

- node areas are ordered by item count with each count stated on its node [[spec-view-22](#spec-view-22)], and the cited and uncited role treatments are distinguished without the reserved hues [[spec-view-22](#spec-view-22)];
- at rest, only the backbone's pairs draw, each as one line of uniform width with no direction glyph, and a light pair outside it draws nothing [[spec-view-23](#spec-view-23)], every node with no line carrying no cross-file citation [[spec-view-23](#spec-view-23)];
- the threshold sentence defaults to the lowest stop holding at most 1.5 pairs per linked package — the last stop for a tree whose every pair totals one; stepping down reaches 1, drawing every pair while no node moves, each step changing the lines drawn, a typed stop drawing the same lines as a lower one reads as that lower one, and a selection replaces the sentence with the count of packages sharing citations with it and its two line samples in the edges' hues until clearing restores its value [[spec-view-66](#spec-view-66)];
- with a package selected, its pairs draw as directed edges of uniform width with a constant-size glyph, its own and its citers' in their two hues, the reciprocal pair as two offset edges, and no other edge draws [[spec-view-23](#spec-view-23)] [[spec-view-25](#spec-view-25)];
- each neighbor's label carries its `←N` and `→N`, the counts agreeing with the outline's rollups and the absent-ID citation counted in neither [[spec-view-25](#spec-view-25)] [[spec-view-23](#spec-view-23)];
- the selection's package card stands pinned at the canvas's top-right with its counts in ink and its citation list closed; opened, the list names every neighbor by descending total under its two column heads within the card's bounded height, focusing an entry lifts its node, activating one selects that package and leaves the list open, and a list closed stays closed for the next selection [[spec-view-25](#spec-view-25)];
- the key names the two roles alone, holds no control, and reads the same under a selection [[spec-view-24](#spec-view-24)], while the fit icon stands in the canvas, disabled at the fitted frame and enabled once the camera moves [[spec-view-27](#spec-view-27)].

#### spec-view-39

Where the graph renders in the light and the dark theme, the test suite shall assert that every resting mark and every text mark clears its contrast floor as a computed composite of its own color, its opacity, and the theme's surface — the marks of [[spec-view-22](#spec-view-22)] and [[spec-view-23](#spec-view-23)], the numeral and label of [[spec-view-22](#spec-view-22)], the legend of [[spec-view-24](#spec-view-24)], and the selection sentence's two line samples [[spec-view-66](#spec-view-66)] — with only a dimmed mark [[spec-view-25](#spec-view-25)] exempt.

#### spec-view-40

Where a fixture tree renders twice in one pane and once in a pane too short for its marks, the test suite shall assert the picture contract of [[spec-view-28](#spec-view-28)] and the label placement of [[spec-view-22](#spec-view-22)]:

- both renders settle identical node positions, with every node at or above its activation-target floor [[spec-view-28](#spec-view-28)];
- at the fitted view, no shown label lies within 5px of another node's circle, overlaps another shown label, or lies within 10px of the canvas edge, and a node whose label is hidden shows it on taking keyboard focus [[spec-view-22](#spec-view-22)];
- a drag moves its node without taking the selection, and a dragged node's positions are gone after a remount [[spec-view-28](#spec-view-28)];
- a package no citation reaches stands in the foot row with no caption, below every arranged node, and its card's second line says it has no citations with other packages [[spec-view-28](#spec-view-28)] [[spec-view-26](#spec-view-26)];
- in a pane too short for its marks the positions still span half the drawing area's height [[spec-view-28](#spec-view-28)].

#### spec-view-41

Where a fixture tree renders with the graph on, the test suite shall assert the contract's axis independence: expanding a second package by chevron leaves the selection where it was and collapsing either never clears it [[spec-view-42](#spec-view-42)], a citation jump flashes its target without moving the selection [[spec-view-42](#spec-view-42)], a search typed over a selection retains the selected package at full emphasis with the shown-despite wording [[spec-view-44](#spec-view-44)], match marks hold full strength while the selection isolates [[spec-view-25](#spec-view-25)], keyboard focus lifts a dimmed mark and shows its card without isolating, and Enter selects [[spec-view-25](#spec-view-25)], the Escape ladder dismisses card then selection from either pane [[spec-view-42](#spec-view-42)], by the keyboard closing a focused node's card with focus kept and then the selection with that card staying closed until focus moves on [[spec-view-25](#spec-view-25)], a node's card states its name, its item total with citation counts, and its per-group breakdown in the pinned card's lines [[spec-view-26](#spec-view-26)], an edge's card states its citation count [[spec-view-26](#spec-view-26)], a click that selects a node shows only the pinned card once the pointer leaves, and hovering or focusing the selected node raises no second card [[spec-view-26](#spec-view-26)], another node's card under a selection stands clear of that node's circle and, where room allows, of the pinned card [[spec-view-26](#spec-view-26)], the camera's control restores the fitted frame after a pan and a pan never leaves less than half the view over that frame [[spec-view-27](#spec-view-27)], and a filter toggle leaves the graph's counts whole [[spec-view-29](#spec-view-29)].

### Records Coverage (View)

#### spec-view-45

Where a fixture tree carries decision records — once alongside package files and once with none — the test suite shall assert the records access of [[spec-view-7](#spec-view-7)]: the footer's decision records entry carries the count in both fixtures and no decision record stands in the outline [[spec-view-7](#spec-view-7)], no intent record appears anywhere in the view [[spec-view-7](#spec-view-7)], the entry opens the list newest first with each row's summary from `map.md`, its filter narrowing to a matching ID [[spec-view-7](#spec-view-7)], a record row — the identifier chip, the title, named as an opener under a pointer — opens the reader whose Back returns to the list with its filter standing, and the list's Back returns to the specs with the expanded package and outline scroll as they were [[spec-view-7](#spec-view-7)], a record requested with a Dashboard origin opens behind "← Back to Dashboard" whose activation closes the reader and hands that origin to the host [[spec-view-57](#spec-view-57)], the outline pane's footer opens `map.md` and `meta.md` in the reader, a search narrowing the outline to nothing and the file-less fixture included [[spec-view-7](#spec-view-7)], a package whose intent cites a decision record carries, expanded, that record's link opening the reader while its collapsed line reads the link's text only [[spec-view-2](#spec-view-2)] [[spec-view-6](#spec-view-6)], and a record-internal item citation leaves the reader and lands on the item [[spec-view-7](#spec-view-7)].

### Editor Coverage

#### spec-view-64

Where a fixture spec contains block and inline HTML comments, literal comment examples in code, and escaped HTML, when the view renders its item or opens its record and editor preview, the test suite shall assert that comments are absent, code examples remain visible, and HTML is not executed [[spec-view-3](#spec-view-3)] [[spec-view-7](#spec-view-7)], while editing and saving a prose change preserves the complete source comments [[spec-view-48](#spec-view-48)] [[spec-view-50](#spec-view-50)].

#### spec-view-53

Where a fixture tree renders with a write wired and fixture reads serving text with tokens, the test suite shall assert the editor: the reader's, an expanded package's, and an item row's Edit controls open the editor on their file [[spec-view-7](#spec-view-7)] [[spec-view-2](#spec-view-2)] [[spec-view-3](#spec-view-3)] [[spec-view-48](#spec-view-48)], the item's open lands the caret on its heading line [[spec-view-48](#spec-view-48)], Save is disabled until the draft changes and Preview renders the draft with links inert [[spec-view-48](#spec-view-48)], Save writes under the read's token, closes into the reader or the outline, re-reads the tree, and announces [[spec-view-50](#spec-view-50)], a `conflict` reply shows the strip whose Reload re-fetches after a confirm and whose Overwrite writes without a token [[spec-view-50](#spec-view-50)], Cancel on a changed draft asks first and a clean draft closes at once [[spec-view-49](#spec-view-49)], and a remount restores the draft from the lifted view state [[spec-view-51](#spec-view-51)].

### Confinement Coverage

#### spec-view-36

Where a fixture project contains a symlink escaping the project and `specs.read` and `specs.write` requests carry `..` segments, absolute paths, non-`.md` targets, and missing files, the test suite shall assert the confinement of [[spec-view-16](#spec-view-16)]: the tree walk skips the escaping symlink with a notice, each malformed read or write is rejected as `invalid_request`, the missing-file read and write reply `not_found` with no file created, and a valid in-tree path returns the file's raw markdown with its token over the protocol.

### Write Coverage

#### spec-view-52

Where a fixture project carries a package file read over the protocol, the test suite shall assert the write of [[spec-view-47](#spec-view-47)]: a write under the read's token replaces the bytes and a following read repeats the write's token; a write under a stale token is refused as `conflict` with the bytes unchanged; a write with no token lands; content identical to the file replies with the same token; a write without a trailing newline keeps the file without one; and no stage file remains beside the written file.

### Browser Journeys

#### spec-view-46

Where the browser journey harness ([DR-039](../decisions/039-browser-acceptance-journeys.md)) boots the served shell with the Academy example seeded and current, when the journey opens the Specs tab, the test suite shall assert the spec view through the page: the outline lists the tree's packages [[spec-view-1](#spec-view-1)] and the footer names its decision records [[spec-view-7](#spec-view-7)]; expanding a package shows its items and an item's citation activates a jump that lands on the cited item [[spec-view-2](#spec-view-2)] [[spec-view-6](#spec-view-6)]; typing in the filter box narrows the outline to matching items with the match count shown, and clearing it restores the outline [[spec-view-5](#spec-view-5)]; the graph toggle adds the citation graph beside the outline and removes it again [[spec-view-20](#spec-view-20)].

#### spec-view-54

Where the browser journey harness ([DR-039](../decisions/039-browser-acceptance-journeys.md)) boots the served shell with the Academy example seeded, when the journey opens a decision record from the Specs decision records' list and activates Edit, the test suite shall assert editing through the page: the editor opens on the record with its path named and Save disabled [[spec-view-48](#spec-view-48)]; a changed line shows under Preview [[spec-view-48](#spec-view-48)]; the editor carries no serious or critical accessibility violation in either mode; Save lands the change in the file on disk, the reader shows it, and the decision records' list title follows the re-read [[spec-view-50](#spec-view-50)]; and Edit from an expanded item — the last item of the demo's longest package, below many soft-wrapped lines — opens the package file with the caret on the item's heading line and that line inside the field's visible box [[spec-view-3](#spec-view-3)] [[spec-view-48](#spec-view-48)].

#### spec-view-62

Where the browser journey harness ([DR-039](../decisions/039-browser-acceptance-journeys.md)) boots the served shell with the Academy example seeded, when the journey opens the Specs tab and expands an item carrying citations, the test suite shall assert the preview at hand through the page: a settled hover on an outbound entry raises the card naming the cited item within a fraction of a second and the pointer leaving drops it [[spec-view-61](#spec-view-61)]; keyboard focus on an item citation inside the rendered body raises it at once and Escape drops it [[spec-view-61](#spec-view-61)]; and while the card stands it lies inside the outline's scrolling box with the page scrolling in neither direction [[spec-view-61](#spec-view-61)] [[spec-view-59](#spec-view-59)].

#### spec-view-56

Where the browser journey harness ([DR-039](../decisions/039-browser-acceptance-journeys.md)) boots the served shell with the demo project registered, when the journey opens the Specs tab with the graph shown and one package expanded at the widths 320, 480, 640, 800, 1024, and 1280 pixels, each at 800 and 400 pixels tall, with the sidebar collapsed and, from 480 pixels, open ([DR-041](../decisions/041-chrome-that-fits.md)), the test suite shall assert fit through the page, naming every offending element: no element outside a sideways-scrolling canvas is wider than its box, the surface scrolls inside its own box with nothing positioned past the viewport uncontained [[spec-view-59](#spec-view-59)], within every list row no two visible siblings overlap and every child lies inside its parent [[spec-view-1](#spec-view-1)] [[spec-view-55](#spec-view-55)] [[spec-view-3](#spec-view-3)], and every control keeps its accessible name at every size [[spec-view-1](#spec-view-1)]:

- at the 320-pixel floor in a 400-pixel-tall window, the outline's package tree stands with a height a row can be read in and scrolls to the rest [[spec-view-59](#spec-view-59)];
- at every size, the graph half stands at least as tall as its floor and, beside the outline, as the split's box and at least 320px wide beside an outline at least 28rem wide, with its drawing surface filling the half less its legend [[spec-view-20](#spec-view-20)] [[spec-view-59](#spec-view-59)];
- the package rows' count columns and their pinned heading row hold a long package name and four-digit counts without overlap, the headings reading their short names below 28rem and a nonzero unresolved count staying shown [[spec-view-2](#spec-view-2)] [[spec-view-1](#spec-view-1)];
- selecting a node lands its package row wholly below the heading row with its selection outline wholly inside the outline's scroll box [[spec-view-43](#spec-view-43)] [[spec-view-42](#spec-view-42)], and scrolling partway through that expanded package keeps its header pinned directly beneath the heading row [[spec-view-2](#spec-view-2)];
- a package node at each edge of the graph pane answers, on taking focus, with a card lying wholly inside that pane [[spec-view-26](#spec-view-26)];
- selecting the package nearest the fitted frame's top-right corner, with packages along the foot, shows the node and its label clear of the pinned package card at every size without zooming, with the card's citation list closed and again once opened, the view overlapping the fitted frame by at least half on each axis, and clearing the selection returns the camera to the fitted frame [[spec-view-43](#spec-view-43)] [[spec-view-25](#spec-view-25)] [[spec-view-27](#spec-view-27)];
- at 320 pixels with the sidebar collapsed, only the graph's drawing scrolls sideways, the threshold sentence, the fit control, the pinned card and the key lying inside the pane's visible width, and after a selection the node and the card both lie in it [[spec-view-59](#spec-view-59)] [[spec-view-43](#spec-view-43)];
- at 320 by 400 pixels, in English and in Chinese, with a selection's citation list open, the pinned card lies wholly in the visible canvas within 45% of its height with its own lines unclipped and the selected node and its label clear of it, and another node mid-canvas taking hover or focus raises a card lying wholly in the canvas whose measured height fits the larger side above or below that node and which covers none of that node's circle [[spec-view-25](#spec-view-25)] [[spec-view-26](#spec-view-26)].
