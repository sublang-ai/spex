<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-037: Playbook 12.1 and the Fast-Mode Mark

## Status

Done

## Intent

Adopt playbook 12.1.0 — trying its public host-capabilities facade against the Captain shell, keeping [DR-037](../decisions/037-playbook-12-adoption.md)'s by-path builder where the facade falls short — and show fast mode where an agent is named, per [DR-038](../decisions/038-history-is-done-work.md).

## Deliverables

- [x] Playbook 12.1.0 resolved; the facade tried and found unable to feed the shell, the finding recorded; the by-path builder kept.
- [x] Fast mode carried on agent, role, and session-player summaries; the lightning mark on every agent chip and player label; the editor's switch for supporting adapters.

## Tasks

1. Lockfile to playbook 12.1.0; the facade trial and its finding; suites green.
2. Protocol and summaries carry fast mode; readiness carries adapter support; chips, labels, and the editor render and edit it.

## Verification

core 171 and ui 263 green on playbook 12.1.0; the facade trial refused by the shell (repository lacks `acquire` and `runCohort`; per-playbook ledgers diverge) and recorded in DR-037/DR-038, the by-path builder kept; fast mode carried on captain, player, and role summaries and forwarded to the shell; live: the Settings editor shows the "Fast mode ⚡" switch on the Claude captain and none on the adapters that lack it, in both themes.
