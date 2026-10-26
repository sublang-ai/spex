<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-124: Adopt the Published Runtime Patches

## Status

Verified candidate (2026-10-25); consumer gates passed, with independent review, integration and app release still pending.

## Intent

Prepare the app to consume the published runtime corrections and stage the corrected built-in CODE package without changing existing environment selections.

## Deliverables

- [x] Adopt the three published patches with the existing SDK and xstate identities preserved.
- [x] Prepare matching `0.9.0-beta.17` shell metadata and app notes without changing the scaffold CLI release.
- [x] Verify the installed consumer closure and staged built-in package before integration.

## Tasks

1. Adopt the runtime patches, verify the consumer closure and built-in package, and prepare the matching beta source-app metadata in one candidate commit.

## Verification

Upstream receipts verify public Cligent 0.36.1, Playbook 18.0.1 and slc 0.19.1 artifacts and their release provenance.
The npm-generated lock changes only the four workspace declarations and Playbook 18.0.1, Cligent 0.36.1, slc 0.19.1 and Zod 4.6.6 records.
One locked `npm ci` and the required pre-push gate passed, including the normal build and built-in staging.
ESM resolution from both shells, the core and both Playbook consumers shares Cligent 0.36.1, xstate 5.33.3 and the existing SDKs; slc retains compiler-only Playbook 17.11.1.
All 67 copied built-in playbook files equal the verified public Playbook archive, including the CODE source and compiled module hashes.
Eight selected existing consumer cases passed with one file worker: offline built-in seeding and update, catalog loading, CLI continuation, classified workflow reopening, compiler SDK loading and the shell compiler contracts.
No full local suite, model call or live installed-app acceptance was run.
The app release separately requires exact committed-main CI and `npm run smoke -- --live` from the final installed candidate.
An existing environment's explicit Update and effective CODE source/module verification remain separate from npm dependency adoption.
No source-app publication or replacement of an installed desktop is claimed.
