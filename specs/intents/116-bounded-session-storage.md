<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-116: Bounded Session Storage

## Status

In progress (2026-10-22).
Renumbered before integration to avoid main's record-ID collision.

## Intent

Implement [DR-144](../decisions/144-bounded-session-storage.md) across session discovery, whole-session synchronization, historical choice summaries and the explorer.

## Deliverables

- [x] The storage, core-service and space specifications describe the versioned root and chunk bundle.
- [x] Spex discovers and serves new sessions through Playbook's hydrated API.
- [x] Sync selects and publishes the complete session unit with its lease, version and privacy guarantees.
- [x] Real-store integration verifies bounded files, conflict selection, missing chunks and late writes.
- [x] A separate retryable import stage transfers bounded CLI sessions from the former root directory.
- [x] Session observations spanning a clone move cannot exclude its valid session families from Sync.
- [x] The verified public Playbook 18.0.0 dependency and matching built-ins are adopted after release, preserving other dependency identities.

## Tasks

1. Record the format integration and update the affected spec items.
2. Integrate session discovery, validation and whole-session synchronization.
3. Verify historical summaries, explorer ownership and real-store sync failures.
4. Adopt the public Playbook 18.0.0 artifact, regenerate the lock and run the installed compatibility gates with the other dependency identities preserved.

## Verification

- Run `npx @sublang/spex lint`, the core build and focused real-store integration tests.
- Verify two revisions select one complete session, with dependencies before root publication, missing or corrupt chunks refused and a late chunk retained on refusal.
- Verify delayed old-location reads cannot overwrite the moved session's association or exclude its valid files from Save.
- Verify history and continuation through the hydrated store, with no semantic snapshot serialization in Spex.
- Verify the official installed runtime is 18.0.0, its files match the verified release, and legacy sessions remain readable while continuation requires explicit migration.
- Before release, run the project CI and installed smoke with every supported writer upgraded together.
