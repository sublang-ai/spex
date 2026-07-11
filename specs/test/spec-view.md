<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# SPECV: Spec View Acceptance Tests

## Intent

This spec defines required coverage for the spec view data plane,
exercised against fixture spec trees written to temporary project
directories.

## Parse Coverage

### SPECV-30
Verifies: [SPECV-10](../dev/spec-view.md#specv-10)

Where a fixture tree defines a top-level package with all three
group files, a package nested in a directory, and a package present
in only one group, the test suite shall parse the tree and assert
that packages are keyed by directory path plus basename, that a
package's group files merge under one key, that items keep document
order when it differs from ID order, and that two packages sharing
a basename at different paths each carry a notice naming the other.

### SPECV-31
Verifies: [SPECV-11](../dev/spec-view.md#specv-11)

Where a fixture file mixes a majority and a minority item-ID
prefix, the test suite shall assert that the package's short form
is the majority prefix and that a package notice names the mixed
prefixes and the minority file; where a package has no items, the
suite shall assert it has no short form.

### SPECV-32
Verifies: [SPECV-12](../dev/spec-view.md#specv-12)

Where fixture items sit under `##` sections, under `## Intent`, and
after `## References`, and carry `Verifies:` lines and fenced code
blocks, the test suite shall assert section attribution (none under
Intent or References), digest truncation at the first sentence end,
Verifies ID extraction with the line excluded from the digest, and
that fenced `###` lines start no item.

### SPECV-33
Verifies: [SPECV-13](../dev/spec-view.md#specv-13)

Where a group file carries a multi-line first paragraph under
`## Intent` followed by further paragraphs, the test suite shall
assert that the file's intent is the first paragraph only, joined
to one line.

## Records Coverage

### SPECV-34
Verifies: [SPECV-14](../dev/spec-view.md#specv-14)

Where fixture decision and iteration files carry prefixed and
unprefixed `#` headings, the test suite shall assert record IDs
formed from filename numbers, titles with any `DR-nnn:`/`IR-nnn:`
prefix stripped, `specs/`-relative paths, and filename ordering.

## Degradation Coverage

### SPECV-35
Verifies: [SPECV-15](../dev/spec-view.md#specv-15), [SPECV-10](../dev/spec-view.md#specv-10)

Where a fixture tree contains an unreadable group file and unknown
entries directly under `specs/`, the test suite shall assert that
the parse still succeeds, carrying a per-file error for the
unreadable file, one tree notice listing the unknown entries, and
intact parses for every other file; where a project has no `specs/`
directory, the suite shall assert the reply states absence with
empty lists.

## Confinement Coverage

### SPECV-36
Verifies: [SPECV-16](../dev/spec-view.md#specv-16)

Where a fixture project contains a symlink escaping the project and
`specs.read` requests carry `..` segments, absolute paths,
non-`.md` targets, and missing files, the test suite shall assert
that the tree walk skips the escaping symlink with a notice, that
each malformed read is rejected as `invalid_request`, that the
missing-file read replies `not_found`, and that a valid in-tree
path returns the file's raw markdown over the protocol.
