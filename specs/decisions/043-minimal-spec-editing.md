<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-043: Minimal Spec Editing

## Status

Accepted (2026-09-02) on the owner's ask for basic editing of spec items, decision records, and intent records — plain text with a markdown preview, nothing more.
Amends [DR-011](011-project-workspace.md): the spec view is no longer read-only.

## Context

- Every spec file — package, decision record, intent record — is markdown the app already reads whole through one confined command; the records reader renders any of them through the app's markdown component.
- The app never creates spec files: the scaffold CLI does, and a new record is a new file with a numbered name — a concern of the CLI and the agents, not of a viewer.
- An agent may rewrite a file while a person edits it; the edit must not silently clobber that write, and timestamps are a poor witness (checkouts touch files without changing them).
- The spec view unmounts whenever another tab shows, so an editor's draft cannot live in the component.

## Decision

- The core gains one write: a confined, atomic replacement of one existing `specs/` file, guarded by a version token that is a digest of the file's bytes — handed out by the read, checked by the write, refused as a conflict when the bytes changed, unconditional when omitted.
  No file is created, no lint runs, no line-level API exists.
- The spec view gains one editor: whole-file plain text in a monospace field with a preview rendered as the reader renders a record, links inert; opened from a record's reader, from an expanded package, or from an expanded item — the last landing the caret on the item's heading.
- The draft lives in the per-project view state, surviving the workspace's own navigation, with the tab and editor marked unsaved; Cancel, Escape, opening another file, and a conflict reload ask in place before discarding; the page's leave guard covers closing the window.
- Save writes with the token it read: success closes into the reader or outline showing the saved text and re-reads the tree; a conflict keeps the draft and offers reload or overwrite; any other failure keeps the draft with a retry.
- A saved file is what the person typed: no trailing newline is added or removed, and the SPDX comment survives as ordinary text.

## Consequences

- Reviewing and touching up a spec no longer means leaving the app; `spex lint` remains the law's gate, run before committing as before.
- Two clients editing one file serialize on the token; the second learns of the first's write at save time.
- The Academy example, a plain copy in the project's directory, edits like any project and is never re-seeded over.
