<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-093: The Compiler Adopts the App's Cligent

## Status

In progress on `slc-0-14` (2026-10-01).

## Intent

Realize [DR-094](../decisions/094-the-compiler-adopts-the-apps-cligent.md): both shells on slc 0.14, the root override retired, one Cligent by the dependencies alone.

## Deliverables

- [x] DR-094, the amended records' status lines and the map.
- [ ] Both shells at `@sublang/slc` `^0.14.0`, no root `overrides`, the lockfile regenerated from the public registry; the changelog.
- [ ] `app-v0.9.0-beta.5`.

## Tasks

1. Record the decision.
2. Raise the floors, retire the override and regenerate the lockfile.
3. Prepare and publish the beta.

## Verification

Run `npm run build`, `npm test`, `npm run e2e` and `spex lint` at the root on the published packages; walk the smoke with its live stage.
