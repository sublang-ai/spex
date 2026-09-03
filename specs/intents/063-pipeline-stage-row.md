<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-063: The Pipeline as a Stage Row

## Status

In progress.

## Intent

A playbook card in Playbooks shows its compilation pipeline as the row it is — Source → Gears → State machine — instead of hiding it behind a "Pipeline" / "Hide pipeline" button; each stage in the row opens its artifact beneath, so a reader sees at a glance what a playbook is made of and expands any stage in one click ([DR-010](../decisions/010-interface-craft.md) §8, [DR-005](../decisions/005-compilation-integration.md)).

## Deliverables

- [ ] Every configured playbook card and the example card carry the stage row in place of the toggle button: three stage toggles joined by arrows, a missing stage struck through with its tooltip, one stage open at a time, pressed again to close (playbook-library-22, playbook-library-23, playbook-library-35).
- [ ] Artifacts load when a stage is first opened; the derived state list sits beneath the State machine stage; markdown stages render as formatted text, the FSM as code (playbook-library-22).
- [ ] Unit coverage and the Playbooks journey updated to open stages from the row.

## Tasks

1. Stage row on both cards, lazy artifacts, spec items amended.
2. Tests and the journey.

## Verification

Recorded on completion.
