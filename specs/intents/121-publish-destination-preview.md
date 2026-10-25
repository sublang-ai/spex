<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-121: Publish Destination Preview

## Status

Implemented and independently reviewed (2026-10-25); integration pending.

## Intent

Make the actual destination instance visible before confirming a package or playbook publication.

## Deliverables

- [x] The shared localized preview names the destination origin and wraps long origins.
- [x] Both two-instance browser publishing journeys verify the destination before their existing real-core uploads.
- [x] The guide asks readers to review the destination alongside the release contents.

## Tasks

1. Specify, implement, document and verify the shared publishing destination preview.

## Verification

- Passed `npm run prepush`: spec lint with zero errors and the existing `core-service-41` warning; workspace builds, catalog checks and TypeScript checks; e2e typecheck; `prepush: clean`.
- The build retains its existing chunk-size advisory.
- Passed `npm test -w packages/ui -- src/components/environment-section.test.tsx src/components/authoring-workspace.test.tsx`: 87 tests across both files.
- Passed `npm run journeys -w e2e -- tests/publish.spec.ts` with external artifact output: both real-core journeys verify the second instance's origin before confirmation, retaining their upload, refusal, cancellation and installation coverage.
- The browser log also records a background Space listing failure against an unavailable scratch clone; both journeys completed successfully.
- The maintainer independently reviewed the shared destination source, localization and both journey assertions; only guide and comment reflow followed the functional checks.
- Dependency installation succeeded and retained its pre-existing 17-vulnerability summary; this change does not modify the dependency graph.
- Live deployed-service publication is outside this change's verification.
