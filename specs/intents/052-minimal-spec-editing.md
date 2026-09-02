<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-052: Minimal Spec Editing

## Status

In progress

## Intent

Edit spec files in the app — packages, decision records, intent records — as plain text with a preview, per [DR-043](../decisions/043-minimal-spec-editing.md).

## Deliverables

- [ ] The core's confined atomic write with digest-token conflicts; the read hands out the token.
- [ ] The editor in the spec view, opened from the reader, a package, or an item; Preview; Save and Cancel; drafts that survive navigation with the unsaved mark and the leave guard.
- [ ] Conflict handling: reload or overwrite; other failures keep the draft.

## Tasks

1. Specs: spec-view amendments and new items with coverage.
2. Core write and its tests.
3. The editor and its tests.
4. A journey: open a record, edit, save, see it in the reader and the outline.

## Verification

Pending.
