<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# PUBLISH: Author and Publish a Course

## Intent

This composition covers the administrator journey from a new ordered syllabus and private video uploads to one coherent learner-visible course release.
It hands a ready video reference into a syllabus lesson and a complete syllabus snapshot into catalog publication.

## Binding

### PUBLISH-10
Clients: `learning-content input` = [SYLL-13](../../packages/learning/course-syllabus.md#syll-13)
Suppliers: `video reference and description` = [VIDS-10](../../packages/media/video-library.md#vids-10)
Scope: lesson content in this course website, with `video` as the sole installed content kind

The installation shall supply SYLL with VIDS's unchanged chooser descriptions and exact-reference status for the same active account and request, preserving every identity, lifecycle, reference-completeness, and unavailable-result meaning owned by the two endpoints.

### PUBLISH-11
Clients: `publication snapshot input` = [CAT-15](../../packages/learning/course-catalog.md#cat-15)
Suppliers: `complete snapshot` = [SYLL-11](../../packages/learning/course-syllabus.md#syll-11)
Scope: each complete course publication-candidate handoff

The installation shall supply CAT only SYLL's trusted immutable schema-version `1` snapshot for the same draft and revision; SYLL keeps every no-snapshot validation result in authoring.

### PUBLISH-12
Clients: `success input` = [SYLL-15](../../packages/learning/course-syllabus.md#syll-15), `conflict input` = [SYLL-17](../../packages/learning/course-syllabus.md#syll-17)
Suppliers: `success report` = [CAT-10](../../packages/learning/course-catalog.md#cat-10), `conflict report` = [CAT-16](../../packages/learning/course-catalog.md#cat-16)
Scope: the response to each course publication request

The installation shall return CAT's unchanged success report to SYLL-15 or conflict report to SYLL-17 for the draft and snapshot that originated the request.

## Scenario

### PUBLISH-1

Where the configured administrator starts with no course, when the administrator opens course authoring, follows its primary [`Create course` action](../../packages/learning/course-syllabus.md#syll-1), creates an ordered draft, [uploads ready videos](../../packages/media/video-library.md#vids-3), attaches one ready reference to every lesson through the [installed video-content handoff](#publish-10) while reusing the same video where chosen, and confirms publication through the [installed snapshot handoff](#publish-11), the website shall [publish one coherent release](../../packages/learning/course-catalog.md#cat-3) whose public learner view contains the same title, summary, section order, and lesson order, and shall return the accepted draft revision and locked slug through the [installed publication-result handoff](#publish-12) as the authoring view's published baseline.

### PUBLISH-2

While a draft lesson's intended upload is [invalid](../../packages/media/video-library.md#vids-2), [failed, or interrupted](../../packages/media/video-library.md#vids-3), when the administrator checks publication readiness, the website shall [identify that lesson as blocked and keep publication unavailable](../../packages/learning/course-syllabus.md#syll-5).
When the same intended upload later succeeds, the [installed video-content handoff](#publish-10) shall offer one ready reference for the lesson and no duplicate attachment.

### PUBLISH-3

Where a course is published, when the administrator [edits and reorders its draft](../../packages/learning/course-syllabus.md#syll-6), visitors shall continue seeing the [complete earlier release](../../packages/learning/course-catalog.md#cat-4) until the administrator supplies the later snapshot through the [installed snapshot handoff](#publish-11), after which new public reads shall see the complete later release and no mixed revision and the [installed publication-result handoff](#publish-12) shall mark the accepted revision as the new published baseline while retaining the locked slug.

### PUBLISH-4

Where a draft fails one or more publishability rules, when the administrator requests readiness or publication, the website shall [show every actionable validation result](../../packages/learning/course-syllabus.md#syll-9) at its field or lesson in the [retained editor context](../../packages/web/application-shell.md#site-4), emit no snapshot through the [installed snapshot handoff](#publish-11), initiate no catalog publication, and preserve the draft.

### PUBLISH-5

Where another published or unpublished course reserves the draft's syntactically valid slug, or a later snapshot tries to change the slug locked by that course's first release, when the administrator supplies it through the [installed snapshot handoff](#publish-11), the website shall [show the slug conflict without disclosing another draft and preserve the current draft](../../packages/learning/course-syllabus.md#syll-9), [preserve every current release and reservation](../../packages/learning/course-catalog.md#cat-9), and create no conflicting release.
When the administrator gives the eligible different-course draft an unreserved slug or restores the same course's locked slug and confirms again, the website shall publish that corrected snapshot and show its accepted locked slug through the [installed publication-result handoff](#publish-12).

### PUBLISH-6

Where the authoring pages are rendered at 360 CSS pixels and 200 percent zoom, when an administrator uses only the keyboard to [create and reorder a syllabus](../../packages/learning/course-syllabus.md#syll-3), [upload](../../packages/media/video-library.md#vids-1) and [choose video](../../packages/media/video-library.md#vids-7), resolve a dialog, and publish, the [integrated presentation](../../packages/web/application-shell.md#site-5) shall preserve visible focus, labels, status announcements, logical order, and usable actions without horizontal page scrolling.

## Verification

### PUBLISH-20

Where separate administrator, anonymous-reader, and member browsers use a clean acceptance environment, when the administrator completes the [initial publication journey](#publish-1), the readers prime every public response, and the administrator completes the [later-snapshot journey](#publish-3), the acceptance suite shall assert the empty-state affordance, the same exact public learner hierarchy for the anonymous reader and member, one whole current release at each stage with no stale shared response, a receipt that establishes the accepted revision and locked slug in the authoring view, and no draft leakage between publications.

### PUBLISH-21

Where uploads can be rejected, interrupted, resumed, failed, and retried and the draft can omit each required field in turn, when the administrator drives the [upload-recovery case](#publish-2) and [invalid-draft case](#publish-4), then publishes after correction, the acceptance suite shall assert lesson-specific blocking, complete actionable validation, no snapshot or catalog request before correction, preserved draft state, and one attachment after successful retry.

### PUBLISH-22

Where fixtures cover a slug reserved by another published course, a slug retained by another unpublished course, and a changed slug for a later snapshot of the same course, when the administrator exercises the [slug-conflict and correction case](#publish-5), the acceptance suite shall assert each redacted conflict without another draft's identity, byte-equivalent drafts, releases, and reservations after every failure, and one correct later release only after correction.

### PUBLISH-23

Where the real editor, reorder controls, uploader, chooser, confirmation dialog, and publication result are rendered at the required viewport and zoom, when keyboard-only and assistive-technology checks complete the [accessible authoring journey](#publish-6), the acceptance suite shall assert focus order/visibility, names, announcements, state changes, usable layout, and successful publication.

### PUBLISH-24

Where versioned provider and client contract fixtures contain matching, incomplete, altered, mismatched-identity, exact repeated, result-identity-reused, cross-snapshot, and out-of-order values, including chooser descriptions in every lifecycle state and exact-reference status replies, when the [video-content](#publish-10), [publication-snapshot](#publish-11), and [publication-result](#publish-12) seams are checked directly, the conformance suite shall accept chooser omissions only for `uploading` or `failed`, require the exact reference for `ready`, `unavailable`, and status replies, accept only exact publication snapshots and results, preserve exact repeated current-snapshot success and conflict idempotently, reject reused identities and nonmatching snapshots, and preserve every endpoint meaning without conversion or duplication.
