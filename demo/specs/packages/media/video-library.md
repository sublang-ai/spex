<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# VIDS: Video Library

## Intent

This package accepts authorized browser-playable video uploads, produces reusable video references, and delivers private playback to exactly entitled members.
It follows the private-storage and direct-upload choices in [DR-001](../../decisions/001-web-platform.md) and remains independent of course structure.


## External Behavior

### VIDS-1

Where an administrator has `video.manage` capability, when the administrator selects a supported MP4 or WebM file no larger than 1 GiB and supplies a label, the upload surface shall start one exact resumable attempt, provide `UploadView` with byte progress and current state, and allow an interrupted upload to resume for up to 24 hours or be canceled [[2]][[5]].

### VIDS-2

When a selected file has another declared container or codec profile, exceeds 1 GiB, is empty, has no positive duration/dimensions, cannot be decoded by the administrator's browser, or cannot be read completely, the upload surface shall identify the violated constraint during local preflight or final Storage-metadata checks, create no ready asset, and allow another file to be selected.

### VIDS-3

When an accepted upload completes and is verified, the video library shall mark one video ready and make its `ContentDescriptor`, stable label, and `VideoRef` available for host content attachment.
When a failed or interrupted attempt is retried successfully, the video library shall still expose exactly one ready asset for that intended upload.

### VIDS-4

Where an authenticated member is allowed to watch a ready video, when the member opens it, the playback surface shall provide `PlaybackView` with its label and native play, pause, seek, volume, fullscreen, and captions controls supported by the source file, and shall distinguish loading, playing, ended, and retryable failure states.
It shall use the bounded bearer location only in the active player request and shall not display it, persist it as viewing state, or include it in general page data or diagnostics.

### VIDS-5

While an allowed member remains authenticated, when the video's authorization window expires, the playback surface shall request fresh access for that same video and resume from the member's last local position when the host supplies a new exact asset authorization.
When refreshed access is denied, the playback surface shall stop playback and provide `VideoUnavailableResult`.

### VIDS-6

When a visitor, denied member, missing entitlement, unready asset, wrong asset revision, or unsigned private object request attempts playback, the video library shall disclose neither object location nor video metadata and shall return `VideoUnavailableResult`.

### VIDS-7

Where an administrator has `video.manage` capability, when the administrator opens the video library or a host content chooser, the video library shall provide `VideoLibraryView` listing every managed video by stable label and `uploading`, `ready`, `failed`, or `unavailable` state, offer only ready videos for attachment, and reveal no private object location.

### VIDS-8

Where a signed-in account is denied `video.manage` capability, when that account requests an upload or asset-management action directly, the upload surface shall start no transfer, create or change no asset, and report that administrator access is required.

### VIDS-9

Where a member receives a playback grant, when its nominal authorization window reaches five minutes or the member signs out, the playback surface shall request no further bytes with that grant and the video library shall issue no renewal without a new exact `AssetPlaybackAuthorization`.
The playback surface shall make no promise to erase bytes already transferred or cached, to hide the active bearer request from browser developer tools, to prevent another bearer holder from redeeming it, or to revoke a response retained by an intermediary cache.

## Internal Behavior

### VIDS-10

When an intended upload is first authorized, the asset registry shall reserve an opaque asset ID at revision `1` for its owner account.
When an initial or retry attempt is authorized for that asset, it shall reserve a new opaque attempt ID, expected byte size, declared media profile and positive local-preflight result, and unique immutable private object identity while preserving the asset ID.
The asset registry shall change the asset to `ready` only after TUS completion and Storage metadata confirm the exact reserved object, expected byte size, and accepted MIME container and the owner finalizes the declared profile; it shall produce no `VideoRef` from incomplete or mismatched metadata or bytes.

### VIDS-11

Where a ready asset and a fresh opaque `AssetPlaybackAuthorization` are supplied through the trusted server binding, when a playback grant is requested in that same request, the grant boundary shall consume the authorization once, bind its issuance record to the exact `DataRoleProjection`, and issue a bearer location scoped only to the exact asset/revision and nominal expiry no later than five minutes.
The grant boundary shall treat redemption as transferable bearer access and shall not claim that Storage rechecks the issuing account or session.
The grant boundary shall reject a serialized browser value, replayed or expired authorization, mismatched projection/asset, or inactive data-role projection and shall never sign in the browser.
An issued signed response or already transferred bytes may remain available from browser or intermediary cache beyond the application's control [[1]][[4]].

### VIDS-12

Where a fresh `AuthorizationDecision` for `video.manage` and matching `DataRoleProjection` allow a new attempt, when the upload boundary creates it, the upload boundary shall issue a two-hour signed upload token for only the reserved bucket and new immutable object identity with overwrite disabled [[2]][[6]].
The upload boundary shall treat that token as a transferable bearer: any holder may use it during those two hours to create a TUS upload URL only for the reserved path, and the resulting upload URL is a separate bearer that permits chunks and resumption for that upload for up to 24 hours.
When upload bytes are transferred, the upload boundary shall send them directly to private Supabase Storage and shall not relay the bytes through the web application host.
It shall rely on exact-path/no-upsert scope rather than holder identity during transfer; a captured bearer may place bytes only at the reserved path, but it shall confer no right to finalize the attempt or make an asset ready.

