<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-128: Omit Member Enumeration from Full Reads

## Status

Implemented and independently reviewed by GPT-6 Astra; targeted integration and required checks passed, with CI pending (2026-10-27).

## Intent

Keep full-view catalog and detail authority while omitting eager member enumeration; selected-destination reads and explicit Members retain their existing behavior [[git-host-5](../packages/git-host.md#git-host-5)] [[git-host-22](../packages/git-host.md#git-host-22)] [[git-host-8](../packages/git-host.md#git-host-8)].

## Deliverables

- [x] Full views hold unknown counts without repository-members requests.
- [x] Selected reads, explicit Members and conservative privacy notices remain verified.
- [x] Existing full-read settlement and recovery fixtures agree with the omitted work.

## Tasks

1. Amend the full-view count contract, omit its member enumeration and align affected integration evidence.

## Verification

- The four affected core integration suites passed: 78 tests, with no failures or skips.
- Refresh sends no repository-members requests; explicit Members and selected Check retain their fresh counts and conservative privacy notices.
- Existing sibling-drain, bounded GET recovery, branch preparation, archive and placement authority cases passed.
- Both affected browser picker journeys passed with unknown full-view counts and the sharing notice preserved.
- Required pre-push checks passed: spec lint, workspace build/catalog checks and e2e type checking.
  The one existing core-service-41 sentence advisory remains.
- GPT-6 Astra independently reviewed the production change, specs, fixtures and browser assertions with no material finding.
This change reduces full-view work; it does not establish recovery from the live instance's observed rate limits.

Implementation: GPT-6.1 Sol; coordination and review: GPT-6 Astra.
