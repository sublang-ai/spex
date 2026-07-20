<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# CAT: Course Catalog

## Intent

This package publishes immutable syllabus snapshots and gives authenticated members one coherent, learner-visible catalog.
It does not own draft editing or media delivery; those bindings are defined by [DR-002](../../decisions/002-course-media-boundary.md).


## External Behavior

### CAT-1

Where an authenticated member has `course.consume` capability, when the member opens the catalog, the catalog shall provide a `CatalogListView` containing every currently published course and no draft or unpublished course, ordered by `en-US` case-insensitive title and then slug as the deterministic tie-breaker, with title and summary linking to its stable slug.

### CAT-2

Where an authenticated member selects a published course slug, the course view shall provide a `CourseDetailView` showing the release's title, summary, and complete section and lesson hierarchy in snapshot order, with each lesson linked to its attached content.

### CAT-3

Where an administrator has `course.publish` capability, the selected immutable snapshot is complete, no greater snapshot revision is current for its draft, and either the course has no release and its slug is unreserved or the slug exactly equals that course's locked slug, when the administrator confirms publication, the publication surface shall make the complete snapshot current in one operation and shall return a `PublicationReceipt` naming the accepted result, draft, snapshot identity and revision, locked slug, release number, and publication time.

### CAT-4

Where a course already has a current release, when an administrator publishes a later saved version, the catalog shall switch new list, detail, and entitlement selections to the later release together and shall produce only all-earlier or all-later fields and lessons for each read.

### CAT-5

Where a course has a current release, when an administrator confirms unpublication, the catalog shall remove the course from subsequent list, detail, and new content-entitlement results while retaining its release history and locked slug reservation for a later republish.

### CAT-6

When a visitor, denied principal, unknown slug, unpublished course, non-current release, or unattached content reference is requested, the catalog shall disclose no course or content metadata and shall return `CatalogUnavailableResult`.

### CAT-7

Where a signed-in account is denied `course.publish` capability, when that account requests publication or unpublication directly, the publication surface shall create no release, preserve the current release selection, and report that administrator access is required.

### CAT-8

Where an authenticated member has `course.consume` capability, when the member opens a lesson in a current published release, the course view shall provide a `LessonView` showing that lesson's snapshot title, description, and position and shall make only that lesson's exact attached content reference available to its host content slot.
When the lesson is no longer current, published, or attached, the course view shall instead provide `CatalogUnavailableResult` and disclose no stale release or content metadata.

### CAT-9

Where no complete publication snapshot is supplied, a supplied slug is reserved by another course whether published or unpublished, a supplied snapshot changes the slug locked by this course's first release, a lower snapshot revision arrives after a higher accepted revision, or the same draft revision arrives with a different snapshot identity or value, when an administrator confirms publication, the publication surface shall create no release, preserve every current release and slug reservation, and return the corresponding redacted `PublicationConflict` without disclosing another draft.

## Internal Behavior

### CAT-10

When publication succeeds, the release registry shall persist the supplied snapshot as an immutable release identified by draft ID, snapshot ID, snapshot revision, and monotonically increasing release number.
When the exact same snapshot ID and value for a draft revision is published again, the release registry shall return the existing `PublicationReceipt` and shall not create another release or result identity.

### CAT-11

When publication is attempted, the release registry shall reserve an accepted first-release slug atomically and shall reject a slug reserved by a different course, including an unpublished course, leaving all current releases and reservations unchanged for the rejected request.
Where the same course draft already has a release, it shall also reject a snapshot whose slug differs from the first release's slug.

### CAT-12

When a current release changes, the release registry shall commit the new current-release designation atomically with the new immutable release, so list, detail, and entitlement reads resolve through one current release identity.

### CAT-13

When a playback entitlement is requested, the entitlement boundary shall recompute `PlaybackEntitlementResult` from the fresh `AuthorizationDecision`, matching `DataRoleProjection`, and current release state and shall produce a `PlaybackEntitlement` only when `course.consume` is allowed and the exact content reference occurs in the requested lesson of the exact current published release.
The entitlement boundary shall pass the opaque single-use value directly to the configured content boundary for that request, bound to the data-role projection, lesson, release, content kind, asset ID, and asset revision; it shall neither serialize that value to the browser nor accept one supplied by a browser or an earlier request, and shall otherwise produce `CatalogUnavailableResult`.

### CAT-14

When catalog views are produced, the read boundary shall derive their complete visible values only from current immutable releases and shall remain independent of later mutable draft state.

### CAT-15

When catalog data is read or publication state is changed, the read boundary or publication boundary shall require the corresponding fresh server-only `AuthorizationDecision` and matching trusted `DataRoleProjection` for that exact request.
The publication boundary shall accept a `SyllabusSnapshot` only from the configured trusted server-only authoring binding and shall reject a browser-supplied, altered, untrusted, or same-identity/mismatched-value snapshot without changing a release or slug reservation.
The applicable boundary shall expose only current published releases to members, reserve publication changes to administrators, reject a projection or decision supplied by a browser, and use no privileged service identity for ordinary catalog reads or publication.

### CAT-16

When publication requests for one draft arrive concurrently or out of revision order, the publication boundary shall serialize their release-state effects so the greatest successfully accepted snapshot revision is current, a lower revision can never replace it, and each rejected lower or conflicting same-revision request receives its own stable `PublicationConflict` without changing release history or slug ownership.

## Verification

