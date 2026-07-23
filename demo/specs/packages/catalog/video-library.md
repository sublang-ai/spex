<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# VID: Video Library

## Intent

This spec covers protected video assets: admin upload, the
library listing, deletion, reference resolution, and playback
gated by short-lived access grants.
The package has no notion of what its assets illustrate: host
surfaces embed its picker and player, and what a stored
reference means to the host is the host's business.

## External Behavior

### Upload

#### VID-1

Where the library is designated admin-only
([ROLE-2](../identity/access-control.md#role-2)), when the admin
selects a video file in an accepted format (MP4 or WebM) within
the configured size cap, the library shall upload it, showing
progress until completion, and then list the asset with its
title defaulted from the file name.

#### VID-2

When the selected file's format is not accepted or its size
exceeds the configured cap, the library shall refuse before any
content is uploaded, naming the violated limit.

#### VID-3

When an upload is interrupted — connection loss or leaving the
page — the library shall list no partial asset, and a retry
shall start the upload from the beginning.

### The Library

#### VID-4

The library shall list each asset with an editable title, its
size, and its upload date, each entry with a delete action; when
the admin confirms deletion, the asset shall leave the list and
its content shall no longer be served.

### Playback

#### VID-5

Where a host surface embeds the player for an asset and the
host authorizes that asset for the requester
([VID-15](#vid-15)), while a signed-in session is active
([AUTH-2](../identity/github-login.md#auth-2)), the player shall
stream the asset with standard controls — play, pause, seek,
volume, and fullscreen.

#### VID-6

Where a host surface embeds the player for an asset, while no
signed-in session is active, the player shall show a
sign-in-required state in place of playback and shall request no
media content.

### Asset Identity

#### VID-9

When an upload completes, the library shall assign the asset an
opaque identifier that is stable for the asset's lifetime and
independent of its title and file name; uploading identical
content twice shall create two distinct assets.

### Resolution

#### VID-14

Where a host surface holds a stored asset identifier, when the
host queries the library for that identifier, the library shall
report whether it resolves to a listed asset — unresolvable once
the asset is deleted.

## Internal Behavior

### Storage

#### VID-7

Where asset content is stored, it shall be stored privately: no
permanently valid public URL shall exist, and a direct request
for stored content without a valid access grant shall be denied
regardless of the requester's session state.

#### VID-8

While a playback request carries a session verified per
[AUTH-9](../identity/github-login.md#auth-9) and the embedding
host authorizes it ([VID-15](#vid-15)), when the player starts
playback, the server shall issue a short-lived access
grant scoped to that one asset and bounded by the configured
expiry; the server shall deny a playback request without a
verified session and any content request bearing an expired or
tampered grant.
Authorization is evaluated at issuance: an issued grant shall
stay redeemable until its expiry regardless of later session or
authorization changes — expiry is the only revocation of the
grant itself, and deleting the asset removes the content it
reaches ([VID-4](#vid-4)).

### Host Authorization

#### VID-15

Where a playback request targets an asset, the server shall
obtain from the embedding host its answer — whether that asset
is authorized for that requester — and shall issue an access
grant only on an affirmative answer; a request the host does
not authorize shall be denied, with no grant issued and no
content served.
Stored-content requests are governed by the grant alone
([VID-7](#vid-7), [VID-8](#vid-8)); the host is not re-asked at
redemption.

### Deletion Boundary

#### VID-10

When an asset is deleted, the library shall remove both its
record and its stored content, and shall not read or modify any
data a host surface keeps about the asset — what hosts stored
is theirs to reconcile.

### Asset Records

#### VID-16

Where asset records are kept — the identifier, title, size, and
upload date behind the library listing ([VID-4](#vid-4)) — they
shall live in the library's asset store, surviving restarts and
redeployments, and a deleted asset's record shall leave the
store with it ([VID-10](#vid-10)).

## Verification

### Upload Coverage

#### VID-11

Where an admin session drives the library against a storage test
double, the test suite shall assert: an accepted fixture file
uploads with visible progress and is then listed with its title
defaulted from the file name ([VID-1](#vid-1)); a wrong-format
file and an oversize file are refused with the violated limit
named, before any content request reaches the double
([VID-2](#vid-2)); and an interrupted upload leaves no listed
asset, with a retry starting from zero ([VID-3](#vid-3)).

### Access Coverage

#### VID-12

Where a fixture asset exists and the stub host authorizes it
for the signed-in session's requests, the test suite shall
assert: with that session, the embedded player obtains a grant
and the media element reaches the playing state
([VID-5](#vid-5)); with
no session, the player shows the sign-in-required state and no
media request is made ([VID-6](#vid-6)); a direct
playback-grant request with no session is denied, with no
grant issued ([VID-8](#vid-8)); and direct
stored-content requests without a grant ([VID-7](#vid-7)), with
an expired grant, and with a tampered grant are all denied even
with a signed-in session, while a grant issued before sign-out
still serves content until its expiry ([VID-8](#vid-8)); and a
request for an asset the stub host does not authorize is
denied, with no grant issued ([VID-15](#vid-15)).

### Identity and Deletion Coverage

#### VID-13

Where the same fixture content is uploaded twice and the stub
host authorizes both assets for the signed-in session's
requests, the test suite shall assert two assets exist with
distinct stable identifiers ([VID-9](#vid-9)); when the admin edits one asset's title, the
suite shall assert the list shows the new title with the asset's
size and upload date after a reload ([VID-4](#vid-4)), and that
the records survive a service restart under test control
([VID-16](#vid-16)); when one
asset is deleted after confirmation, the suite shall assert its
content is no longer served while the other still plays, that a
stub host's stored reference to the deleted asset remains unread
and unmodified by the library ([VID-10](#vid-10)), and that the
stub host's resolution query reports the deleted asset's
identifier unresolvable while the remaining asset's still
resolves ([VID-14](#vid-14)).
