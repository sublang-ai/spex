<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# SYLL: Course Syllabus

## Intent

This package lets an authorized author build a complete, ordered course draft and emit an immutable publication candidate without knowing how lesson content is stored or delivered.
It owns mutable course authoring and publication candidates, not published releases or content delivery.
It can be reused unchanged with any authorizer, content provider, and publisher satisfying the meanings defined below.
Course-authoring permission means fresh trusted authorization associated with the active account, exact authoring action, named draft when one exists, and exact request to list, read, create, or change course drafts or request publication candidates; it grants neither learning-content management nor release-publication authority.
Each installation supplies that permission through a trusted authorizer.

## External Behavior

### SYLL-1

Where an author is allowed to author courses, when the author creates a course draft with a title, the syllabus editor shall create one empty draft, assign a proposed slug by lowercasing ASCII letters, replacing each run outside `a`–`z` and `0`–`9` with one hyphen, and trimming boundary hyphens, and show the draft as not ready to publish.
When that rule yields an empty slug, the syllabus editor shall leave the proposed slug empty and ask the author to supply one.

### SYLL-2

While a never-published draft is open, when the author edits its title, slug, or summary and saves, the syllabus editor shall preserve the accepted values, identify blank required values or a malformed slug inline, and keep the last valid saved revision when validation fails.
When that save succeeds, the syllabus editor shall show the new draft revision and save time.
The slug shall contain only lowercase ASCII letters, digits, and single hyphens, with no leading or trailing hyphen.
Where first publication has locked the slug, the syllabus editor shall show that slug as read-only while continuing to allow title and summary edits.
While an author edits an earlier base revision and another accepted save has advanced the draft, when the author saves the stale edit, the syllabus editor shall report a save conflict, preserve the current saved draft, show the newer revision, and require the author to reload and reapply the edit instead of silently overwriting it.

### SYLL-3

While a draft is open, when the author adds, edits, reorders, or removes sections and lessons, including section and lesson titles and optional lesson descriptions, the syllabus editor shall show the resulting hierarchy and descriptions in persisted order and shall require confirmation before removing a non-empty section or a lesson.

### SYLL-4

While a lesson is open, when the author opens its content chooser, the syllabus editor shall show each received learning-content item by label and `uploading`, `ready`, `failed`, or `unavailable` state, allow only an item currently reported `ready` to be attached, and expose no storage location or opaque asset identity.
When the author attaches, replaces, or removes a ready item, the syllabus editor shall show the attached label and its current `ready` or later `unavailable` state.
The syllabus editor shall allow the same learning-content item in more than one lesson.

### SYLL-5

When an author asks whether a draft can produce a publication candidate, the validation report shall mark it ready only when the title, slug, and summary are valid, at least one section exists, every section has a title and at least one lesson, every lesson has a title, and every lesson has exactly one attached learning-content item currently reported ready.
For every failed condition, the report shall identify the affected field or lesson and the corrective action.

### SYLL-6

Where a successful publication report has set a draft revision as the published baseline, when the author saves further edits, the syllabus editor shall label them as unpublished changes and shall not represent the accepted published version as changed.

### SYLL-7

Where an author is allowed to author courses, when the author opens course authoring, the syllabus editor shall list every saved draft by title with its current revision, last-saved time, ready/not-ready state, and unpublished-changes state, and shall let the author resume any listed draft.
While no saved draft exists, the syllabus editor shall show an empty state with `Create course` as its primary action.

### SYLL-8

Where a signed-in account is not allowed to author courses, when that account requests a draft or authoring action directly, the syllabus editor shall disclose no draft field, save no change, and report that course-authoring access is required.

### SYLL-9

Where a draft fails one or more publication-candidate rules, when its author requests a publication candidate, the syllabus editor shall keep the draft and its saved revision unchanged, show every validation result at the affected field or lesson, and report that the draft is not ready for publication.
When a trusted publisher reports a slug conflict for the current candidate, the syllabus editor shall keep the draft and its saved revision unchanged and show the conflict at the slug field for correction.

### SYLL-11

