<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-237: Published Agent Runtime Floors

## Status

Accepted (2026-11-14); revised (2026-11-26).
Amends [DR-019](019-inline-agent-configuration.md), [DR-084](084-the-block-is-the-whole-compiler-agent.md), [DR-093](093-a-players-subagent-model.md), [DR-095](095-a-subagents-effort-and-the-agents-own-model.md), [DR-205](205-agent-cards-read-alike.md).

## Context

The provider environment, including a private provider address, belongs to the machine where the agent runs.
The compiler, launcher and IDE need the same published tuning contract.
Spex's first-run configuration is Playbook's seed, so the seeded agents change with the installed Playbook alone [[core-service-3](../packages/core-service.md#core-service-3)].
Model and tuning choices come from runtime discovery through Cligent ([DR-052](052-runtime-model-options.md)).
A stronger primary model can keep reasoning and design while delegating a bounded task to another model.
The compiler and an untouched new-player draft each need the child choice the reader configured.
Codex accepts native per-run defaults for a spawned agent's model and reasoning effort [[1]].

## Decision

- Amends [DR-019](019-inline-agent-configuration.md) in the initial block for adding a new player, [DR-205](205-agent-cards-read-alike.md) in the models left out of a third-party Claude seed, [DR-084](084-the-block-is-the-whole-compiler-agent.md) in the fields supplied to the compiler, and [DR-093](093-a-players-subagent-model.md) and [DR-095](095-a-subagents-effort-and-the-agents-own-model.md) in the meaning of the subagent selection on Codex.

### Model pairs

Cligent owns the portable primary and subagent model pairs: for official services, Claude runs `claude-fable-5-2` with child `claude-opus-5-5`, and Codex `gpt-6-astra` with child `gpt-6.1-sol`.
Playbook chooses the credential-based roster and its efforts: every seeded agent at `medium`, and a `dev.reviewer` seeded on Codex beside Claude agents at `high`.
Spex follows that seed under [DR-154](154-the-seed-follows-playbooks-rule.md) and reseeds a previously untouched file under [DR-156](156-an-untouched-seed-follows-the-credentials.md).
The core resolves model defaults where the agent runs and sends the selections to Add Player.
Adding a new roster player starts with the model pair for the chosen adapter; changing the adapter on an existing player still clears adapter-specific settings.
A provider without a known pair supplies its own defaults.
For a third-party Claude service, official primary and child pins are left out of the starter and new-player defaults, so the provider can supply its models.
The third-party Claude repair lists official primary and child pins independently across the Captain and every own or project-composed role.
It removes Captain and player pins and replaces a binding's primary pin with Provider default or its child pin with Same as agent, preserving custom names, `inherit` and `false`.

### Runtime and compiler

The core requires `@sublang/cligent` `^0.39.0` and its model-discovery export.
Where the app supplies the agent block, the bundled compiler receives the configured subagent model beside the primary, and the independent Ultracode setting, directly; an explicitly disabled child remains disabled in the compiled selection.

### Subagent selection

The subagent fields are offered where the installed adapter advertises them.
On Codex they request spawn defaults: a fresh spawn can supply explicit values and a role may set its own model and effort [[1]], and full-history and fresh spawns both honor native model and effort overrides.
Codex selects spawn history independently of child model and effort, subject to its advertised spawn options.
On each tuned turn the adapter instructs the player to use the selected model for well-defined, fine-grained tasks, keep deep reasoning and design, brief delegates and verify their work.
Tool-free control calls receive no delegation request.
A Codex block with neither child model nor child effort leaves delegation to the runtime.
An explicit `inherit` or a child effort alone requests the parent model.
A reader can select GPT-6.1 Sol as the child independently of the player's own model.

## Consequences

Official models are chosen where the agent runs, without a client learning a private provider endpoint.
A fresh seed, or a reseed of an untouched one, runs every agent at `medium` but a second-adapter `dev.reviewer` at `high`; a configuration the reader has edited keeps its models and efforts.
A personal edit owns both the primary and the child selection.
A config that omits a child retains its existing inheritance semantics, and a recorded call keeps its original model identity.
The same editor and saved settings work across adapters, with the runtime determining how it applies a selection.
A clean installation resolves the shared runtime contract in the lockfile.

## References

[1]: https://learn.chatgpt.com/docs/agent-configuration/subagents "Codex subagents"
