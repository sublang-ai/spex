<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# video-library: Video Library

## Intent

This spec covers protected video assets: admin upload, the library listing, deletion, reference resolution, and playback gated by short-lived access grants.
The package has no notion of what its assets illustrate: host surfaces embed its picker and player, and what a stored reference means to the host is the host's business.

## External Behavior

### Upload

#### video-library-1

Where the library is designated admin-only [[access-control-4](../identity/access-control.md#access-control-4)], when the admin selects a video file matching the accepted profile — MP4 container with H.264 video, and AAC audio where an audio track is present — within the configured size cap, the library shall upload it, showing progress until completion, and then list the asset with its title defaulted from the file name.

#### video-library-2

When the selected file misses the accepted profile — a wrong container or an unsupported codec inside it — or its size exceeds the configured cap, the library shall refuse before any content is uploaded, naming the violated constraint.

#### video-library-3

When an upload is interrupted — connection loss or leaving the page — the library shall recover to a clean state: no partial asset is listed, and a retry starts the upload from the beginning.

### The Library

#### video-library-4

The library shall list each asset with an editable title, its size, and its upload date, each entry with a delete action.

#### video-library-5

When the admin confirms an asset's deletion, the asset shall leave the list, with its content no longer served.

### Playback

#### video-library-6

Where a host surface embeds the player for an asset and the host authorizes that asset for the requester [[video-library-11](#video-library-11)], while a signed-in session is active [[github-login-2](../identity/github-login.md#github-login-2)], the player shall stream the asset with standard controls — play, pause, seek, volume, and fullscreen.

#### video-library-7

Where a host surface embeds the player for an asset, while no signed-in session is active, the player shall show a sign-in-required state in place of playback and shall request no media content.

### Asset Identity

#### video-library-8

When an upload completes, the library shall assign the asset an opaque identifier that is stable for the asset's lifetime and independent of its title and file name — identical content uploaded twice yielding two distinct assets.

### Deletion Boundary

#### video-library-9

When an asset is deleted, the library shall remove both its record and its stored content, and shall not read or modify any data a host surface keeps about the asset — what hosts stored is theirs to reconcile.

### Resolution

#### video-library-10

Where a host surface holds a stored asset identifier, when the host queries the library for that identifier, the library shall report whether it resolves to a listed asset — unresolvable once the asset is deleted.

### Host Authorization

#### video-library-11

Where a playback request targets an asset, the server shall obtain from the embedding host its answer — whether that asset is authorized for that requester — and issue an access grant only on an affirmative answer:

- a request the host does not authorize is denied, with no grant issued and no content served;
- stored-content requests stay governed by the grant alone [[video-library-12](#video-library-12)] [[video-library-14](#video-library-14)], the host not re-asked at redemption.

## Internal Behavior

### Storage

#### video-library-12

Where the content store holds asset content, it shall hold it privately: no permanently valid public URL exists, and a direct request for stored content without a valid access grant is denied regardless of the requester's session state.

#### video-library-13

Where the embedding host authorizes the asset for the requester [[video-library-11](#video-library-11)] and sessions are verified server-side [[github-login-10](../identity/github-login.md#github-login-10)], when the player starts playback, the server shall decide the request on its session:

| Playback request | Outcome |
| --- | --- |
| carries a verified session | the deployment's grant mechanism issues a short-lived access grant scoped to that one asset and bounded by the configured expiry |
| carries no verified session | the request is denied, with no grant issued |

#### video-library-14

An issued grant shall stay redeemable until its expiry regardless of later session or authorization changes — authorization is evaluated at issuance, expiry is the only revocation of the grant itself, and deleting the asset removes the content it reaches [[video-library-5](#video-library-5)].

### Asset Records

#### video-library-15

Where asset records are kept — the identifier, title, size, and upload date behind the library listing [[video-library-4](#video-library-4)] — they shall live in the library's asset store, surviving restarts and redeployments.

- A deleted asset's record leaves the store with it [[video-library-9](#video-library-9)].

## Verification

### Upload Coverage

#### video-library-16

Where an admin session drives the library against a storage test double, the test suite shall assert:

- an accepted fixture file uploads with visible progress and is then listed with its title defaulted from the file name ([[video-library-1](#video-library-1)]);
- a wrong-container file, an MP4 carrying an unsupported codec, and an oversize file are each refused with the violated constraint named, before any content request reaches the double ([[video-library-2](#video-library-2)]);
- an interrupted upload leaves no listed asset, with a retry starting from zero ([[video-library-3](#video-library-3)]).

### Access Coverage

#### video-library-17

Where a fixture asset exists and the stub host authorizes it for every request — so a denial can only be the session gate — the test suite shall assert:

- with a signed-in session, the embedded player obtains a grant and the media element reaches the playing state ([[video-library-6](#video-library-6)]);
- with no session, the player shows the sign-in-required state and no media request is made ([[video-library-7](#video-library-7)]);
- a direct playback-grant request with no session is denied, with no grant issued ([[video-library-13](#video-library-13)]);
- direct stored-content requests without a grant ([[video-library-12](#video-library-12)]), with an expired grant, and with a tampered grant are all denied even with a signed-in session, while a grant issued before sign-out still serves content until its expiry ([[video-library-14](#video-library-14)]);
- a request for an asset the stub host does not authorize is denied, with no grant issued ([[video-library-11](#video-library-11)]).

### Identity and Deletion Coverage

#### video-library-18

Where the same fixture content is uploaded twice and the stub host authorizes both assets for the signed-in session's requests, the test suite shall assert:

- two assets exist with distinct stable identifiers ([[video-library-8](#video-library-8)]);
- when the admin edits one asset's title, the list shows the new title with the asset's size and upload date after a reload ([[video-library-4](#video-library-4)]), and the records survive a service restart under test control ([[video-library-15](#video-library-15)]);
- when one asset is deleted after confirmation, it leaves the list and its content is no longer served while the other still plays ([[video-library-5](#video-library-5)]), a stub host's stored reference to the deleted asset remains unread and unmodified by the library ([[video-library-9](#video-library-9)]), and the stub host's resolution query reports the deleted asset's identifier unresolvable while the remaining asset's still resolves ([[video-library-10](#video-library-10)]).
