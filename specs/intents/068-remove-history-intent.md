<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-068: Removing a History Intent

## Status

In progress.

## Intent

A done or dropped intent the Boss no longer wants on the record — a test message, a mistake — can be removed from History from the row itself, behind the inline confirm every destructive action wears ([DR-010](../decisions/010-interface-craft.md) §4), by one appended act the ledger fold honors so the row leaves every band without a trace and without a state column ([DR-035](../decisions/035-intent-ledger.md), [DR-038](../decisions/038-history-is-done-work.md)); a record row stays, since a file in the specs tree is not the ledger's to remove.

## Deliverables

- [ ] A History intent row carries a remove control, revealed on hover and focus, that opens the inline confirm ("Remove" / "Keep") naming the intent; confirming appends the act and the row leaves History at once (dashboard-27).
- [ ] The core accepts `intent.remove` for a closed intent, appends a `remove` act to the project's intent log, and every fold — History, Sources' open-intent state, attention — treats a removed intent as absent; an open intent refuses with a conflict (core-service, dashboard-10).
- [ ] Unit coverage in the core fold and the Dashboard, one core integration test over the protocol, and one browser journey removing a done intent from History.

## Tasks

1. The act and the fold in the core; protocol command; spec items amended.
2. The row control and confirm in the Dashboard and the Overview; tests and the journey.

## Verification

Recorded on completion.
