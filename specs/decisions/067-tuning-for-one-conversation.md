<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-067: Tuning for One Conversation

## Status

Accepted (2026-09-16) on the owner's request to set a player agent's model, effort, and fast mode for one session without moving the default or touching another session.

Amends [DR-051](051-runtime-held-for-a-turn.md), which remains accepted: a message opens the runtime on the current settings *and the session's own tuning*, projected onto the session's stored members.
Every other contract of that record stands — the hold lasting a turn, the tuning-versus-structure line, the refusal by name.

Amends [DR-032](032-session-players.md), which remains accepted: its two tuning tiers become three, with the session's own tuning above the player and the binding both.
The tri-state encoding, the player/binding ownership split, and the editor fork are used here unchanged rather than reopened.

Amends [DR-009](009-at-hand-interaction.md), which remains accepted, in its consequence that "the shared validation path (one `config.edit` protocol op) keeps them consistent": an in-place editor may now write a scope that is not the default, and it says which scope it writes.
The at-hand rule itself is upheld, not narrowed — this record puts one more primary flow inside Sessions.

Cites [DR-052](052-runtime-model-options.md) for where the model, effort, and fast-mode choices come from, and [DR-038](038-history-is-done-work.md) for the mark fast mode wears.

## Context

Model, effort, and fast mode live in Settings, where they are defaults for every session of every project.
A conversation that needs a bigger model for an afternoon has no way to say so: editing Settings retunes every other session at its next message, and editing it back is a second act the reader must remember to take.

### What the runtime can and cannot do

Measured against the installed `@sublang/playbook` 13.3 and `@sublang/cligent` 0.26:

- A compiled machine cannot ask for tuning.
  `PlaybookPorts.callPlayer` and `PlayerCallOptions` carry no settings, and a role binding reaching the runtime is a player id and a prompt identity.
- Cligent does hold a real per-invocation lever — `CallPlayerOptions.settings`, replacing every configured call setting atomically — but only the Captain shell reaches it, deriving it deterministically from the binding resolved when the session host opened.
  The shell publishes no member that retunes an open session.
- The execution projection is frozen for the host's lifetime at open.

So the only lever this host holds is the projection it hands the session host, and per-run tuning is not reachable without an upstream change.
That is not a limitation to design around quietly: it decides the unit.
Because [DR-051](051-runtime-held-for-a-turn.md) reopens the runtime for every message, the session *is* the finest unit that can be honestly promised, and it delivers per-turn granularity in practice without promising per-run.

### Why this is affordable at all

Playbook's structural projection erases exactly `model`, `effort`, and `fastMode` — at the Captain, at each player, and at each role binding — before comparing a reopen against the stored structure.
Those three fields are therefore the only ones free to differ on a reopen, and they are exactly the three this record offers.
A control offering a fourth would be a trap: its save would guarantee the next message is refused.

### Why not the config file

Writing the shared config and reverting afterwards was considered and is wrong in kind.
While it stands it *is* the default: it retunes every other session of the project at their next message, it reaches the playbook CLI, and a crash or a closed window leaves the reader's default silently changed.
An ad-hoc choice must not be able to become a permanent one by accident.

### Why not renderer-only state

Holding the choice only in the page makes "in force" and "visible" the same fact, which is attractive.
It does not survive this product.
The UI is served to browsers over one port ([DR-033](033-remote-gui-serving.md)), so a second client — or the same reader in a second window — would see a session running non-default models with no cause visible anywhere.
And a reload would silently revert the choice: a reader who tuned an hour ago, reloaded, and kept working would be back on the defaults with nothing having said so.
A setting that disappears when the page does is not a setting.

## Decision

### The scope is one session and one agent

A session carries its own tuning: a map from agent id to a model, an effort, and a fast mode, where the reserved id `captain` names the Captain and every other id names a player of the session's bound roster.
The Captain is in scope because it is an agent the reader pays for and steers, and leaving it out would make the surface answer "why can I tune the coder and not the Captain?" with nothing.

Nothing smaller is offered, because nothing smaller is real.
The interface says "from your next message", never "for this run".

Each field is the tri-state of [DR-032](032-session-players.md), encoded identically: omitted inherits, `false` selects the provider's current default, a string pins.
At this tier "inherit" means the configured value — whatever Settings and the binding resolve to — so the reader departs from what he sees rather than from a tier he has to reason about.

### Precedence, and where it is applied

The session's tuning stands above everything the config resolves: session, then the role binding, then the player, then the provider's default.
A reader tuning an agent is speaking about that agent's lane, not about one playbook's opinion of it, so a session value beats a binding pin.
Where a player answers roles whose bindings disagree, tuning that player makes those roles run alike, and the surface says so before the choice is taken.

It is applied when the session's execution projection is built, onto three kinds of site at once: the Captain's block, each player's block, and every role binding naming a tuned player.
All three, because the provider call for a role is built from the *binding*; patching a player's block alone changes nothing at call time and fails invisibly.

It is applied after composition, never inside it.
Composition stays byte-for-byte what the launcher would do ([DR-004](004-config-and-persistence.md)), so no Spex-only key can reach `playbook.config.yaml` and no config this host writes becomes one the CLI cannot read.

### It is not a default, and cannot become one

The tuning is stored under the session's id in the preference store, following the one existing precedent for a scoped agent choice that is not a default.
Three properties fall out, and all three are wanted: it is ignored by Git, so an ad-hoc choice never travels to the team dressed as a decision; it is removed with the session, so nothing ad-hoc outlives the conversation it was made for; and it is keyed by session, so another session of the same agent is untouched by construction rather than by discipline.

