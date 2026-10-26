<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-126: Observe the Hub Renewal Log After Drain

## Status

Implemented and independently reviewed (2026-10-26).

## Intent

Preserve the admission and renewal lock checks [[hub-5](../packages/hub.md#hub-5)] [[hub-9](../packages/hub.md#hub-9)] while observing child output at its drained boundary [[release-31](../packages/release.md#release-31)].

## Deliverables

- [x] Check the existing renewal log after the hub child closes, retaining every lease and lock assertion.
- [x] Build the hub and verify the existing admission/renewal lock case.

## Tasks

1. Move the renewal log assertion after shutdown and verify the affected case without changing production behavior or observation budgets.

## Verification

Main CI 40280899113 failed the macOS Node 22 renewal log assertion after the persisted expiry had advanced.
File visibility did not establish delivery of the separate stdout stream.
The original failed run remains evidence.
`npm run build -w spex-hub` passed.
The existing admission/renewal lock case passed once through `node --test --test-concurrency=1 --test-name-pattern` on the compiled hub integration file: 1 test passed, 0 failed, in 1.95 seconds.
No full suite, production change or timeout change was made.
Required pre-push checks passed with zero spec errors and one existing advisory.
