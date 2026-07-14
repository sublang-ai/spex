<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# SET: Settings

## Intent

This spec covers the Settings workspace surface of the Spex desktop
app ([DR-002](../decisions/002-desktop-app-architecture.md)) — its
externally visible behavior, the implementation requirements behind
it, and the integration coverage that verifies both.
The Settings surface is an editor over the shared playbook config
file at `${XDG_CONFIG_HOME:-$HOME/.config}/playbook/playbook.config.yaml`,
which stays the source of truth shared with the playbook CLI per
[DR-004](../decisions/004-config-and-persistence.md).
The adapter names (`claude`, `codex`, `gemini`, `opencode`), the
config's top-level maps (`profiles`, `captain`, `layout`,
`notifications`, `theme`), and the fail-closed validation rules are
those of the playbook launcher that shares this file
([DR-004](../decisions/004-config-and-persistence.md)).
Behind the surface, the implementation requires one validation
module shared with core config loading, comment-preserving YAML
writing, launcher-equivalent readiness checks, and the protocol
boundary between the Settings UI and the core service
([DR-002](../decisions/002-desktop-app-architecture.md)).
Integration coverage is exercised through the core service's
WebSocket protocol against real shared config files in fixture
config directories, so that Settings behavior and the playbook
launcher's config contract
([DR-004](../decisions/004-config-and-persistence.md)) are verified
together.

## External Behavior

### Profiles

#### SET-1

Where the Settings surface is open, the Settings surface shall list
every profile from the shared config's `profiles` map and support
creating, editing, and deleting profiles with the fields: adapter
(`claude`, `codex`, `gemini`, or `opencode`), optional model,
optional reasoning effort, and permissions (mode `auto` or `bypass`,
optional writable paths).
When a profile change is saved, the change shall appear in the
shared config file's `profiles` map.

#### SET-2

While a pending Settings edit violates a shared-config validation
rule — the same fail-closed rule set the playbook launcher applies
([DR-004](../decisions/004-config-and-persistence.md)) — the
Settings surface shall mark the offending field inline with a
message naming the violated rule (for example, a profile id that
collides with an adapter shorthand).
When the edit no longer violates the rule, the Settings surface
shall clear the marker.

#### SET-3

While any pending edit in the Settings surface violates a
shared-config validation rule
([DR-004](../decisions/004-config-and-persistence.md)), when the
user attempts to save, the Settings surface shall not write the
shared config file and shall state which violations block the save.
The Settings surface shall never write an on-disk config that the
shared validation rules reject.

### Captain

#### SET-4

Where the Settings surface is open, the Settings surface shall
display the captain configuration from the shared config's
top-level `captain` map and allow selecting which profile or
adapter powers the captain.
When a captain selection is saved, the selection shall appear in
the shared config file's `captain` map.

### Adapter Readiness

#### SET-5

Where the Settings surface is open, the Settings surface shall show
a readiness indicator for each adapter, reflecting the
launcher-equivalent readiness checks of
[DR-004](../decisions/004-config-and-persistence.md): ready, not
ready, or unverified for adapters with no light check.
When an adapter is not ready, the indicator shall include concrete
fix instructions naming the environment variable to set or the
adapter's login step (for example, set `ANTHROPIC_API_KEY` or log
in with the `claude` CLI).

### Preferences

#### SET-6

Where the Settings surface is open, the Settings surface shall
provide editors for the shared config's `layout` (pane column
weights), `notifications`, and `theme` maps.
When a preference change is saved, the change shall appear under
the corresponding top-level map in the shared config file.

### Config File Semantics

#### SET-7

