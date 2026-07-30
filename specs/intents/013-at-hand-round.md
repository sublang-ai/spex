<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-013: At-Hand Round

## Status

Done

## Intent

Materialize [DR-009](../decisions/009-at-hand-interaction.md) across the critical paths: in-place editing, global attention, discoverable creation, and browsable history.

## Deliverables

- [x] ProfilePopover: anchored in-place profile switch + model/effort editing through the validated config path ([[run-view-32](../packages/run-view.md#run-view-32)]), used by the captain identity and the Library role mappings
- [x] Sessions nav badge from the Dashboard's attention derivation ([[run-view-34](../packages/run-view.md#run-view-34)])
- [x] Slash-menu "compile a new playbook" entry ([[run-view-34](../packages/run-view.md#run-view-34)])
- [x] Past sessions on the Captain home; read-only transcripts with an ended notice and a start-new affordance ([[run-view-33](../packages/run-view.md#run-view-33)])
- [x] Tests per [[run-view-35](../packages/run-view.md#run-view-35)]/[[run-view-36](../packages/run-view.md#run-view-36)]; live verification of the popover save round-trip to the shared config, the badge on a parked session, and the read-only past transcript

## Tasks

1. Realized across the commits referencing `IR-013`.

## Verification

- Root build/test green.
- A profile tweak from the popover lands in the shared config file without leaving Sessions.
- The Sessions badge counts sessions needing a human and clears when they are answered or ended.
