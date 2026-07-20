<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# GUARD: Protect Course Content

## Intent

This composition covers one coherent security outcome across routing, identity, roles, drafts, releases, and private media: content and authoring are unavailable unless the complete package chain allows them.

## Scenarios

### GUARD-1
Composes: [GHID-1](../../packages/access/github-identity.md#ghid-1), [SITE-2](../../packages/web/application-shell.md#site-2), [CAT-6](../../packages/learning/course-catalog.md#cat-6), [VIDS-6](../../packages/media/video-library.md#vids-6)
Binds:
- [SITE-0](../../packages/web/application-shell.md#site-0) `RequestedDestination` -> [GHID-0](../../packages/access/github-identity.md#ghid-0) `RequestedDestination`
- [GHID-0](../../packages/access/github-identity.md#ghid-0) `IdentityView` -> [SITE-0](../../packages/web/application-shell.md#site-0) `IdentityView`
- [GHID-0](../../packages/access/github-identity.md#ghid-0) `SessionState` -> [SITE-0](../../packages/web/application-shell.md#site-0) `SessionState`
- [CAT-0](../../packages/learning/course-catalog.md#cat-0) `CatalogUnavailableResult` -> [SITE-0](../../packages/web/application-shell.md#site-0) `CatalogUnavailableResult`
- [VIDS-0](../../packages/media/video-library.md#vids-0) `VideoUnavailableResult` -> [SITE-0](../../packages/web/application-shell.md#site-0) `VideoUnavailableResult`

Where no application session exists, when a visitor requests catalog, course, lesson, or video routes directly, the website shall reveal no course or video metadata, offer GitHub sign-in through the login route, and preserve only a safe internal destination.

### GUARD-2
Composes: [ROLE-2](../../packages/access/role-access.md#role-2), [SYLL-8](../../packages/learning/course-syllabus.md#syll-8), [CAT-7](../../packages/learning/course-catalog.md#cat-7), [VIDS-8](../../packages/media/video-library.md#vids-8), [SITE-6](../../packages/web/application-shell.md#site-6)
Binds:
- [ROLE-0](../../packages/access/role-access.md#role-0) `AuthorizationDecision` for `course.author` -> [SYLL-0](../../packages/learning/course-syllabus.md#syll-0) `AuthorizationDecision` for `course.author`
- [ROLE-0](../../packages/access/role-access.md#role-0) `DataRoleProjection` -> [SYLL-0](../../packages/learning/course-syllabus.md#syll-0) `DataRoleProjection`
- [ROLE-0](../../packages/access/role-access.md#role-0) `AuthorizationDecision` for `video.manage` -> [VIDS-0](../../packages/media/video-library.md#vids-0) `AuthorizationDecision` for `video.manage`
- [ROLE-0](../../packages/access/role-access.md#role-0) `DataRoleProjection` -> [VIDS-0](../../packages/media/video-library.md#vids-0) `DataRoleProjection`
- [ROLE-0](../../packages/access/role-access.md#role-0) `AuthorizationDecision` for `course.publish` -> [CAT-0](../../packages/learning/course-catalog.md#cat-0) `AuthorizationDecision` for `course.publish`
- [ROLE-0](../../packages/access/role-access.md#role-0) `DataRoleProjection` -> [CAT-0](../../packages/learning/course-catalog.md#cat-0) `DataRoleProjection`
- [ROLE-0](../../packages/access/role-access.md#role-0) `RoleView` -> [SITE-0](../../packages/web/application-shell.md#site-0) `RoleView`
- [ROLE-0](../../packages/access/role-access.md#role-0) `AccessDeniedResult` -> [SITE-0](../../packages/web/application-shell.md#site-0) `AccessDeniedResult`

Where an authenticated member has no administrator capability, when the member requests an administrator page, the website shall show `Page unavailable` and reveal no administrator data.
When the member calls draft, upload, or publication actions directly, the website shall report that administrator access is required and leave every draft, upload, object, and release unchanged.

### GUARD-3
Composes: [CAT-6](../../packages/learning/course-catalog.md#cat-6), [VIDS-6](../../packages/media/video-library.md#vids-6), [SITE-6](../../packages/web/application-shell.md#site-6)
Binds:
- [CAT-0](../../packages/learning/course-catalog.md#cat-0) `CatalogUnavailableResult` -> [SITE-0](../../packages/web/application-shell.md#site-0) `CatalogUnavailableResult`
- [VIDS-0](../../packages/media/video-library.md#vids-0) `VideoUnavailableResult` -> [SITE-0](../../packages/web/application-shell.md#site-0) `VideoUnavailableResult`

Where a member guesses the slug, release ID, lesson ID, or video asset ID of draft, unpublished, prior-release, unready, or unattached content, when the member requests it, the website shall return one unavailable outcome and disclose neither existence nor private object location.

### GUARD-4
Composes: [GHID-4](../../packages/access/github-identity.md#ghid-4), [ROLE-2](../../packages/access/role-access.md#role-2), [CAT-8](../../packages/learning/course-catalog.md#cat-8), [VIDS-5](../../packages/media/video-library.md#vids-5), [VIDS-6](../../packages/media/video-library.md#vids-6), [VIDS-9](../../packages/media/video-library.md#vids-9)
Binds:
- [GHID-0](../../packages/access/github-identity.md#ghid-0) `Principal` -> [ROLE-0](../../packages/access/role-access.md#role-0) `Principal`
- [GHID-0](../../packages/access/github-identity.md#ghid-0) `DataAccessIdentity` -> [ROLE-0](../../packages/access/role-access.md#role-0) `DataAccessIdentity`
- [ROLE-0](../../packages/access/role-access.md#role-0) `AuthorizationDecision` for `course.consume` -> [CAT-0](../../packages/learning/course-catalog.md#cat-0) `AuthorizationDecision` for `course.consume`
- [ROLE-0](../../packages/access/role-access.md#role-0) `DataRoleProjection` -> [CAT-0](../../packages/learning/course-catalog.md#cat-0) `DataRoleProjection`
- [CAT-0](../../packages/learning/course-catalog.md#cat-0) `PlaybackEntitlementResult` containing `PlaybackEntitlement` -> host-mapped [VIDS-0](../../packages/media/video-library.md#vids-0) `AssetPlaybackAuthorization`

Where a member signs out, when the former member requests renewal, another playback grant, or the unsigned private object with the unexpired Auth token, the system shall issue no new playback grant and shall authorize no unsigned object request.
When the former member retries an earlier bearer location, the system shall make no promise to revoke bytes or responses already transferred or cached and shall record no new application authorization.

### GUARD-5
Composes: [ROLE-2](../../packages/access/role-access.md#role-2), [SYLL-8](../../packages/learning/course-syllabus.md#syll-8), [CAT-6](../../packages/learning/course-catalog.md#cat-6), [CAT-7](../../packages/learning/course-catalog.md#cat-7), [VIDS-6](../../packages/media/video-library.md#vids-6), [VIDS-8](../../packages/media/video-library.md#vids-8)
Binds:
- [ROLE-0](../../packages/access/role-access.md#role-0) `AuthorizationDecision` for `course.author` -> [SYLL-0](../../packages/learning/course-syllabus.md#syll-0) `AuthorizationDecision` for `course.author`
- [ROLE-0](../../packages/access/role-access.md#role-0) `DataRoleProjection` -> [SYLL-0](../../packages/learning/course-syllabus.md#syll-0) `DataRoleProjection`
- [ROLE-0](../../packages/access/role-access.md#role-0) `AuthorizationDecision` for `course.consume` or `course.publish` -> [CAT-0](../../packages/learning/course-catalog.md#cat-0) `AuthorizationDecision` for `course.consume` or `course.publish`
- [ROLE-0](../../packages/access/role-access.md#role-0) `DataRoleProjection` -> [CAT-0](../../packages/learning/course-catalog.md#cat-0) `DataRoleProjection`
- [ROLE-0](../../packages/access/role-access.md#role-0) `AuthorizationDecision` for `video.manage` -> [VIDS-0](../../packages/media/video-library.md#vids-0) `AuthorizationDecision` for `video.manage`
- [ROLE-0](../../packages/access/role-access.md#role-0) `DataRoleProjection` -> [VIDS-0](../../packages/media/video-library.md#vids-0) `DataRoleProjection`

Where an anonymous, non-GitHub Auth, or ordinary-member caller has the public Supabase URL and publishable key, when that caller directly requests draft tables, non-current releases, video registry mutations, arbitrary Storage upload paths, or private objects, the system shall return no forbidden row or object and shall make no forbidden mutation.

### GUARD-6
Composes: [CAT-5](../../packages/learning/course-catalog.md#cat-5), [CAT-8](../../packages/learning/course-catalog.md#cat-8), [VIDS-5](../../packages/media/video-library.md#vids-5), [VIDS-9](../../packages/media/video-library.md#vids-9)
Binds:
- [CAT-0](../../packages/learning/course-catalog.md#cat-0) `PlaybackEntitlementResult` containing `PlaybackEntitlement` -> host-mapped [VIDS-0](../../packages/media/video-library.md#vids-0) `AssetPlaybackAuthorization`

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

Where direct REST, RPC, and Storage clients use the publishable key as anonymous, non-GitHub Auth, revoked-but-unexpired session, active member, and active administrator identities, when every semantic data surface and arbitrary upload/object path is exercised, the acceptance suite shall assert the complete platform access matrix, active-session checks in every row/view/function policy, exact permitted rows/operations, private bucket and bearer-capability behavior, and no service credential in any client.

### GUARD-24
Verifies: [GUARD-6](#guard-6)

Where a member begins playback and captures the request shape and entitlement timing, when an administrator unpublishes the course and the member replays the prior shape before and after nominal grant expiry, the acceptance suite shall assert removal from new catalog reads, stale lesson denial, rejection of the prior entitlement and every renewal, no new playback grant, and no claim beyond already transferred or cached bytes.