When a Settings edit is saved, the Settings surface shall write the
shared config file as a targeted edit that preserves comments, key
order, and keys the Settings surface does not recognize, so the
file stays hand-editable for playbook CLI use
([DR-004](../decisions/004-config-and-persistence.md); see
[SET-13](#set-13)).

#### SET-8

While the Settings surface is open, when the shared config file
changes on disk from outside the app, the Settings surface shall
refresh the displayed values to the new file content and show a
notice that the config changed externally.
When the external change conflicts with unsaved edits in the
Settings surface, the notice shall say so; resolution is
last-writer-wins per
[DR-004](../decisions/004-config-and-persistence.md).

#### SET-9

Where the app starts on a machine with no shared config file, while
the core service has seeded the starter config
([DR-004](../decisions/004-config-and-persistence.md)), the
Settings surface shall display the starter's values as the current
settings before any user save, and the displayed values shall equal
the seeded file's content.

### Guidance

#### SET-10

Where the Settings surface presents an editable setting, the
Settings surface shall accompany the setting with a short inline
description of its effect; no setting shall appear as a bare,
unexplained control.

#### SET-22

While the notifications editor lists notification events, each
event shall be labeled with a human-readable phrase from the app's
notification label map rather than the wire event id
([DR-010](../decisions/010-interface-craft.md) §2); the wire id
shall remain available in the row's tooltip.

#### SET-23

While a profile's readiness indicator reports not ready, the
accompanying fix requirement ([SET-5](#set-5)) shall render in
full, wrapping onto further lines as needed rather than
truncating.

#### SET-24

While the shared config file is missing or invalid, the Settings
surface shall show the config file's path together with a
secondary control that copies the path to the clipboard and
briefly confirms the copy in place, so the user can open the file
in an editor.

## Internal Behavior

### Validation

#### SET-11

Where the core service validates the shared config — at load for
session composition and on a Settings save command — the core
service shall use a single validation module applying one rule set
with stable rule identifiers in both paths.
A config rejected at load time shall be rejected on save with the
same rule identifier, and vice versa.

#### SET-12

When a Settings save command carries edits whose resulting config
fails validation (see [SET-11](#set-11)), the core service shall
reject the command without writing the shared config file and shall
return each violation with its rule identifier and field location
over the WebSocket protocol.

### Config Writing

#### SET-13

When the core service applies an accepted Settings save to the
shared config file, the core service shall perform a targeted YAML
edit: comments, key order, and keys not touched by the edit shall
be preserved, and file content outside the edited nodes shall
remain byte-identical.
Reformatting shall be confined to the edited nodes.

### Readiness

#### SET-14

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

### External Changes

#### SET-15

While the core service watches the shared config file, when the
file changes on disk from a write the core service did not perform,
the core service shall reload and revalidate the file and push the
updated config state together with an external-change notice over
the WebSocket protocol.
Writes performed by the core service shall not trigger the
external-change notice.

### UI Boundary

#### SET-16

Where the Settings UI renders or edits configuration, the Settings
UI shall obtain config state, validation results, and readiness
results exclusively as WebSocket protocol messages and shall submit
edits exclusively as protocol commands
([DR-002](../decisions/002-desktop-app-architecture.md)); it shall
not read or write the filesystem or the process environment.

#### SET-21

When an in-place editor saves a profile tweak, the core package
shall apply it as a merging patch that alters only the provided
keys, leaving every other field, unknown keys, and comments of the
profile's config node intact, per
[DR-009](../decisions/009-at-hand-interaction.md).

## Verification

### Round-Trip Coverage

#### SET-17
Verifies: [SET-1](#set-1), [SET-7](#set-7), [SET-13](#set-13)

Where profile create, edit, and delete are exercised through the
core service's Settings command surface, given a shared config file
containing comments and keys unknown to Settings, the test suite
shall assert that after each operation the file contains the
requested change, every comment and unknown key survives, and file
content outside the edited nodes is byte-identical to the pre-run
content.

### Validation Coverage

#### SET-18
Verifies: [SET-2](#set-2), [SET-3](#set-3), [SET-11](#set-11), [SET-12](#set-12)

Where validation is exercised, given fixture configs the playbook
launcher rejects — at minimum a profile id colliding with an
adapter shorthand — the test suite shall assert for each fixture
that the save command is rejected with a violation carrying a rule
identifier and field location, that the shared config file's bytes
are unchanged, and that loading the same fixture reports the same
rule identifier as the rejected save.

### Readiness Coverage

#### SET-19
Verifies: [SET-5](#set-5), [SET-14](#set-14)

Where adapter readiness is exercised, given fixture environments
and home directories covering each launcher rule (credential
environment variable set, credential directory present, both
absent), the test suite shall assert that the readiness results
delivered over the protocol match the expected state per adapter,
that adapters without a light check are reported as unverified, and
that each not-ready result includes fix instructions naming the
environment variable or login step.

### External Edit Coverage

#### SET-20
Verifies: [SET-8](#set-8), [SET-15](#set-15)

Where external edit reflection is exercised, given a connected
client holding Settings state, when the shared config file is
modified on disk by a writer other than the core service, the test
suite shall assert that the client receives the updated config
state and an external-change notice, and that a subsequent save
performed through the core service produces no external-change
notice.

### Presentation Coverage

#### SET-25

Verifies: [SET-22](#set-22),
[SET-23](#set-23),
[SET-24](#set-24)

Where the Settings surface renders against fixture state, the test
suite shall assert that each notification row shows its
human-readable label with the wire event id in the row's tooltip,
that a not-ready profile's long fix requirement renders without
truncation, and that with an invalid config the copy control
places the config file path on the clipboard and shows a transient
copied confirmation.
