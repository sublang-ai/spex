<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# SPECV: Spec View

## Intent

This spec covers the per-project spec view — its user-visible
behavior, the implementation of its data plane, and the coverage
that verifies that data plane.
The view is a read-only, interactive outline of the current
project's `specs/` tree, pinned as the workspace's Specs tab
([DR-011](../decisions/011-project-workspace.md)), spanning the
outline's shape, package and item presentation, group filters and
search, citation navigation, the records reader, freshness, and
the empty state.
Its data plane — the `specs.get` tree parse and the `specs.read`
record fetch served by the core package, per
[DR-011](../decisions/011-project-workspace.md) — is exercised for
coverage against fixture spec trees written to temporary project
directories.

## External Behavior

### Tree

#### SPECV-1

When the spec view is opened for a project whose `specs/` tree has
been read, the spec view shall present the tree as a left-rooted
collapsible outline of directories and package nodes — organized
by spec packages, never by the user/dev/test grouping at the top
level ([DR-011](../decisions/011-project-workspace.md)) — with
directory levels expanded and package nodes collapsed by default,
directories ordered by name, and packages ordered by short form
(falling back to basename) within their directory.

### Package Nodes

#### SPECV-2

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

### Items

#### SPECV-3

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

### Filters

#### SPECV-4

When a group filter toggle is activated, the spec view shall hide
or restore that group's items while keeping every package node in
the outline — a package whose items are all filtered away shall
stay visible and, when expanded, state that no items are in the
active groups. The three group toggles shall carry project-wide
item counts in the group colors, expose their pressed state via
aria-pressed, and default to all-on
([DR-011](../decisions/011-project-workspace.md)).

### Search

#### SPECV-5

While the spec view's filter box contains text, the spec view
shall show only items whose ID (matched case-insensitively) or
text matches, shall auto-expand packages containing matches
without persisting that expansion, and shall display the current
match count. When the box is cleared, the view shall restore the
expansion state from before the search.

### Citations

#### SPECV-6

When a Verifies citation or a backlink is activated, the spec view
shall expand the target item's ancestors, reveal the target even
when its group filter is toggled off — marking it "shown despite
filter" — and scroll to and briefly highlight it, without leaving
the view; when the cited ID does not exist in the tree, the view
shall show a transient "not found" note beside the activated link
and shall not navigate
([DR-011](../decisions/011-project-workspace.md)).

### Records

#### SPECV-7

When the records footer line ("N decisions · M iterations") is
activated, the spec view shall open an at-hand list of the tree's
decision and iteration records by id and title
([DR-009](../decisions/009-at-hand-interaction.md)), closable with
Escape; when a record is picked, the view shall replace itself
with that record's rendered markdown behind a Back control,
showing the fetch in progress and any fetch failure with a retry.

### Freshness

#### SPECV-8

While the spec view renders a read tree, the spec view shall show
a manual refresh control labeled with the last read time in
relative terms (e.g. "just now", "2m ago"); when the control is
activated, the view shall request a re-read and shall acknowledge
the read in flight
([DR-010](../decisions/010-interface-craft.md) §3, §5).

### Empty and Degraded States

#### SPECV-9

Where the project has no `specs/` directory, the spec view shall
render an instructive empty state that states what `specs/` holds
and presents the scaffold command (`npx @sublang/spex`) as a
copyable block. Where a group file fails to parse, the spec view
shall render a per-file notice inside its package while keeping
parsed content visible; tree-level notices shall render under the
header, and the view shall never render blank
([DR-011](../decisions/011-project-workspace.md)).

## Internal Behavior

### Tree Parse

#### SPECV-10