### VIDS-13

When a `VideoRef`, content descriptor, asset status, playback failure, general page value, persisted client value, or diagnostic event is produced, the video library shall use opaque asset identity and shall not reveal a private bucket path, signed URL, service credential, or provider error containing one.
The active authorized upload request may transiently expose its opaque reserved path, signed token, bucket metadata, and TUS URL to the uploading browser, and the active playback surface may transiently expose its bearer request; neither exception shall be displayed, persisted as application state, or logged.

### VIDS-14

When storage is read or changed, the storage boundary shall keep the bucket private and authorize the operation only through the exact upload capability, exact playback bearer grant, or named privileged finalization/cleanup operation [[3]].
It shall treat signed URL redemption as bearer authorization rather than a member role check, use no service-role client for ordinary browser requests, and keep every privileged credential outside browser-visible state.

### VIDS-15

When upload completion is finalized, the asset registry shall require a fresh allowed `AuthorizationDecision` for `video.manage` and matching trusted `DataRoleProjection`, verify its account as the exact active attempt owner together with the reserved bucket, immutable key, object identity, byte size, media result, and previously unused asset revision, and then perform one atomic `ready` transition.
It shall make repeated or parallel finalization idempotent, reject completion after cancellation or expiry, and prevent any mismatched or already-used object from becoming ready.

### VIDS-16

When an upload is canceled, fails, or passes its 24-hour resume window, the asset registry shall make the attempt non-finalizable and the storage boundary shall schedule cleanup for any completed orphan object that is not the object of a ready asset.
Where a canceled or failed TUS upload has produced a complete orphan object, the storage boundary shall remove that object within one hour of detecting it and shall not remove or overwrite a ready asset.
Where the provider still holds incomplete TUS chunks, the storage boundary shall rely on expiry of the provider-managed upload URL and shall make no promise of an application deletion mechanism or immediate physical-byte reclamation.

### VIDS-17

When a trusted `AssetAvailabilityObservation` reports a formerly ready exact asset revision `missing`, `unreadable`, or `mismatched`, the asset registry shall change that revision to `unavailable`, withhold its `VideoRef` from new attachment and its `PlaybackGrant` from new playback, and preserve its asset identity and prior label.
When a later trusted observation confirms the same immutable object and matching complete metadata, the asset registry shall restore that exact revision to `ready` without creating a new asset or revision; it shall not change lifecycle state from a transient player or network failure.

## Verification

