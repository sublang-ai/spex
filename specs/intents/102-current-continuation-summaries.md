<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-102: Current Continuation Summaries

## Status

Done (2026-10-17).

## Intent

Make the existing continuation reading in [[core-service-32](../packages/core-service.md#core-service-32)] include deterministic current-folder and stored-member execution refusals before a message is attempted.
Preserve read-only history and final admission checks.

## Deliverables

- [x] Clarify the summary's current execution checks and read-only boundary.
- [x] Refresh summaries through native validation and current configuration without opening a runtime.
- [x] Verify actual-core continuation, refresh, preservation and concurrent-edit cases and complete the relevant gates.

## Tasks

1. Correct the continuation read model and its publication, with focused actual-core integration evidence.

## Verification

The focused integration matrix covers current folder and alias refusals, direct binding edits, stored-member drift, tuning and unrelated playbooks, restart, exact session preservation and final admission after a stale positive reading.
Native-validation races cover changed project inputs, settlement notification through repeated edits and deletion during an idle report.
All 31 focused actual-core cases, core and CLI builds, translation checks and spec lint passed.
Independent review found no remaining actionable issue; exact-head CI remains the merge gate.
