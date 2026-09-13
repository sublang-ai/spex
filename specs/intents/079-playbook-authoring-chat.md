<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-079: Chat-Assisted Playbook Authoring

## Status

Done (2026-09-13): the changelog playbook was authored, compiled, and registered through the workspace on this machine; see Verification.

## Intent

Creating a playbook starts as a conversation: a two-pane authoring workspace on the Playbooks surface where an agent helps write the source on the left while the right pane shows the source, its compilation, its artifacts, and the registration to confirm; drafts survive restarts, and a small real playbook is made through it.

## Deliverables

- [x] A DR and spec items record the authoring workspace, the conversation runner, the compile request, registration confirmation, and draft persistence.
- [x] The core runs an authoring conversation per draft through cligent on the Captain's agent block or a chosen player, streams it over the protocol, relays compile failures, and persists the transcript locally.
- [x] The two-pane workspace with its Source, Gears, Machine, and Register tabs, the paste-or-pick mode, and the drafts list.
- [x] Hermetic coverage with the fake adapter and a stub compiler; browser journeys.
- [x] A two-role changelog playbook authored, compiled, and registered through the workspace on this machine.

## Tasks

1. Record the DR, the spec items, and this intent.
2. Core: draft store and authoring conversation runner with protocol commands and coverage.
3. Core: compile request relay, failure feedback, and registration proposal parsing with coverage.
4. UI: the workspace layout, chat pane, and right-pane states.
5. UI: registration confirmation, drafts among the playbook list, the paste-or-pick mode; browser journeys.
6. Author the changelog playbook for real and record the evidence here.

## Verification

- `npm test -w packages/core`, `npm test -w packages/ui`, `npm run e2e`, `spex lint`.
- CI's journeys job green on Linux: the job runs a Node at or above the compile floor, since the stub `slc` runs under it, and the state-by-state walks hold each compile run in its first phase until they release it.
- Live: the changelog playbook compiled and listed among configured playbooks with its Gears and Machine stages served.
- Live (2026-09-13), through the served shell on a scratch home with the owner's agents: one Boss message produced a complete two-role source (the agent read `slc/text2gears.md` and `review.md`, wrote `changelog.md`, and asked one design question); "compile it" produced the compile directive and the band ran Normalize 13 s, Spec items 2 m 42 s, Optimize 43 s, Machine 15 m 51 s, Link 9 m 14 s, Package; the first two compiles failed at gears2fsm on slc's ten-minute stall watchdog and were relayed to the agent, which asked for another compile each time — a Boss message reset the count and a 2400-second stall budget let the third succeed (the runner now grants that budget by default); the success turn proposed `/changelog` with Coder → dev.coder and Reviewer → dev.reviewer, the Register tab came prefilled, Register wrote `playbooks.changelog` with roles keyed by the derived ids and a config-relative `from`, the draft record retired, the card listed among the configured playbooks with its stage row, and a new session's slash menu offered `/changelog`.
