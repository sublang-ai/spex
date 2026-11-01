<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-179: Session Creation Waits for Initialization

## Status

Accepted, 2026-10-31.
The two-minute UI observation deadline is superseded by [DR-181](181-owned-session-start-wait.md); the single-request, unchanged-admission and disconnect boundaries remain.

## Context

Native Windows validation observed the task-start command reach the ordinary thirty-second UI reply bound while the core continued session creation. The retained session was empty because the first turn follows the creation reply; retrying the whole action could create another session. A cold config composition and runtime admission are longer than a cheap local read.

## Decision

Await session.create for two minutes through the existing per-command timeout mechanism. Keep the in-flight control and single original request; do not retry creation or broaden any core admission, permission, ownership or workflow policy. Ordinary reply bounds, core refusals and dropped-connection rejection retain their behavior.

## Consequences

The interface can receive an initialization that exceeds thirty seconds without manufacturing a failure or another empty session. The longer bound does not cure slow initialization, imply success before a reply, or make unknown effects safe to replay. Verification includes delayed real-wire replies, the remaining bound, disconnect and packaged APP reentry.
