<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-113: Bounded Session Storage

## Status

In progress (2026-10-22).

## Intent

Implement [DR-132](../decisions/132-bounded-session-storage.md) across session discovery, whole-session synchronization, historical choice summaries and the explorer.

## Deliverables

- [x] The storage, core-service and space specifications describe the versioned root and chunk bundle.
- [x] Spex discovers and serves new sessions through Playbook's hydrated API.
- [x] Sync selects and publishes the complete session unit with its lease, version and privacy guarantees.
- [x] Real-store integration verifies bounded files, conflict selection, missing chunks and late writes.
- [x] A separate retryable import stage transfers bounded CLI sessions from the former root directory.
- [ ] The published compatible Playbook dependency is adopted after its release.

## Tasks

1. Record the format integration and update the affected spec items.
2. Integrate session discovery, validation and whole-session synchronization.
3. Verify historical summaries, explorer ownership and real-store sync failures.
4. Adopt the published runtime and run the installed compatibility gates.

## Verification

- Run `npx @sublang/spex lint`, the core build and focused real-store integration tests.
- Verify two revisions select one complete session, with dependencies before root publication, missing or corrupt chunks refused and a late chunk retained on refusal.
- Verify history and continuation through the hydrated store, with no semantic snapshot serialization in Spex.
- Before release, run the project CI and installed smoke with every supported writer upgraded together.
