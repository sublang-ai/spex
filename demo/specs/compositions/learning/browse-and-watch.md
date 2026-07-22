<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# LEARN: Browse and Watch a Course

## Intent

This composition covers the journey from a public catalog and ordered published syllabus through explicit GitHub entry to entitled private video playback and recovery.

## Binding

### LEARN-10
Clients: `playback authorization input` = [VIDS-18](../../packages/media/video-library.md#vids-18)
Suppliers: `current-lesson authorization` = [CAT-13](../../packages/learning/course-catalog.md#cat-13)
Scope: each playback request for a lesson in the current published release

The installation shall pass CAT's opaque single-use allow value directly to VIDS for the same active account, request, content kind, asset ID, and immutable asset revision.

## Scenario

### LEARN-1
Composes: [GHID-1](../../packages/access/github-identity.md#ghid-1), [CAT-1](../../packages/learning/course-catalog.md#cat-1), [CAT-2](../../packages/learning/course-catalog.md#cat-2), [CAT-8](../../packages/learning/course-catalog.md#cat-8), [CAT-26](../../packages/learning/course-catalog.md#cat-26), [SITE-1](../../packages/web/application-shell.md#site-1)
Bindings: [ENTRY-10](../access/enter-site.md#entry-10)

Where a current published course contains a lesson with attached video content, when a visitor selects the course and lesson, the website shall show the public title, summary, section and lesson titles, lesson description, and published order without starting OAuth, requesting playback authorization, or contacting private Storage.
It shall offer the sole GitHub entry action for playback and shall expose no draft field, raw snapshot or content reference, asset identity or revision, upload label, private object location, or bearer value.

### LEARN-2
Composes: [SYLL-4](../../packages/learning/course-syllabus.md#syll-4), [CAT-2](../../packages/learning/course-catalog.md#cat-2), [CAT-8](../../packages/learning/course-catalog.md#cat-8), [VIDS-3](../../packages/media/video-library.md#vids-3), [VIDS-4](../../packages/media/video-library.md#vids-4)
Bindings: [ACCESS-4](../access/install-course-access.md#access-4), [PUBLISH-10](../authoring/publish-course.md#publish-10), [PUBLISH-11](../authoring/publish-course.md#publish-11), [LEARN-10](#learn-10)

Where one ready video reference is attached to two lessons in a published snapshot, when an authenticated member opens and plays each lesson, the website shall show each lesson in its own syllabus position and play the same video asset without creating a second upload or asset identity.

### LEARN-3
Composes: [CAT-8](../../packages/learning/course-catalog.md#cat-8), [VIDS-5](../../packages/media/video-library.md#vids-5), [VIDS-9](../../packages/media/video-library.md#vids-9), [VIDS-13](../../packages/media/video-library.md#vids-13)
Bindings: [ACCESS-4](../access/install-course-access.md#access-4), [LEARN-10](#learn-10)

While an authenticated member is watching a current published lesson, when its playback grant reaches nominal expiry, the website shall recompute access for the exact current attachment, use the new bearer location only in the active player request, and resume near the last local position.

### LEARN-4
Composes: [CAT-8](../../packages/learning/course-catalog.md#cat-8), [VIDS-4](../../packages/media/video-library.md#vids-4), [SITE-4](../../packages/web/application-shell.md#site-4)
Bindings: [PLAT-4](../operations/install-platform.md#plat-4), [LEARN-10](#learn-10)

While an entitled lesson is open, when video storage is temporarily unavailable, the website shall retain the course and lesson context, show a retryable video failure instead of a blank page or provider error, and play the same attachment when a later retry succeeds.

### LEARN-5
Composes: [GHID-1](../../packages/access/github-identity.md#ghid-1), [GHID-3](../../packages/access/github-identity.md#ghid-3), [ROLE-2](../../packages/access/role-access.md#role-2), [SITE-2](../../packages/web/application-shell.md#site-2), [SITE-6](../../packages/web/application-shell.md#site-6), [CAT-2](../../packages/learning/course-catalog.md#cat-2), [CAT-6](../../packages/learning/course-catalog.md#cat-6), [CAT-8](../../packages/learning/course-catalog.md#cat-8), [VIDS-4](../../packages/media/video-library.md#vids-4), [VIDS-6](../../packages/media/video-library.md#vids-6)
Bindings: [ENTRY-10](../access/enter-site.md#entry-10), [PLAT-1](../operations/install-platform.md#plat-1), [ACCESS-1](../access/install-course-access.md#access-1), [ACCESS-2](../access/install-course-access.md#access-2), [ACCESS-3](../access/install-course-access.md#access-3), [ACCESS-4](../access/install-course-access.md#access-4), [LEARN-10](#learn-10)

Where one course is published, when a visitor opens its public lesson URL and explicitly activates playback, the website shall offer only `Continue with GitHub`, preserve only that safe lesson route across authentication, establish one member session with no administrator navigation, recompute the exact current lesson and attachment after return, and play that private video.
If a later current release retains that lesson route with another attachment, the website shall play only the later exact attachment after recomputation.
If the course is unpublished or the later release removes that lesson route, the website shall instead show `Page unavailable`, expose no stale metadata, and request no playback grant.

### LEARN-6
Composes: [GHID-1](../../packages/access/github-identity.md#ghid-1), [SITE-5](../../packages/web/application-shell.md#site-5), [CAT-2](../../packages/learning/course-catalog.md#cat-2), [CAT-8](../../packages/learning/course-catalog.md#cat-8), [VIDS-4](../../packages/media/video-library.md#vids-4), [VIDS-5](../../packages/media/video-library.md#vids-5)
Bindings: [ENTRY-10](../access/enter-site.md#entry-10), [ACCESS-3](../access/install-course-access.md#access-3), [ACCESS-4](../access/install-course-access.md#access-4), [LEARN-10](#learn-10)

Where catalog, course, lesson, sign-in-required, and player states are rendered at 360 CSS pixels and 200 percent zoom, when a visitor uses only the keyboard to browse and start GitHub entry and the resulting member operates every playback control and retry state, the website shall preserve visible focus, semantic labels and announcements, logical syllabus order, and usable content without horizontal page scrolling.

## Verification

### LEARN-20
Verifies: [LEARN-1](#learn-1), [LEARN-2](#learn-2)

Where the acceptance catalog contains draft-only, unpublished, and published courses and one published course reuses a video in two positions, when anonymous and authenticated browsers traverse every catalog, course, and lesson route and the member plays both reused positions, the acceptance suite shall assert the same sanitized published-only hierarchy in exact snapshot order for both audiences, no authentication or private-service request during anonymous browsing, no private identifier or upload metadata in public output, exact current attachments only after authorization, one underlying video asset for both positions, and the attached video's label and native controls only in the authenticated player.

### LEARN-21
Verifies: [LEARN-3](#learn-3), [LEARN-4](#learn-4)

Where the acceptance clock can expire a playback grant and storage can fail then recover, when a member watches, renews, and retries, the acceptance suite shall assert that each bounded bearer location appears only in the active player request and not in rendered text, page data, browser history, persisted viewing state, or diagnostics; that no further bytes use the expired grant before a fresh exact authorization; approximate position restoration; retained route context; redacted failure copy; and successful recovery.

### LEARN-22
Verifies: [LEARN-5](#learn-5)

Where a published acceptance course has a known lesson and private video and can during authentication be replaced while retaining that lesson with another attachment, replaced while removing the lesson, or unpublished, when a clean browser first renders the lesson and then completes the explicit visitor-to-play journey through the deterministic OAuth authority for each case, the acceptance suite shall assert public syllabus visibility before login, no pre-authentication entitlement or Storage request, the single login choice, a route-only safe return containing no private identifier or bearer, active member identity, post-return recomputation and playback of only the later attachment when the route remains, and `Page unavailable` with no grant when the route is removed or course unpublished.

### LEARN-23
Verifies: [LEARN-6](#learn-6)

Where the real public catalog, course, lesson, sign-in-required, player, expiry, failure, and retry states are rendered at the required viewport and zoom, when keyboard-only and assistive-technology acceptance checks traverse them as visitor and member, the acceptance suite shall assert focus order/visibility, names, announcements, state changes, usable layout, and working entry and player controls.

### LEARN-24
Verifies: [LEARN-10](#learn-10)

Where CAT and VIDS fixtures produce exact, stale, replayed, wrong-account, wrong-request, wrong-asset, and wrong-revision authorization values, when the installed playback seam is checked directly, the conformance suite shall accept only the exact current single-use value and shall pass no course, release, or lesson concept into VIDS.
