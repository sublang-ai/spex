<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# GUARD: Protect Course Content

## Intent

This composition covers one coherent security outcome across routing, identity, roles, drafts, releases, and private media: content and authoring are unavailable unless the complete package chain allows them.

## Scenario

### GUARD-1
Composes: [GHID-1](../../packages/access/github-identity.md#ghid-1), [SITE-2](../../packages/web/application-shell.md#site-2), [CAT-6](../../packages/learning/course-catalog.md#cat-6), [VIDS-6](../../packages/media/video-library.md#vids-6)
Bindings: [ENTRY-10](../access/enter-site.md#entry-10), [PLAT-1](../operations/install-platform.md#plat-1), [ACCESS-2](../access/install-course-access.md#access-2), [ACCESS-3](../access/install-course-access.md#access-3), [ACCESS-4](../access/install-course-access.md#access-4)

Where no application session exists, when a visitor requests catalog, course, lesson, or video routes directly, the website shall reveal no course or video metadata, offer GitHub sign-in through the login route, and preserve only a safe internal destination.

### GUARD-2
Composes: [ROLE-2](../../packages/access/role-access.md#role-2), [SYLL-8](../../packages/learning/course-syllabus.md#syll-8), [CAT-7](../../packages/learning/course-catalog.md#cat-7), [VIDS-8](../../packages/media/video-library.md#vids-8), [SITE-6](../../packages/web/application-shell.md#site-6)
Bindings: [ACCESS-1](../access/install-course-access.md#access-1), [ACCESS-3](../access/install-course-access.md#access-3), [ACCESS-4](../access/install-course-access.md#access-4), [PLAT-4](../operations/install-platform.md#plat-4)

Where an authenticated member has no administrator capability, when the member requests an administrator page, the website shall show `Page unavailable` and reveal no administrator data.
When the member directly calls draft editing, upload creation, video asset management, publication, or unpublication actions, the website shall report that administrator access is required and leave every draft, upload, object, and release unchanged.

### GUARD-3
Composes: [CAT-2](../../packages/learning/course-catalog.md#cat-2), [CAT-6](../../packages/learning/course-catalog.md#cat-6), [CAT-8](../../packages/learning/course-catalog.md#cat-8), [VIDS-4](../../packages/media/video-library.md#vids-4), [VIDS-6](../../packages/media/video-library.md#vids-6), [SITE-6](../../packages/web/application-shell.md#site-6)
Bindings: [ACCESS-4](../access/install-course-access.md#access-4), [PUBLISH-10](../authoring/publish-course.md#publish-10), [PUBLISH-11](../authoring/publish-course.md#publish-11), [LEARN-10](../learning/browse-and-watch.md#learn-10)

Where a current published course has a lesson with an attached ready video, when a member requests that course and lesson, the website shall show and play exactly that published content.
Where a member guesses the slug, release ID, lesson ID, or video asset ID of draft, unpublished, prior-release, unready, or unattached content, when the member requests it, the website shall return one unavailable outcome and disclose neither existence nor private object location.

### GUARD-4
Composes: [GHID-4](../../packages/access/github-identity.md#ghid-4), [ROLE-2](../../packages/access/role-access.md#role-2), [CAT-8](../../packages/learning/course-catalog.md#cat-8), [VIDS-5](../../packages/media/video-library.md#vids-5), [VIDS-6](../../packages/media/video-library.md#vids-6), [VIDS-9](../../packages/media/video-library.md#vids-9)
Bindings: [PLAT-1](../operations/install-platform.md#plat-1), [PLAT-4](../operations/install-platform.md#plat-4), [ACCESS-1](../access/install-course-access.md#access-1), [ACCESS-4](../access/install-course-access.md#access-4), [LEARN-10](../learning/browse-and-watch.md#learn-10)

Where a member signs out, when the former member requests renewal, another playback grant, or the unsigned private object with the unexpired Auth token, the system shall issue no new playback grant and shall authorize no unsigned object request.
When the former member retries an earlier bearer location, the system shall make no promise to revoke bytes or responses already transferred or cached and shall record no new application authorization.

### GUARD-5
Composes: [GHID-4](../../packages/access/github-identity.md#ghid-4), [ROLE-1](../../packages/access/role-access.md#role-1), [ROLE-2](../../packages/access/role-access.md#role-2), [SYLL-1](../../packages/learning/course-syllabus.md#syll-1), [SYLL-8](../../packages/learning/course-syllabus.md#syll-8), [CAT-1](../../packages/learning/course-catalog.md#cat-1), [CAT-6](../../packages/learning/course-catalog.md#cat-6), [CAT-7](../../packages/learning/course-catalog.md#cat-7), [CAT-8](../../packages/learning/course-catalog.md#cat-8), [VIDS-1](../../packages/media/video-library.md#vids-1), [VIDS-4](../../packages/media/video-library.md#vids-4), [VIDS-6](../../packages/media/video-library.md#vids-6), [VIDS-8](../../packages/media/video-library.md#vids-8)
Bindings: [PLAT-1](../operations/install-platform.md#plat-1), [PLAT-4](../operations/install-platform.md#plat-4), [ACCESS-1](../access/install-course-access.md#access-1), [ACCESS-3](../access/install-course-access.md#access-3), [ACCESS-4](../access/install-course-access.md#access-4), [PUBLISH-10](../authoring/publish-course.md#publish-10), [PUBLISH-11](../authoring/publish-course.md#publish-11), [LEARN-10](../learning/browse-and-watch.md#learn-10)

Where anonymous, non-GitHub Auth, signed-out with an unexpired credential, active-member, and active-administrator callers have the public Supabase URL and publishable key, when they directly request every draft, catalog, publication, video-registry, arbitrary Storage upload-path, and private-object operation, the system shall give an active member only current published course data and exact authorized playback, give the active administrator those same reads plus only the additional authoring, upload, asset-management, and publication operations allowed by the website, deny every other operation and every request from the other caller classes, and expose no service credential.

### GUARD-6
Composes: [CAT-5](../../packages/learning/course-catalog.md#cat-5), [CAT-8](../../packages/learning/course-catalog.md#cat-8), [VIDS-5](../../packages/media/video-library.md#vids-5), [VIDS-9](../../packages/media/video-library.md#vids-9)
Bindings: [ACCESS-4](../access/install-course-access.md#access-4), [LEARN-10](../learning/browse-and-watch.md#learn-10)

While a member has an active playback grant, when the administrator unpublishes its course and the player later requests fresh access, the website shall remove the course from new catalog reads, deny the stale lesson and entitlement, issue no new playback grant, and make no promise to erase already transferred or cached bytes.

## Verification

### GUARD-20
Verifies: [GUARD-1](#guard-1), [GUARD-3](#guard-3)

Where acceptance fixtures include a draft course, unpublished release, prior release, current release, unready asset, unattached ready asset, random identifiers, and a safe lesson destination, when anonymous and authenticated-member browsers request every route and identifier class, the acceptance suite shall assert only current published catalog disclosure and exact entitled playback, GitHub login plus preservation of the safe anonymous destination, and uniform outcomes for all hidden cases.

### GUARD-21
Verifies: [GUARD-2](#guard-2)

Where a member browser captures and replays the administrator's route and action shapes with forged role and owner fields, when it requests each administrator page and attempts draft edits, upload creation, asset management, publication, and unpublication, the acceptance suite shall assert deterministic page/action outcomes, denial at each trusted boundary, and byte-equivalent draft, asset, object, and release state afterward.

### GUARD-22
Verifies: [GUARD-4](#guard-4)

Where a member obtains a playback grant and then signs out while its Auth token remains unexpired, when the acceptance clock checks pre-expiry, nominal expiry, renewal, unsigned-object, and copied-bearer cases with controllable cache behavior, the acceptance suite shall assert immediate denial of every new application grant, no new origin authorization after nominal expiry, denial of unsigned access, no account-bound redemption claim for a copied unexpired bearer, and the explicit exclusion for previously transferred or cached bytes.

### GUARD-23
Verifies: [GUARD-5](#guard-5)

Where direct REST, RPC, and Storage clients use the publishable key as anonymous, non-GitHub Auth, revoked-but-unexpired session, active member, and active administrator identities, when every stated data operation and arbitrary upload/object path is exercised, the acceptance suite shall assert exactly the caller permissions and denials in [GUARD-5](#guard-5), private-bucket behavior, and no service credential in any client.

### GUARD-24
Verifies: [GUARD-6](#guard-6)

Where a member begins playback and captures the request shape and entitlement timing, when an administrator unpublishes the course and the member replays the prior shape before and after nominal grant expiry, the acceptance suite shall assert removal from new catalog reads, stale lesson denial, rejection of the prior entitlement and every renewal, no new playback grant, and no claim beyond already transferred or cached bytes.
