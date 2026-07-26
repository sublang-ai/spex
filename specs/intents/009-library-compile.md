<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-009: Library and Compile

## Goal

Implement the Library surface per the PBLIB spec package: browsing
and mapping configured playbooks, and compiling new ones from prose
via the external slc toolchain (DR-005), packaged so compiled
playbooks load in the app's runtime.

## Deliverables

- [x] Toolchain resolution and checks (system Node >= 23.6; slc via
  configured path, PATH, or npx) with actionable guidance
- [x] Compile orchestration: slc playbook run in a managed library
  directory with streamed phase progress
- [x] Artifact packaging: esbuild-bundled self-contained module (type
  stripping + dependency inlining) so `from:` paths import cleanly
- [x] FSM introspection deriving idle/final/park state ids
- [x] Registry generation from introspection plus judgment fields,
  validated fail-closed before registration
- [x] Library UI: playbook list with role→profile mapping, compile
  form, progress log, toolchain banner
- [x] Tests with a stubbed slc producing fixture artifacts,
  exercising the full pipeline through esbuild to a runnable registry

## Tasks

1. **Compile module** — toolchain checks
   ([PBLIB-11](../packages/playbook-library.md#pblib-11)), slc run with
   progress, esbuild packaging, FSM introspection, registry
   generation and validation
   ([PBLIB-12..15](../packages/playbook-library.md)).

2. **Protocol + handlers** — compile.check and compile.run commands,
   compile.progress broadcasts; registration via the existing
   playbook.add config op.

3. **Library UI** — list/mapping per
   [PBLIB-1..4](../packages/playbook-library.md), compile flow per
   [PBLIB-5..10](../packages/playbook-library.md).

4. **Tests** — stub-slc pipeline to a runnable registry, missing
   toolchain guidance, invalid registry rejection
   ([PBLIB-17..21](../packages/playbook-library.md)).

## Acceptance criteria

- Root build/test green.
- With the stub slc, compile.run yields a registered playbook whose
  bundled registry passes the captain shell's structural checks and
  exposes FSM-derived state ids.
- With Node too old or slc missing, compile.check reports guidance
  and compile.run refuses cleanly.
- A live slc compile is exercised in the final hardening iteration.
