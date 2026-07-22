<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-000: Minimal Course Scope

## Status

Accepted for the demo.

## Context

The demo needs enough product depth to test reusable package boundaries and integrated behavior without becoming a speculative learning platform.

## Decision

- Every visitor may browse published courses and lessons without signing in.
  The catalog offers `Newest` and `Title A–Z`, with `Newest` as the default ([CAT-1](../packages/learning/course-catalog.md#cat-1)).
- Watching a lesson video requires an active GitHub application session and a fresh allow decision for that exact published lesson attachment.
- One administrator is designated by configured stable GitHub subject under [DR-003](003-admin-designation.md); every other signed-in account is a member.
- A course is one mutable record with an ordered syllabus and a published or unpublished state.
  Saving a published course changes subsequent public reads immediately and atomically; there is no staging area, numbered release, or publication history ([CAT-7](../packages/learning/course-catalog.md#cat-7)).
- Publishing and unpublishing toggle that same record.
  Confirmed course deletion hard-deletes its structure and stored media references but leaves video-library assets unchanged ([CAT-10](../packages/learning/course-catalog.md#cat-10), [CAT-11](../packages/learning/course-catalog.md#cat-11)).
- Video is the only installed lesson-media kind.
  A lesson stores only an opaque reusable reference; deleting a video leaves a repairable unavailable attachment rather than mutating the course ([CAT-9](../packages/learning/course-catalog.md#cat-9), [VIDS-6](../packages/media/video-library.md#vids-6)).
- Accepted uploads are non-empty MP4 or WebM files no larger than 1 GiB.
  Interruption creates no listed video, and retry starts from byte zero ([VIDS-1](../packages/media/video-library.md#vids-1), [VIDS-3](../packages/media/video-library.md#vids-3)).
- A playback bearer is transferable, scoped to one video, and expires no later than five minutes.
  A later sign-out, unpublication, or course deletion prevents new grants but does not promise to invalidate an issued bearer before expiry ([VIDS-7](../packages/media/video-library.md#vids-7)).
  Video deletion also prevents new grants and removes the origin asset; no later action can retract bytes already delivered or cached ([VIDS-6](../packages/media/video-library.md#vids-6)).
- Enrollment, payment, invitations, progress tracking, quizzes, comments, certificates, search, analytics, multiple designated administrators, role management, video transcoding, adaptive streaming, DRM, and a product download action are out of scope.

## Consequences

- Course management is one small lifecycle, and public readers never depend on an authoring snapshot or release registry.
- Hard deletion has a clear ownership boundary: course data and video assets are removed only by their owning packages.
- Upload retry may resend a large file, and playback authorization has an explicit bounded-staleness window after session or course-policy changes.
- Code generation should not invent any excluded feature or stronger revocation guarantee.
