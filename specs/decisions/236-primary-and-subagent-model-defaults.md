<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-236: Primary and Subagent Model Defaults

## Status

Accepted (2026-11-14).
Amends [DR-019](019-inline-agent-configuration.md) in the initial block for adding a new player and [DR-208](208-playbook-18-1-2-cligent-0-37-0-slc-0-20-1-adoption.md) in the model lineup.
Amends [DR-205](205-agent-cards-read-alike.md) in the models omitted from a third-party Claude seed, and [DR-084](084-the-block-is-the-whole-compiler-agent.md) in the fields supplied to the compiler.

Amended by [DR-237](237-agent-tuning-across-runtime-versions.md) in model ownership and compiler compatibility.

## Context

The shared starter previously put Claude work on Opus and Codex work on Sol.
A stronger primary model can keep reasoning and design while delegating a bounded task to another model.
The compiler and an untouched new-player draft each need the child choice the reader configured.

## Decision

- For official services, seed Claude with `claude-fable-5-2` and child `claude-opus-5-5`, and Codex with `gpt-6-astra` and child `gpt-6.1-sol` where the installed adapter can select the child.
- Playbook owns the credential-based first-run lineup and its efforts. Spex follows it under [DR-154](154-the-seed-follows-playbooks-rule.md) and reseeds a previously untouched file under [DR-156](156-an-untouched-seed-follows-the-credentials.md).
- Adding a new roster player starts with the same model pair for the chosen adapter. Changing the adapter on an existing player still clears adapter-specific settings.
- For a third-party Claude service, leave official primary and child pins out of the starter and new-player defaults, so the provider can supply its models.
- Pass the configured child model alongside the primary to the compiler when the app supplies the agent block. An explicit disabled child remains disabled and an older compiler reports the unsupported option.

## Consequences

A personal edit continues to own both selections.
A config that omits a child retains its existing inheritance semantics, and a recorded call keeps its original model identity.
Desktop and server receive the new first-run lineup when their shared dependency lock adopts the published Playbook, Cligent and slc changes under [DR-182](182-published-desktop-runtime-adoption.md).
