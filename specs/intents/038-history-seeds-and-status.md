<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-038: History Seeds and Record Status

## Status

Done

## Intent

List every finished intent record in its project's History and only unfinished ones in Sources, classifying each record's status in the core so both agree, per [DR-038](../decisions/038-history-is-done-work.md).

## Deliverables

- [x] The records read classifies status and carries the file's last change; Sources lists open records only.
- [x] History merges finished records with worked intents newest first, one row per record, provenance-deduplicated.

## Tasks

1. Core: classification and last-change time on the records read, with coverage over the real status vocabulary.
2. UI: Sources filters on the classification; History renders record rows under ID tags in the merged timeline.

## Verification

core 171 (spec-view-14 classification over Done, Done —, Complete, Completed., Superseded;, In progress., Planned, Open, none) and ui 263 green; live on this machine: cligent's History lists its finished records under ID tags with the superseded one dimmed, its Sources count fell from 29 "open records" to 4, and the Open records tab holds only the unfinished ones.
