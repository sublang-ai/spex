<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# GUARD: Protected Content

## Intent

This composition covers the site's whole gating surface in one
place: which audience reaches which content, and the rule that
the answer holds on every path — page, data request, and stored
media alike.
Each package guards its own door; this composition pins the map
they add up to.

## Binding

### GUARD-5

Where playback grants issue only for requests the embedding
host authorizes
([VID-15](../packages/catalog/video-library.md#vid-15)), the
deployment's answer shall be content eligibility: a requester
with an admin session is eligible exactly for assets a lesson
of an existing course references, and every other requester
exactly for assets a lesson of a currently published course
references
([CAT-2](../packages/catalog/course-catalog.md#cat-2),
[CAT-3](../packages/catalog/course-catalog.md#cat-3)) — so new
non-admin grants for an asset stop as soon as no currently
published course references it, unpublishing or deleting the
last referencing course closes access at once, and a grant
already issued lasts only to its expiry.
Eligibility feeds the library's own gates and replaces none of
them: session verification and grant checks stay the library's.

## Scenario

### GUARD-1

The site shall present each surface to each audience per the
following map, identically on direct URL entry, in-app
navigation, and data requests:

| Surface | Signed out | Member | Admin |
| --- | --- | --- | --- |
| Course list; published course and lesson pages ([CAT-1](../packages/catalog/course-catalog.md#cat-1), [CAT-2](../packages/catalog/course-catalog.md#cat-2)) | shown | shown | shown |
| Playback on lessons with a resolvable attachment ([VID-5](../packages/catalog/video-library.md#vid-5), [VID-6](../packages/catalog/video-library.md#vid-6)) | sign-in-required state | plays | plays |
| Unpublished course and lesson pages ([CAT-3](../packages/catalog/course-catalog.md#cat-3)) | not-found | not-found | shown |
| Course manager and video library ([ROLE-2](../packages/identity/access-control.md#role-2), [CAT-4](../packages/catalog/course-catalog.md#cat-4), [VID-1](../packages/catalog/video-library.md#vid-1)) | sent to sign-in | not-authorized | shown |
| Assets referenced only by unpublished courses ([GUARD-5](#guard-5)) | denied | denied | plays on the unpublished lesson page |
| Assets no lesson references ([GUARD-5](#guard-5)) | denied | denied | denied |
| Stored media content without a valid grant ([VID-7](../packages/catalog/video-library.md#vid-7)) | denied | denied | denied |

### GUARD-2

Where a surface in the map is gated, the gate shall hold with no
reliance on hidden links: server-side session and role checks
([AUTH-9](../packages/identity/github-login.md#auth-9),
[ROLE-4](../packages/identity/access-control.md#role-4)),
data-layer draft exclusion
([CAT-12](../packages/catalog/course-catalog.md#cat-12)),
role-clean served markup
([SHELL-6](../packages/site/web-shell.md#shell-6)), and
grant-only media access
([VID-8](../packages/catalog/video-library.md#vid-8)) shall each
hold independently, so removing every client-side hiding changes
nothing about what each audience can obtain.

## Tests

### GUARD-3

Where a seeded deployment holds published and unpublished
fixture courses, when the acceptance suite sweeps the map's page
and data routes as a signed-out visitor, as a member, and as the
admin — by direct URL and by in-app navigation — the suite shall
assert every response matches the map's cell for that audience
([GUARD-1](#guard-1), [GUARD-2](#guard-2),
[ROLE-2](../packages/identity/access-control.md#role-2)),
including the unpublished pages shown to the admin marked as
unpublished
([CAT-3](../packages/catalog/course-catalog.md#cat-3)), and
that no non-admin response body carries unpublished content or
admin markup
([CAT-12](../packages/catalog/course-catalog.md#cat-12),
[SHELL-6](../packages/site/web-shell.md#shell-6)).

### GUARD-4

Where a fixture asset is attached to a published lesson, the
acceptance suite shall assert: direct stored-content requests
without a grant, with an expired grant, and with a tampered
grant are denied for all three audiences ([GUARD-1](#guard-1),
[VID-7](../packages/catalog/video-library.md#vid-7)); a
member's playback request obtains a grant and plays; the grant
is scoped to that one asset, stops working after its expiry,
and a fresh playback request then obtains a new grant while the
course stays published ([GUARD-2](#guard-2),
[VID-8](../packages/catalog/video-library.md#vid-8)); a
member's playback request for an asset referenced only by an
unpublished fixture course is denied with no grant issued,
while a grant the member obtained before the unpublish still
plays until its expiry and the admin's player on that
unpublished lesson still plays ([GUARD-5](#guard-5)); after the
only course referencing a fixture asset is deleted, member and
admin playback requests for that asset are likewise denied with
no grant issued, while an asset also referenced by a second
published fixture course keeps serving member playback after
the first course unpublishes ([GUARD-5](#guard-5)); and every
session cookie observed during the sweep is scoped to the
site's origin and marked Secure
([AUTH-8](../packages/identity/github-login.md#auth-8)).
