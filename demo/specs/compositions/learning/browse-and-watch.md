<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# LEARN: Browse and Watch a Course

## Intent

This composition covers the journey from a public catalog and ordered published syllabus through explicit GitHub entry to entitled private video playback and recovery.

## Binding

### LEARN-1

Where each playback request for a lesson in the current published release uses VIDS's [playback-authorization input](../../packages/media/video-library.md#vids-18), the installation shall pass CAT's [opaque single-use allow value](../../packages/learning/course-catalog.md#cat-11) directly to VIDS for the same active account, request, content kind, asset ID, and immutable asset revision.

## Scenario

### LEARN-2

Where a current published course contains a lesson with attached video content, when a visitor follows the [course and lesson routes](../../packages/web/application-shell.md#site-1), the website shall show the [public title, summary, lesson description, and published order](../../packages/learning/course-catalog.md#cat-8) without starting OAuth, requesting playback authorization, or contacting private Storage.
It shall offer the [installed sole GitHub entry action](../access/enter-site.md#entry-1) for playback and shall expose no draft field, raw snapshot or content reference, asset identity or revision, upload label, private object location, or bearer value.

### LEARN-3

Where one [ready video reference is attached to two lessons](../../packages/learning/course-syllabus.md#syll-4) in a published snapshot, when an authenticated member opens and plays each lesson through the [installed playback handoff](#learn-1), the website shall show each lesson in its [own published syllabus position](../../packages/learning/course-catalog.md#cat-8) and [play the same video asset](../../packages/media/video-library.md#vids-4) without creating a second upload or asset identity.

### LEARN-4

While an authenticated member is watching a current published lesson, when its playback grant reaches nominal expiry, the website shall obtain [authorization for the exact current attachment](../../packages/learning/course-catalog.md#cat-11) through the [installed playback handoff](#learn-1), [use the new bearer only in the active player request](../../packages/media/video-library.md#vids-5), and resume near the last local position.

### LEARN-5

While an entitled lesson is open, when video storage is temporarily unavailable, the website shall retain the [public course and lesson context](../../packages/learning/course-catalog.md#cat-8), [show a retryable video failure](../../packages/web/application-shell.md#site-4) instead of a blank page or provider error, and [play the same attachment](../../packages/media/video-library.md#vids-4) through the [installed playback handoff](#learn-1) when a later retry succeeds.

### LEARN-6

Where one course is published, when a visitor opens its [public lesson URL](../../packages/learning/course-catalog.md#cat-2) and explicitly activates playback, the website shall offer only the [installed `Continue with GitHub` entry](../access/enter-site.md#entry-1), [preserve only that safe lesson route](../../packages/web/application-shell.md#site-2) across authentication, establish one member session, recompute the exact current lesson and attachment through the [installed playback handoff](#learn-1), and [play that private video](../../packages/media/video-library.md#vids-4).
If a later current release retains that lesson route with another attachment, the website shall play only the later exact attachment after recomputation.
If the course is unpublished or the later release removes that lesson route, the website shall instead show [`Page unavailable`](../../packages/web/application-shell.md#site-6), expose no stale metadata, and request no playback grant.

### LEARN-7

Where [catalog, course, and lesson states](../../packages/learning/course-catalog.md#cat-8) and sign-in-required and player states are rendered at 360 CSS pixels and 200 percent zoom, when a visitor uses only the keyboard to operate the [installed GitHub entry](../access/enter-site.md#entry-1) and the resulting member operates the [video controls and retry states](../../packages/media/video-library.md#vids-4), the [integrated presentation](../../packages/web/application-shell.md#site-5) shall preserve visible focus, semantic labels and announcements, logical syllabus order, and usable content without horizontal page scrolling.

## Verification

### LEARN-8

Where the acceptance catalog contains draft-only, unpublished, and published courses and one published course reuses a video in two positions, when anonymous and authenticated browsers exercise [public browsing](#learn-2) and [reused-video playback](#learn-3), the acceptance suite shall assert the same sanitized published-only hierarchy in exact snapshot order for both audiences, no authentication or private-service request during anonymous browsing, no private identifier or upload metadata in public output, exact current attachments only after authorization, one underlying video asset for both positions, and the attached video's label and native controls only in the authenticated player.

### LEARN-9

Where the acceptance clock can expire a playback grant and storage can fail then recover, when a member exercises [grant renewal](#learn-4) and [storage recovery](#learn-5), the acceptance suite shall assert that each bounded bearer location appears only in the active player request and not in rendered text, page data, browser history, persisted viewing state, or diagnostics; that no further bytes use the expired grant before a fresh exact authorization; approximate position restoration; retained route context; redacted failure copy; and successful recovery.

### LEARN-10

Where a published acceptance course has a known lesson and private video and can during authentication be replaced while retaining that lesson with another attachment, replaced while removing the lesson, or unpublished, when a clean browser completes the [visitor-to-play journey](#learn-6) for each case, the acceptance suite shall assert public syllabus visibility before login, no pre-authentication entitlement or Storage request, the single login choice, a route-only safe return containing no private identifier or bearer, active member identity, post-return recomputation and playback of only the later attachment when the route remains, and `Page unavailable` with no grant when the route is removed or course unpublished.

### LEARN-11

Where the real public catalog, course, lesson, sign-in-required, player, expiry, failure, and retry states are rendered at the required viewport and zoom, when keyboard-only and assistive-technology checks traverse the [accessible learning journey](#learn-7), the acceptance suite shall assert focus order/visibility, names, announcements, state changes, usable layout, and working entry and player controls.

### LEARN-12

Where CAT and VIDS fixtures produce exact, stale, replayed, wrong-account, wrong-request, wrong-asset, and wrong-revision authorization values, when the [installed playback seam](#learn-1) is checked directly, the conformance suite shall accept only the exact current single-use value and shall pass no course, release, or lesson concept into VIDS.
