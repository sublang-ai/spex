<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# PUBLISH: Author and Publish a Course

## Intent

This composition covers the administrator journey from a new ordered syllabus and private video uploads to one coherent learner-visible course release.
It is the concrete binding of `VideoRef` to syllabus `ContentRef` and `SyllabusSnapshot` to catalog publication from [DR-002](../../decisions/002-course-media-boundary.md).

## Scenarios

### PUBLISH-1
Composes: [ROLE-1](../../packages/access/role-access.md#role-1), [SYLL-1](../../packages/learning/course-syllabus.md#syll-1), [SYLL-2](../../packages/learning/course-syllabus.md#syll-2), [SYLL-3](../../packages/learning/course-syllabus.md#syll-3), [SYLL-4](../../packages/learning/course-syllabus.md#syll-4), [SYLL-5](../../packages/learning/course-syllabus.md#syll-5), [VIDS-1](../../packages/media/video-library.md#vids-1), [VIDS-3](../../packages/media/video-library.md#vids-3), [CAT-3](../../packages/learning/course-catalog.md#cat-3), [CAT-2](../../packages/learning/course-catalog.md#cat-2)
Binds:
- [ROLE-0](../../packages/access/role-access.md#role-0) `AuthorizationDecision` for `course.author` -> [SYLL-0](../../packages/learning/course-syllabus.md#syll-0) `AuthorizationDecision` for `course.author`
- [ROLE-0](../../packages/access/role-access.md#role-0) `DataRoleProjection` -> [SYLL-0](../../packages/learning/course-syllabus.md#syll-0) `DataRoleProjection`
- [ROLE-0](../../packages/access/role-access.md#role-0) `AuthorizationDecision` for `video.manage` -> [VIDS-0](../../packages/media/video-library.md#vids-0) `AuthorizationDecision` for `video.manage`
- [ROLE-0](../../packages/access/role-access.md#role-0) `DataRoleProjection` -> [VIDS-0](../../packages/media/video-library.md#vids-0) `DataRoleProjection`
- [ROLE-0](../../packages/access/role-access.md#role-0) `AuthorizationDecision` for `course.publish` -> [CAT-0](../../packages/learning/course-catalog.md#cat-0) `AuthorizationDecision` for `course.publish`
- [ROLE-0](../../packages/access/role-access.md#role-0) `DataRoleProjection` -> [CAT-0](../../packages/learning/course-catalog.md#cat-0) `DataRoleProjection`
- [VIDS-0](../../packages/media/video-library.md#vids-0) `ContentDescriptor` -> [SYLL-0](../../packages/learning/course-syllabus.md#syll-0) `ContentDescriptor`
- [SYLL-0](../../packages/learning/course-syllabus.md#syll-0) `PublicationCandidateResult` containing `SyllabusSnapshot` -> [CAT-0](../../packages/learning/course-catalog.md#cat-0) `SyllabusSnapshot`
- [CAT-0](../../packages/learning/course-catalog.md#cat-0) `PublicationResult` -> [SYLL-0](../../packages/learning/course-syllabus.md#syll-0) `PublicationResult`

Where the configured administrator starts with no course, when the administrator creates an ordered draft, uploads one ready video for every lesson, attaches the resulting references, and confirms publication, the website shall publish one release whose learner view contains the same title, summary, section order, lesson order, and attached videos.

### PUBLISH-2
Composes: [ROLE-1](../../packages/access/role-access.md#role-1), [VIDS-1](../../packages/media/video-library.md#vids-1), [VIDS-2](../../packages/media/video-library.md#vids-2), [VIDS-3](../../packages/media/video-library.md#vids-3), [SYLL-4](../../packages/learning/course-syllabus.md#syll-4), [SYLL-5](../../packages/learning/course-syllabus.md#syll-5)
Binds:
- [ROLE-0](../../packages/access/role-access.md#role-0) `AuthorizationDecision` for `course.author` -> [SYLL-0](../../packages/learning/course-syllabus.md#syll-0) `AuthorizationDecision` for `course.author`
- [ROLE-0](../../packages/access/role-access.md#role-0) `DataRoleProjection` -> [SYLL-0](../../packages/learning/course-syllabus.md#syll-0) `DataRoleProjection`
- [ROLE-0](../../packages/access/role-access.md#role-0) `AuthorizationDecision` for `video.manage` -> [VIDS-0](../../packages/media/video-library.md#vids-0) `AuthorizationDecision` for `video.manage`
- [ROLE-0](../../packages/access/role-access.md#role-0) `DataRoleProjection` -> [VIDS-0](../../packages/media/video-library.md#vids-0) `DataRoleProjection`
- [VIDS-0](../../packages/media/video-library.md#vids-0) `ContentDescriptor` -> [SYLL-0](../../packages/learning/course-syllabus.md#syll-0) `ContentDescriptor`

While a draft lesson's intended upload is invalid, failed, or interrupted, when the administrator checks publication readiness, the website shall identify that lesson as blocked and keep publication unavailable.
When the same intended upload later succeeds, it shall offer one ready reference for the lesson and no duplicate attachment.

### PUBLISH-3
Composes: [ROLE-1](../../packages/access/role-access.md#role-1), [SYLL-6](../../packages/learning/course-syllabus.md#syll-6), [CAT-2](../../packages/learning/course-catalog.md#cat-2), [CAT-4](../../packages/learning/course-catalog.md#cat-4)
Binds:
- [ROLE-0](../../packages/access/role-access.md#role-0) `AuthorizationDecision` for `course.author` -> [SYLL-0](../../packages/learning/course-syllabus.md#syll-0) `AuthorizationDecision` for `course.author`
- [ROLE-0](../../packages/access/role-access.md#role-0) `DataRoleProjection` -> [SYLL-0](../../packages/learning/course-syllabus.md#syll-0) `DataRoleProjection`
- [ROLE-0](../../packages/access/role-access.md#role-0) `AuthorizationDecision` for `course.publish` -> [CAT-0](../../packages/learning/course-catalog.md#cat-0) `AuthorizationDecision` for `course.publish`
- [ROLE-0](../../packages/access/role-access.md#role-0) `DataRoleProjection` -> [CAT-0](../../packages/learning/course-catalog.md#cat-0) `DataRoleProjection`
- [SYLL-0](../../packages/learning/course-syllabus.md#syll-0) `PublicationCandidateResult` containing `SyllabusSnapshot` -> [CAT-0](../../packages/learning/course-catalog.md#cat-0) `SyllabusSnapshot`
- [CAT-0](../../packages/learning/course-catalog.md#cat-0) `PublicationResult` -> [SYLL-0](../../packages/learning/course-syllabus.md#syll-0) `PublicationResult`

Where a course is published, when the administrator edits and reorders its draft, members shall continue seeing the complete earlier release until the administrator publishes the later snapshot, after which new reads shall see the complete later release and no mixed revision.

### PUBLISH-4
Composes: [ROLE-1](../../packages/access/role-access.md#role-1), [SYLL-5](../../packages/learning/course-syllabus.md#syll-5), [SYLL-9](../../packages/learning/course-syllabus.md#syll-9), [CAT-9](../../packages/learning/course-catalog.md#cat-9), [SITE-4](../../packages/web/application-shell.md#site-4)
Binds:
- [ROLE-0](../../packages/access/role-access.md#role-0) `AuthorizationDecision` for `course.author` -> [SYLL-0](../../packages/learning/course-syllabus.md#syll-0) `AuthorizationDecision` for `course.author`
- [ROLE-0](../../packages/access/role-access.md#role-0) `DataRoleProjection` -> [SYLL-0](../../packages/learning/course-syllabus.md#syll-0) `DataRoleProjection`
- [ROLE-0](../../packages/access/role-access.md#role-0) `AuthorizationDecision` for `course.publish` -> [CAT-0](../../packages/learning/course-catalog.md#cat-0) `AuthorizationDecision` for `course.publish`
- [ROLE-0](../../packages/access/role-access.md#role-0) `DataRoleProjection` -> [CAT-0](../../packages/learning/course-catalog.md#cat-0) `DataRoleProjection`
- [CAT-0](../../packages/learning/course-catalog.md#cat-0) `PublicationResult` -> [SYLL-0](../../packages/learning/course-syllabus.md#syll-0) `PublicationResult`
- [SYLL-0](../../packages/learning/course-syllabus.md#syll-0) `DraftEditorView` -> [SITE-0](../../packages/web/application-shell.md#site-0) `DraftEditorView`
- [SYLL-0](../../packages/learning/course-syllabus.md#syll-0) `PublicationCandidateResult` -> [SITE-0](../../packages/web/application-shell.md#site-0) `PublicationCandidateResult`

Where a draft fails one or more publishability rules, when the administrator requests readiness or attempts publication without a complete snapshot, the website shall remain on the editor, show every actionable validation result at its field or lesson, create no catalog release, and preserve the draft.

### PUBLISH-5
Composes: [ROLE-1](../../packages/access/role-access.md#role-1), [SYLL-2](../../packages/learning/course-syllabus.md#syll-2), [SYLL-9](../../packages/learning/course-syllabus.md#syll-9), [CAT-3](../../packages/learning/course-catalog.md#cat-3), [CAT-9](../../packages/learning/course-catalog.md#cat-9), [SITE-4](../../packages/web/application-shell.md#site-4)
Binds:
- [ROLE-0](../../packages/access/role-access.md#role-0) `AuthorizationDecision` for `course.author` -> [SYLL-0](../../packages/learning/course-syllabus.md#syll-0) `AuthorizationDecision` for `course.author`
- [ROLE-0](../../packages/access/role-access.md#role-0) `DataRoleProjection` -> [SYLL-0](../../packages/learning/course-syllabus.md#syll-0) `DataRoleProjection`
- [ROLE-0](../../packages/access/role-access.md#role-0) `AuthorizationDecision` for `course.publish` -> [CAT-0](../../packages/learning/course-catalog.md#cat-0) `AuthorizationDecision` for `course.publish`
- [ROLE-0](../../packages/access/role-access.md#role-0) `DataRoleProjection` -> [CAT-0](../../packages/learning/course-catalog.md#cat-0) `DataRoleProjection`
- [SYLL-0](../../packages/learning/course-syllabus.md#syll-0) `PublicationCandidateResult` containing `SyllabusSnapshot` -> [CAT-0](../../packages/learning/course-catalog.md#cat-0) `SyllabusSnapshot`
- [CAT-0](../../packages/learning/course-catalog.md#cat-0) `PublicationResult` -> [SYLL-0](../../packages/learning/course-syllabus.md#syll-0) `PublicationResult`
- [SYLL-0](../../packages/learning/course-syllabus.md#syll-0) `DraftEditorView` -> [SITE-0](../../packages/web/application-shell.md#site-0) `DraftEditorView`

Where another published or unpublished course reserves the draft's syntactically valid slug, or a later snapshot tries to change the slug locked by that course's first release, when the administrator confirms publication, the website shall show the slug conflict in the editor without disclosing another draft, preserve the draft, every current release, and every reservation, and create no conflicting release.
When the administrator gives the eligible different-course draft an unreserved slug or restores the same course's locked slug and confirms again, the website shall publish that corrected snapshot and show its accepted locked slug in the editor.

### PUBLISH-6
Composes: [ROLE-1](../../packages/access/role-access.md#role-1), [SITE-5](../../packages/web/application-shell.md#site-5), [SYLL-1](../../packages/learning/course-syllabus.md#syll-1), [SYLL-3](../../packages/learning/course-syllabus.md#syll-3), [SYLL-4](../../packages/learning/course-syllabus.md#syll-4), [VIDS-1](../../packages/media/video-library.md#vids-1), [VIDS-7](../../packages/media/video-library.md#vids-7), [CAT-3](../../packages/learning/course-catalog.md#cat-3)
Binds:
- [ROLE-0](../../packages/access/role-access.md#role-0) `AuthorizationDecision` for `course.author` -> [SYLL-0](../../packages/learning/course-syllabus.md#syll-0) `AuthorizationDecision` for `course.author`
- [ROLE-0](../../packages/access/role-access.md#role-0) `DataRoleProjection` -> [SYLL-0](../../packages/learning/course-syllabus.md#syll-0) `DataRoleProjection`
- [ROLE-0](../../packages/access/role-access.md#role-0) `AuthorizationDecision` for `video.manage` -> [VIDS-0](../../packages/media/video-library.md#vids-0) `AuthorizationDecision` for `video.manage`
- [ROLE-0](../../packages/access/role-access.md#role-0) `DataRoleProjection` -> [VIDS-0](../../packages/media/video-library.md#vids-0) `DataRoleProjection`
- [ROLE-0](../../packages/access/role-access.md#role-0) `AuthorizationDecision` for `course.publish` -> [CAT-0](../../packages/learning/course-catalog.md#cat-0) `AuthorizationDecision` for `course.publish`
- [ROLE-0](../../packages/access/role-access.md#role-0) `DataRoleProjection` -> [CAT-0](../../packages/learning/course-catalog.md#cat-0) `DataRoleProjection`
- [VIDS-0](../../packages/media/video-library.md#vids-0) `ContentDescriptor` -> [SYLL-0](../../packages/learning/course-syllabus.md#syll-0) `ContentDescriptor`
- [SYLL-0](../../packages/learning/course-syllabus.md#syll-0) `PublicationCandidateResult` containing `SyllabusSnapshot` -> [CAT-0](../../packages/learning/course-catalog.md#cat-0) `SyllabusSnapshot`
- [CAT-0](../../packages/learning/course-catalog.md#cat-0) `PublicationResult` -> [SYLL-0](../../packages/learning/course-syllabus.md#syll-0) `PublicationResult`
- [SYLL-0](../../packages/learning/course-syllabus.md#syll-0) `DraftEditorView` -> [SITE-0](../../packages/web/application-shell.md#site-0) `DraftEditorView`
- [VIDS-0](../../packages/media/video-library.md#vids-0) `UploadView` -> [SITE-0](../../packages/web/application-shell.md#site-0) `UploadView`
- [VIDS-0](../../packages/media/video-library.md#vids-0) `VideoLibraryView` -> [SITE-0](../../packages/web/application-shell.md#site-0) `VideoLibraryView`
- [CAT-0](../../packages/learning/course-catalog.md#cat-0) `PublicationResult` -> [SITE-0](../../packages/web/application-shell.md#site-0) `PublicationResult`

Where the authoring pages are rendered at 360 CSS pixels and 200 percent zoom, when an administrator uses only the keyboard to create and reorder a syllabus, upload and choose video, resolve a dialog, and publish, the website shall preserve visible focus, labels, status announcements, logical order, and usable actions without horizontal page scrolling.

## Verification

### PUBLISH-20
Verifies: [PUBLISH-1](#publish-1), [PUBLISH-3](#publish-3)

Where separate administrator and member browsers use a clean acceptance environment, when the administrator builds a two-section, three-lesson course, uploads and reuses ready videos, publishes, edits the draft, and republishes, the acceptance suite shall assert exact learner order and attachments, one whole release at each stage, a receipt that establishes the accepted revision and locked slug in the authoring view, and no draft leakage between publications.

### PUBLISH-21
Verifies: [PUBLISH-2](#publish-2), [PUBLISH-4](#publish-4)

Where uploads can be rejected, interrupted, resumed, failed, and retried and the draft can omit each required field in turn, when the administrator drives readiness, attempts direct publication without a candidate, and later publishes after correction, the acceptance suite shall assert lesson-specific blocking, complete actionable validation, a missing-candidate conflict with no release, preserved draft state, and one attachment after successful retry.

### PUBLISH-22
Verifies: [PUBLISH-5](#publish-5)

Where fixtures cover a slug reserved by another published course, a slug retained by another unpublished course, and a changed slug for a later snapshot of the same course, when the administrator attempts each publication and then corrects the eligible different-course draft, the acceptance suite shall assert each redacted conflict without another draft's identity, byte-equivalent drafts, releases, and reservations after every failure, and one correct later release only after correction.

### PUBLISH-23
Verifies: [PUBLISH-6](#publish-6)

Where the real editor, reorder controls, uploader, chooser, confirmation dialog, and publication result are rendered at the required viewport and zoom, when keyboard-only and assistive-technology acceptance checks complete the journey, the acceptance suite shall assert focus order/visibility, names, announcements, state changes, usable layout, and successful publication.
