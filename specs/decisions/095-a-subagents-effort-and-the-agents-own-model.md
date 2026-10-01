<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-095: A Subagent's Effort, and the Agent's Own Model by Default

## Status

Accepted (2026-10-01) on the owner's review of the field [DR-093](093-a-players-subagent-model.md) shipped: a player's effort silently governed its subagents, the subagent-model field had no way to say "the same as the agent", and each model and its effort sat on separate full-width rows.

Amends [DR-093](093-a-players-subagent-model.md): the subagent model's choices are "Same as agent" and the adapter's models, with "Same as agent" the default; a fifth tuning field, the subagent effort, joins it; the two pair on one row.
Amends [DR-094](094-the-compiler-adopts-the-apps-cligent.md) in its floors alone: Cligent `^0.30.0`, Playbook `^17.3.0`, slc `^0.15.0`.
Amends [DR-067](067-tuning-for-one-conversation.md) and [DR-032](032-session-players.md) in their field count alone: five tuning fields.
Cites [DR-041](041-chrome-that-fits.md) for the row's fit.

## Context

Measured against Cligent 0.29 and Claude Code 2.1.284: a Claude session's effort is one setting, the Agent tool's call carries a model but no effort, and the only effort a subagent can own is its definition's.
So a player on `ultracode` delegated at `ultracode` — the loophole the owner named — and nothing in the interface could say otherwise.

Cligent 0.30 answers at the adapter: `subagentModel` admits `inherit`, the agent's own model; `subagentEffort` pins every subagent's effort or, omitted, leaves it to the agent per task through definitions the Agent tool lists; the directive's first sentence follows the two.
Playbook 17.3 carries the effort as a fifth tuning field and resolves an unset subagent model to `inherit` where the adapter serves one, so delegation is on by default for every Claude agent, with `false` as the way off.

The editors also wasted their width: a model on one full-width row and its effort on the next, though the chip already reads them as one phrase, "model @ effort".

## Decision

### "Same as agent" is the default, and reads as such

The subagent-model field offers "Same as agent" first and by default — the configured omission, which Playbook resolves to the agent's own model — then the adapter's models and the custom entry, as the model field offers them.
A configured `false`, which switches delegation off, is shown as "Off" only while it stands, so it is always clearable, and is not otherwise offered.
In a binding and in a session the inherit choice names the player's value, "Same as agent" where the player leaves it unset.

### The subagent effort is a fifth tuning field

Beside the subagent model, a subagent-effort field offers "Agent chooses" first and by default — the configured omission — then the adapter's efforts without its orchestration value.
It has the tri-state of the other tuning fields at every tier, is applied at the three sites of [DR-067](067-tuning-for-one-conversation.md), and is validated by launcher parity through Cligent, so an effort outside the adapter's vocabulary or set without a subagent model is refused in Cligent's own words.
Its label is "Subagent effort"; the empty choice reads "Agent chooses" (zh 由代理选择).

### A model and its effort share one row

In the shared agent editor, the role-binding editor and the session agent editor, the model field and the effort field stand on one row, and the subagent-model field and the subagent-effort field on the next, each pair the chip's own phrase; at the 320-pixel floor the pairs stack ([DR-041](041-chrome-that-fits.md)).
The chip is unchanged.

### Considered and declined

- **An "inherit the agent's effort" choice.** It is the loophole restated; the agent may still reach a subagent at its own effort through the built-in types, and the owner asked for a pin or the agent's choice.
- **Level semantics in the directive.** Efforts differ by model line, and the Agent tool describes each definition itself.

## Consequences

- The core's agent block, patch, resolved agent, binding, summary, session agent settings, projection application and `agent.options` each gain the effort field; `subagentModel` admits `inherit`; the protocol version rises and the shells move together.
- The three editors gain one field and the paired-row layout; both catalogs gain the strings.
- The floors rise to Cligent `^0.30.0`, Playbook `^17.3.0` and slc `^0.15.0`, installed from the public registry.
- Every Claude player of an existing configuration now delegates by default, on its own model at efforts of the agent's choosing; the changelog says so, and the subagent-model field's "Off" is the way back.
- This ships in the next beta of the 0.9.0 line.
