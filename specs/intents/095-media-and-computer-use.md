<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-095: Attachments and Computer Use Through Spex

## Status

Completed: the public runtime releases and application features are merged and verified, including installed native media, live approvals and history after core restart.
The final verification record follows normal PR and merge checks; no application release is claimed, as recorded in the [preparation record](../../docs/releases/0.9.0-beta.8-preparation.md).

## Intent

Complete the user-facing attachment and computer-use workflow across Cligent, Playbook, SLC where needed, and Spex Desktop/server, with the layer ownership in [DR-097](../decisions/097-media-and-browser-tools-across-hosts.md).
The released Cligent 0.31 milestone is a dependency baseline, not proof of the complete application experience.

## Deliverables

- [x] Accepted, mutually coherent runtime, storage, protocol, and UI contracts.
- [x] Cligent capability discovery, bounded host browser preparation and live tool approvals; 0.33.3 published and checked from fresh consumers.
- [x] Shared Playbook input content, asset lifecycle, worker relay, isolated control calls, and an ordinary inspection workflow; 17.4.0 published and checked from a fresh consumer.
- [x] Compatible published dependency closure, with no media-specific compiler semantics.
- [x] Spex uploads, complete draft/queue handoff, browser controls, durable media rendering, and localized guidance.
- [x] Generic live tool approval controls and guidance for workflow questions and external consent.
- [x] PR review, required CI and merge at each affected layer, with releases where needed for downstream adoption.
- [x] Fresh-user acceptance and release smoke against the installed result.

## Tasks

1. Reconcile and record the cross-layer contract, including current unsupported transports and Electron constraints.
2. Implement and verify the Cligent host contract; publish its compatible release.
3. Implement and verify shared session assets and content-bearing turns in Playbook.
4. Add the ordinary inspection workflow, tool configuration projection, attachment relay and visible result media; publish Playbook.
5. Adopt the compatible runtime packages in SLC without changing compilation semantics; release as required by the dependency closure.
6. Add core upload/read commands, application asset ownership, session/draft/intent handoff, and browser preparation state.
7. Add shared attachment composers and trusted media presentation across initial, session, and authoring views.
8. Exercise fresh-user scenarios, complete reviews and CI, and merge fine-grained milestones; publish only where needed for downstream adoption.
9. Keep browser setup failures concise and fully inspectable, and stop acceptance promptly on a reported failure or cancellation.
10. Allow explicitly attributed reuse of matching installed browser revisions for native media acceptance, preserving separate empty-cache host coverage and the default cold path.
11. Verify image perception through portable native visible text and successful invocation evidence without repeating completed provider work after a harness failure.

## Verification

- Follow each affected repository's release requirements rather than treating a downstream green check as proof of an upstream contract.
- Verify exact file bytes reach supported native adapters; rejected submissions preserve the draft, and an accepted turn whose selected worker cannot consume its evidence retains the submitted content and reports the limitation without blocking capable workers.
- Walk image-only, text-plus-file, paste, drop, removal, retry, initial-session, continuation, queued-intent editing/staging/dispatch, and authoring flows.
- Walk browser preparation, cancellation, unavailable host prerequisites, real navigation and screenshot, visible explanation, and reopened image history.
- Walk genuine pending tool requests through denial and one-time allowance, with no effect while pending, exact native outcomes, cancellation and reconnect isolation, and historical-only decisions after restart.
- Verify durable workflow questions separately from tool callbacks, and explain that Codex app-access and operating-system grants retain their external owners.
- Verify task-scoped attachment relay through a working player and nested execution, without granting tools to controller or judge calls.
- Verify asset integrity, owner deletion, portability, whole-unit selection, damaged references, and shared CLI/session recovery.
- Verify fresh installed application profiles, independent cold-cache source and packaged browser preparation on Linux and macOS CI, and the explicitly recorded copied-cache local provider check as distinct evidence; the remote browser client never relies on a server-local copy of its selected file.
- Inspect narrow layouts, keyboard paths, English and Chinese wording, and untrusted remote-media behavior through the rendered UI.
- Keep the goal active until the actual public runtime dependencies and installed application state prove each requested outcome.
