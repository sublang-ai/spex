<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-088: Playbook 17 Adoption

## Status

Completed on `playbook-17-adoption`, merged to `main` in 88b9f88 on 2026-09-29, and released in `app-v0.9.0-beta.1`.

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
- [x] The review's corrections: DR-088's relations to DR-080, DR-081, DR-077 and DR-062 and its reference; a stale Restore refused; Restore named as an interrupted session's way on; a stopped run's controls kept where its stop settles; the restored position recorded and read by the ledger and the run view; a restore's report finishing nothing; Restore proven to report once.
- [x] The recheck's corrections: the Captain shell's own machine parking nothing; a restored failure counted only where the restore moved a run into it; a restore marked before it runs and its position completed after a stop; a restore's report reading stopped; the restored message drawn once; no call left running after a restore; a restored failure's cause phrased on its card and notice.

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
13. Correct the adoption's records and the restore items after review.
14. Refuse a stale Restore and name Restore as the way on.
15. Keep a stopped run's controls where its stop settles.
16. Record where a restore leaves each run, and read its report as a stop.
17. Prove Restore reports once.
18. Record the review's verification.
19. Keep the Captain's own machine out of parked runs.
20. Summon only a failure a restore moved a run into.
21. Complete a restore a stopped core left unrecorded.
22. Read a restore's report stopped, not failed.
23. Draw a restored message once.
24. Leave no call running after a restore.
25. Say why a restored run failed.
26. Note what the recheck changed for Restore.
27. Record the recheck's verification.

## Verification

Run `npm run build`, `npm test` and `npm run e2e` at the root, the catalog checks, and `spex lint`; all pass on the published packages.

Verified on 2026-09-28 against the public registry's Playbook 17.0.0, Cligent 0.27.0 and slc 0.12.0 (whose nested Playbook 16.0.0 declares the app's ABI 1 and schema 3): the root build passed; the root test gate passed 1,222/1,222 (23 script, 133 CLI, 338 core, 701 UI, 16 desktop and 11 server tests); the hermetic journeys passed 63/63, the relay journey among them; the core, UI and desktop catalogs are whole; `spex lint` passed.
The parked-failure capture under Playbook 17 kept the stream's shape and the published controls, `reconcile:unresolved-effect` a no-op beside a ready `abandon:unresolved-effect`, and moved the frames from `firstPhase`.

Verified again on 2026-09-28 after review: the root build passed; the root test gate passed 1,229/1,229 (23 script, 133 CLI, 342 core, 704 UI, 16 desktop and 11 server tests); the hermetic journeys passed 63/63; the core, UI and desktop catalogs are whole; `spex lint` passed.
A CLI writer killed mid-step lists its step as recorded work, and Restore brings `/code` back at `failed` with the checkpoint's `runtime-defect` cause, publishing the same no-op reconciliation beside a ready abandonment; a Boss abort mid-step settles and publishes them too.

Verified again on 2026-09-28 after an adversarial recheck, on `playbook-17-adoption` rebased on the scratch-leak fix: the root build passed; the root test gate passed 1,236/1,236 (23 script, 133 CLI, 348 core, 705 UI, 16 desktop and 11 server tests); the hermetic journeys passed 63/63; the core, UI and desktop catalogs are whole; the journeys typecheck; `spex lint` passed.
A Boss abort during the Captain's own call now reads `stopped` with Start; Restore of a run the Boss had stopped raises no summons; a restore whose core stopped before recording the position is completed once by the next core to read it; a restored dispatch reads `stopped`; and the restored run draws its message once, no call running, and its cause on the card and the notice.
