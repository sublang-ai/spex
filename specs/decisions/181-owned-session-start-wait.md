<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-181: Owned Session Start Wait

## Status

Accepted (2026-10-31).
Amends [DR-010](010-interface-craft.md).

## Context

- Native Windows validation observed the task-start command reach the ordinary thirty-second UI reply bound while the core continued session creation.
- The retained session was empty because the first turn follows the creation reply; retrying the whole action could create another session.
- A cold config composition and runtime admission take longer than a cheap local read.
- A two-minute bound was tried next: Windows APP validation then retained a successfully created, zero-turn session after that deadline expired, the core having continued initialization while the interface's rejected promise kept the original Boss input from being sent.
- Any arbitrary deadline can produce the same false failure and another empty session if the user retries.

## Decision

- Amends [DR-010](010-interface-craft.md) §5 in session creation's UI observation deadline only.
- Use the protocol client's existing no-deadline option for the one session.create request while the connection remains live.
- Keep the task start in flight with the single original request, then use the returned session identity to send the original input once; never retry creation.
- Reject on connection loss or core refusal without automatically resending; explicit observer deadlines and ordinary reply bounds remain available to other callers.
- Preserve core configuration validation, admission, ownership, leases, permission checks and workflow execution unchanged.

## Consequences

Slow initialization is observed rather than described as a failed creation.
This does not make initialization faster, prove success before a reply, or authorize replay after an uncertain connection loss.
Real-wire verification covers late success, single transmission, ordinary and explicit observation deadlines, disconnect rejection and packaged APP reentry.
