<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# ACCESS: Install Course Access

## Intent

This composition installs the shared identity, role, route, and capability seams used by the course website's access scenarios.
They are kept together because one access policy owns them and several journeys reuse them.

## Binding

### ACCESS-1
Clients: `role identity` = [ROLE-16](../../packages/access/role-access.md#role-16)
Suppliers: `authenticated evidence` = [GHID-11](../../packages/access/github-identity.md#ghid-11), `anonymous evidence` = [GHID-14](../../packages/access/github-identity.md#ghid-14)
Scope: every course-site role assignment and capability request

The installation shall supply ROLE with GHID's application account and exact active-session evidence for an authenticated request and its anonymous result for every rejected session.

### ACCESS-2
Clients: `post-authentication destination` = [GHID-17](../../packages/access/github-identity.md#ghid-17)
Suppliers: `safe route destination` = [SITE-11](../../packages/web/application-shell.md#site-11)
Scope: every course-site GitHub authentication attempt

The installation shall supply GHID only destinations that SITE has normalized and accepted under the installed route map, using `/courses` as SITE's default.

### ACCESS-3
Clients: `protected request context` = [SITE-10](../../packages/web/application-shell.md#site-10)
Suppliers: `session evidence` = [GHID-11](../../packages/access/github-identity.md#ghid-11), `anonymous result` = [GHID-14](../../packages/access/github-identity.md#ghid-14), `access decision` = [ROLE-12](../../packages/access/role-access.md#role-12), `capability policy` = [ROLE-14](../../packages/access/role-access.md#role-14)
Scope: every administrator route, protected Route Handler, protected video action, and Server Action governed by SITE-10

The installation shall make SITE gate each protected response or action with GHID's current session result and ROLE's decision for the same account, request, capability, and resource before returning protected data or a mutation result.

### ACCESS-4
Clients: `course authoring` = [SYLL-14](../../packages/learning/course-syllabus.md#syll-14), `lesson-content permission` = [CAT-24](../../packages/learning/course-catalog.md#cat-24), `course-publication permission` = [CAT-25](../../packages/learning/course-catalog.md#cat-25), `video management` = [VIDS-19](../../packages/media/video-library.md#vids-19)
Suppliers: `access decision` = [ROLE-12](../../packages/access/role-access.md#role-12), `capability policy` = [ROLE-14](../../packages/access/role-access.md#role-14)
Scope: every protected course-site domain request; public catalog reads are outside this Binding

The installation shall project ROLE decisions into the client requirements without changing their account, request, resource, freshness, or denial meaning:

| ROLE capability | Client requirement |
| --- | --- |
| `course.author` | SYLL course-authoring permission |
| `video.watch` | CAT lesson-content permission |
| `course.publish` | CAT course-publication permission |
| `video.manage` | VIDS video-management authorization |

### ACCESS-5
Clients: `application capability readiness` = [LIVE-16](../../packages/operations/production-runtime.md#live-16)
Suppliers: `role readiness` = [ROLE-15](../../packages/access/role-access.md#role-15)
Scope: the initial-administrator capability in each deployed environment

The installation shall supply LIVE with ROLE-15's unchanged observation identity, time, `initial-administrator` capability, role-policy revision, fail-closed readiness conclusion, and redacted evidence during the current deployment evaluation.

## Verification

### ACCESS-20
Verifies: [ACCESS-1](#access-1), [ACCESS-2](#access-2), [ACCESS-3](#access-3)

Where session, route, and role fixtures produce valid, expired, revoked, mismatched, unsafe-destination, and denied cases, when the installed access seams are inspected and exercised, the conformance suite shall assert exact account/request association, safe-destination projection, denial on every mismatch, and no alternate provider path.

### ACCESS-21
Verifies: [ACCESS-4](#access-4)

Where anonymous, member, and administrator requests exercise every ROLE capability against each client package and read the public catalog, when the installed policy is exercised, the conformance suite shall assert the four exact protected mappings, resource and request preservation, no browser-supplied decision, denial of every unlisted capability, and no ROLE decision or access Binding on the public catalog read.

### ACCESS-22
Verifies: [ACCESS-5](#access-5)

Where bootstrap state is ready, missing, malformed, changed, and duplicated in turn, when installed readiness is inspected, the conformance suite shall assert the same fail-closed conclusion and deployment revision at ROLE and LIVE.
