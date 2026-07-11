<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# RUN: User-Facing Run View Behavior

## Intent

This spec defines user-visible behavior of the project session run
view: the Spex screen that renders one live playbook session as a
Captain pane, read-only player panes, and the single Boss composer,
per the concept model of
[DR-002](../decisions/002-desktop-app-architecture.md).
Everything the view displays derives from the session record stream,
and the captain glyph vocabulary follows the embedded Playbook
Captain shell, per [DR-003](../decisions/003-runtime-reuse.md).

## Captain Pane

### RUN-1

While a project session is live, when the session record stream
delivers a captain status line, the Captain pane shall append the
line in arrival order, preserving its glyph:

| Glyph | Line kind |
| --- | --- |
| ◇ | engagement start, stop, and finished status |
| ◆ | failure and await-Boss-reply notices |
| ▸ ⮕ ⤷ | playbook state-machine progress stream |

When the captain speaks, the Captain pane shall render the speech
text as chat-style prose, visually distinct from glyph lines.

### RUN-2

While a project session is live, when the session record stream
delivers a failure, the Captain pane shall display one ◆ line
carrying both the failure name and the failure message.
The Captain pane shall not suppress or collapse failure lines, so
no delivered failure is left without a visible line.

## Player Panes

### RUN-3

While a project session is live, when the session record stream
delivers text or text deltas for a visible player, that player's
pane shall render the accumulating message as formatted Markdown,
appending each delta as it arrives rather than waiting for turn
completion.

A player pane shall be read-only: it shall offer no text input,
reply, or edit affordance, since Boss input happens only in the
Boss composer ([RUN-8](#run-8)).

### RUN-4

When the session record stream delivers a tool-use event for a
visible player, that player's pane shall render it as a collapsed
card labeled with the tool name. When the card is expanded, it
shall reveal the tool input and, once delivered, the paired tool
result. While collapsed, the card shall show only its label, not
the tool payload.

### RUN-5

When the session record stream delivers thinking content for a
visible player, that player's pane shall render it collapsed by
default, with an affordance that expands the full thinking text on
demand.

### RUN-6

When a player turn completes with usage data, that player's pane
shall display the turn's token usage and cost at the end of the
turn's transcript. When a turn completes without usage data, the
pane shall omit the usage line.

## Pane Visibility

### RUN-7

While a project session is live, the run view shall show exactly
one player pane per player marked visible by the session's current
visibility state, adding and removing panes as visibility changes
arrive. The run view shall not display the content of hidden
records (for example, judge or router traffic) in any pane.

## Boss Composer

### RUN-8

The Boss composer shall accept free text and `/`-prefixed command
text, and shall be the only input control in the run view.
While no turn is active, when the Boss submits, the Boss composer
shall dispatch the submission without queueing.
While a turn is active, when the Boss submits, the Boss composer
shall queue the submission and show a visible queued indicator
until the queued submission is dispatched.
When the active turn ends, the Boss composer shall dispatch the
queued submission.

### RUN-9

While an engagement awaits a Boss reply, the run view shall display
the asking player's question prominently above the Boss composer
and inside the asking player's pane. While an engagement awaits a
Boss reply, when the Boss submits, the Boss composer shall send the
submission as the reply to the waiting question — not as a new Boss
prompt — and clear the question display.

## Turn Control

### RUN-10

While a turn is active, the run view shall present an abort
control; while no turn is active, the run view shall hide or
disable the abort control. When the abort control is activated,
the run view shall request abortion of the active turn; when the
session record stream then delivers the turn-aborted record, the
run view shall display a visible aborted marker on the interrupted
turn.

## Turn Summaries

### RUN-11

Where the active playbook declares a summary policy, when a turn
completes, the run view shall display the turn summary produced for
that turn. Where the active playbook declares no summary policy,
the run view shall show no summary entry.

## Layout and Theme

### RUN-12

Where the shared configuration declares layout weights (see
[DR-004](../decisions/004-config-and-persistence.md)), the run view
shall size the Captain and player panes proportionally to those
weights; where no layout is configured, the run view shall apply
built-in default weights. The run view shall provide light and dark
color themes, selecting the configured theme when one is set and
following the OS appearance otherwise.

## Session Start

### RUN-25

Where no session tab is active, when the Sessions surface is shown,
the run view shall present the start view: a Captain composer as
the primary element, a selector listing the registered projects, a
control that adds a project by choosing a local folder (native
picker when available per
[DR-008](../decisions/008-native-shell-bridge.md), manual path
entry otherwise), one chip per configured playbook showing its
slash command and intent, and the captain's profile, model, and
readiness state per
[DR-007](../decisions/007-conversational-session-start.md).

### RUN-26

While the start view is shown and a project is selected, when the
user submits composer text, the run view shall create a session for
that project, dispatch the text as the session's first Boss turn,
and switch to the new session's tab. While no project is selected,
the start view shall keep the composer's send action disabled and
say why.

### RUN-27

While the start view is shown, when the user clicks a playbook
chip, the run view shall insert the chip's slash command into the
composer without dispatching it. When the user switches the captain
profile in the start view, the run view shall write the change to
the shared configuration as a captain change and reflect the
updated readiness state.
