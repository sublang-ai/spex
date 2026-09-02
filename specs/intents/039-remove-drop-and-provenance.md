<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-039: Remove, Drop, and Provenance

## Status

Done

## Intent

Make removing a queued intent one click with no trace, keep Drop a one-click verdict on worked intents, and name the provenance action after what it opens, per [DR-038](../decisions/038-history-is-done-work.md).

## Deliverables

- [x] The history read excludes intents dropped before any finished turn; the Dashboard's queue rows offer Remove.
- [x] No confirmation on Remove or Drop anywhere — queue row, attention row, delivery card.
- [x] Provenance actions read "Issue #N", "PR #N", "IR-N", or "Session"; capture keeps the source's labels.

## Tasks

1. Core: the worked rule in the history read and its coverage; labels on the intent source.
2. UI: Remove and Drop without confirmation; provenance labels; the queue-instead-of-send note points at the Overview.

## Verification

core 171 (a never-worked drop absent from every history page, a worked drop present) and ui 263 green; live: the nine never-started "dropped" rows vanished from History by derivation, the queue row's menu reads "Edit text / Remove" and Remove acts on the click, and captured intents keep their labels.
