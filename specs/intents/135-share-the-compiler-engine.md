<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-135: Share the Compiler Engine

## Status

Done (2026-10-29): slc 0.20.0 is published and the Spex dependency change is merged.
The owner clarified that app publication is not required for this work, so no app tag or release was created; the prepared `0.9.0-beta.19` version stays available for a future source-only pre-release.

## Intent

Adopt the compiler's published Playbook peer contract and make app dependency divergence fail before release.

## Deliverables

- [x] Record and enforce the shared-engine installation contract.
- [x] Adopt published slc 0.20.0 with existing runtime and SDK resolutions preserved.
- [x] Verify the app integration and the installed live acceptance; app publication is outside the completed scope.

## Tasks

1. Adopt the compiler release, add the dependency gate and its integration coverage, and prepare the app beta.
2. Record the installed smoke and the delivery; keep the prepared beta version available for a future app release.

## Verification

slc 0.20.0 is published from `acaee3fae6cf902c33961d006d7cff139b3c7007`, with its required Playbook `^18.1.0` peer and exact 18.1.0 development reference verified from the registry.
npm generated the app lock: slc advances from 0.19.1 to 0.20.0 and its nested Playbook 17.11.1 disappears; all 836 other installed-package version, resolution and integrity fingerprints remain unchanged.
The dependency suite passes all 19 cases: 16 isolated refusal/acceptance fixtures, the real installed closure, and bundled artifact execution through both shells.
A clean registry `npm ci`, `npm run check:dependencies` and `npm run prepush` pass; spec lint has zero errors and its pre-existing `core-service-41` advisory.
The combined candidate `e2bc476b0fd31391f702e31d34f0d635c3f1c7ec`, holding the package-manager library refactor from main, passed the same clean install, pre-push and 19 dependency checks, and its installed smoke passed fresh installation, both shells, the packed CLI journeys and real coder dispatch, output, abort and cleanup with no provider waiver, as the release record kept on [pull request 290](https://github.com/sublang-ai/spex/pull/290) documents.
PR 288 passed its required CI and merged as `9bbec6e85ccda6a69928ed54231262a467aaa52d`; the [IDE 0.9.0-beta.19 source preparation](../../docs/releases/0.9.0-beta.19-preparation.md) records the later source delivery without an app release.
