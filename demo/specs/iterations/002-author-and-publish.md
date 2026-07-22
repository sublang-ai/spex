<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-002: Author and Publish

## Goal

Let the configured administrator create a draft, upload and attach ready videos, and publish one coherent immutable course release.

## Deliverables

- [ ] Ordered, revision-safe syllabus drafts and immutable publication snapshots ([SYLL-1](../packages/learning/course-syllabus.md#syll-1), [SYLL-10](../packages/learning/course-syllabus.md#syll-10))
- [ ] Resumable private video upload, lifecycle, chooser, and cleanup behavior ([VIDS-1](../packages/media/video-library.md#vids-1), [VIDS-10](../packages/media/video-library.md#vids-10))
- [ ] Atomic catalog publication, immutable releases, slug ownership, and public projection ([CAT-3](../packages/learning/course-catalog.md#cat-3), [CAT-13](../packages/learning/course-catalog.md#cat-13))
- [ ] Installed authoring, media, snapshot, result, storage, and role seams, including [ACCESS-4](../compositions/access/install-course-access.md#access-4), [PUBLISH-1](../compositions/authoring/publish-course.md#publish-1), [PUBLISH-2](../compositions/authoring/publish-course.md#publish-2), [PUBLISH-3](../compositions/authoring/publish-course.md#publish-3), and [PLAT-3](../compositions/operations/install-platform.md#plat-3)
- [ ] Initial-administrator and complete author-to-release journeys ([BOOT-1](../compositions/access/bootstrap-admin.md#boot-1), [PUBLISH-4](../compositions/authoring/publish-course.md#publish-4))

## Tasks

1. Add reviewed draft, section, and lesson migrations with explicit identities and ordering.
2. Add upload-attempt and asset-record migrations with their lifecycle constraints.
3. Add release and slug-reservation migrations with immutable revision identity.
4. Add caller-scoped authoring and publication policies.
5. Add caller-scoped video-management policies.
6. Add the exact anonymous public-projection policy.
7. Implement revision-safe draft creation and field editing.
8. Implement section and lesson ordering.
9. Implement complete publishability validation.
10. Implement deterministic immutable snapshot creation.
11. Implement publication-result reconciliation.
12. Implement upload preflight.
13. Implement new exact-path resumable direct transfer.
14. Implement upload finalization.
15. Implement cancellation and retry lifecycle behavior.
16. Implement completed-orphan cleanup and unavailable/recovery observations.
17. Implement managed descriptions and ready-only chooser behavior.
18. Implement lesson attachment, replacement, and removal.
19. Implement VIDS's exact-authorized playback-grant boundary.
20. Install ROLE's `course.author`, `course.publish`, `video.watch`, and `video.manage` decisions through [ACCESS-4](../compositions/access/install-course-access.md#access-4).
21. Bind VIDS descriptions into the syllabus content socket.
22. Implement atomic publication and slug reservation.
23. Implement greatest-revision selection, idempotence, and conflict reporting.
24. Install the publication snapshot and result bindings.
25. Implement CAT's exact-current single-use content authorization.
26. Implement public catalog, course, and lesson pages from the exact current-release projection.
27. Enforce republish freshness on every public page.
28. Implement the administrator empty state and editor.
29. Implement upload and chooser presentation states.
30. Implement validation and publication feedback.
31. Run package, binding-conformance, bootstrap, and publication acceptance suites.

## Acceptance criteria

- [SYLL-19](../packages/learning/course-syllabus.md#syll-19), [SYLL-20](../packages/learning/course-syllabus.md#syll-20), and [SYLL-21](../packages/learning/course-syllabus.md#syll-21) pass.
- [VIDS-21](../packages/media/video-library.md#vids-21), [VIDS-23](../packages/media/video-library.md#vids-23), and [VIDS-24](../packages/media/video-library.md#vids-24) pass for upload and management behavior.
- [CAT-23](../packages/learning/course-catalog.md#cat-23), [CAT-24](../packages/learning/course-catalog.md#cat-24), and [CAT-26](../packages/learning/course-catalog.md#cat-26) pass for projection, publication, and trust boundaries.
- [ACCESS-7](../compositions/access/install-course-access.md#access-7), [PLAT-8](../compositions/operations/install-platform.md#plat-8), [BOOT-4](../compositions/access/bootstrap-admin.md#boot-4), and [BOOT-5](../compositions/access/bootstrap-admin.md#boot-5) pass.
- [PUBLISH-10](../compositions/authoring/publish-course.md#publish-10), [PUBLISH-11](../compositions/authoring/publish-course.md#publish-11), [PUBLISH-12](../compositions/authoring/publish-course.md#publish-12), [PUBLISH-13](../compositions/authoring/publish-course.md#publish-13), and [PUBLISH-14](../compositions/authoring/publish-course.md#publish-14) pass.
