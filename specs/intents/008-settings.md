<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-008: Settings

## Status

Done

## Intent

Implement the Settings surface per the settings spec package: a validated editor over the shared playbook config with comment-preserving writes, profile management, captain selection, readiness indicators, and notification/theme preferences.

## Deliverables

- [x] Core config editing: comment-preserving YAML operations validated fail-closed before any write
- [x] Protocol commands: profile save/delete, captain set, notifications set, theme set
- [x] Settings UI: profile editor with inline validation and readiness, captain selector, notification and theme preferences, config path display with live external-edit reflection
- [x] Tests: comment round-trip, validation parity rejection, referenced-profile delete protection, readiness fixtures

## Tasks

1. **Config edit module** — yaml Document operations ([[settings-13](../packages/settings.md#settings-13)]); every op composes the candidate config with launcher-parity validation before writing ([[settings-3](../packages/settings.md#settings-3)], [[settings-11](../packages/settings.md#settings-11)]).
2. **Protocol + handlers** — config.profile.save/delete, config.captain.set, config.notifications.set, config.theme.set; broadcast refreshed state after writes.
3. **Settings UI** — profiles with readiness badges and fix instructions, captain selector, notification matrix, theme ([[settings-1](../packages/settings.md#settings-1)]..[[settings-10](../packages/settings.md#settings-10)]).
4. **Tests** — round-trip preserving comments, launcher-invalid rejection with the same error class, delete protection ([[settings-17](../packages/settings.md#settings-17)]..[[settings-20](../packages/settings.md#settings-20)]).

## Verification

- Root build/test green.
- Editing a profile through the protocol preserves unrelated comments and keys byte-for-byte.
- A save that the playbook launcher would reject is refused with the launcher's error message and the file is left untouched.
- Layout-weight editing is deferred (config `layout` passes through untouched); noted for a later iteration.
