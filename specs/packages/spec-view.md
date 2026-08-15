<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# spec-view: Spec View

## Intent

This spec covers the per-project spec view — its user-visible behavior, the implementation of its data plane, and the coverage that verifies that data plane.
The view is a read-only, interactive outline of the current project's `specs/` tree, pinned as the workspace's Specs tab, spanning the outline's shape, package and item presentation, group filters and search, citation navigation, the records reader, freshness, and the empty state.
Its data plane — the `specs.get` tree parse and the `specs.read` record fetch served by the core package — is exercised for coverage against fixture spec trees written to temporary project directories.

## External Behavior

### Tree

#### spec-view-1

When the spec view is opened for a project whose `specs/` tree has been read, the spec view shall present the tree as a left-rooted collapsible outline of the `packages/` collection ([DR-015](../decisions/015-reference-content.md)) — organized by spec files, never by item grouping at the top level ([DR-011](../decisions/011-project-workspace.md)):

- the outline nests collection subdirectories and file nodes, with directory levels expanded and file nodes collapsed by default;
- directories are ordered by name, and files by basename within their directory.

### Package Nodes

#### spec-view-2

While a file node is displayed, the spec view shall present the package's header and expanded contents:

- the header shows the package-identifier chip, the file's intent — truncated to one line only while the node is collapsed — and per-group item counts in the fixed group colors — external sky, internal fuchsia, test teal ([DR-015](../decisions/015-reference-content.md)) — where every count carries its group word and an aria-label, a zero count renders muted rather than absent, and color is never the only channel ([DR-010](../decisions/010-interface-craft.md) §7, §8);
- expanded, the node shows the file's intent in full followed by its items in document order, with the file's `##` section values preserved as sub-headings wherever the section changes between consecutive items — never sorted by ID [[meta-12](../meta.md#meta-12)] — along with any file consistency notices;
- expanded, the node offers a per-file control that expands or collapses every item body at once.

### Items

#### spec-view-3

While an item row is displayed, the spec view shall render the row by its expansion state:

- collapsed, the row shows the item's ID chip in its group color, its group tag, its first line, and a muted hint counting its outbound citations and inbound backlinks;
- expanded, the row renders the item's full markdown body with horizontal overflow contained and its citations as outbound rows and grouped inbound backlinks per [[spec-view-19](#spec-view-19)], every entry an in-view link;
- when the ID chip is activated, the view copies the item ID to the clipboard and acknowledges with a transient tick ([DR-010](../decisions/010-interface-craft.md) §3).

### Citation Rows

#### spec-view-19

While an expanded item carries citations or is cited, the spec view shall present them as plain inbound and outbound item citations, with no derived classes and no relationship metadata in the protocol:

- outbound rows list the item's citations in document order, each entry named by the cited item ID;
- inbound citations render as grouped backlink rows on the cited target, each entry named by the citing item ID;
- every file node, collapsed included, carries a rollup counting the file's inbound and outbound cross-file item citations — those whose source and target items live in different files, with an outbound citation of an ID absent from the tree counting as cross-file — while item rows and backlink groups keep every citation regardless of file;
- a record link in an item body stays a plain link, handled per [[spec-view-6](#spec-view-6)].

### Filters

#### spec-view-4

When a group filter toggle is activated, the spec view shall hide or restore that group's items while keeping every package node in the outline ([DR-011](../decisions/011-project-workspace.md)):

- a package whose items are all filtered away stays visible and, when expanded, states that no items are in the active groups;
- the three group toggles carry project-wide item counts in the group colors, expose their pressed state via aria-pressed, and default to all-on.

### Search

#### spec-view-5

While the spec view's filter box contains text, the spec view shall narrow the outline to the matching items:

- only items whose ID (matched case-insensitively) or text matches are shown, with the current match count displayed;
- packages containing matches auto-expand without persisting that expansion;
- clearing the box restores the expansion state from before the search.

### Citation Jumps

#### spec-view-6

When a local link inside the view is activated, the spec view shall resolve it against the citing file's `specs/`-relative path and act by target ([DR-011](../decisions/011-project-workspace.md)):

- an item citation or a backlink expands the target item's ancestors, reveals the target even when its group filter is toggled off or an active search excludes it — marking it as shown despite the filter or search — and scrolls to and briefly highlights it, without leaving the view;
- after an in-view jump, the view offers a one-step return to the citing item, its keyboard reach and announcement already legislated ([DR-010](../decisions/010-interface-craft.md) §6, §7);
- a cited ID that does not exist in the tree shows a transient "not found" note beside the activated link and does not navigate;
- a link resolving to a decision or intent record's exact path, or to the tree's own `meta.md`, opens that record in the records reader [[spec-view-7](#spec-view-7)];
- any other local link stays inert.

### Citation Graph

#### spec-view-20

While the spec tree renders, the spec view shall keep the outline permanent and add the citation graph beside it while the graph toggle is on ([DR-026](../decisions/026-data-graphics-craft.md)):

- the toggle defaults off and persists with the rest of the project's view state;
- the graph is directed, carrying one node per spec file and one edge per citing→cited file pair;
- one selection serves both projections: choosing a package in the graph expands that file in the outline and scrolls it into view, and leaves the surfaces on screen unchanged ([DR-009](../decisions/009-at-hand-interaction.md));
- activating empty graph space clears the selection.

#### spec-view-22

While the graph renders a node, the spec view shall present the package by the encodings of [DR-026](../decisions/026-data-graphics-craft.md), one variable per channel:

- the node's area carries its package's item count, within a bounded size range, and states that count as a numeral on the node;
- a package cited by a peer is filled solid, and a package no peer cites is drawn as a ring on a tinted fill — neither treatment using the hues reserved for interaction, status, or item groups;
- the node's basename labels it, haloed in the surface color where edges pass beneath;
- the numeral and the label hold their legible size on screen whatever the camera's zoom [[spec-view-27](#spec-view-27)].

#### spec-view-23

While the graph renders an edge, the spec view shall carry the citing→cited relationship by the encodings of [DR-026](../decisions/026-data-graphics-craft.md):

- the edge's width carries the pair's cross-file citation count on a scale independent of the tree, so widths compare across trees;
- the edge shows its direction at rest, as a glyph of constant size at the cited node's rim whose size never follows the edge's width;
- a reciprocally citing pair draws as two offset edges, never one edge with two heads.

#### spec-view-24

While the graph renders, the spec view shall carry a legend naming every channel it encodes and every gesture it answers ([DR-026](../decisions/026-data-graphics-craft.md)): the two role treatments [[spec-view-22](#spec-view-22)], what node size and edge width count [[spec-view-22](#spec-view-22)] [[spec-view-23](#spec-view-23)], and the pointer and keyboard affordances of [[spec-view-25](#spec-view-25)] and [[spec-view-27](#spec-view-27)].

#### spec-view-25

While the graph renders, the spec view shall emphasize one package at a time through dimming alone — never recoloring, resizing, or moving a mark — under the precedence of [DR-026](../decisions/026-data-graphics-craft.md):

- a selected package holds the emphasis as the stable base state, and pointer transit over the canvas never displaces it, hover taking the emphasis only after a settling delay and surrendering it on leaving;
- keyboard focus reaches every node, carries the app's focus ring, and takes the emphasis the way hover does, with Enter opening the focused package [[spec-view-20](#spec-view-20)];
- the emphasized package keeps its own marks and its citation neighbors at full strength while every other mark dims;
- Escape dismisses a hover emphasis, then a selection.

#### spec-view-26

When a node or an edge takes hover or keyboard focus, the spec view shall answer with a rendered card at hand ([DR-009](../decisions/009-at-hand-interaction.md)) rather than a native tooltip:

- a node's card names the package, states the item total its size encodes, breaks that total down by item group as a list in the fixed group colors and count grammar of [[spec-view-2](#spec-view-2)], and states the file's inbound and outbound cross-file citation counts;
- an edge's card names the citing and cited packages and states the citation count its width encodes [[spec-view-23](#spec-view-23)].

#### spec-view-27

While the graph renders, the spec view shall move a camera over a fixed layout rather than re-laying out the tree ([DR-026](../decisions/026-data-graphics-craft.md)):

- the camera fits the whole layout with padding when the graph opens, and re-fits when the tree, the pane size, or the toggle changes, until the reader moves it;
- the camera pans by drag, zooms toward the pointer, and is bounded between the fitted whole and a detail limit, so the layout can never leave the canvas;
- a labeled control returns the camera to the fitted whole, with double-click as its shortcut.

#### spec-view-28

When the graph builds its layout, the spec view shall settle a deterministic layout before the first paint and reheat it only under the reader's hand ([DR-026](../decisions/026-data-graphics-craft.md)):

- the settled layout is a function of the tree and its rendered label extents, so the same tree renders the same picture with no opening animation;
- a node dragged follows the pointer while the rest of the layout adjusts live, and the layout comes to rest after release;
- dragged positions are never persisted, so reopening the graph restores the settled layout;
- a package no citation reaches is held on the canvas with the rest.

#### spec-view-29

While the graph renders beside the outline, the spec view shall seat the item filters and the search box within the outline pane and scope them to it ([DR-026](../decisions/026-data-graphics-craft.md)):

- the graph's layout and its counts follow the whole tree, whatever the filters exclude [[spec-view-4](#spec-view-4)];
- an active search [[spec-view-5](#spec-view-5)] marks the packages holding matches on the graph without moving a node.

### Records

#### spec-view-7

When the records footer line ("N decisions · M intents · meta") is activated, the spec view shall open an at-hand list of the tree's decision and intent records and its `meta.md`, each by ID and title ([DR-009](../decisions/009-at-hand-interaction.md)), closable with Escape:

- when a record is picked, the view replaces itself with that record's rendered markdown behind a Back control;
- the record fetch shows in progress, and any fetch failure shows with a retry.

### Freshness

#### spec-view-8

While the spec view renders a read tree, the spec view shall show a manual refresh control labeled with the last read time in relative terms (e.g. "just now", "2m ago"), requesting a re-read and acknowledging the read in flight when the control is activated ([DR-010](../decisions/010-interface-craft.md) §3, §5).

### Empty and Degraded States

#### spec-view-9

Where the tree is absent or only partially parsed, the spec view shall degrade instructively and never render blank ([DR-011](../decisions/011-project-workspace.md)):

- with no `specs/` directory, an instructive empty state states what `specs/` holds and presents the scaffold command (`npx @sublang/spex`) as a copyable block;
- a file that fails to parse renders a per-file notice inside its node while parsed content stays visible;
- tree-level notices render under the header.

#### spec-view-17

Where the project has no `specs/` directory, the spec view's empty state shall also offer the Academy example ([DR-015](../decisions/015-reference-content.md)) as one action that seeds and opens the example project:

- when the example's target is already a registered project, the action opens that project instead of failing;
- when seeding fails otherwise, the empty state shows the failure beside the offer and clears it on the next attempt.

#### spec-view-18

Where the project's `specs/` tree carries a legacy-generation directory other than `iterations/` [[scaffold-26](scaffold.md#scaffold-26)], whose records still list [[spec-view-14](#spec-view-14)], the spec view shall render a migration notice naming `npx @sublang/spex scaffold --update` as a copyable block instead of a tree ([DR-015](../decisions/015-reference-content.md)):

- the notice states that the command refreshes the spec law and prints a migration prompt for an AI agent to apply, since the command restructures nothing itself ([DR-022](../decisions/022-prompt-based-migration.md)), so the tree stays legacy — and this notice stays — until that migration lands.

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

### Records Parsing

#### spec-view-14

The core package shall list `specs/decisions/*.md` as decision records and the union of `specs/intents/*.md` and legacy `specs/iterations/*.md` as intent records ([DR-017](../decisions/017-intent-records.md)), sorted by filename:

- a legacy file whose basename reappears under `intents/` is omitted, and both the shadowing and the directory coexistence are reported as tree notices;
- differently named files sharing a leading number all list, with each duplicated record ID a tree notice;
- each record carries an ID formed from the record kind and the filename's leading number [[meta-22](../meta.md#meta-22)] (e.g. `DR-011`), a title taken from the file's first `#` heading minus any leading `DR-nnn:`/`IR-nnn:` prefix, and a path relative to `specs/`.

### Degradation

#### spec-view-15

When the tree holds an unreadable or unparseable file or an entry outside the `specs/` layout, the core package shall still reply successfully, with every other file's parse intact:

- a file that cannot be read or parsed is carried with an error notice and possibly no items;
- entries directly under `specs/` outside the layout of [[meta-1](../meta.md#meta-1)] are ignored and listed in one tree-level notice.

### Confinement

#### spec-view-16

When `specs.get` walks the tree or `specs.read` names a file, the core package shall confine every filesystem access to the project:

- the tree walk never follows a symlink that escapes the project directory, skipping such entries with a tree notice;
- `specs.read` resolves the requested path strictly inside the project's `specs/` directory — rejecting absolute paths, `..` segments, non-`.md` targets, and symlink escapes with an `invalid_request` error, and replying `not_found` for a missing file — and on success replies with the file's raw markdown.

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

Where fixture decision and intent files carry prefixed and unprefixed `#` headings, the test suite shall assert record IDs formed from filename numbers, titles with any `DR-nnn:`/`IR-nnn:` prefix stripped, `specs/`-relative paths, and filename ordering [[spec-view-14](#spec-view-14)].

### Degradation Coverage

#### spec-view-35

Where a fixture tree contains an unreadable file and unknown entries directly under `specs/`, the test suite shall assert the degraded parse of [[spec-view-15](#spec-view-15)]:

- the parse still succeeds, carrying a per-file error for the unreadable file and one tree notice listing the unknown entries;
- every other file's parse stays intact [[spec-view-10](#spec-view-10)];
- a fixture project with no `specs/` directory yields a reply stating absence with empty lists [[spec-view-10](#spec-view-10)].

### Citation Coverage

#### spec-view-37

Where a fixture tree carries a package item citing a peer's item, an intra-file citation, a citation of an absent ID, and a test item citing the behavior items it verifies, the test suite shall assert the citation presentation of [[spec-view-19](#spec-view-19)]:

- outbound rows name each cited item in document order, and grouped inbound backlinks sit on each cited target, the intra-file entries included;
- every file node, collapsed included, carries the rollup counting cross-file citations only, with the absent-ID citation counted as outbound;
- an in-view jump lands from an outbound row and from a backlink, and afterwards the one-step return restores the citing item [[spec-view-6](#spec-view-6)];
- a jump target excluded by an active search is revealed and marked [[spec-view-6](#spec-view-6)].

### Graph Coverage

#### spec-view-21

Where a fixture tree carries cross-file citations, the test suite shall assert the toggle round trip: the outline renders with the toggle off and the graph joins it with the toggle on, carrying one node per file and one directed edge per citing→cited pair [[spec-view-20](#spec-view-20)], the toggle's state survives a remount with the rest of the view state [[spec-view-20](#spec-view-20)], choosing a node expands that file in the outline while the outline stays on screen [[spec-view-20](#spec-view-20)], and activating empty graph space clears the selection [[spec-view-20](#spec-view-20)].

#### spec-view-38

Where a fixture tree carries packages of differing item counts, a reciprocally citing pair, and a package no citation reaches, the test suite shall assert the graph's encodings: node areas ordered by item count with each count stated on its node [[spec-view-22](#spec-view-22)], the cited and uncited role treatments distinguished without the reserved hues [[spec-view-22](#spec-view-22)], edge widths ordered by citation count on a tree-independent scale [[spec-view-23](#spec-view-23)], a direction glyph of constant size at rest whatever the edge's width [[spec-view-23](#spec-view-23)], the reciprocal pair drawn as two offset edges [[spec-view-23](#spec-view-23)], and a legend naming every channel and affordance in use [[spec-view-24](#spec-view-24)].

#### spec-view-39

Where the graph renders in the light and the dark theme, the test suite shall assert that every resting mark and every text mark clears its contrast floor as a computed composite of its own color, its opacity, and the theme's surface — the marks of [[spec-view-22](#spec-view-22)] and [[spec-view-23](#spec-view-23)], the numeral and label of [[spec-view-22](#spec-view-22)], and the legend of [[spec-view-24](#spec-view-24)] — with only a dimmed mark [[spec-view-25](#spec-view-25)] exempt.

#### spec-view-40

Where a fixture tree renders twice, the test suite shall assert the layout contract of [[spec-view-28](#spec-view-28)]: both renders settle identical node positions, a dragged node's positions are gone after a remount, and a package no citation reaches still holds a position within the layout.

#### spec-view-41

Where a fixture tree renders with the graph on, the test suite shall assert the graph's interaction: a selection survives pointer transit across the canvas [[spec-view-25](#spec-view-25)], keyboard focus reaches a node and Enter opens it [[spec-view-25](#spec-view-25)], Escape dismisses hover emphasis before selection [[spec-view-25](#spec-view-25)], a node's card states the item total with its per-group breakdown and citation counts [[spec-view-26](#spec-view-26)], an edge's card states its citation count [[spec-view-26](#spec-view-26)], the camera's control restores the fitted whole after a pan [[spec-view-27](#spec-view-27)], and an active search marks matching nodes while a filter toggle leaves the graph's counts whole [[spec-view-29](#spec-view-29)].

### Confinement Coverage

#### spec-view-36

Where a fixture project contains a symlink escaping the project and `specs.read` requests carry `..` segments, absolute paths, non-`.md` targets, and missing files, the test suite shall assert the confinement of [[spec-view-16](#spec-view-16)]: the tree walk skips the escaping symlink with a notice, each malformed read is rejected as `invalid_request`, the missing-file read replies `not_found`, and a valid in-tree path returns the file's raw markdown over the protocol.
