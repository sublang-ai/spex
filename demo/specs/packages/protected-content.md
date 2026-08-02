<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# protected-content: Protected Content

## Intent

This package covers the site's whole gating surface in one place: which audience reaches which content, and the rule that the answer holds on every path — page, data request, and stored media alike.
Each package guards its own door; this package pins the map they add up to.

## External Behavior

### protected-content-1

The site shall present each surface to each audience per the following map, identically on direct URL entry, in-app navigation, and data requests:

| Surface | Signed out | Member | Admin |
| --- | --- | --- | --- |
| Course list; published course and lesson pages [[course-catalog-1](catalog/course-catalog.md#course-catalog-1)] [[course-catalog-2](catalog/course-catalog.md#course-catalog-2)] [[course-catalog-3](catalog/course-catalog.md#course-catalog-3)] | shown | shown | shown |
| Playback on published lessons with a resolvable attachment [[video-library-6](catalog/video-library.md#video-library-6)] [[video-library-7](catalog/video-library.md#video-library-7)] | sign-in-required state | plays | plays |
| Unpublished course and lesson pages [[course-catalog-4](catalog/course-catalog.md#course-catalog-4)] [[course-catalog-5](catalog/course-catalog.md#course-catalog-5)] | not-found | not-found | shown |
| Course manager and video library [[access-control-4](identity/access-control.md#access-control-4)] [[course-catalog-6](catalog/course-catalog.md#course-catalog-6)] [[video-library-1](catalog/video-library.md#video-library-1)] | sent to sign-in | not-authorized | shown |
| New playback grants for assets referenced only by unpublished courses [[protected-content-3](#protected-content-3)] | denied | denied | granted — plays on the unpublished lesson page |
| New playback grants for assets no lesson references [[protected-content-3](#protected-content-3)] | denied | denied | denied |
| Stored media content without a valid grant [[video-library-12](catalog/video-library.md#video-library-12)] | denied | denied | denied |

### protected-content-2

Where a surface in the map is gated, the gate shall hold with no reliance on hidden links — each of the following layers holding independently:

- server-side session checks [[github-login-10](identity/github-login.md#github-login-10)] and role checks;
- data-layer draft exclusion;
- role-clean served markup;
- grant-only media access.

## Internal Behavior

### protected-content-3

Where playback grants issue only for requests the embedding host authorizes [[video-library-11](catalog/video-library.md#video-library-11)], the site — the video library's embedding host — shall answer authorization by content eligibility:

- a requester with an admin session [[access-control-2](identity/access-control.md#access-control-2)] is eligible exactly for assets a lesson of an existing course references;
- every other requester is eligible exactly for assets a lesson of a currently published course references [[course-catalog-2](catalog/course-catalog.md#course-catalog-2)] [[course-catalog-4](catalog/course-catalog.md#course-catalog-4)] — so new non-admin grants for an asset stop as soon as no currently published course references it, unpublishing or deleting the last referencing course stopping further grants at once;
- eligibility feeds the library's own gates and replaces none of them: session verification [[github-login-10](identity/github-login.md#github-login-10)] and grant checks [[video-library-12](catalog/video-library.md#video-library-12)] [[video-library-13](catalog/video-library.md#video-library-13)] [[video-library-14](catalog/video-library.md#video-library-14)] stay the library's.

## Verification

### protected-content-4

Where a seeded deployment holds published and unpublished fixture courses, when the acceptance suite sweeps the map's page and data routes as a signed-out visitor, as a member, and as the admin — by direct URL and by in-app navigation — the suite shall assert every response matches the map's cell for that audience [[protected-content-1](#protected-content-1)], and no non-admin response body carries unpublished content or admin markup [[protected-content-2](#protected-content-2)].

### protected-content-5

Where a fixture asset is attached to a published lesson, the acceptance suite shall assert:

- direct stored-content requests without a grant, with an expired grant, and with a tampered grant are denied for all three audiences [[protected-content-1](#protected-content-1)];
- a member's playback request plays [[protected-content-1](#protected-content-1)] [[protected-content-3](#protected-content-3)];
- after the suite unpublishes the asset's only referencing course, a member's new playback request is denied with no grant issued while the admin's player on that unpublished lesson still plays [[protected-content-1](#protected-content-1)] [[protected-content-3](#protected-content-3)];
- after the only course referencing a fixture asset is deleted, member and admin playback requests for that asset are denied with no grant issued, while an asset also referenced by a second published fixture course keeps serving member playback after the first course unpublishes [[protected-content-1](#protected-content-1)] [[protected-content-3](#protected-content-3)].
