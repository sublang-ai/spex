<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-237: Published Agent Runtime Floors

## Status

Accepted (2026-11-14); revised (2026-11-26).
Amends [DR-232](232-codex-subagent-selection.md), [DR-236](236-primary-and-subagent-model-defaults.md).

## Context

The provider environment, including a private provider address, belongs to the machine where the agent runs.
The compiler, launcher and IDE need the same published tuning contract.
Spex's first-run configuration is Playbook's seed, so the seeded agents change with the installed Playbook alone [[core-service-3](../packages/core-service.md#core-service-3)].
Model and tuning choices come from runtime discovery through Cligent ([DR-052](052-runtime-model-options.md)).

## Decision

Cligent owns the portable primary and subagent model pairs.
Playbook chooses the credential-based roster and its efforts: every seeded agent at `medium`, and a `dev.reviewer` seeded on Codex beside Claude agents at `high`.
The core resolves model defaults where the agent runs and sends the selections to Add Player.
A provider without a known pair supplies its own defaults.

The core requires `@sublang/cligent` `^0.39.0` and its model-discovery export.
The bundled compiler receives the configured subagent model and independent Ultracode setting directly.

Codex selects spawn history independently of child model and effort, subject to its advertised spawn options.
Tool-free control calls receive no delegation request.
A Codex block with neither child model nor child effort leaves delegation to the runtime.
An explicit `inherit` or a child effort alone requests the parent model.

## Consequences

Official models are chosen where the agent runs, without a client learning a private provider endpoint.
A fresh seed, or a reseed of an untouched one, runs every agent at `medium` but a second-adapter `dev.reviewer` at `high`; a configuration the reader has edited keeps its models and efforts.
A clean installation resolves the shared runtime contract in the lockfile.
