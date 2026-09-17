<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-081: Letting Go Ends The Parked Run

## Status

Done (2026-09-17): every suite below is green; see Verification.

## Intent

Dropping interrupted work ends the run it interrupted, and every run parked on the Boss carries the same door out of the conversation.

## Deliverables

- [x] A decision record amending the failed-workflow control and the ending of a failed workflow in scope, with reciprocal status lines and a map row.
- [x] `intent.close` as `dropped` ends a parked run first, records the verdict once that turn settles with nothing still parked, and refuses with its cause otherwise.
- [x] The run view's notice stands for a run parked on a Boss question, with Drop alone and the composer beneath it.
- [x] The Dashboard's session question row names both of its doors.
- [x] Core, fixture-stream and browser coverage for the new behavior.

## Tasks

1. Record the decision, the reciprocal status lines and the map row; amend the core, Dashboard and run-view spec items and their verification.
2. End the parked run inside `intent.close`, with its core coverage.
3. Stand the notice for a question park and name both doors on the Dashboard row, with their fixture-stream and browser coverage.

## Verification

- `spex lint`: no problems found.
- `npm run build` and `npm test` at the root: green — scripts 22, CLI 133, core 310, UI 642, desktop 12, server 10.
- `npm test -w packages/ui` (642), `npm test -w packages/cli` (133), `node --test packages/core/dist/platform.integration.test.js` (1): green.
- `npm run e2e`: 55 journeys passed, the new question-park round trip among them.
- Note: the browser harness opens a continued session with no engagement restored, so it can prove the notice and a refused ending but not a successful one; the successful ending runs in the core suite, where a scripted decision engages a real root for the shell to stop.
- Note: the core suite drives the question park alone — the turn-scoped `runtime_error` a failure stands on arrives there only on a turn that aborts and disposes its runtime, leaving no live run to stand parked; the parked-failure derivation keeps its fixture-stream coverage.
