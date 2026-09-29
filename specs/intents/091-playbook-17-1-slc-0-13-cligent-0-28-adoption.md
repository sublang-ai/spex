<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-091: Playbook 17.1, slc 0.13 and Cligent 0.28 Adoption

## Status

Completed on `models-named-by-runtime` (2026-09-29) in two steps, Playbook 17.1 with Cligent 0.28 and the agent SDK locks, then slc 0.13 once npm served it; not merged, not released.

## Intent

Realize [DR-092](../decisions/092-playbook-17-1-slc-0-13-cligent-0-28-adoption.md): the core on Playbook 17.1 and Cligent 0.28, both shells on slc 0.13, the agent SDKs locked at the releases Cligent 0.28 tests, and one engine and one Cligent in the tree.

## Deliverables

- [x] DR-092, the amended records' status lines, and the map.
- [x] The core's floors `^17.1.0` and `^0.28.0`, the lockfile regenerated from the public registry with the app's Playbook and Cligent at the tree's root, and the agent SDKs locked at Claude Agent SDK 0.3.284, Codex SDK 0.159.0 with Codex 0.159.0, and OpenCode SDK 1.18.33.
- [x] The tests, fixtures and journeys following what the new releases change.
- [x] The changelog.
- [x] Both shells on slc `^0.13.0`, the lockfile holding one Playbook, 17.1.0, and one Cligent, 0.28.0.

## Tasks

1. Record the decision.
2. Raise the core's floors, regenerate the lockfile and lock the agent SDKs.
3. Follow what the new releases change in the tests, fixtures and journeys.
4. Write the changelog and record the first step's verification.
5. Raise both shells to slc `^0.13.0` once npm serves it, regenerate the lockfile, and confirm one engine and one Cligent.
6. Record the verification.

## Verification

Run `npm ci`, `npm run build` and the root `npm test` under Node 22 as CI does, `npm run e2e`, and `npx spex lint`; list the lockfile's copies of Playbook and Cligent.

The first step, verified on 2026-09-29 against the public registry's Cligent 0.28.0 and Playbook 17.1.0: `npm ci` installed the regenerated lockfile under Node 22; the root build passed; the root test gate passed 1,275/1,275 under Node 22 (34 script, 133 CLI, 355 core, 726 UI, 16 desktop and 11 server tests); the hermetic journeys passed 65 of 66 in Chromium on Node 25, the compiled example skipping for want of its captured fixture; the journeys typecheck; the core, UI and desktop catalogs are whole; `spex lint` passed.
The lockfile holds Playbook 17.1.0 and Cligent 0.28.0 at the tree's root, and slc 0.12.0 nests Cligent 0.27.1 and Playbook 16.0.0 with Cligent 0.26.0, both engines on runtime ABI 1 and artifact schema 3; Cligent 0.28's availability probe reads the `claude` and `codex` adapters available on the locked SDKs.

The second step, verified on 2026-09-29 against the public registry's slc 0.13.0: `npm ci` installed the regenerated lockfile under Node 22; the root build passed; the root test gate passed 1,275/1,275 under Node 22 (34 script, 133 CLI, 355 core, 726 UI, 16 desktop and 11 server tests); the hermetic journeys passed 65 of 66 in Chromium on Node 25, the compiled example skipping for want of its captured fixture; the journeys typecheck; the core, UI and desktop catalogs are whole; `spex lint` passed.
The lockfile and the installed tree hold one Playbook, 17.1.0, one Cligent, 0.28.0, and slc 0.13.0, each at the tree's root with no copy nested under slc, and the compiler resolves the app's own engine module; the agent SDKs stay at Claude Agent SDK 0.3.284, Codex SDK 0.159.0 with Codex 0.159.0, and OpenCode SDK 1.18.33.
