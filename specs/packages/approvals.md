<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# approvals: Live Tool Approvals

## Intent

This package defines live native tool approval ownership, authenticated answers, reconnect recovery, and the controls that answer pending requests ([DR-098](../decisions/098-live-tool-approvals.md)).
It excludes native policy grants and denials, settled Boss questions, historical permission events, and operating-system privacy grants.

## External Behavior

### approvals-1

When a visible working session or authoring call invokes its native approval handler, the core shall publish one pending request bound to its core generation, fresh host request identity, session or draft owner, turn, actor, invocation, native request, offered choices, action input, and deadline capped at ten minutes:

- only the live handler creates authority, never a prompt, config value, or stored event;
- multiple calls and owners retain distinct identities even if native request ids repeat;
- the native request admits at most 256 KiB (262,144 UTF-8 bytes) of compact JSON and a maximum value depth of 64, counting the request object as depth zero and each object member or array item as one further level;
- malformed, already-aborted, expired, or unavailable requests fail closed without becoming actionable.

### approvals-2

When an authenticated client answers a pending request [[core-service-24](core-service.md#core-service-24)], the core shall deliver at most one offered decision for the exact generation, host request identity, and owner [[approvals-1](#approvals-1)]:

- an identical repeated answer returns the original acknowledgement until thirty seconds after its deadline while retained among the core's latest 2,048 answers, without resuming again;
- a conflicting answer, mismatched owner, old generation, expired identity, or unoffered choice is refused;
- acknowledgement confirms only the host decision, not native tool execution.

### approvals-3

When a request's signal aborts, deadline passes, call completes, owner is disposed, or core stops, the core shall remove its pending authority and fail closed [[approvals-1](#approvals-1)], preserving native cancellation, expiry, denial, or error records as historical outcomes rather than fabricating successful execution.

### approvals-4

When an authenticated client connects or requests approval state, the core shall return a complete generation-and-revision snapshot of its pending requests [[approvals-1](#approvals-1)]:

- disconnecting a client leaves another client's or the same returning client's requests answerable until their own lifecycle ends;
- a restarted core starts with no requests, regardless of stored transcript content;
- stale same-generation revisions never replace newer state in a client.

### approvals-5

While actual pending requests exist [[approvals-4](#approvals-4)], the interface shall provide a global approval inbox with one attention entry and directly accessible answer controls per request:

- the entry names its session or draft, actor, turn, tool, reason where present, and complete safely rendered action input and native details;
- Approve once and Deny name only offered choices and remain usable during a running turn, independently of the ordinary composer;
- a disconnected or answering client disables its controls, preserving a refused answer's cause even if another client has already removed the request;
- answering, expiry, or cancellation removes only that request, and historical permission telemetry raises no entry;
- keyboard operation, narrow-view wrapping, and focus transfer preserve access to the remaining entries, without automatically focusing approval or assigning a single-keystroke approval shortcut.

### approvals-6

When the interface presents approval capability or a permission-related setup failure, it shall report the installed adapter's known support or diagnostic without equating an unknown capability with unsupported or a managed browser with desktop access:

- no UI approval claims to grant macOS Accessibility, Automation, or screen recording for an external tool process;
- native policy grants and denials remain authoritative, and unsupported approval transports retain their existing headless behavior.

## Verification

### approvals-7

When real authenticated WebSocket clients drive controllable working agents through temporary sessions and authoring drafts, integration verification shall assert exact request ownership and parallel isolation [[approvals-1](#approvals-1)], no tool side effect while pending, allow-once and deny with at-most-once delivery and conflicting or stale response refusal [[approvals-2](#approvals-2)], cancellation, completion, expiry, disposal, and shutdown invalidation [[approvals-3](#approvals-3)], and reconnect, multiple-client, and core-restart snapshots [[approvals-4](#approvals-4)].

### approvals-8

When a fresh served UI drives approval fixtures through a real core, acceptance verification shall assert visible safe action content, enabled approval controls beside a disabled active-turn composer, deny and approve outcomes, narrow-view and keyboard fit, reconnect recovery, and no historical-only summons [[approvals-5](#approvals-5)], with honest supported, unsupported, unknown, and permission-unavailable facts [[approvals-6](#approvals-6)].

### approvals-9

When a fresh installed Desktop drives a signed-in Claude working agent with explicit ask policy through task-owned read-only fixtures, live acceptance verification shall assert a genuine native request with no completed operation while pending [[approvals-1](#approvals-1)], UI deny and allow-once answers joined to the native response and actual tool result [[approvals-2](#approvals-2)], unchanged governed repositories and expired live authority after settlement [[approvals-3](#approvals-3)], and historical-only decisions after reopening [[approvals-4](#approvals-4)], without resetting or claiming operating-system or Codex app-access consent [[approvals-6](#approvals-6)].
