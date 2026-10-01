<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-093: The Compiler Adopts the App's Cligent

## Status

Completed on `slc-0-14`, merged to `main` in fa530e4 on 2026-10-01 (UTC), and released in `app-v0.9.0-beta.5`.

## Intent

Realize [DR-094](../decisions/094-the-compiler-adopts-the-apps-cligent.md): both shells on slc 0.14, the root override retired, one Cligent by the dependencies alone.

## Deliverables

- [x] DR-094, the amended records' status lines and the map.
- [x] Both shells at `@sublang/slc` `^0.14.0`, no root `overrides`, the lockfile regenerated from the public registry; the changelog.
- [x] `app-v0.9.0-beta.5`.

## Tasks

1. Record the decision.
2. Raise the floors, retire the override and regenerate the lockfile.
3. Prepare and publish the beta.

## Verification

Run `npm run build`, `npm test`, `npm run e2e` and `spex lint` at the root on the published packages; walk the smoke with its live stage.

Verified on 2026-10-01 on the registry's slc 0.14.0, Cligent 0.29.0 and Playbook 17.2.0: the root build passed; the root test gate passed (core, interface 742, desktop and server suites, every catalog whole); the hermetic journeys passed 65 with 1 skipped; `spex lint` passed; the lock resolves one Cligent, one Playbook and one slc with no override.
`npm run smoke -- --live` passed every stage on `937ca3a`; CI concluded `success` on the merge `fa530e4`, and the App Release workflow published `app-v0.9.0-beta.5` at 2026-10-01 03:50 UTC.
