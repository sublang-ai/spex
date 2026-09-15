<!--
SPDX-License-Identifier: Apache-2.0
SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>
-->

# DR-066: Every summons has a door

## Status

Accepted.

Amends [DR-035](035-intent-ledger.md), which remains accepted: `permission` leaves the attention fold and the interrupted-intent states, the last-viewed marker's meaning is fixed with the act that produces it named, and a project whose stored state refuses writes raises no entry.
The two bands, the fold's determinism, and every other contract of that record stand.
DR-035 already decided that a glance clears the finished-turn summons — "cleared as today — viewing for the finished chat turn" — so marking on showing restores that decision rather than taking a liberty against it.

Amends [DR-010](010-interface-craft.md), which remains accepted, with a tenth principle: every summons has a door.

Amends [DR-062](062-ending-a-failed-workflow.md), which remains accepted: the verdict on an interrupted intent is takeable from its Dashboard row as well as from the conversation.
Retry stays in the conversation, and the run's own ending stays with it.

Amends [DR-029](029-session-history-home.md), which remains accepted: a session's status mark speaks its entry's own kind, in four word sets rather than two.

Amends [DR-009](009-at-hand-interaction.md), which remains accepted: clearing a summons no longer requires switching surface, because the act that clears it is on its row.

Amends [DR-061](061-run-state-from-frames.md), which remains accepted: the project palette reads the one published fold instead of deriving a count of its own; a run's frames still answer for its state, inside that fold.

Cites [DR-065](065-repairs-the-reader-answers.md) for the boundary this record draws between a gesture taken on a conversation and a list drawing a row.

## Context

The Dashboard summoned the reader with "turn to review" on sessions whose turns had finished before this client ever saw them — synced from another device, or written into the shared session store by the playbook CLI.
That entry clears when the session's last-viewed marker passes the turn, and exactly one place in the product advanced that marker: the record-stream handler, on a `turn_finished` record arriving live while that session was the shown one.
No such record ever arrives for a turn that finished elsewhere.
Opening the session, reading it, and closing it changed nothing; no control anywhere said "I have read this".
The summons was permanent.

The label compounded it.
"turn to review" names a band and an activity, not a state, and asks for an act no control performed.

The defect is not the label and not the dot.
It is that Spex attached the clearing act to the session's *runtime* rather than to the summons, so the act inherited every condition the runtime carries — being live, being continuable, being owned by this host, being watched at the instant a turn ended.
`finish` is the one kind built the other way: Confirm and Drop ride the row and read no session state, which is why that kind has never had this failure.

An audit of every kind found the same shape elsewhere.
A `permission` entry could never be answered at all: no command answers a permission request, no pane offers a control, and the product states the policy outright — Spex answers no permission request, so the agent's own default decides.
The interface asked for a decision it could not accept, counted it in the badge, and carried it to the dock.
A stand-in failure ignored the parked rule the specs already stated for it, clearing on any later turn.
And a project whose stored state refuses writes raises entries whose every act — a verdict, a marker — the store refuses.

## Decision

**No summons without a door.**
Every attention entry carries at least one act that ends it whose admission depends on no runtime state of its session, and the entry names, in its own words, every act that ends it.

Two shapes follow from what the act is:

- an act that is a statement about the ledger — a verdict, a mark reviewed — is a control on the row, acting on the click;
- an act that is a turn the session must run — a reply, a recovery, an ending — is named in the row's summary, and activating the row lands focus on the control or composer that runs it.

A control is offered and its refusal reported, never withheld on a prediction of whether it would be accepted.

The fold raises a closed set of kinds, and raises none it cannot equip with a door:

- `permission` is not raised: nothing in the product answers a permission request.
  The request stays visible where it is true — as a line in the asking player's pane, saying that the agent's own default decided.
  It returns the day a control answers it, with that control, never before.
- a project whose stored state refuses writes raises nothing: its conditions stand as storage diagnostics, where the repair is — exactly as a session whose project holds no local binding already does.

**The marker means the reader saw it.**
A session's last-viewed marker records the greatest *ended* turn of that session the reader has had in front of them — nothing about the runtime, the lease, or which host can continue it.
It is a standing condition, not an event: while the workspace shows a session with its transcript loaded, that session's greatest ended turn is viewed, however the reader arrived and whether or not this core could continue the conversation.
Stating it as a standing condition is what makes it survive a refusal — a one-shot write lost to a Space operation would never retry, because the tab is already shown.
The core refuses a marker naming a turn that has not ended, so no client can suppress the next summons by naming a turn in flight.

A glance clears it.
Requiring a scroll would make the marker a claim about comprehension it cannot honestly make, and would break for a transcript shorter than its pane.

This does not contradict [DR-065](065-repairs-the-reader-answers.md).
Opening a conversation is a gesture taken *on that conversation*: it has a subject, it is the reader's own act, and the next finished turn undoes it.
A list drawing a row is none of those, and still settles nothing.

**The corollary, so this cannot recur.**
A spec item naming an entry's clearing condition names the act that produces it.
That single sentence is the whole defect: the specs said the marker advances, and no item anywhere said who advances it.

## Consequences

- The protocol's attention-entry kinds narrow to question, failure, finish, and review, and a failure publishes whether it parked a run so its row can name the next step honestly; the protocol version rises.
- Removing `permission` removes the only signal for a runtime blocked forever on a request nothing answers: such a session now reads as a long run in the Running band — honest, and quiet — and the case is revisited the day a permission control exists.
- The marker lives in the shared Spex home, so one device clearing an unread turn clears it on every device. That is correct for a shared ledger, and worth stating because it is invisible.
- A Space sync resets the markers of every session whose stored history changed, which can raise a burst of unread-turn rows. Each is one click, and a bulk control is deliberately declined: at most one such entry stands per project.
- A Drop taken on a row whose run is still parked rules on the intent alone. The run keeps summoning, now in the session's own words, so the replacement row must be legible as a consequence rather than as a failed act.
- A verdict stays takeable in a conversation this core cannot continue, in the session as well as on the row: the delivery card's controls no longer claim to be inert while the same act is offered elsewhere.
