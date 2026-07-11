<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# SPECV: User-Facing Spec View Behavior

## Intent

This spec defines user-visible behavior of the per-project spec
view: a read-only, interactive outline of the current project's
`specs/` tree, pinned as the workspace's Specs tab
([DR-011](../decisions/011-project-workspace.md)). It covers the
outline's shape, package and item presentation, group filters and
search, citation navigation, the records reader, freshness, and
the empty state.

## Tree

### SPECV-1

When the spec view is opened for a project whose `specs/` tree has
been read, the spec view shall present the tree as a left-rooted
collapsible outline of directories and package nodes — organized
by spec packages, never by the user/dev/test grouping at the top
level ([DR-011](../decisions/011-project-workspace.md)) — with
directory levels expanded and package nodes collapsed by default,
directories ordered by name, and packages ordered by short form
(falling back to basename) within their directory.

## Package Nodes

### SPECV-2

While a package node is displayed, the spec view shall show its
short-form chip (omitted when the package has no shared item-ID
prefix), basename, intent one-liner (the user file's intent,
falling back to dev, then test), and per-group item counts in the
fixed group colors — user sky, dev fuchsia, test teal
([DR-011](../decisions/011-project-workspace.md)) — where every
count carries its group word and an aria-label, a zero count
renders muted rather than absent, and color is never the only
channel ([DR-010](../decisions/010-interface-craft.md) §7, §8).
When the node is expanded, the view shall show each present group
file's tagged intent line followed by its items in per-file
document order with the file's `##` section values preserved as
sub-headings wherever the section changes between consecutive
items — never sorted by ID ([META-12](../meta.md#meta-12)) —
along with any package consistency notices, and shall offer a
per-package control that expands or collapses every item body at
once.

## Items

### SPECV-3

While an item row is collapsed, the spec view shall show the
item's ID chip in its group color, its group tag, and its first
line, plus a muted verifies hint on items carrying a `Verifies:`
line and a muted computed "verified by" backlink hint on items
cited by other items' `Verifies:` lines. When the row is expanded,
the view shall render the item's full markdown body with
horizontal overflow contained and its Verifies citations and
backlinks as in-view links; when the ID chip is activated, the
view shall copy the item ID to the clipboard and acknowledge with
a transient tick
([DR-010](../decisions/010-interface-craft.md) §3).

## Filters

### SPECV-4

When a group filter toggle is activated, the spec view shall hide
or restore that group's items while keeping every package node in
the outline — a package whose items are all filtered away shall
stay visible and, when expanded, state that no items are in the
active groups. The three group toggles shall carry project-wide
item counts in the group colors, expose their pressed state via
aria-pressed, and default to all-on
([DR-011](../decisions/011-project-workspace.md)).

## Search

### SPECV-5

While the spec view's filter box contains text, the spec view
shall show only items whose ID (matched case-insensitively) or
text matches, shall auto-expand packages containing matches
without persisting that expansion, and shall display the current
match count. When the box is cleared, the view shall restore the
expansion state from before the search.

## Citations

### SPECV-6

When a Verifies citation or a backlink is activated, the spec view
shall expand the target item's ancestors, reveal the target even
when its group filter is toggled off — marking it "shown despite
filter" — and scroll to and briefly highlight it, without leaving
the view; when the cited ID does not exist in the tree, the view
shall show a transient "not found" note beside the activated link
and shall not navigate
([DR-011](../decisions/011-project-workspace.md)).

## Records

### SPECV-7

When the records footer line ("N decisions · M iterations") is
activated, the spec view shall open an at-hand list of the tree's
decision and iteration records by id and title
([DR-009](../decisions/009-at-hand-interaction.md)), closable with
Escape; when a record is picked, the view shall replace itself
with that record's rendered markdown behind a Back control,
showing the fetch in progress and any fetch failure with a retry.

## Freshness

### SPECV-8

While the spec view renders a read tree, the spec view shall show
a manual refresh control labeled with the last read time in
relative terms (e.g. "just now", "2m ago"); when the control is
activated, the view shall request a re-read and shall acknowledge
the read in flight
([DR-010](../decisions/010-interface-craft.md) §3, §5).

## Empty and Degraded States

### SPECV-9

Where the project has no `specs/` directory, the spec view shall
render an instructive empty state that states what `specs/` holds
and presents the scaffold command (`npx @sublang/spex`) as a
copyable block. Where a group file fails to parse, the spec view
shall render a per-file notice inside its package while keeping
parsed content visible; tree-level notices shall render under the
header, and the view shall never render blank
([DR-011](../decisions/011-project-workspace.md)).
