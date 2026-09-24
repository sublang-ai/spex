<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# playbook-library: Playbook Library

## Intent

This spec covers the Spex Library surface — presented to the user as **Playbooks** — across its user-visible behavior, the implementation behind it, and the integration coverage that verifies it: browsing and enabling configured playbooks, mapping playbook roles to player agents, and authoring new playbooks as drafts in a chat-assisted workspace that compiles and registers them, backed by an authoring conversation runner, a draft store, compile execution, registry generation, and shared-config writes.
Playbook entries live in the shared playbook config file, which remains the source of truth under its fail-closed validation rules; compilation runs the app's own copy of the external `slc` toolchain, on the app's runtime or a Node.js meeting the compiler's floor, with its compiled outputs.
Verification requires integration coverage of the Library surface's compile, registration, and shared-config write paths, where correctness spans the external `slc` process, generated registry artifacts, and the shared config file.

## External Behavior

### Playbook List

#### playbook-library-1

When the Library surface is opened, the Library shall list every playbook configured in the shared config's `playbooks` map ([DR-004](../decisions/004-config-and-persistence.md)), showing for each entry its id, command, intent, each required role with the session player bound to it and what that binding effectively runs, and enabled state ([DR-032](../decisions/032-session-players.md)).

#### playbook-library-2

Where a configured playbook entry fails the fail-closed config validation ([DR-004](../decisions/004-config-and-persistence.md)) — for example, an unresolved required role or a duplicate command — the Library shall list the entry marked invalid with the specific validation failure, rather than hiding it.

### Enable and Disable

#### playbook-library-3

When the user toggles a playbook's enabled state, the Library shall persist the new state to that playbook's entry in the shared config file (state encoding per [DR-004](../decisions/004-config-and-persistence.md)), shall modify no other entry, and shall reflect the new state in the list:

- Disabling does not remove the playbook's entry or its role bindings from the shared config.

### Role Binding

#### playbook-library-4

When the user edits a role's binding, the Library shall write which session player answers that role together with that role's own model, effort, and fast mode ([DR-032](../decisions/032-session-players.md)), and shall reject an edit the shared-config write path refuses, naming the affected role:

