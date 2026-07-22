<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# PUBLISH: Author and Publish a Course

## Intent

This composition covers how an administrator builds and publishes a mutable course while its lesson-media slot uses the independent video library.

## Binding

### PUBLISH-1

Where lesson media in this course website uses CAT's [media-selection input](../../packages/learning/course-catalog.md#cat-15) and [media-resolution input](../../packages/learning/course-catalog.md#cat-16), the installation shall supply VIDS's [chooser references and reference resolution](../../packages/media/video-library.md#vids-5) according to this pairing:

| CAT client | Installed VIDS provision |
| --- | --- |
| media selection | chooser labels and the selected opaque video reference, or cancellation |
| media resolution | availability for the same stored opaque video reference, or unavailable |

CAT retains and owns each lesson reference; VIDS retains and owns each video asset.

## Scenario

### PUBLISH-2

Where the configured administrator starts with no course, when the administrator [creates an unpublished course](../../packages/learning/course-catalog.md#cat-5), [arranges its syllabus](../../packages/learning/course-catalog.md#cat-6), [uploads a video](../../packages/media/video-library.md#vids-1), attaches its reference through the [installed media handoff](#publish-1), and [publishes that same course record](../../packages/learning/course-catalog.md#cat-10), the website shall show the saved public title, summary, section order, and lesson order through the [course view](../../packages/learning/course-catalog.md#cat-2) and the playable lesson through its [resolved media view](../../packages/learning/course-catalog.md#cat-3).

### PUBLISH-3

While a lesson's video upload is incomplete, when the transfer is [interrupted or the administrator leaves the page](../../packages/media/video-library.md#vids-3), the website shall show no selectable partial video and shall preserve the course and lesson unchanged.
When the administrator retries from byte zero, completes the upload, and attaches it through the [installed media handoff](#publish-1), the [course manager](../../packages/learning/course-catalog.md#cat-8) shall store exactly one reference for that lesson.

### PUBLISH-4

Where a course is already published, when the administrator saves [changed details or syllabus order](../../packages/learning/course-catalog.md#cat-6) or a [changed media attachment](../../packages/learning/course-catalog.md#cat-8), the website shall expose the [complete saved state immediately and atomically](../../packages/learning/course-catalog.md#cat-7) on subsequent public reads and shall prevent a stale shared response through the shell's [current-state cache boundary](../../packages/web/application-shell.md#site-11).

### PUBLISH-5

Where a published course has a lesson attached to a listed video, when the administrator confirms [course deletion](../../packages/learning/course-catalog.md#cat-11), the website shall make every course and lesson route unavailable while the video remains [listed](../../packages/media/video-library.md#vids-4) and [independently resolvable](../../packages/media/video-library.md#vids-5).

### PUBLISH-6

Where a course lesson retains a reference to a listed video, when the administrator confirms [video deletion](../../packages/media/video-library.md#vids-6), the course and syllabus shall remain, its public lesson shall show no playable media, and the [course manager shall mark the retained reference unavailable](../../packages/learning/course-catalog.md#cat-9).
When the administrator replaces or clears it through the [installed media handoff](#publish-1), the course manager shall store the replacement reference or no reference without recreating the deleted video.

### PUBLISH-7

Where authoring is rendered at 360 CSS pixels or 200 percent zoom, when an administrator uses only the keyboard to [create](../../packages/learning/course-catalog.md#cat-5), [edit and reorder](../../packages/learning/course-catalog.md#cat-6), [publish](../../packages/learning/course-catalog.md#cat-10), and [delete courses](../../packages/learning/course-catalog.md#cat-11), [upload](../../packages/media/video-library.md#vids-1), [choose](../../packages/media/video-library.md#vids-5), [rename](../../packages/media/video-library.md#vids-4), and [delete videos](../../packages/media/video-library.md#vids-6), and confirm destructive actions, the [integrated presentation](../../packages/web/application-shell.md#site-5) shall preserve logical order, visible focus, labels, state announcements, and usable actions without horizontal page scrolling.

## Verification

### PUBLISH-8

Where a clean acceptance environment starts empty and can interrupt uploads, when the administrator completes the [first-course journey](#publish-2) and the [byte-zero recovery journey](#publish-3), the acceptance suite shall assert exact chooser and resolution pairing through the [installed media handoff](#publish-1), no partial selectable asset, retry from zero, one stored reference, and one published playable course with the saved syllabus order.

### PUBLISH-9

Where public readers straddle course changes, when the administrator completes the [live-edit journey](#publish-4) and [confirmed course deletion](#publish-5), the acceptance suite shall assert all-preceding or all-saved reads without mixed or stale state, immediate visibility after save, unavailable deleted routes, and an unchanged listed video.

### PUBLISH-10

Where a published lesson refers to a deletable video, when the administrator completes the [video-deletion and repair journey](#publish-6), the acceptance suite shall assert video record and content deletion, an unchanged course and syllabus, a retained unavailable reference visible only in management, public no-media presentation, and successful replacement or clearing.

### PUBLISH-11

Where the real authoring, upload, chooser, reorder, publication, and confirmation surfaces are rendered at the required viewport and zoom, when keyboard-only and assistive-technology checks complete the [accessible authoring journey](#publish-7), the acceptance suite shall assert focus order and visibility, names, announcements, state changes, usable layout, and successful completion of every action.
