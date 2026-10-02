<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-098: Live tool approvals

## Status

Accepted.

Amends [DR-066](066-every-summons-has-a-door.md), which remains accepted: actual live native approval requests gain answer controls and their own ephemeral attention inbox; historical permission telemetry still summons nobody.

## Context

A native agent can suspend one tool operation while asking its host for a decision.
The existing permission transcript is historical telemetry, and a Boss question is a settled workflow asking for another conversational turn.
Neither is authority to resume a suspended native tool.
Session and authoring calls can wait concurrently, including after a browser client disconnects.
Managed headless browser screenshots do not require desktop Accessibility, Automation, or screen-recording grants.
An external desktop tool may require those grants from its own operating-system identity, which Spex cannot grant on its behalf.

## Decision

The core owns an ephemeral broker for actual native requests forwarded by Cligent and Playbook on visible working calls.
Each request binds a fresh host identity and core generation to its session or draft, turn, actor, native request, and invocation.
The authenticated control plane answers only those live identities with an offered allow-once or deny decision.
A repeated identical answer is idempotent while its acknowledgement remains in the bounded retry window; a different answer, stale generation, or expired request is refused.
Aborting, ending, or disposing a call removes its requests, and no durable record or restarted core recreates a pending request.
A disconnected page can recover the same live core's complete pending snapshot.

A global approval inbox carries one attention entry per actual pending request, including authoring drafts which are outside the session ledger.
It shows the actor, conversation or draft, tool, reason, and escaped action input beside accessible Approve once and Deny controls.
These controls operate while the ordinary composer is disabled for the active turn.
The inbox stays independent of durable ledger attention: visiting it or answering another request clears nothing.
A host answer reports a decision, never a claim that native execution succeeded.
Native response and execution records remain the evidence of the outcome.

Capability discovery reports the installed adapter's approval transport facts without treating unknown as unsupported.
Existing native grants and hard denials precede the callback, and unsupported transports retain their current headless behavior.
Operating-system permission errors remain explicit tool or setup diagnostics with targeted host remedies; the inbox never fabricates a native macOS grant or resets system privacy state.

## Consequences

The protocol gains an approval snapshot and one response command, independent of session subscriptions.
The UI can recover unanswered requests after a same-core reconnect without replaying provider work.
Approval identities and pending state are not synchronized or persisted; native transcript records remain historical after restart.
Fresh-profile verification separates agent approval behavior from operating-system privacy grants.
