<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-085: The Config Directory

## Status

Done (2026-09-20): all three tasks completed; see Verification.

## Intent

Realize [DR-080](../decisions/080-the-config-directory-is-named-config.md): the shared config lives at `config/playbook.config.yaml` under the home, the core relocates it once from the home's former `playbook/` location ahead of the XDG one and removes the former file inside the home, the Space names the new path, and the core's floor moves to the Playbook release that resolves the same path.

## Deliverables

- [x] DR-080, the storage catalog, the Settings intent, the Space's unit and family tables, the relocation item and its coverage name `config/playbook.config.yaml` and the two former locations.
- [x] The core resolves, relocates, validates and classifies the new path; the former file inside the home is removed with its emptied directory; the docs and changelog follow.
- [x] Coverage: the relocation test from both former locations, the Space suites and journeys over the new path.
- [x] The core's dependency floor names the Playbook release shipping DR-064.

## Tasks

Each task below is exactly one commit and runs its focused gate before the next begins.

1. Specs: the decision record, the storage, settings, space and core-service items, the map.
2. The move: the core's resolver, relocation and classification, every test and journey over the new path, the storage catalog doc, the release smoke doc and the changelog.
3. The floor: the core's dependency on the Playbook release shipping DR-064, with the lockfile.

## Verification

Task 1 (2026-09-20): `spex lint` passed.
Task 2 (2026-09-20): with the Playbook candidate installed, the root build passed; the root test gate passed 1,221/1,221 (22 script, 133 CLI, 325 core, 717 UI, 14 desktop, and 10 server tests); the browser suite passed 61/61; `spex lint` passed; the spec items gained which locators the sibling move keeps and that the relocation walk stops at the nearest present former file.
Task 3 (2026-09-20): on the published Playbook 15.0.0, the root build passed; the root test gate passed 1,221/1,221; the browser suite passed 61/61; `spex lint` passed.
