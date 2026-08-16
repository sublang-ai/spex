<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-029: Session History Home

## Status

Accepted.
Realizes [DR-009](009-at-hand-interaction.md)'s "nothing the user produced becomes unreachable" as first-class law; extends [DR-007](007-conversational-session-start.md)'s start view into the session home.

## Context

- Ended sessions are already browsable — the Captain home lists them, and opening one replays its full read-only transcript — yet the product's own owner could not find a finished session minutes after watching it run.
  A feature the owner cannot find is not discoverable by anyone.
- The diagnosis, in order of harm:
  - the list lives behind the `+` tab — a door labeled "new", not "history" — and while a session runs, its own tab fronts and the home stays hidden;
  - entries carry no scent: a project name and an absolute timestamp, so no conversation is recognizable — every row reads alike;
  - a just-ended session gives the eye no handoff to its new home, so the mental model "ended sessions live on the home" never forms;
  - the read-only replay's header names the project, not the conversation.
- The thread itself became the run's record — bubbles and settled machine cards replaying identically ([DR-028](028-run-machine-view.md)) — so an ended session is now a complete, legible artifact worth shelving properly.
- The instant messenger is the pane's stated form (DR-010 §1), and messengers solved this shelf decades ago: a conversation list, titled by the conversation, ordered by recency, one tap from compose.

## Decision

- **Sessions are conversations; they get the conversation-list treatment.**
  The Captain home is the project's session home: compose a new session, or reopen any past one, in one place — the list is primary content whenever history exists, not a footnote under the greeting.
- **Every session is titled by its own words.**
  The session listing carries a server-derived title — the first Boss turn's text — beside the lifecycle fields; a session that never held a turn says so honestly rather than faking a name.
- **Entries carry the outcome at a glance.**
  One messenger-style row per session: the title, the ended time in relative terms, the turn count, a failure marker when the session ended carrying one, and the session's cost — human copy throughout (DR-010 §2), no identifiers as primary text.
- **The door says what is behind it.**
  The `+` tab's accessible name and tooltip name both duties — a new session and the history — so the archive stops hiding behind a door labeled "new".
- **Ending a session hands the eye to its shelf.**
  Ending lands on the session home with the just-ended session newly at the top of the list, briefly highlighted — the attention-management rule the house already follows: when an action moves something, show where it landed.
- **The replay is a first-class reader.**
  A past session opens read-only in place — no surface switch ([DR-009](009-at-hand-interaction.md)) — headed by its title and ended time, with the existing start-a-fresh-session affordance; Back returns to the home with its scroll kept, the records-reader precedent.
- **The Dashboard stays an attention surface.**
  No archive grows there; cross-project browsing is the home's existing all-projects scope.

**Considered and declined**, so the alternatives cannot re-enter piecemeal:

- a third pinned tab ("Sessions") beside Specs and Repo: the home already owns composing and history — a second door splits one mental model into two;
- motion replay or scrubbing of a past run: the settled cards and thread are the record; animating history is its own future decision;
- session deletion and retention: destructive, wants its own guardrail design (DR-010 §4) rather than a footnote here;
- searching history: titles make scanning sufficient at today's volumes; search earns a decision when volume demands it.

## Consequences

- The core-service package gains the session-listing contract item — the reply's lifecycle fields plus title, turn count, failure marker, and cost — with coverage.
- The run-view package gains items for the session-home list, the end-of-session handoff, and the past-session reader, with fixture coverage; the Captain-home empty-canvas item stands.
- The `spex-academy` demo flow becomes self-evidencing: a finished demo run is findable by its own first message minutes later.
