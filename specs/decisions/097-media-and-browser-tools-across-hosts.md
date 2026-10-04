<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-097: Media and Browser Tools Across Hosts

## Status

Accepted (2026-10-01).
Amends the session-bundle boundary in [DR-045](045-unified-session-storage.md), the text-only submission boundary in [DR-085](085-boss-talks-through-captain.md), the execution settings in [DR-019](019-inline-agent-configuration.md), and the authoring content and runtime options in [DR-058](058-chat-assisted-playbook-authoring.md).
Amended by [DR-102](102-playbook-17-4-1-adoption.md) in its dependency closure alone: the floors its rollout adopted are recorded there, with the Playbook floor raised to `^17.4.1`.

## Context

Cligent 0.31 supplies local attachment inputs, caller-selected MCP servers, a managed browser, and native media events.
Those transports alone do not provide a Spex experience: the composers, durable Boss input, queue, configuration projections, and transcript presentation currently discard or cannot express this content.
Captain is a tool-free controller, so a fresh request to inspect an application also needs a worker route that does not require changing or committing the repository.
Desktop runs the core inside Electron, while a browser can connect to a Linux server from a different computer; neither a client file path nor a successful Node-only browser test proves those hosts work.

## Decision

### Experience and ownership

The same interaction serves the first message, an existing conversation, and playbook authoring: pick, paste, or drop files; see their names and upload state; remove or retry them; then submit text, files, or both.
Rejected submissions retain their complete draft, and queued work retains the same immutable content it accepted.
Image-only queue entries use their attachment names as display titles without inventing prompt text, and editing, staging, or dispatching an entry preserves its selected content.
The Browser capability names an isolated browser on the execution host, with preparation progress, cancellation, and a specific repair when preparation fails.
Browser is off when an existing configuration makes no request; its visible switch changes the selected working agent's explicit execution setting for the next turn, with a conversation override that does not require a new session.
Preparation itself grants nothing: enabling the capability is a separate explicit user choice, existing permission restrictions still apply, and control calls always disable it.
No ordinary user must select an MCP package or edit a tool command to use the managed browser.
Native desktop control is a distinct, explicitly supplied tool capability; the interface never infers it from the presence of an agent or a managed browser.

| Layer | Owns | Does not own |
| --- | --- | --- |
| Spex UI | File acquisition, recoverable drafts, capability controls, upload/setup progress, inline media and accessible previews | Provider prompt syntax, host filesystem paths, SDK layouts |
| Spex core and shells | Authenticated byte transfer, application-owned pending/intent/draft content, host configuration, trusted media access, Electron packaging and execution context | Provider media conversion, a second session recovery format |
| Playbook host and shared store | Durable session content and assets, attachment relay to working calls, tool-free control calls, complete replay and bundle lifecycle | Image interpretation, browser implementation, UI upload state |
| Cligent | Native attachment/MCP/media transports, effective runtime capability facts, bounded browser preparation and actual launch proof in the embedding runtime | Conversation persistence, user upload transport, rendering |
| SLC | Compile an ordinary source-authored inspection workflow and adopt compatible runtime dependencies | Media-specific FSM syntax, application upload or browser semantics |

### One content flow

Files selected in any client cross the authenticated core protocol as bounded byte chunks, never as a claim that the server can read a client-local path.
Completed uploads receive opaque references only after their bytes are stored and validated.
Before a turn is accepted, its references become immutable content owned by that session; the shared runtime materializes local attachment paths only when dispatching a native agent call.
The exact authored workflow text remains text, with content carried beside it rather than encoded into workflow options or classified by a compiler.
Attachments belong to the accepted turn and its working engagement, including the nested calls that perform that request; a later unrelated engagement does not inherit them merely because the same player is reused.
New Boss attachments delivered to an existing engagement extend that addressed frame; children inherit an immutable snapshot.
Native evidence produced by a child also becomes available to its still-active ancestors within the same root engagement, preserving its origin.
Completion, dismissal, or an unrelated new root ends that implicit scope.
An idle upload followed by clarification and a later instruction retains a pending content group; the controller can select validated opaque references from that group for a new request, and omission selects only the current turn's newly supplied attachments rather than the whole history.
Starting a new request consumes the pending group, while explicit reattachment remains possible from retained history.
Restoration preserves the recorded content and never reads a changed original file as if it were the accepted attachment.
An attachment-only turn is recorded with empty user text and receives an ordinary clarification when no task is supplied; neither host nor compiler fabricates a user instruction to satisfy a text-only check.

