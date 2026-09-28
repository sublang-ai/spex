<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-088: Playbook 17 Adoption

## Status

Completed on `adopt-playbook-17`, awaiting merge to `main`; not released.

## Intent

Realize [DR-088](../decisions/088-playbook-17-slc-0-12-cligent-0-27-adoption.md): the core on Playbook 17 and Cligent 0.27, both shells on slc 0.12, interrupted work restored and reported rather than retried, Discard only where nothing was recorded, the Prefix phase, the one-effect rule in the authoring preamble, and every fixture and test on the recompiled built-ins.

## Deliverables

- [x] DR-088, the amended records' status lines, the map, and the core-service, run-view and playbook-library items.
- [x] Floors `^17.0.0`, `^0.27.0` and `^0.12.0` with the lockfile regenerated from the public registry, the app's engine at the tree's root, and the Claude Agent SDK at 0.3.283.
- [x] The Prefix phase in both phase tables, both catalogs, the stub compiler and the phase-row tests.
- [x] Restore over Playbook's recover mode, `session.restore`, the summary's `discardable`, Discard drawn only where it holds, a restore handing no queued intent on, both catalogs, the storage doc and the recovery journey.
- [x] The machine and parked-failure fixtures re-captured; tests, narrations and demos on the renamed states.
- [x] The core suites on Playbook 17's settlement of a saved stop and its restore after Git selection; the one-effect rule in the preamble; the relay journey over the real shell.
- [x] The upgrade notes in the changelog.

## Tasks

1. Record the decision and the spec items.
2. Raise the floors and regenerate the lockfile.
3. Add the Prefix phase.
4. Restore interrupted work and offer Discard only when nothing was recorded.
5. Re-capture the fixtures and follow the renamed states.
6. Follow Playbook 17's settlement of a stopped turn in the core suites.
7. Read the keyboard journey's focus once the turn settles.
8. Teach the draft agent one repository effect per outcome.
9. Prove the relay journey over the real shell.
10. Write the upgrade notes.
11. Show that a restore hands no queued intent on.
12. Record the verification.

## Verification

Run `npm run build`, `npm test` and `npm run e2e` at the root, the catalog checks, and `spex lint`; all pass on the published packages.

Verified on 2026-09-28 against the public registry's Playbook 17.0.0, Cligent 0.27.0 and slc 0.12.0 (whose nested Playbook 16.0.0 declares the app's ABI 1 and schema 3): the root build passed; the root test gate passed 1,222/1,222 (23 script, 133 CLI, 338 core, 701 UI, 16 desktop and 11 server tests); the hermetic journeys passed 63/63, the relay journey among them; the core, UI and desktop catalogs are whole; `spex lint` passed.
The parked-failure capture under Playbook 17 kept the stream's shape and the published controls, `reconcile:unresolved-effect` a no-op beside a ready `abandon:unresolved-effect`, and moved the frames from `firstPhase`.
