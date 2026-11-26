<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-014: The Released Toolchain's Host Boundary

## Status

Accepted.
Amended by [DR-019](019-inline-agent-configuration.md), [DR-032](032-session-players.md).

## Context

- slc emits thin artifacts: `<id>.playbook/<id>.playbook.ts` delegates to `@sublang/playbook/xstate-runtime`'s shared engine, and a registry-entry module `<id>.ts` is emitted beside the artifact directory — the manifest gap [DR-005](005-compilation-integration.md) worked around no longer exists.
- The playbook registry contract has no state-id fields; its runtime contract has session-identity `init`, structured run results, and a Captain failure that resolves as a `failed` outcome instead of rejecting.
- cligent renamed the agent option `reasoningEffort` to `effort`.
  cligent's own legacy-key migration lives only in its tmux-play YAML loader, which Spex does not use: Spex validates the shared config itself ([DR-004](004-config-and-persistence.md)) and passes composed agents straight to `createTmuxPlayRuntime`.
- slc emits `requiredRoleIds` verbatim from the compiled gears (`Coder`, `Reviewer` in its own demo).
- The shared engine runs script gears with `cwd` from the playbook's options, defaulting to the host process working directory; nothing carries the session's project path there.
- A registry module generated for an earlier runtime contract passes structural validation and would fail only mid-turn.

## Decision

### The compiler stays external

- slc stays an external, never-imported toolchain per [DR-005](005-compilation-integration.md).

### Canonical `effort` key

- The shared config's agent blocks use `effort`; Spex writes only `effort`.
- Spex's own validator accepts `reasoningEffort` as a read-only legacy alias: it maps to `effort` during composition, and a block setting both keys is invalid.
- The protocol and UI surfaces carry `effort` end to end.

### Adopt the slc-emitted registry entry

- The compile pipeline treats slc's emitted `<id>.ts` entry module as the registry source of truth; Spex stops synthesizing `createRuntime` conventions from FSM introspection.
- Spex generates a thin wrapper module around the emitted entry that:
  - overrides `command` and `intent` with the user's judgment fields when provided (the id is never overridden);
  - passes the entry's role ids through in their authored casing, since a role is a playbook-local slot a user binds to a player ([DR-032](032-session-players.md));
  - exports the current registry-contract marker.
- FSM introspection remains only as display metadata (state ids in compile results and artifacts), never as registry content.

### Role reconciliation in the compile flow

- Compile requests carry the user's role bindings, but the compiled entry's derived role ids are authoritative.
- After the fail-closed entry load, the service re-keys the bindings onto the derived role ids by case-insensitive name match.
- When bindings cannot be matched, the compile reports the derived roles as a structured error before any config write; the compiled artifacts stay in the library for a re-registration without recompiling.

### Stale bundle invalidation

- Config composition treats a file-path registry module without the registry-contract marker as invalid, with recompile guidance naming the playbook — never a mid-turn failure.

### Session working directory

- At session creation, Spex injects the project path as the `cwd` option of each configured playbook whose entry accepts a `cwd` option and whose config block does not set one, so script gears run in the project, not the app process directory.

### Captain failure surface

- The Captain failure contract changes only record-stream shapes (a finished turn with parked telemetry instead of an error path); Spex adapts its expected record sequences and surfaces the parked state per [DR-009](009-at-hand-interaction.md).

## Consequences

- The host boundary is concentrated in config validation, registry generation, and session wiring; the WebSocket protocol carries the `effort` field.
- Playbooks compiled for an earlier contract degrade to an actionable invalid state instead of failing mid-session; recompiling re-admits them.
- The wrapper is Spex-owned glue over slc's emitted entry.
- User configs written before the rename keep composing via the legacy alias; the next effort edit of a block canonicalizes it.
- Registry generation now tracks slc's emitted entry instead of the Captain shell's contract; the fail-closed validation gate from [DR-005](005-compilation-integration.md) stays as the last line of defense.