- The players offered are the shared config's roster [[settings-26](settings.md#settings-26)]; the editor mints none and offers no adapter or permissions, which belong to the player's envelope.
- Model and effort are inherit-the-player, the provider's current default, or a pinned value, written as omission, `false`, and the value respectively; pinned values use the player's runtime model and effort choices [[settings-34](settings.md#settings-34)].
- Clearing a pinned value keeps it pinned and shows a validation message; only an explicit mode change selects inheritance or provider default.
- Fast mode is inherit, on, or off for adapters accepting fast-mode requests; an unsupported adapter permits only clearing an existing override.
- Saving preserves omitted tuning fields and clears only explicit resets.
- Known model support is checked against effective tuning, including inherited effort and fast mode, with only Cligent's unreported adapter choices supplementing known efforts; unsupported values require explicit correction [[settings-34](settings.md#settings-34)].
- Choosing a player another binding already names states which bindings those are, because equal ids deliberately share one conversation.
- The editor is a popover anchored at the role's control, following the house popover idiom ([DR-010](../decisions/010-interface-craft.md) §6): focus enters it on open and returns to the control on close, and Escape, an outside click, and Cancel close it.

#### playbook-library-43

While the role-binding editor [[playbook-library-4](#playbook-library-4)] stands open, the Library shall keep it inside the box that must show it — the surface's own scroll box — at every width down to the 320-pixel floor, refitting whenever the window or the editor's own box resizes ([DR-041](../decisions/041-chrome-that-fits.md)):

- that box bounds the editor's width, and a control late in a wrapping roles row moves the editor along the box's edge rather than past it, so a form surface never scrolls sideways to reach it.

#### playbook-library-38

Where a role's bound player is named by more than one binding, the Library shall mark that role's binding as shared and name the other positions holding the lane ([DR-032](../decisions/032-session-players.md)), so a shared conversation is never mistaken for two separate ones.

### Compile Flow

#### playbook-library-5

When the Boss opens the Source tab's paste mode [[playbook-library-56](#playbook-library-56)], the Library shall accept the playbook source as either a picked markdown file or in-app markdown text and write it as the draft's `<id>.md`:

- An empty text and no file is refused before anything is written.

#### playbook-library-6

While a compile is running, the Library shall display each phase of the compile pipeline ([DR-005](../decisions/005-compilation-integration.md)) with its name and live status — running, succeeded, or failed — updating as phases complete.

#### playbook-library-7

When a draft's compile succeeds, the Library shall present the Register tab [[playbook-library-61](#playbook-library-61)] as the registry form with fields for command and intent and a player per derived role, prefilled where derivable from the playbook source and compiled output, and shall resolve each submission of the form by the cases below:

- Submission passes registry validation [[playbook-library-15](#playbook-library-15)]: the Library registers the playbook by writing its entry — including a role binding per required role [[playbook-library-4](#playbook-library-4)], with any player the submission names but the roster lacks written first — into the shared config's `playbooks` map.
- Submission rejected: the rejection names the violated rule and causes no config write.

#### playbook-library-8

Where the compile toolchain cannot be resolved — the app's own `slc` missing, or no runtime meeting the version floor [[playbook-library-11](#playbook-library-11)] — the Library shall mark the compile flow unavailable, shall show guidance naming each missing prerequisite and how to restore or configure it, and shall not start a compile.

#### playbook-library-83

When a shell starts the core naming a compile runtime — its own executable, whether that is Electron, and the module directories holding the compiler it declares — the Library shall compile on that runtime with the compiler found there [[playbook-library-11](#playbook-library-11)], so the shell that declares the compiler names where it lives ([DR-081](../decisions/081-the-app-supplies-the-compiler.md)).

#### playbook-library-9

While a compile is running, when a pipeline phase fails, the Library shall mark that phase failed, shall surface that phase's captured output, shall write nothing to the shared config, and shall allow the user to retry the compile after editing the source.

#### playbook-library-10

When a compiled playbook is registered, the Library shall list it with its registry fields and enabled state, and shall indicate that project sessions started before registration must be restarted before the playbook is available in them.

### Authoring Workspace

#### playbook-library-50

When the Library surface is opened, the Library shall list every draft [[playbook-library-70](#playbook-library-70)] in a "Drafts" section between the configured playbooks and the built-ins [[playbook-library-34](#playbook-library-34)], each row carrying the draft's id, its state chip, the age of its last activity, and an "Open" control ([DR-058](../decisions/058-chat-assisted-playbook-authoring.md)):

- the chip reads "No source", "Draft", "Compiling", "Failed", "Interrupted", "Compiled", or "Changed" — the failed phase and the compile's age in its title, never in the chip ([DR-041](../decisions/041-chrome-that-fits.md) §9);
- a draft whose library directory is gone reads "Source missing" and offers only Delete;
- a draft compiling in the background keeps its row live, and opening it shows the running phases;
- the section is absent while there is no draft, and the configured list's empty state then points at enabling a built-in or "New playbook".

#### playbook-library-51

When the user activates "New playbook" — at the Drafts section's foot, or from the Captain home's slash menu ([DR-009](../decisions/009-at-hand-interaction.md)) — the Library shall ask for the playbook id in an inline field captioned "Lowercase; it names the file and the /command — the command can change at registration", create the draft [[playbook-library-70](#playbook-library-70)] on Enter, and open its workspace [[playbook-library-52](#playbook-library-52)]:

- an id outside `^[a-z][a-z0-9_-]*$`, or one a configured playbook or a built-in holds, is refused in place naming the rule, and nothing is created;
- an id naming an existing draft opens that draft;
- an existing `playbooks/<id>/<id>.md` with no draft record becomes the new draft's source, so a removed playbook's retained source can be worked again.

#### playbook-library-52

When a draft is opened, the Library shall replace the playbook list with the authoring workspace: a header carrying a "Playbooks" control that returns to the list without ending anything, the draft's id, and its state chip [[playbook-library-50](#playbook-library-50)]; the conversation pane on the left [[playbook-library-53](#playbook-library-53)]; and on the right a pane whose tab strip reads Source / Gears / Machine / Register with the Compile control at the strip's right end [[playbook-library-57](#playbook-library-57)] ([DR-058](../decisions/058-chat-assisted-playbook-authoring.md)):

- the panes stand side by side with the house divider between them from the `@2xl` container step ([DR-030](../decisions/030-workspace-chrome.md)) and stack — conversation above, artifacts below — beneath it, the divider then turning into the horizontal grip between the two boxes ([DR-041](../decisions/041-chrome-that-fits.md) §9); each pane scrolls inside its own box and the page scrolls in neither direction;
- the side-by-side split and the stacked split are app preferences remembered across launches;
- the tab strip wraps, and below `@xs` its tabs collapse to icon plus tooltip with their accessible names unchanged; every control in the header, the tab strip, the compile band, and the composer's action row reads at most 14 characters, its busy form included;
- the workspace stays open in the core while the list is shown, so returning loses nothing.

#### playbook-library-53

While a draft's workspace is open, the conversation pane shall render the draft's transcript in record order — the Boss's messages as Boss bubbles, the system's lines as ◇ system lines [[run-view-1](run-view.md#run-view-1)], the agent's text as streaming Markdown [[run-view-3](run-view.md#run-view-3)], its tool calls as collapsed cards labeled with the tool and its subject [[run-view-4](run-view.md#run-view-4)], its thinking collapsed, and its failures as failure lines — and shall render a directive block in the agent's reply as a card, never as fence text:

- the cards read "Asked to compile" and "Proposed registration", the latter listing command, intent, and role → player with "Open Register";
- a malformed directive stays visible as code with a "Spex could not read this block" caption;
- while a turn runs the pane's header shows the running mark and "working · ⟨elapsed⟩" ticking each second ([DR-010](../decisions/010-interface-craft.md) §5);
- the pane sticks to its bottom with the jump pill, and mounts only the entries near the viewport.

#### playbook-library-54

While a draft's workspace is open, the composer beneath the conversation — of the house shape [[run-view-106](run-view.md#run-view-106)] with the placeholder "Describe the playbook…" and the caption "Enter sends" — shall dispatch or queue each Boss submission by the draft's published state [[core-service-96](core-service.md#core-service-96)]:

- while the draft is idle a submission dispatches, the primary reading "Send";
- while a turn or a compile runs a submission queues with the queued indicator, the primary reading "Send next" and the placeholder "Sends after the reply…" or "Sends after the compile…", and the queue dispatches in order when the draft is idle [[playbook-library-68](#playbook-library-68)];
- "Abort" stands in the action row while a turn runs and ends it, leaving the transcript as far as it got; a canceled turn leaves the queue standing;
- a refused dispatch keeps the text with the refusal shown; the composer's draft and the queue survive leaving and reopening the workspace while the app runs.

#### playbook-library-84

While a draft's workspace is open with an empty transcript, the conversation pane shall show one caption above the composer [[playbook-library-54](#playbook-library-54)] — "Tell the agent what the playbook does, who does what, and when it is done" — with two openers, each an act whose outcome its label names, neither sending ([DR-082](../decisions/082-the-first-move-in-a-draft-is-an-act.md)):

| Opener | Act |
| --- | --- |
| "Use a SKILL.md…" | where the shell offers a file pick, runs it — a canceled pick changes nothing; a draft with no source takes the picked file as its source [[playbook-library-5](#playbook-library-5)], and one with a source gets the path placed in the Source tab's paste mode [[playbook-library-56](#playbook-library-56)] for "Use as source" to confirm — else opens the paste mode; in every case places "Adapt this file into a playbook: keep what it does, name who does what, and say when it is done" in the field, focus landing on the paste text where that mode opened and on the field otherwise |
| "Try the example" | places slc's six-line demo prose [[playbook-library-35](#playbook-library-35)] in the field and focuses it |

- a write the core refuses keeps the field's text and shows the refusal above the composer [[playbook-library-54](#playbook-library-54)].

#### playbook-library-55

While a draft's workspace is open, the conversation pane's header shall name the agent that answers as an agent chip — "Captain" with the Captain's block [[settings-1](settings.md#settings-1)] by default, else the chosen roster player's id with its block [[settings-26](settings.md#settings-26)] — wearing that adapter's readiness [[core-service-9](core-service.md#core-service-9)], the chip opening a picker of "Captain" and every roster player whose choice is stored as the preference `draft:<id>:player` [[storage-5](storage.md#storage-5)] ([DR-058](../decisions/058-chat-assisted-playbook-authoring.md)):

- the picker follows the house popover idiom ([DR-010](../decisions/010-interface-craft.md) §6) and is disabled while a turn runs, its tooltip saying so;
- a not-ready agent disables Send with the unmet requirement in the caption;
- a switch applies to the next turn, which starts a fresh provider conversation from the transcript [[playbook-library-65](#playbook-library-65)], and a system line says so: "Now answering: dev.reviewer — the conversation so far was replayed to it".

#### playbook-library-56

While a draft's workspace is open, the Source tab shall render the draft's `<id>.md` as formatted markdown [[playbook-library-22](#playbook-library-22)] as it stands on disk — refreshed on every source message [[playbook-library-71](#playbook-library-71)], so text appears while the agent writes — captioned with who changed it last and when, and shall offer "Edit" and "Paste":

- with no source the tab says the agent writes `<id>.md` here as you talk and offers "Paste";
- "Edit" opens the whole file in the plain-text editor idiom — Cancel, Save, Edit/Preview [[spec-view-48](spec-view.md#spec-view-48)] — whose Save writes under the version token it read and treats a changed file as a conflict offering Reload or Overwrite [[spec-view-50](spec-view.md#spec-view-50)];
- "Paste" opens the paste mode — a text field, a "Pick file" control, "Use as source", Cancel [[playbook-library-5](#playbook-library-5)];
- Save and "Use as source" are disabled while a turn runs ("Waits for the reply") and while a compile runs ("Compiling"), because the agent may be editing the same file;
- a source whose digest differs from the last successful compile's marks the chip "Changed" and captions Gears and Machine "from the compile before this change"; the tab wears a dot while the source changed since the last compile.

#### playbook-library-57

While a draft is idle and has a source, when the Boss activates Compile or the agent's reply carries a compile directive [[playbook-library-66](#playbook-library-66)], the Library shall start the draft's compile [[playbook-library-67](#playbook-library-67)] and show it in the band under the tab strip: a phase row, the age of the compiler's last line, a folded log, and Cancel [[playbook-library-27](#playbook-library-27)]:

- Compile is enabled only with a source, no turn, no compile, and a resolvable toolchain [[playbook-library-8](#playbook-library-8)]; disabled, its tooltip names the reason — "No source yet", "Waits for the reply", "Compiling", or the toolchain guidance; it reads "Compiling…" and stays disabled for the compile's duration;
- the phase row names the pipeline's phases in human words [[playbook-library-6](#playbook-library-6)] — Normalize, Spec items, Optimize, Machine, Link, Package — the compiler's ids in the tooltips ([DR-010](../decisions/010-interface-craft.md) §2), each waiting, running with its elapsed time, done with its duration, or failed, and a phase the compiler names that the row lacks is appended;
- "last output ⟨age⟩ ago" ticks beside the running phase from the compiler's last line, heartbeat included, so a silent agent-driven phase reads as alive rather than stuck ([DR-010](../decisions/010-interface-craft.md) §5);
- the band's caption names who started it — "asked by you" or "asked by the agent" — and a system line in the thread says the same;
- the row wraps under `@md` and the band keeps the Source, Gears, and Machine tabs readable beneath it.

#### playbook-library-58

While a draft's compile is running, when a phase fails or the compiler asks for clarification [[playbook-library-9](#playbook-library-9)], the Library shall mark that phase failed in the band with its captured output — or the questions with their reasons, evidence, and choices — opened beneath, set the chip "Failed", and show in the thread what the agent was told [[playbook-library-68](#playbook-library-68)]:

- the system line reads "Compile failed at ⟨phase⟩ — sent to the agent", or "Compile failed at ⟨phase⟩ — three in a row; tell the agent how to proceed" when the relay stopped, or "Compile failed at ⟨phase⟩ — waiting for your queued message" when a Boss message carries the output instead — ⟨phase⟩ in the row's human words [[playbook-library-57](#playbook-library-57)];
- a compile the Boss canceled reads "Compile canceled" and sends nothing;
- a failure before the compiler ran — the toolchain — shows its guidance in the band and sends nothing;
- Gears and Machine keep the last successful compile's artifacts, captioned "from the last good compile".

#### playbook-library-59

When a draft's workspace is opened after the core stopped while its compile was running, the Library shall show the chip "Interrupted", the band reading "Compile interrupted when Spex closed" with Compile enabled, and shall relay nothing to the agent, so a compile cut by a restart is restarted by a person ([DR-010](../decisions/010-interface-craft.md) §5).

#### playbook-library-60

When a draft's compile succeeds, the Library shall set the chip "Compiled", fill the Gears tab as the outline's read-only item rows over the parsed gears and the Machine tab as the FSM code under its pinned state list, each in the stage box idiom [[playbook-library-22](#playbook-library-22)] over the draft's artifacts [[playbook-library-24](#playbook-library-24)], enable the Register tab with a dot, and append the system line "Compiled — roles: ⟨roles⟩":

- before a successful compile the Gears, Machine, and Register tabs stand disabled with "Compiles first" in their tooltips;
- the derived roles are the compiled entry's, never the prose's;
- the dot on Register stays until the tab is opened after the agent's proposal lands [[playbook-library-68](#playbook-library-68)].

#### playbook-library-61

While a draft's last compile succeeded, the Register tab shall present the registration form [[playbook-library-7](#playbook-library-7)] — command, intent, and one player per derived role — prefilled in this precedence: the Boss's own edits, then the agent's latest proposal [[playbook-library-66](#playbook-library-66)], then derived defaults — and on "Register" shall register the draft [[playbook-library-69](#playbook-library-69)] ([DR-058](../decisions/058-chat-assisted-playbook-authoring.md)):

- the id is the draft's and not editable; the command defaults to the id; the intent defaults to the source's first prose paragraph;
- a role's player row offers the roster [[settings-26](settings.md#settings-26)] and "New player dev.⟨role⟩" carrying the draft's agent block, editable through the agent editor as a built-in's is [[playbook-library-34](#playbook-library-34)]; a proposed player the roster lacks is offered as that new player;
- a proposal naming a role the entry lacks, or missing a derived role, is shown beside the form as a mismatch with the derived roles authoritative;
- Register is disabled until every role has a player and command and intent are non-empty, reads "Registering…" while it writes, and is refused while a turn or compile runs;
- a refusal names the violated rule inline and leaves the form standing; success lists the playbook among the configured [[playbook-library-10](#playbook-library-10)], the draft leaves the Drafts section, and the list opens with the new card in view.

#### playbook-library-62

When a draft's workspace is opened — in the same run or after a restart — the Library shall restore its transcript from the stored records, its source, its queue, its last compile's outcome with the phase output or questions, its compiled tabs where a successful compile is recorded, and its proposal [[playbook-library-70](#playbook-library-70)], so a failed compile is resumed where it stopped ([DR-058](../decisions/058-chat-assisted-playbook-authoring.md)):

- the next message continues the conversation as one thread to the Boss, whatever the provider's own continuity did [[playbook-library-65](#playbook-library-65)];
- a draft whose transcript is unreadable opens with the source intact and a scoped diagnostic in place of the thread.

#### playbook-library-63

When the Boss activates a draft row's Delete, the Library shall ask with the inline confirm — "Delete" and "Keep", the safe default focused [[playbook-library-26](#playbook-library-26)] — and on Delete remove the draft: its record, transcript, preference, and library directory [[playbook-library-70](#playbook-library-70)]:

- Delete is refused while the draft's turn or compile runs, naming which ([DR-010](../decisions/010-interface-craft.md) §4);
- a registered playbook is never a draft and is never removed by this control.

### Pipeline Artifacts

#### playbook-library-22

While a configured playbook is listed, the Library shall carry that playbook's compilation stages as a permanent row of toggles — Source (the workflow markdown the playbook was compiled from) → Gears (the GEARS spec items) → State machine (the compiled FSM) — whose pressed stage opens its artifact beneath the row:

- Pressing a closed stage opens it and closes the stage that was open, so one stage at a time stands open for that playbook; pressing the open stage closes it.
- The first open requests that playbook's artifacts [[playbook-library-24](#playbook-library-24)], which the card holds for its later opens; the open stage reads as loading until they arrive, and a failed request leaves its message in the open stage until a later press asks again.
- A markdown stage renders as formatted text; the State machine stage renders the FSM as code, with the derived state list standing outside the box as its pinned header, chips wrapping ([DR-041](../decisions/041-chrome-that-fits.md) §9), so the states hold their place at every scroll position and every height.
- The Gears stage stands instead as the outline's read-only item rows [[spec-view-3](spec-view.md#spec-view-3)] over the parse the playbook's artifacts carry [[playbook-library-24](#playbook-library-24)]: every row collapsed until pressed, an expanded row rendering the item's body, a citation of an item in the same artifact previewing it at hand [[spec-view-61](spec-view.md#spec-view-61)] and landing on that item within the box [[spec-view-6](spec-view.md#spec-view-6)], no control that edits, and the rendered markdown wherever that parse is absent.
- The open stage's artifact sits in a box that caps its height and scrolls, whose bottom edge carries the house's grip turned horizontal ([DR-030](../decisions/030-workspace-chrome.md)): dragged, or moved a step per arrow key while focused, it sets the box between 8rem and 48rem, a double-click restores the default 24rem, and the height is remembered for that playbook across launches, one height serving its stages.
- The grip stands only while the artifact runs past the box — a stage the box fits has nothing to page through, so the box takes the artifact's height and shows no edge to pull.

#### playbook-library-23

Where the artifacts a playbook served name a stage absent, the Library shall render that stage struck out and inactive in the playbook's stage row [[playbook-library-22](#playbook-library-22)] — its tooltip saying the stage was not found next to that playbook's registry — and shall name the absent stages inside the open stage, leaving every located stage open-able:

- Until a playbook's artifacts arrive, the row marks no stage absent.

### Pipeline Artifact Handling

#### playbook-library-24

When a client requests a playbook's artifacts, the core package shall resolve them from the registry module's location: the compiled library layout (`<id>.md`, `<id>.playbook/<id>.gears.md`, `<id>.playbook/<id>.fsm.ts`) and the published-package layout used by `@sublang/playbook` registries, serving each stage's content, the Gears stage also parsed into the item shape the outline's rows read [[spec-view-3](spec-view.md#spec-view-3)] — carried only where that parse yields an item, so a stage the parser cannot read serves its markdown alone — the state ids derived from the FSM, and the machine graph [[playbook-library-36](#playbook-library-36)] over the protocol, and naming absent stages without failing the request.

#### playbook-library-36

When the core package derives the current Library playbook's artifacts from its FSM, the core package shall serve the machine graph beside the state ids, derived from the machine's own config rather than its source text ([DR-028](../decisions/028-run-machine-view.md)):

- nodes carry the state id, its parent for a nested state, its kind (a final state named as such), the player role the state invokes when its meta names one, and its tags;
- edges carry a stable identity of owner state, event, branch index, and target index — guarded sibling branches staying distinct — with the event name as the label and an empty event naming the always transition;
- a target naming a state's declared id resolves to that state, wherever it sits in the tree — never assumed to be machine-id-prefixed ([DR-031](../decisions/031-machine-call-tree.md));
- a compound state's own done transition is an edge out of that state ([DR-031](../decisions/031-machine-call-tree.md));
- a machine-level transition, having no single source state, is no edge;
- the graph names its initial state;
- a machine that cannot be loaded serves a null graph, named among the absent stages without failing the request.

### Naming and Copy

#### playbook-library-26

The Library surface shall be presented to the user as "Playbooks": the navigation entry and the surface's user-facing copy shall say "Playbooks" or "playbook", reserving the word "library" for the on-disk compiled-artifact store, and shall name actions by their outcome — a built-in is enabled, a configured playbook is removed behind a confirm whose choices read "Remove" and "Keep", a draft is deleted behind a confirm whose choices read "Delete" and "Keep", and the creation control reads "New playbook" — never by the config write behind them ([DR-010](../decisions/010-interface-craft.md) §2).

#### playbook-library-29

While a configured playbook is listed, the Library shall label the playbook's registry source path with a muted "from" prefix that stays visible outside any truncation, and shall expose the full, untruncated path — introduced as the source the playbook was loaded from — in the entry's tooltip.

### Built-ins and Example

#### playbook-library-34

When the Library surface is opened, the Library shall list each known built-in playbook absent from the shared config ([DR-015](../decisions/015-reference-content.md)) with its command, intent, required roles, and browsable source markdown, and shall offer an enable flow — one "Enable" action per built-in, acknowledging while it writes — that gives each role a player and registers the playbook through the shared-config write path [[playbook-library-16](#playbook-library-16)]:

- Browsing a built-in's source requires no config change.
- With no playbook configured, the configured list says so and points at enabling a built-in below or compiling one.
- A role's proposed player id is `dev.<role>`, editable before it is written, because the id is the sharing decision ([DR-032](../decisions/032-session-players.md)).
- A proposed id the roster lacks is written to the roster first, carrying the agent block chosen for that role, so no binding is written dangling.

#### playbook-library-48

While `dev` is listed as configured and `branch` or `pr` is not, the Library shall mark `dev`'s pull-request delivery unavailable on its card, naming each missing built-in ([DR-059](../decisions/059-issue-delivery-through-dev.md)):

- the mark reads as a hint beside the card's roles, not as an invalid entry [[playbook-library-2](#playbook-library-2)], because a plain `/dev` request still runs;
- the mark disappears once both are listed as configured.

#### playbook-library-35

When the Library surface is opened, the Library shall present the slc demo workflow as a read-only example ([DR-015](../decisions/015-reference-content.md)) in the same permanent stage row a configured playbook wears [[playbook-library-22](#playbook-library-22)], over four stages held in memory rather than requested — source, normalized text, gears, and state machine — and shall offer a prefill action that opens a new draft workspace [[playbook-library-51](#playbook-library-51)] with the example's normalized text placed in the Source tab's paste mode [[playbook-library-56](#playbook-library-56)], without writing or compiling anything:

- Sources and gears served for display drop their leading maintainer comment headers.

### Compile Cancellation

#### playbook-library-27

While a compile is running, the Library shall render a secondary cancel control beside the streamed compile progress and shall keep the compile start control disabled for the whole time the compile runs:

- Activating the cancel control requests that the core abort the compile ([DR-010](../decisions/010-interface-craft.md) §5), with the cancellation recorded in the compile progress log.

### Config Gate

#### playbook-library-28

While the shared config is missing or invalid, the Library shall replace its content with a gate that (1) explains that the Captain can only run playbooks listed on this surface, (2) states that playbooks need a valid config and directs the user to fix it in Settings, and (3) renders "Settings" as a navigation control when the host app provides surface navigation, falling back to plain text otherwise.

## Internal Behavior

### Toolchain Resolution

#### playbook-library-11

When toolchain resolution is requested, the toolchain resolver shall locate the compiler and the Node.js it runs on in this order, probing each Node.js candidate with `--version` in the caller's environment, and shall verify that the Node.js chosen satisfies the version floor `slc` requires ([DR-005](../decisions/005-compilation-integration.md), [DR-081](../decisions/081-the-app-supplies-the-compiler.md)):

| Prerequisite | Order |
| --- | --- |
| Node.js | (1) the command `SPEX_NODE` names, the only candidate when set; else (2) the app's own runtime the shell handed the core [[playbook-library-83](#playbook-library-83)] — its Electron binary run as Node with `ELECTRON_RUN_AS_NODE=1`, or its Node — when it meets the floor; else (3) a `node` on the caller's `PATH` that meets it |
| `slc` | (1) the command `SPEX_SLC` names; else (2) the app's own copy of `@sublang/slc` in the module directories the shell handed the core [[playbook-library-83](#playbook-library-83)], those above the core's own package when none were handed |

- The resolved command for the app's copy is the Node.js chosen running the copy's CLI — on Electron with `--import` of the core's preload ahead of the CLI, and the variable travelling with that command alone — so the copy's nested `@sublang/cligent` resolves the agent SDKs the shells supply ([DR-024](../decisions/024-app-supplied-agent-runtimes.md), [DR-081](../decisions/081-the-app-supplies-the-compiler.md)).
- The app's copy resolves as unavailable, the guidance naming both engines, when the playbook engine Node resolves from the copy's own package is not the app's and declares another runtime ABI or an artifact schema the app does not support, or cannot be read; the app's own engine resolved from the copy agrees by construction.
- Any prerequisite unresolvable: the resolver returns an unavailability result naming that prerequisite — the version found when a Node.js answered below the floor, the restore command when the app's copy is missing — and spawns no compiler.

### Compile Execution

#### playbook-library-12

When a compile is started for playbook id `<id>`, the compile runner shall run `slc` as an external child process in a per-playbook directory `<library-root>/<id>/` under the app-managed library root ([DR-004](../decisions/004-config-and-persistence.md)) — materializing in-app source text as a markdown file there and linking the app-bundled runtime contract ([DR-005](../decisions/005-compilation-integration.md)) — and shall capture the process output per pipeline phase, reporting phase transitions for progress [[playbook-library-6](#playbook-library-6)] and the failing phase's output on failure [[playbook-library-9](#playbook-library-9)]:

- The runner grants `slc` a stall budget of 2400 seconds through `SLC_STALL_TIMEOUT` unless the environment already sets that variable, because agent-driven phases stay silent longer than `slc`'s ten-minute default.
- The compiler runs on the Node.js the resolver chose [[playbook-library-11](#playbook-library-11)], with the variable that runtime needs beside the caller's environment — `ELECTRON_RUN_AS_NODE=1` for Electron's, dropped again by the compiler's preload before it starts — so the compiler runs as Node while the agents it spawns inherit no such variable.
- Compiled outputs of a previously successful compile for the same id are replaced only after the new compile succeeds.

#### playbook-library-42

When a compile is started, the compile runner shall hand `slc` the block the compile's agent is resolved from — the draft's answering agent for a draft compile [[playbook-library-64](#playbook-library-64)], the Captain's block for a compile from the registry form — as `SLC_AGENT` (`claude` as `claude-code`; `codex`, `gemini` and `opencode` as named), with `SLC_MODEL`, `SLC_EFFORT` and `SLC_FAST_MODE` where the block sets them, unless the environment sets any of those four variables, in which case the runner sets none of them ([DR-081](../decisions/081-the-app-supplies-the-compiler.md)):

- an adapter `slc` does not drive (`kimi`), with none of those variables in the environment, refuses the compile before the compiler runs, the guidance naming the adapters `slc` drives and `SLC_AGENT`;
- fast mode travels as the literal `true` or `false` the block holds;
- the progress log names the agent and its source before the compiler runs — `agent: <id> from the block`, or `agent: <SLC_AGENT, else slc's configuration> from the environment`.

### Registry Generation

#### playbook-library-13

When `slc` completes successfully, the registry generator shall derive `idleStateId`, `finalStateId`, and `parkStateIds` by introspecting the emitted machine definition ([DR-005](../decisions/005-compilation-integration.md)), each derived id naming a state present in that machine, and shall report them as compile metadata for display [[playbook-library-22](#playbook-library-22)] — never as registry-entry fields ([DR-014](../decisions/014-released-toolchain.md)):

- Ambiguous derivation: the registry generator surfaces the candidate state ids for user selection in the registry form [[playbook-library-7](#playbook-library-7)] instead of choosing silently.

#### playbook-library-14

When the registry form [[playbook-library-7](#playbook-library-7)] is submitted with valid entries, the registry generator shall emit a registry manifest module into the playbook's library directory as a thin wrapper over the `slc`-emitted registry entry ([DR-014](../decisions/014-released-toolchain.md)), returning the manifest path for the config entry's `from` key and the derived role ids:

- the user's command and intent override the entry's;
- every other member of the entry passes through unchanged, including the role ids in their authored casing and the artifact schema the entry advertises — under artifact schema 2 a role is a playbook-local slot a user binds to a player, not a host player id ([DR-032](../decisions/032-session-players.md));
- the module carries the registry-contract marker;
- two role ids colliding fails the compile naming the offending role.

### Registry Validation

#### playbook-library-15

When a registry entry is about to be registered into the shared config, the registry validator shall apply the same fail-closed rules the playbook loader applies at load ([DR-004](../decisions/004-config-and-persistence.md)) — including: the `playbooks` key equals the manifest id; the manifest at `from` imports successfully; no duplicate id or command among configured playbooks; no reserved captain role among role names; every required role resolved; at least one visible role; every agent resolving a supported adapter — and shall reject a violating registration naming the violated rule, leaving the shared config file unmodified.

### Portable Library

#### playbook-library-46

When a compiled playbook is registered, the Library shall retain its source, write a config-relative managed locator, and ensure generated files relocate or rebuild before use [[storage-8](storage.md#storage-8)], resolving the same locator for loading, validation and artifact lookup [[storage-7](storage.md#storage-7)].

### Config Writes

#### playbook-library-32

When a registration writes the `playbooks.<id>` entry after a compile, the compile flow shall re-key the submitted role bindings onto the derived role ids [[playbook-library-14](#playbook-library-14)] by case-insensitive name match:

- A derived role matching no binding: the compile flow fails naming the derived roles and the unmatched ones, writes no config change, and keeps the compiled artifacts so a corrected submission can register without recompiling.

#### playbook-library-33

When playbook loading imports a config `from` module that is a file path, and the module carries no registry-contract marker [[playbook-library-14](#playbook-library-14)], the registry validator shall treat the config as invalid with guidance naming the playbook and recompilation as the remedy ([DR-014](../decisions/014-released-toolchain.md)):

- A package specifier `from` does not require the marker.

#### playbook-library-16

When the config writer updates the shared config file — enabled state [[playbook-library-3](#playbook-library-3)], role-binding edits [[playbook-library-4](#playbook-library-4)], or registration [[playbook-library-7](#playbook-library-7)] — it shall preserve comments, key order, and formatting of untouched content byte-for-byte, shall modify only the targeted keys, and shall replace the file atomically so an interrupted write cannot leave a partially written config.

### Authoring Conversation

#### playbook-library-64

When a draft turn starts, the conversation runner shall run the draft's agent block — the Captain's, or the preferred roster player's [[storage-5](storage.md#storage-5)] — through cligent directly, outside the Captain shell, loading the adapter class through the same adapter-import table the session runtime uses, with these options and no others ([DR-058](../decisions/058-chat-assisted-playbook-authoring.md)):

| Option | Value |
| --- | --- |
| model, effort, fastMode | the block's |
| cwd | the draft directory `<library-root>/<id>/` [[playbook-library-12](#playbook-library-12)] |
| permissions | `{ mode: "auto" }` — the block's own policy and `writablePaths` dropped |
| allowedTools, disallowedTools, maxTurns | absent |
| resume | the token the previous turn of this run returned, when the agent is unchanged; else none |
| abortSignal | the turn's, tripped by Abort |

- the block's `instruction` is not carried; the prompt composition carries everything [[playbook-library-65](#playbook-library-65)];
- no instance outlives the turn ([DR-051](../decisions/051-runtime-held-for-a-turn.md)); the token is held in memory for the app's run and never written;
- a run ending in an error coded `SESSION_RESUME_REJECTED` is re-run once as a reseed;
- a `permission_request` event is recorded and shown as a failure line; the runner answers nothing, so the adapter's own headless default applies;
- the turn is recorded and streamed as `turn_started` carrying the Boss or system text, `player_prompt` with the exact prompt, one `player_event` per event, `player_finished`, and `turn_finished` or `turn_aborted`, every player record naming the player `author`, so the run view's transcript folds read them unchanged [[playbook-library-70](#playbook-library-70)].

#### playbook-library-65

When the conversation runner composes a turn's prompt, it shall compose it by the conversation's case, the file on disk always being the source of truth:

| Case | Prompt |
| --- | --- |
| First turn of a provider conversation | the preamble, the shape of a source, the shipped documents by path, the six-line demo, the directive protocol, the working rules, the draft state, then `Boss:` and the message |
| Later turn of the same provider conversation | a `Since your last reply:` line when the draft changed since the last prompt — the Boss edited or replaced the source, a compile settled — then `Boss:` and the message |
| Reseed — a restart, a switched agent, a rejected resume | as the first turn, with `Conversation so far:` holding the Boss, system, and agent final texts in order, oldest dropped past 24 KB, before the message |
| Relay | the failed phase, its elapsed time, the last 200 lines of its output — or the clarification questions with reason, evidence, and choices — then "Fix `<id>.md` and explain the cause; you may ask for another compile" as a system-origin message |
| Success | "The compile succeeded; the roles are ⟨roles⟩. Propose the registration in a register block" as a system-origin message |

- the preamble names the absolute source path, tells the agent to write and edit only that file, never to run the compiler, git, or npm, and to ask at most one question per reply when the answer changes the roles or the ending, and says that a source the Boss placed may be a SKILL.md — YAML frontmatter `name` and `description`, then instructions — or other workflow markdown, to rewrite in place into a source with the description as the title and the registration intent, the instructions as the prompts, and the actors as the roles ([DR-082](../decisions/082-the-first-move-in-a-draft-is-an-act.md));
- the shape of a source is at most twenty lines: an H1, a `Roles:` list of capitalized unique names, behaviors as `When ⟨condition⟩, Captain shall prompt ⟨Role⟩:` with blockquoted prompts one point per line or a fenced `markdown` instruction block, runtime values relayed in quotes (`>`) as `<placeholders>`, `Results:` bullets only for several outcomes or a consumed value with `<field>: <verbatim final text>` for a relayed whole reply, nested calls as ``Captain shall call playbook `id`:``, at most two or three roles;
- the documents are the installed package's `slc/text2gears.md`, `reference/sdlc/review.md`, `reference/sdlc/code.md`, and `reference/sdlc/review.playbook/review.gears.md`, resolved from the package the core depends on;
- the draft state names the id, the source path or "none", the last compile's outcome, and the roster players with adapter and model; a malformed directive from the previous reply is named at the head of the prompt, before anything else;
- a queued Boss message dispatched after a compile settled carries the relay or success text as its preface instead of a separate turn [[playbook-library-68](#playbook-library-68)].

#### playbook-library-66

When a draft turn ends with status success, the conversation runner shall parse every top-level fenced ```` ```spex ```` block of the reply's final text — the done result, else the concatenated text — as YAML with a `kind` key, act on the last block of each kind, and record each block as a directive:

| `kind` | Keys | Effect |
| --- | --- | --- |
| `compile` | none | starts the draft's compile when Compile would be enabled [[playbook-library-57](#playbook-library-57)], else records a system line naming why not |
| `register` | `command`, `intent`, `players: {⟨Role⟩: ⟨player id⟩}` | replaces the draft's proposal [[playbook-library-61](#playbook-library-61)]; a role the compiled entry lacks is kept as a mismatch |

- a fence opened inside another fence is content, not a directive; a block missing a key, carrying an unknown key or kind, or failing to parse is left as code, recorded as malformed, and named in the next prompt [[playbook-library-65](#playbook-library-65)];
- a turn ended by Abort or an error acts on nothing.

#### playbook-library-67

When a draft's compile starts, the compile runner shall run the pipeline on the `<id>.md` already in the draft directory [[playbook-library-12](#playbook-library-12)] — copying nothing, packaging and validating the entry with the draft's id as command and a placeholder intent [[playbook-library-14](#playbook-library-14)] [[playbook-library-15](#playbook-library-15)] — as that id's one compile [[core-service-96](core-service.md#core-service-96)], write no config, and record the outcome on the draft [[playbook-library-70](#playbook-library-70)]:

- progress lines broadcast as compile progress for the draft id; the failed phase is the last `✗` line's phase, else the phase the compiler left open when it exited (`slc` when none was), "packaging" for a failure after the compiler finished, and the toolchain for a failure before it ran;
- an exit status 2 with an `SLC_CLARIFICATION:` line records the report's questions;
- success records the derived roles and the source's SHA-256, from which the "Changed" state derives.

#### playbook-library-68

When a draft's compile settles, the conversation runner shall start the follow-up by outcome, a queued Boss message always dispatching first and carrying the follow-up text as its preface [[playbook-library-65](#playbook-library-65)]:

| Outcome | Follow-up |
| --- | --- |
| Failed phase or clarification | a relay turn — unless the last three compiles failed with no Boss message between them, or the compile was canceled or failed before the compiler ran |
| Success | one success turn asking for the registration proposal |
| Canceled, interrupted, toolchain | none |

- a Boss message resets the consecutive-failure count; the count and the queue persist on the draft.

#### playbook-library-69

When a draft is registered, the registration path shall re-package the retained compiler outputs with the confirmed command and intent without rerunning the compiler [[playbook-library-14](#playbook-library-14)], write any player the submission names but the roster lacks first, then write the `playbooks.<id>` entry re-keyed onto the derived role ids [[playbook-library-32](#playbook-library-32)] through the config writer [[playbook-library-16](#playbook-library-16)], reload the config, and retire the draft [[playbook-library-70](#playbook-library-70)]:

- the one-shot `compile.run` is a draft-style compile followed by this same path in one reply, so both share one helper;
- a refused write leaves the draft standing with its artifacts, so a corrected submission registers without recompiling.

### Draft Store

#### playbook-library-70

When a draft is created, opened, written, recorded, listed, retired, or deleted, the draft store shall keep the source under the tracked library directory [[storage-8](storage.md#storage-8)] and the draft's state, queue, and transcript under the ignored draft record [[storage-1](storage.md#storage-1)] [[storage-23](storage.md#storage-23)], written atomically or appended under the home lease [[storage-14](storage.md#storage-14)]:

| Case | Behavior |
| --- | --- |
| create | make `<library-root>/<id>/` and `local/drafts/<id>/draft.json`; refuse an id a configured playbook, a built-in, or a draft holds |
| open | serve the state, the source with its version token, and the stored records after a given sequence, then stream new ones |
| write source | replace `<id>.md` atomically under the token; refused while a turn or compile runs |
| record | append each record as it is streamed; keep the compile outcome, the queue, the failure count, and the proposal in `draft.json`; a compile running at core start is rewritten as interrupted |
| list | every `draft.json` under `local/drafts/`, with the source's first line and "source missing" when the directory is gone |
| retire | remove the record and the preference, leaving the directory to the registered playbook |
| delete | remove the record, the preference, and the library directory |

- an unreadable record or transcript is a scoped diagnostic that blocks that draft alone.

#### playbook-library-71

When the conversation runner observes a `tool_result` event or the turn ends, it shall read `<id>.md`, and when its digest differs from the last one streamed, broadcast the source with its version token to every client, so the Source tab follows the agent's writes at tool-call granularity [[playbook-library-56](#playbook-library-56)].

## Verification

### Compile Coverage

#### playbook-library-17

Where a stub `slc` executable that emits a valid compiled playbook output is named as the configured compiler [[playbook-library-11](#playbook-library-11)], when the compile flow is driven end to end — source provided [[playbook-library-5](#playbook-library-5)], role names entered, registry form submitted [[playbook-library-7](#playbook-library-7)] — the test suite shall assert that the stub ran as an external process in the per-id library directory [[playbook-library-12](#playbook-library-12)], that a registry manifest was emitted whose entry passes the fail-closed registry validation [[playbook-library-15](#playbook-library-15)], that the shared config gained a `playbooks.<id>` entry whose `from` resolves to that manifest [[playbook-library-14](#playbook-library-14)] and whose role bindings are keyed by the entry's derived role ids however the submission cased them [[playbook-library-32](#playbook-library-32)], that the Library lists the new playbook [[playbook-library-10](#playbook-library-10)], and that the stub ran with the Captain's block as `SLC_AGENT` and `SLC_MODEL` [[playbook-library-42](#playbook-library-42)].

#### playbook-library-18

Where the app's own `slc` is missing from the module trees the test names, its playbook engine disagrees with the app's, or every Node.js candidate fails the version floor [[playbook-library-11](#playbook-library-11)], the test suite shall assert that the compile flow is reported unavailable with guidance naming the missing prerequisite — the restore command, both engines, or the version found [[playbook-library-8](#playbook-library-8)] — and that no compiler process is spawned.

#### playbook-library-19

Where a stub `slc` fails at a known pipeline phase with error output, when a compile is run, the test suite shall assert that the failing phase is identified, that the phase's captured output is surfaced [[playbook-library-9](#playbook-library-9)], that no config write occurs, and that previously compiled outputs for the same playbook id remain unchanged [[playbook-library-12](#playbook-library-12)].

#### playbook-library-79

Where the core runs from a checkout whose app shells declare `@sublang/slc`, when the test suite resolves the toolchain with neither `SPEX_SLC` nor `SPEX_NODE` set, the test suite shall assert that the compiler is the checkout's own copy, run on the Node.js chosen when one meets the floor [[playbook-library-11](#playbook-library-11)], and that from that copy's own `@sublang/cligent` the Claude agent SDK the shells declare loads — the import a compiler installed globally or through `npx` fails on a fresh machine [[playbook-library-11](#playbook-library-11)].

#### playbook-library-80

Where the desktop's Electron binary is at hand, when the test suite resolves the toolchain with that binary handed as the app's own runtime with the desktop's module directories, the test suite shall assert that it answers the probe as Node at or above the floor with `ELECTRON_RUN_AS_NODE=1` and that the compiler resolved is the app's copy from those directories [[playbook-library-83](#playbook-library-83)] [[playbook-library-11](#playbook-library-11)], that the supplied compiler's `--version` runs on it, and that a probe in the compiler's place sees that Node with the variable gone [[playbook-library-11](#playbook-library-11)].

#### playbook-library-81

When the test suite compiles through a stub `slc` named as the configured compiler, the test suite shall assert the compile's agent per case [[playbook-library-42](#playbook-library-42)]: a block naming `codex` at effort `medium` in an environment setting no `SLC_*` variable reaches the stub as `SLC_AGENT=codex` and `SLC_EFFORT=medium` with neither `SLC_MODEL` nor `SLC_FAST_MODE`, the stall budget beside them and a progress line naming the agent from the block ahead of the compiler; with `SLC_AGENT` set in the environment nothing of the block reaches the stub and the line names the environment; a block naming `kimi` is refused before the stub runs, the guidance naming the adapters `slc` drives; and a block's fast mode reaches the stub as its literal.

#### playbook-library-82

When the test suite resolves the toolchain through a probe answering each command with its own version, the test suite shall assert the order of [[playbook-library-11](#playbook-library-11)]: an Electron runtime meeting the floor is chosen, probed with `ELECTRON_RUN_AS_NODE=1` in the caller's environment, and runs the compiler behind the preload ahead of any `PATH` Node, an own runtime below the floor yields to a `PATH` Node meeting it with both probed in that order, and a configured `SPEX_NODE` is the only candidate probed; and that a compile on the Electron runtime spawns the copy's CLI behind the preload with `ELECTRON_RUN_AS_NODE=1` beside the caller's environment [[playbook-library-12](#playbook-library-12)] [[playbook-library-83](#playbook-library-83)] while a compiler `SPEX_SLC` names runs without it [[playbook-library-11](#playbook-library-11)].

### Registration and Config Coverage

#### playbook-library-20

When the registry form [[playbook-library-7](#playbook-library-7)] is submitted with an entry violating a fail-closed rule, covering at least a command duplicating an existing playbook's and an id failing the `^[a-z][a-z0-9_-]*$` character rule ([DR-004](../decisions/004-config-and-persistence.md)), the test suite shall assert that each submission is rejected naming the violated rule [[playbook-library-15](#playbook-library-15)] and that the shared config file bytes are unchanged.

#### playbook-library-21

Where the shared config file contains comments and entries unrelated to the toggled playbook, when a playbook is disabled and then re-enabled [[playbook-library-3](#playbook-library-3)], the test suite shall assert after each write that comments and unrelated entries are byte-identical to the original [[playbook-library-16](#playbook-library-16)] and that the list reflects the new state, and after the round trip that the playbook's entry is enabled again.

#### playbook-library-25

Where a playbook was compiled into the library directory, when its artifacts are requested over the protocol, the test suite shall assert the response carries the source markdown, the gears markdown, the FSM code [[playbook-library-22](#playbook-library-22)], the derived state ids, and that gears markdown parsed into items in document order, each with its first line, body, and citations [[playbook-library-24](#playbook-library-24)]:

- A stage file removed: the test suite asserts the response names the missing stage while still serving the others [[playbook-library-24](#playbook-library-24)].
- Gears the parser reads no item from: the test suite asserts the markdown still serves, with no parsed items beside it [[playbook-library-24](#playbook-library-24)].

#### playbook-library-44

When each installed built-in playbook's artifacts are requested, the test suite shall assert that built-in's shipped gears file is served parsed [[playbook-library-24](#playbook-library-24)]: at least one item, every item carrying an ID of the authored casing, a non-empty first line, and a body, with the markdown the rows fall back to still served beside them.

#### playbook-library-37

When each installed built-in playbook's artifacts are requested, the test suite shall assert the served graph is whole [[playbook-library-36](#playbook-library-36)]: every edge's ends name served nodes, the edge set is non-empty for every built-in, declared-id targets resolve — the review machine's opening transition and a boss-reply resume transition among the resolved — and a compound state's done transition appears as an edge.

### Binding Coverage

#### playbook-library-39

Where a configured playbook binds two roles, one to a player another playbook also names, the test suite shall assert the Library prints each role's bound player with what that binding effectively runs [[playbook-library-1](#playbook-library-1)], marks the shared role and names the other position holding it [[playbook-library-38](#playbook-library-38)], and leaves the unshared role unmarked; and that rebinding through the editor offers exactly the config's roster, writes the chosen player with pinned effort and inherit/on/off fast mode while preserving untouched tuning and comments, checks effective inherited tuning against known model support, keeps a cleared pin in pin mode with an inline error and no write, and surfaces a refusal inline while keeping the editor open [[playbook-library-4](#playbook-library-4)]; and that the editor opens with focus inside and closes on Escape, on an outside click, and on Cancel with focus back on the role's control [[playbook-library-4](#playbook-library-4)].

#### playbook-library-40

When a built-in whose roles the roster does not cover is added, the test suite shall assert the missing player is written to the roster first, carrying the block chosen for its role, and only then the playbook entry binding that role to it [[playbook-library-34](#playbook-library-34)].

#### playbook-library-49

Where the shared config lists `dev` without `branch` or `pr`, the test suite shall assert that the `dev` card carries the pull-request delivery hint naming each missing built-in, and that a config listing all three renders no hint [[playbook-library-48](#playbook-library-48)].

### Cancellation and Gate Coverage

#### playbook-library-45

Where a configured playbook's artifacts carry a parsed Gears stage of two items, one citing the other, when the Gears stage is opened, the test suite shall assert the card draws the outline's rows [[playbook-library-22](#playbook-library-22)]: each row collapsed on its ID, group, and first line with no edit control, a pressed row rendering its body, a settled hover on the citation previewing the cited item and its jump dismissing that preview, the citation landing on the cited row expanded and highlighted without leaving the card, and — where the parse is absent — the gears markdown rendered instead.

#### playbook-library-30

While a compile driven through the app store is running, the test suite shall assert that a cancel control is rendered beside the compile progress output, that activating it issues the compile abort command for the running playbook id [[playbook-library-27](#playbook-library-27)], that the recorded cancellation appears in the progress log, and that the compile start control stays disabled until the compile settles.

#### playbook-library-31

Where the shared config state is missing or invalid, the test suite shall assert that the Library renders the config gate — the Captain-scope explanation and the fix-it-in-Settings direction [[playbook-library-28](#playbook-library-28)] — with "Settings" as an activatable navigation control when a navigation callback is supplied and as plain text when it is not, and that no playbook list or compile form is rendered.

### Authoring Coverage

#### playbook-library-72

Where the core runs with the scripted fake adapter — its first reply writing a `Roles:`-led `<id>.md` into its working directory and ending in a compile block, its next reply a register block — and a stub `slc` named as the configured compiler emitting a two-role entry, when a draft is created and one message sent over the protocol, the test suite shall assert that the fake ran with the draft directory as `cwd`, `{ mode: "auto" }` as its permissions, no tool lists, and no resume [[playbook-library-64](#playbook-library-64)]; that the prompt carried the source path, the four document paths, and both directive kinds [[playbook-library-65](#playbook-library-65)]; that the records streamed as `author` player records and a Boss turn [[playbook-library-64](#playbook-library-64)]; that the source broadcast after the write [[playbook-library-71](#playbook-library-71)]; that a compile started without a further command, its progress lines streamed, and no config write occurred [[playbook-library-66](#playbook-library-66)] [[playbook-library-67](#playbook-library-67)]; that the stub `slc` ran with the draft's answering agent as `SLC_AGENT` and `SLC_MODEL` [[playbook-library-42](#playbook-library-42)]; that the success turn's prompt named the roles and the proposal landed with the block's fields [[playbook-library-68](#playbook-library-68)] [[playbook-library-66](#playbook-library-66)]; and that `draft.register` wrote the new player first, then `playbooks.<id>` keyed by the derived roles with the confirmed command and intent in the wrapper, after which the draft is gone from the list and the playbook is configured [[playbook-library-69](#playbook-library-69)] [[playbook-library-70](#playbook-library-70)].

#### playbook-library-73

Where the stub `slc` fails at `gears2fsm` on its first two runs and exits 2 with a `SLC_CLARIFICATION:` report on the third, and the fake replies with a compile block on every relay, when a draft compile is started, the test suite shall assert that each failure recorded the phase and output [[playbook-library-67](#playbook-library-67)]; that a relay turn followed each of the first two with the phase, elapsed time, and output tail in its prompt, and the third carried the questions with reasons and choices [[playbook-library-65](#playbook-library-65)] [[playbook-library-68](#playbook-library-68)]; that after the third failure no turn started and the draft's state says so [[playbook-library-68](#playbook-library-68)]; that a Boss message reset the count and the next failure relayed again [[playbook-library-68](#playbook-library-68)]; that a `draft.send` queued during a compile dispatched before any relay with the failure as its preface [[playbook-library-65](#playbook-library-65)]; and that no config write occurred throughout [[playbook-library-67](#playbook-library-67)].

#### playbook-library-74

Where the fake's run stays in flight until aborted and the compile spawner blocks until canceled, the test suite shall assert as an explicit matrix that `draft.send` during a turn and during a compile reply queued, `draft.compile` and `draft.delete` and `draft.register` during a turn reply `busy`, `draft.source.write` during a turn and a compile is refused, a second `draft.compile` during a compile replies `busy`, `draft.abort` ends the turn with an aborted record and leaves the queue standing, `compile.abort` cancels the draft compile with the canceled line last and no relay, and the queued message dispatched once the draft was idle [[playbook-library-64](#playbook-library-64)] [[playbook-library-67](#playbook-library-67)] [[playbook-library-68](#playbook-library-68)] [[playbook-library-70](#playbook-library-70)].

#### playbook-library-75

Where a draft holds two turns and a compile was running, when the core is stopped and restarted and the draft reopened, the test suite shall assert that the records replay in sequence and the compile reads interrupted with no relay [[playbook-library-70](#playbook-library-70)]; that the next turn's prompt is a reseed carrying the conversation so far and no resume [[playbook-library-65](#playbook-library-65)] [[playbook-library-64](#playbook-library-64)]; that within one run the second turn passed the first's token as `resume` [[playbook-library-64](#playbook-library-64)]; that `draft.player.set` wrote `draft:<id>:player` to the preferences and the next run used that player's block with a reseed [[playbook-library-64](#playbook-library-64)] [[playbook-library-65](#playbook-library-65)]; that a draft whose transcript is damaged opens after a restart with its source and a diagnostic in place of its records and refuses a message [[playbook-library-70](#playbook-library-70)]; and that `draft.delete` removed the record, the preference, and the directory [[playbook-library-70](#playbook-library-70)].

#### playbook-library-76

Where the fake's reply carries, as an explicit case matrix, a block inside a fenced example, two register blocks, a block with an unknown key, a block that fails to parse, and a register block naming a role the entry lacks, the test suite shall assert that only the second register block became the proposal, the nested block acted as nothing, the malformed blocks were recorded malformed and named at the head of the next prompt, and the unknown role stood as a mismatch beside the derived roles [[playbook-library-66](#playbook-library-66)] [[playbook-library-65](#playbook-library-65)].

### Browser Journeys

#### playbook-library-41

Where the browser journey harness ([DR-039](../decisions/039-browser-acceptance-journeys.md)) boots the served shell on the demo config, when the journey works the Playbooks surface through the page, the test suite shall assert:

- every configured playbook lists with its command, intent, and role bindings [[playbook-library-1](#playbook-library-1)];
- the built-ins absent from the config list beside them, and enabling one writes it to the config and lists it among the configured playbooks, after which the Captain home's slash menu offers its command [[playbook-library-34](#playbook-library-34)];
- a playbook's stage row opens the stage pressed, swaps to another pressed beside it, and closes on a second press of the open one [[playbook-library-22](#playbook-library-22)];
- the Gears stage stands as item rows carrying the artifact's own IDs, one of which expands to its body [[playbook-library-22](#playbook-library-22)];
- the State machine stage's state list stays in view with its box scrolled to the bottom [[playbook-library-22](#playbook-library-22)];
- the open stage's box carries a grip that names the stage, and a drag of it leaves the box taller with the height still standing after a reload [[playbook-library-22](#playbook-library-22)];
- removing a configured playbook asks for the inline confirm — Remove or Keep [[playbook-library-26](#playbook-library-26)] — then leaves the config without it [[playbook-library-16](#playbook-library-16)];
- a role's binding editor opened at the 320-pixel viewport floor stands wholly inside the surface's box both on opening and after discovery followed by pinning a custom model, with the surface scrolling in neither direction [[playbook-library-43](#playbook-library-43)].

#### playbook-library-47

When the integration suite copies a registered library to a differently located Spex root, it shall verify config-relative module and artifact resolution, retained sources and successful local rebuilding or an explicit unavailable result [[playbook-library-46](#playbook-library-46)].

#### playbook-library-77

Where the browser journey harness ([DR-039](../decisions/039-browser-acceptance-journeys.md)) boots the served shell with the authoring fake script and the stub `slc` named as the configured compiler, when the journey works a new playbook through the page, the test suite shall assert:

- "New playbook" asks for the id inline, refuses `Triage` naming the rule, and opens `triage` as the workspace with the divider, the tab strip, the two openers, and a Drafts row on returning [[playbook-library-51](#playbook-library-51)] [[playbook-library-52](#playbook-library-52)] [[playbook-library-84](#playbook-library-84)] [[playbook-library-50](#playbook-library-50)];
- "Try the example" places the demo's prose in the composer and sends nothing; "Use a SKILL.md…" with no file pick on the page opens the Source tab's paste mode with its text focused and places the adapt sentence, and with a page-supplied pick on a draft with no source writes the picked file as the source, shown in the Source tab, with the adapt sentence placed [[playbook-library-84](#playbook-library-84)];
- a sent message stands as a Boss bubble, the agent's write as a tool card, its compile block as the "Asked to compile" card, and the Source tab shows the written markdown before the turn ends [[playbook-library-53](#playbook-library-53)] [[playbook-library-56](#playbook-library-56)];
- the band lists the phases in human words with the running one's output age, "asked by the agent", and Cancel [[playbook-library-57](#playbook-library-57)];
- a failing stub leaves a red phase with its output open, a "sent to the agent" system line, and the compiled tabs still disabled, then a second compile turns the chip "Compiled" with Gears rows and the Machine state list [[playbook-library-58](#playbook-library-58)] [[playbook-library-60](#playbook-library-60)];
- a message sent during the compile queues with "Send next" and dispatches afterwards [[playbook-library-54](#playbook-library-54)];
- Edit, Save, and a forced conflict behave as specified, and Paste's "Use as source" writes the file [[playbook-library-56](#playbook-library-56)];
- the Register tab opens prefilled from the proposal and Register lists `/triage` as configured with the Drafts section gone [[playbook-library-61](#playbook-library-61)];
- the agent picker offers "Captain" and each roster player, and a switch survives a reload with its system line [[playbook-library-55](#playbook-library-55)];
- a reload restores the transcript, the source, and the compiled tabs [[playbook-library-62](#playbook-library-62)];
- a draft seeded with a compile still marked running when the shell booted opens with the chip "Interrupted", the band's interrupted line, Compile enabled, and no relay line in the thread [[playbook-library-59](#playbook-library-59)];
- Delete asks Delete or Keep and removes the row [[playbook-library-63](#playbook-library-63)];
- the example card's Prefill opens the demo's draft workspace in the Source tab's paste mode with the normalized text placed and nothing written or compiled [[playbook-library-35](#playbook-library-35)];
- at the 320-pixel viewport with the rail collapsed the panes stack under a horizontal grip with the chip in view, every control keeps its accessible name, and the page scrolls in neither direction [[playbook-library-52](#playbook-library-52)].

#### playbook-library-78

Where the live journey lane is opted in ([DR-039](../decisions/039-browser-acceptance-journeys.md)) with the machine's real sign-in and the released `slc`, when the journey asks for "a two-role changelog playbook: Coder drafts release notes from the commits since the last tag and commits them; Reviewer checks them against the commits" and follows the agent's compile request and registration proposal, the test suite shall assert that a source declaring Coder and Reviewer was written [[playbook-library-56](#playbook-library-56)], that the agent's compile ran to Link [[playbook-library-57](#playbook-library-57)], that the derived roles are those two [[playbook-library-60](#playbook-library-60)], that `/changelog` was registered with a player per role [[playbook-library-61](#playbook-library-61)], and that a new session's slash menu offers it.
