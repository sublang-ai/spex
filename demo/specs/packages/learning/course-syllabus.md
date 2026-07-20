<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# SYLL: Course Syllabus

## Intent

This package lets an authorized author build a complete, ordered course draft and emit an immutable publication candidate without knowing how lesson content is stored or delivered.
Its separation from published releases follows [DR-002](../../decisions/002-course-media-boundary.md).


## External Behavior

### SYLL-1

Where an author has `course.author` capability, when the author creates a course draft with a title, the syllabus editor shall create one empty draft, assign a proposed slug by lowercasing ASCII letters, replacing each run outside `a`–`z` and `0`–`9` with one hyphen, and trimming boundary hyphens, and show the draft as not ready to publish.
When that rule yields an empty slug, the syllabus editor shall leave the proposed slug empty and ask the author to supply one.

### SYLL-2

While a never-published draft is open, when the author edits its title, slug, or summary and saves, the syllabus editor shall preserve the accepted values, identify blank required values or a malformed slug inline, and keep the last valid saved revision when validation fails.
The slug shall contain only lowercase ASCII letters, digits, and single hyphens, with no leading or trailing hyphen.
Where the host reports that first publication has locked the slug, the syllabus editor shall show that slug as read-only while continuing to allow title and summary edits.
While an author edits an earlier base revision and another accepted save has advanced the draft, when the author saves the stale edit, the syllabus editor shall return `DraftSaveConflict`, preserve the current saved draft, show the newer revision, and require the author to reload and reapply the edit instead of silently overwriting it.

### SYLL-3

While a draft is open, when the author adds, renames, reorders, or removes sections and lessons, the syllabus editor shall show the resulting hierarchy in its persisted order and shall require confirmation before removing a non-empty section or a lesson.

### SYLL-4

While a lesson is open, when the author opens its content chooser, the syllabus editor shall show each received content descriptor by label and state, allow only a `ready` descriptor carrying a complete `ContentRef` to be attached, and expose no storage location.
When the author attaches, replaces, or removes a ready descriptor, the syllabus editor shall show the attached label and its current `ready` or later `unavailable` state.
The syllabus editor shall allow the same learning-content item in more than one lesson.

### SYLL-5

When an author asks whether a draft can produce a publication candidate, the validation report shall mark it ready only when the title, slug, and summary are valid, at least one section exists, every section has a title and at least one lesson, every lesson has a title, and every lesson has exactly one attached learning-content item currently reported ready.
For every failed condition, the report shall identify the affected field or lesson and the corrective action.

### SYLL-6

Where the trusted publisher-result boundary has recorded a draft snapshot revision as the published baseline, when the author saves further edits, the syllabus editor shall label them as unpublished changes and shall not represent the accepted published version as changed.

### SYLL-7

Where an author has `course.author` capability, when the author opens course authoring, the syllabus editor shall list every saved draft by title with its current revision, last-saved time, ready/not-ready state, and unpublished-changes state, and shall let the author resume any listed draft.

### SYLL-8

Where a signed-in account is denied `course.author` capability, when that account requests a draft or authoring action directly, the syllabus editor shall disclose no draft field, save no change, and report that administrator access is required.

### SYLL-9

Where a draft fails one or more publication-candidate rules, when its author requests a publication candidate, the syllabus editor shall keep the draft and its saved revision unchanged, show every validation result at the affected field or lesson, and report that the draft is not ready for publication.
When the trusted publisher-result boundary reports a slug conflict bound to the current candidate, the syllabus editor shall keep the draft and its saved revision unchanged and show the conflict at the slug field for correction.

## Internal Behavior

### SYLL-10

When any draft save is requested, the draft registry shall compare its required expected revision with the current saved revision and shall accept all field and structural changes atomically only when they match, preserve stable draft, section, and lesson identities, assign an unambiguous total order within each parent, and advance the draft revision exactly once.
When they do not match, the draft registry shall return `DraftSaveConflict` and shall preserve every current value and revision.

### SYLL-11

