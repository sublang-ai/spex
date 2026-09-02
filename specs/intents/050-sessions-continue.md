<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-050: Sessions Continue

## Status

In progress

## Intent

Let a message continue an ended session and let every listed session be deleted, per [DR-042](../decisions/042-sessions-continue.md).

## Deliverables

- [ ] The core persists a token-free Captain snapshot in the sidecar at each turn's end and at session end; a continuable session's entry says so.
- [ ] Submitting to a continuable ended session restores the snapshot into a fresh shell and a new runtime on the same session id, with turn ids offset, the effect ledger seeded, and the stream appended; refusals name their reason.
- [ ] The run view shows an ended continuable session as a paused conversation whose composer sends; the End confirm says it can be continued.
- [ ] Sessions the playbook CLI wrote can be deleted behind the inline confirm, lease-checked; a session removed from the shared store leaves the listing.

## Tasks

1. Specs: core-service and run-view amendments and coverage.
2. Core: snapshot, continuation, deletion.
3. UI: composer state, sidebar delete, confirm copy.
4. Journeys: continue after end and after restart; delete a terminal-run session.

## Verification

Pending.
