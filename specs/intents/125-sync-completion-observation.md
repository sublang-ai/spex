<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-125: Sync Completion Observation

## Status

Harness correction and verification complete; independent review and integration pending (2026-10-25).

## Intent

Give observation of the complete real sync cycle a bounded completion budget distinct from a single transport's deadline, preserving terminal assertions and production behavior [[space-12](../packages/space.md#space-12)] [[space-20](../packages/space.md#space-20)] [[space-29](../packages/space.md#space-29)].

## Deliverables

- [x] Align the default completion watchdog with existing 60-second Space state observations, preserving explicit caller budgets and predicates.
- [x] Verify the two-home rename/archive sync and the existing shortened-transport timeout case once, then pass required prepush.

## Tasks

1. Correct the sync fixture's completion observation budget and verify its existing integration assertions.

## Verification

Merged-main run 40268740022 remains preserved: macOS Node 22 job 121396743418 passed 892 of 893 core tests and timed out the archived read-only sync's default 20-second observation.
Its Save, Check, Compare and Apply consumed 12.185 seconds before Refresh, leaving about eight seconds for required validation, reindexing and final listing.
The log does not identify the remaining Refresh sub-await or prove a production deadlock or eventual completion; no performance guarantee or original-failure waiver is claimed.
The correction changes no transport timeout, step deadline, state predicate or terminal assertion.
Affected core compilation passed.
One serial changed-input invocation passed both existing cases in 57.959 seconds: the two-home rename/archive case in 44.653 seconds and the refusal/transport case in 12.737 seconds.
The archived sync reached done with received history, no push and unchanged remote HEAD; the same test retained its membership-removal assertions.
The shortened transport still stopped as timeout within its unchanged less-than-12-second assertion; the full transport case duration includes setup and its other checks.
These results validate the assertions on the changed candidate, not a performance guarantee or an unchanged-CI retry.
Required prepush passed: spec lint reported zero errors and one core-service-41 advisory, all workspace builds and e2e type checking completed.
Independent review and integration remain pending; no commit or push is claimed.
