<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-105: Installed Module Availability

## Status

Done (2026-10-17).

## Intent

Keep retained files of another environment lock out of configuration imports so a later successful install can recover in the same process.

## Deliverables

- [x] Require matching installed package records before registry and Git module imports.
- [x] Verify failed restoration and same-process recovery through a real core.

## Tasks

1. Gate module availability by the installed lock and guard its install record during composition.

## Verification

The actual-core regression fails before the fix: a successful resolve leaves configuration invalid until restart.
The final regression and 14 affected environment and configuration-freshness tests pass.
Core build, types, translations, spec lint, diff checks and independent review pass.
