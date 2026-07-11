<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# SET: Settings Acceptance Tests

## Intent

This spec defines required integration coverage for the Settings
surface, exercised through the core service's WebSocket protocol
against real shared config files in fixture config directories, so
that Settings behavior and the playbook launcher's config contract
([DR-004](../decisions/004-config-and-persistence.md)) are verified
together.

## Round-Trip Coverage

### SET-17
Verifies: [SET-1](../user/settings.md#set-1), [SET-7](../user/settings.md#set-7), [SET-13](../dev/settings.md#set-13)

Where profile create, edit, and delete are exercised through the
core service's Settings command surface, given a shared config file
containing comments and keys unknown to Settings, the test suite
shall assert that after each operation the file contains the
requested change, every comment and unknown key survives, and file
content outside the edited nodes is byte-identical to the pre-run
content.

## Validation Coverage

### SET-18
Verifies: [SET-2](../user/settings.md#set-2), [SET-3](../user/settings.md#set-3), [SET-11](../dev/settings.md#set-11), [SET-12](../dev/settings.md#set-12)

Where validation is exercised, given fixture configs the playbook
launcher rejects — at minimum a profile id colliding with an
adapter shorthand — the test suite shall assert for each fixture
that the save command is rejected with a violation carrying a rule
identifier and field location, that the shared config file's bytes
are unchanged, and that loading the same fixture reports the same
rule identifier as the rejected save.

## Readiness Coverage

### SET-19
Verifies: [SET-5](../user/settings.md#set-5), [SET-14](../dev/settings.md#set-14)

Where adapter readiness is exercised, given fixture environments
and home directories covering each launcher rule (credential
environment variable set, credential directory present, both
absent), the test suite shall assert that the readiness results
delivered over the protocol match the expected state per adapter,
that adapters without a light check are reported as unverified, and
that each not-ready result includes fix instructions naming the
environment variable or login step.

## External Edit Coverage

### SET-20
Verifies: [SET-8](../user/settings.md#set-8), [SET-15](../dev/settings.md#set-15)

Where external edit reflection is exercised, given a connected
client holding Settings state, when the shared config file is
modified on disk by a writer other than the core service, the test
suite shall assert that the client receives the updated config
state and an external-change notice, and that a subsequent save
performed through the core service produces no external-change
notice.

## Presentation Coverage

### SET-25

Verifies: [SET-22](../user/settings.md#set-22),
[SET-23](../user/settings.md#set-23),
[SET-24](../user/settings.md#set-24)

Where the Settings surface renders against fixture state, the test
suite shall assert that each notification row shows its
human-readable label with the wire event id in the row's tooltip,
that a not-ready profile's long fix requirement renders without
truncation, and that with an invalid config the copy control
places the config file path on the clipboard and shows a transient
copied confirmation.
