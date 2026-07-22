<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# GUARD: Protect Course Content

## Intent

This composition permits sanitized current published course metadata to the public while keeping drafts, administrator actions, video metadata, playback authorization, and Storage access unavailable unless the complete package chain allows them.

## Scenario

### GUARD-1

Where no active GitHub application session exists, when a visitor requests the [public catalog](../../packages/learning/course-catalog.md#cat-1) or a [current published lesson](../../packages/learning/course-catalog.md#cat-8) directly, the website shall show its sanitized public metadata without starting authentication and shall reveal no draft, raw snapshot, content reference, asset identity or revision, upload label, private object location, or bearer value.
When that visitor explicitly requests playback, the website shall offer only [GitHub entry](../../packages/access/github-identity.md#ghid-1), preserve only the safe public lesson route, and issue no playback authorization or private Storage request before authentication succeeds, leaving the player in its [plain unavailable state](../../packages/media/video-library.md#vids-6).

### GUARD-2

Where an authenticated [member has no administrator capability](../../packages/access/role-access.md#role-2), when the member requests an administrator page, the website shall show the shell's uniform [`Page unavailable`](../../packages/web/application-shell.md#site-6) outcome and reveal no administrator data.
When the member directly calls [draft editing](../../packages/learning/course-syllabus.md#syll-8), [upload or video management](../../packages/media/video-library.md#vids-8), or [publication or unpublication](../../packages/learning/course-catalog.md#cat-7), the website shall report that administrator access is required and leave every draft, upload, object, and release unchanged.

### GUARD-3

Where a [current published course has a lesson](../../packages/learning/course-catalog.md#cat-2) with an attached ready video, when a visitor or member requests it, the website shall show the same sanitized current published metadata to either audience and shall show the [exact attached video controls](../../packages/media/video-library.md#vids-4) only after fresh member authorization.
Where either audience guesses a draft, unpublished, prior-release, or unknown course or lesson route, or directly requests a private content or asset identity, when it is requested, the website shall return the catalog's [uniform unavailable outcome](../../packages/learning/course-catalog.md#cat-6) through the shell's matching [HTTP-404 page](../../packages/web/application-shell.md#site-6) and disclose neither existence nor private object location.
Where a current published lesson's formerly ready attached video becomes unavailable, when either audience opens the lesson, the website shall retain the sanitized public page; it shall keep the visitor at the sign-in-required video state and show the member only the video's [generic unavailable state](../../packages/media/video-library.md#vids-6) without asset or denial detail.

### GUARD-4

Where a member [signs out](../../packages/access/github-identity.md#ghid-4), when the former member requests renewal, another playback grant, or the unsigned private object with the unexpired Auth token, the system shall issue no new playback grant and shall authorize no unsigned object request, as required by the video's [signed-out playback boundary](../../packages/media/video-library.md#vids-9).
When the former member retries an earlier bearer location, the system shall make no promise to revoke bytes or responses already transferred or cached and shall record no new application authorization.
While the course remains published, the signed-out browser may continue reading only its [sanitized public lesson metadata](../../packages/learning/course-catalog.md#cat-8) and shall show GitHub entry instead of protected playback.

### GUARD-5

Where anonymous, non-GitHub Auth, signed-out with an unexpired credential, active-member, and active-administrator callers have the public Supabase URL and publishable key, when they directly request every draft, [public catalog](../../packages/learning/course-catalog.md#cat-1), [publication](../../packages/learning/course-catalog.md#cat-7), entitlement, [video-management](../../packages/media/video-library.md#vids-8), arbitrary Storage upload-path, and private-object operation, the system shall enforce this matrix and expose no service credential:

| Surface | Anonymous, non-GitHub Auth, or signed out | Active member | Active administrator |
| --- | --- | --- | --- |
| current published catalog, course, and lesson projection | read sanitized public fields | same public read | same public read |
| new exact-current playback grant | none | allowed for the requested attached ready video | same as member |
| drafts, publication, upload, and video management | none | none | only the exact authorized action |
| raw snapshot or content-reference data; arbitrary or unsigned private object | none | none | none |

The playback row governs grant issuance; redemption of an already issued exact bearer remains [possession-based for its bounded lifetime](../../packages/media/video-library.md#vids-11), independent of later [session sign-out](../../packages/access/github-identity.md#ghid-4).

### GUARD-6

While a member has an active playback grant, when the administrator [unpublishes its course](../../packages/learning/course-catalog.md#cat-5) and the player later [requests fresh access](../../packages/media/video-library.md#vids-5), the website shall remove the course from new catalog reads, deny the stale lesson and entitlement, issue no new playback grant, and make no promise to erase already transferred or cached bytes.

## Verification

### GUARD-20

Where acceptance fixtures include a draft course, unpublished release, prior release, current release, a current lesson with a formerly ready unavailable attachment, an unready asset, unattached ready asset, random identifiers, and a safe lesson destination, when anonymous and authenticated-member browsers request every route and identifier class and explicitly attempt playback, the acceptance suite shall assert the [anonymous public-browsing and playback boundary](#guard-1), the [shared published-lesson behavior](#guard-3), retained HTTP-200 public lesson metadata with only audience-appropriate video-area states for the unavailable attachment, route-only safe return, absence of every private identifier and bearer from public output, and uniform outcomes for all hidden routes and direct identifiers.

### GUARD-21

Where a member browser captures and replays the administrator's route and action shapes with forged role and owner fields, when it requests each administrator page and attempts draft edits, upload creation, asset management, publication, and unpublication, the acceptance suite shall assert the [member denial boundary](#guard-2), deterministic page/action outcomes, and byte-equivalent draft, asset, object, and release state afterward.

### GUARD-22

Where a member obtains a playback grant and then signs out while its Auth token remains unexpired, when the acceptance clock checks public course access, pre-expiry, nominal expiry, renewal, unsigned-object, and copied-bearer cases with controllable cache behavior, the acceptance suite shall assert the [signed-out playback boundary](#guard-4): continued sanitized public metadata while published, immediate denial of every new application grant, no new origin authorization after nominal expiry, denial of unsigned access, no account-bound redemption claim for a copied unexpired bearer, and the explicit exclusion for previously transferred or cached bytes.

### GUARD-23

Where direct REST, RPC, and Storage clients use the publishable key as anonymous, non-GitHub Auth, revoked-but-unexpired session, active member, and active administrator identities, when every stated data operation, entitlement request, and arbitrary upload/object path is exercised, the acceptance suite shall assert exactly the [direct-service access matrix](#guard-5), no raw snapshot or content-reference field in a public response, private-bucket behavior, and no service credential in any client.

### GUARD-24

Where anonymous and member browsers have opened and primed every response for a published lesson and the member begins playback and captures the request shape and entitlement timing, when an administrator unpublishes the course and either browser rereads the lesson while the member replays the prior shape before and after nominal grant expiry, the acceptance suite shall assert the [unpublication-during-playback outcome](#guard-6): removal from every new public catalog read without a stale shared response, stale lesson denial for both audiences, rejection of the prior entitlement and every renewal, no new playback grant, and no claim beyond already transferred or cached video bytes.
