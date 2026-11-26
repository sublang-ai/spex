<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-005: Playbook Compilation via slc

## Status

Accepted.
Amended by [DR-014](014-released-toolchain.md), [DR-058](058-chat-assisted-playbook-authoring.md), [DR-081](081-the-app-supplies-the-compiler.md), [DR-104](104-spec-package-format-and-client-environments.md).

## Context

- Spex's Playbooks surface ([DR-002](002-desktop-app-architecture.md)) lets users compile new playbooks from prose or skill markdown.
- `@sublang/slc` is the published playbook compiler: `slc playbook <src.md>` emits a `<name>.playbook/` directory containing `<name>.gears.md`, `<name>.fsm.ts` (XState v5), and `<name>.playbook.ts`, plus verification tests and a registry-entry module ([DR-014](014-released-toolchain.md)).
- Compilation itself is agent-driven: slc drives a credentialed coding agent, so compiles need network access and agent credentials.
- The embedded Playbook Captain shell ([DR-003](003-runtime-reuse.md)) loads playbooks through registry entries and validates them fail-closed.

## Decision

### External toolchain, never in-process

- Spex invokes slc as an external toolchain in a child process; it never imports the compiler into the core.
- Which compiler copy runs, and on which Node, is [DR-081](081-the-app-supplies-the-compiler.md)'s.

### Compile flow

- Spex runs slc against the runtime contract exported by `@sublang/playbook`, in the folder of the playbook under development ([DR-058](058-chat-assisted-playbook-authoring.md), [DR-104](104-spec-package-format-and-client-environments.md)).
- Compile progress streams to the UI as phase updates rather than blocking, since agent-driven compilation is long-running.
- State ids (`idleStateId`, `finalStateId`, `parkStateIds`) derived by introspecting the compiled FSM are display metadata only, never part of the Captain shell's load contract.
- The compiled entry is validated against the Captain shell's fail-closed loading rules before the playbook is offered for use.

### Missing toolchain

- A missing or unusable compiler yields actionable guidance — what is missing and how to restore it — never a crash.
- While the toolchain is missing, compilation is unavailable; every other app surface keeps working.

## Consequences

- Compiling requires network access and agent credentials; running already-compiled playbooks needs neither.
- The fail-closed validation gate bounds the blast radius of a bad compile.
- The guidance-over-crash rule keeps a missing toolchain a degraded mode, not a failure mode.
