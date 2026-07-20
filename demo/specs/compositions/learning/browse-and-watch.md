<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# LEARN: Browse and Watch a Course

## Intent

This composition covers the member journey from an authenticated catalog through an ordered published syllabus to entitled private video playback and recovery.

## Scenarios

### LEARN-1
Composes: [GHID-3](../../packages/access/github-identity.md#ghid-3), [ROLE-2](../../packages/access/role-access.md#role-2), [CAT-1](../../packages/learning/course-catalog.md#cat-1), [CAT-2](../../packages/learning/course-catalog.md#cat-2), [CAT-8](../../packages/learning/course-catalog.md#cat-8), [VIDS-4](../../packages/media/video-library.md#vids-4), [SITE-1](../../packages/web/application-shell.md#site-1)
Binds:
- [GHID-0](../../packages/access/github-identity.md#ghid-0) `Principal` -> [ROLE-0](../../packages/access/role-access.md#role-0) `Principal`
- [GHID-0](../../packages/access/github-identity.md#ghid-0) `DataAccessIdentity` -> [ROLE-0](../../packages/access/role-access.md#role-0) `DataAccessIdentity`
- [ROLE-0](../../packages/access/role-access.md#role-0) `AuthorizationDecision` for `course.consume` -> [CAT-0](../../packages/learning/course-catalog.md#cat-0) `AuthorizationDecision` for `course.consume`
- [ROLE-0](../../packages/access/role-access.md#role-0) `DataRoleProjection` -> [CAT-0](../../packages/learning/course-catalog.md#cat-0) `DataRoleProjection`
- [CAT-0](../../packages/learning/course-catalog.md#cat-0) `PlaybackEntitlementResult` containing `PlaybackEntitlement` -> host-mapped [VIDS-0](../../packages/media/video-library.md#vids-0) `AssetPlaybackAuthorization`
- [GHID-0](../../packages/access/github-identity.md#ghid-0) `IdentityView` -> [SITE-0](../../packages/web/application-shell.md#site-0) `IdentityView`
- [GHID-0](../../packages/access/github-identity.md#ghid-0) `SessionState` -> [SITE-0](../../packages/web/application-shell.md#site-0) `SessionState`
- [ROLE-0](../../packages/access/role-access.md#role-0) `RoleView` -> [SITE-0](../../packages/web/application-shell.md#site-0) `RoleView`
- [CAT-0](../../packages/learning/course-catalog.md#cat-0) `CatalogListView` -> [SITE-0](../../packages/web/application-shell.md#site-0) `CatalogListView`
- [CAT-0](../../packages/learning/course-catalog.md#cat-0) `CourseDetailView` -> [SITE-0](../../packages/web/application-shell.md#site-0) `CourseDetailView`
- [CAT-0](../../packages/learning/course-catalog.md#cat-0) `LessonView` -> [SITE-0](../../packages/web/application-shell.md#site-0) `LessonView`
- [VIDS-0](../../packages/media/video-library.md#vids-0) `PlaybackView` -> [SITE-0](../../packages/web/application-shell.md#site-0) `PlaybackView`

Where a member is authenticated and a course release contains ready video references, when the member selects the course and a lesson, the website shall show only published catalog data in snapshot order with no administrator navigation and shall play the exact video attached to that lesson with the member controls.

### LEARN-2
Composes: [SYLL-4](../../packages/learning/course-syllabus.md#syll-4), [CAT-2](../../packages/learning/course-catalog.md#cat-2), [CAT-8](../../packages/learning/course-catalog.md#cat-8), [VIDS-3](../../packages/media/video-library.md#vids-3), [VIDS-4](../../packages/media/video-library.md#vids-4)
Binds:
- [VIDS-0](../../packages/media/video-library.md#vids-0) `ContentDescriptor` -> [SYLL-0](../../packages/learning/course-syllabus.md#syll-0) `ContentDescriptor`
- [SYLL-0](../../packages/learning/course-syllabus.md#syll-0) `PublicationCandidateResult` containing `SyllabusSnapshot` -> [CAT-0](../../packages/learning/course-catalog.md#cat-0) `SyllabusSnapshot`
- [CAT-0](../../packages/learning/course-catalog.md#cat-0) `PlaybackEntitlementResult` containing `PlaybackEntitlement` -> host-mapped [VIDS-0](../../packages/media/video-library.md#vids-0) `AssetPlaybackAuthorization`

Where one ready video reference is attached to two lessons in a published snapshot, when a member opens each lesson, the website shall show each lesson in its own syllabus position and play the same video asset without creating a second upload or asset identity.

### LEARN-3
Composes: [CAT-8](../../packages/learning/course-catalog.md#cat-8), [VIDS-5](../../packages/media/video-library.md#vids-5), [VIDS-9](../../packages/media/video-library.md#vids-9)
Binds:
- [CAT-0](../../packages/learning/course-catalog.md#cat-0) `PlaybackEntitlementResult` containing `PlaybackEntitlement` -> host-mapped [VIDS-0](../../packages/media/video-library.md#vids-0) `AssetPlaybackAuthorization`

While an authenticated member is watching a current published lesson, when its playback grant reaches nominal expiry, the website shall recompute access for the exact current attachment, use the new bearer location only in the active player request, and resume near the last local position.

### LEARN-4
Composes: [CAT-8](../../packages/learning/course-catalog.md#cat-8), [VIDS-4](../../packages/media/video-library.md#vids-4), [SITE-4](../../packages/web/application-shell.md#site-4)
Binds:
- [CAT-0](../../packages/learning/course-catalog.md#cat-0) `LessonView` -> [SITE-0](../../packages/web/application-shell.md#site-0) `LessonView`
- [CAT-0](../../packages/learning/course-catalog.md#cat-0) `PlaybackEntitlementResult` containing `PlaybackEntitlement` -> host-mapped [VIDS-0](../../packages/media/video-library.md#vids-0) `AssetPlaybackAuthorization`
- [VIDS-0](../../packages/media/video-library.md#vids-0) `PlaybackView` -> [SITE-0](../../packages/web/application-shell.md#site-0) `PlaybackView`
- [VIDS-0](../../packages/media/video-library.md#vids-0) `VideoUnavailableResult` -> [SITE-0](../../packages/web/application-shell.md#site-0) `VideoUnavailableResult`

While an entitled lesson is open, when video storage is temporarily unavailable, the website shall retain the course and lesson context, show a retryable video failure instead of a blank page or provider error, and play the same attachment when a later retry succeeds.

### LEARN-5
Composes: [GHID-1](../../packages/access/github-identity.md#ghid-1), [GHID-3](../../packages/access/github-identity.md#ghid-3), [ROLE-2](../../packages/access/role-access.md#role-2), [SITE-2](../../packages/web/application-shell.md#site-2), [CAT-2](../../packages/learning/course-catalog.md#cat-2), [CAT-8](../../packages/learning/course-catalog.md#cat-8), [VIDS-4](../../packages/media/video-library.md#vids-4)
Binds:
- [SITE-0](../../packages/web/application-shell.md#site-0) `RequestedDestination` -> [GHID-0](../../packages/access/github-identity.md#ghid-0) `RequestedDestination`
- [GHID-0](../../packages/access/github-identity.md#ghid-0) `Principal` -> [ROLE-0](../../packages/access/role-access.md#role-0) `Principal`
- [GHID-0](../../packages/access/github-identity.md#ghid-0) `DataAccessIdentity` -> [ROLE-0](../../packages/access/role-access.md#role-0) `DataAccessIdentity`
- [ROLE-0](../../packages/access/role-access.md#role-0) `AuthorizationDecision` for `course.consume` -> [CAT-0](../../packages/learning/course-catalog.md#cat-0) `AuthorizationDecision` for `course.consume`
- [ROLE-0](../../packages/access/role-access.md#role-0) `DataRoleProjection` -> [CAT-0](../../packages/learning/course-catalog.md#cat-0) `DataRoleProjection`
- [CAT-0](../../packages/learning/course-catalog.md#cat-0) `PlaybackEntitlementResult` containing `PlaybackEntitlement` -> host-mapped [VIDS-0](../../packages/media/video-library.md#vids-0) `AssetPlaybackAuthorization`
- [GHID-0](../../packages/access/github-identity.md#ghid-0) `IdentityView` -> [SITE-0](../../packages/web/application-shell.md#site-0) `IdentityView`
- [GHID-0](../../packages/access/github-identity.md#ghid-0) `SessionState` -> [SITE-0](../../packages/web/application-shell.md#site-0) `SessionState`
- [ROLE-0](../../packages/access/role-access.md#role-0) `RoleView` -> [SITE-0](../../packages/web/application-shell.md#site-0) `RoleView`
- [CAT-0](../../packages/learning/course-catalog.md#cat-0) `CourseDetailView` -> [SITE-0](../../packages/web/application-shell.md#site-0) `CourseDetailView`
- [CAT-0](../../packages/learning/course-catalog.md#cat-0) `LessonView` -> [SITE-0](../../packages/web/application-shell.md#site-0) `LessonView`
- [VIDS-0](../../packages/media/video-library.md#vids-0) `PlaybackView` -> [SITE-0](../../packages/web/application-shell.md#site-0) `PlaybackView`

Where one course is published, when a visitor requests its lesson URL, completes the sole GitHub sign-in action, opens the lesson, and activates play, the website shall preserve the safe destination, establish one member session with no administrator navigation, show the exact current syllabus, and play the attached private video.

### LEARN-6
Composes: [SITE-5](../../packages/web/application-shell.md#site-5), [CAT-2](../../packages/learning/course-catalog.md#cat-2), [CAT-8](../../packages/learning/course-catalog.md#cat-8), [VIDS-4](../../packages/media/video-library.md#vids-4), [VIDS-5](../../packages/media/video-library.md#vids-5)
Binds:
- [CAT-0](../../packages/learning/course-catalog.md#cat-0) `CourseDetailView` -> [SITE-0](../../packages/web/application-shell.md#site-0) `CourseDetailView`
- [CAT-0](../../packages/learning/course-catalog.md#cat-0) `LessonView` -> [SITE-0](../../packages/web/application-shell.md#site-0) `LessonView`
- [CAT-0](../../packages/learning/course-catalog.md#cat-0) `PlaybackEntitlementResult` containing `PlaybackEntitlement` -> host-mapped [VIDS-0](../../packages/media/video-library.md#vids-0) `AssetPlaybackAuthorization`
- [VIDS-0](../../packages/media/video-library.md#vids-0) `PlaybackView` -> [SITE-0](../../packages/web/application-shell.md#site-0) `PlaybackView`
- [VIDS-0](../../packages/media/video-library.md#vids-0) `VideoUnavailableResult` -> [SITE-0](../../packages/web/application-shell.md#site-0) `VideoUnavailableResult`

Where catalog, course, lesson, and player pages are rendered at 360 CSS pixels and 200 percent zoom, when a member uses only the keyboard to choose a course and lesson and operate every playback control and retry state, the website shall preserve visible focus, semantic labels and announcements, logical syllabus order, and usable content without horizontal page scrolling.

## Verification

### LEARN-20
Verifies: [LEARN-1](#learn-1), [LEARN-2](#learn-2)

Where the acceptance catalog contains draft-only, unpublished, and published courses and one published course reuses a video in two positions, when an authenticated member browses every visible course and lesson, the acceptance suite shall assert published-only discovery, the complete title/summary/section/lesson hierarchy in exact snapshot order, exact attachments, one underlying video asset for both reused positions, and the attached video's label and native playback controls.

### LEARN-21
Verifies: [LEARN-3](#learn-3), [LEARN-4](#learn-4)

Where the acceptance clock can expire a playback grant and storage can fail then recover, when a member watches, renews, and retries, the acceptance suite shall assert that each bounded bearer location appears only in the active player request and not in rendered text, page data, browser history, persisted viewing state, or diagnostics; that no further bytes use the expired grant before a fresh exact authorization; approximate position restoration; retained route context; redacted failure copy; and successful recovery.

### LEARN-22
Verifies: [LEARN-5](#learn-5)

Where a published acceptance course has a known lesson and private video, when a clean browser begins at the lesson URL and completes the full visitor-to-play journey through the deterministic OAuth authority, the acceptance suite shall assert the single login choice, safe return, active member identity, exact release/lesson/reference, and successful private playback.

### LEARN-23
Verifies: [LEARN-6](#learn-6)

Where the real catalog, course, lesson, player, expiry, failure, and retry states are rendered at the required viewport and zoom, when keyboard-only and assistive-technology acceptance checks traverse them, the acceptance suite shall assert focus order/visibility, names, announcements, state changes, usable layout, and working player controls.
