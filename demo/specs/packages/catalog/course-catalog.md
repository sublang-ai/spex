<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# CAT: Course Catalog

## Intent

This spec covers courses and their syllabi: public browsing, the
admin course manager, publication state, and the syllabus
structure of ordered sections and lessons.
A lesson may carry one media attachment as an opaque reference;
this package does not define what media is — the deployment binds
a media provider to the slot, and the catalog never interprets or
manages the referenced assets.

## External Behavior

### Browsing

#### CAT-1

When any visitor opens the course list, the catalog shall show
every published course — title and summary — newest publication
first by default (ties broken by title, then slug), with an
alphabetical-by-title order selectable (ties broken by slug),
and shall not show unpublished courses.

#### CAT-2

When a visitor opens a published course, the course page shall
show the course title, its description, and the full syllabus:
sections in their defined order, each with its lessons in their
defined order, and a lesson entry marked as playable exactly
when it carries a media attachment that the deployment's media
provider resolves.
When a visitor opens a lesson from the syllabus, the lesson view
shall show the lesson title, its course and section context,
and — where the lesson carries a media attachment — the media
area delegated to the deployment's media provider.

#### CAT-3

When a request targets a course or lesson that does not exist, or
one that is unpublished while the requester holds no admin
session, the site shall respond not-found, making an unpublished
course indistinguishable from a nonexistent one to non-admins.
While an admin session is active, when a request targets an
unpublished course or one of its lessons, the site shall show
the page, marked as unpublished.

### Management

#### CAT-4

Where the course manager is designated admin-only
([ROLE-2](../identity/access-control.md#role-2)), when the admin
creates a course with a title, the catalog shall create it
unpublished.
While no course exists, the course manager shall present course
creation as its primary action.

#### CAT-5

When the admin edits a course's syllabus, the course manager
shall support adding, renaming, reordering, and removing sections
and lessons, and the course page shall reflect exactly the
arranged order.
When the admin removes a section, the course manager shall ask
for confirmation naming the count of lessons removed with it.

#### CAT-6

When the admin publishes a course, the course shall appear in the
course list ([CAT-1](#cat-1)) and its page shall become publicly
reachable; when the admin unpublishes it, the course shall return
to the unpublished state and public requests shall again see
not-found ([CAT-3](#cat-3)).
Publishing — including republishing after an unpublish — shall
set the publication time that orders the course list
([CAT-1](#cat-1)).

#### CAT-7

When a save would leave a required field empty — a course title,
section name, or lesson title — the course manager shall keep the
entered state, mark the offending field, and save nothing.

#### CAT-17

When the admin deletes a course, the course manager shall ask
for confirmation naming the counts of sections and lessons
removed with it; when the admin confirms, the course shall leave
the course list and its page shall respond not-found
([CAT-3](#cat-3)).

#### CAT-18

When the admin saves a course's details — the title and an
optional description — the course manager shall store them; the
course page shall show the description ([CAT-2](#cat-2)), and
the course list shall show the description's first paragraph as
the course's summary ([CAT-1](#cat-1)).

#### CAT-19

When a save, a publication change, or a deletion of a course
commits, the change shall be visible to the next read of every
public and management view — a published course is one mutable
record with no separate staged or draft copy — and the commit
shall be atomic: a concurrent read sees the complete prior
state or the complete new state, never a mixture.

### The Media Slot

#### CAT-8

When the admin uses a lesson's attach, replace, or remove media
action, the course manager shall delegate asset selection to the
deployment's media provider and store the returned reference on
the lesson — at most one reference per lesson — without
interpreting it; the remove action shall clear the reference
only.
While a lesson's stored reference no longer resolves with the
provider, the course manager shall keep it, mark the attachment
unavailable, and offer the replace and remove actions on it.

### Addresses

#### CAT-9

When a course is created, the catalog shall assign it a URL slug
derived from its title, made unique by suffixing on collision;
the slug shall not change thereafter — renaming the course keeps
the slug — so shared course links keep resolving.

## Internal Behavior

### Structure Integrity

#### CAT-10

When a course is deleted ([CAT-17](#cat-17)), the catalog shall
delete its sections, lessons, and stored media references in the
same operation, and shall not delete or alter any asset of the
media provider — references are the catalog's, assets are not.

#### CAT-11

Where section and lesson order is stored, it shall be stored as
explicit positions independent of names and timestamps, so a
rename or a re-save never reorders a syllabus.

### Draft Isolation

#### CAT-12

Where catalog data is read for a requester without an admin
session, unpublished courses and their content shall be excluded
at the data-access layer, so no response payload — page markup or
data request — carries unpublished content to non-admins.

## Verification

### Browsing and Publication Coverage

#### CAT-13

Where fixture data holds three published courses with known
publication times — two sharing one time — and one unpublished
course, the test suite shall assert: the course list shows
exactly the published three, newest publication first by
default with the shared-time pair ordered by title, and
alphabetical by title with slug tiebreak when that order is
selected ([CAT-1](#cat-1)); a published course
page shows its syllabus in the defined order with
resolvable-attachment lessons marked playable ([CAT-2](#cat-2));
the unpublished course's URL responds not-found without an admin
session while an admin session sees its page marked as
unpublished ([CAT-3](#cat-3)); publishing then unpublishing it
flips the list and the URL between the two states; republishing
places the course first in the list under its new publication
time ([CAT-6](#cat-6)); and a detail save to a published course
is visible on the immediately following list and page reads
([CAT-19](#cat-19)).

### Management Coverage

#### CAT-14

Where an admin session drives the course manager from an empty
catalog, the test suite shall assert: creation is presented as
the primary action; a created course starts unpublished
([CAT-4](#cat-4)); a saved description appears on the course
page with its first paragraph as the list summary
([CAT-18](#cat-18)); added sections and lessons appear in the
arranged order, and after reordering and renaming plus a reload,
the order matches the explicit positions ([CAT-5](#cat-5),
[CAT-11](#cat-11)); removing a section asks for confirmation
naming its lesson count; a save with an empty required field
marks the field, keeps the entered state, and persists nothing
([CAT-7](#cat-7)); and a read issued while a multi-field save
commits shows either the complete previous or the complete
saved course, never a mixture ([CAT-19](#cat-19)).

### Identity and Boundary Coverage

#### CAT-15

Where a stub media provider returns fixed references, the test
suite shall assert: attach, replace, and remove store, swap, and
clear the lesson's single reference without the catalog reading
the referenced asset, and when the stub stops resolving a stored
reference, the manager keeps it, marks the attachment
unavailable, and still offers replace and remove
([CAT-8](#cat-8)); a course's slug survives
a title change and collides into a suffixed form
([CAT-9](#cat-9)); and deleting a course — after a confirmation
naming its section and lesson counts ([CAT-17](#cat-17)) —
removes the course from the list, its sections, lessons, and
references, while the stub provider's assets remain untouched
([CAT-10](#cat-10)).

### Isolation Coverage

#### CAT-16

Where fixture data holds an unpublished course with a distinctive
title, the test suite shall assert that no response to signed-out
or member-session requests — page markup or data request —
contains the unpublished course's title or slug
([CAT-12](#cat-12)).
