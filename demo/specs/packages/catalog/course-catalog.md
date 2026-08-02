<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# course-catalog: Course Catalog

## Intent

This spec covers courses and their syllabi: public browsing, the admin course manager, publication state, and the syllabus structure of ordered sections and lessons.
A lesson may carry one media attachment as an opaque reference; this package does not define what media is — the deployment supplies the media provider, and the catalog never interprets or manages the referenced assets.

## External Behavior

### Browsing

#### course-catalog-1

When any visitor opens the course list, the catalog shall show every published course — title, and summary where the course has one — newest publication first by default (ties broken by title, then slug), with an alphabetical-by-title order selectable (ties broken by slug), and shall not show unpublished courses.

#### course-catalog-2

When a visitor opens a published course, the course page shall show the course title, its description, and the full syllabus: sections in their defined order, each with its lessons in their defined order, and a lesson entry marked as playable exactly when it carries a media attachment that the deployment's media provider resolves.

#### course-catalog-3

When a visitor opens a lesson from the syllabus, the lesson view shall show the lesson title, its course and section context, and — where the lesson carries a media attachment the provider resolves — the media area delegated to the deployment's media provider, an attachment the provider does not resolve presenting as no media.

#### course-catalog-4

When a request targets a course or lesson that does not exist, or one that is unpublished while the requester holds no admin session, the site shall respond not-found, making an unpublished course indistinguishable from a nonexistent one to non-admins.

#### course-catalog-5

While an admin session is active, when a request targets an unpublished course or one of its lessons, the site shall show the page, marked as unpublished.

### Management

#### course-catalog-6

