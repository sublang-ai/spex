<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# LEARN: Browse and Watch a Course

## Intent

This composition covers the public-catalog-to-private-video journey, including safe GitHub entry, repeated playback, expiry, unavailable media, and accessible operation.

## Scenario

### LEARN-1

Where a published lesson is [publicly readable and marked playable](../../packages/learning/course-catalog.md#cat-3), when a visitor browses the [catalog](../../packages/learning/course-catalog.md#cat-1) and [lesson](../../packages/learning/course-catalog.md#cat-2), the website shall show the public course and syllabus without starting sign-in or requesting private video content.
When the visitor explicitly activates playback, the shell shall [preserve the safe lesson path](../../packages/web/application-shell.md#site-2), offer the sole [`Continue with GitHub` action](../../packages/access/github-identity.md#ghid-1), [return the authenticated member to that lesson](../../packages/access/github-identity.md#ghid-3), and use the [installed course playback policy](../security/protect-course-content.md#guard-1) to obtain the [private video player](../../packages/media/video-library.md#vids-7).

### LEARN-2

Where two published lessons [store](../../packages/learning/course-catalog.md#cat-8) the same reusable [video reference](../../packages/media/video-library.md#vids-5), when an authenticated member opens and plays each lesson through the [installed course playback policy](../security/protect-course-content.md#guard-1), the website shall preserve each lesson's own [course and section context](../../packages/learning/course-catalog.md#cat-2) while playing the same underlying video ID without another upload or asset.

### LEARN-3

While an authenticated member is watching a published lesson, when its [bounded playback bearer expires](../../packages/media/video-library.md#vids-7), the expired request shall show the [generic unavailable state](../../packages/media/video-library.md#vids-8) and use no more bytes under that bearer.
Where the member remains [actively authenticated](../../packages/access/github-identity.md#ghid-7) and the same video remains attached to the published lesson under [CAT's playable-media behavior](../../packages/learning/course-catalog.md#cat-3), when the member retries playback through the [installed course playback policy](../security/protect-course-content.md#guard-1), the website shall obtain a fresh bounded bearer for that exact video.

### LEARN-4

Where a published lesson stores a video reference, when that video is [deleted from the library](../../packages/media/video-library.md#vids-6) or the reference otherwise [resolves unavailable](../../packages/media/video-library.md#vids-5), the website shall retain the [public course and lesson context with a no-media state](../../packages/learning/course-catalog.md#cat-3), issue no playback bearer through the [installed course playback policy](../security/protect-course-content.md#guard-1), and expose no video ID, object location, or provider detail.

### LEARN-5

Where catalog, lesson, sign-in-required, player, expired, and unavailable states are rendered at 360 CSS pixels or 200 percent zoom, when a visitor and resulting member use only the keyboard to [browse the ordered course content](../../packages/learning/course-catalog.md#cat-2), operate the [GitHub entry](../../packages/access/github-identity.md#ghid-1), and use the [standard video controls](../../packages/media/video-library.md#vids-7), the [integrated presentation](../../packages/web/application-shell.md#site-5) shall preserve visible focus, semantic labels and announcements, logical syllabus order, and usable content without horizontal page scrolling.

## Verification

### LEARN-6

Where a public acceptance course has two lessons sharing one video and a clean visitor session, when browsers complete the [browse-sign-in-watch journey](#learn-1) and [shared-video journey](#learn-2), the acceptance suite shall assert public catalog and syllabus access without login, no private content request before explicit playback and successful GitHub sign-in, exact safe return, one underlying video ID, distinct lesson contexts, and standard playback in both positions.

### LEARN-7

Where the acceptance clock controls bearer expiry and a referenced video can be deleted, when a member completes the [expiry-and-renewal journey](#learn-3) and [unavailable-attachment journey](#learn-4), the acceptance suite shall assert denial under the expired bearer, a fresh bounded bearer only while the account and attachment remain eligible, retained public lesson context after deletion, no new bearer for unavailable media, and no private detail in either failure.

### LEARN-8

Where the real public catalog, lesson, GitHub entry, player, expiry, and unavailable states are rendered at the required viewport and zoom, when keyboard-only and assistive-technology checks complete the [accessible learning journey](#learn-5), the acceptance suite shall assert focus order and visibility, names, announcements, state changes, usable layout, and working entry and player controls.
