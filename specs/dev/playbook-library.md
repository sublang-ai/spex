<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# PBLIB: Playbook Library Implementation Requirements

## Intent

This spec defines implementation requirements behind the Library
surface ([DR-002](../decisions/002-desktop-app-architecture.md)):
compile execution, registry generation, and shared-config writes.

The shared playbook config file, its fail-closed validation
rules, and app-local state locations are defined by
[DR-004](../decisions/004-config-and-persistence.md).
The external `slc` toolchain, its Node.js version floor, and its
compiled outputs are defined by
[DR-005](../decisions/005-compilation-integration.md).

## Toolchain Resolution

### PBLIB-11

When toolchain resolution is requested, the toolchain resolver
shall locate `slc` and `node` in this order: (1) an explicitly
configured toolchain path in app settings
([DR-004](../decisions/004-config-and-persistence.md)), then
(2) the captured login-shell `PATH`
([DR-004](../decisions/004-config-and-persistence.md)). It shall
verify that the resolved Node.js satisfies the version floor
required by `slc`
([DR-005](../decisions/005-compilation-integration.md)). When any
prerequisite cannot be resolved, it shall return an
unavailability result naming that prerequisite and the locations
attempted, and shall spawn no process.

## Compile Execution

### PBLIB-12

When a compile is started for playbook id `<id>`, the compile
runner shall run `slc` as an external child process in a
per-playbook directory `<library-root>/<id>/` under the
app-managed library root
([DR-004](../decisions/004-config-and-persistence.md)),
materializing in-app source text as a markdown file there and
linking the app-bundled runtime contract
([DR-005](../decisions/005-compilation-integration.md)). It shall
capture the process output per pipeline phase, reporting phase
transitions for progress ([PBLIB-6](../user/playbook-library.md#pblib-6))
and the failing phase's output on failure
([PBLIB-9](../user/playbook-library.md#pblib-9)). Compiled
outputs of a previously successful compile for the same id shall
be replaced only after the new compile succeeds.

## Registry Generation

### PBLIB-13

When `slc` completes successfully, the registry generator shall
derive the registry entry's `idleStateId`, `finalStateId`, and
`parkStateIds` by introspecting the emitted machine definition
([DR-005](../decisions/005-compilation-integration.md)), and each
derived id shall name a state present in that machine. When a
derivation is ambiguous, the registry generator shall surface the
candidate state ids for user selection in the registry form
([PBLIB-7](../user/playbook-library.md#pblib-7)) instead of
choosing silently.

### PBLIB-14

When the registry form
([PBLIB-7](../user/playbook-library.md#pblib-7)) is submitted
with valid entries, the registry generator shall emit a registry
manifest module
([DR-005](../decisions/005-compilation-integration.md)) into the
playbook's library directory, exporting the registry entry
consumed at playbook load: id,
command, intent, required role ids, the state ids derived per
[PBLIB-13](#pblib-13), summary policy, option validation, and
runtime creation wired to the compiled playbook. It shall return
the manifest path for the config entry's `from` key.

## Registry Validation

### PBLIB-15

When a registry entry is about to be registered into the shared
config, the registry validator shall apply the same fail-closed
rules the playbook loader applies at load
([DR-004](../decisions/004-config-and-persistence.md)) —
including: the `playbooks` key equals the manifest id; the
manifest at `from` imports successfully; no duplicate id or
command among configured playbooks; no reserved captain role
among role names; every required role resolved; at least one
visible role; no profile-id-vs-adapter-shorthand collision — and
shall reject a violating registration naming the violated rule,
leaving the shared config file unmodified.

## Config Writes

### PBLIB-16

When the config writer updates the shared config file — enabled
state ([PBLIB-3](../user/playbook-library.md#pblib-3)),
role-mapping edits
([PBLIB-4](../user/playbook-library.md#pblib-4)), or registration
([PBLIB-7](../user/playbook-library.md#pblib-7)) — it shall
preserve comments, key order, and formatting of untouched content
byte-for-byte, shall modify only the targeted keys, and shall
replace the file atomically so an interrupted write cannot leave
a partially written config.
