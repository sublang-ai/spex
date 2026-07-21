<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# CAT: Course Catalog

## Intent

This package publishes immutable syllabus snapshots and gives authenticated members one coherent, learner-visible catalog.
It owns published course releases and their selection while leaving mutable draft authoring and attached-content delivery outside the package.
It can be reused unchanged with any authorizer, snapshot source, and content recipient satisfying the meanings defined below.
Course-consumption permission means fresh trusted authorization associated with the active account, exact request, and requested catalog, current published course, current lesson, or exact attached content to list or read it.
Course-publication permission means fresh trusted authorization associated with the active account, exact request, and named course to publish a complete version or unpublish its current release.
Each installation supplies those permissions through a trusted authorizer.

## User Behavior

### CAT-1

Where an authenticated member is allowed to browse published courses, when the member opens the catalog, the catalog shall list every currently published course and no draft or unpublished course, ordered by `en-US` case-insensitive title and then slug as the deterministic tie-breaker, with each title and summary linking to its stable slug.

### CAT-2

Where an authenticated member is allowed to view a published course, when the member selects its slug, the course view shall show the release's title, summary, and complete section and lesson hierarchy in published order, with each lesson linked to its attached content.

### CAT-3

Where an account is allowed to publish courses, the selected immutable course version is complete, no greater version revision has ever been accepted for its draft, and either the course has no release and its slug is unreserved or the slug exactly equals that course's locked slug, when the account confirms publication, the publication surface shall make the complete version current in one operation and shall report success with the accepted draft revision, locked slug, release number, and publication time.

### CAT-4

Where a course already has a current release, when an account allowed to publish courses publishes a later saved version, the catalog shall switch new catalog, course, lesson, and playback selections to the later release together and shall show only all-earlier or all-later fields and lessons for each read.

### CAT-5

Where a course has a current release, when an account allowed to publish courses confirms unpublication, the catalog shall remove the course from subsequent catalog, course, lesson, and new playback results while retaining its release history and locked slug reservation for a later republish.

### CAT-6

When a visitor, denied account, unknown slug, unpublished course, non-current release, or unattached content is requested, the catalog shall show the same plain unavailable outcome and shall disclose no course, release, lesson, content, authorization, or denial-cause detail.

### CAT-7

Where a signed-in account is not allowed to publish courses, when that account requests publication or unpublication directly, the publication surface shall create no release, preserve the current release selection, and report that course-publishing access is required.

### CAT-8

