<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-094: A Subagent's Effort

## Status

In progress on `subagent-effort` (2026-10-01).

## Intent

Realize [DR-095](../decisions/095-a-subagents-effort-and-the-agents-own-model.md): "Same as agent" first in the subagent-model field, a subagent-effort field whose empty choice reads "Agent chooses", each model paired with its effort on one row in the three editors, the fifth tuning field carried through the core on Cligent 0.30 and Playbook 17.3.

## Deliverables

- [x] DR-095, the amended records' status lines and the map.
- [x] The settings, playbook-library, run-view, core-service and storage items.
- [ ] Cligent 0.30.0, Playbook 17.3.0 and slc 0.15.0 published; the floors and the lockfile from the public registry.
- [x] The core: the fifth field and the `inherit` literal through the block, patch, resolved agent, binding, summary, session settings, projection application and `agent.options`; the protocol version.
- [x] The interface: "Same as agent", "Agent chooses", "Off" while it stands, the paired rows; both catalogs.
- [ ] Tests by layer; the changelog; `app-v0.9.0-beta.6`.

## Tasks

1. Record the decision and amend the spec items.
2. Release Cligent 0.30.0, Playbook 17.3.0 and slc 0.15.0; raise the floors and regenerate the lockfile.
3. Carry the field and the literal through the core and the protocol.
4. Offer the fields and the paired rows in the three editors.
5. Extend the suites and the journeys; write the changelog; prepare and record the beta.

## Verification

