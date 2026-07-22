<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# VIDS: Supabase Video Library

## Intent

This package uses private Supabase Storage and direct resumable browser uploads to accept browser-playable videos, produce reusable video references, and deliver private playback to authorized viewers.
It remains independent of course structure and does not own authentication, authorization policy, transcoding, DRM, or viewing progress.
It can be reused unchanged by Supabase applications accepting its media, upload, and bearer-playback contract.
Each installation declares the version-pinned browser matrix on which every accepted media profile must pass package verification.

## External Behavior

### VIDS-1

Where a video manager has permission to upload, when the manager selects a file no larger than 1 GiB using MP4 with H.264 video and optional AAC-LC audio or WebM with VP8 or VP9 video and optional Vorbis or Opus audio, and supplies a label, the upload surface shall start one exact resumable attempt, show its label, expected size, uploaded bytes, current state, and remaining resume window, and allow an interrupted upload to resume for up to 24 hours or be canceled [[2]][[5]].

### VIDS-2

When a selected file has a container or codec profile outside [VIDS-1](#vids-1), exceeds 1 GiB, is empty, has no positive duration or dimensions, cannot be decoded by the video manager's browser, or cannot be read completely, the upload surface shall identify the violated constraint during local preflight or final Storage-metadata checks, create no ready asset, and allow another file to be selected.

### VIDS-3

When an accepted upload completes and is verified, the video library shall mark one video ready, show its stable label, and offer that exact ready video wherever the manager opens the library's content chooser.
When a failed or interrupted attempt is retried successfully, the video library shall still show exactly one ready video for that intended upload.

### VIDS-4

Where an authenticated viewer is allowed to watch a ready video, when the viewer opens it, the playback surface shall show its label and native play, pause, seek, volume, fullscreen, and captions controls supported by the source file, and shall distinguish loading, playing, ended, and retryable failure states.

### VIDS-5

While an allowed viewer remains authenticated, when the video's authorization window expires, the playback surface shall request fresh access for that same video and resume from the viewer's last local position when fresh authorization is granted for that exact video version.
When refreshed access is denied, the playback surface shall stop playback and show a plain unavailable state without video or denial detail.

### VIDS-6

When a visitor, denied account, missing authorization, unready video, wrong video version, or unsigned private-file request attempts playback, the video library shall show the same plain unavailable state and disclose neither private file location, video metadata, nor the denial cause.

### VIDS-7

Where a video manager has permission to manage videos, when the manager opens the video library or a content chooser, the video library shall list every managed video by stable label and `uploading`, `ready`, `failed`, or `unavailable` state, offer only ready videos for attachment, and reveal no private object location.

### VIDS-8

Where a signed-in account lacks video-management permission, when that account requests an upload or asset-management action directly, the upload surface shall start no transfer, create or change no asset, and report that video-management access is required.

### VIDS-9

Where a viewer is watching a video, when its five-minute authorization window ends, the playback surface shall stop loading with that access and resume only after fresh authorization for the same exact video.
When the viewer signs out, the playback surface shall stop playback, request no renewal, and show the plain unavailable state; it shall not tell the viewer that expiry or sign-out erases video data already delivered to the browser.

### VIDS-10

When an intended upload is first authorized, the asset registry shall reserve an opaque asset ID at revision `1` for its owner account.
When an initial or retry attempt is authorized for that asset, it shall reserve a new opaque attempt ID, expected byte size, accepted [VIDS-1](#vids-1) media profile and positive local-preflight result, and unique immutable private object identity while preserving the asset ID.
The asset registry shall change the asset to `ready` only after TUS completion and Storage metadata confirm the exact reserved object, expected byte size, and accepted MIME container and the owner finalizes the declared profile; it shall produce no reusable content reference from incomplete or mismatched metadata or bytes.
Each ready asset shall make a reusable content reference naming only the `video` kind, opaque asset ID, and immutable asset revision.
A content description shall add a stable descriptor ID, stable label, and `uploading`, `ready`, `failed`, or `unavailable` state without a storage location; it shall carry the complete reference while ready and after a formerly ready asset becomes unavailable, and may omit a reference while uploading or failed.
Every newly selected upload shall create a distinct asset at revision `1`; retrying the same intended upload shall preserve its asset identity, while replacing a ready asset or creating a later asset revision is outside this package version.
Where video-management authorization has been accepted under [VIDS-19](#vids-19), when a trusted content consumer requests chooser descriptions for that same active account and exact request, the asset registry shall return the complete managed descriptor set associated with that account and request in stable-label then descriptor-ID order.
When the same trusted consumer requests status for one complete reference, the asset registry shall return only a description associated with that account and request and carrying that exact reference in `ready` or `unavailable` state, or shall report it unavailable; it shall not substitute an uploading, failed, different-asset, or different-revision description.

### VIDS-11

Where a ready asset and playback authorization have been accepted under [VIDS-18](#vids-18) for its exact revision, when a playback grant is requested in that same request, the grant boundary shall consume the authorization once and issue a bearer location scoped only to that asset revision with nominal expiry no later than five minutes.
The grant boundary shall treat redemption as transferable bearer access and shall not claim that Storage rechecks the issuing account or session.
The grant boundary shall reject a browser-supplied value, replayed or expired authorization, mismatched account or asset, or inactive account context and shall never sign in the browser.
An issued signed response or already transferred bytes may remain available from browser or intermediary cache beyond the application's control [[1]][[4]].

### VIDS-12

Where video-management authorization has been accepted under [VIDS-19](#vids-19) for the active account and a new attempt, when the upload boundary creates it, the upload boundary shall issue a two-hour signed upload token for only the reserved bucket and new immutable object identity with overwrite disabled [[2]][[6]].
The upload boundary shall treat that token as a transferable bearer: any holder may use it during those two hours to create a TUS upload URL only for the reserved path, and the resulting upload URL is a separate bearer that permits chunks and resumption for that upload for up to 24 hours.
When upload bytes are transferred, the upload boundary shall send them directly to private Supabase Storage and shall not relay the bytes through the web application host.
It shall rely on exact-path/no-upsert scope rather than holder identity during transfer; a captured bearer may place bytes only at the reserved path, but it shall confer no right to finalize the attempt or make an asset ready.

### VIDS-13

When a reusable content reference, content description, asset status, playback failure, general page value, persisted client value, or diagnostic event is produced, the video library shall use opaque asset identity and shall not reveal a private bucket path, signed URL, service credential, or provider error containing one.
The active authorized upload request may transiently expose its opaque reserved path, signed token, bucket metadata, and TUS URL to the uploading browser, and the active playback surface may transiently expose its bearer request; neither exception shall be displayed, persisted as application state, or logged.

## Internal Behavior

### VIDS-15

Where video-management authorization has been accepted under [VIDS-19](#vids-19), when upload completion is finalized, the asset registry shall verify that account as the exact attempt owner together with the reserved bucket, immutable key, object identity, byte size, media result, and previously unused asset revision, and then perform one atomic `ready` transition.
It shall make repeated or parallel finalization idempotent, reject completion after cancellation or expiry, and prevent any mismatched or already-used object from becoming ready.

### VIDS-17

When a trusted storage-availability observation reports a formerly ready exact asset revision `missing`, `unreadable`, or `mismatched`, the asset registry shall change that revision to `unavailable`, preserve its content reference and prior label so an existing attachment can report the unavailable state, omit it from new attachment choices, issue no new playback grant, and preserve its asset identity.
When a later trusted observation confirms the same immutable object and matching complete metadata, the asset registry shall restore that exact revision to `ready` without creating a new asset or revision; it shall not change lifecycle state from a transient player or network failure.

### VIDS-14

When storage is read or changed, the storage boundary shall keep the bucket private and authorize the operation only through the exact upload capability, exact playback bearer grant, or named privileged finalization/cleanup operation [[3]].
It shall treat signed URL redemption as bearer authorization rather than an identity, session, or role recheck, use no service-role client for ordinary browser requests, and keep every privileged credential outside browser-visible state.

### VIDS-16

Where video-management authorization has been accepted under [VIDS-19](#vids-19) for the active account, exact owned attempt, request, and cancellation operation, when that upload is canceled, the asset registry shall make the attempt non-finalizable and the storage boundary shall schedule cleanup for any completed orphan object that is not the object of a ready asset.
When an upload fails or passes its 24-hour resume window, the asset registry shall make the attempt non-finalizable and the storage boundary shall schedule the same cleanup without requiring a user cancellation request.
Where a canceled or failed TUS upload has produced a complete orphan object, the storage boundary shall remove that object within one hour of detecting it and shall not remove or overwrite a ready asset.
Where the provider still holds incomplete TUS chunks, the storage boundary shall rely on expiry of the provider-managed upload URL and shall make no promise of an application deletion mechanism or immediate physical-byte reclamation.

### VIDS-18

When playback authorization is supplied, the authorization intake shall accept only a fresh opaque single-use allow value from a trusted server source associated with the same active account, exact request, content kind, asset ID, and immutable asset revision.
It shall reject a browser-supplied, replayed, expired, inactive-account, wrong-kind, wrong-asset, wrong-revision, or cross-request value and shall reveal no reason beyond the package's unavailable outcome.

### VIDS-19

When video-management authorization is supplied, the authorization intake shall accept only a fresh trusted server decision associated with the same active account, exact request, and exact managed-content listing or lookup, new upload attempt, owned cancellation operation, or owned finalization operation.
It shall reject browser-supplied, stale, denied, inactive-account, wrong-owner, or cross-request evidence and shall start no transfer or lifecycle transition after rejection.

### VIDS-25

When an object service is supplied, the storage-service intake shall accept only an environment-scoped private bucket that supports new immutable exact-path creation with overwrite disabled, resumable TUS transfer for the declared window, complete object-metadata observation, bounded signed bearer download, exact-object deletion, and observation of missing, unreadable, and mismatched objects.
It shall reject a public, cross-environment, globally privileged, arbitrary-path, overwrite-capable, or metadata-incomplete service and shall treat provider expiry of incomplete TUS chunks separately from deletion of a completed orphan object.

## Verification

### VIDS-20

Where storage is replaced by a controllable resumable-upload and availability fixture and representative profiles are exercised in the installation's declared version-pinned browser matrix, when supported and unsupported declarations and local decode, oversized, empty, interrupted, two-hour-token expiry, 24-hour-upload-URL expiry, allowed cancellation, denied or cross-owner cancellation, arbitrary-path, overwrite, captured-bearer, parallel-finalization, mismatched-object, completed-orphan cleanup, incomplete-chunk provider expiry, successful retry, trusted missing, mismatched, and recovered-object observations, and transient player failures are run and the library is reopened, the contract suite shall assert the [accepted media profiles, visible attempt state, and 24-hour resumption](#vids-1), the [specific preflight or metadata rejection with no ready asset](#vids-2), and [exactly one labeled ready video after completion or retry](#vids-3).
It shall assert the [complete redacted, ordered descriptor list with only ready items attachable](#vids-7); [stable asset identity, exact attempt and object reservations, revision-1 reference, matching completion metadata, and status lookup behavior](#vids-10); the [two bearer stages, direct exact-path TUS transfer, overwrite prevention, and absence of finalization authority](#vids-12); and an [atomic, owner-bound, idempotent ready transition that rejects cancellation, expiry, mismatch, and reuse](#vids-15).
It shall also assert [cancellation only with fresh exact-owner authorization, non-finalizable failed or expired attempts, the one-hour completed-orphan cleanup, and no incomplete-byte deletion promise](#vids-16); [exact `ready`/`unavailable`/`ready` transitions only from trusted object observations without identity or revision change](#vids-17); [no transfer or lifecycle transition after rejected management authorization](#vids-19); and [rejection of any object service lacking the required private, environment-scoped, immutable-path, resumable, observable, signed-download, and deletion capabilities](#vids-25).
When that matrix completes, the contract evidence shall name every exact browser and version exercised.

### VIDS-21

Where a ready fixture video and clock-controlled asset-authorization authority exist, when playback, nominal expiry, allowed renewal, authorization replay, account-context or asset mismatch, authorization withdrawal, an authorization naming a different or unsupported revision, sign-out with an inactive-but-unexpired authority credential, cross-account bearer redemption, and cached-byte cases are run, the contract suite shall assert the [labeled native player controls and visible lifecycle states](#vids-4); [fresh exact-version renewal with local-position restoration or a plain stopped unavailable state](#vids-5); and [stopped loading after expiry, no renewal after sign-out, and no promise to erase delivered bytes](#vids-9).
At the trust boundary, it shall assert [acceptance only of a fresh single-use exact-account, request, kind, asset, and revision authorization](#vids-18), followed by a [single exact-revision bearer grant with nominal lifetime no greater than five minutes, transferable redemption without identity recheck, and no claim over cached bytes](#vids-11).

### VIDS-22

Where private storage contains ready and incomplete assets, when anonymous, denied, stale-revision, unsigned, and allowed exact playback requests plus denied and authorized upload and asset-management actions are made, the contract suite shall assert the [same redacted unavailable state without private location, metadata, or denial detail](#vids-6); [no transfer or asset mutation after denied management access](#vids-8); and [private storage access only through the exact upload capability, playback bearer, or authorized named privileged operation](#vids-14).
It shall find [bearer and path data only in the transient active authorized upload or player request and no path, signing material, service credential, or provider error in general responses, persisted browser state, or logs](#vids-13).

### VIDS-23

Where public-client and privileged-client fixtures exercise every video-registry and Storage operation with absent, untrusted, inactive, mismatched, denied, and allowed account contexts plus bearer-grant, signed-upload-token, TUS-URL, and named privileged-operation callers, when direct requests are made, the contract suite shall assert the [single-use scoped playback-grant contract and transferable redemption](#vids-11), the [exact-path upload bearer contract without finalization authority](#vids-12), [private storage with only enumerated access paths and no ordinary service-role client](#vids-14), and [privileged finalization constrained to the exact previously authorized owner attempt](#vids-15).

## References

[1]: https://supabase.com/docs/guides/storage/serving/downloads "Supabase: Serving Storage assets"
[2]: https://supabase.com/docs/guides/storage/uploads/resumable-uploads "Supabase: Resumable Uploads"
[3]: https://supabase.com/docs/guides/storage/security/access-control "Supabase: Storage access control"
[4]: https://supabase.com/docs/guides/storage/cdn/smart-cdn "Supabase: Smart CDN"
[5]: https://supabase.com/docs/guides/storage/uploads/file-limits "Supabase: Storage file limits"
[6]: https://supabase.com/docs/reference/javascript/file-buckets-createsigneduploadurl "Supabase: Create a signed upload URL"
