<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-000: Product Scope

## Status

Accepted

## Context

Academy is the smallest online course site worth deploying.
"Minimal" must be a specified boundary, not a mood, or every package quietly grows features.

## Decision

- Public, read-only catalog: anyone may browse published courses and their syllabi without an account.
- Watching lesson videos requires a signed-in account.
- GitHub OAuth is the only sign-in method: sign-in itself is the github-login package; the exclusivity is installation policy [[platform-services-1](../packages/platform-services.md#platform-services-1)].
- Exactly two roles: one configured admin ([DR-003](003-admin-designation.md)) and members; every signed-in non-admin is a member.
- Admin capabilities: manage courses and syllabi (the course-catalog package) and the video library (the video-library package).
- Out of scope: enrollment, payments, progress tracking, comments, search, ratings, multiple admins, role management UI, video transcoding, and downloads.

## Consequences

- Every package stays small enough to hold in one file.
- Absences are behavior, not accidents: e.g., no step between sign-in and playback [[lesson-playback-2](../packages/lesson-playback.md#lesson-playback-2)], exactly one sign-in method [[platform-services-1](../packages/platform-services.md#platform-services-1)].
- No transcoding means an upload must already be browser-playable, so the library accepts one declared profile [[video-library-1](../packages/catalog/video-library.md#video-library-1)].
- Adding any out-of-scope capability later starts with a new DR, not with code.
