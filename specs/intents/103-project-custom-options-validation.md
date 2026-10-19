<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-103: Project Custom Options Validation

## Status

Done (2026-10-17).

## Intent

Make a paired project's config state and project config writers validate custom options against the actual working folder before session creation.
Preserve authored options, cwd injection and global composition without a selected folder.

## Deliverables

- [x] Clarify project option validation and its global-context boundary.
- [x] Thread the actual paired folder through project reads and config writers.
- [x] Verify the real-core option, cwd, preservation and refusal cases and complete focused gates.

## Tasks

1. Validate paired-project custom options with real-folder context and integration coverage.

## Verification

The real-core matrix covers missing and invalid required options, exact real-folder injection, explicit cwd, a rejected optional cwd, raw/default preservation, global deferral, external invalid options and pairing drift during reads, edits and session admission.
The 9-check matrix and ordinary compiled enabling pass on the final guarded implementation; the affected config, freshness and authoring suite passes 54 checks, and the selected core config and lifecycle suite passes 30.
Core and CLI builds, translation checks, spec lint and independent review pass.
