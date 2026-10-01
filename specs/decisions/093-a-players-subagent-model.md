<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-093: A Player's Subagent Model

## Status

Accepted (2026-09-30) on the owner's request that a player's subagents run on a model of the reader's choosing, and that the player be told to offload well-defined, fine-grained work to them while keeping the deep thinking, reasoning and design work itself.

Amends [DR-019](019-inline-agent-configuration.md) §"UX": the shared agent editor gains a subagent-model field where the adapter accepts one.
Amends [DR-032](032-session-players.md): a role binding's tuning is four fields, not three.
Amends [DR-067](067-tuning-for-one-conversation.md) §"Why this is affordable at all" and §"The scope is one session and one agent": the runtime now erases four tuning fields, and a session's own tuning of an agent may hold a subagent model.
Amends [DR-092](092-playbook-17-1-slc-0-13-cligent-0-28-adoption.md) in its floors — Cligent `^0.29.0` and Playbook `^17.2.0` — and, until slc adopts Cligent 0.29, in how its one Cligent is kept: slc 0.13 declares `^0.28.0`, so the root overrides the compiler's Cligent range to the app's `^0.29.0`, an additive release, and one Cligent serves the app and its compiler.
Cites [DR-052](052-runtime-model-options.md) for where the choices come from and [DR-041](041-chrome-that-fits.md) for why the chip does not read it.

## Context

A conversation that puts a strong, slow model on a player pays that model for every file read and every small edit.
Claude Code can hand bounded work to subagents, and its runtime lets a host name the model those subagents use; what it does not do is tell the main agent to delegate deliberately — left alone, a player delegates as it always did, or not at all.

The owner asked the design question first: is this a runtime parameter, or a prompt the reader writes?
Measured against the installed toolchain:

- A prompt cannot enforce a model.
  The main agent may pass a model to its Agent tool or not, and must know the runtime's model names; a chip that read "subagents on Opus 5.5" over a prose request would be a wish, not a setting.
- A parameter without words changes nothing the reader can see.
  The model the subagents use matters only once the agent delegates, and the reader's whole intent is that it delegate more, and well.
- The words belong to the layer that reaches the runtime.
  Only Cligent's Claude adapter reaches both the process environment that fixes the subagent model and the system prompt of the run; Playbook composes compiled prompt relays, and Spex composes nothing an agent reads.

So the choice is a model, and the directive follows from it, composed once in Cligent 0.29 ([DR-092](092-playbook-17-1-slc-0-13-cligent-0-28-adoption.md) names the floors this record raises): on Claude, `subagentModel` makes every subagent of a run use the named model and puts one delegation directive naming it into the run's system prompt, re-sent with every message, so a change lands from the next message.
Playbook 17.2 carries the field as tuning: an agent block's and a role binding's fourth tuning field beside model, effort and fast mode, erased from the structural projection like them, and delivered in every call's complete settings.

### What the reader sees today

Model, effort and fast mode are offered in four homes that share one grammar: the Captain's editor in Settings and on the Captain home, a role row's player editor in the Library, the role-binding editor, and the agent's own editor in a session ([DR-068](068-an-agents-settings-where-the-agent-is.md)).
Each field is the tri-state of [DR-032](032-session-players.md) — inherit, the provider's default, a pin — and each session-scoped choice stands above the binding and the player ([DR-067](067-tuning-for-one-conversation.md)).
A fourth field that behaved otherwise in any of those homes would be the irregularity the reader notices first.

## Decision

### One field, the grammar the other three have

`subagentModel` joins model, effort and fast mode as a tuning field:

- in the shared config, on the Captain's block and each player's block, as a merge-patched key like `model`, and in a role binding as a pin, `false` for the provider's default, or omission to inherit the player's value;
- in a session, as a fourth key of the session's own agent settings, applied at the Captain's block, each tuned player's block, and every role binding naming a tuned player — the three sites of [DR-067](067-tuning-for-one-conversation.md) — because a role's provider call is built from its binding.

Its choices are the adapter's own model list from discovery, with the provider's default and a custom entry, as the model field offers them ([DR-052](052-runtime-model-options.md)); the provider's default means the runtime's own order of choosing a subagent's model.
Validation is launcher parity: the shared validator delegates support to Cligent's capability, so a subagent model on an adapter Cligent does not serve is refused with Cligent's own wording, and discovery gates no save.

### Where it is shown

The field appears in every editor that offers the model field: the shared agent editor, the role-binding editor, and the session agent editor.
It is offered where the adapter accepts a subagent model or a choice already stands, so a stale one is always clearable — the rule fast mode already follows.
Its label is "Subagent model"; it explains nothing about delegation, because the directive is the runtime's, not the reader's, and the field's name says what it selects ([DR-069](069-key-phrases-not-sentences.md)).

The chip does not read it.
A chip reads adapter, model and effort within its 14-character budget ([DR-041](041-chrome-that-fits.md)); the subagent model is a second model, and a chip carrying two would fit neither.
The editor the chip opens shows the field, and a session's own choice of it counts the chip as changed, as any other tuned field does.

### Not carried to the compiler

The compile's agent runs on its block's model, effort and fast mode ([DR-081](081-the-app-supplies-the-compiler.md)); the compiler defines no subagent-model variable, and a compile has no work to hand a subagent.
The draft conversation's Captain, run through Cligent directly, carries the block's subagent model like its model, so a Captain tuned to delegate delegates while authoring too.

### Verification by layer

Each layer proves its own claim once, and no layer repeats another's:

- Cligent proves the mechanism live: one acceptance run in which a subagent of a Claude run uses the named model, and unit proof of the environment pair and the exact directive.
- Playbook proves the carrying: the key admitted through Cligent's contract, projected into every call's complete settings, erased from the structural projection, and probed on the installed Cligent.
- Spex proves the interface to the projection: the editors write the key, `session.agent.set` validates and persists it, the projection the next message opens on carries it at the three sites, and `agent.options` reports where it is offered.
  No Spex test runs a real subagent.

### Considered and declined

- **A free-text prompt field per agent.** Unenforceable as to the model, a second feature beyond the ask, and words the reader would have to write in every configuration; the directive is Cligent's and follows the choice.
- **A field on the player only, not the binding or the session.** A tuning field that stops at one tier breaks the grammar the reader learned from the other three, and DR-067's application at the binding exists because the binding builds the call.
- **The chip reading the subagent model.** Two models do not fit the chip's budget; the editor is one click away and the changed mark already says a choice stands.
- **Carrying it to the compiler.** slc has no such variable, and a compile has nothing to delegate.

## Consequences

- The core's agent block, patch, resolved agent, session agent settings, projection application, config summary, `agent.options` capability, and the protocol schemas each gain one optional field; the protocol version rises and the shells move together.
- The shared agent editor, the role-binding editor and the session agent editor each gain one field; the tuning-field control learns a third label; both catalogs gain its strings.
- The floors rise to Cligent `^0.29.0` and Playbook `^17.2.0`, installed from the public registry; both are additive releases.
- slc 0.13 still declares Cligent `^0.28.0`, which a `0.x` caret closes below 0.29; left to itself the lock hoists that 0.28 to the root and nests two 0.29 copies, so the root's `overrides` entry points slc's Cligent at `^0.29.0` — an additive release whose one compatibility note is a type-level narrowing slc's imports do not meet — and one Cligent serves the app and its compiler, as DR-092 decided; the override retires when slc adopts 0.29.
- A session tuned with a subagent model is recorded, like any tuning, in the projection each turn opens on; the playbook CLI continuing the conversation runs the config's value, as it does for the model.
- This ships in the next beta of the 0.9.0 line.
