<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-060: Back Returns to the Record's Origin

## Status

In progress.

## Intent

A record opened from the Dashboard, a project's Overview, or the Captain thread reads in the records reader, and the reader's Back control returns the reader to exactly where the record was clicked — the same surface, the same group in view — instead of leaving them in the Specs tree ([DR-009](../decisions/009-at-hand-interaction.md)).

## Deliverables

- [ ] Opening a record from another surface carries its origin; the reader's Back control returns to that surface with the originating group or row in view, and reads "← Back to Dashboard" (or the origin's name) so the reader knows where it leads (spec-view, dashboard-40).
- [ ] A record opened from within the Specs tab keeps today's Back to the tree.
- [ ] Unit coverage of both origins and one browser journey opening a History record and returning to the Dashboard group.

## Tasks

1. Origin carried with the open request; Back returns to it; spec items amended.
2. Tests and the journey.

## Verification

Recorded on completion.
