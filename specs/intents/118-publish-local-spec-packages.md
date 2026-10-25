<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-118: Publish Local Spec Packages

## Status

Implemented and integration-tested (2026-10-25); live ordinary-user validation remains pending.

## Intent

Let fresh users publish their local spec and skill packages from the IDE without creating a playbook or using a separate API token.
Keep publishing outcomes truthful after a successful release and a refused repeat attempt.

## Deliverables

- [x] Local path packages expose the existing publishing preview and confirmation.
- [x] Repeated publication refusals remain visible without displaying an old success as new.
- [x] The relevant integration journey and existing authoring flow pass.
- [x] The concise user guide describes the supported flow.

## Tasks

1. Specify, implement, verify and document local-package publishing and its current-attempt outcome display in one coherent commit.

## Verification

- Passed `npm run build`: workspace builds, UI and shell catalogs, and TypeScript checks.
- Passed `npm run typecheck -w e2e`.
- Passed `npm test -w packages/ui -- src/components/environment-section.test.tsx src/components/authoring-workspace.test.tsx`: 87 tests across both files, including the unchanged authoring path, current-path eligibility, stale/delayed preview reset, target-origin changes, first success followed by two identical refusals, and a different package's success.
- Passed `npm run journeys -w e2e -- tests/publish.spec.ts`: both real-core browser journeys, covering the existing draft flow and local spec-and-skill publishing, Cancel without upload, changed-request preview reset, two immutable-version refusals, second-project registry installation with native exports, and signed-out target guidance.
- Git-row exclusion is covered by the UI integration test; the browser journey verifies registry and built-in exclusions.
- Passed `npm run prepush`: no conflict markers, spec lint with zero errors and one existing warning, workspace build and catalog/type checks, and e2e typecheck; `prepush: clean`.
- Pending separately: live ordinary-user publication and installation at the deployed service; the stand-in browser journeys do not establish this proof.
