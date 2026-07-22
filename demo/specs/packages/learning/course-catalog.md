<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# CAT: Course Catalog

## Intent

This package owns mutable course records, their ordered syllabi, stable addresses, publication state, and opaque lesson-media references.
A course has a title, optional summary, stable slug, and ordered sections; each section has a title and ordered lessons; each lesson has a title, optional description, and at most one opaque media reference.
An administrator is a package user whose fresh course-management permission is accepted for the exact request.
A trusted playback-eligibility request is a server-only request naming one exact course, lesson, and host request identity.
The package neither defines roles nor owns media assets: an installation supplies authorization and a media collaborator, and the package can be reused unchanged with any suppliers satisfying the requirements below.

## External Behavior

### CAT-1

When any visitor opens the course list, the catalog shall show every published course and no unpublished course, with each title and summary linking to its stable slug, and shall offer `Newest` and `Title A–Z` ordering.
`Newest` shall be the default and order by publication time descending, then title, then slug; `Title A–Z` shall order by title, then slug.
Every title comparison shall normalize to Unicode NFC and use `en-US` collation with base sensitivity (ignoring case and accents), punctuation significant, and digit sequences compared lexicographically rather than numerically.

### CAT-2

When a visitor opens a published course, the course view shall show its title, summary, and complete syllabus, with sections and lessons in their saved order and every lesson linked to its stable lesson route.
When the visitor opens a lesson, the lesson view shall show its title, optional description, course and section context, and media area.

### CAT-3

When a published lesson carries a media reference that resolves, its course entry shall be marked playable and its lesson media area shall show a playback action without requesting or embedding the private media content.
When the lesson has no reference or its reference does not resolve, both views shall show a no-media state and shall expose no opaque reference, provider metadata, or resolution detail.

### CAT-4

When a public request targets an unknown or unpublished course or one of its lessons, the catalog shall return the same plain not-found outcome and disclose no course, syllabus, media-reference, or publication-state data.

### CAT-5

Where course-management permission is accepted, when the administrator creates a course with a nonblank title, the course manager shall create one unpublished course with an empty syllabus.
It shall derive the slug by lowercasing ASCII letters, replacing each run outside `a`–`z` and `0`–`9` with one hyphen, trimming boundary hyphens, and using `course` when the result is empty; on collision it shall append the smallest available numeric suffix starting with `-2`.
The slug shall remain unchanged when the title later changes.

### CAT-6

Where course-management permission is accepted, when the administrator saves course details or adds, renames, reorders, or removes sections and lessons, the course manager shall preserve the accepted title, optional summary, lesson descriptions, and exact arranged order.
It shall require confirmation before removing a nonempty section or a lesson; when a required title is blank, it shall keep the entered state, mark the field, and persist none of that save.

### CAT-7

Where a course is published, when an accepted save changes its details, syllabus, or media references, the catalog shall expose the complete saved state immediately and atomically across subsequent course-list, course, and lesson reads.
Each reader shall receive either the complete preceding state or the complete saved state; no staging area, numbered release, or publication history shall exist.

### CAT-8

Where course-management permission is accepted, when the administrator opens a lesson's media chooser, the course manager shall show the media collaborator's selectable items by label without exposing their opaque references.
When the administrator selects, replaces, or clears an item, the course manager shall store at most one returned reference on the lesson or clear that reference, and shall never interpret, alter, or delete the referenced asset.

### CAT-9

When a stored media reference becomes unresolvable, the course manager shall retain it, mark the attachment unavailable, and offer replacement and clear actions; public course and lesson views shall treat it as no playable media.

### CAT-10

Where course-management permission is accepted, when the administrator publishes an unpublished course, the course manager shall mark that same record published and set its publication time.
When the administrator unpublishes it, the course manager shall mark that same record unpublished; republishing shall set a new publication time without creating a copy, release, or history entry.

### CAT-11

Where course-management permission is accepted, when the administrator asks to delete a course, the course manager shall request confirmation naming the numbers of sections and lessons that will be removed.
If confirmed, it shall hard-delete the course, its sections, lessons, and stored media references in one operation, make its public routes not-found, and leave every media-provider asset unchanged; if canceled, it shall change nothing.

### CAT-12

When a caller without accepted course-management permission requests the course manager or any create, save, media-reference, publish, unpublish, or delete action, the package shall report that course-management access is required, disclose no management data, and change no course or media reference.

### CAT-13

Where a trusted host makes a playback-eligibility request, when its course and lesson are currently published and the lesson's stored media reference resolves, the playback-eligibility boundary shall return a fresh server-only eligible result naming that same host request identity and exact stored opaque reference.
For an unknown or unpublished course or lesson, an absent or unresolvable reference, or an untrusted or mismatched request, it shall instead return one ineligible result naming the request and no course, publication, media-reference, provider, or failure detail.

## Internal Behavior

### CAT-14

