<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-021: Release Readiness Round

## Goal

Land the branch on main release-ready: the classified relationship presentation per [DR-016](../decisions/016-relationship-presentation.md), a pre-release smoke suite (automated script plus manual checklist), re-vendored layout-agnostic playbook sources, and the mainline merge.

## Deliverables

- [ ] Spec view classifies citation edges (uses; serves/provides; composes/via; verifies/executes) with labeled rows, grouped inbound backlinks, and per-file relationship rollups; Academy renders every kind.
- [ ] SPECV items amended to the classified model.
- [x] `npm run smoke` drives the automated pre-release checks; `docs/release-smoke.md` carries the full checklist including the manual steps; RELEASE spec gains the smoke gate.
- [x] Vendored `/code` and `/discuss` sources refreshed from the layout-agnostic upstream.
- [ ] Branch merged to main with CI green.

## Tasks

1. Implement edge classification and clause-side binding split in the spec-view model with unit coverage.
2. Render relationship rows, inbound groups, and file rollups in the spec view; extend component tests over an Academy-shaped fixture.
3. Amend SPECV's item, citation, and coverage items to the classified model.
4. Add the automated smoke script and npm alias; write the release smoke checklist document.
5. Amend the RELEASE spec with the smoke-gate items and map rows.
6. Re-vendor the playbook sources from upstream main.
7. Merge main into the branch, reconcile, then merge the branch to main and verify CI.

## Acceptance criteria

- `npm run build`, `npm test`, and `spex lint` pass at the repo root.
- In the Academy project, a binding item shows serves/provides rows, a scenario shows composes rows, a composition test shows executes/verifies rows, and a used package item shows grouped inbound backlinks — each entry jumping in view.
- `npm run smoke` exits zero on a healthy tree and names the failing stage otherwise.
- Main's CI is green on the merge commit.