When `specs.get` names a known project, the core package shall parse
the project's `specs/` tree within that request — no file watcher,
no cache — and reply with the parsed tree carrying its wall-clock
read time, so the view can show data freshness.
Packages shall be keyed by relative directory path plus basename
under `user/`, `dev/`, and `test/` ([META-9](../meta.md#meta-9)),
merging a package's group files under one key, with each file's
items kept in document order and never sorted by ID.
Files sharing a basename at different relative paths shall remain
separate packages, each carrying a consistency notice naming the
other key.
When the project has no `specs/` directory, the reply shall state
absence with empty lists rather than fail.

#### SPECV-11

The core package shall derive a package's short form as the item-ID
prefix shared by all items across the package's group files.
When files disagree, the short form shall be the prefix carried by
the most items, and the package shall carry a notice naming the
mixed prefixes and the files holding minority prefixes.
A package with no items shall have no short form.

#### SPECV-12

For each parsed item, the core package shall report the item's ID,
group, full markdown body, nearest preceding `##` section heading —
with `Intent` and `References` yielding no section — and a one-line
digest cut at the first sentence end or line break of the body's
first paragraph, keeping raw markdown.
When a test item's body starts with a `Verifies:` line
([META-20](../meta.md#meta-20)), the core package shall extract
every cited item ID from that line and exclude the line from the
digest, which shall start at the first sentence after it.

#### SPECV-13

The core package shall return the first paragraph under `## Intent`
([META-3](../meta.md#meta-3)) for every group file that has one, on
that file, so the view can apply its own display fallback across
groups without a second fetch.

### Records Parsing

#### SPECV-14

The core package shall list `specs/decisions/*.md` and
`specs/iterations/*.md` as records sorted by filename, each with an
ID formed from the record kind and the filename's leading number
(e.g. `DR-011`), a title taken from the file's first `#` heading
minus any leading `DR-nnn:`/`IR-nnn:` prefix, and a path relative
to `specs/`.

### Degradation

#### SPECV-15

When one file in the tree cannot be read or parsed, the core
package shall still reply successfully, carrying that file with an
error notice and possibly no items, while every other file's parse
stays intact.
Entries directly under `specs/` outside the
[META-1](../meta.md#meta-1) layout shall be ignored and listed in
one tree-level notice.

### Confinement

#### SPECV-16

The core package shall never follow a symlink that escapes the
project directory during the tree walk; such entries shall be
skipped with a tree notice.
When `specs.read` is received, the core package shall resolve the
requested path strictly inside the project's `specs/` directory —
rejecting absolute paths, `..` segments, non-`.md` targets, and
symlink escapes with an `invalid_request` error, and replying
`not_found` for a missing file — and on success reply with the
file's raw markdown.

## Verification

### Parse Coverage

#### SPECV-30
Verifies: [SPECV-10](#specv-10)

Where a fixture tree defines a top-level package with all three
group files, a package nested in a directory, and a package present
in only one group, the test suite shall parse the tree and assert
that packages are keyed by directory path plus basename, that a
package's group files merge under one key, that items keep document
order when it differs from ID order, and that two packages sharing
a basename at different paths each carry a notice naming the other.

#### SPECV-31
Verifies: [SPECV-11](#specv-11)

Where a fixture file mixes a majority and a minority item-ID
prefix, the test suite shall assert that the package's short form
is the majority prefix and that a package notice names the mixed
prefixes and the minority file; where a package has no items, the
suite shall assert it has no short form.

#### SPECV-32
Verifies: [SPECV-12](#specv-12)

Where fixture items sit under `##` sections, under `## Intent`, and
after `## References`, and carry `Verifies:` lines and fenced code
blocks, the test suite shall assert section attribution (none under
Intent or References), digest truncation at the first sentence end,
Verifies ID extraction with the line excluded from the digest, and
that fenced `###` lines start no item.

#### SPECV-33
Verifies: [SPECV-13](#specv-13)

Where a group file carries a multi-line first paragraph under
`## Intent` followed by further paragraphs, the test suite shall
assert that the file's intent is the first paragraph only, joined
to one line.

### Records Coverage

#### SPECV-34
Verifies: [SPECV-14](#specv-14)

Where fixture decision and iteration files carry prefixed and
unprefixed `#` headings, the test suite shall assert record IDs
formed from filename numbers, titles with any `DR-nnn:`/`IR-nnn:`
prefix stripped, `specs/`-relative paths, and filename ordering.

### Degradation Coverage

#### SPECV-35
Verifies: [SPECV-15](#specv-15), [SPECV-10](#specv-10)

Where a fixture tree contains an unreadable group file and unknown
entries directly under `specs/`, the test suite shall assert that
the parse still succeeds, carrying a per-file error for the
unreadable file, one tree notice listing the unknown entries, and
intact parses for every other file; where a project has no `specs/`
directory, the suite shall assert the reply states absence with
empty lists.

### Confinement Coverage

#### SPECV-36
Verifies: [SPECV-16](#specv-16)

Where a fixture project contains a symlink escaping the project and
`specs.read` requests carry `..` segments, absolute paths,
non-`.md` targets, and missing files, the test suite shall assert
that the tree walk skips the escaping symlink with a notice, that
each malformed read is rejected as `invalid_request`, that the
missing-file read replies `not_found`, and that a valid in-tree
path returns the file's raw markdown over the protocol.
