<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# course-publishing: Course Publishing

## Intent

The admin assembles and releases a course: syllabus in the catalog, videos in the library, one publish action.
This package makes the two one product: every media delegation the catalog leaves open is served by the video library, here and nowhere else.

## External Behavior

### course-publishing-1

While an unpublished course carries sections and lessons with library assets attached [[course-publishing-3](#course-publishing-3)], when the admin publishes it [[course-catalog-10](catalog/course-catalog.md#course-catalog-10)], the course page shall mark exactly the lessons with resolvable attachments as playable [[course-catalog-2](catalog/course-catalog.md#course-catalog-2)] — with no per-video step required.

### course-publishing-2

When the admin deletes a library asset still referenced by a lesson [[video-library-5](catalog/video-library.md#video-library-5)], the site shall degrade that lesson gracefully — the library now reporting the reference unresolvable [[video-library-10](catalog/video-library.md#video-library-10)]:

1. the course and its syllabus remain intact, the library having read and modified no host data [[video-library-9](catalog/video-library.md#video-library-9)];
2. the lesson's course-page entry loses its playable marking [[course-catalog-2](catalog/course-catalog.md#course-catalog-2)];
3. the lesson view falls back to its no-media presentation [[course-catalog-3](catalog/course-catalog.md#course-catalog-3)];
4. the course manager marks the attachment unavailable with replace and remove offered [[course-catalog-16](catalog/course-catalog.md#course-catalog-16)].

## Internal Behavior

### course-publishing-3

Where the catalog delegates to an installed media provider its lessons' asset selection [[course-catalog-15](catalog/course-catalog.md#course-catalog-15)], its lesson view's media area [[course-catalog-3](catalog/course-catalog.md#course-catalog-3)], the attachment resolution behind the course page's playable marking [[course-catalog-2](catalog/course-catalog.md#course-catalog-2)], and the unavailable marking of an unresolvable stored reference [[course-catalog-16](catalog/course-catalog.md#course-catalog-16)], the site shall serve every one of those delegations through the video library:

1. asset selection presents the library's asset list [[video-library-4](catalog/video-library.md#video-library-4)] as the picker;
2. the stored reference is the chosen asset's stable identifier [[video-library-8](catalog/video-library.md#video-library-8)];
3. the catalog's resolution queries are answered by the library [[video-library-10](catalog/video-library.md#video-library-10)];
4. for a stored reference the library resolves, the media area embeds the library's player [[video-library-6](catalog/video-library.md#video-library-6)], [[video-library-7](catalog/video-library.md#video-library-7)].

## Verification

### course-publishing-4

Where the acceptance suite signs in as the admin on a seeded deployment, when it drives a course from creation through publication, the suite shall assert each stage:

1. creating a course, adding a section and a lesson, uploading a fixture video, attaching it through the picker, and publishing shows the public course page's syllabus with that lesson — and only that lesson — marked playable [[course-publishing-1](#course-publishing-1)], the lesson view's media area embedding the library's player and the stored reference equal to the uploaded asset's identifier [[course-publishing-3](#course-publishing-3)];
2. adding a second lesson attaching the same asset stores the same asset identifier on both lessons [[course-publishing-3](#course-publishing-3)].

### course-publishing-5

Where a published lesson references a library asset, when the admin deletes that asset from the library, the acceptance suite shall assert the course page still shows the full syllabus with that lesson's playable marking gone, the lesson view shows the no-media presentation, and the course manager marks the attachment unavailable [[course-publishing-2](#course-publishing-2)].