When course-management permission is supplied, the authorization intake shall accept only a fresh trusted server decision for the same active account, exact request and action, and named course when one exists.
It shall reject absent, denied, stale, inactive-account, mismatched, browser-supplied, privileged-service, or generic-role evidence; after rejection it shall return no management data, invoke no media collaborator, and mutate nothing.

### CAT-15

When media selection is supplied, the media-selection intake shall accept only a trusted server response for the exact chooser request that gives each selectable item a display label and opaque reference and returns either one offered reference or cancellation.
It shall reject an absent, stale, malformed, altered, mismatched, or browser-supplied response by showing no choices and storing no reference.

### CAT-16

When media resolution is supplied, the media-resolution intake shall accept only a trusted server response for the exact stored reference that reports either unresolvable or resolvable for that reference.
It shall treat an absent, stale, malformed, altered, mismatched, or browser-supplied response as unresolvable, preserve the stored reference, and disclose no cause or provider detail.

### CAT-17

When an accepted action changes a course, the course registry shall preserve stable course, section, and lesson identities, explicit total order within each parent, and a slug unique among existing courses.
It shall reserve a new slug and commit every complete save, publication-state change, or deletion atomically, or preserve the preceding record unchanged; course deletion shall issue no media-provider deletion.

### CAT-18

When a public catalog, course, or lesson response is produced, the read boundary shall select only currently published records and only the public fields needed by the applicable view.
It shall carry no unpublished content, management data, opaque media reference, provider metadata, or authorization evidence into a public response.

## Verification

### CAT-19

Where fixtures contain published courses with tied and distinct publication times, titles, case, accents, punctuation, digit sequences, and Unicode normalization plus one unpublished course, and host eligibility fixtures cover eligible, unknown, unpublished, unattached, unavailable, untrusted, and mismatched requests, when visitors use both list orders, open every course and lesson route, and the host requests playback eligibility, the contract suite shall assert the exact `Newest` default and `Title A–Z` orders, normalized collation, deterministic tie-breakers, public fields, and exclusion of the unpublished course ([CAT-1](#cat-1)); the complete saved hierarchy and lesson context ([CAT-2](#cat-2)); exact playable and no-media presentations with no private reference or provider detail ([CAT-3](#cat-3)); one indistinguishable not-found outcome for unknown and unpublished routes ([CAT-4](#cat-4)); and a fresh request-bound server-only eligible result with the exact stored reference only for the published resolvable fixture, with one detail-free ineligible result otherwise ([CAT-13](#cat-13)).

### CAT-20

Where an authorized administrator starts with an empty catalog, when the contract suite creates colliding and punctuation-only titles, renames a course, edits and reorders its syllabus, confirms and cancels removals, and attempts a blank required title, the suite shall assert unpublished creation, `hello-world`, `hello-world-2`, and `course` slugs that survive renaming ([CAT-5](#cat-5)); and exact saved order, confirmation behavior, and preservation of the preceding record after invalid input ([CAT-6](#cat-6)).

### CAT-21

Where an authorized administrator has one course and a media collaborator whose assets are observable, when the suite publishes, saves new details and a reordered syllabus, unpublishes, republishes, and then confirms deletion while readers straddle each operation, the suite shall assert all-preceding or all-saved public reads with no staged or historical version ([CAT-7](#cat-7)); same-record visibility toggles and a new republish time ([CAT-10](#cat-10)); confirmation counts, atomic structural and reference deletion, not-found routes, and unchanged provider assets ([CAT-11](#cat-11)); and stable identities, explicit order, unique slugs, and all-or-nothing mutations ([CAT-17](#cat-17)).

### CAT-22

Where controlled media collaborators return valid, canceled, absent, stale, malformed, altered, mismatched, browser-supplied, resolvable, and unresolvable results, when the administrator selects, replaces, clears, and later encounters a deleted provider asset, the contract suite shall assert labeled selection, one opaque stored reference, clear behavior, and no provider-asset mutation ([CAT-8](#cat-8)); retention and administrator repair of a dangling reference with no public playable media ([CAT-9](#cat-9)); acceptance only of the exact trusted selection result with no stored reference after every rejection ([CAT-15](#cat-15)); and acceptance only of the exact trusted resolution with every rejection treated as unresolvable without clearing the reference ([CAT-16](#cat-16)).

### CAT-23

Where authorization fixtures include fresh allowed and absent, denied, stale, inactive-account, mismatched, browser-supplied, privileged-service, and generic-role decisions, when each caller opens management and attempts every mutation while public readers request unpublished sentinel data, the contract suite shall assert the access-required response, no management disclosure, and no mutation after every unaccepted decision ([CAT-12](#cat-12)); acceptance only of the fresh exact trusted decision, with no media call or data access after rejection ([CAT-14](#cat-14)); and public reads containing only published view fields and none of the sentinel unpublished, management, reference, provider, or authorization values ([CAT-18](#cat-18)).
