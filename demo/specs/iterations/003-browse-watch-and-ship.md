<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-003: Browse, Watch, and Ship

## Goal

Complete the public-catalog-to-private-playback journey, harden every direct boundary and race, and promote the verified product through the protected production workflow.

## Deliverables

- [ ] Closed public catalog, course, and lesson responses with current-release freshness ([CAT-26](../packages/learning/course-catalog.md#cat-26), [SITE-14](../packages/web/application-shell.md#site-14))
- [ ] Exact current-lesson playback authorization and bounded private video delivery ([CAT-13](../packages/learning/course-catalog.md#cat-13), [VIDS-11](../packages/media/video-library.md#vids-11), [LEARN-10](../compositions/learning/browse-and-watch.md#learn-10))
- [ ] GitHub-only entry, safe return, renewal, failure recovery, and responsive playback ([ENTRY-1](../compositions/access/enter-site.md#entry-1), [LEARN-1](../compositions/learning/browse-and-watch.md#learn-1))
- [ ] Direct route, REST, RPC, Storage, sign-out, replacement, and unpublication defenses ([GUARD-1](../compositions/security/protect-course-content.md#guard-1), [GUARD-5](../compositions/security/protect-course-content.md#guard-5))
- [ ] Protected candidate, exact smoke evidence, promotion without rebuild, and compatible rollback ([SHIP-2](../compositions/operations/deliver-change.md#ship-2), [SHIP-5](../compositions/operations/deliver-change.md#ship-5), [SHIP-6](../compositions/operations/deliver-change.md#ship-6))

## Tasks

1. Enforce the closed public field allowlist on catalog, course, and lesson routes.
2. Add unpublished and missing public-route states with direct-boundary denials.
3. Implement explicit GitHub entry from a public lesson.
4. Implement route-only safe return after authentication.
5. Recompute the current lesson and session state after authentication.
6. Bind CAT's single-use exact-current authorization to VIDS playback issuance.
7. Implement player grant renewal and expiry.
8. Implement unavailable, retry, and local-position restoration states.
9. Enforce caller-scoped table and view policies through direct-client fixtures.
10. Enforce caller-scoped function, RPC, and entitlement policies through direct-client fixtures.
11. Enforce private-object policies through direct-client fixtures.
12. Enforce every protected mutation at its direct boundary.
13. Enforce current-release cache freshness.
14. Enforce browser-output redaction.
15. Cover replacement and unpublication races.
16. Cover session-revocation and unavailable-media races.
17. Cover provider-failure recovery.
18. Complete keyboard and assistive-technology acceptance for public entry and playback.
19. Complete viewport and zoom acceptance for public entry and playback.
20. Implement protected candidate creation.
21. Implement candidate readiness.
22. Implement exact smoke targeting and evidence.
23. Implement promotion without rebuild.
24. Implement failed-smoke evidence while retaining prior production traffic.
25. Implement compatibility-gated rollback.
26. Implement degraded-operation reporting.
27. Run the complete package, Binding, Scenario, and deployed-operation verification set as release acceptance.

## Acceptance criteria

Every package and composition Verification item in the spec tree shall pass; the following checks are first completed in this release slice.

- [VIDS-21](../packages/media/video-library.md#vids-21), [CAT-22](../packages/learning/course-catalog.md#cat-22), [PIPE-21](../packages/operations/github-delivery.md#pipe-21), and [PIPE-22](../packages/operations/github-delivery.md#pipe-22) pass.
- [ENTRY-20](../compositions/access/enter-site.md#entry-20), [ENTRY-21](../compositions/access/enter-site.md#entry-21), and [ENTRY-22](../compositions/access/enter-site.md#entry-22) pass.
- [LEARN-20](../compositions/learning/browse-and-watch.md#learn-20), [LEARN-21](../compositions/learning/browse-and-watch.md#learn-21), [LEARN-22](../compositions/learning/browse-and-watch.md#learn-22), [LEARN-23](../compositions/learning/browse-and-watch.md#learn-23), and [LEARN-24](../compositions/learning/browse-and-watch.md#learn-24) pass.
- [GUARD-20](../compositions/security/protect-course-content.md#guard-20), [GUARD-21](../compositions/security/protect-course-content.md#guard-21), [GUARD-22](../compositions/security/protect-course-content.md#guard-22), [GUARD-23](../compositions/security/protect-course-content.md#guard-23), and [GUARD-24](../compositions/security/protect-course-content.md#guard-24) pass.
- [SHIP-20](../compositions/operations/deliver-change.md#ship-20), [SHIP-21](../compositions/operations/deliver-change.md#ship-21), [SHIP-22](../compositions/operations/deliver-change.md#ship-22), [SHIP-23](../compositions/operations/deliver-change.md#ship-23), and [SHIP-24](../compositions/operations/deliver-change.md#ship-24) pass against the exact promoted deployment and current provider revisions.
