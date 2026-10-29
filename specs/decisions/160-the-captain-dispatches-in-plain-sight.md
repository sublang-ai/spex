<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-160: The Captain Dispatches in Plain Sight

## Status

Accepted (2026-10-27) for the owner's P0-4.
Amends [DR-155](155-players-named-delegated-and-recovered.md) in its delegation lines: every call puts its line, anchored at the call's traced start and naming its step; the model still shows only at a player's first call or a changed model.
Amends [DR-032](032-session-players.md) in its per-call role labels: a lane's call names the playbook and step it runs.
Amends [DR-031](031-machine-call-tree.md) in a card's active state: a run standing in a parallel state shows each of its active steps running, each with its own call.
Amends [DR-075](075-a-failure-says-what-and-what-now.md) in its wording alone: a failure the Boss's own stop caused reads aborted, not failed; the catalogue, its causes and the controls stand.

## Context

- With players called and lanes standing ([DR-146](146-a-lane-appears-with-its-first-call.md), [DR-155](155-players-named-delegated-and-recovered.md)), nothing on screen says it is the Captain handing out work: a lane does not say which step of which playbook it is doing, the thread says "Handed to coder" once and never that the work came back, and only the Captain's prose ties the two together.
- The surfaces disagree about one state: a run stopped by the Boss reads "failed" on its card, "running" on its badge, "needs attention" in the header and "stopped" once settled, and the lanes say "working".
- A machine card follows one active state, so a parallel step — `decide`'s two proposals — loses both of its running steps and their players.
- Everything needed is already in the records the run view folds ([DR-003](003-runtime-reuse.md)): Playbook traces each player call's start and finish with its state, role and player, each accepted outcome after the Captain judged it, and the repository identity it wrote into the transition from the repository's own receipt (Playbook DR-045).
- An outcome record carries no call id, and a call id counts within one runtime session only, so a call and its outcome have to be matched by rule.

## Decision

### A call and what it came back with

- A call is identified by its trace session and call id.
- Its outcome is the first `outcome.accepted` of its trace session, after the call finished, whose source is the call's state, until a later call of that same state in that session starts; a call of another state, a parallel sibling's, never takes or cuts off another's outcome.
- The transition's source is not read: in a parallel machine it is an object, not a state.
- The repository identity is read from the transition just before that outcome, and only where that transition accepted that one outcome: a transition accepting several shows each outcome's words and no identity on any of them.
- A transition's outcomes are collected until the same trace session's next trace record of another type — the order Playbook emits a transition in — each trace session collecting its own, so another run's records and the state telemetry between them end nothing, and a collection never ended names no identity.
- An outcome no call takes still counts: a transition accepting it beside another names no identity.
- A call back but not yet judged reads "judging" only while an outcome can still come; once its run ends, moves to its failure state, its step is called again or the turn ends, it reads "unconfirmed", never judging for good.
- A call whose run fails before its outcome is accepted — the judgment or the runtime failing, not the Boss's stop — reads "failed" on its line, beside the failure card.
- A call still open when the turn ends or a restore moves the runs to their recorded position is one the process died in: it is open no more and takes no prompt.
- A player's prompt record, which carries no call id, is matched to that player's earliest open call not yet matched, since one player's calls run one at a time and each prompt follows its call's start.

### In the thread

- Every call puts a delegation line at its start: "(C) Handed to coder · Merge the proposals"; the model joins it at the player's first call or a changed model, as before.
- A line's accessible name reads its parts apart; the dots between them are drawn only.
- Every call that came back or was stopped puts a return line: "← coder committed fd39684 · 40s · ⟨the reply's first line⟩", the whole reply a click away; before the outcome is accepted it reads "← coder handed back" marked "judging".
- A failed call puts no return line: its failure card says what happened.
- A call that asks the Boss reads "← coder asks you", waiting for him, without the question's words: the question reaches him in the Captain's words alone ([DR-085](085-boss-talks-through-captain.md)).
- A delegation or return line leads to the call on its lane; a call that failed before its player recorded anything has no lane, so its line leads nowhere.
- While calls run, a strip under the thread names each — "(C) coder · Merge the proposals · 58s" — and leads to its lane.

### On the lanes and the card

- A lane's call names its playbook and step — "decide › Merge the proposals", with the whole path from the root run in its tooltip and the round where the run walks the step again — and leads back to its delegation line.
- A step a player runs wears that player's mark and name on the card; a running one wears the mark as its running mark.
- A step not called yet wears the player the configuration recorded with its run's context binds, never a binding made since.
- A run standing in a parallel state shows each active step running with its own call, the leaves read from the state value: the runtime's active ids also list the parallel state and its regions.
- A lane at work says so where the reader looks, its tool calls folded: a tool call still awaiting its result wears the running mark and its ticking span on a tinted row, and the lane's foot names what the player is doing now — the tool and its subject, or thinking, or writing its reply.
- A call's usage reads in tokens, "120→30 token", not the abbreviation "tok".

### One status vocabulary

- Run, card, lane, chip, notice and return line say where they stand in five words and five colours: running, done, aborted, failed, waiting for you; the Captain's own "deciding" stays.
- A run the Boss stopped — the runtime parks it in its failure state with the `aborted` cause — reads aborted on its card, its notice, its failure card and the chip, in neutral colours, and the runtime's error repeating the stop adds no failure line; only the reasons the core stops a turn with — the Boss's abort, Spex closing — are read as a stop, a runtime failure ending its turn with its own error keeping its line.
- The runtime's advertised actions stand on that notice as on any failure park ([DR-074](074-a-parked-run-survives.md), [DR-075](075-a-failure-says-what-and-what-now.md)).

### The words of the steps

- Spex holds a table of the built-in playbooks' player steps and outcomes, in both languages, and of which outcome fields the runtime writes from the repository; a step or outcome it does not list reads as its id's words, and a step it does not list shows no identity.
- This is a stopgap: the playbooks should publish each step's short title, its outcomes' words and the field authority their compiled artifacts already record (`outcomeAuthority`), and the table goes once they do.

Considered and rejected: hover-linking a line and its lane — it helps only a reader already looking, and does nothing on touch or in a replay; flashing a lane's border at a call's start — the border already turns running; animating a line across the panes; quoting the Boss's topic on each delegation line — it does not change within a run.

## Consequences

- No prompt, core, protocol or Playbook change: every line, label and mark derives from records the run view already receives, so a reopened session shows what the live one did.
- The run-view items for the delegation line, the lane's call labels, the card's active states and the status words are amended or added; the localization package gains the step table.
- The machine graph the core serves for `dev`, `decide` and `code` is absent today, so their cards draw the steps observed so far; drawing the whole machine is separate work.
- Tests reading "working", "needs attention", "stopped" or "finished" read the one vocabulary.
