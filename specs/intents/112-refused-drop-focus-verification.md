<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-112: Await Refused Drop Focus Restoration

## Status

Implemented (2026-10-21).

## Intent

Observe the existing asynchronous focus restoration after a refused Drop without weakening its expected control or changing runtime behavior ([DR-010](../decisions/010-interface-craft.md), [[run-view-113](../packages/run-view.md#run-view-113)]).

## Deliverables

- [x] Await the retained Drop control's focus in the refused-drop integration case, preserving its working-line and refusal assertions.
- [x] Verify the run-view integration file.

## Tasks

1. Correct the focus observation and verify the existing delivery-flow coverage [[run-view-94](../packages/run-view.md#run-view-94)].

## Verification

The full run-view integration file passed all 140 tests, including the refused-drop case, with no skips.
Spec lint passed with zero errors and one existing core-service-41 sentence warning.
The failed final-main assertion remains historical evidence; this change does not claim the failed run eventually restored focus.