### Durable assets

Playbook owns immutable, content-addressed session asset files and their validated references.
Assets are published before a record or checkpoint references them, and the session bundle includes those assets in validation, copying, whole-session Git selection, and lease-checked deletion.
The replay envelope stays generic; known media records refer to assets instead of carrying large inline byte strings, and large opaque tool details may use a generic deferred-detail asset without parsing provider-specific content.
Spex uses the same asset primitives for pending inputs, queued intents, and local authoring drafts, retaining each owner's existing portability policy.
An intent log and the assets it owns are selected as one unit; local drafts and their assets remain ignored.
Intent-to-session dispatch copies and retains the selected bytes before acknowledgement, so each owner replays independently; an intent's asset lifetime includes references in its append-only history, not only its current visible fold.
Missing or corrupt bytes produce a visible unavailable attachment or figure and block execution that needs those bytes, without hiding unrelated history or inventing a replacement.

### Browser and control behavior

Cligent capability facts distinguish native input support, browser-tool admission, and the output media the host can actually receive.
Environment preparation is separate from agent credentials and model abilities: ready means the host has launched the managed browser and captured a screenshot, not that a target app is running or a model can interpret it.
The same preparation path serves an explicit host setup request and an ordinary browser-enabled agent call.
Tool-free Captain decisions, reports, and judges explicitly suppress browser and caller-tool admission; they may receive attachment evidence without acquiring tools.
Routing always receives attachment metadata and supplies native bytes only where the controller supports them, so an incapable controller cannot block a capable worker; a worker that needs unsupported evidence reports that limitation instead of silently omitting it.
A source-authored inspection worker handles requests that require tools and evidence but no repository change, through the existing compiler and runtime contracts.
Visible figures from working calls reach the conversation beside the explanation, with their origin preserved; hidden controller traffic remains hidden.
The shared host supplies bounded, attributed excerpts of accepted visible worker reports to the Captain, using acknowledged execution evidence rather than interpreting arbitrary workflow output fields.
Those reports describe what the worker observed; workflow and repository receipts remain authoritative about completion and effects, including after recovery.
The runtime writes an explicit visible evidence record for observed working-call media, keyed to turn, originating actor, and call, deduplicating identical content within that call while preserving observation order.
The Captain view renders those records independently of model-generated Markdown, and the worker view retains the same evidence at its original call.
Unsupported adapters or unavailable browser prerequisites leave text work and independently supported media paths usable.

### Rendering and host parity

Structured image, audio, and video previews read trusted stored assets through the core and use local browser object URLs.
The existing Markdown no-beacon policy remains: an agent-supplied remote URL is not fetched automatically to obtain a preview.
Desktop and server use one protocol and the same UI; file input needs no new application-bearing Electron IPC.
Cligent owns Node/Electron child invocation and runtime resource discovery; the desktop shell unpacks the complete `node_modules` tree so managed child modules, their transitive imports, and native binaries share one physical dependency layout.
App code and UI remain in ASAR; the archive is packaging, not a security boundary.
Acceptance proves native setup from a packaged app in a path containing spaces.

## Consequences

Rollout proceeds from the agreed shared contracts through Cligent, Playbook, dependency adoption in SLC, and Spex, with one compatible dependency closure in the installed app.
An adapter's inability to emit image bytes remains visible as a capability limitation rather than being hidden by speculative file reads or claimed screenshot support.
Verification must exercise fresh installed Desktop and headless Linux server flows, real agent screenshot transport, persistence and recovery, shared CLI history, content portability, cancellation, unsupported cases, and the complete application submission paths.
Native Windows app hosting remains outside the supported app-host contract of [DR-049](049-supported-app-hosts.md); a Windows browser connecting to a supported server uses the same upload and media protocol.
