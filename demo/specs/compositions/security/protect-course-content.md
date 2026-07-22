<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# GUARD: Protect Course Content

## Intent

This composition permits sanitized current published course metadata to the public while keeping drafts, administrator actions, video metadata, playback authorization, and Storage access unavailable unless the complete package chain allows them.

## Scenario

### GUARD-1
Composes: [GHID-1](../../packages/access/github-identity.md#ghid-1), [SITE-2](../../packages/web/application-shell.md#site-2), [CAT-1](../../packages/learning/course-catalog.md#cat-1), [CAT-2](../../packages/learning/course-catalog.md#cat-2), [CAT-6](../../packages/learning/course-catalog.md#cat-6), [CAT-8](../../packages/learning/course-catalog.md#cat-8), [CAT-26](../../packages/learning/course-catalog.md#cat-26), [VIDS-6](../../packages/media/video-library.md#vids-6)
Bindings: [ENTRY-10](../access/enter-site.md#entry-10), [PLAT-1](../operations/install-platform.md#plat-1), [ACCESS-2](../access/install-course-access.md#access-2), [ACCESS-3](../access/install-course-access.md#access-3), [ACCESS-4](../access/install-course-access.md#access-4)

Where no active GitHub application session exists, when a visitor requests the catalog or a current published course or lesson directly, the website shall show its sanitized public metadata without starting authentication and shall reveal no draft, raw snapshot, content reference, asset identity or revision, upload label, private object location, or bearer value.
When that visitor explicitly requests playback, the website shall offer only GitHub entry, preserve only the safe public lesson route, and issue no playback authorization or private Storage request before authentication succeeds.

### GUARD-2
Composes: [ROLE-2](../../packages/access/role-access.md#role-2), [SYLL-8](../../packages/learning/course-syllabus.md#syll-8), [CAT-7](../../packages/learning/course-catalog.md#cat-7), [VIDS-8](../../packages/media/video-library.md#vids-8), [SITE-6](../../packages/web/application-shell.md#site-6)
Bindings: [ACCESS-1](../access/install-course-access.md#access-1), [ACCESS-3](../access/install-course-access.md#access-3), [ACCESS-4](../access/install-course-access.md#access-4), [PLAT-4](../operations/install-platform.md#plat-4)

Where an authenticated member has no administrator capability, when the member requests an administrator page, the website shall show `Page unavailable` and reveal no administrator data.
When the member directly calls draft editing, upload creation, video asset management, publication, or unpublication actions, the website shall report that administrator access is required and leave every draft, upload, object, and release unchanged.

### GUARD-3
Composes: [CAT-2](../../packages/learning/course-catalog.md#cat-2), [CAT-6](../../packages/learning/course-catalog.md#cat-6), [CAT-8](../../packages/learning/course-catalog.md#cat-8), [CAT-26](../../packages/learning/course-catalog.md#cat-26), [VIDS-4](../../packages/media/video-library.md#vids-4), [VIDS-6](../../packages/media/video-library.md#vids-6), [SITE-6](../../packages/web/application-shell.md#site-6)
Bindings: [ACCESS-4](../access/install-course-access.md#access-4), [PUBLISH-10](../authoring/publish-course.md#publish-10), [PUBLISH-11](../authoring/publish-course.md#publish-11), [LEARN-10](../learning/browse-and-watch.md#learn-10)

Where a current published course has a lesson with an attached ready video, when a visitor or member requests that course and lesson, the website shall show the same sanitized current published metadata to either audience and shall play the exact attached video only after fresh member authorization.
Where either audience guesses a draft, unpublished, prior-release, or unknown course or lesson route, or directly requests a private content or asset identity, when it is requested, the website shall return one unavailable outcome and disclose neither existence nor private object location.
Where a current published lesson's formerly ready attached video becomes unavailable, when either audience opens the lesson, the website shall retain the sanitized public page; it shall keep the visitor at the sign-in-required video state and show the member only a generic unavailable video state without asset or denial detail.

### GUARD-4
Composes: [GHID-4](../../packages/access/github-identity.md#ghid-4), [ROLE-2](../../packages/access/role-access.md#role-2), [CAT-8](../../packages/learning/course-catalog.md#cat-8), [VIDS-5](../../packages/media/video-library.md#vids-5), [VIDS-6](../../packages/media/video-library.md#vids-6), [VIDS-9](../../packages/media/video-library.md#vids-9)
Bindings: [PLAT-1](../operations/install-platform.md#plat-1), [PLAT-4](../operations/install-platform.md#plat-4), [ACCESS-1](../access/install-course-access.md#access-1), [ACCESS-4](../access/install-course-access.md#access-4), [LEARN-10](../learning/browse-and-watch.md#learn-10)

Where a member signs out, when the former member requests renewal, another playback grant, or the unsigned private object with the unexpired Auth token, the system shall issue no new playback grant and shall authorize no unsigned object request.
When the former member retries an earlier bearer location, the system shall make no promise to revoke bytes or responses already transferred or cached and shall record no new application authorization.
While the course remains published, the signed-out browser may continue reading only its sanitized public course and lesson metadata and shall show GitHub entry instead of protected playback.

### GUARD-5
Composes: [GHID-4](../../packages/access/github-identity.md#ghid-4), [GHID-12](../../packages/access/github-identity.md#ghid-12), [ROLE-1](../../packages/access/role-access.md#role-1), [ROLE-2](../../packages/access/role-access.md#role-2), [ROLE-16](../../packages/access/role-access.md#role-16), [SYLL-1](../../packages/learning/course-syllabus.md#syll-1), [SYLL-8](../../packages/learning/course-syllabus.md#syll-8), [SYLL-18](../../packages/learning/course-syllabus.md#syll-18), [CAT-1](../../packages/learning/course-catalog.md#cat-1), [CAT-6](../../packages/learning/course-catalog.md#cat-6), [CAT-7](../../packages/learning/course-catalog.md#cat-7), [CAT-8](../../packages/learning/course-catalog.md#cat-8), [CAT-19](../../packages/learning/course-catalog.md#cat-19), [CAT-26](../../packages/learning/course-catalog.md#cat-26), [VIDS-1](../../packages/media/video-library.md#vids-1), [VIDS-4](../../packages/media/video-library.md#vids-4), [VIDS-6](../../packages/media/video-library.md#vids-6), [VIDS-8](../../packages/media/video-library.md#vids-8), [VIDS-14](../../packages/media/video-library.md#vids-14), [VIDS-18](../../packages/media/video-library.md#vids-18), [VIDS-19](../../packages/media/video-library.md#vids-19)
Bindings: [PLAT-1](../operations/install-platform.md#plat-1), [PLAT-4](../operations/install-platform.md#plat-4), [ACCESS-1](../access/install-course-access.md#access-1), [ACCESS-4](../access/install-course-access.md#access-4), [PUBLISH-10](../authoring/publish-course.md#publish-10), [PUBLISH-11](../authoring/publish-course.md#publish-11), [LEARN-10](../learning/browse-and-watch.md#learn-10)

Where anonymous, non-GitHub Auth, signed-out with an unexpired credential, active-member, and active-administrator callers have the public Supabase URL and publishable key, when they directly request every draft, catalog, publication, entitlement, video-registry, arbitrary Storage upload-path, and private-object operation, the system shall enforce this matrix and expose no service credential:

| Surface | Anonymous, non-GitHub Auth, or signed out | Active member | Active administrator |
| --- | --- | --- | --- |
| current published catalog, course, and lesson projection | read sanitized public fields | same public read | same public read |
| new exact-current playback grant | none | allowed for the requested attached ready video | same as member |
| drafts, publication, upload, and video management | none | none | only the exact authorized action |
| raw snapshot or content-reference data; arbitrary or unsigned private object | none | none | none |

The playback row governs grant issuance; redemption of an already issued exact bearer remains possession-based for its bounded lifetime as stated by [GUARD-4](#guard-4).

### GUARD-6
Composes: [CAT-5](../../packages/learning/course-catalog.md#cat-5), [CAT-8](../../packages/learning/course-catalog.md#cat-8), [VIDS-5](../../packages/media/video-library.md#vids-5), [VIDS-9](../../packages/media/video-library.md#vids-9)
Bindings: [ACCESS-4](../access/install-course-access.md#access-4), [LEARN-10](../learning/browse-and-watch.md#learn-10)

While a member has an active playback grant, when the administrator unpublishes its course and the player later requests fresh access, the website shall remove the course from new catalog reads, deny the stale lesson and entitlement, issue no new playback grant, and make no promise to erase already transferred or cached bytes.

## Verification

### GUARD-20
Verifies: [GUARD-1](#guard-1), [GUARD-3](#guard-3)

Where acceptance fixtures include a draft course, unpublished release, prior release, current release, a current lesson with a formerly ready unavailable attachment, an unready asset, unattached ready asset, random identifiers, and a safe lesson destination, when anonymous and authenticated-member browsers request every route and identifier class and explicitly attempt playback, the acceptance suite shall assert the same sanitized current published projection for both audiences, retained HTTP-200 public lesson metadata with only audience-appropriate video-area states for the unavailable attachment, no authentication or private-service request during public browsing, GitHub entry only for the anonymous playback attempt, route-only safe return, exact entitled playback only for the member, absence of every private identifier and bearer from public output, and uniform outcomes for all hidden routes and direct identifiers.

### GUARD-21
Verifies: [GUARD-2](#guard-2)

Where a member browser captures and replays the administrator's route and action shapes with forged role and owner fields, when it requests each administrator page and attempts draft edits, upload creation, asset management, publication, and unpublication, the acceptance suite shall assert deterministic page/action outcomes, denial at each trusted boundary, and byte-equivalent draft, asset, object, and release state afterward.

### GUARD-22
Verifies: [GUARD-4](#guard-4)

Where a member obtains a playback grant and then signs out while its Auth token remains unexpired, when the acceptance clock checks public course access, pre-expiry, nominal expiry, renewal, unsigned-object, and copied-bearer cases with controllable cache behavior, the acceptance suite shall assert continued sanitized public metadata while published, immediate denial of every new application grant, no new origin authorization after nominal expiry, denial of unsigned access, no account-bound redemption claim for a copied unexpired bearer, and the explicit exclusion for previously transferred or cached bytes.

### GUARD-23
Verifies: [GUARD-5](#guard-5)

Where direct REST, RPC, and Storage clients use the publishable key as anonymous, non-GitHub Auth, revoked-but-unexpired session, active member, and active administrator identities, when every stated data operation, entitlement request, and arbitrary upload/object path is exercised, the acceptance suite shall assert exactly the public projection, caller permissions, and denials in [GUARD-5](#guard-5); no raw snapshot or content-reference field in a public response; private-bucket behavior; and no service credential in any client.

### GUARD-24
Verifies: [GUARD-6](#guard-6)

Where anonymous and member browsers have opened and primed every response for a published lesson and the member begins playback and captures the request shape and entitlement timing, when an administrator unpublishes the course and either browser rereads the lesson while the member replays the prior shape before and after nominal grant expiry, the acceptance suite shall assert removal from every new public catalog read without a stale shared response, stale lesson denial for both audiences, rejection of the prior entitlement and every renewal, no new playback grant, and no claim beyond already transferred or cached video bytes.
