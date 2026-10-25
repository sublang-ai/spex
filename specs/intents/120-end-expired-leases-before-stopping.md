<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-120: End Expired Leases Before Stopping

## Status

Implemented, verified locally and independently reviewed (2026-10-25); awaiting integration.

## Intent

Make every expired-seat stop observe the complete lease-end transition before the helper begins.

## Deliverables

- [x] Renewal retries and retirement persist the ended bearer and close relays before stopping.
- [x] Guard already-completed queued expiry while preserving active-first rescheduling.
- [x] Deterministic integration evidence observes helper-entry ordering and retained stop debt.

## Tasks

1. Clarify, repair and verify expired-lease end ordering in one commit.

## Verification

- The new deterministic renewal-first and expired-retirement cases both fail on unchanged `25b08ea2` lease code at the helper-entry ordering assertion, using an external copy with the same test and fixture.
- `npm run build -w apps/hub`: passed.
- `node --test --test-name-pattern='leases renew at the interval|expired renewal and retirement|a stop that fails leaves|status, evict and retire|an admission while retire runs' apps/hub/dist/hub.integration.test.js`: seven tests passed, including two new subcases, actual relay close code `4401`, retained stop debt and the existing recovery/admission flows.
- The new cases observe state at helper entry so queued expiry cannot hide an earlier incorrect stop; they assert destinations and state rather than helper-call counts.
- Source review checks the completed-expiry guard and unchanged active-first rescheduling; the targeted integration cases cover refused-stop ordering, with admission safety covered by the existing retirement/admission flow.
- Spec lint: zero errors and the existing `core-service-41` warning.
- `npm run prepush`: passed, including workspace builds, catalogs, type checks and spec lint.
- Independent root review approved the transition ordering, helper-entry evidence and qualified coverage.
