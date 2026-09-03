<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-067: Running Sessions Listed Again

## Status

In progress.

## Intent

The Dashboard lists the sessions running right now that need nothing from the Boss as their own band beside Needs attention — the owner first folded them into the attention queue and now finds the two focuses different: one is a summons, the other is a glance at what is working — so a presenter sees every live run in one place without a summons masking it ([DR-035](../decisions/035-intent-ledger.md), [DR-038](../decisions/038-history-is-done-work.md)).

## Deliverables

- [ ] A Running band below Needs attention lists every live session with a turn in flight that carries no attention entry: the project, the session's title, what it is doing in the status vocabulary ("deciding", "coder working · 12m"), and an opener; a session in the attention queue never repeats here; the band reads "Nothing running." while empty and stays in place (dashboard).
- [ ] The band derives from the same folds the sidebar and the Now band read — no new core state; the project filter above the queue applies to it.
- [ ] The decision records note the reversal; unit coverage and one browser journey with a turn in flight.

## Tasks

1. Band, derivation, spec items, decision notes.
2. Tests and the journey.

## Verification

Recorded on completion.
