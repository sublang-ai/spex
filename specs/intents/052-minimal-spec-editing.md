<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-052: Minimal Spec Editing

## Status

Done (2026-09-02)

## Intent

Edit spec files in the app — packages, decision records, intent records — as plain text with a preview, per [DR-043](../decisions/043-minimal-spec-editing.md).

## Deliverables

- [x] The core's confined atomic write with digest-token conflicts; the read hands out the token.
- [x] The editor in the spec view, opened from the reader, a package, or an item; Preview; Save and Cancel; drafts that survive navigation with the unsaved mark and the leave guard.
- [x] Conflict handling: reload or overwrite; other failures keep the draft.

## Tasks

1. Specs: spec-view amendments and new items with coverage.
2. Core write and its tests.
3. The editor and its tests.
4. A journey: open a record, edit, save, see it in the reader and the outline.

## Verification

- `spex lint`: no problems found.
- Core (`npm test -w packages/core`): 178 passed, 0 failed — 32 in the specs suite, among them the digest-token write, its confinement, the kept mode, and the protocol round trip with `specs.write`.
- UI (`npm test -w packages/ui`): 327 passed across 18 files — 70 in the spec-view suite, 11 of them the editor's entry points, caret landing, Preview, Save, conflict Reload and Overwrite, other failures, the discard guard, and the lifted draft; 22 in the App suite, one of them the History record landing in the reader.
- Journeys (`npm run e2e`): 21 passed, 1 skipped (a sibling's continue journey), the editing journey's axe scans of both editor modes clean and the accessibility journey green in both themes.
