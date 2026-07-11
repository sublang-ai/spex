<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-013: At-Hand Round

## Goal

Materialize [DR-009](../decisions/009-at-hand-interaction.md) across
the critical paths: in-place editing, global attention, discoverable
creation, and browsable history.

## Deliverables

- [x] ProfilePopover: anchored in-place profile switch + model/effort
  editing through the validated config path (RUN-32), used by the
  captain identity and the Library role mappings
- [x] Sessions nav badge from the Dashboard's attention derivation
  (RUN-34)
- [x] Slash-menu "compile a new playbook" entry (RUN-34)
- [x] Past sessions on the Captain home; read-only transcripts with
  an ended notice and a start-new affordance (RUN-33)
- [x] Tests per RUN-35/36; live verification of the popover save
  round-trip to the shared config, the badge on a parked session,
  and the read-only past transcript

## Acceptance criteria

- Root build/test green.
- A profile tweak from the popover lands in the shared config file
  without leaving Sessions.
- The Sessions badge counts sessions needing a human and clears when
  they are answered or ended.
