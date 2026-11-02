<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-182: Published Desktop Runtime Adoption

## Status

Accepted (2026-11-02) on the owner's direction to verify Fork app-tag installers using the published runtime packages.
Amends [DR-167](167-the-compiler-shares-the-apps-engine.md) only in the Playbook and Cligent floors; its single-engine and strict-peer contract stands.
Amends [DR-178](178-native-windows-private-storage.md) by retiring its temporary vendored runtime inputs; its storage admission remains.
Supersedes [DR-183](183-windows-bounded-codex-commands.md) in platform launch overrides: the published adapter uses the official Codex SDK directly and inherits native user configuration, with explicit policies passed through its public configuration.
Implements the registry-only release inputs of [DR-184](184-native-desktop-tag-packages.md).

## Context

The reviewed Windows fixes are now published as Cligent 0.36.2 and Playbook 18.1.1.
Temporary vendor archives cannot satisfy the app release's public-registry dependency gate.

## Decision

- Both shells, the core and root tooling require Playbook `^18.1.1`; the core requires Cligent `^0.36.2`.
- The lock selects the published packages and their registry integrity values, with one physical Playbook, Cligent and xstate across the application and compiler.
- SLC remains `^0.20.0` because its published ranges admit these PATCH releases; existing Agent SDK and xstate versions remain locked.
- Do not restore forced MXC selection, fixed Windows shell guidance or an intermediate launch wrapper from the historical validation snapshot.
- Retire the temporary vendor archives and patch payloads from the checked-out application tree.
- Fork beta-tag verification exercises macOS arm64 and Windows x64 installers in isolated profiles, without merging the official SPEX PR.

## Consequences

Tag builds obtain their runtime inputs from npm without separately uploaded local dependency archives.
The accepted Cligent legacy-wrapper export removal and raw U+2028/U+2029 SDK-output limitation remain documented upstream.
This adoption does not change SPEX business behavior or claim acceptance for untested Agents.
