<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# CONF: Shared Config Round-Trip

## Intent

This composition covers the one config file every surface
shares: the playbook config of
[DR-004](../decisions/004-config-and-persistence.md).
Settings edits it, the core service loads and revalidates it, the
Library registers compiled playbooks into it, and the external
playbook launcher reads the same bytes — so the packages' individual
validation and write rules only work if they agree.

## Scenario

### CONF-1

Where any Spex surface writes the shared config — a Settings save or
a Library registration — when the write lands, the core service
shall observe the change and revalidate it with the same fail-closed
rule set that gated the write, so a config that one package accepted
is never rejected by another
([SET-11](../packages/settings.md#set-11),
[CORE-2](../packages/core-service.md#core-2),
[PBLIB-15](../packages/playbook-library.md#pblib-15)).

### CONF-2

While the config file carries user comments, when different packages
write it in sequence, the comments shall survive every writer, so
hand-maintained files stay hand-maintainable regardless of which
surface saved last.

## Tests

### CONF-3

Where a commented fixture config is edited through the Settings
protocol commands ([SET-11](../packages/settings.md#set-11)), then
extended by a stub-compiled playbook registration
([PBLIB-15](../packages/playbook-library.md#pblib-15)), the
integration suite shall assert that the core service reloads each
intermediate config without a validation failure
([CONF-1](#conf-1), [CORE-2](../packages/core-service.md#core-2)),
that a config rejected by the Settings validator
([SET-12](../packages/settings.md#set-12)) is byte-identical on
disk afterwards, and that the fixture's comments survive the
Settings save ([SET-13](../packages/settings.md#set-13)) and the
registration write
([PBLIB-16](../packages/playbook-library.md#pblib-16)) alike
([CONF-2](#conf-2)) — one rule set, observed at every seam.

### CONF-4

Where a client submits a config edit that violates a shared-config
rule ([CONF-1](#conf-1)), the integration suite shall assert the
Settings surface marks the field inline
([SET-2](../packages/settings.md#set-2)) while the core service
leaves the file unwritten and the connection open
([SET-12](../packages/settings.md#set-12)); and where a playbook
registration violates the same rule, the suite shall assert the
registration is rejected naming it, with the config bytes
unchanged ([PBLIB-15](../packages/playbook-library.md#pblib-15)) —
the same fail-closed rule set answers at every surface, and the
failure is visible in the UI while harmless at the protocol layer.
