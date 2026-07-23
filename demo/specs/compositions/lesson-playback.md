<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# PLAY: Lesson Playback

## Intent

This composition covers the member journey the product exists
for: find a course, sign in with GitHub, watch a lesson.
It spans the catalog's public browsing, GitHub login, the video
library's gated playback, and the shell's navigation — and it is
the product's flagship acceptance scenario.

## Scenario

### PLAY-1

Where a published course carries a lesson with a resolvable
media attachment
([CAT-2](../packages/catalog/course-catalog.md#cat-2)), when an
anonymous visitor opens that lesson, the lesson view shall show
the player in its sign-in-required state
([VID-6](../packages/catalog/video-library.md#vid-6)); when the
visitor signs in with GitHub from there
([AUTH-2](../packages/identity/github-login.md#auth-2)), the
site shall return them to the same lesson with the player active
([VID-5](../packages/catalog/video-library.md#vid-5)) — one
sign-in between landing and playback.

### PLAY-2

While a signed-in session is active, when the member opens any
published lesson carrying a resolvable media attachment, the
player shall stream it
([VID-5](../packages/catalog/video-library.md#vid-5)); no
enrollment, purchase, or approval step shall exist between
sign-in and playback, per
[DR-000](../decisions/000-product-scope.md).

## Tests

### PLAY-3

Where a deployment is seeded with a published fixture course
whose lesson carries a fixture asset, and a stub GitHub provider
is configured, when the acceptance suite walks from the home
page's course list
([CAT-1](../packages/catalog/course-catalog.md#cat-1)), opens
the course, and opens the lesson
([CAT-2](../packages/catalog/course-catalog.md#cat-2)), the
suite shall assert the player shows the sign-in-required state
([VID-6](../packages/catalog/video-library.md#vid-6)); when the
suite signs in from that lesson
([AUTH-2](../packages/identity/github-login.md#auth-2)), it
shall assert the site returns to the same lesson
([PLAY-1](#play-1)) and the media element reaches the playing
state through a fresh access grant ([PLAY-2](#play-2),
[VID-5](../packages/catalog/video-library.md#vid-5)).

### PLAY-4

Where the same seeded deployment renders at a 360 px viewport,
when the acceptance suite walks the same journey through the
compact menu, the suite shall assert every step is operable
without horizontal scrolling
([SHELL-4](../packages/site/web-shell.md#shell-4)) and playback
reaches the playing state ([PLAY-1](#play-1),
[VID-5](../packages/catalog/video-library.md#vid-5)).