### CAT-20
Verifies: [CAT-1](#cat-1), [CAT-2](#cat-2), [CAT-6](#cat-6), [CAT-8](#cat-8), [CAT-14](#cat-14)

Where fixtures contain two current releases, one draft-only course, one unpublished course, and an unknown slug, when allowed, denied, and anonymous reads are exercised, the contract suite shall assert title ordering, exact snapshot hierarchy, exact `CatalogUnavailableResult` values, and no draft-derived field.

### CAT-21
Verifies: [CAT-3](#cat-3), [CAT-4](#cat-4), [CAT-9](#cat-9), [CAT-10](#cat-10), [CAT-11](#cat-11), [CAT-12](#cat-12), [CAT-16](#cat-16)

Where fixtures contain no snapshot, two increasing snapshots for one draft, an exact repeated snapshot, lower and conflicting same-revision snapshots arriving before and after the greater revision, an unreserved slug, two first-release drafts racing for that slug, a slug reserved by another published or unpublished course, and a same-course changed slug, when publications and concurrent reads straddle each accepted or rejected request, the contract suite shall assert first-slug acceptance and locking for exactly one course, idempotent receipt and release identity, monotonically increasing release numbers, the greatest accepted revision current, atomic all-old or all-new views, the exact redacted conflict reason, and no draft, release, current-selection, or slug-reservation change for every missing, stale, payload-mismatched, or slug-conflicting request.

### CAT-22
Verifies: [CAT-5](#cat-5), [CAT-7](#cat-7), [CAT-13](#cat-13)

Where a current release contains two content references, when the contract suite requests entitlements for an attached reference, an unattached reference, a prior release, a mismatched or inactive `DataRoleProjection`, a denied decision, after current-release replacement, and after unpublication and also attempts publication and unpublication as a denied account, the suite shall provide `PlaybackEntitlement` only for a fresh exact current attached request, provide `CatalogUnavailableResult` for every unavailable request, reject replay of every prior entitlement, preserve release history after allowed unpublication, and create no release or selection change for either denied mutation.

### CAT-23
Verifies: [CAT-15](#cat-15), [CAT-16](#cat-16)

Where data-access fixtures represent absent, untrusted, inactive, mismatched, member, administrator, and privileged identities and publication fixtures include trusted, browser-supplied, altered, and same-identity/mismatched-value snapshots in concurrent orderings, when each directly exercises every catalog read and publication shape, the contract suite shall match the host data-access matrix, reject browser-supplied projections, authorization decisions, entitlements, and every untrusted or inconsistent snapshot, preserve the greatest accepted revision, and find no path that broadens current-release reads or publication rights.

## Binding

### CAT-0

| Field | Contract |
| --- | --- |
| Human users | visitors or denied accounts requesting catalog content; authenticated members browsing courses; administrators publishing or unpublishing releases |
| Owns | catalog and course view, publication surface and boundary, `CourseRelease`, release registry and current selection, `CatalogListView`, `CourseDetailView`, `LessonView`, `PublicationResult`, `CatalogUnavailableResult`, entitlement boundary, `PlaybackEntitlementResult`, read boundary |
| Receives | server-only `AuthorizationDecision` for `course.consume` or `course.publish`; matching trusted server-only `DataRoleProjection`; trusted server-only complete immutable `SyllabusSnapshot` from the configured authoring binding; `CatalogRequest` naming the requested current course, lesson, and optional content identity |
| Provides | `CatalogListView`; `CourseDetailView`; `LessonView`; trusted `PublicationResult` containing `PublicationReceipt` or `PublicationConflict`; `PlaybackEntitlementResult` containing an opaque server-only request-scoped `PlaybackEntitlement` or `CatalogUnavailableResult`; `CatalogUnavailableResult` |
| Excludes | mutable drafts, content upload/storage/playback, identity, roles, global navigation |
| Reuse | public-package candidate; accepts any snapshot with the declared shape and resolves content through a host binding |

The catalog contracts are:

| Contract | Meaning |
| --- | --- |
| `CatalogListView` | ordered current-course entries containing only slug, title, and summary |
| `CourseDetailView` | one current release's slug, title, summary, release number, and complete ordered section/lesson hierarchy |
| `LessonView` | one current release's course identity and one lesson's ID, title, description, positions, and exact attached `ContentRef` |
| `CatalogRequest` | list, current-course, current-lesson, or entitlement operation plus only its requested slug, lesson ID, and optional `ContentRef` |
| `SyllabusSnapshot` | `{ schemaVersion, snapshotId, draftId, revision, title, slug, summary, sections[] }`, where ordered sections contain stable ID, title, position, and ordered lessons, and each lesson contains stable ID, title, optional description, position, and one complete `ContentRef` |
| `PublicationReceipt` | `{ resultId, draftId, snapshotId, snapshotRevision, lockedSlug, releaseNumber, publishedAt }` for the exact accepted snapshot |
| `PublicationConflict` | `{ resultId, reason, candidate? }`, where reason is `missing-snapshot`, `slug-reserved`, `locked-slug-mismatch`, `stale-revision`, or `revision-payload-mismatch`; candidate, when present, contains only its draft ID, snapshot ID, revision, and slug |
| `PublicationResult` | exactly one `PublicationReceipt` or `PublicationConflict`, produced only by the publication boundary and safe to pass through a trusted server binding |
| `PlaybackEntitlement` | opaque single-use allow value bound to one data-role projection, application request, current release, lesson, and exact `ContentRef` |
| `PlaybackEntitlementResult` | one `PlaybackEntitlement` or `CatalogUnavailableResult` |
| `CatalogUnavailableResult` | `{ kind: unavailable }` with no course, release, lesson, content, authorization, or denial-cause metadata |
