<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-014: Released Toolchain Adoption

## Status

Accepted

## Context

- The toolchain Spex embeds and invokes has shipped:
  `@sublang/slc` 0.1.0 is on npm, `@sublang/playbook` is at 2.0.0, and `@sublang/cligent` is at 0.16.0.
  Spex still pins `@sublang/playbook` ^0.9.0 and `@sublang/cligent` ^0.13.0.
- slc 0.1.0 emits thin artifacts: `<id>.playbook/<id>.playbook.ts` delegates to `@sublang/playbook/xstate-runtime`'s shared engine, and a registry-entry module `<id>.ts` is emitted beside the artifact directory — the manifest gap [DR-005](005-compilation-integration.md) worked around no longer exists.
- The playbook 2.0.0 registry contract dropped the optional state-id fields; the runtime contract moved to six ports, session-identity `init`, structured run results, and a Captain failure that resolves as a `failed` outcome instead of rejecting.
- cligent 0.14 renamed the agent option `reasoningEffort` to `effort`.
  cligent's own legacy-key migration lives only in its tmux-play YAML loader, which Spex does not use: Spex validates the shared config itself ([DR-004](004-config-and-persistence.md)) and passes composed agents straight to `createTmuxPlayRuntime`.
- slc emits `requiredRoleIds` verbatim from the compiled gears (`Coder`, `Reviewer` in its own demo), while cligent player ids must match `^[a-z][a-z0-9_-]*$` and the Captain shell resolves host players by exact `<id>-<role>` composition.
- The shared engine runs script gears with `cwd` from the playbook's options, defaulting to the host process working directory; nothing carries the session's project path there.
- Registry bundles compiled before this adoption embed the 0.9 runtime contract and are referenced by absolute `from:` paths in user configs; they pass structural validation and would fail only mid-turn.

## Decision

### Dependency floor

- `packages/core` depends on `@sublang/playbook` ^2.0.0 and `@sublang/cligent` ^0.16.0.
- slc stays an external, never-imported toolchain per [DR-005](005-compilation-integration.md); its resolution order and the Node >= 23.6 floor are unchanged.

### Canonical `effort` key

- The shared config's agent blocks use `effort`; Spex writes only `effort` (template, profile saves).
- Spex's own validator accepts `reasoningEffort` as a read-only legacy alias: it maps to `effort` during composition, and a block setting both keys is invalid.
- The protocol and UI surfaces carry `effort` end to end.

### Adopt the slc-emitted registry entry

- The compile pipeline treats slc's emitted `<id>.ts` entry module as the registry source of truth; Spex stops synthesizing `createRuntime` conventions from FSM introspection.
- Spex generates a thin wrapper module around the emitted entry that:
  - overrides `command` and `intent` with the user's judgment fields when provided (the id is never overridden);
  - lowercases `requiredRoleIds` for the host boundary and maps player ids back to the entry's canonical casing at the port seam, so cligent's player-id grammar and the Captain shell's exact role lookup both hold;
  - exports a registry-contract marker identifying the playbook 2.0 generation.
- FSM introspection remains only as display metadata (state ids in compile results and artifacts), never as registry content.

### Role reconciliation in the compile flow

- Compile requests keep carrying the user's role-to-profile assignments, but the compiled entry's derived role ids are authoritative.
- After the fail-closed entry load, the service re-keys the assignments onto the derived (lowercased) role ids by case-insensitive name match.
- When assignments cannot be matched, the compile reports the derived roles as a structured error before any config write; the compiled artifacts stay in the library for a re-registration without recompiling.

### Stale bundle invalidation

- Config composition treats a file-path registry module without the registry-contract marker as invalid, with recompile guidance naming the playbook — never a mid-turn failure.

### Session working directory

- At session creation, Spex injects the project path as the `cwd` option of each configured playbook whose entry accepts a `cwd` option and whose config block does not set one, so script gears run in the project, not the app process directory.

### Captain failure surface

- The playbook 2.0 Captain failure contract changes only record-stream shapes (a finished turn with parked telemetry instead of an error path); Spex adapts its expected record sequences and surfaces the parked state per [DR-009](009-at-hand-interaction.md).

## Consequences

- The upgrade is a host-boundary rewrite concentrated in config validation, registry generation, and session wiring; the WebSocket protocol is unchanged by this decision except the `effort` field rename.
- Pre-adoption compiled playbooks degrade to an actionable invalid state instead of failing mid-session; recompiling re-admits them.
- The role-id normalization wrapper is Spex-owned glue; upstreaming role-id normalization into slc or the Captain shell would let it shrink.
- User configs written before the rename keep composing via the legacy alias; the next profile save canonicalizes them.
- Registry generation now tracks slc's emitted entry instead of the Captain shell's contract; the fail-closed validation gate from [DR-005](005-compilation-integration.md) stays as the last line of defense.
