<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-082: Committed Queue Realization

## Status

Done (2026-09-17): all four tasks completed; see Verification.

## Intent

Realize [DR-077](../decisions/077-up-next-is-a-committed-queue.md) and its current package contracts: one committed queue, a core-published next standing, clean-settlement handoff, and one presentation across the Dashboard, project Overview, resolved delivery card, and Captain home.
The spec plane is already current; any implementation evidence that changes behavior shall update the affected package item, and `map.md` where its index changes, in the same task commit.

## Deliverables

- [x] The core publishes exactly one next scheduling standing per project, including manual-start availability and a structured failure cause, without storing another intent state.
- [x] Clean attributed settlement advances once without typed trace proof, while failure, abort, an ending control, a surviving park, an after-link, or refused admission holds without retry.
- [x] Dashboard and Overview show every row as `Queued`, distinguish `Next`, render the shared standing with conditional Start, keep blocked and later rows inert without disabled Start, and offer one visible Queue capture action.
- [x] The resolved delivery card and Captain home use that same standing, including conditional Start and the correct Remove target when Undo restores a waiting row.
- [x] Core, component, and browser coverage prove the six standings, settlement races, capture positions, focus behavior, and responsive row and card fit.

## Tasks

Each task below is exactly one commit and runs its focused gate before the next begins.

1. Core standing and handoff: extend the protocol and ledger projection, represent active settlement and ending-control outcomes, replace the typed-trace gate, and cover the settlement, park, failure, abort, verdict, dependency, and admission races in core tests.
2. Dashboard and Overview: add the shared standing presentation, consume the core-published next row in Up next and the all-clear, add the inline Queue control, preserve capture reveal semantics, and cover all six standings, row roles, capture positions, and responsive structure in Dashboard component tests.
3. Run View and Captain home: consume the shared presentation in resolved delivery and next cards, give each queued-intent row one responsive text region, stage only a manual-ready Start, repair Remove/Undo focus when Start is absent, and cover every standing and ended-session behavior in Run View component tests.
4. Acceptance and closure: extend the Dashboard row-fit and Run View card-fit browser journeys through the public UI, run the full build and test gates, then record the exact results and close this intent once every deliverable holds.

## Verification

Planned: task 1 runs `npm run build -w packages/core`, `npm test -w packages/core`, and `npm run build -w packages/ui`; tasks 2 and 3 each run `npm run build -w packages/ui` and `npm test -w packages/ui`; task 4 runs `npm run build`, `npm test`, `npm run e2e`, and `spex lint`.
Task 1 (2026-09-17): core build passed; focused ledger, session, and queue-advancement integration tests passed 67/67; the full core suite passed 316/316; the UI build passed against the extended protocol; and `spex lint` passed.
Task 2 (2026-09-17): UI build passed; the focused Dashboard component suite passed 76/76; the full UI suite passed 675/675; and `spex lint` passed.
Task 3 (2026-09-17): UI build passed; the focused Captain Home, Run View, and App suites passed 194/194; the full UI suite passed 688/688; and `spex lint` passed.
Task 3 review fixes (2026-09-17): on the delivered Task 3 state, the UI build passed; the full UI suite passed 689/689; and `spex lint` passed.
Task 4 (2026-09-17): the root build passed; the root test gate passed 1,182/1,182 (22 script, 133 CLI, 316 core, 689 UI, 12 desktop, and 10 server tests); the full browser suite passed 57/57, including the Dashboard capture and queued-row/card fit journeys; the end-to-end TypeScript check and `spex lint` passed.
