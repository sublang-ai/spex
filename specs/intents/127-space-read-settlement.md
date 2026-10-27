<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-127: Recover and Settle Space Reads

## Status

Implemented and independently reviewed; pre-push checks passed (2026-10-26).

## Intent

Keep an instance's full read running until its started work settles, retaining completed work through one eligible GET retry under [[git-host-5](../packages/git-host.md#git-host-5)] [[git-host-21](../packages/git-host.md#git-host-21)].

## Deliverables

- [x] Drain started catalog and detail reads while retaining the first observed failure.
- [x] Stop assigning queued repository details once a failure is observed.
- [x] Verify the public lifecycle and duplicate Refresh behavior with controlled sibling responses.
- [x] Recover eligible full-read GETs once without restarting catalog pages, crossing credential replacement, or retrying writes.
- [x] Verify the combined recovery and settlement behavior through the real client and core.

## Tasks

1. Repair full-read settlement and bounded GET recovery and verify the affected integration cases in one focused commit.

## Verification

- The catalog regression witness failed against unchanged main by publishing failure while a sibling remained held.
- Final client and core integration coverage passed: retained pages and details, sibling settlement, repeated Refresh, second refusals, the single token-expiry refresh budget, excluded calls and delays, unchanged auth-file identity, and cancellation or credential replacement preventing replay.
- An initial test-fixture failure was corrected; only its affected matrix was rerun, with the earlier successful cases retained and the failure evidence preserved separately.
- Core build and required pre-push checks passed, including spec lint and workspace/e2e type checks.
- Recovery against the live instance remains an acceptance step.
