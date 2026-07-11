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

While an engagement awaits a Boss reply, the Captain thread shall
render the question as a first-class incoming message bubble naming
the asking player (one identity: the player's pane id), replacing —
not duplicating — the runtime's status-line narration of the same
question, and a compact banner above the Boss composer shall name
the waiting player without repeating the question. While an
engagement awaits a Boss reply, when the Boss submits, the Boss
composer shall send the submission as the reply to the waiting
question — not as a new Boss prompt — and clear the banner.

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
the run view shall present the Captain home: a chat thread opened by
a Captain greeting that offers two or three high-level hints (choose
a project, type `/` for playbooks, or describe a task), a chat
composer, a project chip listing the registered projects with an
"Open folder…" entry (native picker when available per
[DR-008](../decisions/008-native-shell-bridge.md), a path field in
the menu otherwise), and the captain's profile and model with a
gear control that opens the profile in Settings, per
[DR-007](../decisions/007-conversational-session-start.md).

### RUN-26

While the Captain home is shown and a project is chosen, when the
user submits composer text, the run view shall create a session for
that project, dispatch the text as the session's first Boss turn,
and switch to the new session's tab. While no project is chosen,
when the user submits, the run view shall open the project chip
menu instead of dispatching.

### RUN-27

When the user picks a folder that is not a git repository, the run
view shall initialize a git repository there and register it as a
project without further prompts. When the user types `/` at the
start of a composer, the run view shall show the configured
playbooks filtered by the typed prefix, each with its intent as the
hint, and insert the selected command into the composer without
dispatching it. The Captain home shall show highlighted playbooks
as a quick start card that the user can dismiss, and the dismissal
shall persist across launches.

### RUN-30

The run view shall present conversations in instant-messaging form:
the user's submitted messages shall appear as their own chat
bubbles in the Captain thread, Captain speech as counterpart
bubbles, and shell status lines as compact system lines between
them.

## At-Hand Operations

### RUN-32

When the user opens the captain identity's editor control (or a
profile reference's editor control elsewhere in the run view), the
run view shall show an anchored popover in place — listing the
profiles with model and readiness, switching the referenced profile
on selection, and editing the selected profile's model and
reasoning effort — writing changes through the shared
configuration's validated edit path per
[DR-009](../decisions/009-at-hand-interaction.md), without leaving
the current surface.

### RUN-33

The Captain home shall list recent ended sessions with their
project and end time. When the user opens an ended session, the run
view shall show a loading note while the transcript loads, then the
full transcript read-only, say that the session has ended, and
offer starting a new session for the same project, per
[DR-009](../decisions/009-at-hand-interaction.md). When the
transcript fails to load, the run view shall say so and offer a
retry that reloads it — a failed load shall never present as an
empty run.

### RUN-34

While any session needs a human (a pending Boss question or a
failure), the Sessions navigation entry shall show a badge with the
count, derived from the same attention rules as the Dashboard
([DASH-11](../dev/dashboard.md#dash-11)). The slash menu shall end
with a compile-a-new-playbook entry that opens the Playbooks
surface's compile flow.

## Conversation Life (DR-010 §1/§3)

### RUN-37

While a turn is active and the Captain is not streaming speech, the
Captain thread shall show a working indicator naming what runs
("players working…" while any player runs, "Captain is thinking…"
otherwise), so the thread is never inert mid-turn.

### RUN-38

Queued Boss submissions shall render as pending outgoing bubbles in
full, each captioned that it sends when the turn ends and each
individually removable; while a turn is active the composer
placeholder shall say the message is delivered when the turn
finishes — a queued message shall never read as sent.

### RUN-39

Composer drafts (per session and on the Captain home) shall survive
switching tabs and surfaces, and shall clear only on send or when
their session is ended by the user.

### RUN-40

When the abort control is activated, it shall acknowledge instantly
— disabled with an "Aborting…" label until the turn ends or the
failure is shown — and it shall be disabled while the core
connection is down.

### RUN-41

The Captain thread shall render visible time separators before the
first message, after gaps of more than ten minutes, and on day
boundaries; exact timestamps stay available on hover. The session
state chip shall show a human-readable label (amber while waiting
on the Boss, red for failure) with the raw state id in its tooltip,
never as the primary copy (DR-010 §2).

### RUN-46

When new content arrives below the fold of a scrolled-up Captain or
player pane, the pane shall show a jump-to-latest pill that scrolls
to the bottom and resumes following.

## Keyboard and Guardrails (DR-010 §4/§6)

### RUN-42

The project chip menu shall be fully keyboard-operable from the
composer: submitting without a project opens it, arrow keys move
the highlight, Enter picks the highlighted entry, and Escape closes
it, with focus staying in the composer throughout.

### RUN-43

Escape while a slash menu is open shall hide the menu and never
touch the composer draft; typing reopens it. The slash menu shall
expose listbox semantics (options with selection state reflected to
assistive technology via the composer's active-descendant).

### RUN-47

Ending a live session shall always use the inline confirm (safe
default focused, Escape cancels), naming the number of queued
messages that would be discarded; the emergency abort control stays
one-click. After a tab closes, focus shall move to a neighboring
tab, never to the document body.

### RUN-48

Session tabs shall carry the shared attention signal: an amber dot
for a waiting question and a red dot for a failure on background
tabs (the active tab shows the banner instead), with the detail in
the tab tooltip. The tab strip shall scroll horizontally when tabs
overflow, keep the new-session control reachable, expose tab-list
semantics, and keep the active tab scrolled into view.

### RUN-49

The app shall provide keyboard shortcuts implemented in the web UI
(so they work identically in a browser, per
[SHELL-10](../dev/app-shell.md#shell-10)): Cmd/Ctrl+1..5 switch
surfaces, Cmd/Ctrl+, opens Settings, Cmd/Ctrl+N opens the new
session tab, Cmd/Ctrl+Shift+[ and ] cycle live session tabs, and a
printable key pressed outside any input refocuses the Boss
composer.

## First-Hour Integrity (DR-010 §5)

### RUN-44

While the shared config is invalid or missing, the Captain home
shall say so in the thread — listing the actual errors — with an
in-place link to Settings, and the captain identity shall never
render blank.

### RUN-45

The not-ready heads-up shall offer an in-place re-check (and the
app shall re-check readiness when its window regains focus while
anything is not ready), with copy that is honest about env vars
requiring a restart. Readiness shall cover adapter-shorthand
references, not just named profiles.

### RUN-50

When the app is connected but its initial state failed to load, a
banner shall say so and offer retry — never a silently empty app.
One persistent polite live region shall announce a player waiting
for a reply, connection loss and restoration, and attention-count
increases to assistive technology. Icon-only controls shall carry
accessible names and at-least-24px hit targets, and the navigation
shall expose the current surface and badge meaning to assistive
technology.

### RUN-51

Where the Captain home has no history (no past sessions, warnings,
or errors), it shall center its whole cluster — greeting, quick
start, project chip, and composer — on the canvas, reverting to the
bottom-docked chat layout once real content exists.
