<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# SPECV: Spec View

## Intent

This spec covers the per-project spec view — its user-visible
behavior, the implementation of its data plane, and the coverage
that verifies that data plane.
The view is a read-only, interactive outline of the current
project's `specs/` tree, pinned as the workspace's Specs tab,
spanning the outline's shape, package and item presentation, group
filters and search, citation navigation, the records reader,
freshness, and the empty state.
Its data plane — the `specs.get` tree parse and the `specs.read`
record fetch served by the core package — is exercised for
coverage against fixture spec trees written to temporary project
directories.

## External Behavior

### Tree

#### SPECV-1

When the spec view is opened for a project whose `specs/` tree has
been read, the spec view shall present the tree as a left-rooted
collapsible outline with a packages branch and a compositions
branch ([DR-015](../decisions/015-reference-content.md)) of
collection directories and file nodes — organized by spec files,
never by item grouping at the top level
([DR-011](../decisions/011-project-workspace.md)) — with
directory levels expanded and file nodes collapsed by default,
directories ordered by name, and files ordered by short form
(falling back to basename) within their directory.

### Package Nodes

#### SPECV-2

While a file node is displayed, the spec view shall show its
short-form chip (omitted when the file has no short form), its
basename, its intent one-liner, and per-group item counts in the
fixed group colors — external sky, internal fuchsia, test teal
([DR-015](../decisions/015-reference-content.md)) — where every
count carries its group word and an aria-label, a zero count
renders muted rather than absent, and color is never the only
channel ([DR-010](../decisions/010-interface-craft.md) §7, §8).
When the node is expanded, the view shall show the file's intent
line followed by its items in document order with the file's `##`
section values preserved as sub-headings wherever the section
changes between consecutive items — never sorted by ID
([META-12](../meta.md#meta-12)) — along with any file consistency
notices, and shall offer a per-file control that expands or
collapses every item body at once.

### Items

#### SPECV-3

While an item row is collapsed, the spec view shall show the
item's ID chip in its group color, its group tag, and its first
line, plus a muted cites hint on test-group items carrying inline
item citations and a muted computed "cited by" backlink hint on
items cited by other items. When the row is expanded, the view
shall render the item's full markdown body with horizontal
overflow contained and its citations and backlinks as in-view
links; when the ID chip is activated, the view shall copy the
item ID to the clipboard and acknowledge with a transient tick
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

When an item citation or a backlink is activated, the spec view
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
copyable block. Where a file fails to parse, the spec view shall
render a per-file notice inside its node while keeping parsed
content visible; tree-level notices shall render under the
header, and the view shall never render blank
([DR-011](../decisions/011-project-workspace.md)).

#### SPECV-17

Where the project has no `specs/` directory, the spec view's empty
state shall also offer the Academy example
([DR-015](../decisions/015-reference-content.md)) as one action
that seeds and opens the example project.
When the example's target is already a registered project, the
action shall open that project instead of failing; when seeding
fails otherwise, the empty state shall show the failure beside the
offer and shall clear it on the next attempt.

#### SPECV-18

Where the project's `specs/` tree uses the legacy user/dev/test
layout, the spec view shall render a migration notice naming
`npx @sublang/spex scaffold --update` as a copyable block instead
of a tree ([DR-015](../decisions/015-reference-content.md)).

## Internal Behavior

### Tree Parse

#### SPECV-10

When `specs.get` names a known project, the core package shall parse
the project's `specs/` tree within that request — no file watcher,
no cache — and reply with the parsed tree carrying its wall-clock
read time, so the view can show data freshness.
Files shall be listed per collection — `packages/` and
`compositions/` ([META-1](../meta.md#meta-1)) — keyed by
collection-relative path minus the extension, with collection
subdirectories carried as navigation-only structure
([META-32](../meta.md#meta-32)) and each file's items kept in
document order and never sorted by ID.
When the tree contains a `user/`, `dev/`, or `test/` directory,
the reply shall flag the tree as legacy with no files parsed
([DR-015](../decisions/015-reference-content.md)).
When the project has no `specs/` directory, the reply shall state
absence with empty lists rather than fail.

#### SPECV-11

The core package shall take a file's short form from its
`# <SHORT>: <Title>` heading ([META-10](../meta.md#meta-10)),
falling back to the item-ID prefix carried by the most items when
the heading does not declare one.
When the declared short form disagrees with the majority item
prefix, or item prefixes are mixed, the file shall carry a notice
naming the disagreement.
A file with no declared short form and no items shall have no
short form.

#### SPECV-12

For each parsed item, the core package shall report the item's ID,
its section-kind group — External Behavior and Scenario external,
Internal Behavior and Binding internal, Verification and Tests
test ([DR-015](../decisions/015-reference-content.md)) — its
containing `##` section heading, its nearest `###` topic heading
for `####` items, its full markdown body, and a one-line digest
cut at the first sentence end or line break of the body's first
paragraph, keeping raw markdown.
The core package shall extract the item's citations from inline
item-ID links in the body ([META-20](../meta.md#meta-20)) in
order, without duplicates; an item under a section outside its
collection's grammar shall carry the external group and a file
notice naming the unexpected section.

#### SPECV-13

The core package shall return the first paragraph under
`## Intent` ([META-3](../meta.md#meta-3)) for every file that has
one, on that file, together with the H1 title, so the view renders
a file's summary without a second fetch.

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
Where a fixture tree defines package files at the collection root
and nested in a collection directory plus composition files, the
test suite shall parse the tree and assert that files are keyed by
collection-relative path, that collection directories carry no
semantic grouping, that items keep document order when it differs
from ID order ([SPECV-10](#specv-10)), and that a tree holding a
legacy `user/` directory is flagged legacy with no files
([SPECV-10](#specv-10)).

#### SPECV-31
Where a fixture file declares an H1 short form disagreeing with
its majority item prefix, the test suite shall assert the declared
short form wins with a disagreement notice
([SPECV-11](#specv-11)); where a fixture file has no short-form
heading, the suite shall assert the majority item prefix is used,
and no short form when there are no items
([SPECV-11](#specv-11)).

#### SPECV-32
Where fixture items sit under package and composition sections,
under topic headings, and carry inline item citations and fenced
code blocks, the test suite shall assert section-kind group
mapping, topic attribution for `####` items, digest truncation at
the first sentence end, ordered de-duplicated citation extraction,
and that fenced `###` lines start no item and fenced links never
cite ([SPECV-12](#specv-12)).

#### SPECV-33
Where a file carries a multi-line first paragraph under
`## Intent` followed by further paragraphs, the test suite shall
assert that the file's intent is the first paragraph only, joined
to one line ([SPECV-13](#specv-13)).

### Records Coverage

#### SPECV-34
Where fixture decision and iteration files carry prefixed and
unprefixed `#` headings, the test suite shall assert record IDs
formed from filename numbers, titles with any `DR-nnn:`/`IR-nnn:`
prefix stripped, `specs/`-relative paths, and filename ordering
([SPECV-14](#specv-14)).

### Degradation Coverage

#### SPECV-35
Where a fixture tree contains an unreadable file and unknown
entries directly under `specs/`, the test suite shall assert that
the parse still succeeds, carrying a per-file error for the
unreadable file, one tree notice listing the unknown entries
([SPECV-15](#specv-15)), and intact parses for every other file
([SPECV-10](#specv-10)); where a project has no `specs/`
directory, the suite shall assert the reply states absence with
empty lists ([SPECV-15](#specv-15)).

### Confinement Coverage

#### SPECV-36
Where a fixture project contains a symlink escaping the project and
`specs.read` requests carry `..` segments, absolute paths,
non-`.md` targets, and missing files, the test suite shall assert
that the tree walk skips the escaping symlink with a notice, that
each malformed read is rejected as `invalid_request`, that the
missing-file read replies `not_found`, and that a valid in-tree
path returns the file's raw markdown over the protocol
([SPECV-16](#specv-16)).
