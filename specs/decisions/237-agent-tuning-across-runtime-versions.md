<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-237: Agent Tuning Across Runtime Versions

## Status

Accepted (2026-11-14).
Amends [DR-236](236-primary-and-subagent-model-defaults.md) in model-pair ownership and the handoff to older compilers, and [DR-232](232-codex-subagent-selection.md) in the rules for forks and tool-free calls.

## Context

Each place has its own installed runtime and provider environment. The IDE can be connected to a seat whose provider address is private. The currently bundled compiler can run the primary model but predates independent subagent selection.

## Decision

- Cligent owns the portable model pairs for the providers it serves. Playbook chooses the credential-based roster. The core resolves the models in the place where the agent runs and sends only the selections to Add Player. Without a runtime supplying a pair, a new player uses provider defaults.
- A compiler whose help lists the subagent variable receives its value. With an earlier compiler the primary still runs, with a progress message for a child selection it could not apply. Off requires no separate action there. Explicit independent Ultracode still requires compiler support.
- Codex's native spawn contract governs history and model selection. A full-history spawn can use a child model different from the parent where the native tool supports it. Tool-free control calls receive no delegation request. A Codex block with neither child model nor child effort leaves delegation to the runtime. An explicit `inherit` or a child effort alone requests the parent model.

## Consequences

Each place can choose official models without revealing a private endpoint. Older installations continue to compile while the published dependencies are being adopted.
