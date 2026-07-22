<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-003: Browse, Watch, and Ship

## Goal

Complete the public-catalog-to-private-playback journey, harden every direct boundary and race, and promote the verified product through the protected production workflow.

## Deliverables

- [ ] Closed public catalog, course, and lesson responses with current-release freshness ([CAT-13](../packages/learning/course-catalog.md#cat-13), [SITE-11](../packages/web/application-shell.md#site-11))
- [ ] Exact current-lesson playback authorization and bounded private video delivery ([CAT-11](../packages/learning/course-catalog.md#cat-11), [VIDS-11](../packages/media/video-library.md#vids-11), [LEARN-1](../compositions/learning/browse-and-watch.md#learn-1))
- [ ] GitHub-only entry, safe return, renewal, failure recovery, and responsive playback ([ENTRY-2](../compositions/access/enter-site.md#entry-2), [LEARN-2](../compositions/learning/browse-and-watch.md#learn-2))
- [ ] Direct route, REST, RPC, Storage, sign-out, replacement, and unpublication defenses ([GUARD-1](../compositions/security/protect-course-content.md#guard-1), [GUARD-5](../compositions/security/protect-course-content.md#guard-5))
- [ ] Protected candidate, exact smoke evidence, promotion without rebuild, and compatible rollback ([SHIP-5](../compositions/operations/deliver-change.md#ship-5), [SHIP-8](../compositions/operations/deliver-change.md#ship-8), [SHIP-9](../compositions/operations/deliver-change.md#ship-9))

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

- [VIDS-22](../packages/media/video-library.md#vids-22), [CAT-25](../packages/learning/course-catalog.md#cat-25), [PIPE-20](../packages/operations/github-delivery.md#pipe-20), and [PIPE-21](../packages/operations/github-delivery.md#pipe-21) pass.
- [ENTRY-6](../compositions/access/enter-site.md#entry-6), [ENTRY-7](../compositions/access/enter-site.md#entry-7), and [ENTRY-8](../compositions/access/enter-site.md#entry-8) pass.
- [LEARN-8](../compositions/learning/browse-and-watch.md#learn-8), [LEARN-9](../compositions/learning/browse-and-watch.md#learn-9), [LEARN-10](../compositions/learning/browse-and-watch.md#learn-10), [LEARN-11](../compositions/learning/browse-and-watch.md#learn-11), and [LEARN-12](../compositions/learning/browse-and-watch.md#learn-12) pass.
- [GUARD-7](../compositions/security/protect-course-content.md#guard-7), [GUARD-8](../compositions/security/protect-course-content.md#guard-8), [GUARD-9](../compositions/security/protect-course-content.md#guard-9), [GUARD-10](../compositions/security/protect-course-content.md#guard-10), and [GUARD-11](../compositions/security/protect-course-content.md#guard-11) pass.
- [SHIP-10](../compositions/operations/deliver-change.md#ship-10), [SHIP-11](../compositions/operations/deliver-change.md#ship-11), [SHIP-12](../compositions/operations/deliver-change.md#ship-12), [SHIP-13](../compositions/operations/deliver-change.md#ship-13), and [SHIP-14](../compositions/operations/deliver-change.md#ship-14) pass against the exact promoted deployment and current provider revisions.
