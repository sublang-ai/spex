<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-085: The Config Directory

## Status

In progress.

## Intent

Realize [DR-080](../decisions/080-the-config-directory-is-named-config.md): the shared config lives at `config/playbook.config.yaml` under the home, the core relocates it once from the home's former `playbook/` location ahead of the XDG one and removes the former file inside the home, the Space names the new path, and the core's floor moves to the Playbook release that resolves the same path.

## Deliverables

- [x] DR-080, the storage catalog, the Settings intent, the Space's unit and family tables, the relocation item and its coverage name `config/playbook.config.yaml` and the two former locations.
- [ ] The core resolves, relocates, validates and classifies the new path; the former file inside the home is removed with its emptied directory; the docs and changelog follow.
- [ ] Coverage: the relocation test from both former locations, the Space suites and journeys over the new path.
- [ ] The core's dependency floor names the Playbook release shipping DR-064.

## Tasks

Each task below is exactly one commit and runs its focused gate before the next begins.

1. Specs: the decision record, the storage, settings, space and core-service items, the map.
2. The move: the core's resolver, relocation and classification, every test and journey over the new path, the storage catalog doc, the release smoke doc and the changelog.
3. The floor: the core's dependency on the Playbook release shipping DR-064, with the lockfile.

## Verification

Planned: task 2 runs `npm run build`, `npm test`, `npm run e2e` and `spex lint` with the Playbook candidate installed; task 3 runs `npm ci`, `npm run build` and `npm test` on the published release.
Task 1 (2026-09-20): `spex lint` passed.