Where an authenticated member is allowed to view published lessons, when the member opens a lesson in a current published release, the course view shall show that lesson's published title, optional description, and position and shall present only that lesson's exact attached content in the lesson content area.
When the lesson is no longer current, published, or attached, the course view shall instead show the same unavailable outcome as [CAT-6](#cat-6) and disclose no stale release or content metadata.

### CAT-9

Where no complete publication candidate is supplied, a supplied slug is reserved by another course whether published or unpublished, a supplied candidate changes the slug locked by this course's first release, a lower candidate revision arrives after a higher accepted revision, or the same draft revision arrives with different candidate identity or content, when an account allowed to publish courses confirms publication, the publication surface shall create no release, preserve every current release and slug reservation, and show the corresponding redacted publication conflict without disclosing another draft.

## Collaborator Behavior

### CAT-10

When publication succeeds, the release registry shall provide one report naming a stable result identity, draft ID, snapshot ID and revision, locked slug, monotonically increasing release number, and publication time, and shall persist the supplied snapshot as the immutable release identified by those values.
When the exact same snapshot ID and value for a draft revision is published again, the release registry shall return that existing successful publication report and shall not create another release or result identity.

### CAT-13

Where course-consumption permission and its active-account context have been accepted under [CAT-17](#cat-17), when playback authorization is requested, the entitlement boundary shall recompute current release state and shall produce one opaque single-use allow value only when the exact content reference occurs in the requested lesson of the exact current published release.
The entitlement boundary shall pass that value directly to the trusted content recipient for the same request, associated with the account context, lesson, release, content kind, asset ID, and asset revision; it shall neither serialize the value to the browser nor accept one supplied by a browser or an earlier request, and shall otherwise produce the same generic unavailable outcome defined by [CAT-6](#cat-6).

### CAT-16

When a publication snapshot accepted under [CAT-15](#cat-15) is rejected for a reserved slug, locked-slug mismatch, stale revision, or same-revision value mismatch, the publication boundary shall provide one stable conflict report with a stable result identity, that reason, and candidate detail containing only draft ID, snapshot ID, revision, and slug.
An exact repeated rejected request shall return the same report.

## Internal Behavior

### CAT-15

When a publication snapshot is supplied, the publication-snapshot intake shall accept only an immutable schema-version `1` value from a trusted server-only snapshot source.
The publication boundary shall require that snapshot to contain an opaque snapshot ID, draft ID and revision, title, slug, summary, and sections and lessons in their declared order, with every section carrying its stable ID, title, and contiguous zero-based position and every lesson carrying its stable ID, title, optional description, contiguous zero-based position, and one exact content reference naming content kind, asset ID, and immutable asset revision.
It shall require the snapshot to contain no mutable content label, lifecycle state, or storage location and to be complete without a later authoring, descriptor, or ordering lookup.
The publication-snapshot intake shall reject a browser-supplied, altered, incomplete, untrusted, or same-identity/mismatched-value snapshot without producing an accepted snapshot.

### CAT-17

When course-consumption or course-publication permission is supplied, the authorization intake shall accept it only from a trusted server source with an active-account context naming the same account, exact request, and requested catalog, release, lesson, content, or course as applicable.
It shall reject stale, mismatched, browser-supplied, privileged-service, or generic role evidence and shall expose no catalog data or publication operation after rejection.

### CAT-19

When catalog data is read or publication state is changed, the read boundary or publication boundary shall proceed only with fresh course-consumption or course-publication context, respectively, accepted under [CAT-17](#cat-17) for that exact request.
It shall apply that same account context at its data-access boundary, use no privileged service identity for ordinary catalog reads or publication mutations, and change no release or slug reservation without both accepted publication context and a snapshot accepted under [CAT-15](#cat-15).

### CAT-18

When publication requests for one draft arrive concurrently or out of revision order, the publication boundary shall serialize their release-state effects so the greatest successfully accepted snapshot revision is current while published, a lower revision can never replace or revive it even after unpublication, and each rejected lower or conflicting same-revision request receives its own report under [CAT-16](#cat-16) without changing release history or slug ownership.

### CAT-11

When publication is attempted, the release registry shall reserve an accepted first-release slug atomically and shall reject a slug reserved by a different course, including an unpublished course, leaving all current releases and reservations unchanged for the rejected request.
Where the same course draft already has a release, it shall also reject a snapshot whose slug differs from the first release's slug.

### CAT-12

When publication makes a release current, the release registry shall atomically designate either the existing immutable release for an exact repeated snapshot or a new immutable release for a newly accepted snapshot, so list, detail, and entitlement reads resolve through one current release identity.

### CAT-14

When catalog views are produced, the read boundary shall derive their complete visible values only from current immutable releases and shall remain independent of later mutable draft state.

## Verification

### CAT-20
Verifies: [CAT-1](#cat-1), [CAT-2](#cat-2), [CAT-6](#cat-6), [CAT-8](#cat-8), [CAT-14](#cat-14)

Where fixtures contain two current releases, one draft-only course, one unpublished course, and an unknown slug, when allowed, denied, and anonymous reads are exercised, the contract suite shall assert title ordering, exact snapshot hierarchy, identical redacted unavailable outcomes, and no draft-derived field.

### CAT-21
Verifies: [CAT-3](#cat-3), [CAT-4](#cat-4), [CAT-9](#cat-9), [CAT-10](#cat-10), [CAT-11](#cat-11), [CAT-12](#cat-12), [CAT-16](#cat-16)

Where fixtures contain no snapshot, two increasing snapshots for one draft, an exact repeated snapshot before and after unpublication, lower and conflicting same-revision snapshots arriving before and after the greater revision, an unpublished greater release followed by its lower snapshot, an unreserved slug, two first-release drafts racing for that slug, a slug reserved by another published or unpublished course, and a same-course changed slug, when publications and concurrent reads straddle each accepted or rejected request, the contract suite shall assert first-slug acceptance and locking for exactly one course, idempotent receipt and release identity including exact-snapshot reselection, monotonically increasing release numbers only for newly accepted snapshots, the greatest accepted revision current while published, no lower-revision revival after unpublication, atomic all-old or all-new views, the exact redacted conflict reason, stable repeated candidate-conflict reports, and no draft, release, current-selection, or slug-reservation change for every missing, stale, payload-mismatched, or slug-conflicting request.

### CAT-22
Verifies: [CAT-5](#cat-5), [CAT-7](#cat-7), [CAT-13](#cat-13)

Where a current release contains two content references, when the contract suite requests playback for an attached reference, an unattached reference, a prior release, a mismatched or inactive account context, a denied decision, after current-release replacement, and after unpublication and also attempts publication and unpublication as a denied account, the suite shall provide an opaque playback allow value only for a fresh exact current attached request, provide the same redacted unavailable outcome for every unavailable request, reject replay of every prior allow value, preserve release history after allowed unpublication, and create no release or selection change for either denied mutation.

### CAT-23
Verifies: [CAT-15](#cat-15), [CAT-16](#cat-16), [CAT-17](#cat-17), [CAT-18](#cat-18), [CAT-19](#cat-19)

Where data-access fixtures represent absent, untrusted, inactive, mismatched, allowed-consumer, allowed-publisher, and privileged identities and publication fixtures include trusted, browser-supplied, altered, and same-identity/mismatched-value snapshots in concurrent orderings, when each directly exercises every catalog read and publication shape, the contract suite shall enforce the authorization and trusted-source conditions in [CAT-13](#cat-13) and [CAT-15](#cat-15), reject browser-supplied account contexts, authorization claims, playback allow values, and every untrusted or inconsistent snapshot, preserve the greatest accepted revision, and find no path that broadens current-release reads or publication rights.
