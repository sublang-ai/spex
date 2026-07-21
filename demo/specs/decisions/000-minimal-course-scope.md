<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-000: Minimal Private Course Scope

## Status

Accepted for the demo.

## Context

The demo needs enough product depth to test package boundaries and cross-package acceptance without becoming a speculative learning platform.
The requested system has GitHub-only login, one initial administrator, course syllabus authoring, video upload, and authenticated course viewing.
Several product choices must be fixed before the behavior is precise enough to generate code.

## Decision

- The website is private: every course, syllabus, and video requires an authenticated account.
- A visitor becomes a member by completing GitHub sign-in; there is no separate registration step.
- One initial administrator is selected by a configured immutable GitHub numeric subject ID.
  Login order, username, and email do not grant administration.
- There is no role-management UI in this version.
- A draft course contains a title, syntactically valid proposed slug, summary, ordered sections, and ordered lessons.
  The slug is reserved globally and locked to that course only on its first successful publication; later publication candidates for that course must retain the locked slug.
  Every lesson has a title, optional description, and exactly one attached content reference before publication.
- Publication creates an immutable catalog release from the current draft.
  Later draft edits remain invisible until another successful publication.
- Video is the only lesson-content kind installed by [PUBLISH-10](../compositions/authoring/publish-course.md#publish-10) in this project.
  The syllabus contract nevertheless treats lesson content as an opaque reference so another system can bind documents, audio, or exercises without changing the syllabus package.
- Accepted uploads are at most 1 GiB and use either MP4 with H.264 video plus optional AAC-LC audio, or WebM with VP8/VP9 video plus optional Vorbis/Opus audio.
  Before upload, the administrator's browser must read positive duration/dimensions and successfully decode the selected file; the administrator is trusted to supply only one of the declared codec profiles.
  Finalization verifies completed Storage metadata, not a second full-file media scan.
  Representative files for every accepted profile must pass the repository's version-pinned Chrome, Firefox, and WebKit/Safari acceptance matrix; each release records the exact browser versions, and matrix updates are reviewed delivery changes.
  Per-upload transcoding, a media-processing worker, adaptive streaming, DRM, and a promise to revoke, prevent saving, or prevent sharing bearer access or bytes already delivered to an authorized viewer are out of scope.
- Enrollment, payment, invitations, progress tracking, quizzes, comments, certificates, search, public marketing pages, analytics, course or video deletion, and multiple administrators are out of scope.

## Consequences

- The demo has a concrete publish boundary rather than exposing partly authored courses.
- The configured numeric GitHub subject avoids a first-login race and survives username changes.
- Direct playback keeps the first version small but makes actual source encoding and browser compatibility an explicit administrator responsibility backed by representative cross-browser acceptance fixtures rather than an unspecified processing service.
- Scope exclusions are deliberate; code generation should not invent them.
