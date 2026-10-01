<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-092: A Player's Subagent Model

## Status

Completed on `subagent-model`, merged to `main` in 164ebe1 on 2026-09-30 (PDT), and released in `app-v0.9.0-beta.4`.

## Intent

Realize [DR-093](../decisions/093-a-players-subagent-model.md): the subagent model as a fourth tuning field of every agent and role binding, offered wherever the model is, applied at the three projection sites for one conversation, enforced and phrased by Cligent 0.29 and carried by Playbook 17.2.

## Deliverables

- [x] DR-093, the amended records' status lines, the map, and the settings, playbook-library, run-view, core-service and storage items.
- [x] Cligent 0.29.0 and Playbook 17.2.0 published; the core's floors `^0.29.0` and `^17.2.0` with the lockfile regenerated from the public registry, one Cligent kept by a root override of slc's range.
- [x] The core: the agent block, patch, resolved agent, binding, summary, session agent settings, projection application, draft runner and `agent.options` capability; protocol 18.
- [x] The interface: the field in the shared agent editor, the role-binding editor and the session agent editor; the chip unchanged; both catalogs.
- [x] Tests by layer: the core's config-edit, validation and session-tuning suites, the interface suites, and one step in the existing session and library journeys.
- [x] The changelog.

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

Verified on 2026-09-30 on the branch against local packs of Cligent 0.29 and Playbook 17.2, then on the registry's releases: the root build passed; the root test gate passed (core 358, interface 742, desktop 133 and server 27 tests, every catalog whole); the hermetic journeys passed 65 with 1 skipped, the extended run-view-141 and playbook-library-39 journeys among them; `spex lint` passed.
An adversarial review by five lenses confirmed eight findings — six spec and documentation lags, since amended, and two corrections: a continued session's stored tuning no longer masks a structural-drift refusal, and a player's fast mode reaches its bare bindings as the launcher resolves it.
Cligent 0.29.0 proved the mechanism live: with `subagentModel: claude-haiku-4-5`, every subagent frame of a real Claude run named Haiku while the main agent's own Agent call asked for `sonnet`; Playbook 17.2.0 carries the field through its launcher, session store and Captain shell, 2,577 tests and 94 capability probes.
`npm run smoke -- --live` passed every stage on `43d1939` and again on `754a727`; CI concluded `success` on the merge `164ebe1`, and the App Release workflow published `app-v0.9.0-beta.4` on 2026-10-01 01:00 UTC.
