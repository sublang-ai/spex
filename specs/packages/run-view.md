<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# RUN: Run View

## Intent

This spec covers the project session run view — the Spex screen
that renders one live playbook session — spanning its user-visible
behavior, its implementation requirements, and its integration
coverage.
The view presents a Captain pane, read-only player panes, and the
single Boss composer.
Everything the view displays derives from the session record
stream, which it renders exclusively from the WebSocket protocol
that carries it, and the captain glyph vocabulary follows the
embedded Playbook Captain shell.
Coverage replays recorded record-stream fixtures through that
protocol, exercising the record-driven rendering contract without
live agents.

## External Behavior

### Captain Pane

#### RUN-1

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

#### RUN-2

While a project session is live, when the session record stream
delivers a failure, the Captain pane shall display one ◆ line
carrying both the failure name and the failure message.
The Captain pane shall not suppress or collapse failure lines, so
no delivered failure is left without a visible line.

### Player Panes

#### RUN-3

While a project session is live, when the session record stream
delivers text or text deltas for a visible player, that player's
pane shall render the accumulating message as formatted Markdown,
appending each delta as it arrives rather than waiting for turn
completion.

A player pane shall be read-only: it shall offer no text input,
reply, or edit affordance, since Boss input happens only in the
Boss composer ([RUN-8](#run-8)).

#### RUN-4

When the session record stream delivers a tool-use event for a
visible player, that player's pane shall render it as a collapsed
card labeled with the tool name. When the card is expanded, it
shall reveal the tool input and, once delivered, the paired tool
result. While collapsed, the card shall show only its label, not
the tool payload.

#### RUN-5

When the session record stream delivers thinking content for a
visible player, that player's pane shall render it collapsed by
default, with an affordance that expands the full thinking text on
demand.

#### RUN-6

When a player turn completes with usage data, that player's pane
shall display the turn's token usage and cost at the end of the
turn's transcript. When a turn completes without usage data, the
pane shall omit the usage line.

### Pane Visibility

#### RUN-7

While a project session is live, the run view shall show exactly
one player pane per player marked visible by the session's current
visibility state, adding and removing panes as visibility changes
arrive. The run view shall not display the content of hidden
records (for example, judge or router traffic) in any pane.

### Boss Composer

#### RUN-8

The Boss composer shall accept free text and `/`-prefixed command
text, and shall be the only input control in the run view.
While no turn is active, when the Boss submits, the Boss composer
shall dispatch the submission without queueing.
While a turn is active, when the Boss submits, the Boss composer
shall queue the submission and show a visible queued indicator
until the queued submission is dispatched.
When the active turn ends, the Boss composer shall dispatch the
queued submission.

#### RUN-9

While an engagement awaits a Boss reply, the Captain thread shall
render the question as a first-class incoming message bubble naming
the asking player (one identity: the player's pane id), replacing —
not duplicating — the runtime's status-line narration of the same
question, and a compact banner above the Boss composer shall name
the waiting player without repeating the question. While an
engagement awaits a Boss reply, when the Boss submits, the Boss
composer shall send the submission as the reply to the waiting
question — not as a new Boss prompt — and clear the banner.

### Turn Control

#### RUN-10

While a turn is active, the run view shall present an abort
control; while no turn is active, the run view shall hide or
disable the abort control. When the abort control is activated,
the run view shall request abortion of the active turn; when the
session record stream then delivers the turn-aborted record, the
run view shall display a visible aborted marker on the interrupted
turn.

### Turn Summaries

#### RUN-11

Where the active playbook declares a summary policy, when a turn
completes, the run view shall display the turn summary produced for
that turn. Where the active playbook declares no summary policy,
the run view shall show no summary entry.

### Layout and Theme

#### RUN-12

Where the shared configuration declares layout weights (see
[DR-004](../decisions/004-config-and-persistence.md)), the run view
shall size the Captain and player panes proportionally to those
weights; where no layout is configured, the run view shall apply
built-in default weights. The run view shall provide light and dark
color themes, selecting the configured theme when one is set and
following the OS appearance otherwise.

### Session Start

#### RUN-25

Where no session tab is active, when the Workspace is shown, the
run view shall present the Captain home: a chat thread opened by a
Captain greeting that names the current project (or points at the
project bar when none is chosen), a chat composer, and the
captain's profile and model with a gear control opening the
in-place profile popover, per
[DR-007](../decisions/007-conversational-session-start.md) and
[DR-011](../decisions/011-project-workspace.md); project choice
lives in the project bar and palette, not in the composer row.

#### RUN-26

While the Captain home is shown and the workspace has a current
project, when the user submits composer text, the run view shall
create a session for that project, dispatch the text as the
session's first Boss turn, and switch to the new session's tab.
While no project is chosen, when the user submits, the workspace
shall open the project palette instead of dispatching, keeping the
draft intact.

#### RUN-27

When the user picks a folder that is not a git repository, the run
view shall initialize a git repository there and register it as a
project without further prompts. When the user types `/` at the
start of a composer, the run view shall show the configured
playbooks filtered by the typed prefix, each with its intent as the
hint, and insert the selected command into the composer without
dispatching it. The Captain home shall show highlighted playbooks
as a quick start card that the user can dismiss, and the dismissal
shall persist across launches.

#### RUN-30

The run view shall present conversations in instant-messaging form:
the user's submitted messages shall appear as their own chat
bubbles in the Captain thread, Captain speech as counterpart
bubbles, and shell status lines as compact system lines between
them.

### At-Hand Operations

#### RUN-32

When the user opens the captain identity's editor control (or a
profile reference's editor control elsewhere in the run view), the
run view shall show an anchored popover in place — listing the
profiles with model and readiness, switching the referenced profile
on selection, and editing the selected profile's model and
reasoning effort — writing changes through the shared
configuration's validated edit path per
[DR-009](../decisions/009-at-hand-interaction.md), without leaving
the current surface.

#### RUN-33

The Captain home shall list recent ended sessions of the current
project with their end time, with an "all projects" toggle that
widens the list across projects — nothing the user produced
becomes unreachable ([DR-009](../decisions/009-at-hand-interaction.md)).
When the user opens an ended session, the run view shall show a
loading note while the transcript loads, then the full transcript
read-only, say that the session has ended, and offer starting a
new session for the same project. When the transcript fails to
load, the run view shall say so and offer a retry that reloads it
— a failed load shall never present as an empty run.

#### RUN-34

While any session needs a human (a pending Boss question or a
failure), the Workspace navigation entry shall show a badge with
the count across all projects, derived from the same attention
rules as the Dashboard ([DASH-9](dashboard.md#dash-9));
while a non-current project needs a human, the project bar's chip
shall carry a dot in the most severe color. The slash menu shall
end with a compile-a-new-playbook entry that opens the Playbooks
surface's compile flow.

### Conversation Life (DR-010 §1/§3)

#### RUN-37

While a turn is active and the Captain is not streaming speech, the
Captain thread shall show a working indicator naming what runs
("players working…" while any player runs, "Captain is thinking…"
otherwise), so the thread is never inert mid-turn.

#### RUN-38

Queued Boss submissions shall render as pending outgoing bubbles in
full, each captioned that it sends when the turn ends and each
individually removable; while a turn is active the composer
placeholder shall say the message is delivered when the turn
finishes — a queued message shall never read as sent.

#### RUN-39

Composer drafts (per session and on the Captain home) shall survive
switching tabs and surfaces, and shall clear only on send or when
their session is ended by the user.

#### RUN-40

When the abort control is activated, it shall acknowledge instantly
— disabled with an "Aborting…" label until the turn ends or the
failure is shown — and it shall be disabled while the core
connection is down.

#### RUN-41

The Captain thread shall render visible time separators before the
first message, after gaps of more than ten minutes, and on day
boundaries; exact timestamps stay available on hover. The session
state chip shall show a human-readable label (amber while waiting
on the Boss, red for failure) with the raw state id in its tooltip,
never as the primary copy (DR-010 §2).

#### RUN-46

When new content arrives below the fold of a scrolled-up Captain or
player pane, the pane shall show a jump-to-latest pill that scrolls
to the bottom and resumes following.

### Keyboard and Guardrails (DR-010 §4/§6)

#### RUN-42

The project palette shall be fully keyboard-operable: it opens
from Cmd/Ctrl+P, the project bar, or submitting a composer with no
project chosen; its filter input holds focus; arrow keys move the
highlight over project rows and "Open folder…"; Enter picks;
Escape closes and returns focus to the opener with any composer
draft intact, never auto-sending
([DR-011](../decisions/011-project-workspace.md)).

#### RUN-43

Escape while a slash menu is open shall hide the menu and never
touch the composer draft; typing reopens it. The slash menu shall
expose listbox semantics (options with selection state reflected to
assistive technology via the composer's active-descendant).

#### RUN-47

Ending a live session shall always use the inline confirm (safe
default focused, Escape cancels), naming the number of queued
messages that would be discarded; the emergency abort control stays
one-click. After a tab closes, focus shall move to a neighboring
tab, never to the document body.

#### RUN-48

The tab strip shall show only the current project's live sessions.
Session tabs shall be titled by the session's first Boss turn
(truncated; "new session" before the first turn) with the full
prompt and start time in the tooltip — never by the project name,
which lives in the bar ([DR-011](../decisions/011-project-workspace.md)).
Tabs shall carry the shared attention signal: an amber dot for a
waiting question and a red dot for a failure on background tabs
(the active tab shows the banner instead), with the detail in the
tab tooltip. The strip shall scroll horizontally when tabs
overflow, keep the new-session control reachable, expose tab-list
semantics, and keep the active tab scrolled into view.

#### RUN-49

The app shall provide keyboard shortcuts implemented in the web UI
(so they work identically in a browser): Cmd/Ctrl+1..4 switch
surfaces, Cmd/Ctrl+, opens Settings, Cmd/Ctrl+P opens the project
palette, Cmd/Ctrl+N opens the new-session tab (or the palette when
no project is chosen), Cmd/Ctrl+Shift+S toggles the Specs tab with
the previous tab, Cmd/Ctrl+Shift+[ and ] cycle the current
project's tabs including the pinned ones, and a printable key
pressed outside any input refocuses the Boss composer.

### First-Hour Integrity (DR-010 §5)

#### RUN-44

While the shared config is invalid or missing, the Captain home
shall say so in the thread — listing the actual errors — with an
in-place link to Settings, and the captain identity shall never
render blank.

#### RUN-45

The not-ready heads-up shall offer an in-place re-check (and the
app shall re-check readiness when its window regains focus while
anything is not ready), with copy that is honest about env vars
requiring a restart. Readiness shall cover adapter-shorthand
references, not just named profiles.

#### RUN-50

When the app is connected but its initial state failed to load, a
banner shall say so and offer retry — never a silently empty app.
One persistent polite live region shall announce a player waiting
for a reply, connection loss and restoration, and attention-count
increases to assistive technology. Icon-only controls shall carry
accessible names and at-least-24px hit targets, and the navigation
shall expose the current surface and badge meaning to assistive
technology.

#### RUN-51

Where the Captain home has no history (no past sessions, warnings,
or errors), it shall center its whole cluster — greeting, quick
start, project chip, and composer — on the canvas, reverting to the
bottom-docked chat layout once real content exists.

### Project Workspace (DR-011)

#### RUN-56

The Workspace shall carry a project bar naming the current project;
activating it opens the project palette. The bar shall render in
every workspace state; while no project is chosen, the tab strip
(including pinned tabs) shall be absent and the bar plus the
Captain home's guidance shall be the whole surface.

#### RUN-57

Each project shall remember its last-active workspace tab (a
session, the start tab, Specs, or Repo), restored when the project
becomes current again; the current project shall persist across
launches. When the user arrives via an attention affordance (a
Dashboard row or a palette row with a needs-you signal), the
workspace shall focus the session that needs the human instead of
the remembered tab.

#### RUN-58

The tab strip shall end with pinned Specs and Repo tabs — one spec
view and one repo view per project — that participate in the tab
list and the tab-cycling shortcut. Switching projects swaps the
whole strip; sessions of other projects keep running and stay
reachable through the palette's live-state rows and the Dashboard.

## Internal Behavior

### Protocol Boundary

#### RUN-13

Where the run view renders a project session, the run view shall
consume only messages of the versioned WebSocket protocol defined in
`packages/core`
([DR-002](../decisions/002-desktop-app-architecture.md)).
The run view shall not import Node-only modules and shall not call
`@sublang/cligent` or `@sublang/playbook` APIs directly; every
record it renders arrives as a protocol message
([DR-003](../decisions/003-runtime-reuse.md)).

#### RUN-14

Where the run view receives a session's ordered record stream, the
run view shall render pane structure and content as a function of the
received messages alone, so that replaying a recorded stream
reproduces an identical view with no live runtime attached.

### Transcript Rendering

#### RUN-15

Where a player transcript exceeds the visible viewport, the
transcript view shall mount only the entries in and near the
viewport, keeping the mounted entry count bounded regardless of
transcript length. When the user scrolls, the transcript view shall
reveal previously unmounted entries with content identical to an
unvirtualized render.

#### RUN-16

While consecutive text deltas for the same player message are
pending within one render frame, the transcript view shall coalesce
them into a single append, preserving delta order and content
byte-for-byte. The transcript view shall not merge deltas across
different messages or players.

### Captain Pane Rendering

#### RUN-17

When the session record stream delivers a captain record whose kind
is outside the glyph vocabulary of
[RUN-1](#run-1), the Captain pane shall render
the record's text as a plain line rather than dropping the record.

### Pane Management

#### RUN-18

When a `player_view_changed` record arrives, the pane manager shall
recompute the pane set to exactly the players the record marks
visible, creating panes for newly visible players and removing
panes for players no longer visible. The pane manager shall not
route records carrying `hidden` visibility to any pane.

### Session Start Rendering

#### RUN-28

The start view shall obtain projects, playbooks, captain identity,
and readiness exclusively through existing protocol commands and
broadcasts, and shall detect the native picker by feature-testing
the shell bridge
([DR-008](../decisions/008-native-shell-bridge.md)), falling back
to manual path entry when the bridge is absent so the identical
build serves browser deployments.

## Verification

### Fixture Replay Coverage

#### RUN-20
Where a recorded fixture stream of a completed playbook session is
replayed into the run view over the protocol ([RUN-14](#run-14)),
the test suite shall assert that the rendered result matches the
fixture's expectations: the Captain pane holds the expected glyph
lines in arrival order ([RUN-1](#run-1)), one pane exists per
visible player, player transcripts render the expected Markdown
text ([RUN-3](#run-3)), tool-use entries appear as collapsed cards
([RUN-4](#run-4)), and every completed turn with usage data shows
its usage and cost ([RUN-6](#run-6)).

#### RUN-21
Where a fixture stream contains records marked hidden (judge or
router traffic), when the fixture is replayed into the run view,
the test suite shall assert that no rendered pane contains the
hidden records' content ([RUN-18](#run-18)) and that no pane
exists for a player appearing only in hidden records
([RUN-7](#run-7)).

### Interaction Coverage

#### RUN-22
Where a replayed fixture stream ends in an await-Boss-reply state
carrying a player question, the test suite shall assert that the
question appears above the Boss composer and inside the asking
player's pane ([RUN-9](#run-9)). When text is then submitted in
the composer, the test suite shall assert that the submission is
sent over the protocol as the reply to the waiting question — not
as a new Boss prompt — and that the question display clears
([RUN-9](#run-9)).

#### RUN-23
While a replayed fixture stream holds a turn active, when the abort
control is activated and the turn-aborted record is then delivered,
the test suite shall assert that an abort command was sent over the
protocol ([RUN-10](#run-10)), that the interrupted turn shows a
visible aborted marker, and that a submission made after the abort
is dispatched immediately rather than queued ([RUN-8](#run-8)).

#### RUN-24
While a replayed fixture stream holds a turn active, when text is
submitted in the Boss composer, the test suite shall assert that
the submission is queued with a visible queued indicator and that
no Boss prompt is dispatched over the protocol ([RUN-8](#run-8)).
When the turn-finished record is then delivered, the test suite
shall assert that the queued submission is dispatched and the
indicator clears ([RUN-8](#run-8)).

#### RUN-29

Where no session is live, when the Workspace renders with a
fixture config of one project and one playbook, the test suite
shall assert the Captain home shows the greeting naming the
current project, the chat composer, and the captain identity
([RUN-25](#run-25)); when text is submitted with a current
project, the test suite shall assert a session is created for that
project and the text is dispatched as its first Boss turn
([RUN-26](#run-26)); when text is submitted with no project
chosen, the test suite shall assert the palette opens and the
draft survives ([RUN-26](#run-26)).

#### RUN-31

When `/` is typed at the start of the Captain home composer, the
test suite shall assert the slash menu lists the fixture playbook
with its intent, filters as more is typed, and inserts the command
without dispatching on selection ([RUN-27](#run-27)); when the
quick start card is dismissed and the view is remounted, the test
suite shall assert the card stays dismissed ([RUN-27](#run-27));
when a fixture stream containing a boss turn is replayed, the test
suite shall assert the submitted text renders as a user bubble in
the Captain thread ([RUN-30](#run-30)).

#### RUN-35

When the captain editor popover is opened from the Captain home
with fixture profiles, the test suite shall assert it lists the
profiles with models, that selecting another profile issues a
captain change through the configuration edit path, and that
editing the selected profile's model issues a profile save — all
without a surface change ([RUN-32](#run-32)).

#### RUN-36

Where a fixture holds one ended session with a stored transcript
and one live session awaiting a Boss reply, the test suite shall
assert the Captain home lists the ended session, opening it
renders the transcript read-only with an ended notice
([RUN-33](#run-33)), and the Workspace navigation badge shows the
count 1 ([RUN-34](#run-34)).

#### RUN-52

When the awaitBossReply fixture stream is replayed, the test suite
shall assert the question renders as one incoming bubble naming
the asking player (resolved to its pane id, including from a bare
role name), that no status-line duplicate of the question survives
— in either arrival order of the narration and the telemetry — and
that the banner names the player without repeating the question
([RUN-9](#run-9)).

#### RUN-53

While a fixture turn is active, the test suite shall assert the
Captain thread shows the working indicator ([RUN-37](#run-37)),
queued entries render in full with the sends-when-this-turn-ends
caption ([RUN-38](#run-38)), the composer renders a
store-provided draft and reports edits to the store
([RUN-39](#run-39)), and activating Abort disables it with an
"Aborting…" label ([RUN-40](#run-40)).

#### RUN-54

The test suite shall assert time separators appear before the
first line, after >10-minute gaps, and on day changes
([RUN-41](#run-41)); that known states map to human labels with
unknown ids humanized; that the project palette is driven
end-to-end by keyboard (opens focused, arrows highlight, Enter
picks, Escape closes with the composer draft intact) and its rows
carry running and needs-you state ([RUN-42](#run-42)); and that
Escape hides the slash menu without touching the draft
([RUN-43](#run-43)).

#### RUN-55

Where a fixture config is invalid, the test suite shall assert the
Captain home thread lists the errors with a Settings link
([RUN-44](#run-44)); where a fixture readiness entry is not ready,
the test suite shall assert the heads-up bubble offers a re-check
that invokes the readiness refresh ([RUN-45](#run-45)).
