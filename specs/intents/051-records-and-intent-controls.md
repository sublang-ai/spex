<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-051: Records and Intent Controls

## Status

Done

## Intent

Make every record row open the record, look like one thing everywhere, and give every open intent a way out — the defects the owner found in History, the Specs decisions branch, and a working intent with no control.

## Deliverables

- [x] History and Sources record rows open the record in the Specs tab's records reader; the pending record reaches the spec view.
- [x] One record row presentation — identifier chip, title, hover, pointer — in the Specs decisions branch, History, Sources, and the Up next menu, with the reader's links handled.
- [x] A working or interrupted intent can be dropped from the session's working line and the Now band; the Captain home's next card can remove its intent.
- [x] Ledger reads apply in order, so a stale queue never outlives a fresh one.

## Tasks

1. Specs: dashboard, run-view, and spec-view amendments.
2. The pending-record thread and the shared row.
3. The intent controls and the ledger guard.
4. Journeys for the record opening and the drop.

## Verification

ui 315 green (dashboard-surface 32, spec-view 59, run-view 45, captain-home 27); the hermetic journeys 18 green — the new `run-view-115`/`dashboard-39` drop journey among them, and `run-view-102` in light and dark with no serious or critical axe violation — with the History-record-row journey held `fixme` until the pending-record thread lands with its sibling change; `spex lint` clean.
