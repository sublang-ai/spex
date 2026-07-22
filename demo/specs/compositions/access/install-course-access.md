<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# ACCESS: Install Course Access

## Intent

This composition installs the course site's shared identity, safe-return, protected-request, and management-capability seams.
Public catalog reads and video-playback policy remain outside these management bindings.

## Binding

### ACCESS-1

Where every installed ROLE identity intake uses its [trusted identity-evidence requirement](../../packages/access/role-access.md#role-5), the installation shall supply GHID's [authenticated account and active-session evidence](../../packages/access/github-identity.md#ghid-7) when validation succeeds and its [anonymous result with no usable identity](../../packages/access/github-identity.md#ghid-8) for every other result, preserving the exact account, session, and request.

### ACCESS-2

Where every installed GHID destination intake uses its [safe post-authentication destination requirement](../../packages/access/github-identity.md#ghid-13), the installation shall supply only same-site paths accepted by SITE's [route-map destination boundary](../../packages/web/application-shell.md#site-7), including `/courses` as the default when no requested destination is accepted.

### ACCESS-3

Where every administrator route, protected Route Handler, protected video action, and Server Action uses SITE's [protected-request boundary](../../packages/web/application-shell.md#site-8), the installation shall supply GHID's current [authenticated](../../packages/access/github-identity.md#ghid-7) or [anonymous](../../packages/access/github-identity.md#ghid-8) result and, for an authenticated caller, ROLE's [exact server-only capability decision](../../packages/access/role-access.md#role-2) for the same account, session, request, capability, and resource before any protected data or mutation result is produced.
An anonymous result shall supply no allowed decision.

### ACCESS-4

Where CAT's [course-management authorization intake](../../packages/learning/course-catalog.md#cat-14) and VIDS's [video-management authorization intake](../../packages/media/video-library.md#vids-9) are installed, the installation shall project ROLE's [exact capability decisions](../../packages/access/role-access.md#role-2) without changing their account, session, request, action, resource, freshness, or denial meaning:

| ROLE capability | Client requirement |
| --- | --- |
| `course.manage` | CAT course-management authorization |
| `video.manage` | VIDS video-management authorization |

The installation shall request no ROLE decision for public catalog reads through this projection and shall not use it to supply VIDS playback authorization.

## Verification

### ACCESS-5

Where identity, route, and capability fixtures produce authenticated, anonymous, expired, revoked, mismatched, unsafe-destination, and denied cases, when the installed seams are inspected and exercised, the conformance suite shall assert exact GHID identity or anonymous projection into ROLE with account, session, and request preserved ([ACCESS-1](#access-1)); acceptance only of SITE-approved same-site destinations and `/courses` fallback ([ACCESS-2](#access-2)); and fresh authentication plus the exact ROLE decision at every protected SITE boundary, with no allowed decision for an anonymous or mismatched caller ([ACCESS-3](#access-3)).

### ACCESS-6

Where anonymous, member, and administrator callers exercise course and video management plus public catalog and playback requests, when the capability projection is inspected, the conformance suite shall assert only the exact `course.manage` to CAT and `video.manage` to VIDS mappings, with every decision field and denial preserved, no browser-supplied decision accepted, no ROLE decision requested for a public catalog read, and no VIDS playback authorization supplied through this projection ([ACCESS-4](#access-4)).
