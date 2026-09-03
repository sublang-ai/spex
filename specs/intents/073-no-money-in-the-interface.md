<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-073: No Money in the Interface

## Status

Done.

## Intent

The player pane printed a dollar figure beside each turn's token totals, and in a demo that figure reads as a bill; [DR-044](../decisions/044-no-money-in-the-interface.md) takes money out of the interface, so the usage line reports tokens only while the core keeps recording what the runtime reported.

## Deliverables

- [x] The usage line shows token totals only, and nothing for a cost, whatever its provenance (run-view).
- [x] The interface's usage view carries no cost fields; the protocol and the records are unchanged.
- [x] The fixture replay proves a recorded cost never renders.

## Tasks

1. Usage line, usage view, spec item, decision record, tests.

## Verification

Task 1: `Usage` in `PlayerPane.tsx` prints the token line alone; the reducer's usage view keeps tool uses and tokens and drops `totalCostUsd`/`costSource`; the fixture stream's `provider-reported` cost stays in the fixture and the replay asserts no currency sign in any pane.
Rewrote run-view-6 and its replay assertion in run-view-14's fixture item; added DR-044 and its map row.
Green on `npx tsc --noEmit -p packages/ui`, `packages/ui` vitest, and `spex lint`.
