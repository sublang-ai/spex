<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-050: Sessions Continue

## Status

Done (2026-09-02)

## Intent

Let a message continue an ended session and let every listed session be deleted, per [DR-042](../decisions/042-sessions-continue.md).

## Deliverables

- [x] The core persists a token-free Captain snapshot in the sidecar at each turn's end and at session end; a continuable session's entry says so.
- [x] Submitting to a continuable ended session restores the snapshot into a fresh shell and a new runtime on the same session id, with turn ids offset, the effect ledger seeded, and the stream appended; refusals name their reason.
- [x] The run view shows an ended continuable session as a paused conversation whose composer sends; the End confirm says it can be continued.
- [x] Sessions the playbook CLI wrote can be deleted behind the inline confirm, lease-checked; a session removed from the shared store leaves the listing.

## Tasks

1. Specs: core-service and run-view amendments and coverage.
2. Core: snapshot, continuation, deletion.
3. UI: composer state, sidebar delete, confirm copy.
4. Journeys: continue after end and after restart; delete a terminal-run session.

## Verification

- `npm test -w packages/core`: 175 passed, 0 failed — continuation on the scripted Captain and on the real shell (token-free sidecar, ledger intact, config drift refused), lease-checked deletion, and a vanished record among them.
- `npm test -w packages/ui`: 310 passed, 0 failed.
- `npm run e2e`: 19 journeys — the continuation journey drives the composer an ended continuable session keeps, so it and the ending assertions of the first-task journey settle together with the run view's composer state.
- `node packages/cli/dist/cli.js lint`: no problems found.
- The desktop quit warning needs no change: it asks only while a turn is active, and a continued session is live like any other.
