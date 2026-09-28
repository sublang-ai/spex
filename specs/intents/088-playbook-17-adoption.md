<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-088: Playbook 17 Adoption

## Status

In progress on `adopt-playbook-17`; not released.

## Intent

Realize [DR-088](../decisions/088-playbook-17-slc-0-12-cligent-0-27-adoption.md): the core on Playbook 17 and Cligent 0.27, both shells on slc 0.12, interrupted work restored and reported rather than retried, Discard only where nothing was recorded, the Prefix phase, the one-effect rule in the authoring preamble, and every fixture and test on the recompiled built-ins.

## Deliverables

- [ ] DR-088, the amended records' status lines, the map, and the core-service, run-view and playbook-library items.
- [ ] Floors `^17.0.0`, `^0.27.0` and `^0.12.0` with the lockfile regenerated from the public registry and the Claude Agent SDK refreshed.
- [ ] The Prefix phase in both phase tables, both catalogs and the phase-row tests.
- [ ] Restore over Playbook's recover mode, `session.restore`, the summary's `discardable`, Discard drawn only where it holds, both catalogs, the storage doc and the recovery journeys.
- [ ] The machine and parked-failure fixtures re-captured; tests, narrations and demos on the renamed states.
- [ ] The core suites on Playbook 17's settlement of a saved stop and its restore after Git selection; the one-effect rule in the preamble; the relay journey over the real shell.
- [ ] The upgrade notes in the changelog.

## Tasks

1. Record the decision and the spec items.
2. Raise the floors and regenerate the lockfile.
3. Add the Prefix phase.
4. Restore interrupted work and offer Discard only where nothing was recorded.
5. Re-capture the fixtures and follow the renamed states.
6. Follow Playbook 17's settlement in the core suites, teach the one-effect rule, and prove the relay.
7. Write the upgrade notes.

## Verification

Run `npm run build`, `npm test` and `npm run e2e` at the root, the core's i18n check, and `spex lint`; all pass on the published packages.
