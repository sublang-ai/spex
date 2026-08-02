<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# shared-config-roundtrip: Shared Config Round-Trip

## Intent

This package covers the one config file every Spex surface shares: the playbook config.
Settings edits it, the core service loads and revalidates it, the Library registers compiled playbooks into it, and the external playbook launcher reads the same bytes — so the packages' individual validation and write rules only work if they agree.

## External Behavior

### shared-config-roundtrip-1

Where any Spex surface writes the shared config — a Settings save or a Library registration — when the write lands, the core service shall observe the change and revalidate it [[core-service-2](core-service.md#core-service-2)] with the same fail-closed rule set that gated the write, so a config that one package accepted is never rejected by another.

### shared-config-roundtrip-2

While the config file carries user comments, when different packages write it in sequence, the comments shall survive every writer, so hand-maintained files stay hand-maintainable regardless of which surface saved last.

### shared-config-roundtrip-5

Where any Spex surface submits a shared-config change that violates the shared fail-closed rule set, the receiving surface shall reject it naming the violated rule and the shared config file's bytes shall remain unchanged — no surface writes a config another surface would refuse.

## Verification

### shared-config-roundtrip-3

Where a commented fixture config is edited through the Settings protocol commands, then extended by a stub-compiled playbook registration, the integration suite shall assert that the core service reloads each intermediate config without a validation failure [[shared-config-roundtrip-1](#shared-config-roundtrip-1)], and that the fixture's comments survive the Settings save and the registration write alike [[shared-config-roundtrip-2](#shared-config-roundtrip-2)] — one rule set, observed at every seam.

### shared-config-roundtrip-4

Where a client submits a config edit that violates a shared-config rule, the integration suite shall assert the receiving surface rejects it naming the rule while the config file remains unchanged [[shared-config-roundtrip-5](#shared-config-roundtrip-5)]; and where a playbook registration violates the same rule, the suite shall assert the registration is rejected naming it, with the config bytes unchanged [[shared-config-roundtrip-5](#shared-config-roundtrip-5)] — the same fail-closed rule set answers at every surface.
