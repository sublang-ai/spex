<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-133: Add-Package Controls with the Environment

## Status

Implemented and verified locally (2026-10-29); awaiting review and integration.

## Intent

Let a fresh user who looks at a side's environment on the Playbooks surface find the ways to add a spec package there, and meet the project by its name rather than its spex repository's key.

## Deliverables

- [x] Add from registry, Add from folder and Add from Git stand directly beneath the environment's list, above the playbooks; New playbook, Authoring and Example keep their places.
- [x] The environment reads "Environment of ⟨project⟩" or "Environment of your own group"; the side switch carries no spex repository key in its labels, tooltips or accessible name.
- [x] The specs, the Chinese catalog, the UI tests and the Playbooks journey say the same.

## Tasks

1. Move the controls, rename the heading and the switch's tooltips and name, update playbook-library-41, -50, -92 and -94, the tests, the catalog and the changelog in one commit.

## Verification

- `spex lint`: 0 errors, 1 warning (the existing `core-service-41` sentence warning).
- `npm run build`: passed, including the catalog check after `npm run i18n:extract -w packages/ui` and three new Chinese entries.
- `npm test -w packages/ui -- src/components/environment-section.test.tsx src/components/library-surface.test.tsx src/components/authoring-workspace.test.tsx`: 3 files, 130 tests passed on Node 25 and again under `npx -y node@22`.
- `npm test -w packages/ui`: 59 files, 1278 tests passed.
- `npm run typecheck -w e2e`: passed.
- `npm run journeys -w e2e -- tests/library.spec.ts`: 3 passed, including the heading on both sides, no key in the section, and the add controls following the list and preceding the first playbook card.
- `npm run journeys -w e2e -- tests/known-package.spec.ts tests/publish.spec.ts`: 3 passed, driving Add from registry and Add by name at their new place.
- `npm run prepush`: clean — spec lint with the same warning, the workspace build with its catalog checks, and the e2e type check.
- No live walk on a signed-in instance was repeated after the change; the journeys run against the stand-in host and registry.
