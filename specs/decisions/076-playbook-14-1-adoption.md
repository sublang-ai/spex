<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-076: Playbook 14.1 Adoption

## Status

Accepted (2026-09-17).
Raises the Playbook floor set by [DR-062](062-ending-a-failed-workflow.md) from 13.3 to 14.1, in the pattern of [DR-053](053-model-options-adoption.md); Cligent's floor is unchanged.
Completes [DR-075](075-a-failure-says-what-and-what-now.md), which required this floor.

## Context

- Playbook 14.1 ships three things this app depends on: a governed call may carry the Boss's uncommitted changes in its one commit and the Boss is told which ([DR-062 in Playbook](https://github.com/sublang-ai/playbook/blob/main/specs/decisions/062-pre-existing-changes-are-context.md)); every parked failure carries a closed `{ code, evidence }` cause and every advertised action a standing ([DR-063 in Playbook](https://github.com/sublang-ai/playbook/blob/main/specs/decisions/063-failures-explain-themselves.md)); and, from 14.0, a give-up over unresolved effects records a durable abandonment and reports a failed stop truthfully.
- Until the floor rises, the interface's failure catalogue mirrors Playbook's code list by hand and its parked-failure fixtures are hand-authored, both marked as such.
- 14.0 renamed PR's refused-merge terminal to `merge-unconfirmed`; the app reads no PR terminal by name.

## Decision

- `@sublang/playbook` floor `^14.1.0`; `@sublang/cligent` unchanged.
- The catalogue's coverage test imports `PLAYBOOK_FAILURE_CODES` from `@sublang/playbook/runtime`; the mirrored list goes.
- The parked-failure fixtures — the failed status line with its cause, the machine frames, and the published `parked` summary with standings — are re-captured from a real core with substitute agents, as the machine fixtures were at earlier adoptions.
- The browser journey harness's scripted failure parks a run that advertises real actions, so the published-control path is proven in the browser lane, not only by the fixture stream.

## Consequences

- One floor bump, one fixture re-capture, one import; no product behavior changes beyond what the floor brings.
- The interface's failure phrases are now tested against the runtime's own list, so a new Playbook code fails a test until it is phrased.
- A parked-run notice drawn from a fresh Playbook shows each action's real standing rather than none.
