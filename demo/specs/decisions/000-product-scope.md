<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-000: Product Scope

## Status

Accepted

## Context

Academy is the smallest online course site worth deploying.
"Minimal" must be a specified boundary, not a mood, or every
package quietly grows features.

## Decision

- Public, read-only catalog: anyone may browse published courses
  and their syllabi without an account.
- Watching lesson videos requires a signed-in account.
- GitHub OAuth is the only sign-in method: sign-in itself is
  [AUTH](../packages/identity/github-login.md); the exclusivity
  is installation policy
  ([PLAT-1](../compositions/platform-services.md#plat-1)).
- Exactly two roles: one configured admin
  ([DR-003](003-admin-designation.md)) and members; every
  signed-in non-admin is a member.
- Admin capabilities: manage courses and syllabi
  ([CAT](../packages/catalog/course-catalog.md)) and the video
  library ([VID](../packages/catalog/video-library.md)).
- Out of scope: enrollment, payments, progress tracking,
  comments, search, ratings, multiple admins, role management
  UI, video transcoding, and downloads.

## Consequences

- Every package stays small enough to hold in one file.
- Absences are behavior, not accidents: e.g., no step between
  sign-in and playback
  ([PLAY-2](../compositions/lesson-playback.md#play-2)), exactly
  one sign-in method
  ([PLAT-1](../compositions/platform-services.md#plat-1)).
- No transcoding means an upload must already be
  browser-playable, so the library accepts one declared profile
  ([VID-1](../packages/catalog/video-library.md#vid-1)).
- Adding any out-of-scope capability later starts with a new DR,
  not with code.
