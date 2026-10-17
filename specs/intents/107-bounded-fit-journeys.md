<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-107: Bounded Fit Journeys

## Status

Done (2026-10-17).

## Intent

Keep the browser's full fit evidence within independent journey budgets.

## Deliverables

- [x] Divide the eight-surface matrix into cohesive fresh cases without reducing its measurements or shared chrome.
- [x] Measure resting and live elapsed-time yield points in a separate real session.
- [x] Verify the three focused journeys with the existing time limits.

## Tasks

1. Separate the matrix and elapsed-yield cases, retaining real setup and every assertion, and verify their bounded execution.

## Verification

The retained failed browser trace shows the complete matrix finishing just before the whole-case deadline, followed by fixture shutdown and connection refusal during the appended yield measurement.
Both recorded matrices contain all 200 measurements with no geometry finding or accessible-name drift.
The failed run remains failed; the new cases must execute their own final assertions.

The three focused hermetic journeys passed once with retries disabled: the conversation/project matrix in 41.8 seconds, the authoring/settings matrix in 46.2 seconds, and the independent elapsed-yield case in 11.8 seconds.
The two matrix cases recorded exactly 200 measurements, 25 per original surface, with their final assertions executed; the elapsed case retained both complete divider sweeps and its real Abort.
The matrix cases retain the 120-second limits, and the fresh elapsed case uses the ordinary 45-second limit; action and expectation bounds are unchanged.
Core, UI and server builds, journey type checking, spec lint and independent review passed.
