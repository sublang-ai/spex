<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-079: Chat-Assisted Playbook Authoring

## Status

In progress (started 2026-09-12).

## Intent

Creating a playbook starts as a conversation: a two-pane authoring workspace on the Playbooks surface where an agent helps write the source on the left while the right pane shows the source, its compilation, its artifacts, and the registration to confirm; drafts survive restarts, and a small real playbook is made through it.

## Deliverables

- [ ] A DR and spec items record the authoring workspace, the conversation runner, the compile request, registration confirmation, and draft persistence.
- [ ] The core runs an authoring conversation per draft through cligent on the Captain's agent block or a chosen player, streams it over the protocol, relays compile failures, and persists the transcript locally.
- [ ] The two-pane workspace with its Source, Gears, Machine, and Register tabs, the paste-or-pick mode, and the drafts list.
- [ ] Hermetic coverage with the fake adapter and a stub compiler; browser journeys.
- [ ] A two-role changelog playbook authored, compiled, and registered through the workspace on this machine.

## Tasks

1. Record the DR, the spec items, and this intent.
2. Core: draft store and authoring conversation runner with protocol commands and coverage.
3. Core: compile request relay, failure feedback, and registration proposal parsing with coverage.
4. UI: the workspace layout, chat pane, and right-pane states.
5. UI: registration confirmation, drafts among the playbook list, the paste-or-pick mode; browser journeys.
6. Author the changelog playbook for real and record the evidence here.

## Verification

- `npm test -w packages/core`, `npm test -w packages/ui`, `npm run e2e`, `spex lint`.
- Live: the changelog playbook compiled and listed among configured playbooks with its Gears and Machine stages served.
