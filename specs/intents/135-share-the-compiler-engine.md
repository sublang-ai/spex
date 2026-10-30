<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-135: Share the Compiler Engine

## Status

In progress (2026-10-29).

## Intent

Adopt the compiler's published Playbook peer contract and make app dependency divergence fail before release.

## Deliverables

- [x] Record and enforce the shared-engine installation contract.
- [x] Adopt published slc 0.20.0 with existing runtime and SDK resolutions preserved.
- [ ] Verify and publish app 0.9.0-beta.19.

## Tasks

1. Adopt the compiler release, add the dependency gate and its integration coverage, and prepare the app beta.
2. Record the installed release smoke and publish the verified beta.

## Verification

slc 0.20.0 is published from `acaee3fae6cf902c33961d006d7cff139b3c7007`, with its required Playbook `^18.1.0` peer and exact 18.1.0 development reference verified from the registry.
npm generated the app lock: slc advances from 0.19.1 to 0.20.0 and its nested Playbook 17.11.1 disappears; all 836 other installed-package version, resolution and integrity fingerprints remain unchanged.
The dependency suite passes all 19 cases: 16 isolated refusal/acceptance fixtures, the real installed closure, and bundled artifact execution through both shells.
A clean registry `npm ci`, `npm run check:dependencies` and `npm run prepush` pass; spec lint has zero errors and its pre-existing `core-service-41` advisory.
Exact-main CI and the installed smoke with its live stage remain pending.
