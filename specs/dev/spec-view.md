<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# SPECV: Spec View Implementation Requirements

## Intent

This spec defines implementation requirements for the data plane of
the per-project spec view — the `specs.get` tree parse and the
`specs.read` record fetch served by the core package — per
[DR-011](../decisions/011-project-workspace.md).
User-visible view behavior lives in
[user/spec-view.md](../user/spec-view.md).

## Tree Parse

### SPECV-10

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

### SPECV-11

The core package shall derive a package's short form as the item-ID
prefix shared by all items across the package's group files.
When files disagree, the short form shall be the prefix carried by
the most items, and the package shall carry a notice naming the
mixed prefixes and the files holding minority prefixes.
A package with no items shall have no short form.

### SPECV-12

For each parsed item, the core package shall report the item's ID,
group, full markdown body, nearest preceding `##` section heading —
with `Intent` and `References` yielding no section — and a one-line
digest cut at the first sentence end or line break of the body's
first paragraph, keeping raw markdown.
When a test item's body starts with a `Verifies:` line
([META-20](../meta.md#meta-20)), the core package shall extract
every cited item ID from that line and exclude the line from the
digest, which shall start at the first sentence after it.

### SPECV-13

The core package shall return the first paragraph under `## Intent`
([META-3](../meta.md#meta-3)) for every group file that has one, on
that file, so the view can apply its own display fallback across
groups without a second fetch.

## Records

### SPECV-14

The core package shall list `specs/decisions/*.md` and
`specs/iterations/*.md` as records sorted by filename, each with an
ID formed from the record kind and the filename's leading number
(e.g. `DR-011`), a title taken from the file's first `#` heading
minus any leading `DR-nnn:`/`IR-nnn:` prefix, and a path relative
to `specs/`.

## Degradation

### SPECV-15

When one file in the tree cannot be read or parsed, the core
package shall still reply successfully, carrying that file with an
error notice and possibly no items, while every other file's parse
stays intact.
Entries directly under `specs/` outside the
[META-1](../meta.md#meta-1) layout shall be ignored and listed in
one tree-level notice.

## Confinement

### SPECV-16

The core package shall never follow a symlink that escapes the
project directory during the tree walk; such entries shall be
skipped with a tree notice.
When `specs.read` is received, the core package shall resolve the
requested path strictly inside the project's `specs/` directory —
rejecting absolute paths, `..` segments, non-`.md` targets, and
symlink escapes with an `invalid_request` error, and replying
`not_found` for a missing file — and on success reply with the
file's raw markdown.
