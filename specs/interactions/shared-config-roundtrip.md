<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# CONF: Shared Config Round-Trip

## Intent

This interaction spec covers the one config file every surface
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
Verifies: [SET-11](../packages/settings.md#set-11), [CORE-2](../packages/core-service.md#core-2), [PBLIB-15](../packages/playbook-library.md#pblib-15)

Where a fixture config is edited through the Settings protocol
commands, then extended by a stub-compiled playbook registration,
the integration suite shall assert that the core service reloads
each intermediate config without a validation failure, and that a
config rejected by the Settings validator is byte-identical on disk
afterwards — one rule set, observed at every seam.

### CONF-4
Verifies: [SET-2](../packages/settings.md#set-2), [CORE-13](../packages/core-service.md#core-13)

Where a client submits a config edit that violates a shared-config
rule, the integration suite shall assert the Settings surface marks
the field inline while the core service leaves the file unwritten
and the connection open — the failure is visible in the UI and
harmless at the protocol layer.