Where the course manager is designated admin-only [[access-control-4](../identity/access-control.md#access-control-4)], when the admin creates a course with a title, the catalog shall create it unpublished.

#### course-catalog-7

Where the course manager is designated admin-only [[access-control-4](../identity/access-control.md#access-control-4)], while no course exists, the course manager shall present course creation as its primary action.

#### course-catalog-8

When the admin edits a course's syllabus, the course manager shall support adding, renaming, reordering, and removing sections and lessons, the course page reflecting exactly the arranged order.

#### course-catalog-9

When the admin removes a section, the course manager shall ask for confirmation naming the count of lessons removed with it and apply the answer:

- confirmed removal takes the section's lessons and their stored references with it and touches no provider asset;
- cancel changes nothing.

#### course-catalog-10

When the admin changes a course's publication state, the catalog shall apply that transition:

| Transition | Outcome |
| --- | --- |
| publish, including republishing after an unpublish | the course appears in the course list under a publication time set by this publish, and its page becomes publicly reachable [[course-catalog-1](#course-catalog-1)] |
| unpublish | the course returns to the unpublished state and public requests see not-found again [[course-catalog-4](#course-catalog-4)] |

#### course-catalog-11

When a save would leave a required field empty — a course title, section name, or lesson title — the course manager shall keep the entered state, mark the offending field, and save nothing.

#### course-catalog-12

When the admin deletes a course, the course manager shall run the confirmed deletion:

1. ask for confirmation naming the counts of sections and lessons removed with it;
2. on confirmation, remove the course — it leaves the course list and its page responds not-found [[course-catalog-4](#course-catalog-4)].

#### course-catalog-13

When the admin saves a course's details — the title and an optional description — the course manager shall store them, the course page showing the description [[course-catalog-2](#course-catalog-2)] and the course list showing the description's first paragraph as the course's summary [[course-catalog-1](#course-catalog-1)].

#### course-catalog-14

When a save, a publication change, or a deletion of a course commits, the catalog shall make the change visible to the next read of every public and management view and commit atomically:

- a committed edit to a published course requires no further publish action;
- a concurrent read sees the complete prior state or the complete new state, never a mixture.

### Media Attachments

#### course-catalog-15

When the admin uses a lesson's attach, replace, or remove media action, the course manager shall apply the action to the lesson's media reference — at most one reference per lesson — without interpreting it:

| Action | Outcome |
| --- | --- |
| attach, replace | delegates asset selection to the deployment's media provider and stores the returned reference on the lesson |
| remove | clears the reference only |

#### course-catalog-16

While a lesson's stored reference no longer resolves with the provider, the course manager shall keep it, mark the attachment unavailable, and offer the replace and remove actions on it.

### Addresses

#### course-catalog-17

When a course is created, the catalog shall assign it a URL slug derived from its title, made unique by suffixing on collision and never changed thereafter.

### Deletion Boundary

#### course-catalog-18

When a course is deleted [[course-catalog-12](#course-catalog-12)], the catalog shall delete its sections, lessons, and stored media references in the same operation, and shall not delete or alter any asset of the media provider.

## Internal Behavior

### Structure Integrity

#### course-catalog-19

Where the catalog store keeps section and lesson order, it shall keep explicit positions independent of names and timestamps, so a rename or a re-save never reorders a syllabus.

### Draft Isolation

#### course-catalog-20

Where catalog data is read for a requester without an admin session, unpublished courses and their content shall be excluded at the data-access layer, so no response payload — page markup or data request — carries unpublished content to non-admins.

## Verification

### Browsing and Publication Coverage

#### course-catalog-21

Where fixture data holds three published courses with known publication times — two sharing one time, one carrying no description — and one unpublished course, the test suite shall assert:

- the course list shows exactly the published three, newest publication first by default with the shared-time pair ordered by title, alphabetical by title with slug tiebreak when that order is selected, and the no-description course listed by title alone ([[course-catalog-1](#course-catalog-1)]);
- a published course page shows its syllabus in the defined order with resolvable-attachment lessons marked playable ([[course-catalog-2](#course-catalog-2)]);
- the unpublished course's URL responds not-found without an admin session ([[course-catalog-4](#course-catalog-4)]) while an admin session sees its page marked as unpublished ([[course-catalog-5](#course-catalog-5)]);
- publishing then unpublishing it flips the list and the URL between the two states, and republishing places the course first in the list under its new publication time ([[course-catalog-10](#course-catalog-10)]);
- a detail save to a published course is visible on the immediately following list and page reads ([[course-catalog-14](#course-catalog-14)]).

### Management Coverage

#### course-catalog-22

Where an admin session drives the course manager from an empty catalog, the test suite shall assert:

- creation is presented as the primary action ([[course-catalog-7](#course-catalog-7)]);
- a created course starts unpublished ([[course-catalog-6](#course-catalog-6)]);
- a saved description appears on the course page with its first paragraph as the list summary ([[course-catalog-13](#course-catalog-13)]);
- added sections and lessons appear in the arranged order, and after reordering and renaming plus a reload, the order matches the explicit positions ([[course-catalog-8](#course-catalog-8)], [[course-catalog-19](#course-catalog-19)]);
- removing a section asks for confirmation naming its lesson count — cancel leaves the syllabus unchanged, confirm removes the section with its lessons ([[course-catalog-9](#course-catalog-9)]);
- a save with an empty required field marks the field, keeps the entered state, and persists nothing ([[course-catalog-11](#course-catalog-11)]);
- a read issued while a multi-field save commits shows either the complete previous or the complete saved course, never a mixture ([[course-catalog-14](#course-catalog-14)]).

### Identity and Boundary Coverage

#### course-catalog-23

Where a stub media provider returns fixed references, the test suite shall assert:

- attach, replace, and remove store, swap, and clear the lesson's single reference without the catalog reading the referenced asset ([[course-catalog-15](#course-catalog-15)]);
- when the stub stops resolving a stored reference, the manager keeps it, marks the attachment unavailable, and still offers replace and remove ([[course-catalog-16](#course-catalog-16)]);
- opening a lesson shows the lesson title with its course and section context, the media area for a stub-resolvable attachment, and the no-media presentation for an unresolvable one ([[course-catalog-3](#course-catalog-3)]);
- a course's slug survives a title change and collides into a suffixed form ([[course-catalog-17](#course-catalog-17)]);
- deleting a course — after a confirmation naming its section and lesson counts ([[course-catalog-12](#course-catalog-12)]) — removes the course from the list, its sections, lessons, and references, while the stub provider's assets remain untouched ([[course-catalog-18](#course-catalog-18)]);
- when the admin confirms removal of a section whose lesson carries a stored reference, the reference goes with the lesson while the stub provider's assets remain untouched ([[course-catalog-9](#course-catalog-9)]).

### Isolation Coverage

#### course-catalog-24

Where fixture data holds an unpublished course with a distinctive title, the test suite shall assert that no response to signed-out or member-session requests — page markup or data request — contains the unpublished course's title or slug [[course-catalog-20](#course-catalog-20)].