Where a draft satisfies [SYLL-5](#syll-5), when a publication snapshot is requested for its current revision, the snapshot boundary shall emit one immutable schema-version `1` `SyllabusSnapshot`, bind its opaque snapshot ID to the exact complete value in the Binding contract table, and return the same identity and value for repeated requests for that draft revision.

### SYLL-12

Where any publishability condition fails or a content reference becomes not ready, when a publication snapshot is requested, the snapshot boundary shall provide `PublicationCandidateResult` containing no snapshot and the complete validation report without modifying the draft.

### SYLL-13

When content status is needed, the content boundary shall pass the opaque `ContentRef` through the configured trusted server-only content-provider binding and shall accept only a `ContentDescriptor` whose returned reference exactly matches it.
The content boundary shall treat a browser-supplied, altered, untrusted, or mismatched descriptor as unavailable and shall not derive storage paths, fetch content bytes, or interpret provider-specific asset state.

### SYLL-14

When a saved draft is read or changed, the authoring boundary shall require a fresh server-only allowed `AuthorizationDecision` for `course.author` and a matching trusted `DataRoleProjection` for that request and shall return neither draft data nor a mutation result after denial or mismatch.
The authoring boundary shall apply the same projection at its data-access boundary, reject a projection or decision supplied by a browser, and use no privileged service identity for ordinary draft reads or mutations.

### SYLL-15

When the configured trusted publisher binding supplies a `PublicationReceipt`, the publisher-result boundary shall accept it only when its draft ID, snapshot ID, snapshot revision, and locked slug exactly match one `SyllabusSnapshot` previously emitted by this package and its result identity has not been bound to another value.
The publisher-result boundary shall reject a browser-supplied, untrusted, unknown-snapshot, cross-draft, altered-slug, or conflicting same-revision receipt without changing the draft, slug lock, or published baseline.

### SYLL-16

When a valid `PublicationReceipt` is accepted, the publisher-result boundary shall record the locked slug and greatest accepted snapshot revision as the published baseline, treat an exact repeated receipt idempotently, ignore a valid lower out-of-order receipt without regressing the baseline, and preserve unpublished-changes state whenever the current draft revision is greater than that baseline.
When a trusted `PublicationConflict` is received, the publisher-result boundary shall expose it to the editor only when its candidate exactly matches the current requested snapshot, shall ignore a replayed or out-of-order conflict, and shall never change the draft, slug lock, or published baseline from a conflict.

## Verification

### SYLL-20
Verifies: [SYLL-1](#syll-1), [SYLL-2](#syll-2), [SYLL-3](#syll-3), [SYLL-7](#syll-7), [SYLL-10](#syll-10)

Where an authorized author starts with no drafts and two editors can hold the same base revision, when the contract suite creates drafts titled `Hello, World!`, `A---B`, and `!!!`, exercises every structural operation, saves invalid fields, races accepted and stale saves, reports one draft first-published, and reloads authoring, the suite shall assert derived slugs `hello-world` and `a-b`, an empty proposed slug plus an explicit request for author input for `!!!`, the complete resumable draft list, stable identities, exact order, one revision advance only for each accepted save, `DraftSaveConflict` and no overwritten value for every stale save, confirmation behavior, preservation of the last valid revision, and a locked published slug.

### SYLL-21
Verifies: [SYLL-4](#syll-4), [SYLL-5](#syll-5), [SYLL-9](#syll-9), [SYLL-11](#syll-11), [SYLL-12](#syll-12), [SYLL-13](#syll-13)

Where a fake trusted content boundary reports uploading, ready, failed, unavailable, later-ready, mismatched-reference, altered, and browser-supplied descriptors, when chooser, attachment, validation, and snapshot requests are exercised, the contract suite shall assert exact trusted labels and states, ready-only attachment, unavailable treatment and no snapshot for every untrusted or mismatched descriptor, every validation message, preserved draft and a snapshot-free `PublicationCandidateResult` while incomplete, a complete schema-version `1` snapshot with stable identity and all fields/order/content references when ready, byte-equivalent repeated snapshot values, duplicate lesson use of one reference, and no draft/descriptor lookup needed to consume the snapshot.

### SYLL-22
Verifies: [SYLL-6](#syll-6), [SYLL-8](#syll-8), [SYLL-14](#syll-14), [SYLL-15](#syll-15), [SYLL-16](#syll-16)

Where emitted snapshots and trusted publisher fixtures can return accepted, exact replayed, lower out-of-order, conflicting same-revision, stale-conflict, cross-draft, altered, and browser-forged results, when those results arrive around later allowed edits and denied reads/mutations through both package and data-access entry points, the contract suite shall assert receipt-to-snapshot revision binding, one monotonic published baseline, idempotent exact replay, ignored stale receipt/conflict, rejection of every forged or mismatched result, correct slug lock and unpublished-changes state, byte-equivalent earlier snapshots, no draft mutation from any publisher result, no protected data on denial, and no accepted browser projection or decision.

## Binding

### SYLL-0

| Field | Contract |
| --- | --- |
| Human users | authorized course authors and signed-in accounts requesting authoring access |
| Owns | syllabus editor, `CourseDraft` and slug, `Section`, `Lesson`, ordering, draft registry and revision, `DraftListView`, `DraftEditorView`, `DraftSaveResult`, validation report, snapshot boundary, immutable `SyllabusSnapshot`, `PublicationCandidateResult`, publisher-result boundary, published baseline, content boundary, authoring boundary |
| Receives | server-only `AuthorizationDecision` for `course.author`; matching trusted server-only `DataRoleProjection`; trusted server-only `ContentDescriptor` from the configured content-provider binding; trusted `PublicationResult` containing `PublicationReceipt` or `PublicationConflict` from the configured publisher binding |
| Provides | `DraftListView`; `DraftEditorView`; `DraftSaveResult`; `PublicationCandidateResult` containing a complete immutable `SyllabusSnapshot` or validation report |
| Excludes | accounts, roles, video bytes, content playback, published catalog, routing, storage |
| Reuse | public-package candidate; any content provider can bind `ContentRef`, and any publisher can consume `SyllabusSnapshot` |

The collaborator-facing contracts are:

| Contract | Meaning |
| --- | --- |
| `ContentDescriptor` | `{ descriptorId, label, lifecycleState, contentRef? }`, where `contentRef`, when present, is `{ kind, assetId, assetRevision }`; every `ready` or formerly ready `unavailable` descriptor has it, while `uploading` or `failed` may omit it |
| `DraftListView` | saved drafts containing draft ID, title, current revision, last-saved time, ready state, and unpublished-changes state |
| `DraftEditorView` | one complete current draft, validation state, content labels/lifecycle states, published baseline, and no provider storage detail |
| `DraftSaveResult` | `DraftSaved` with draft ID/new revision/save time, `DraftValidationFailure` with field results and unchanged revision, or `DraftSaveConflict` with draft ID/expected revision/current revision and no overwritten field value |
| `PublicationCandidateResult` | one complete `SyllabusSnapshot`, or the complete validation report and no snapshot |
| `PublicationReceipt` | `{ resultId, draftId, snapshotId, snapshotRevision, lockedSlug, releaseNumber, publishedAt }` for an accepted snapshot |
| `PublicationConflict` | `{ resultId, reason, candidate? }`, where reason is `missing-snapshot`, `slug-reserved`, `locked-slug-mismatch`, `stale-revision`, or `revision-payload-mismatch`, and candidate, when present, names only draft ID, snapshot ID, revision, and slug |
| `PublicationResult` | exactly one trusted `PublicationReceipt` or `PublicationConflict` from the configured publisher binding |

A schema-version `1` `SyllabusSnapshot` is the complete immutable value below; resolving it requires no draft read, descriptor read, or ordering rule:

| Field | Shape |
| --- | --- |
| snapshot identity | `schemaVersion: 1`, opaque `snapshotId`, `draftId`, monotonically increasing `revision` |
| course values | title, slug, summary |
| sections | ordered list of `{ sectionId, title, position, lessons[] }` with contiguous zero-based positions |
| lessons | ordered list of `{ lessonId, title, description: string or null, position, contentRef }` with contiguous zero-based positions |
| content reference | complete `{ kind, assetId, assetRevision }`; no mutable descriptor label, lifecycle state, or storage location |

A draft has this user-visible shape:

| Concept | Required fields |
| --- | --- |
| Course draft | title, slug, summary, revision |
| Section | stable identity, title, position |
| Lesson | stable identity, title, optional description, position, zero or one `ContentRef` while drafting |
