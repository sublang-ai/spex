<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-005: Playbook Compilation via slc

## Status

Accepted

## Context

- Spex's Library surface ([DR-002](002-desktop-app-architecture.md)) lets users compile new playbooks from prose or skill markdown.
- `@sublang/slc` is the published playbook compiler:
  `slc playbook <src.md> --link <runtime-contract.ts>` emits a `<name>.playbook/` directory containing `<name>.gears.md`, `<name>.fsm.ts` (XState v5), and `<name>.playbook.ts`, plus verification tests.
- slc dynamic-imports its `.ts` artifacts through Node's built-in type stripping, which requires system Node >= 23.6 [[1]]; the Node bundled into Electron does not provide it.
- Compilation itself is agent-driven: slc drives a credentialed coding agent configured in its own config, so compiles need network access and agent credentials.
- The embedded Playbook Captain shell ([DR-003](003-runtime-reuse.md)) loads playbooks through registry entries and validates them fail-closed. Its load contract is `id`, `command`, `intent`, `requiredRoleIds`, `validateOptions`, `createRuntime`, plus an optional `summaryPolicy`; it derives idle/park/final behavior from runtime state tags (`playbook.parked`, quiescence), not per-entry state ids. slc does not emit this manifest.
- Playbooks are enabled through `playbooks.<id>` blocks in the shared config file ([DR-004](004-config-and-persistence.md)).

## Decision

### External toolchain, never in-process

- Spex invokes slc as an external toolchain in a child process; it never imports or bundles the compiler.
- Toolchain resolution order: a user-configured slc install, then a global install, then `npx @sublang/slc`.
- Spex resolves a system Node >= 23.6 to run slc, because slc's dynamic import of `.ts` artifacts needs type stripping [[1]], which the Electron-bundled Node lacks.

### Compile flow

- Compile inputs: one prose/skill markdown source plus the declared player roles.
- Spex runs `slc playbook <src> --link <runtime contract>` in a Spex-managed working directory; the runtime contract is the one exported by `@sublang/playbook`.
- Compile progress streams to the UI as phase updates rather than blocking, since agent-driven compilation is long-running.

### Registry generation

- slc emits gears, FSM, and runtime modules but not the registry manifest the Captain shell requires.
- Spex generates `<name>.registry.ts` itself:
  - judgment fields (`command`, `intent`, `summaryPolicy`) are collected from the user in a small form;
  - state ids (`idleStateId`, `finalStateId`, `parkStateIds`) are derived by introspecting the compiled FSM and emitted as optional introspection metadata — they are not part of the Captain shell's load contract, so validation must not require them.
- The generated registry is validated against the Captain shell's fail-closed loading rules ([DR-003](003-runtime-reuse.md)) before the playbook is registered.
- Upstreaming registry emission into slc is flagged as future work; when it lands, Spex generation reduces to the judgment-field form.

### Library placement and enabling

- Compiled playbooks live in a Spex-managed library directory under the platform app-data directory, one directory per playbook id.
- Enabling a compiled playbook writes a `playbooks.<id>` block into the shared config ([DR-004](004-config-and-persistence.md)), with `from` set to the absolute module path inside the library directory.

### Missing toolchain

- An absent or too-old system Node, or an unresolvable slc CLI, yields actionable guidance — what is missing and how to install it — never a crash.
- While the toolchain is missing, compilation is unavailable; every other app surface keeps working.

## Consequences

- Compiling requires network access, agent credentials, and a system Node install; acceptable for a developer tool, and running already-compiled playbooks needs none of them.
- The library directory keeps user-produced artifacts out of the app bundle and stable across app updates.
- Registry generation is the one place Spex authors code on the user's behalf; the fail-closed validation gate bounds the blast radius of a bad generation.
- Toolchain resolution is a moving part across user machines; the guidance-over-crash rule keeps a missing toolchain a degraded mode, not a failure mode.
- Until registry emission is upstreamed into slc, the registry generator must track the Captain shell's registry contract.

## References

[1]: https://nodejs.org/api/typescript.html "Node.js — Modules: TypeScript (type stripping)"
