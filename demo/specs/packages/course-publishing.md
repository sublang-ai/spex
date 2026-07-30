<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# course-publishing: Course Publishing

## Intent

The admin assembles and releases a course: syllabus in the catalog, videos in the library, one publish action.
This package makes the two one product: every media delegation the catalog leaves open is served by the video library, here and nowhere else.

## External Behavior

### course-publishing-2

While an unpublished course carries sections and lessons with library assets attached [[course-publishing-1](#course-publishing-1)], when the admin publishes it [[course-catalog-6](catalog/course-catalog.md#course-catalog-6)], the course page shall mark exactly the lessons with resolvable attachments as playable [[course-catalog-2](catalog/course-catalog.md#course-catalog-2)] — with no per-video step required.

### course-publishing-3

When the admin deletes a library asset still referenced by a lesson [[video-library-18](catalog/video-library.md#video-library-18)], the site shall degrade that lesson gracefully — the library now reporting the reference unresolvable [[video-library-14](catalog/video-library.md#video-library-14)]:

1. the course and its syllabus remain intact, the library having read and modified no host data [[video-library-10](catalog/video-library.md#video-library-10)];
2. the lesson's course-page entry loses its playable marking [[course-catalog-2](catalog/course-catalog.md#course-catalog-2)];
3. the lesson view falls back to its no-media presentation [[course-catalog-20](catalog/course-catalog.md#course-catalog-20)];
4. the course manager marks the attachment unavailable with replace and remove offered [[course-catalog-24](catalog/course-catalog.md#course-catalog-24)].

## Internal Behavior

### course-publishing-1

Where the catalog delegates to an installed media provider its lessons' asset selection [[course-catalog-8](catalog/course-catalog.md#course-catalog-8)], its lesson view's media area [[course-catalog-20](catalog/course-catalog.md#course-catalog-20)], the attachment resolution behind the course page's playable marking [[course-catalog-2](catalog/course-catalog.md#course-catalog-2)], and the unavailable marking of an unresolvable stored reference [[course-catalog-24](catalog/course-catalog.md#course-catalog-24)], the site shall serve every one of those delegations through the video library:

1. asset selection presents the library's asset list [[video-library-4](catalog/video-library.md#video-library-4)] as the picker;
2. the stored reference is the chosen asset's stable identifier [[video-library-9](catalog/video-library.md#video-library-9)];
3. the catalog's resolution queries are answered by the library [[video-library-14](catalog/video-library.md#video-library-14)];
4. for a stored reference the library resolves, the media area embeds the library's player [[video-library-5](catalog/video-library.md#video-library-5)], [[video-library-6](catalog/video-library.md#video-library-6)].

## Verification

### course-publishing-4

Where the acceptance suite signs in as the admin on a seeded deployment, when it drives a course from creation through deletion, the suite shall assert each stage:

1. creating a course, adding a section and a lesson [[course-catalog-5](catalog/course-catalog.md#course-catalog-5)], uploading a fixture video [[video-library-1](catalog/video-library.md#video-library-1)], attaching it through the picker [[course-publishing-1](#course-publishing-1)], and publishing shows the public course page's syllabus with that lesson — and only that lesson — marked playable [[course-publishing-2](#course-publishing-2)], the lesson view's media area embedding the library's player through the installed video library [[course-publishing-1](#course-publishing-1)], and the lesson's stored reference equal to the uploaded asset's identifier [[course-catalog-8](catalog/course-catalog.md#course-catalog-8)];
2. adding a second lesson attaching the same asset shows both lessons playable with equal stored references and no second upload [[video-library-9](catalog/video-library.md#video-library-9)];
3. deleting the course after the confirmation naming its section and lesson counts [[course-catalog-17](catalog/course-catalog.md#course-catalog-17)] leaves the course's routes not-found while the uploaded asset remains listed in the library, its content untouched [[course-catalog-10](catalog/course-catalog.md#course-catalog-10)], [[video-library-4](catalog/video-library.md#video-library-4)].

### course-publishing-5

Where a published lesson references a library asset, when the admin deletes that asset from the library [[video-library-18](catalog/video-library.md#video-library-18)], the acceptance suite shall assert the course page still shows the full syllabus — the library having modified no catalog data [[video-library-10](catalog/video-library.md#video-library-10)] — with that lesson's playable marking gone [[course-catalog-2](catalog/course-catalog.md#course-catalog-2)], the lesson view shows the no-media presentation [[course-catalog-20](catalog/course-catalog.md#course-catalog-20)], and the course manager marks the dangling reference — the library reporting it unresolvable [[video-library-14](catalog/video-library.md#video-library-14)], [[course-publishing-3](#course-publishing-3)].
