<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-068: Removing a History Intent

## Status

Done (2026-09-02).

## Intent

A done or dropped intent the Boss no longer wants on the record — a test message, a mistake — can be removed from History from the row itself, behind the inline confirm every destructive action wears ([DR-010](../decisions/010-interface-craft.md) §4), by one appended act the ledger fold honors so the row leaves every band without a trace and without a state column ([DR-035](../decisions/035-intent-ledger.md), [DR-038](../decisions/038-history-is-done-work.md)); a record row stays, since a file in the specs tree is not the ledger's to remove.

## Deliverables

- [x] A History intent row carries a remove control, revealed on hover and focus, that opens the inline confirm ("Remove" / "Keep") naming the intent; confirming appends the act and the row leaves History at once (dashboard-27).
- [x] The core accepts `intent.remove` for a closed intent, appends a `remove` act to the project's intent log, and every fold — History, Sources' open-intent state, attention — treats a removed intent as absent; an open intent refuses with a conflict (core-service-79, dashboard-10).
- [x] Unit coverage in the core fold and the Dashboard, one core integration test over the protocol, and one browser journey removing a done intent from History.

## Tasks

1. The act and the fold in the core; protocol command; spec items amended.
2. The row control and confirm in the Dashboard and the Overview; tests and the journey.

## Verification

- Specs: `core-service-79` (the command, its refusals, and the acts kept), `core-service-52` and `core-service-53` amended for the act and its coverage, `dashboard-10` (a removed intent absent from every derived state), `dashboard-27` (the row's control and confirm), `dashboard-38` (its coverage), the new `dashboard-52` journey item, and a dated note in DR-035's Status deciding the permanent deletion it had deferred.
- `npm test` (workspaces): 6 suites, 0 failures — `packages/core` 182 tests.
  New coverage: `core-service-79` in `ledger.test.ts` — a remove act takes a closed intent out of `getIntent`, the History page, and the source binding, leaves the attention set and its neighbours' states untouched (the removed dispatch still bounds their turn ranges, so a ruled chat turn never re-summons), and survives a restart with `queue`, `dispatch`, `close`, `remove` still in the act log; and over the protocol in the `core-service-57` flow — removing the closed done intent empties its History row, leaves `ledger.get` unchanged, and refuses an open intent `conflict`, an unknown and an already-removed one `not_found`.
- `packages/ui`: `npx vitest run` — 23 files, 394 tests, all passing.
  New coverage in `dashboard-surface.test.tsx`: each intent row's control named "Remove ⟨title⟩ from history" with the record row carrying none; the confirm in the row's place with Keep focused, backing out to the control with nothing sent; Remove sending `intent.remove`, the row leaving at once, and focus landing on the next row's control.
- `npx tsc --noEmit -p packages/ui`: clean.
- `e2e`: `npx playwright test` — 29 journeys passing, including the fit journey (`run-view-105`) and the new `dashboard-52`: Keep leaves the seeded done row listed, Remove drops it while its neighbours stay, a reload finds it gone, and the Overview draws the same rows with the same control.
- `node packages/cli/dist/cli.js lint`: no problems found.
