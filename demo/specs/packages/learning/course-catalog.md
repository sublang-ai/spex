<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# CAT: Course Catalog

## Intent

This package publishes immutable syllabus snapshots, gives every reader one coherent public current-release catalog, and authorizes exact current-lesson content for permitted viewers.
It owns published course releases and their selection while leaving mutable draft authoring and attached-content delivery outside the package.
It can be reused unchanged with any authorizer, snapshot source, and content recipient satisfying the meanings defined below.
Lesson-content permission means fresh trusted authorization associated with the active account, exact request, current published course and lesson, and exact attached content to request that content.
Course-publication permission means fresh trusted authorization associated with the active account, exact request, and named course to publish a complete version or unpublish its current release.
Each installation supplies those permissions through a trusted authorizer.

## External Behavior

### CAT-1

When any reader opens the catalog, the catalog shall list every currently published course and no draft or unpublished course, ordered by `en-US` case-insensitive title and then slug as the deterministic tie-breaker, with each title and summary linking to its stable slug.

### CAT-2

When any reader selects the slug of a currently published course, the course view shall show the release's title, summary, and complete section and lesson hierarchy in published order, with each lesson linked to its public lesson route.

### CAT-3

Where an account is allowed to publish courses and the selected complete course version has no conflict under [CAT-9](#cat-9), when the account confirms publication, the publication surface shall make that version current in one operation and shall report success with the accepted draft revision, locked slug, release number, and publication time.

### CAT-4

Where a course already has a current release, when an account allowed to publish courses publishes a later saved version, the catalog shall switch new catalog, course, lesson, and playback selections to the later release together and shall show only all-earlier or all-later fields and lessons for each read.

### CAT-5

Where a course has a current release, when an account allowed to publish courses confirms unpublication, the catalog shall remove the course from subsequent catalog, course, lesson, and new playback results while retaining its release history and locked slug reservation for a later republish.

### CAT-6

When an unknown slug, unpublished course, non-current release, unknown or non-current lesson, or unattached content is requested, the catalog shall show the same plain unavailable outcome and shall disclose no hidden course, release, lesson, content, authorization, or denial-cause detail.

### CAT-7

Where a signed-in account is not allowed to publish courses, when that account requests publication or unpublication directly, the publication surface shall create no release, preserve the current release selection, and report that course-publishing access is required.

### CAT-8

When any reader opens a lesson in a current published release, the course view shall show that lesson's published title, optional description, position, course and section context, and a content area that exposes no content reference, asset identity, or video metadata before playback is authorized.
When the lesson is no longer current, published, or attached, the course view shall instead show the same unavailable outcome as [CAT-6](#cat-6) and disclose no stale release or content metadata.

### CAT-9

Where no complete publication candidate is supplied, a supplied slug is reserved by another course whether published or unpublished, a supplied candidate changes the slug locked by this course's first release, a lower candidate revision arrives after a higher accepted revision, or the same draft revision arrives with different candidate identity or content, when an account allowed to publish courses confirms publication, the publication surface shall create no release, preserve every current release and slug reservation, and show the corresponding redacted publication conflict without disclosing another draft.

### CAT-10

When publication succeeds, the release registry shall provide one report naming a stable result identity, draft ID, snapshot ID and revision, locked slug, monotonically increasing release number, and publication time, and shall persist the supplied snapshot as the immutable release identified by those values.
When the exact same snapshot ID and value for a draft revision is published again, the release registry shall return that existing successful publication report and shall not create another release or result identity.

### CAT-13

Where lesson-content permission and its active-account context have been accepted under [CAT-24](#cat-24), when content-access authorization is requested, the entitlement boundary shall recompute current release state and shall produce one opaque single-use allow value only when the exact content reference occurs in the requested lesson of the exact current published release.
The entitlement boundary shall pass that value directly to the trusted content recipient for the same request, associated with the account context, lesson, release, content kind, asset ID, and asset revision; it shall neither serialize the value to the browser nor accept one supplied by a browser or an earlier request, and shall otherwise produce the same generic unavailable outcome defined by [CAT-6](#cat-6).

### CAT-16

When a publication snapshot accepted under [CAT-15](#cat-15) is rejected for a reserved slug, locked-slug mismatch, stale revision, or same-revision value mismatch, the publication boundary shall provide one stable conflict report with a stable result identity, that reason, and candidate detail containing only draft ID, snapshot ID, revision, and slug.
An exact repeated rejected request shall return the same report.

### CAT-26

When a public catalog, course, or lesson response is produced, the catalog shall provide only the applicable current-release fields in this table:

| Response | Complete public fields |
| --- | --- |
| catalog | each current course's title, summary, and slug |
| course | the selected course's title, summary, and slug; each ordered section's title and position; and each ordered lesson's public route key, title, optional description, and position |
| lesson | the selected course's title and slug, selected section's title and position, and selected lesson's public route key, title, optional description, and position |

A public lesson route key shall be the stable opaque lesson ID used in that lesson's route and shall carry no content or provider meaning.
It shall provide no draft ID or revision, snapshot ID, release identity or number, content kind or reference, asset ID or revision, video label or lifecycle state, authorization value, storage location, or provider field.

## Internal Behavior

### CAT-15

When a publication snapshot is supplied, the publication-snapshot intake shall accept only an immutable schema-version `1` value from a trusted server-only snapshot source.
The publication boundary shall require that snapshot to contain an opaque snapshot ID, draft ID and revision, title, slug, summary, and sections and lessons in their declared order, with every section carrying its stable ID, title, and contiguous zero-based position and every lesson carrying its stable ID, title, optional description, contiguous zero-based position, and one exact content reference naming content kind, asset ID, and immutable asset revision.
It shall require the snapshot to contain no mutable content label, lifecycle state, or storage location and to be complete without a later authoring, descriptor, or ordering lookup.
The publication-snapshot intake shall reject a browser-supplied, altered, incomplete, untrusted, or same-identity/mismatched-value snapshot without producing an accepted snapshot.

### CAT-17

When lesson-content or course-publication permission is supplied, the authorization intake shall accept it only from a trusted server source with an active-account context naming the same account, exact request, and requested current release, lesson, content, or course as applicable.
It shall reject stale, mismatched, browser-supplied, privileged-service, or generic role evidence and shall produce no content-access allow value or publication operation after rejection; rejection shall not remove the independently public metadata defined by [CAT-26](#cat-26).

### CAT-24

When lesson-content permission is supplied, the lesson-content intake shall accept it only under [CAT-17](#cat-17) with an active-account context naming the same account, exact request, current release, lesson, and attached content.
It shall reject absent, denied, stale, inactive-account, mismatched, browser-supplied, privileged-service, or generic role evidence and shall produce no content-access allow value after rejection; rejection shall not remove the independently public metadata defined by [CAT-26](#cat-26).

### CAT-25

When course-publication permission is supplied, the publication-permission intake shall accept it only under [CAT-17](#cat-17) with an active-account context naming the same account, exact request, named course, and publish or unpublish action.
It shall reject absent, denied, stale, inactive-account, mismatched, browser-supplied, privileged-service, or generic role evidence and shall perform no publication operation after rejection.

### CAT-19

When public catalog, course, or lesson metadata is read, the read boundary shall require no account or authorization context and shall return only the sanitized current-release projection defined by [CAT-26](#cat-26).
When content-access authorization is requested or publication state is changed, the entitlement or publication boundary shall proceed only with fresh lesson-content or course-publication context, respectively, accepted under [CAT-24](#cat-24) or [CAT-25](#cat-25) for that exact request.
It shall apply that same account context at its protected data-access boundary, use no privileged service identity for ordinary public reads or publication mutations, and change no release or slug reservation without both accepted publication context and a snapshot accepted under [CAT-15](#cat-15).

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

Where fixtures contain two current releases, one draft-only course, one unpublished course, an unknown slug, and sentinel snapshot, release, content, asset, and video fields, when anonymous, denied-account, and allowed-account readers open every catalog, course, and lesson route, the contract suite shall assert the [same ordered list of only current published courses](#cat-1), the [exact current published hierarchy](#cat-2), and the [public lesson fields with no content or video metadata](#cat-8).
Every view shall use the [complete sanitized field projection](#cat-26), be [derived only from the current immutable release rather than mutable draft state](#cat-14), and return the [same redacted unavailable outcome for every hidden or unknown target](#cat-6).

### CAT-21

Where fixtures contain no snapshot, two increasing snapshots for one draft, an exact repeated snapshot before and after unpublication, lower and conflicting same-revision snapshots arriving before and after the greater revision, an unpublished greater release followed by its lower snapshot, an unreserved slug, two first-release drafts racing for that slug, a slug reserved by another published or unpublished course, and a same-course changed slug, when publications and concurrent reads straddle each accepted or rejected request, the contract suite shall assert [successful atomic publication with its receipt](#cat-3), [all-earlier or all-later reads after replacement](#cat-4), and [one current immutable release identity for list, detail, and entitlement reads](#cat-12).
It shall assert the [stable idempotent report and monotonically increasing release number only for a newly accepted snapshot](#cat-10); [atomic first-slug reservation and the permanent same-course slug lock](#cat-11); and [no release, selection, or reservation change with the correct redacted conflict](#cat-9), including the [stable exact conflict-report shape for repeated rejected requests](#cat-16).

### CAT-22

Where a current release contains two content references, when the contract suite reads its public projection and requests content access for an attached reference with fresh permission, without permission, for an unattached reference, a prior release, a mismatched or inactive account context, a denied decision, after current-release replacement, and after unpublication and also attempts publication and unpublication as a denied account, the suite shall keep only the [sanitized current-release metadata](#cat-26) publicly readable; provide a [server-only, opaque, single-use allow value only for the fresh exact current attached request and the same unavailable outcome otherwise](#cat-13); [remove the public projection while preserving release history and slug reservation after allowed unpublication](#cat-5); and [create no release or selection change for either denied mutation](#cat-7).

### CAT-23

Where data-access fixtures represent absent, untrusted, inactive, mismatched, allowed-viewer, allowed-publisher, and privileged identities and publication fixtures include trusted, browser-supplied, altered, and same-identity/mismatched-value snapshots in concurrent orderings, when each directly exercises every public read, content-authorization shape, and publication shape, the contract suite shall assert [account-free public reads but exact accepted contexts for content access and publication](#cat-19), returning only the [current sanitized public projection](#cat-26) [derived independently of mutable draft state](#cat-14).
It shall assert the [common trusted authorization intake and rejection of client, privileged-service, stale, or mismatched evidence](#cat-17), the exact [lesson-content permission intake](#cat-24) and [course-publication permission intake](#cat-25), and [single-use current-lesson content authorization passed directly to the trusted recipient](#cat-13).
For publication, it shall assert the [complete trusted schema-version `1` snapshot intake and rejection of every browser-supplied, altered, incomplete, or inconsistent snapshot](#cat-15), the [stable redacted conflict report](#cat-16), and [serialized concurrent effects that preserve the greatest accepted revision without lower-revision revival](#cat-18).
