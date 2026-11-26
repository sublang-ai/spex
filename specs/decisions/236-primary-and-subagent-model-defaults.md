<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-236: Primary and Subagent Model Defaults

## Status

Accepted (2026-11-14).
Amends [DR-019](019-inline-agent-configuration.md), [DR-084](084-the-block-is-the-whole-compiler-agent.md), [DR-205](205-agent-cards-read-alike.md).
Amended by [DR-237](237-published-agent-runtime-floors.md).

## Context

The shared starter previously put Claude work on Opus and Codex work on Sol.
A stronger primary model can keep reasoning and design while delegating a bounded task to another model.
The compiler and an untouched new-player draft each need the child choice the reader configured.

## Decision

- Amends [DR-019](019-inline-agent-configuration.md) in the initial block for adding a new player, [DR-205](205-agent-cards-read-alike.md) in the models left out of a third-party Claude seed, and [DR-084](084-the-block-is-the-whole-compiler-agent.md) in the fields supplied to the compiler.
- For official services, Claude runs `claude-fable-5-2` with child `claude-opus-5-5`, and Codex `gpt-6-astra` with child `gpt-6.1-sol`; the pairs are Cligent's, resolved where the agent runs ([DR-237](237-published-agent-runtime-floors.md)).
- Playbook owns the credential-based first-run lineup and its efforts. Spex follows it under [DR-154](154-the-seed-follows-playbooks-rule.md) and reseeds a previously untouched file under [DR-156](156-an-untouched-seed-follows-the-credentials.md).
- Adding a new roster player starts with the same model pair for the chosen adapter. Changing the adapter on an existing player still clears adapter-specific settings.
- For a third-party Claude service, leave official primary and child pins out of the starter and new-player defaults, so the provider can supply its models.
- The third-party Claude repair lists official primary and child pins independently across the Captain and every own or project-composed role.
  It removes Captain/player pins and replaces a binding’s primary pin with Provider default or child pin with Same as agent, preserving custom names, `inherit` and `false`.
- Pass the configured child model alongside the primary to the compiler when the app supplies the agent block. An explicitly disabled child remains disabled in the compiled selection.

## Consequences

A personal edit continues to own both selections.
A config that omits a child retains its existing inheritance semantics, and a recorded call keeps its original model identity.
