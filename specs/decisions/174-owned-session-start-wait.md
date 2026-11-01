<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-174: Owned Session Start Wait

## Status

Accepted, 2026-10-31.
Partially supersedes [DR-179](179-session-creation-waits-for-initialization.md) and amends [DR-010](010-interface-craft.md) §5 for session creation's UI observation deadline only.

## Context

Windows APP validation retained a successfully created, zero-turn session after the two-minute UI deadline expired.
The core had continued initialization; the interface's rejected promise prevented the original Boss input from being sent.
A longer arbitrary deadline can produce the same false failure and another empty session if the user retries.

## Decision

- Use the protocol client's existing no-deadline option for the one session.create request while the connection remains live.
- Keep the task start in flight, then use that returned session identity to send the original input once.
- Reject on connection loss or core refusal without automatically resending; explicit observer deadlines remain available to other callers.
- Preserve core configuration validation, ownership, leases, permission checks and workflow execution unchanged.

## Consequences

Slow initialization is observed rather than described as a failed creation.
This does not make initialization faster, prove success before a reply, or authorize replay after an uncertain connection loss.
Real-wire verification covers late success, single transmission, ordinary and explicit observation deadlines, and disconnect rejection.
