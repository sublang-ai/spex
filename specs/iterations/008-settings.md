<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-008: Settings

## Goal

Implement the Settings surface per the SET spec package: a validated
editor over the shared playbook config with comment-preserving
writes, profile management, captain selection, readiness indicators,
and notification/theme preferences.

## Deliverables

- [x] Core config editing: comment-preserving YAML operations
  validated fail-closed before any write
- [x] Protocol commands: profile save/delete, captain set,
  notifications set, theme set
- [x] Settings UI: profile editor with inline validation and
  readiness, captain selector, notification and theme preferences,
  config path display with live external-edit reflection
- [x] Tests: comment round-trip, validation parity rejection,
  referenced-profile delete protection, readiness fixtures

## Tasks

1. **Config edit module** — yaml Document operations
   ([SET-12](../packages/settings.md#set-12)); every op composes the
   candidate config with launcher-parity validation before writing
   ([SET-3](../packages/settings.md#set-3),
   [SET-11](../packages/settings.md#set-11)).

2. **Protocol + handlers** — config.profile.save/delete,
   config.captain.set, config.notifications.set, config.theme.set;
   broadcast refreshed state after writes.

3. **Settings UI** — profiles with readiness badges and fix
   instructions, captain selector, notification matrix, theme
   ([SET-1..10](../packages/settings.md)).

4. **Tests** — round-trip preserving comments, launcher-invalid
   rejection with the same error class, delete protection
   ([SET-17..20](../packages/settings.md)).

## Acceptance criteria

- Root build/test green.
- Editing a profile through the protocol preserves unrelated
  comments and keys byte-for-byte.
- A save that the playbook launcher would reject is refused with the
  launcher's error message and the file is left untouched.
- Layout-weight editing is deferred (config `layout` passes through
  untouched); noted for a later iteration.
