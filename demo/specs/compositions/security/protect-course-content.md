<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# GUARD: Protect Course Content

## Intent

This composition installs the course-specific playback rule and verifies that public course metadata remains open while video content and administrator actions remain protected on every path.

## Binding

### GUARD-1

Where every new course-site playback grant uses VIDS's [playback-authorization input](../../packages/media/video-library.md#vids-10) and CAT lesson attachments use the [installed VIDS reference handoff](../authoring/publish-course.md#publish-1), the installation shall supply an allow decision only if GHID reports the [same account and application session actively authenticated for the exact request](../../packages/access/github-identity.md#ghid-7), ROLE supplies a fresh [`video.watch` allow decision for that same account, session, request, and video](../../packages/access/role-access.md#role-2), and CAT returns a [fresh server-only eligible result](../../packages/learning/course-catalog.md#cat-13) for that same request whose exact stored reference is VIDS's [reusable reference](../../packages/media/video-library.md#vids-5) for that same video; every other case shall receive a deny decision.
Unpublication, course deletion, or video deletion therefore denies every later grant request. A bearer already issued under [VIDS-7](../../packages/media/video-library.md#vids-7) before unpublication or course deletion may remain usable until its bounded expiry, and neither later policy nor sign-out retracts delivered or cached bytes; deleting the video itself removes its content.

## Scenario

### GUARD-2

Where no active GitHub application session exists, when a visitor opens the [public catalog](../../packages/learning/course-catalog.md#cat-1), [course, or lesson](../../packages/learning/course-catalog.md#cat-2), the website shall show its public metadata without starting authentication or requesting private video content.
When the visitor explicitly requests playback, the website shall offer [GitHub entry](../../packages/access/github-identity.md#ghid-1) and issue no bearer; when an authenticated member requests the exact attached video through the [installed playback policy](#guard-1), the website shall show only the [asset-scoped private player](../../packages/media/video-library.md#vids-7) without exposing its reference or object location.

### GUARD-3

Where an authenticated member has no course- or video-management capability, when that member requests an administrator route or directly attempts course or video management, the website shall apply ROLE's [redacted administrator denial](../../packages/access/role-access.md#role-3), CAT shall [disclose no management data and change no course](../../packages/learning/course-catalog.md#cat-12), and VIDS shall [reveal or change no asset](../../packages/media/video-library.md#vids-9).

### GUARD-4

While a member has an issued playback bearer, when the member [signs out](../../packages/access/github-identity.md#ghid-4), the website shall deny every later grant request through the [installed playback policy](#guard-1) and continue exposing only the course's [public metadata](../../packages/learning/course-catalog.md#cat-2).
The issued [transferable bearer](../../packages/media/video-library.md#vids-7) may remain usable until expiry without a session recheck, but an expired, tampered, or unsigned request shall receive the same [generic unavailable state](../../packages/media/video-library.md#vids-8).

### GUARD-5

Where anonymous, invalid-session, member, and administrator callers possess only browser-visible public service configuration, when they bypass the pages and call public database or object boundaries directly, the system shall treat every invalid session as [anonymous](../../packages/access/github-identity.md#ghid-8), return only CAT's [published public-field projection](../../packages/learning/course-catalog.md#cat-18), enforce ROLE's [exact capability decisions](../../packages/access/role-access.md#role-2) on every management request, and allow private object reads only through VIDS's [bounded exact-asset bearer](../../packages/media/video-library.md#vids-11).
No caller shall obtain unpublished course data, an opaque media reference, arbitrary private content, or a service credential through the public client.

### GUARD-6

While a member is playing a video attached to a published lesson, when the administrator [unpublishes](../../packages/learning/course-catalog.md#cat-10) or [deletes the course](../../packages/learning/course-catalog.md#cat-11), the website shall make every later public route [unavailable](../../packages/learning/course-catalog.md#cat-4) and deny every later grant request through the [installed playback policy](#guard-1), while leaving the independent [video asset](../../packages/media/video-library.md#vids-4) unchanged.
The previously issued [bearer may remain usable until expiry](../../packages/media/video-library.md#vids-7), and bytes or responses already delivered or cached are not revoked.

## Verification

### GUARD-7

Where public, authenticated, unpublished, deleted-course, and deleted-video fixtures are available and bearer time is controlled, when browsers complete the [public-metadata/private-playback scenario](#guard-2) and [unpublish-or-delete-during-playback scenario](#guard-6), the acceptance suite shall assert exact allow and deny outcomes from the [installed playback policy](#guard-1), no grant before authentication or after course or video ineligibility, unavailable later routes, unchanged video content and bounded previously issued-bearer residue after course deletion, and absent origin content after video deletion.

### GUARD-8

Where member and administrator browsers plus direct public clients carry forged role, resource, media-reference, and object-path values, when they exercise the [administrator-denial scenario](#guard-3) and [direct-boundary scenario](#guard-5), the acceptance suite shall assert the exact public projection, no unpublished or management data for unauthorized callers, no denied mutation, no arbitrary private object access, and no service credential.

### GUARD-9

Where a member begins playback and the acceptance clock spans sign-out and bearer expiry, when the member completes the [sign-out scenario](#guard-4), the acceptance suite shall assert immediate denial of every new grant, continued public course access while published, possession-based redemption only until expiry, one generic failure afterward, and no retraction promise for delivered or cached bytes.
