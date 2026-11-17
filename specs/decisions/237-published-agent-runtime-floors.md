<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-237: Published Agent Runtime Floors

## Status

Accepted (2026-11-14).
Amended by [DR-241](241-reviewable-builtin-gears.md) in the Playbook and slc floors and bundled playbook version.
Amended by [DR-239](239-playbook-18-3-1-reference-adoption.md) in the Playbook floor and bundled playbook version.
Amends [DR-236](236-primary-and-subagent-model-defaults.md) in model-pair ownership and the shared runtime floor, and [DR-232](232-codex-subagent-selection.md) in the meaning of an omitted Codex subagent model, fork history and tool-free calls.
Amends [DR-224](224-playbook-18-1-4-adoption.md) in the Playbook floor and built-in release and [DR-217](217-cligent-0-38-0-adoption-and-models-on-re-check.md) in the Cligent and slc floors.

## Context

Each place has its own provider environment.
The IDE can be connected to a seat whose provider address is private.
The compiler, launcher and IDE need the same published tuning contract.

## Decision

Cligent owns the portable primary and subagent model pairs.
Playbook chooses the credential-based roster.
The core resolves model defaults where the agent runs and sends the selections to Add Player.
A provider without a known pair supplies its own defaults.

The core requires Cligent `^0.39.0`, all Playbook consumers require `^18.3.0`, and both shells require slc `^0.21.0`.
The bundled playbooks stage as `sublang/playbooks` 18.3.0.
Each consumer adopts the published dependencies with its lockfile, in order from Cligent to Playbook to slc to Spex.
The bundled compiler receives the configured subagent model and independent Ultracode setting directly.

Codex selects spawn history independently of child model and effort, subject to its advertised spawn options.
Tool-free control calls receive no delegation request.
A Codex block with neither child model nor child effort leaves delegation to the runtime.
An explicit `inherit` or a child effort alone requests the parent model.

## Consequences

Each place can choose official models without revealing a private endpoint.
A clean installation resolves the shared runtime contract in the lockfile.
