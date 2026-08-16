<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# run-view: Run View

## Intent

This spec covers the project session run view — the Spex screen that renders one live playbook session — spanning its user-visible behavior, its implementation requirements, and its integration coverage.
The view presents a Captain pane, read-only player panes, and the single Boss composer.
Everything the view displays derives from the session record stream, which it renders exclusively from the WebSocket protocol that carries it, and the captain glyph vocabulary follows the embedded Playbook Captain shell.
Coverage replays recorded record-stream fixtures through that protocol, exercising the record-driven rendering contract without live agents.

## External Behavior

### Captain Pane

#### run-view-1

While a project session is live, when the session record stream delivers a captain status line or captain speech, the Captain pane shall append it in arrival order — preserving each status line's glyph, and rendering speech text as chat-style prose, visually distinct from glyph lines:

| Glyph | Line kind |
| --- | --- |
| ◇ | engagement start, stop, and finished status |
| ◆ | failure and await-Boss-reply notices |
| ▸ ⮕ ⤷ | playbook state-machine progress stream — absorbed by the machine card while its run's frame is open [[run-view-60](#run-view-60)] |

#### run-view-2

While a project session is live, when the session record stream delivers a failure, the Captain pane shall display one ◆ line carrying both the failure name and the failure message, never suppressing or collapsing failure lines, so no delivered failure is left without a visible line.

### Player Panes

#### run-view-3

While a project session is live, when the session record stream delivers text or text deltas for a visible player, that player's pane shall render the accumulating message as formatted Markdown, appending each delta as it arrives rather than waiting for turn completion:

