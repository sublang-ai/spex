<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# SET: Settings Implementation Requirements

## Intent

This spec defines implementation requirements behind the Settings
surface: one validation module shared with core config loading,
comment-preserving YAML writing, launcher-equivalent readiness
checks, and the protocol boundary between the Settings UI and the
core service
([DR-002](../decisions/002-desktop-app-architecture.md),
[DR-004](../decisions/004-config-and-persistence.md)).
The shared config file and the playbook launcher's fail-closed rule
set referenced here are those of
[DR-004](../decisions/004-config-and-persistence.md).

## Validation

### SET-11

Where the core service validates the shared config — at load for
session composition and on a Settings save command — the core
service shall use a single validation module applying one rule set
with stable rule identifiers in both paths.
A config rejected at load time shall be rejected on save with the
same rule identifier, and vice versa.

### SET-12

When a Settings save command carries edits whose resulting config
fails validation (see [SET-11](#set-11)), the core service shall
reject the command without writing the shared config file and shall
return each violation with its rule identifier and field location
over the WebSocket protocol.

## Config Writing

### SET-13

When the core service applies an accepted Settings save to the
shared config file, the core service shall perform a targeted YAML
edit: comments, key order, and keys not touched by the edit shall
be preserved, and file content outside the edited nodes shall
remain byte-identical.
Reformatting shall be confined to the edited nodes.

## Readiness

### SET-14

Where the core service evaluates adapter readiness, the core
service shall apply per-adapter rules identical to the playbook
launcher's ([DR-004](../decisions/004-config-and-persistence.md)):
`claude` is ready when `ANTHROPIC_API_KEY` is set or `~/.claude`
exists; `codex` is ready when `OPENAI_API_KEY` is set or `~/.codex`
exists; adapters with no light check shall be reported as
unverified rather than not ready.
Environment lookups shall use the captured login-shell environment
([DR-004](../decisions/004-config-and-persistence.md)), not the
bare app process environment.

## External Changes

### SET-15

While the core service watches the shared config file, when the
file changes on disk from a write the core service did not perform,
the core service shall reload and revalidate the file and push the
updated config state together with an external-change notice over
the WebSocket protocol.
Writes performed by the core service shall not trigger the
external-change notice.

## UI Boundary

### SET-16

Where the Settings UI renders or edits configuration, the Settings
UI shall obtain config state, validation results, and readiness
results exclusively as WebSocket protocol messages and shall submit
edits exclusively as protocol commands
([DR-002](../decisions/002-desktop-app-architecture.md)); it shall
not read or write the filesystem or the process environment.

### SET-21

When an in-place editor saves a profile tweak, the core package
shall apply it as a merging patch that alters only the provided
keys, leaving every other field, unknown keys, and comments of the
profile's config node intact, per
[DR-009](../decisions/009-at-hand-interaction.md).
