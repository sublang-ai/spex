<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-068: An Agent's Settings, Where The Agent Is

## Status

Accepted (2026-09-16) on the owner's review of the surface [DR-067](067-tuning-for-one-conversation.md) shipped: one agent's control opened every agent's settings, and a scope was given a name of its own.

Amends [DR-067](067-tuning-for-one-conversation.md), which remains accepted, in its §"Where it is shown and changed" alone.
That record's scope, precedence, storage, application at the three projection sites, validation without discovery, and its rule that a chip is a setting rather than a receipt all stand unchanged; this record replaces only what the reader sees and what it is called.

## Context

[DR-067](067-tuning-for-one-conversation.md) put one panel behind two kinds of door: an agent's own chip, and a control on the session header carrying a count of changed agents.
Both opened the same list of every agent in the session.
It also named the act — "Tune", "Tuning · 2", "This session's tuning".

Two faults, and they are the same fault seen twice.

**The object you touch is not the object you get.**
[DR-009](009-at-hand-interaction.md)'s law is that objects are editable where they are shown.
A chip on the coder that opens a roster of every agent obeys the letter — the editor is in place, no surface switched — and breaks the law it is quoting: what was shown was the coder, and what was offered was the session.
Anchoring the panel at the touched chip, which the earlier record did fix, corrected where the panel arrived and left what it contained wrong.

**A scope is not a concept.**
The product already holds every part of this: an agent, its settings, a chip that reads them, and an editor opened where the agent is shown.
Changing those settings here rather than everywhere is a difference of scope, and a scope is a sentence — "only this conversation" — not a noun.
Naming it bought three names for one preposition, and each name had to be taught.

The count followed from the panel rather than from a need.
Its stated job was answering "is this conversation running my defaults?" at a glance — but every agent's chip already reads what that agent runs, on the agent, and wears the mark that says the value was set here.
A second, aggregated answer to a question the first one already answers is chrome, and it cost a control in the session header, a label budget fight, a fit hazard and an accessibility surface.

Considered and kept out: a session-wide view of every agent side by side.
Comparing agents is a Settings activity, and Settings already does it.
Nobody compares their coder against their reviewer in the middle of a turn.

## Decision

### One agent's control opens one agent's settings

An agent's chip — in the Captain pane's header, and in each player pane's header — opens that agent's own editor and no one else's: its model, its effort, its fast mode, in the tri-state the product already uses ([DR-032](032-session-players.md)).
Three fields, the sentence that says where the change lands, and the sentence that says what lives in Settings instead.

There is no session-wide panel, no roster, and no count anywhere.
Where an agent's settings are wanted, the agent is on screen; where the agent is folded to a rail ([DR-030](030-workspace-chrome.md)), its rail carries its reading and unfolding is the reader's own gesture away — a lane the reader folded is not a duty hidden from him.

### The act has no name

Nothing in the interface is called tuning, and nothing offers to tune.
The chip is the agent's settings; opening it edits them; a line says they apply to this conversation only and that Settings is unchanged.
The same word the rest of the product uses for this — settings — is the word used here.

The wire follows: a session-scoped change to an agent is `session.agent.set`, beside the configuration's own `captain.set` and `player.set`, because it is the same act at a different scope rather than a different act.
"Tuning" survives only where [DR-032](032-session-players.md) already put it — as the spec's word for model, effort and fast mode taken together — and reaches no reader.

### What stays

Each field offers the configured value by name, the provider's current default, and a pinned value.
An agent whose bindings tune it of their own accord says so on its own editor, because one choice here runs those roles alike and silence would be a lie.
The way back is each field's own first option, with one control that returns the whole agent to its configured values while any of them stands.

## Consequences

- The run view loses the session header's control and the roster panel; each pane's chip gains its own editor, which is the shape the role-binding editor already has.
- `run-view-138` and `run-view-139` are rewritten to the agent's own editor and its own reading; their IDs keep their concerns — the editor and the reading — so [[meta-12](../meta.md#meta-12)] holds.
- The protocol's session-scoped agent command and the field a session carries are renamed to say settings rather than tuning; the version has not been released, so no compatibility is owed.
- The clear-for-the-whole-session goes with the panel. Returning three agents to their defaults is three visits to three agents, which is the honest cost of there being three of them.
