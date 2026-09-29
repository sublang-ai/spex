<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-091: Playbook 17.1, slc 0.13 and Cligent 0.28 Adoption

## Status

In progress on `models-named-by-runtime`, in two steps: Playbook 17.1, Cligent 0.28 and the agent SDK locks now; slc 0.13 once npm serves it.

## Intent

Realize [DR-092](../decisions/092-playbook-17-1-slc-0-13-cligent-0-28-adoption.md): the core on Playbook 17.1 and Cligent 0.28, both shells on slc 0.13, the agent SDKs locked at the releases Cligent 0.28 tests, and one engine and one Cligent in the tree.

## Deliverables

- [ ] DR-092, the amended records' status lines, and the map.
- [ ] The core's floors `^17.1.0` and `^0.28.0`, the lockfile regenerated from the public registry with the app's Playbook and Cligent at the tree's root, and the agent SDKs locked at Claude Agent SDK 0.3.284, Codex SDK 0.159.0 with Codex 0.159.0, and OpenCode SDK 1.18.33.
- [ ] The tests, fixtures and journeys following what the new releases change.
- [ ] The changelog.
- [ ] Both shells on slc `^0.13.0`, the lockfile holding one Playbook, 17.1.0, and one Cligent, 0.28.0.

## Tasks

1. Record the decision.
2. Raise the core's floors, regenerate the lockfile and lock the agent SDKs.
3. Follow what the new releases change in the tests, fixtures and journeys.
4. Write the changelog and record the first step's verification.
5. Raise both shells to slc `^0.13.0` once npm serves it, regenerate the lockfile, and confirm one engine and one Cligent.
6. Record the verification.

## Verification

Run `npm ci`, `npm run build` and the root `npm test` under Node 22 as CI does, `npm run e2e`, and `npx spex lint`; list the lockfile's copies of Playbook and Cligent.
