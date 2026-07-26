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
anonymous visitor opens that lesson
([CAT-20](../packages/catalog/course-catalog.md#cat-20)), the
deployment shall carry them from landing to playback across one
sign-in:

1. the lesson view shows the player in its sign-in-required state
   ([VID-6](../packages/catalog/video-library.md#vid-6));
2. signing in with GitHub from there
   ([AUTH-2](../packages/identity/github-login.md#auth-2))
   returns the visitor to the same lesson with the player active
   ([VID-5](../packages/catalog/video-library.md#vid-5)).

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
is configured, when the acceptance suite walks the journey from
landing to playback, the suite shall assert each leg:

1. walking from the home page's course list
   ([CAT-1](../packages/catalog/course-catalog.md#cat-1)) into
   the course and the lesson shows the lesson title with its
   course and section context
   ([CAT-20](../packages/catalog/course-catalog.md#cat-20))
   and the player in its sign-in-required state
   ([VID-6](../packages/catalog/video-library.md#vid-6));
2. signing in from that lesson
   ([AUTH-2](../packages/identity/github-login.md#auth-2))
   returns the site to the same lesson ([PLAY-1](#play-1)), and
   the media element reaches the playing state through a fresh
   access grant ([PLAY-2](#play-2),
   [VID-5](../packages/catalog/video-library.md#vid-5)).

### PLAY-4

Where the same seeded deployment renders at a 360 px viewport,
when the acceptance suite walks the same journey through the
compact menu, the suite shall assert every step is operable
without horizontal scrolling
([SHELL-4](../packages/site/web-shell.md#shell-4)) and playback
reaches the playing state ([PLAY-1](#play-1),
[VID-5](../packages/catalog/video-library.md#vid-5)).