No `config.edit` operation is added, and this surface dispatches none.
The claim that a default cannot change from here is enforced by there being no code that could, and asserted by a test that reads the config file's bytes before and after.

### A chip is a setting, not a receipt

An agent's chip reads what that agent is *set* to run — the session's tuning of a field, else the configured value — and it changes the moment the choice is taken.
This is what a status line is everywhere else, and the alternative was tried and rejected: a chip that reads only what a past call actually ran cannot change until the playbook happens to call that agent, so a tuned reviewer would carry a "not yet" marker for days through turns that never called it.
A marker that cannot retire is a stuck indicator, not honesty.

What actually ran is recorded where records belong — in the transcript, and in the projection each turn is opened on.
The chip does not compete with it.

One statement of consequence earns its place, because it is bounded and the reader can see its end: while a turn is in flight the panel says that turn keeps the settings it started with.
Two further cases are left to the surfaces that already own them — a retry reuses the configuration its interrupted attempt saved, which the recovery controls already say, and a settled checkpoint the core could not continue keeps its runtime held, so the next message runs on the projection already open.
Neither is worth a standing marker: the first is stated where it is taken, and the second is rare, self-clearing, and indistinguishable to the reader from a turn still running.

### Where it is shown and changed

One panel, reached by two kinds of door, under the house popover idiom:

- from the agent itself — the tuning chip in the Captain pane's header and in each player pane's header, opening the panel at that agent's row, anchored at the chip the reader touched;
- from the session's own header, on a control that carries the count of tuned agents for the session's whole life.

The chip is the control, and there is no gear: a gear names the Settings surface, which is the precise wrong promise for a control that must not change Settings.

The count is the standing answer to "is this session running my defaults?", and it is needed because the choice is durable while any per-agent signal can be folded away: a lane collapses to a rail by an ordinary gesture, and a session reopened after a restart shows nothing until its panes are read.
The way back hangs on the same control, so the signal and the remedy are one object.

The panel offers model, effort, and fast mode, and nothing else.
Adapter, instruction, and permissions are structural; a control that changed them here would produce a refusal on the next message, so it does not exist, and the panel says where they live.

### Validation asks the runtime, not the network

A save is validated by composing the projection the next message would open on and letting the shared validator run its adapter-scoped rules, plus the runtime's own fast-mode support table.
Nothing is written when that throws.

Discovery narrows the *choices* ([DR-052](052-runtime-model-options.md)) and never gates the *save*: a save that depended on a ten-second subprocess would either block while discovery is down or skip the check it claims to make.

### Considered and declined

- **Per-run or per-call scope.** The runtime cannot honour it; designing a control around a scope the machine cannot keep is the dishonesty this product forbids. It becomes reachable the day Playbook carries settings on a call, and this tier does not block that.
- **Writing the config and reverting.** An ad-hoc act that can silently become permanent.
- **Renderer-only state carried on the submission.** Divergence across clients and across a reload, in the direction that makes the reader wrong.
- **Per-role tuning from a pane.** A pane is a player ([DR-032](032-session-players.md)); the role labels on its calls are a history, not a set of switches. Per-role tuning already exists, in the Playbooks surface, as a default.
- **A colour for a tuned agent.** The hue budget is enumerated ([DR-026](026-data-graphics-craft.md)): purple is interaction, emerald, amber, and red are status, and "tuned" is neither. The mark is form and words.
- **A chip reading only what last ran, with a pending line until a call proves it.** It makes a durable setting depend on an event the reader does not control: an agent the playbook never calls never retires the line.
  Neither Claude Code nor Codex separates the two, and the cases the split was built for are bounded, stated where they are taken, or rare enough not to earn standing chrome.
- **An expiry after N turns.** A surprise the reader cannot see coming. The standing count is the whole mitigation, deliberately.
- **Reusing the shared agent editor as it stands.** It offers adapter and permissions, which this scope must refuse; a half-disabled form teaches the wrong boundary.

## Consequences

- The core gains one command and one application point; the projection builder takes the session's tuning and applies it at the Captain, the players, and the bindings. The protocol version rises and the shells move together.
- A session's listing entry gains one field, its own tuning; a client reads it over the config state it already holds, so there is no second fetch, no new cache, and nothing new to keep in step.
- The run view gains a tuning chip on the Captain pane, a chip that is a control on each player pane, a session-header control carrying the count, and one panel behind all of them; `run-view-7`'s model chip and `run-view-3`'s read-only clause are reworded, the latter to say that a pane's *transcript* is read-only while its header governs its agent.
- A choice taken while a turn is in flight shows on the chip at once and reaches the runtime only at the next message. That is what a setting does, and the panel says so while the turn runs.
- What actually ran was already durable and portable before this record: the projection each turn opened on is written into the session's manifest and promoted at settlement, and that manifest is tracked and synced. Only the standing intent is local. That split is correct — the record of what happened travels, the wish to keep doing it does not — and is stated here because it is invisible.
- The playbook CLI continuing a Spex conversation reads the config alone, so it runs the defaults. That is honest: the tuning is this host's ad-hoc choice, not a fact about the conversation, and the panel's words claim nothing more.
- Two tri-state editors now exist with different homes — the Playbooks surface writing defaults, this one writing a session. They share one control and one grammar, and each names its own boundary.
