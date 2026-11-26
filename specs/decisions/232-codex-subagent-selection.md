<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-232: Codex Subagent Selection

## Status

Accepted (2026-11-14).
Amends [DR-093](093-a-players-subagent-model.md) and [DR-095](095-a-subagents-effort-and-the-agents-own-model.md) in the meaning of the subagent selection on Codex.

Amended by [DR-237](237-published-agent-runtime-floors.md) in native fork behavior, the meaning of an omitted subagent model, and tool-free controls.

## Context

Cligent 0.38.0 advertises subagent tuning only for Claude.
Codex accepts native per-run defaults for a spawned agent's model and reasoning effort [[1]].

## Decision

- Offer the existing subagent fields when the installed adapter advertises them.
- On Codex the fields request spawn defaults. Fresh spawns can supply explicit values and a role may set its own model and effort [[1]].
  Full-history and fresh spawns both honor native model and effort overrides.
- The adapter instructs the player on each tuned turn to use the selected model for well-defined, fine-grained tasks, keep deep reasoning and design, brief delegates and verify their work.
- On Codex, omission leaves the choice to the runtime unless a subagent effort alone requests the parent model. Explicit `inherit` selects the parent. A reader can select GPT-6.1 Sol independently of the player’s own model ([DR-237](237-published-agent-runtime-floors.md)).

## Consequences

The same editor and saved settings work across adapters, with the runtime determining how it applies a selection.
Adopting the capability in a released app requires published, mutually compatible dependencies under [DR-167](167-the-compiler-shares-the-apps-engine.md).

## References

[1]: https://learn.chatgpt.com/docs/agent-configuration/subagents "Codex subagents"
