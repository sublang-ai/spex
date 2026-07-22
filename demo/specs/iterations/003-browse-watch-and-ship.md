<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-003: Browse, Watch, and Ship

## Goal

Complete the public-catalog-to-private-playback journey, harden direct boundaries and state changes, and promote the verified product through the protected production workflow.

## Deliverables

- [ ] Public catalog, course, and lesson views with `Newest` and `Title A–Z` ordering and current mutable state ([CAT-1](../packages/learning/course-catalog.md#cat-1), [SITE-11](../packages/web/application-shell.md#site-11))
- [ ] Explicit GitHub entry with a safe same-site return from a public lesson ([ENTRY-4](../compositions/access/enter-site.md#entry-4), [LEARN-1](../compositions/learning/browse-and-watch.md#learn-1))
- [ ] Exact private playback with a bearer issued for at most five minutes and fresh renewal after expiry ([GUARD-1](../compositions/security/protect-course-content.md#guard-1), [LEARN-3](../compositions/learning/browse-and-watch.md#learn-3))
- [ ] Direct-boundary protection plus explicit sign-out, unpublication, course-deletion, and video-deletion outcomes ([GUARD-4](../compositions/security/protect-course-content.md#guard-4), [GUARD-6](../compositions/security/protect-course-content.md#guard-6))
- [ ] Protected candidate, dual-order anonymous smoke, same-site GitHub smoke, exact playback smoke, promotion without rebuild, and compatible rollback ([SHIP-5](../compositions/operations/deliver-change.md#ship-5), [SHIP-9](../compositions/operations/deliver-change.md#ship-9))

## Tasks

1. Implement the public course list with `Newest` as default and `Title A–Z` as the alternate order.
2. Implement public course and lesson routes without requiring sign-in or requesting private video content.
3. Return unknown and unpublished routes through one redacted unavailable state.
4. Enter GitHub authentication only after an explicit protected action and return only to an accepted same-site route.
5. Install the exact course-site playback policy over current identity, capability, attachment, publication, and video availability.
6. Implement asset-scoped playback issuance, standard player controls, expiry, generic failure, and eligible renewal.
7. Preserve public lesson context when media is absent or deleted, without exposing references or provider detail.
8. Deny every new grant after sign-out, unpublication, course deletion, or video deletion.
9. After sign-out, unpublication, or course deletion, allow an already issued bearer to remain usable only until its bounded expiry; after video deletion, remove the origin content; in every case, make no promise to retract delivered or cached bytes.
10. Verify that course deletion leaves the independent video asset unchanged and video deletion leaves the course repairable.
11. Enforce public-field, management, and private-object boundaries against direct callers and forged values.
12. Prevent stale shared responses after a published save, unpublication, or course deletion.
13. Complete keyboard, assistive-technology, viewport, and zoom acceptance for entry, browsing, and playback.
14. Create the protected candidate and collect exact readiness, provider-attestation, smoke, and compatibility evidence.
15. Promote the verified artifact without rebuild; retain prior traffic on failure and permit only compatibility-proved rollback.
16. Complete the real-provider smoke for both anonymous catalog orders, same-site GitHub return, member denial, and exact private playback.
17. Run every package, Binding, Scenario, and deployed-operation verification as final acceptance.

## Acceptance criteria

Every package and composition Verification item in the spec tree passes; the following integrated checks are completed in this iteration.

- [CAT-19](../packages/learning/course-catalog.md#cat-19) and [VIDS-14](../packages/media/video-library.md#vids-14) pass.
- [ENTRY-6](../compositions/access/enter-site.md#entry-6), [ENTRY-7](../compositions/access/enter-site.md#entry-7), and [ENTRY-8](../compositions/access/enter-site.md#entry-8) pass.
- [LEARN-6](../compositions/learning/browse-and-watch.md#learn-6), [LEARN-7](../compositions/learning/browse-and-watch.md#learn-7), and [LEARN-8](../compositions/learning/browse-and-watch.md#learn-8) pass.
- [GUARD-7](../compositions/security/protect-course-content.md#guard-7), [GUARD-8](../compositions/security/protect-course-content.md#guard-8), and [GUARD-9](../compositions/security/protect-course-content.md#guard-9) pass, including bounded residue only for a bearer issued before policy changed.
- [PIPE-20](../packages/operations/github-delivery.md#pipe-20), [PIPE-21](../packages/operations/github-delivery.md#pipe-21), [SHIP-10](../compositions/operations/deliver-change.md#ship-10), [SHIP-11](../compositions/operations/deliver-change.md#ship-11), [SHIP-12](../compositions/operations/deliver-change.md#ship-12), [SHIP-13](../compositions/operations/deliver-change.md#ship-13), and [SHIP-14](../compositions/operations/deliver-change.md#ship-14) pass against the exact promoted deployment and current provider revisions.
