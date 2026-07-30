<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# lesson-playback: Lesson Playback

## Intent

A member finds a course, signs in with GitHub, and watches a lesson — the journey the product exists for.
The journey spans the catalog's public browsing, GitHub login, the video library's gated playback, and the shell's navigation, and it is the product's flagship acceptance scenario.

## External Behavior

### lesson-playback-1

Where a published course carries a lesson with a resolvable media attachment [[course-catalog-2](catalog/course-catalog.md#course-catalog-2)], when an anonymous visitor opens that lesson [[course-catalog-20](catalog/course-catalog.md#course-catalog-20)], the site shall carry them from landing to playback across one sign-in:

1. the lesson view shows the player in its sign-in-required state [[video-library-6](catalog/video-library.md#video-library-6)];
2. signing in with GitHub from there [[github-login-2](identity/github-login.md#github-login-2)] returns the visitor to the same lesson with the player active [[video-library-5](catalog/video-library.md#video-library-5)].

### lesson-playback-2

While a signed-in session is active, when the member opens any published lesson carrying a resolvable media attachment, the player shall stream it [[video-library-5](catalog/video-library.md#video-library-5)] — with no enrollment, purchase, or approval step between sign-in and playback, per [DR-000](../decisions/000-product-scope.md).

## Verification

### lesson-playback-3

Where a deployment is seeded with a published fixture course whose lesson carries a fixture asset, and a stub GitHub provider is configured, when the acceptance suite walks the journey from landing to playback, the suite shall assert each leg:

1. walking from the home page's course list [[course-catalog-1](catalog/course-catalog.md#course-catalog-1)] into the course and the lesson shows the lesson title with its course and section context [[course-catalog-20](catalog/course-catalog.md#course-catalog-20)] and the player in its sign-in-required state [[video-library-6](catalog/video-library.md#video-library-6)];
2. signing in from that lesson [[github-login-2](identity/github-login.md#github-login-2)] returns the site to the same lesson [[lesson-playback-1](#lesson-playback-1)], and the media element reaches the playing state through a fresh access grant [[lesson-playback-2](#lesson-playback-2)], [[video-library-5](catalog/video-library.md#video-library-5)].

### lesson-playback-4

Where the same seeded deployment renders at a 360 px viewport, when the acceptance suite walks the same journey through the compact menu, the suite shall assert every step is operable without horizontal scrolling [[web-shell-4](site/web-shell.md#web-shell-4)] and playback reaches the playing state [[lesson-playback-1](#lesson-playback-1)], [[video-library-5](catalog/video-library.md#video-library-5)].
