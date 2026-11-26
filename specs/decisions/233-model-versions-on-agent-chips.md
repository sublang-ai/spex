<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-233: Model Versions on Agent Chips

## Status

Accepted (2026-11-14) on the owner's report.
Amends [DR-091](091-models-named-by-the-runtime.md).

## Context

Choosing Opus 5.5 left the agent chip reading `claude · opus`.
The model picker shows the specific model behind an alias and saves the runtime's selectable ID, as [DR-052](052-runtime-model-options.md) requires.
Printing that ID alone loses the version the reader just chose.

## Decision

- Amends [DR-091](091-models-named-by-the-runtime.md) in the presentation of configured models on agent chips and in allowing discovery for those chips.
- An agent chip showing a configured model names the specific model behind its alias from that core's adapter catalog.
- A chip presents the saved value immediately and shares model discovery with other chips for the same adapter on the same connection.
- Where the catalog supplies no alias resolution, the chip uses the model field's display for the value.
- A session chip with a matching runtime report keeps the reported model, and historical call lines keep the evidence for that call.

## Consequences

Selecting `opus` when it resolves to `claude-opus-5-5` shows `claude · claude-opus-5-5` on a configured-agent chip.
The stored alias continues to follow the provider.
