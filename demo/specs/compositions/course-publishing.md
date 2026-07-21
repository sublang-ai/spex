<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# PUB: Course Publishing

## Intent

This composition covers how the admin assembles and releases a
course: syllabus in the catalog, videos in the library, one
publish action.
It also holds the binding that makes the two packages one
product: the catalog's open media slot is bound to the video
library here, and nowhere else.

## Binding

### PUB-1

Where a lesson's media actions delegate asset selection to the
deployment's media provider
([CAT-8](../packages/catalog/course-catalog.md#cat-8)), the
deployment shall present the video library's asset list
([VID-4](../packages/catalog/video-library.md#vid-4)) as the
picker, the stored reference shall be the chosen asset's stable
identifier
([VID-9](../packages/catalog/video-library.md#vid-9)), and the
slot's resolution queries shall be answered by the library
([VID-14](../packages/catalog/video-library.md#vid-14)).

## Scenario

### PUB-2

While an unpublished course carries sections and lessons with
library assets attached ([PUB-1](#pub-1)), when the admin
publishes it
([CAT-6](../packages/catalog/course-catalog.md#cat-6)), the
course page shall mark exactly the lessons with resolvable
attachments as playable
([CAT-2](../packages/catalog/course-catalog.md#cat-2)) — 
publishing shall require no per-video step.

### PUB-3

When the admin deletes a library asset still referenced by a
lesson ([VID-10](../packages/catalog/video-library.md#vid-10)),
the course and its syllabus shall remain intact, the lesson's
course-page entry shall lose its playable marking
([CAT-2](../packages/catalog/course-catalog.md#cat-2)), the
lesson view shall fall back to its no-media presentation, and
the course manager shall mark the lesson's dangling reference —
the library now reports it unresolvable
([VID-14](../packages/catalog/video-library.md#vid-14)) — so the
admin can reattach or clear it.

## Tests

### PUB-4
Verifies: [PUB-1](#pub-1), [PUB-2](#pub-2), [CAT-5](../packages/catalog/course-catalog.md#cat-5), [CAT-8](../packages/catalog/course-catalog.md#cat-8), [VID-1](../packages/catalog/video-library.md#vid-1)

Where the acceptance suite signs in as the admin on a seeded
deployment, when it creates a course, adds a section and a
lesson, uploads a fixture video, attaches it through the picker,
and publishes, the suite shall assert the public course page
shows the syllabus with that lesson — and only that lesson —
marked playable, and that the lesson's stored reference equals
the uploaded asset's identifier.

### PUB-5
Verifies: [PUB-3](#pub-3), [CAT-2](../packages/catalog/course-catalog.md#cat-2), [VID-10](../packages/catalog/video-library.md#vid-10), [VID-14](../packages/catalog/video-library.md#vid-14)

Where a published lesson references a library asset, when the
admin deletes that asset from the library, the acceptance suite
shall assert the course page still shows the full syllabus with
that lesson's playable marking gone, the lesson view shows the
no-media presentation, and the course manager marks the dangling
reference.
