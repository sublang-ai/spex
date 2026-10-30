<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-135: Share the Compiler Engine

## Status

The dependency fix is delivered: slc 0.20.0 is published and the Spex change is merged (2026-10-29).
The owner clarified that app publication is not required; no app tag or release is created for this work.
The follow-up CI prerequisite correction and release evidence are pushed in PR 290 and await its checks.

## Intent

Adopt the compiler's published Playbook peer contract and make app dependency divergence fail before release.

## Deliverables

- [x] Record and enforce the shared-engine installation contract.
- [x] Adopt published slc 0.20.0 with existing runtime and SDK resolutions preserved.
- [x] Verify the app integration and installed live acceptance.

## Tasks

1. Adopt the compiler release, add the dependency gate and its integration coverage, and prepare the app beta.
2. Record the installed smoke and delivery; keep the prepared beta version available for a future app release.

## Verification

slc 0.20.0 is published from `acaee3fae6cf902c33961d006d7cff139b3c7007`, with its required Playbook `^18.1.0` peer and exact 18.1.0 development reference verified from the registry.
npm generated the app lock: slc advances from 0.19.1 to 0.20.0 and its nested Playbook 17.11.1 disappears; all 836 other installed-package version, resolution and integrity fingerprints remain unchanged.
The dependency suite passes all 19 cases: 16 isolated refusal/acceptance fixtures, the real installed closure, and bundled artifact execution through both shells.
A clean registry `npm ci`, `npm run check:dependencies` and `npm run prepush` pass; spec lint has zero errors and its pre-existing `core-service-41` advisory.
The combined candidate includes the package-manager library refactor from main and passes the same clean install, pre-push and 19 dependency checks.
Its installed smoke passes fresh installation, both shells, packed CLI journeys, real coder dispatch and output, abort, cleanup and Node ABI restoration; no provider waiver is used.
The ordinary Electron cache contains the official archive verified against the package's pinned checksum after the first download exceeded its budget; the source, assertions and fresh npm cache are unchanged.
The [release preparation record](../../docs/releases/0.9.0-beta.19-preparation.md) preserves the attempts and evidence hashes.
PR 288 passes its required CI and is merged as `9bbec6e85ccda6a69928ed54231262a467aaa52d`.
App publication is outside the completed scope; any future app tag still requires the normal exact-commit CI and release workflow.
