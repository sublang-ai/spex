<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-095: Attachments and Computer Use Through Spex

## Status

In progress: shared runtime releases verified; final application verification underway.

## Intent

Complete the user-facing attachment and computer-use workflow across Cligent, Playbook, SLC where needed, and Spex Desktop/server, with the layer ownership in [DR-097](../decisions/097-media-and-browser-tools-across-hosts.md).
The released Cligent 0.31 milestone is a dependency baseline, not proof of the complete application experience.

## Deliverables

- [x] Accepted, mutually coherent runtime, storage, protocol, and UI contracts.
- [x] Cligent capability discovery, bounded host browser preparation and live tool approvals; 0.33.1 published and checked from fresh consumers.
- [x] Shared Playbook input content, asset lifecycle, worker relay, isolated control calls, and an ordinary inspection workflow; 17.4.0 published and checked from a fresh consumer.
- [x] Compatible published dependency closure, with no media-specific compiler semantics.
- [ ] Spex uploads, complete draft/queue handoff, browser controls, durable media rendering, and localized guidance.
- [ ] Generic live tool approval controls and guidance for workflow questions and external consent.
- [ ] PR review, required CI, merge and release at each affected layer.
- [ ] Fresh-user acceptance and release smoke against the installed result.

## Tasks

1. Reconcile and record the cross-layer contract, including current unsupported transports and Electron constraints.
2. Implement and verify the Cligent host contract; publish its compatible release.
3. Implement and verify shared session assets and content-bearing turns in Playbook.
4. Add the ordinary inspection workflow, tool configuration projection, attachment relay and visible result media; publish Playbook.
5. Adopt the compatible runtime packages in SLC without changing compilation semantics; release as required by the dependency closure.
6. Add core upload/read commands, application asset ownership, session/draft/intent handoff, and browser preparation state.
7. Add shared attachment composers and trusted media presentation across initial, session, and authoring views.
8. Exercise fresh-user scenarios, complete reviews and CI, then release the verified app candidate under its release policy.

## Verification

- Follow each affected repository's release requirements rather than treating a downstream green check as proof of an upstream contract.
- Verify exact file bytes reach supported native adapters; rejected submissions preserve the draft, and an accepted turn whose selected worker cannot consume its evidence retains the submitted content and reports the limitation without blocking capable workers.
- Walk image-only, text-plus-file, paste, drop, removal, retry, initial-session, continuation, queued-intent editing/staging/dispatch, and authoring flows.
- Walk browser preparation, cancellation, unavailable host prerequisites, real navigation and screenshot, visible explanation, and reopened image history.
- Walk genuine pending tool requests through denial and one-time allowance, with no effect while pending, exact native outcomes, cancellation and reconnect isolation, and historical-only decisions after restart.
- Verify durable workflow questions separately from tool callbacks, and explain that Codex app-access and operating-system grants retain their external owners.
- Verify task-scoped attachment relay through a working player and nested execution, without granting tools to controller or judge calls.
- Verify asset integrity, owner deletion, portability, whole-unit selection, damaged references, and shared CLI/session recovery.
- Run fresh installed macOS Desktop and headless Linux server acceptance with empty browser caches; verify the remote browser client never relies on a server-local copy of its selected file.
- Inspect narrow layouts, keyboard paths, English and Chinese wording, and untrusted remote-media behavior through the rendered UI.
- Keep the goal active until the actual released and installed state proves each requested outcome.
