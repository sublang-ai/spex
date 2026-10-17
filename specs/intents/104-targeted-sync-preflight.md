<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-104: Targeted Sync Preflight

## Status

Done (2026-10-17).

## Intent

Keep a repository's sync independent of unrelated repository detail failures while preserving complete namespace discovery and authoritative target checks.

## Deliverables

- [x] Decide and specify selected-target reads separately from the full Groups view.
- [x] Implement catalog reuse, selected authority and read-order reconciliation.
- [x] Verify real-core refusal, notice, move and concurrent-read cases and focused gates.

## Tasks

1. Separate destination preflight from full host enrichment with integration coverage.

## Verification

The 80-check affected host and space suite passes.
Focused checks after the final guards pass: startup 1, account/refusal CAS 5, sharing notice 5.
The 13 new real-core cases cover target isolation, refusals, catalog matching, collisions, moves, read ordering, startup, account changes and first-notice races.
Core and CLI builds, types, translations, spec lint and independent review pass.
The account-generation fence covers selected reads; successful full-view responses retain their existing credential behavior.
