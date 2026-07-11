<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# SET: User-Facing Settings Behavior

## Intent

This spec defines user-visible behavior of the Settings workspace
surface of the Spex desktop app
([DR-002](../decisions/002-desktop-app-architecture.md)).
The Settings surface is an editor over the shared playbook config
file at `${XDG_CONFIG_HOME:-$HOME/.config}/playbook/playbook.config.yaml`,
which stays the source of truth shared with the playbook CLI per
[DR-004](../decisions/004-config-and-persistence.md).
The adapter names (`claude`, `codex`, `gemini`, `opencode`), the
config's top-level maps (`profiles`, `captain`, `layout`,
`notifications`, `theme`), and the fail-closed validation rules are
those of the playbook launcher that shares this file.

## Profiles

### SET-1

Where the Settings surface is open, the Settings surface shall list
every profile from the shared config's `profiles` map and support
creating, editing, and deleting profiles with the fields: adapter
(`claude`, `codex`, `gemini`, or `opencode`), optional model,
optional reasoning effort, and permissions (mode `auto` or `bypass`,
optional writable paths).
When a profile change is saved, the change shall appear in the
shared config file's `profiles` map.

### SET-2

While a pending Settings edit violates a shared-config validation
rule — the same fail-closed rule set the playbook launcher applies
([DR-004](../decisions/004-config-and-persistence.md)) — the
Settings surface shall mark the offending field inline with a
message naming the violated rule (for example, a profile id that
collides with an adapter shorthand).
When the edit no longer violates the rule, the Settings surface
shall clear the marker.

### SET-3

While any pending edit in the Settings surface violates a
shared-config validation rule
([DR-004](../decisions/004-config-and-persistence.md)), when the
user attempts to save, the Settings surface shall not write the
shared config file and shall state which violations block the save.
The Settings surface shall never write an on-disk config that the
shared validation rules reject.

## Captain

### SET-4

Where the Settings surface is open, the Settings surface shall
display the captain configuration from the shared config's
top-level `captain` map and allow selecting which profile or
adapter powers the captain.
When a captain selection is saved, the selection shall appear in
the shared config file's `captain` map.

## Adapter Readiness

### SET-5

Where the Settings surface is open, the Settings surface shall show
a readiness indicator for each adapter, reflecting the
launcher-equivalent readiness checks of
[DR-004](../decisions/004-config-and-persistence.md): ready, not
ready, or unverified for adapters with no light check.
When an adapter is not ready, the indicator shall include concrete
fix instructions naming the environment variable to set or the
adapter's login step (for example, set `ANTHROPIC_API_KEY` or log
in with the `claude` CLI).

## Preferences

### SET-6

Where the Settings surface is open, the Settings surface shall
provide editors for the shared config's `layout` (pane column
weights), `notifications`, and `theme` maps.
When a preference change is saved, the change shall appear under
the corresponding top-level map in the shared config file.

## Config File Semantics

### SET-7

When a Settings edit is saved, the Settings surface shall write the
shared config file as a targeted edit that preserves comments, key
order, and keys the Settings surface does not recognize, so the
file stays hand-editable for playbook CLI use
([DR-004](../decisions/004-config-and-persistence.md); see
[SET-13](../dev/settings.md#set-13)).

### SET-8

While the Settings surface is open, when the shared config file
changes on disk from outside the app, the Settings surface shall
refresh the displayed values to the new file content and show a
notice that the config changed externally.
When the external change conflicts with unsaved edits in the
Settings surface, the notice shall say so; resolution is
last-writer-wins per
[DR-004](../decisions/004-config-and-persistence.md).

### SET-9

Where the app starts on a machine with no shared config file, while
the core service has seeded the starter config
([DR-004](../decisions/004-config-and-persistence.md)), the
Settings surface shall display the starter's values as the current
settings before any user save, and the displayed values shall equal
the seeded file's content.

## Guidance

### SET-10

Where the Settings surface presents an editable setting, the
Settings surface shall accompany the setting with a short inline
description of its effect; no setting shall appear as a bare,
unexplained control.

### SET-22

While the notifications editor lists notification events, each
event shall be labeled with a human-readable phrase from the app's
notification label map rather than the wire event id
([DR-010](../decisions/010-interface-craft.md) §2); the wire id
shall remain available in the row's tooltip.

### SET-23

While a profile's readiness indicator reports not ready, the
accompanying fix requirement ([SET-5](#set-5)) shall render in
full, wrapping onto further lines as needed rather than
truncating.

### SET-24

While the shared config file is missing or invalid, the Settings
surface shall show the config file's path together with a
secondary control that copies the path to the clipboard and
briefly confirms the copy in place, so the user can open the file
in an editor.