### VIDS-20
Verifies: [VIDS-1](#vids-1), [VIDS-2](#vids-2), [VIDS-3](#vids-3), [VIDS-7](#vids-7), [VIDS-10](#vids-10), [VIDS-12](#vids-12), [VIDS-15](#vids-15), [VIDS-16](#vids-16), [VIDS-17](#vids-17)

Where storage is replaced by a controllable resumable-upload and availability fixture and representative profiles are exercised in the version-pinned browser matrix, when supported/unsupported declarations and local decode, oversized, empty, interrupted, two-hour-token expiry, 24-hour-upload-URL expiry, canceled, arbitrary-path, overwrite, captured-bearer, parallel-finalization, mismatched-object, completed-orphan cleanup, incomplete-chunk provider expiry, successful retry, trusted missing/mismatched/recovered-object observations, and transient player failures are run and the library is reopened, the contract suite shall assert visible progress and stated administrator preflight, direct exact-path transfer, bearer transferability without finalization authority, 24-hour TUS resumption, the one-hour completed-orphan SLA without an incomplete-byte deletion promise, exact `ready`/`unavailable`/`ready` transitions only from trusted observations, no identity/revision change on recovery, a complete redacted descriptor list, and exactly one revision-1 attachable video only while complete matching Storage metadata is confirmed.

### VIDS-21
Verifies: [VIDS-4](#vids-4), [VIDS-5](#vids-5), [VIDS-9](#vids-9), [VIDS-11](#vids-11)

Where a ready fixture video and clock-controlled asset-authorization authority exist, when playback, nominal expiry, allowed renewal, authorization replay, projection/asset mismatch, authorization withdrawal, asset-revision replacement, sign-out with an inactive-but-unexpired authority credential, cross-account bearer redemption, and cached-byte cases are run, the contract suite shall assert the visible player states, a nominal grant lifetime no greater than five minutes, position restoration only after a fresh exact authorization, no new issuance after access loss, accepted exact-scope bearer redemption without identity recheck, and no claim that already transferred or cached bytes are erased.

### VIDS-22
Verifies: [VIDS-6](#vids-6), [VIDS-8](#vids-8), [VIDS-13](#vids-13), [VIDS-14](#vids-14)

Where private storage contains ready and incomplete assets, when anonymous, denied, stale-revision, unsigned, and allowed exact playback requests plus denied and authorized upload and asset-management actions are made, the contract suite shall allow only the exact entitled playback and exact authorized upload, start no denied transfer or mutation, find bearer/path data only in the active authorized upload and player requests, and find no path, signing material, or service credential in general responses, persisted browser state, or captured logs.

### VIDS-23
Verifies: [VIDS-14](#vids-14), [VIDS-15](#vids-15)

Where public-client and privileged-client fixtures exercise every video-registry and Storage operation with absent, untrusted, inactive, mismatched, member, and administrator `DataRoleProjection` values plus bearer-grant, signed-upload-token, TUS-URL, and named privileged-operation callers, when direct requests are made, the contract suite shall match the host data-access matrix, reject every browser-supplied projection or decision, acknowledge bearer transferability within exact scope, and constrain privileged finalization and cleanup to the exact previously authorized owner attempt.

## References

[1]: https://supabase.com/docs/guides/storage/serving/downloads "Supabase: Serving Storage assets"
[2]: https://supabase.com/docs/guides/storage/uploads/resumable-uploads "Supabase: Resumable Uploads"
[3]: https://supabase.com/docs/guides/storage/security/access-control "Supabase: Storage access control"
[4]: https://supabase.com/docs/guides/storage/cdn/smart-cdn "Supabase: Smart CDN"
[5]: https://supabase.com/docs/guides/storage/uploads/file-limits "Supabase: Storage file limits"
[6]: https://supabase.com/docs/reference/javascript/file-buckets-createsigneduploadurl "Supabase: Create a signed upload URL"

## Binding

### VIDS-0

| Field | Contract |
| --- | --- |
| Human users | visitors or denied accounts requesting video; administrators managing video; authenticated members with an exact playback entitlement |
| Owns | video library, `VideoLibraryView`, upload surface and boundary, `UploadView`, bearer upload token and TUS upload URL, upload attempt/capability/progress, `VideoAsset`, asset registry and lifecycle, `VideoRef`, `ContentDescriptor`, grant and storage boundaries, private `PlaybackGrant`, playback surface, `PlaybackView`, `VideoUnavailableResult`, playback failures |
| Receives | fresh server-only `AuthorizationDecision` for `video.manage`; matching trusted server-only `DataRoleProjection`; selected file and label; opaque single-use `AssetPlaybackAuthorization` produced for the exact data-role projection, asset, and revision in the current request; trusted exact-revision `AssetAvailabilityObservation` from the storage boundary |
| Provides | `UploadView`; `VideoLibraryView`; `ContentDescriptor`; `VideoRef`; `PlaybackView`; `VideoUnavailableResult`; bearer `PlaybackGrant` nominally expiring in at most five minutes for an exact ready revision |
| Excludes | courses, syllabus positions, catalog publication, identity, roles, transcoding, DRM, viewing progress |
| Reuse | public-package candidate for Supabase Storage hosts; any host can supply management authorization and a request-scoped asset playback authorization without exposing its own domain model |

The provided and received contracts are:

| Contract | Meaning |
| --- | --- |
| `VideoRef` | `{ kind: video, assetId, assetRevision }` created for one immutable ready asset revision and retained if that revision later becomes unavailable |
| `ContentDescriptor` | `{ descriptorId, label, lifecycleState, contentRef? }` with no object location; `contentRef`, when present, is this package's `VideoRef`, is present for `ready` and formerly ready `unavailable` assets, and may be absent for `uploading` or `failed` attempts |
| `UploadView` | selected label, expected size, resumable byte progress, remaining resume window, and lifecycle/failure state with no persisted bearer credential |
| `VideoLibraryView` | managed asset IDs, stable labels, revisions, and lifecycle states, with only ready `VideoRef` values attachable |
| `AssetPlaybackAuthorization` | opaque single-use trusted-server value bound to one `DataRoleProjection`, current request, asset ID, and asset revision |
| `PlaybackGrant` | transferable bearer location scoped to one exact object revision and nominal expiry; it contains no reusable entitlement |
| `PlaybackView` | label, player/control state, local position, and `loading`, `playing`, `ended`, `retryable-failure`, or `unavailable` state; it contains no displayed or persisted object location |
| `VideoUnavailableResult` | `{ kind: unavailable }` with no asset, revision, object, authorization, or denial-cause metadata |
| `AssetAvailabilityObservation` | trusted server-only result for one exact ready asset revision: matching complete private-object metadata, or `missing`, `unreadable`, or `mismatched`; a transient player/network error is not this contract |

An asset moves through these states:

| State | Meaning |
| --- | --- |
| `uploading` | bytes may be incomplete and no `VideoRef` is available |
| `ready` | the complete private object and matching metadata are available |
| `failed` | validation, cancellation, or expiry left no playable reference; the intended upload may be retried |
| `unavailable` | a formerly ready descriptor has a trusted exact-object `missing`, `unreadable`, or `mismatched` observation; it is not attachable, publishable, or grantable until a later matching observation restores `ready` |

Every successful new upload creates a new asset at revision `1`.
Replacement and later asset revisions are outside this version; retrying one intended upload preserves its asset identity, while selecting a new upload creates another identity.