Where a draft satisfies [SYLL-5](#syll-5), when a publication snapshot is requested for its current revision, the snapshot boundary shall emit one immutable schema-version `1` publication snapshot containing an opaque snapshot ID, draft ID and revision, title, slug, summary, and every section and lesson in persisted order.
Each section shall carry its stable identity, title, and contiguous zero-based position; each lesson shall carry its stable identity, title, optional description, contiguous zero-based position, and exact ready content reference naming content kind, asset identity, and asset revision.
The snapshot shall contain no mutable content label, lifecycle state, or storage location; consuming it shall require no later draft, descriptor, or ordering lookup.
The snapshot boundary shall associate its opaque snapshot ID with that complete value and return the same identity and value for repeated requests for the same draft revision.

### SYLL-12

Where any publishability condition fails or a content reference becomes not ready, when a publication snapshot is requested, the snapshot boundary shall provide no snapshot and shall return the complete validation report without modifying the draft.

## Internal Behavior

### SYLL-13

When chooser content is needed, the content boundary shall request the trusted server-only provider's complete descriptor set with the active-account context accepted under [SYLL-14](#syll-14) and the exact request and shall accept each stable descriptor ID, label, `uploading`, `ready`, `failed`, or `unavailable` state, and optional reference only when the provider identifies that same account and request; every `ready` or formerly ready `unavailable` description shall carry its complete reference, while an `uploading` or `failed` description may omit one.
When status for attached content is needed, the content boundary shall pass that account context, exact request, and an opaque reference naming only content kind, asset ID, and immutable asset revision and shall accept only a `ready` or `unavailable` returned description carrying that exact reference.
The content boundary shall treat a browser-supplied, altered, untrusted, incomplete, omitted-reference status, or mismatched description as unavailable and shall not derive storage paths, fetch content bytes, or interpret provider-specific asset state.

### SYLL-14

When course-authoring permission is supplied, the authoring intake shall accept only matching fresh trusted permission and active-account context for the exact account, list, read, create, change, or publication-candidate action, named draft when applicable, and request.
It shall reject stale, denied, mismatched, browser-supplied, privileged-service, or generic role evidence and shall provide no accepted authoring context after rejection.

### SYLL-15

When a trusted publisher reports successful publication, the publisher-result boundary shall require the report to name a stable result identity, draft ID, snapshot ID and revision, locked slug, release number, and publication time, and shall accept it only when its draft, snapshot, revision, and slug exactly match one publication snapshot previously emitted by this package and its result identity has not been associated with another value.
The publisher-result boundary shall reject a browser-supplied, untrusted, unknown-snapshot, cross-draft, altered-slug, or conflicting same-revision receipt without changing the draft, slug lock, or published baseline.

### SYLL-16

When a valid successful publication report is accepted, the publisher-result boundary shall record the locked slug and greatest accepted snapshot revision as the published baseline, treat an exact repeated report idempotently, ignore a valid lower out-of-order report without regressing the baseline, and preserve unpublished-changes state whenever the current draft revision is greater than that baseline.
When a publication-conflict report is accepted under [SYLL-17](#syll-17), the publisher-result boundary shall expose it to the editor only for the matching current requested snapshot and shall never change the draft, slug lock, or published baseline from that conflict.

### SYLL-17

When a publication-conflict report is supplied, the publisher-result intake shall accept it only from a trusted publisher and only when it names a stable result identity, one reason among reserved slug, locked-slug mismatch, stale revision, or same-revision value mismatch, and candidate detail containing only draft ID, snapshot ID, revision, and slug that exactly matches a snapshot this package emitted and currently requested for publication.
It shall treat an exact repeated report for that current requested snapshot idempotently and shall reject a browser-supplied, untrusted, altered, result-identity-reused, cross-draft, or no-longer-current report without producing an accepted conflict.

### SYLL-10

When any draft save is requested, the draft registry shall compare its required expected revision with the current saved revision and shall accept all field and structural changes atomically only when they match, preserve stable draft, section, and lesson identities, assign an unambiguous total order within each parent, and advance the draft revision exactly once.
When they do not match, the draft registry shall report the draft ID, expected revision, and current revision as a save conflict and shall preserve every current value and revision without including an overwritten field value.

### SYLL-18

When drafts are listed, a draft is created, a named draft is read or changed, or a publication candidate is requested, the authoring boundary shall proceed only with an authoring context accepted under [SYLL-14](#syll-14) for that exact request and shall return no draft list, draft data, mutation result, or publication candidate after denial or mismatch.
It shall apply that same account context at its data-access boundary and use no privileged service identity for ordinary draft reads or mutations.

## Verification

### SYLL-20

Where an authorized author starts with no drafts and two editors can hold the same base revision, when the contract suite opens authoring, follows its primary `Create course` action, creates drafts titled `Hello, World!`, `A---B`, and `!!!`, exercises every structural operation, saves invalid fields, races accepted and stale saves, reports one draft first-published, and reloads authoring, the suite shall assert the [initial empty state and complete resumable draft list](#syll-7); the [derived slugs `hello-world` and `a-b` and explicit author input request for an empty proposed slug](#syll-1); the [valid-field rules, preservation of the last valid revision, save-conflict presentation, and locked published slug](#syll-2); and [persisted structural order, stable hierarchy, and confirmation before destructive removal](#syll-3).
At the registry boundary, it shall assert [atomic saves that preserve stable identities and total order, advance the revision exactly once, and retain every current value after a stale save](#syll-10).

### SYLL-21

Where a fake trusted content provider reports uploading, ready, failed, unavailable, later-ready, mismatched-reference, altered, and browser-supplied descriptions, when chooser, attachment, validation, and snapshot requests are exercised, the contract suite shall assert the [exact trusted labels and states, ready-only attachment, opaque presentation, and reuse of one content item](#syll-4), and the [server-only descriptor contract that treats every untrusted, incomplete, or mismatched description as unavailable](#syll-13).
It shall assert [every publishability condition and corrective validation message](#syll-5); the [preserved draft, field-level results, and current-candidate slug conflict while incomplete](#syll-9); and [no snapshot, complete validation, and no draft mutation](#syll-12) for every failing case.
For a ready draft, it shall assert the [complete immutable schema-version `1` snapshot, stable identity, exact persisted order and content references, byte-equivalent repeated value, and independence from later draft or descriptor lookup](#syll-11).

### SYLL-22

Where emitted snapshots and trusted publisher fixtures can return accepted, exact repeated success and conflict, lower out-of-order success, conflicting same-revision, stale conflict, cross-draft, altered, result-identity-reused, and browser-forged results, when those results arrive around later allowed edits and denied reads or mutations through both package and data-access entry points, the contract suite shall assert the [exact successful-result-to-snapshot association and rejection without mutation of every untrusted, unknown, altered, or conflicting receipt](#syll-15); the [trusted current-candidate conflict shape, idempotent exact repeat, and rejection of every stale, forged, reused-identity, or mismatched conflict](#syll-17); and the [monotonic published baseline, idempotent current success, ignored lower success, correct slug lock, unchanged draft after conflict, and unpublished-changes state](#syll-16).
It shall also assert that [later edits label unpublished changes without changing the published baseline](#syll-6), that [denied authoring discloses no draft data and saves nothing](#syll-8), that the [authoring intake accepts only fresh matching server-supplied permission](#syll-14), and that [every authoring and data-access entry point applies that accepted context without a privileged service identity](#syll-18).
