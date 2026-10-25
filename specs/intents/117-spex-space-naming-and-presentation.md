<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-117: Spex Space Naming and Presentation

## Status

Implemented and verified (2026-10-25).

## Intent

Adopt Spex Space and the current production address, make the IDE destination clear, and correct observed presentation problems without changing functions.

## Deliverables

- [x] Current naming, defaults, translations and documentation agree.
- [x] The Space destination and affected layouts remain usable at supported sizes and with keyboard navigation.
- [x] Relevant checks pass.

## Tasks

1. Update and verify the naming contract, client default, navigation, documentation and observed presentation defects.

## Verification

Spec lint, catalog checks and the pre-push workspace build/type checks passed.
The affected core suite passed 43 tests, affected UI suites passed 403 tests, and the accessibility, localization and server-welcome browser journeys passed 11 tests.
Rendered checks covered five surfaces in both themes at desktop and narrow widths, plus long names at 200% zoom.