- A player pane is read-only — no text input, reply, or edit affordance — since Boss input happens only in the Boss composer [[run-view-8](#run-view-8)].

#### run-view-4

When the session record stream delivers a tool-use event for a visible player, that player's pane shall render it as a collapsed card labeled with the tool name:

- while collapsed, the card shows only its label, not the tool payload;
- when the card is expanded, it reveals the tool input and, once delivered, the paired tool result.

#### run-view-5

When the session record stream delivers thinking content for a visible player, that player's pane shall render it collapsed by default, with an affordance that expands the full thinking text on demand.

#### run-view-6

When a player turn completes, that player's pane shall report the turn's usage by what the turn delivered:

- with usage data — the pane displays the turn's token usage and cost at the end of the turn's transcript;
- without usage data — the pane omits the usage line.

### Pane Visibility

#### run-view-7

While a project session is live, the run view shall show exactly one player pane per player marked visible by the session's current visibility state — adding and removing panes as visibility changes arrive — and shall not display the content of hidden records (for example, judge or router traffic) in any pane.

### Boss Composer

#### run-view-8

The Boss composer shall accept free text and `/`-prefixed command text, be the only input control in the run view, and dispatch or queue each Boss submission by turn state:

- while no turn is active, a submission dispatches without queueing;
- while a turn is active, a submission queues with a visible queued indicator until the queued submission is dispatched;
- when the active turn ends, the queued submission dispatches.

#### run-view-9

While an engagement awaits a Boss reply, the run view shall present the waiting question as a first-class chat moment and route the next Boss submission to it:

- the Captain thread renders the question as a first-class incoming message bubble naming the asking player (one identity: the player's pane id), replacing — not duplicating — the runtime's status-line narration of the same question;
- a compact banner above the Boss composer names the waiting player without repeating the question;
- when the Boss submits, the Boss composer sends the submission as the reply to the waiting question — not as a new Boss prompt — and clears the banner.

### Turn Control

#### run-view-10

The run view shall provide an abort control bound to the active turn:

- while a turn is active, the abort control is presented; while no turn is active, it is hidden or disabled;
- when the abort control is activated, the run view requests abortion of the active turn;
- when the session record stream then delivers the turn-aborted record, the run view displays a visible aborted marker on the interrupted turn.

### Turn Summaries

#### run-view-11

When a turn completes, the run view shall show turn summaries exactly as the active playbook declares:

- a summary policy declared — the run view displays the turn summary produced for that turn;
- no summary policy declared — the run view shows no summary entry.

### Layout and Theme

#### run-view-12

The run view shall provide light and dark color themes and size the Captain and player panes from the shared configuration (see [DR-004](../decisions/004-config-and-persistence.md)):

- layout weights declared — the panes are sized proportionally to those weights;
- no layout configured — built-in default weights apply;
- a theme configured — the configured theme is selected;
- no theme configured — the view follows the OS appearance.

### Session Start

#### run-view-25

Where no session tab is active, when the Workspace is shown, the run view shall present the Captain home: a chat thread opened by a Captain greeting that names the current project (or points at the project bar when none is chosen), a chat composer, and the captain's adapter and model with a gear control opening the in-place agent editor, per [DR-007](../decisions/007-conversational-session-start.md) and [DR-011](../decisions/011-project-workspace.md):

- Project choice lives in the project bar and palette, not in the composer row.

#### run-view-26

While the Captain home is shown, when the user submits composer text, the run view shall act by whether the workspace has a current project:

- a current project — the run view creates a session for that project, dispatches the text as the session's first Boss turn, and switches to the new session's tab;
- no project chosen — the workspace opens the project palette instead of dispatching, keeping the draft intact.

#### run-view-27

The run view shall make configured playbooks discoverable at the composer:

- when the user types `/` at the start of a composer, the run view shows the configured playbooks filtered by the typed prefix, each with its intent as the hint, and inserts the selected command into the composer without dispatching it;
- the Captain home shows highlighted playbooks as a quick start card that the user can dismiss, with the dismissal persisting across launches.

#### run-view-30

The run view shall present conversations in instant-messaging form:

- the user's submitted messages appear as their own chat bubbles in the Captain thread;
- Captain speech appears as counterpart bubbles;
- shell status lines appear as compact system lines between them.

### At-Hand Operations

#### run-view-32

When the user opens the captain identity's editor control (or another agent's editor control elsewhere in the run view), the run view shall show an anchored popover in place — offering the embedded runtime's adapters with their readiness, and editing the agent's model, its adapter's effort vocabulary, and permissions ([DR-019](../decisions/019-inline-agent-configuration.md)) — writing changes as a merge patch through the shared configuration's validated edit path per [DR-009](../decisions/009-at-hand-interaction.md), without leaving the current surface.

#### run-view-33

The Captain home shall list recent ended sessions of the current project with their end time, with an "all projects" toggle that widens the list across projects — nothing the user produced becomes unreachable ([DR-009](../decisions/009-at-hand-interaction.md)):

- when the user opens an ended session, the run view shows a loading note while the transcript loads, then the full transcript read-only, says that the session has ended, and offers starting a new session for the same project;
- when the transcript fails to load, the run view says so and offers a retry that reloads it — a failed load never presents as an empty run.

#### run-view-34

The run view shall keep cross-project attention and playbook creation at hand:

- while the Dashboard's published attention count [[dashboard-9](dashboard.md#dashboard-9)] is non-zero, the Workspace navigation entry shows a badge with that count across all projects;
- while a non-current project needs a human, the project bar's chip carries a dot in the most severe color;
- the slash menu ends with a compile-a-new-playbook entry that opens the Playbooks surface's compile flow.

### Conversation Life (DR-010 §1/§3)

#### run-view-37

While a turn is active and the Captain is not streaming speech, the Captain thread shall show a working indicator naming what runs ("players working…" while any player runs, "Captain is thinking…" otherwise), so the thread is never inert mid-turn.

#### run-view-38

A queued Boss submission shall never read as sent:

- queued submissions render as pending outgoing bubbles in full, each captioned that it sends when the turn ends and each individually removable;
- while a turn is active, the composer placeholder says the message is delivered when the turn finishes.

#### run-view-39

Composer drafts (per session and on the Captain home) shall survive switching tabs and surfaces, clearing only on send or when their session is ended by the user.

#### run-view-40

When the abort control is activated, it shall acknowledge instantly — disabled with an "Aborting…" label until the turn ends or the failure is shown:

- The abort control is disabled while the core connection is down.

#### run-view-41

The Captain thread shall render visible time separators before the first message, after gaps of more than ten minutes, and on day boundaries, with exact timestamps staying available on hover.

#### run-view-59

The session state chip shall show a human-readable label (amber while waiting on the Boss, red for failure) with the raw state id in its tooltip, never as the primary copy ([DR-010](../decisions/010-interface-craft.md) §2).

#### run-view-46

When new content arrives below the fold of a scrolled-up Captain or player pane, the pane shall show a jump-to-latest pill that scrolls to the bottom and resumes following.

### Machine Cards

#### run-view-60

While a playbook run's trace records flow in a live session, the Captain pane shall draw that run as a live statechart card — one labeled box per state, one directed edge per transition, laid out left to right from the initial state, deterministically per machine ([DR-028](../decisions/028-run-machine-view.md)):

- the card renders read-only, never intercepting the composer;
- while the run's frame is open, the glyph progress lines of that run fold into the card instead of the thread [[run-view-1](#run-view-1)], while failure lines always stay in the thread [[run-view-2](#run-view-2)];
- state labels are the human labels with raw ids in tooltips, matching the chip's law [[run-view-59](#run-view-59)].

#### run-view-61

While a machine card is live, the Captain pane shall show the run's state through the status palette, one voice per state kind ([DR-028](../decisions/028-run-machine-view.md)):

- the active state carries the running emphasis, a parked state awaiting the Boss carries the attention emphasis, a failed state carries the failure emphasis, and every other state stays quiet ink;
- a firing transition flashes once and decays in well under a second, instantly under the reduced-motion preference;
- every transition shows its direction at rest with a constant-size glyph;
- the active state names the player it runs and shows that player's running activity, when the trace attributes one.

#### run-view-62

When a playbook run's trace settles or its invocation is disposed, the Captain pane shall settle that run's card into the thread as a static history entry at its finish position, carrying the machine's final drawing and outcome, and shall empty the live region of that frame ([DR-028](../decisions/028-run-machine-view.md)).

#### run-view-63

While two or more machine frames are open at once, the Captain pane shall stack their live cards ordered by call depth — the parent first, each child visually joined to its caller — each card live and independently drawn ([DR-028](../decisions/028-run-machine-view.md)).

#### run-view-64

Where a run's machine definition is unavailable over the artifacts contract [[playbook-library-36](playbook-library.md#playbook-library-36)], the machine card shall draw the observed truth alone — the states and transitions the trace has delivered — and never block, error, or drop the card for the missing definition ([DR-028](../decisions/028-run-machine-view.md)).

#### run-view-65

When the session record stream delivers a captain turn result reporting an error, the Captain pane shall display the synthesized failure line naming the underlying cause [[core-service-30](core-service.md#core-service-30)] as a ◆ failure line [[run-view-2](#run-view-2)], never only the captain's composed reply.

### Session Home

#### run-view-67

While a project holds ended sessions, the Captain home shall list them as the project's conversations, newest first, each row scannable by its own words ([DR-029](../decisions/029-session-history-home.md)) [[core-service-32](core-service.md#core-service-32)]:

- a row shows the session's title, its ended time in relative terms, its turn count, a failure marker when it ended holding one, and its cost — a session with no turns saying so honestly;
- the list is primary content whenever it is non-empty, above the greeting's supporting material, with the scope toggle between this project and all projects kept;
- the start tab's accessible name and tooltip name both duties — a new session and the history.

#### run-view-68

When the user ends a session, the workspace shall land on the session home with the just-ended session newly at the top of the list, briefly highlighted, so the eye follows where the conversation went ([DR-029](../decisions/029-session-history-home.md)).

#### run-view-69

When a past session is opened from the home, the run view shall replay it read-only in place — no surface switch — headed by its title and ended time ([DR-029](../decisions/029-session-history-home.md)):

- the transcript is the identical fold of the stored records [[run-view-14](#run-view-14)], settled machine cards included [[run-view-62](#run-view-62)];
- the composer's place offers starting a fresh session for the same project;
- Back returns to the session home with its scroll kept.

### Keyboard and Guardrails (DR-010 §4/§6)

#### run-view-42

The project palette shall be fully keyboard-operable ([DR-011](../decisions/011-project-workspace.md)):

- it opens from Cmd/Ctrl+P, the project bar, or submitting a composer with no project chosen;
- its filter input holds focus;
- arrow keys move the highlight over project rows and "Open folder…";
- Enter picks;
- Escape closes and returns focus to the opener with any composer draft intact, never auto-sending.

#### run-view-43

While a slash menu is open, when Escape is pressed, the slash menu shall hide without touching the composer draft, with typing reopening it:

- The slash menu exposes listbox semantics (options with selection state reflected to assistive technology via the composer's active-descendant).

#### run-view-47

When the user ends a live session, the run view shall always use the inline confirm (safe default focused, Escape cancels), naming the number of queued messages that would be discarded — the emergency abort control stays one-click:

- After a tab closes, focus moves to a neighboring tab, never to the document body.

#### run-view-48

The tab strip shall show only the current project's live sessions:

- session tabs are titled by the session's first Boss turn (truncated; "new session" before the first turn) with the full prompt and start time in the tooltip — never by the project name, which lives in the bar ([DR-011](../decisions/011-project-workspace.md));
- tabs carry the shared attention signal: an amber dot for a waiting question and a red dot for a failure on background tabs (the active tab shows the banner instead), with the detail in the tab tooltip;
- the strip scrolls horizontally when tabs overflow, keeps the new-session control reachable, exposes tab-list semantics, and keeps the active tab scrolled into view.

#### run-view-49

The app shall provide keyboard shortcuts implemented in the web UI (so they work identically in a browser): Cmd/Ctrl+1..4 switch surfaces, Cmd/Ctrl+, opens Settings, Cmd/Ctrl+P opens the project palette, Cmd/Ctrl+N opens the new-session tab (or the palette when no project is chosen), Cmd/Ctrl+Shift+S toggles the Specs tab with the previous tab, Cmd/Ctrl+Shift+[ and ] cycle the current project's tabs including the pinned ones, and a printable key pressed outside any input refocuses the Boss composer.

### First-Hour Integrity (DR-010 §5)

#### run-view-44

While the shared config is invalid or missing, the Captain home shall say so in the thread — listing the actual errors — with an in-place link to Settings, never rendering the captain identity blank.

#### run-view-45

The not-ready heads-up shall offer an in-place re-check, with copy that is honest about env vars requiring a restart:

- the app re-checks readiness when its window regains focus while anything is not ready;
- readiness covers every adapter any configured agent names.

#### run-view-50

The app shall fail loudly and stay accessible:

- when the app is connected but its initial state failed to load, a banner says so and offers retry — never a silently empty app;
- one persistent polite live region announces a player waiting for a reply, connection loss and restoration, and attention-count increases to assistive technology;
- icon-only controls carry accessible names and at-least-24px hit targets, and the navigation exposes the current surface and badge meaning to assistive technology.

#### run-view-51

Where the Captain home has no history (no past sessions, warnings, or errors), it shall center its whole cluster — greeting, quick start, project chip, and composer — on the canvas, reverting to the bottom-docked chat layout once real content exists.

### Project Workspace (DR-011)

#### run-view-56

The Workspace shall carry a project bar naming the current project, rendered in every workspace state:

- activating the bar opens the project palette;
- while no project is chosen, the tab strip (including pinned tabs) is absent and the bar plus the Captain home's guidance is the whole surface.

#### run-view-57

Each project shall remember its last-active workspace tab (a session, the start tab, Specs, or Repo), restored when the project becomes current again, with the current project persisting across launches:

- When the user arrives via an attention affordance (a Dashboard row or a palette row with a needs-you signal), the workspace focuses the session that needs the human instead of the remembered tab.

#### run-view-58

The tab strip shall end with pinned Specs and Repo tabs — one spec view and one repo view per project — that participate in the tab list and the tab-cycling shortcut:

- Switching projects swaps the whole strip; sessions of other projects keep running and stay reachable through the palette's live-state rows and the Dashboard.

## Internal Behavior

### Protocol Boundary

#### run-view-13

Where the run view renders a project session, the run view shall consume only messages of the versioned WebSocket protocol defined in `packages/core` ([DR-002](../decisions/002-desktop-app-architecture.md)):

- the run view imports no Node-only modules and calls no `@sublang/cligent` or `@sublang/playbook` APIs directly;
- every record it renders arrives as a protocol message ([DR-003](../decisions/003-runtime-reuse.md)).

#### run-view-14

Where the run view receives a session's ordered record stream, the run view shall render pane structure and content as a function of the received messages alone, so that replaying a recorded stream reproduces an identical view with no live runtime attached.

### Transcript Rendering

#### run-view-15

Where a player transcript exceeds the visible viewport, the transcript view shall mount only the entries in and near the viewport, keeping the mounted entry count bounded regardless of transcript length:

- When the user scrolls, the transcript view reveals previously unmounted entries with content identical to an unvirtualized render.

#### run-view-16

While consecutive text deltas for the same player message are pending within one render frame, the transcript view shall coalesce them into a single append, preserving delta order and content byte-for-byte and never merging deltas across different messages or players.

### Captain Pane Rendering

#### run-view-17

When the session record stream delivers a captain record whose kind is outside the glyph vocabulary of [[run-view-1](#run-view-1)], the Captain pane shall render the record's text as a plain line rather than dropping the record.

### Pane Management

#### run-view-18

When a `player_view_changed` record arrives, the pane manager shall recompute the pane set to exactly the players the record marks visible — creating panes for newly visible players and removing panes for players no longer visible — and route no record carrying `hidden` visibility to any pane.

### Session Start Rendering

#### run-view-28

The start view shall obtain projects, playbooks, captain identity, and readiness exclusively through existing protocol commands and broadcasts, detecting the native picker by feature-testing the shell bridge ([DR-008](../decisions/008-native-shell-bridge.md)) and falling back to manual path entry when the bridge is absent so the identical build serves browser deployments.

## Verification

### Fixture Replay Coverage

#### run-view-20

Where a recorded fixture stream of a completed playbook session is replayed into the run view over the protocol [[run-view-14](#run-view-14)], the test suite shall assert that the rendered result matches the fixture's expectations: the Captain pane holds the expected glyph lines in arrival order [[run-view-1](#run-view-1)], one pane exists per visible player, player transcripts render the expected Markdown text [[run-view-3](#run-view-3)], tool-use entries appear as collapsed cards [[run-view-4](#run-view-4)], every completed turn with usage data shows its usage and cost [[run-view-6](#run-view-6)], and the machine card assertions of [[run-view-66](#run-view-66)] hold over the same replay.

#### run-view-66

Where a fixture stream carries a playbook run's trace records — an invocation start, transitions, a player call attributed to a state, a nested invocation at greater depth, and a settled finish — the test suite shall assert the machine cards over a replay [[run-view-14](#run-view-14)]:

- a live card opens with the frame and draws the machine with the active state emphasized [[run-view-60](#run-view-60)] [[run-view-61](#run-view-61)];
- the glyph progress lines of the framed run leave the thread while failure lines stay [[run-view-60](#run-view-60)];
- the active state names its attributed player while that player runs [[run-view-61](#run-view-61)];
- the nested invocation stacks a second card joined to its caller, ordered by depth [[run-view-63](#run-view-63)];
- the settled finish moves the card into the thread as a static entry and empties the live region [[run-view-62](#run-view-62)];
- with no machine definition served, the same replay still renders the card from observed states alone [[run-view-64](#run-view-64)];
- a fixture captain reply record renders as Captain speech in the thread [[run-view-1](#run-view-1)];
- a fixture captain result reporting an error renders the synthesized cause as a failure line [[run-view-65](#run-view-65)].

#### run-view-70

Where a fixture store holds one ended titled session with turns, cost, and a failure, and one ended session with no turns, the test suite shall assert the session home round trip: the rows render title, relative ended time, turn count, failure marker, and cost — the empty session saying so [[run-view-67](#run-view-67)]; ending a live session lands on the home with the new top row highlighted [[run-view-68](#run-view-68)]; opening a titled row replays the identical transcript read-only with its title in the header, offers a fresh session, and Back returns to the home with scroll kept [[run-view-69](#run-view-69)].

#### run-view-21

Where a fixture stream contains records marked hidden (judge or router traffic), when the fixture is replayed into the run view, the test suite shall assert that no rendered pane contains the hidden records' content [[run-view-18](#run-view-18)] and that no pane exists for a player appearing only in hidden records [[run-view-7](#run-view-7)].

### Interaction Coverage

#### run-view-22

Where a replayed fixture stream ends in an await-Boss-reply state carrying a player question, the test suite shall assert the await-reply round trip:

- the question appears above the Boss composer and inside the asking player's pane [[run-view-9](#run-view-9)];
- when text is then submitted in the composer, the submission is sent over the protocol as the reply to the waiting question — not as a new Boss prompt — and the question display clears [[run-view-9](#run-view-9)].

#### run-view-23

While a replayed fixture stream holds a turn active, when the abort control is activated and the turn-aborted record is then delivered, the test suite shall assert that an abort command was sent over the protocol [[run-view-10](#run-view-10)], that the interrupted turn shows a visible aborted marker, and that a submission made after the abort is dispatched immediately rather than queued [[run-view-8](#run-view-8)].

#### run-view-24

While a replayed fixture stream holds a turn active, the test suite shall assert the queue-and-release flow:

- when text is submitted in the Boss composer, the submission is queued with a visible queued indicator and no Boss prompt is dispatched over the protocol [[run-view-8](#run-view-8)];
- when the turn-finished record is then delivered, the queued submission is dispatched and the indicator clears [[run-view-8](#run-view-8)].

#### run-view-29

Where no session is live, when the Workspace renders with a fixture config of one project and one playbook, the test suite shall assert the Captain home's one-motion start:

- the Captain home shows the greeting naming the current project, the chat composer, and the captain identity [[run-view-25](#run-view-25)];
- when text is submitted with a current project, a session is created for that project and the text is dispatched as its first Boss turn [[run-view-26](#run-view-26)];
- when text is submitted with no project chosen, the palette opens and the draft survives [[run-view-26](#run-view-26)].

#### run-view-31

When the Captain home composer and thread render against the fixture playbook, the test suite shall assert playbook discovery and IM presentation:

- when `/` is typed at the start of the composer, the slash menu lists the fixture playbook with its intent, filters as more is typed, and inserts the command without dispatching on selection [[run-view-27](#run-view-27)];
- when the quick start card is dismissed and the view is remounted, the card stays dismissed [[run-view-27](#run-view-27)];
- when a fixture stream containing a boss turn is replayed, the submitted text renders as a user bubble in the Captain thread [[run-view-30](#run-view-30)].

#### run-view-35

When the captain editor popover is opened from the Captain home with a fixture captain block, the test suite shall assert it offers the runtime's adapters with their readiness, that changing the adapter or model issues a captain merge patch through the configuration edit path, and that the patch carries the editor's surfaced fields and never a hand-written one — all without a surface change [[run-view-32](#run-view-32)].

#### run-view-36

Where a fixture holds one ended session with a stored transcript and one live session awaiting a Boss reply, the test suite shall assert the Captain home lists the ended session, opening it renders the transcript read-only with an ended notice [[run-view-33](#run-view-33)], and the Workspace navigation badge shows the count 1 [[run-view-34](#run-view-34)].

#### run-view-52

When the awaitBossReply fixture stream is replayed, the test suite shall assert the question renders as one incoming bubble naming the asking player (resolved to its pane id, including from a bare role name), that no status-line duplicate of the question survives — in either arrival order of the narration and the telemetry — and that the banner names the player without repeating the question [[run-view-9](#run-view-9)].

#### run-view-53

While a fixture turn is active, the test suite shall assert the Captain thread shows the working indicator [[run-view-37](#run-view-37)], queued entries render in full with the sends-when-this-turn-ends caption [[run-view-38](#run-view-38)], the composer renders a store-provided draft and reports edits to the store [[run-view-39](#run-view-39)], and activating Abort disables it with an "Aborting…" label [[run-view-40](#run-view-40)].

#### run-view-54

The test suite shall assert time separators appear before the first line, after >10-minute gaps, and on day changes [[run-view-41](#run-view-41)]; that known states map to human labels with unknown ids humanized [[run-view-59](#run-view-59)]; that the project palette is driven end-to-end by keyboard (opens focused, arrows highlight, Enter picks, Escape closes with the composer draft intact) [[run-view-42](#run-view-42)]; and that Escape hides the slash menu without touching the draft [[run-view-43](#run-view-43)].

#### run-view-55

The test suite shall assert first-hour failures surface at hand:

- where a fixture config is invalid, the Captain home thread lists the errors with a Settings link [[run-view-44](#run-view-44)];
- where a fixture readiness entry is not ready, the heads-up bubble offers a re-check that invokes the readiness refresh [[run-view-45](#run-view-45)].

### Protocol Boundary Coverage

#### run-view-19

Where the run view's production modules are inspected, the test suite shall assert that project-session records reach the run view only as versioned protocol messages:

- the modules import no Node-only modules and call no `@sublang/cligent` or `@sublang/playbook` APIs [[run-view-13](#run-view-13)];
- every write to the rendered record state originates from the protocol client's message handling [[run-view-13](#run-view-13)].
