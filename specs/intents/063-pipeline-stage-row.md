<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-063: The Pipeline as a Stage Row

## Status

Done.

## Intent

A playbook card in Playbooks shows its compilation pipeline as the row it is — Source → Gears → State machine — instead of hiding it behind a "Pipeline" / "Hide pipeline" button; each stage in the row opens its artifact beneath, so a reader sees at a glance what a playbook is made of and expands any stage in one click ([DR-010](../decisions/010-interface-craft.md) §8, [DR-005](../decisions/005-compilation-integration.md)).

## Deliverables

- [x] Every configured playbook card and the example card carry the stage row in place of the toggle button: three stage toggles joined by arrows, a missing stage struck through with its tooltip, one stage open at a time, pressed again to close (playbook-library-22, playbook-library-23, playbook-library-35).
- [x] Artifacts load when a stage is first opened; the derived state list sits beneath the State machine stage; markdown stages render as formatted text, the FSM as code (playbook-library-22).
- [x] Unit coverage and the Playbooks journey updated to open stages from the row.

## Tasks

1. Stage row on both cards, lazy artifacts, spec items amended.
2. Tests and the journey.

## Verification

- `npx vitest run` in `packages/ui`: 23 files, 390 tests passing — including the new `PBLIB-22/23` cases (one artifacts request per card across three opens, the loading and failure copy, the struck-out absent stage with its tooltip, the state list above the FSM code) and the rewritten `PBLIB-35` example-card case over its four in-memory stages.
- `npx tsc --noEmit -p packages/ui`: clean.
- `npx playwright test` in `e2e`: 27 hermetic journeys passing, among them the reworked `playbook-library-41` (a press opens a stage, a press beside it swaps, a second press closes) and `run-view-105`, which measures fit on the Playbooks surface in both sidebar states at six widths from 320px to 1280px.
- `npm test` at the root: all workspace suites passing.
- `node packages/cli/dist/cli.js lint`: no problems found.
- Read by eye at 1280px and at 320px with the sidebar collapsed: the row sits flush with the card's content, the arrows travel with the stage before them so a wrapped line starts on a label, and "Normalized" holds the label budget with the full stage name in its title ([DR-041](../decisions/041-chrome-that-fits.md)).
