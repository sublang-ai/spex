<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# VIDS: Video Library

## Intent

This package lets an authorized video manager upload and manage reusable private video assets and lets a signed-in viewer play an exact asset authorized by the host.
It owns the video library, stable video references, private asset content, and bounded playback grants, not sign-in, roles, host content, or host playback policy.
It can be reused unchanged with any management authorizer, playback authorizer, and private object service satisfying the meanings below.

## External Behavior

### VIDS-1

Where a video manager is allowed to upload, when the manager selects a non-empty MP4 or WebM file no larger than 1 GiB, the upload surface shall upload it while showing byte progress from zero through completion.
When the upload completes, the video library shall create exactly one listed asset with a stable opaque video ID, a title defaulted from the selected file name, its byte size, and its upload date.

### VIDS-2

When a selected file is not MP4 or WebM, is empty, or exceeds 1 GiB, the upload surface shall identify the violated format or size constraint before sending any file content and shall create no asset.

### VIDS-3

When an upload is interrupted by connection loss or by leaving the page, the video library shall list no partial asset and resolve no video reference for it.
When the manager retries, the upload surface shall start again at byte zero and shall reuse none of the earlier transfer.

### VIDS-4

Where a video manager is allowed to manage videos, when the manager opens the library, the video library shall list every asset by stable opaque video ID, title, byte size, and upload date, ordered by upload date newest first and then video ID.
When the manager edits an asset title, the video library shall preserve the accepted title without changing its video ID, content, size, or upload date.
Uploading the same file more than once shall create distinct assets with distinct video IDs.

### VIDS-5

When a trusted host requests video choices under accepted management authorization, the video library shall provide every listed asset as a chooser entry containing its title and a reusable reference naming only the `video` kind and stable opaque video ID.
When that chooser returns, the video library shall give the host either the exact reference selected from those offered entries or cancellation and shall reject a missing, altered, unoffered, or mismatched result without returning a reference.
When that host resolves a stored reference, the video library shall report the matching listed asset available with the same reference and title, or shall report it unavailable without exposing an object location.

### VIDS-6

Where a video manager is allowed to delete a video, when the manager selects delete, the video library shall ask for confirmation naming the asset title.
When the manager confirms, the video library shall remove the asset record and private content, omit it from subsequent lists and choices, and resolve its former reference as unavailable.
It shall neither find nor change a reference retained by a host.

### VIDS-7

Where a listed asset and playback authorization have been accepted under [VIDS-10](#vids-10) for the same signed-in account, request, and video ID, when playback is requested, the video library shall issue one transferable bearer scoped to that asset and expiring no later than five minutes after issuance.
The playback surface shall use that bearer to show the asset title and standard browser play, pause, seek, volume, and fullscreen controls.
Authorization shall be evaluated at grant issuance; a later sign-out or host-policy change alone shall not retract an issued bearer before expiry, and the package shall make no promise to retract bytes or responses already delivered or cached.

### VIDS-8

When the asset is absent, playback authorization is missing or denied, or a private-content request has a missing, tampered, expired, or wrong-asset bearer, the video library shall provide one generic unavailable state and shall disclose no private object location, authorization detail, or denial cause.

## Internal Behavior

### VIDS-9

When management authorization is supplied, the management-authorization intake shall accept only a fresh trusted decision naming the same signed-in account, exact request, and one exact library action: list, upload, rename, choose, or delete, with the video ID when the action targets an asset.
It shall reject missing, denied, stale, mismatched, or browser-supplied decisions and shall start no upload and reveal or change no asset after rejection.

### VIDS-10

When playback authorization is supplied, the playback-authorization intake shall accept only a fresh trusted host decision naming the same signed-in account, exact grant request, and exact listed video ID.
It shall reject missing, denied, stale, signed-out, mismatched, or browser-supplied decisions and shall issue no bearer after rejection.

### VIDS-11

When a private object service is supplied, the object-service intake shall accept only an environment-scoped service that keeps every object private, accepts a complete MP4 or WebM object with observable byte progress, reads and deletes one exact object, and redeems an asset-scoped bearer only before its bounded expiry.
It shall reject a public, cross-environment, arbitrary-object, overwrite-broadening, permanently public, or bearer-bypassing service and shall expose no service credential or private object location to general page data or logs.

### VIDS-12

When upload content becomes a listed asset, the asset registry shall associate one stable video ID with exactly one complete private object and shall expose neither the record nor its reference before the complete object is accepted.
When deletion is confirmed under [VIDS-9](#vids-9), the registry and object boundary shall remove that exact record and object and shall not report deletion complete while either remains available, without reading or changing any host data.
When a bearer issued under [VIDS-7](#vids-7) is redeemed, the object boundary shall authorize by its asset scope, integrity, and expiry and shall not recheck the issuing account, session, or host policy.

## Verification

### VIDS-13

Where an authorized-manager fixture and private object-service double contain accepted, wrong-format, empty, oversized, duplicate, interrupted, renamed, and deletable files and chooser results include exact selection, cancellation, missing, altered, unoffered, and mismatched values, when upload, retry, listing, chooser, resolution, rename, and confirmed deletion are exercised, the contract suite shall assert the [accepted upload, visible progress, stable identity, default title, size, and date](#vids-1); [pre-transfer rejection](#vids-2); [absence of partial assets and byte-zero retry](#vids-3); [stable ordered library and distinct duplicate identities](#vids-4); [opaque offered references, exact selection or cancellation, rejection of every invalid chooser result, and reference resolution](#vids-5); and [record-and-content deletion without host-reference mutation](#vids-6).
At the package boundaries, it shall also assert [exact trusted management authorization](#vids-9), [complete-object-only registry visibility and complete exact deletion](#vids-12), and rejection of every [private object service](#vids-11) that weakens the declared privacy, scope, or expiry meanings.

### VIDS-14

Where a ready fixture asset, clock-controlled playback authorizer, and private object-service double exist, when allowed, missing, denied, stale, signed-out, wrong-account, wrong-request, wrong-asset, browser-supplied, tampered-bearer, and expired-bearer cases are exercised, the contract suite shall assert [issuance only after fresh exact playback authorization, the standard player, asset scope, transferability, five-minute maximum lifetime, and issuance-time policy boundary](#vids-7); the [single generic unavailable state without private detail](#vids-8); and the [complete trusted playback-authorization intake](#vids-10).
It shall assert that a later sign-out or host-policy change prevents a new grant but does not by itself invalidate an unexpired issued bearer, that redemption performs no session or policy recheck under [VIDS-12](#vids-12), and that delivered or cached bytes carry no retraction guarantee.
