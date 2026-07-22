<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-002: Author and Publish

## Goal

Let the configured administrator create and edit one mutable course aggregate, upload and attach private videos, publish the same record, and delete courses or videos independently.

## Deliverables

- [ ] One-sign-in entry from the configured GitHub subject to course creation, with no first-user claim or role-assignment step ([BOOT-1](../compositions/access/bootstrap-admin.md#boot-1))
- [ ] Mutable course details and ordered syllabus with stable slugs, immediate published edits, and hard course deletion that preserves video assets ([CAT-5](../packages/learning/course-catalog.md#cat-5), [CAT-7](../packages/learning/course-catalog.md#cat-7), [CAT-11](../packages/learning/course-catalog.md#cat-11))
- [ ] Private video upload and management with byte progress, byte-zero retry, opaque references, and independent video deletion ([VIDS-1](../packages/media/video-library.md#vids-1), [VIDS-3](../packages/media/video-library.md#vids-3), [VIDS-6](../packages/media/video-library.md#vids-6))
- [ ] Installed course/video management authorization and private object service ([ACCESS-4](../compositions/access/install-course-access.md#access-4), [PLAT-3](../compositions/operations/install-platform.md#plat-3))
- [ ] Installed media chooser and resolution plus complete create, publish, live-edit, interruption, and deletion journeys ([PUBLISH-1](../compositions/authoring/publish-course.md#publish-1), [PUBLISH-2](../compositions/authoring/publish-course.md#publish-2), [PUBLISH-6](../compositions/authoring/publish-course.md#publish-6))

## Tasks

1. Add migrations for courses, ordered sections and lessons, publication state, opaque lesson-media references, and video records.
2. Add caller-scoped course- and video-management policies.
3. Implement unpublished course creation, deterministic stable slugs, and field validation.
4. Implement section and lesson editing, ordering, and confirmed removal.
5. Implement publish, unpublish, and republish as state changes on the same course record.
6. Make accepted edits to published courses immediately and atomically visible without a staging or history model.
7. Implement confirmed hard course deletion while leaving every referenced video asset unchanged.
8. Implement MP4/WebM validation, complete private upload, byte progress, and library metadata.
9. On interrupted upload, expose no partial asset and restart the retry at byte zero.
10. Implement video listing, rename, chooser, reference resolution, and confirmed record-and-content deletion.
11. Install the video chooser and resolver at CAT's media inputs.
12. Implement lesson attachment, replacement, clearing, and dangling-reference repair.
13. Render the administrator empty, editor, upload, chooser, publication, and confirmation states accessibly.
14. Run the authoring package, binding-conformance, bootstrap, and integrated acceptance suites.

## Acceptance criteria

- [BOOT-3](../compositions/access/bootstrap-admin.md#boot-3) passes without an operator readiness report.
- [CAT-20](../packages/learning/course-catalog.md#cat-20), [CAT-21](../packages/learning/course-catalog.md#cat-21), [CAT-22](../packages/learning/course-catalog.md#cat-22), and [CAT-23](../packages/learning/course-catalog.md#cat-23) pass.
- [VIDS-13](../packages/media/video-library.md#vids-13) passes, including no partial asset and byte-zero retry after interruption.
- [ACCESS-6](../compositions/access/install-course-access.md#access-6) and [PLAT-8](../compositions/operations/install-platform.md#plat-8) pass.
- [PUBLISH-8](../compositions/authoring/publish-course.md#publish-8), [PUBLISH-9](../compositions/authoring/publish-course.md#publish-9), [PUBLISH-10](../compositions/authoring/publish-course.md#publish-10), and [PUBLISH-11](../compositions/authoring/publish-course.md#publish-11) pass.
