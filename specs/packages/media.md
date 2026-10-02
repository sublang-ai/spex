<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# media: Content Transfer and Browser Preparation

## Intent

This package defines Spex's application content boundary under [DR-097](../decisions/097-media-and-browser-tools-across-hosts.md): authenticated byte transfer, application asset ownership, and browser capability preparation.
Playbook owns the shared immutable asset format and session content lifecycle; Cligent owns adapter capability facts and browser preparation.
The public application vocabulary is the core WebSocket protocol, project intents, local authoring drafts, and session attachment references.

## External Behavior

### media-1

When an authenticated client transfers a file through the core endpoint [[core-service-24](core-service.md#core-service-24)], the core shall accept its bytes through bounded upload commands rather than reading a client-supplied filesystem path:

| Boundary | Limit |
| --- | --- |
| One file | 100 MiB |
| One byte chunk | 64 KiB |
| One accepted turn | 16 files and 256 MiB total |
| Incomplete uploads in one core | 32 files and 1 GiB declared bytes |
| Idle incomplete upload | expires after 30 minutes |

### media-2

When an upload operation is admitted, the core shall apply this transaction protocol:

| Command or state | Outcome |
| --- | --- |
| Begin with client UUID, project or draft owner, display name, MIME type, and byte length | reserve one private staging file and return the upload ID and received offset |
| Repeated begin with identical ID and metadata | return the existing offset or completed reference |
| Reused ID with different metadata | reject without modifying existing content |
| Chunk at received offset | append validated base64 bytes and acknowledge the new offset |
| Repeated prior chunk with identical bytes | acknowledge without duplicating bytes |
| Gap, conflicting retry, malformed base64, or declared-length overflow | reject without advancing the offset |
| Finish after exact declared length | publish the shared immutable owner asset before returning its reference |
| Repeated finish | return the same completed reference |
| Cancel or expiry | remove only incomplete staging bytes; completed owner assets remain |
| Disconnect and reconnect to the same running core | permit the same begin request to resume within the expiry window |
| Core restart | after acquiring the exclusive home lease and before accepting uploads, remove prior UUID staging lifetimes without following symbolic links or touching completed owner assets, refuse unsafe staging paths, and report incomplete transfer unavailable so the client can retry from its retained file |

### media-3

When a client reads a media asset, the core shall resolve the requested project, draft, or session owner and opaque content digest through the shared asset store, verify its stored identity and byte integrity, and return bounded byte ranges with its descriptor, rejecting unknown owners, missing or changed content, and filesystem escapes without fetching external URLs.

### media-4

When application content becomes durable, the core shall use the shared owner-scoped asset primitives through this ownership matrix:

| Content | Owner and lifetime |
| --- | --- |
| Initial messages, session follow-ups before acceptance, queued intents | Project intent asset directory beside that project's append-only intent log |
| Authoring input and output | Local draft asset directory under the ignored draft owner |
| Accepted session input and observed output | Playbook session asset bundle |
| Intent-to-session handoff | Copy and validate bytes into the session before acknowledging acceptance; retain independent project ownership |
| Removed or edited intent | Retain bytes referenced by append-only history |
| Deleted owner | Remove its assets with that owner's guarded deletion; preserve copies in other owners |

### media-5

When a Boss submission, queued intent edit, or authoring queue entry contains attachments, the core shall preserve its exact text and ordered immutable references through admission, staging, dispatch, failure, retry, and recovery, accepting empty text only with at least one attachment and deriving a display title from attachment names without inventing prompt text.

### media-6

When a record with durable input or output media reaches a client, the core shall expose the trusted asset reference and original actor/turn/call identity for presentation, preserving unavailable or external media as explicit states without promoting hidden controller traffic or reconstructing assets from Markdown paths.

### media-7

When a client requests agent capabilities, the core shall return Cligent's contextual attachment, browser, approval, and output transport facts for the proposed agent settings and selected project or draft context, without downloads, provider prompts, or inferring support from adapter names.

### media-8

When a client requests browser preparation, the core shall run Cligent's cancellable preparation with a fifteen-minute overall budget for the same settings and context, relay checking/installing/launching progress and the typed final result to that client, and abort the owned preparation when the client cancels or disconnects, without enabling browser access or changing configuration.

### media-9

When browser access is configured for an agent, the core shall preserve its boolean setting through config edits and effective session settings for the next accepted turn, default omission to off, and allow a session override to be reset to configuration without changing structural session identity or weakening existing permissions.

### media-17

When an application owner is removed or a draft is retired after registration, the core shall exclude new media admission and reads for that owner, invalidate its upload identities throughout their existing retry window, and drain already admitted publication, validation, and readers before removing the owner, without blocking other owners or changing the existing retention of historical project intent assets [[media-4](#media-4)].

## Verification

### media-10

When real WebSocket clients transfer fixture files to a temporary core home, integration verification shall assert authorization and byte limits [[media-1](#media-1)], resumable/idempotent upload transactions, cleanup after a terminated core restarts only with the home lease, and refusal of symbolic-link staging paths without changing their targets [[media-2](#media-2)], exact bounded reads and damaged-content refusal [[media-3](#media-3)], and independent owner copies through deletion [[media-4](#media-4)].

### media-11

When a fresh installed app submits files through initial, session, queued-intent, and authoring flows, acceptance verification shall assert preserved text and bytes through retry/reopen [[media-5](#media-5)] and authentic visible media with unavailable/external fallbacks and unchanged hidden-control visibility [[media-6](#media-6)].

### media-12

When macOS Electron and headless Linux hosts request capabilities and prepare their managed browser, acceptance verification shall assert side-effect-free contextual facts [[media-7](#media-7)], actual launch/screenshot readiness, progress, cancellation, actionable missing-prerequisite outcomes [[media-8](#media-8)], and next-turn browser settings with tool-free controls and legacy omission remaining off [[media-9](#media-9)].

### media-13

When a real WebSocket client uploads a project file and submits an attachment-only session turn, integration verification shall assert that session bytes are readable immediately after acceptance, survive a core restart, and can be deleted with the session while the independent project copy remains [[media-4](#media-4)], with the exact empty prompt and immutable reference preserved in replay and the attachment name used as the session title [[media-5](#media-5)].

### media-14

When a real WebSocket client changes browser configuration and a mutable session override, integration verification shall assert the next working-agent call receives each effective setting, the override survives a core restart without editing configuration, clearing it restores inheritance, and clearing configuration restores off, while session identity, existing permissions, and tool-free controls remain intact [[media-9](#media-9)].

### media-15

When served UI journeys upload decodable fixture images through the real core with substituted provider replies, acceptance verification shall assert this content lifecycle matrix:

- File picker, clipboard paste, and drag/drop: ordered attachment-only session admission preserves exact empty text, names, and bytes after a core restart [[media-5](#media-5)].
- Lost chunk acknowledgement: the retained browser file retries with the same transfer identity after reconnect, without duplicating committed bytes [[media-2](#media-2)].
- Queued follow-up: editing its text, removing it with Undo, and reopening preserves the attached asset [[media-5](#media-5)].
- Authoring: attachment-only input and a native media event render from owned bytes after restart with recorded provenance and no inline binary transcript data [[media-4](#media-4)] [[media-6](#media-6)].

### media-16

When a fresh installed Desktop uses a signed-in native agent to inspect an owned loopback page, live acceptance verification shall assert this end-to-end evidence flow:

- Explicit setup proves browser readiness without saving its choice, followed by a separate Browser enable/save for the Inspector [[media-8](#media-8)] [[media-9](#media-9)].
- A real `/inspect` turn yields native screenshot bytes correlated to the successful screenshot call after navigation to the owned fixture and a substantive Captain explanation of an observable fixture issue, with authentic worker/invocation provenance beside the rendered figure [[media-6](#media-6)].
- Reopening the app retains the same readable image asset and Captain explanation [[media-4](#media-4)] [[media-6](#media-6)], with a successful root terminal, a settled physical receipt reporting no change, and an independent unchanged fixture-repository comparison.
- A second fresh session with Browser explicitly off receives an image through the file picker, preserving its exact bytes [[media-5](#media-5)], and the native Inspector and Captain both identify a random visible token absent from the prompt and filename, with the input image and explanation retained after reopening [[media-4](#media-4)] [[media-6](#media-6)], a successful root terminal, and another unchanged repository receipt.
- A decoded, repainted, fitted Captain view keeps the image and substantive explanation visible within its scrollport and is retained as screenshot evidence outside the disposable app profile [[media-6](#media-6)].

### media-18

When real owner stores and authenticated core clients race media publication with owner removal, integration verification shall assert that removal waits for admitted publication and validation, unrelated owners continue, cached and already closing readers drain, and old incomplete or completed upload identities cannot resume after draft deletion and recreation or registration retirement [[media-17](#media-17)].
