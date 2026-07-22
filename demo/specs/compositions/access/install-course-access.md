<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# ACCESS: Install Course Access

## Intent

This composition installs the shared identity, role, route, and capability seams used by the course website's access scenarios.
They are kept together because one access policy owns them and several journeys reuse them.

## Binding

### ACCESS-1

Where every course-site role assignment and capability request uses ROLE's [identity intake](../../packages/access/role-access.md#role-11), the installation shall supply GHID's [application account and exact active-session evidence](../../packages/access/github-identity.md#ghid-7) for an authenticated request and its [anonymous result](../../packages/access/github-identity.md#ghid-8) for every rejected session.

### ACCESS-2

Where every course-site GitHub authentication attempt uses GHID's [post-authentication destination intake](../../packages/access/github-identity.md#ghid-13), the installation shall supply only destinations that SITE's [destination boundary](../../packages/web/application-shell.md#site-7) has normalized and accepted under the installed route map, using `/courses` as SITE's default.

### ACCESS-3

Where every administrator route, protected Route Handler, protected video action, and Server Action uses SITE's [protected request boundary](../../packages/web/application-shell.md#site-8), the installation shall gate each protected response or action with GHID's current [authenticated](../../packages/access/github-identity.md#ghid-7) or [anonymous](../../packages/access/github-identity.md#ghid-8) session result and ROLE's [access decision](../../packages/access/role-access.md#role-6) under its [capability policy](../../packages/access/role-access.md#role-7) for the same account, request, capability, and resource before returning protected data or a mutation result.

### ACCESS-4

Where every protected course-site domain request uses SYLL's [course-authoring intake](../../packages/learning/course-syllabus.md#syll-13), CAT's [lesson-content](../../packages/learning/course-catalog.md#cat-16) or [course-publication](../../packages/learning/course-catalog.md#cat-17) permission intake, or VIDS's [video-management intake](../../packages/media/video-library.md#vids-19), with public catalog reads outside this Binding, the installation shall project ROLE's [access decisions](../../packages/access/role-access.md#role-6) under its [capability policy](../../packages/access/role-access.md#role-7) into those client requirements without changing their account, request, resource, freshness, or denial meaning:

| ROLE capability | Client requirement |
| --- | --- |
| `course.author` | SYLL course-authoring permission |
| `video.watch` | CAT lesson-content permission |
| `course.publish` | CAT course-publication permission |
| `video.manage` | VIDS video-management authorization |

### ACCESS-5

Where the `initial-administrator` capability in each deployed environment uses LIVE's [application-capability readiness intake](../../packages/operations/production-runtime.md#live-14), the installation shall supply ROLE's [readiness report](../../packages/access/role-access.md#role-8) with its unchanged observation identity, time, capability, role-policy revision, fail-closed conclusion, and redacted evidence during the current deployment evaluation.

## Verification

### ACCESS-6

Where session, route, and role fixtures produce valid, expired, revoked, mismatched, unsafe-destination, and denied cases, when the [role-identity](#access-1), [safe-destination](#access-2), and [protected-request](#access-3) seams are inspected and exercised, the conformance suite shall assert exact account/request association, safe-destination projection, denial on every mismatch, and no alternate provider path.

### ACCESS-7

Where anonymous, member, and administrator requests exercise every ROLE capability against each client package and read the public catalog, when the [installed capability projection](#access-4) is exercised, the conformance suite shall assert the four exact protected mappings, resource and request preservation, no browser-supplied decision, denial of every unlisted capability, and no ROLE decision or access Binding on the public catalog read.

### ACCESS-8

Where bootstrap state is ready, missing, malformed, changed, and duplicated in turn, when the [installed readiness seam](#access-5) is inspected, the conformance suite shall assert the same fail-closed conclusion and deployment revision at ROLE and LIVE.
