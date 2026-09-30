<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-092: The Root Lease Names the Machine

## Status

In progress (2026-09-30); the Spex pull request stays a draft until the Playbook release publishing `@sublang/playbook/machine-identity` is out and the lock is regenerated from it.

## Intent

Realize [DR-093](../decisions/093-the-root-lease-names-the-machine.md): the root lease carries Playbook's machine identity, one shared exact-owner lease implementation serves the core and the storage Git tool with permanent nonempty retirement and no-replace publication, a storage command recovers a dead owner of this machine, and the desktop and the source runner quit cleanly on a signal.

## Deliverables

- [x] DR-093 with its reciprocal DR-036, DR-045 and DR-092 links, the map row, and the changelog entry.
- [x] storage-24 states the root-lease rule and storage-25 verifies it; storage-1 and storage-10 name the lease files and the command's refusal and recovery; core-service-61 and core-service-63 name the identity and the refusals; app-shell-37 and app-shell-26 state the signal shutdown and the runner's bounded escalation, app-shell-27 verifies the escalation, and the manual smoke checklist keeps the `Ctrl+C` residue.
- [x] The shared root-lease module behind `Store` and `reserveStorageHome`, the identity resolved in `CoreService.start`, the storage Git script and the demo seed, the refusal catalog entries in English and Chinese.
- [x] The desktop's signal handling with a bounded exit and the source runner's bounded escalation.
- [x] Tests: the root-lease suite with real competing processes, the storage command's recovery and refusals, the runner's escalation, and the core's refusals.
- [ ] The Playbook floor and the lock regenerated from the released facade, verified by a clean install.

## Tasks

1. Record DR-093 with its reciprocal links, the map row and the changelog entry, and amend the affected items.
2. Add the shared root-lease module and route `Store` and `reserveStorageHome` through it, with the catalog entries.
3. Resolve the identity at the core's start, in the storage Git script and in the demo seed.
4. Handle the desktop's termination signals and the runner's bounded escalation.
5. Add the root-lease, storage-command, runner and core tests, developing against a local Playbook build.
6. Once Playbook releases the facade, raise the floor, regenerate the lock from the registry, install clean, rerun the gates and record the verification.

## Verification

Under Node 22 as CI runs it: `npm ci`, `npm run build`, the root `npm test`, `npm run e2e`, and `npx spex lint`; the lock's one Playbook at the tree's root and none nested under slc; and, by hand, `Ctrl+C` in `npm start` leaving no `.lock/` in the home.

Tasks 1 to 5, verified on 2026-09-30 under Node 24.21.0 against a local pack of the Playbook branch carrying its DR-075 (installed with `npm install --no-save`, the lock untouched): `npm run build` passed for every workspace; the root `npm test` passed — the scripts suite 36, the CLI 133, the core 366 including the new root-lease suite and the extended core-service-63 case, the UI 726 across 33 files, the desktop 16 and the server 11 — and `spex lint` found no problems; `npm run e2e` passed its 65 browser journeys with 1 skipped.
The root-lease suite's killed and live owners are real child processes.
Task 6 waits for the Playbook release; the CI run on Node 22 and the `Ctrl+C` residue are recorded with it.
