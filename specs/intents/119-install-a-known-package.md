<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-119: Install a Known Package

## Status

Implemented, verified locally and independently reviewed (2026-10-25); awaiting integration.

## Intent

Let a fresh user install a known private package from the IDE without searching for it or editing `spex.yaml`.

## Deliverables

- [x] Add by name accepts a package name and explicit version requirement through the existing installer.
- [x] Real-core integration proves private direct installation, access refusal and unchanged public search.
- [x] The concise guide describes the direct flow and the namespace prerequisite.

## Tasks

1. Specify, implement, verify and document known-package installation in one coherent commit.

## Verification

- `npm test -w packages/ui -- src/components/environment-section.test.tsx`: 25 passed, including delayed acceptance and refusal across an environment change.
- `npm run build` and the final `npm run build -w packages/ui`: passed, including catalog compilation and type checks.
- `npm run typecheck -w e2e`: passed.
- `npm run journeys -w e2e -- tests/known-package.spec.ts`: one real-core browser journey passed, including authenticated private access and refusal, exact/caret/tilde resolution, invalid requests, native skill export and public search.
- `npm run prepush`: passed, including workspace build, catalogs, type checks and spec lint with zero errors and the existing `core-service-41` warning.
- Independent source, specification and integration-test review found no material issue; the root separately checked the implementation, tests and guide.
- The initial UI attempt collected no tests before the fresh worktree's core build; the initial browser attempt used the wrong fixture file location, corrected to inspect the real environment request state.
- The browser proof uses isolated registry and identity stand-ins; no live ordinary-user acceptance is claimed.
