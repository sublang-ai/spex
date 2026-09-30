<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-092: A Player's Subagent Model

## Status

In progress on `subagent-model` (2026-09-30).

## Intent

Realize [DR-093](../decisions/093-a-players-subagent-model.md): the subagent model as a fourth tuning field of every agent and role binding, offered wherever the model is, applied at the three projection sites for one conversation, enforced and phrased by Cligent 0.29 and carried by Playbook 17.2.

## Deliverables

- [x] DR-093, the amended records' status lines, the map, and the settings, playbook-library, run-view, core-service and storage items.
- [ ] Cligent 0.29.0 and Playbook 17.2.0 published; the core's floors `^0.29.0` and `^17.2.0` with the lockfile regenerated from the public registry.
- [ ] The core: the agent block, patch, resolved agent, binding, summary, session agent settings, projection application, draft runner and `agent.options` capability; protocol 18.
- [ ] The interface: the field in the shared agent editor, the role-binding editor and the session agent editor; the chip unchanged; both catalogs.
- [ ] Tests by layer: the core's config-edit, validation and session-tuning suites, the interface suites, and one step in the existing session and library journeys.
- [ ] The changelog.

## Tasks

1. Record the decision and the spec items.
2. Release Cligent 0.29.0 with the option, then Playbook 17.2.0 carrying it as tuning.
3. Raise the floors and regenerate the lockfile.
4. Carry the field through the core and the protocol.
5. Offer the field in the three editors.
6. Extend the suites and the journeys.
7. Write the changelog and record the verification.

## Verification

Run `npm run build`, `npm test`, `npm run e2e`, the catalog checks and `spex lint` at the root on the published packages; walk the live smoke.
