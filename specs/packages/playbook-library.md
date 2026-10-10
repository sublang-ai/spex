<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# playbook-library: Playbooks

## Intent

This spec covers the Spex Playbooks surface across its user-visible behavior, the implementation behind it, and the integration coverage that verifies it: a view over the environments of the current project and your own group — the spec packages each installs and the playbooks they make available — enabling a playbook by naming a player for each role, mapping playbook roles to player agents, and authoring new playbooks as spec packages under development in a chat-assisted workspace that compiles them in the working folder, requests them from the project's environment and enables them, backed by an authoring conversation runner, an authoring session store, compile execution, registry generation and config writes ([DR-104](../decisions/104-spec-package-format-and-client-environments.md)).
Playbook entries live in the config files of the spex repositories a session runs with — your own group's and the project's — which remain the source of truth under their fail-closed validation rules; a playbook's module comes from an environment's lock and never from a path in a shared file; compilation runs the app's own copy of the external `slc` toolchain, on the app's runtime or a Node.js meeting the compiler's floor, with its compiled outputs beside the playbook's text.
Verification requires integration coverage of the surface's compile, request, enable and config write paths, where correctness spans the external `slc` process, generated registry artifacts, the environments and the config files.

## External Behavior

### Playbook List

#### playbook-library-1

When the Playbooks surface is opened, the Playbooks surface shall list every playbook the environments of the current project and your own group export [[environments-8](environments.md#environments-8)], showing for each its id, command, intent, the spec package and version it comes from with its source, each required role with the session player bound to it and what that binding effectively runs, and where it is enabled — in the project's config, in your own group's, or in neither ([DR-032](../decisions/032-session-players.md), [DR-104](../decisions/104-spec-package-format-and-client-environments.md)):

- a playbook both environments export is listed once per environment, each row naming its origin;
- the list stands under a switch between the current project and your own group, each side showing that spex repository's environment and config; with no project chosen, your own group's alone stands.

#### playbook-library-2

Where a configured playbook entry fails the fail-closed config validation ([DR-004](../decisions/004-config-and-persistence.md)) — an unresolved required role, a duplicate command, a playbook no environment of the session exports [[environments-9](environments.md#environments-9)] — the Playbooks surface shall list the entry marked invalid with the specific validation failure, rather than hiding it.

#### playbook-library-92

While a spex repository's side of the Playbooks surface is shown, the surface shall present its environment above the playbooks [[environments-14](environments.md#environments-14)] — each requested spec package with its source and resolved version, each required spec package under the one that required it, every selected artifact with its language and a fallback mark, whether its files are installed, a path source missing on this device, the lock's staleness and the conflict report — with these controls ([DR-104](../decisions/104-spec-package-format-and-client-environments.md)):

| Control | Act |
| --- | --- |
| Add from registry | a search field over the registry, each result with its versions, Add requesting the chosen version at a caret [[environments-15](environments.md#environments-15)] |
| Add from folder, Add from Git | a request by path inside the working folder, or by repository and rev, through the same command |
| Resolve again | `environment.resolve`, offered while the lock is stale or a conflict stands |
| Install | `environment.install`, offered while files are missing |
| Remove | removes a direct request behind an inline confirm reading "Remove" and "Keep" |

- a change the core refuses shows its cause in place; a sync of that spex repository, or a resolve or install the core runs, disables no control, the core's own work reading in place as progress ([DR-111](../decisions/111-the-core-coordinates-as-git-does.md));
- a stale lock reads "Requests changed; resolve again to install" and the last installed files stay in use.

### Enable and Disable

#### playbook-library-3

When the user enables a playbook on a spex repository's side, or disables one, the Playbooks surface shall write that spex repository's config: enabling writes the `playbooks.<id>` entry with a player per required role, and disabling removes the entry, modifying no other entry and reflecting the new state in the list ([DR-104](../decisions/104-spec-package-format-and-client-environments.md)):

- a project's entry names players by name alone; your own group's entry may carry each role's tuning [[playbook-library-4](#playbook-library-4)];
- a player the project's entry names and your own group's roster lacks is written to your own roster first, carrying the block chosen for that role, so no binding is written dangling.

### Role Binding

#### playbook-library-4

When the user edits a role's binding, the Playbooks surface shall write which session player answers that role and, for an entry in your own group's config, that role's own model, subagent model, effort, subagent effort, and fast mode ([DR-032](../decisions/032-session-players.md), [DR-093](../decisions/093-a-players-subagent-model.md), [DR-095](../decisions/095-a-subagents-effort-and-the-agents-own-model.md)), and shall reject an edit the config write path refuses, naming the affected role:

- The players offered are your own group's roster [[settings-26](settings.md#settings-26)]; the editor mints none and offers no adapter or permissions, which belong to the player's envelope.
- For an entry in a project's config the editor offers the player alone and says in one phrase that tuning is personal and lives in your settings ([DR-103](../decisions/103-the-home-and-its-groups.md)).
- Model, effort and subagent effort are inherit-the-player, the provider's current default, or a pinned value, written as omission, `false`, and the value respectively, the subagent effort's provider default reading "Agent chooses"; the subagent model is inherit-the-player or a pinned value, with `false` offered as "Off" only while it stands [[settings-34](settings.md#settings-34)] ([DR-095](../decisions/095-a-subagents-effort-and-the-agents-own-model.md)).
- Each inherit choice names the player's value: a model by the display rule [[settings-38](settings.md#settings-38)], one the player leaves unset as the provider's default ([DR-091](../decisions/091-models-named-by-the-runtime.md)), an unset subagent model as "Same as agent" [[settings-38](settings.md#settings-38)], an unset effort by the "Provider default" words, and an unset subagent effort as "Agent chooses" ([DR-095](../decisions/095-a-subagents-effort-and-the-agents-own-model.md)); pinned values use the player's runtime model, effort and subagent-effort choices [[settings-34](settings.md#settings-34)], a model or subagent model through the model field [[settings-39](settings.md#settings-39)].
- Clearing a pinned value keeps it pinned and shows a validation message; only an explicit mode change selects inheritance or provider default.
- Fast mode is inherit, on, or off for adapters accepting fast-mode requests, and the subagent model and the subagent effort are offered where the lane's adapter serves a subagent model or a value stands ([DR-093](../decisions/093-a-players-subagent-model.md), [DR-095](../decisions/095-a-subagents-effort-and-the-agents-own-model.md)); an unsupported adapter permits only clearing an existing override.
- The model and the effort stand on one row and the subagent model and the subagent effort on the next, each pair stacking into one column where the editor's content box is narrower than 320 pixels, as it is at the 320-pixel viewport floor ([DR-095](../decisions/095-a-subagents-effort-and-the-agents-own-model.md), [DR-041](../decisions/041-chrome-that-fits.md)).
- Saving preserves omitted tuning fields and clears only explicit resets.
- Known model support is checked against effective tuning, including inherited effort and fast mode, with only Cligent's unreported adapter choices supplementing known efforts; unsupported values require explicit correction [[settings-34](settings.md#settings-34)].
- Choosing a player another binding already names states which bindings those are, because equal ids deliberately share one conversation.
- The editor is a popover anchored at the role's control, following the house popover idiom ([DR-010](../decisions/010-interface-craft.md) §6): focus enters it on open and returns to the control on close, and Escape, an outside click, and Cancel close it.

#### playbook-library-43

While the role-binding editor [[playbook-library-4](#playbook-library-4)] stands open, the Playbooks surface shall keep it inside the box that must show it — the surface's own scroll box — at every width down to the 320-pixel floor, refitting whenever the window or the editor's own box resizes ([DR-041](../decisions/041-chrome-that-fits.md)):

- that box bounds the editor's width, and a control late in a wrapping roles row moves the editor along the box's edge rather than past it, so a form surface never scrolls sideways to reach it.

#### playbook-library-38

Where a role's bound player is named by more than one binding, the Playbooks surface shall mark that role's binding as shared and name the other positions holding the lane ([DR-032](../decisions/032-session-players.md)), so a shared conversation is never mistaken for two separate ones.

### Compile Flow

#### playbook-library-5

When the Boss opens the Source tab's paste mode [[playbook-library-56](#playbook-library-56)], the Playbooks surface shall accept the playbook source as either a picked markdown file or in-app markdown text and write it as the playbook artifact's `<id>.md` in the spec package under development [[environments-10](environments.md#environments-10)]:

- An empty text and no file is refused before anything is written.

#### playbook-library-6

While a compile is running, the Playbooks surface shall display each phase of the compile pipeline ([DR-005](../decisions/005-compilation-integration.md)) with its name and live status — running, succeeded, or failed — updating as phases complete.

#### playbook-library-7

When an authoring session's compile succeeds, the Playbooks surface shall present the Enable tab [[playbook-library-61](#playbook-library-61)] as the form with fields for command and intent, a player per derived role, and the spex repository to enable it in — the project by default, or your own group where its working folder holds the package, since a path request lives inside the requesting repository's working folder [[environments-2](environments.md#environments-2)] — prefilled where derivable from the playbook source and compiled output, and shall resolve each submission of the form by the cases below:

- Submission passes registry validation [[playbook-library-15](#playbook-library-15)]: the surface packages the entry [[playbook-library-14](#playbook-library-14)], requests the spec package by path from the chosen spex repository's environment where it is not yet requested [[environments-15](environments.md#environments-15)], and enables the playbook by writing its entry — including a role binding per required role [[playbook-library-4](#playbook-library-4)], with any player the submission names but the roster lacks written first — into that config's `playbooks` map.
- Submission rejected by registry validation or by the config's fail-closed rules for the whole enabling [[playbook-library-15](#playbook-library-15)]: the rejection names the violated rule and causes no config or environment write.
- Submission refused after some of its writes [[playbook-library-69](#playbook-library-69)]: the refusal names the writes made, which stand.

#### playbook-library-8

Where the compile toolchain cannot be resolved — the app's own `slc` missing, or no runtime meeting the version floor [[playbook-library-11](#playbook-library-11)] — the Playbooks surface shall mark the compile flow unavailable, shall show guidance naming each missing prerequisite and how to restore or configure it, and shall not start a compile.

#### playbook-library-83

When a shell starts the core naming a compile runtime — its own executable, whether that is Electron, and the module directories holding the compiler it declares — the Playbooks surface shall compile on that runtime with the compiler found there [[playbook-library-11](#playbook-library-11)], so the shell that declares the compiler names where it lives ([DR-081](../decisions/081-the-app-supplies-the-compiler.md)).

#### playbook-library-9

While a compile is running, when a pipeline phase fails, the Playbooks surface shall mark that phase failed, shall surface that phase's captured output, shall write nothing to any config or environment, and shall allow the user to retry the compile after editing the source.

#### playbook-library-10

When a compiled playbook is enabled, the Playbooks surface shall list it with its entry fields, its spec package and enabled state, and shall indicate that project sessions started before enabling must be restarted before the playbook is available in them.

### Authoring Workspace

#### playbook-library-50

When the Playbooks surface is opened with a project chosen, the surface shall list every authoring session of that project [[playbook-library-70](#playbook-library-70)] in an "Authoring" section between the playbooks and the environment's controls, each row carrying the playbook id, its state chip, the age of its last activity, and an "Open" control ([DR-058](../decisions/058-chat-assisted-playbook-authoring.md)):

- the chip reads "No source", "Draft", "Compiling", "Failed", "Interrupted", "Compiled", "Changed", or "Enabled" — the failed phase and the compile's age in its title, never in the chip ([DR-041](../decisions/041-chrome-that-fits.md) §9);
- a session whose spec package folder is gone from the working folder reads "Source missing" and offers only Delete;
- a session compiling in the background keeps its row live, and opening it shows the running phases;
- the section is absent while there is no authoring session, and the playbook list's empty state then points at enabling a built-in or "New playbook".

#### playbook-library-51

When the user activates "New playbook" — at the Authoring section's foot, or from the Captain home's slash menu ([DR-009](../decisions/009-at-hand-interaction.md)) — the Playbooks surface shall ask for the playbook id in an inline field captioned "Lowercase; it names the spec package, the file and the /command — the command can change when you enable it", create the authoring session and its spec package under development [[playbook-library-70](#playbook-library-70)] on Enter, and open its workspace [[playbook-library-52](#playbook-library-52)]:

- an id outside the Agent Skills name rule — `^[a-z0-9]+(-[a-z0-9]+)*$`, at most 64 characters — or one a playbook of the project's or your own group's environment holds, is refused in place naming the rule, and nothing is created;
- an id naming an existing authoring session opens that session;
- an existing spec package folder at `spex-packages/<id>/` in the working folder with no authoring session becomes the new session's package, so a folder brought in by Git can be worked on.

#### playbook-library-52

When an authoring session is opened, the Playbooks surface shall replace the playbook list with the authoring workspace: a header carrying a "Playbooks" control that returns to the list without ending anything, the playbook's id with its spec package's name, and its state chip [[playbook-library-50](#playbook-library-50)]; the conversation pane on the left [[playbook-library-53](#playbook-library-53)]; and on the right a pane whose tab strip reads Source / Gears / Machine / Enable with the Compile control at the strip's right end [[playbook-library-57](#playbook-library-57)] ([DR-058](../decisions/058-chat-assisted-playbook-authoring.md)):

- the panes stand side by side with the house divider between them from the `@2xl` container step ([DR-030](../decisions/030-workspace-chrome.md)) and stack — conversation above, artifacts below — beneath it, the divider then turning into the horizontal grip between the two boxes ([DR-041](../decisions/041-chrome-that-fits.md) §9); each pane scrolls inside its own box and the page scrolls in neither direction;
- the side-by-side split and the stacked split are app preferences remembered across launches;
- the tab strip wraps, and below `@xs` its tabs collapse to icon plus tooltip with their accessible names unchanged; every control in the header, the tab strip, the compile band, and the composer's action row reads at most 14 characters, its busy form included;
- the workspace stays open in the core while the list is shown, so returning loses nothing.

#### playbook-library-53

While an authoring session's workspace is open, the conversation pane shall render its transcript in record order — the Boss's messages as Boss bubbles, the system's lines as ◇ system lines [[run-view-1](run-view.md#run-view-1)], the agent's text as streaming Markdown [[run-view-3](run-view.md#run-view-3)], its tool calls as collapsed cards labeled with the tool and its subject [[run-view-4](run-view.md#run-view-4)], its thinking collapsed, and its failures as failure lines — and shall render a directive block in the agent's reply as a card, never as fence text:

- input attachments and native output media use the trusted record-driven conversation presentation [[run-view-160](run-view.md#run-view-160)];
- the cards read "Asked to compile" and "Proposed enabling", the latter listing command, intent, and role → player with "Open Enable";
- a malformed directive stays visible as code with a "Spex could not read this block" caption;
- while a turn runs the pane's header shows the running mark and "working · ⟨elapsed⟩" ticking each second ([DR-010](../decisions/010-interface-craft.md) §5);
- the pane sticks to its bottom with the jump pill, and mounts only the entries near the viewport.

#### playbook-library-54

While an authoring session's workspace is open, the composer beneath the conversation — of the house shape [[run-view-106](run-view.md#run-view-106)] with the placeholder "Describe the playbook…" and the caption "Enter sends" — shall dispatch or queue each Boss submission by the session's published state [[core-service-96](core-service.md#core-service-96)]:

- while the session is idle a submission dispatches, the primary reading "Send";
- while a turn or a compile runs a submission queues with the queued indicator, the primary reading "Send next" and the placeholder "Sends after the reply…" or "Sends after the compile…", and the queue dispatches in order when the session is idle [[playbook-library-68](#playbook-library-68)];
- "Abort" stands in the action row while a turn runs and ends it, leaving the transcript as far as it got; a canceled turn leaves the queue standing;
- a refused dispatch keeps the text with the refusal shown; the composer's draft and the queue survive leaving and reopening the workspace while the app runs.

#### playbook-library-84

While an authoring session's workspace is open with an empty transcript, the conversation pane shall show one caption above the composer [[playbook-library-54](#playbook-library-54)] — "Tell the agent what the playbook does, who does what, and when it is done" — with two openers, each an act whose outcome its label names, neither sending ([DR-082](../decisions/082-the-first-move-in-a-draft-is-an-act.md)):

| Opener | Act |
| --- | --- |
| "Use a SKILL.md…" | where the shell offers a file pick, runs it — a canceled pick changes nothing; a session with no source takes the picked file as its source [[playbook-library-5](#playbook-library-5)], and one with a source gets the path placed in the Source tab's paste mode [[playbook-library-56](#playbook-library-56)] for "Use as source" to confirm — else opens the paste mode; in every case places "Adapt this file into a playbook: keep what it does, name who does what, and say when it is done" in the field, focus landing on the paste text where that mode opened and on the field otherwise |
| "Try the example" | places the example's six-line source prose [[playbook-library-35](#playbook-library-35)] in the field and focuses it |

- a write the core refuses keeps the field's text and shows the refusal above the composer [[playbook-library-54](#playbook-library-54)].

#### playbook-library-55

While an authoring session's workspace is open, the conversation pane's header shall name the agent that answers as an agent chip — "Captain" with the Captain's block [[settings-1](settings.md#settings-1)] by default, else the chosen roster player's id with its block [[settings-26](settings.md#settings-26)] — wearing that adapter's readiness [[core-service-9](core-service.md#core-service-9)], the chip opening a picker of "Captain" and every roster player whose choice is stored as the preference `authoring:<instance>:player` [[storage-5](storage.md#storage-5)] ([DR-058](../decisions/058-chat-assisted-playbook-authoring.md)):

- the picker follows the house popover idiom ([DR-010](../decisions/010-interface-craft.md) §6);
- a roster player no role binds is offered too [[settings-26](settings.md#settings-26)], its chip reading unknown readiness, since only the Captain's and the bound lanes' adapters are probed [[core-service-9](core-service.md#core-service-9)];
- a not-ready agent disables Send with the unmet requirement in the caption;
- a switch applies to the next turn, which starts a fresh provider conversation from the transcript [[playbook-library-65](#playbook-library-65)], and a system line says so: "Now answering: dev.reviewer — the conversation so far was replayed to it".

#### playbook-library-56

While an authoring session's workspace is open, the Source tab shall render the playbook artifact's `<id>.md` as formatted markdown [[playbook-library-22](#playbook-library-22)] as it stands on disk — refreshed on every source message [[playbook-library-71](#playbook-library-71)], so text appears while the agent writes — captioned with its path in the working folder and who changed it last and when, and shall offer "Edit" and "Paste":

- with no source the tab says the agent writes `<id>.md` here as you talk and offers "Paste";
- "Edit" opens the whole file in the plain-text editor idiom — Cancel, Save, Edit/Preview [[spec-view-48](spec-view.md#spec-view-48)] — whose Save writes under the version token it read and treats a changed file as a conflict offering Reload or Overwrite [[spec-view-50](spec-view.md#spec-view-50)];
- "Paste" opens the paste mode — a text field, a "Pick file" control, "Use as source", Cancel [[playbook-library-5](#playbook-library-5)];
- Save and "Use as source" write whatever runs beside them — a turn whose agent may edit the same file, a compile — under the version token read, a file changed meanwhile being the conflict above;
- a source whose digest differs from the last successful compile's marks the chip "Changed" and captions Gears and Machine "from the compile before this change"; the tab wears a dot while the source changed since the last compile.

#### playbook-library-57

While an authoring session is idle and has a source, when the Boss activates Compile or the agent's reply carries a compile directive [[playbook-library-66](#playbook-library-66)], the Playbooks surface shall start the session's compile [[playbook-library-67](#playbook-library-67)] and show it in the band under the tab strip: a phase row, the age of the compiler's last line, a folded log, and Cancel [[playbook-library-27](#playbook-library-27)]:

- Compile is enabled with a source and a resolvable toolchain [[playbook-library-8](#playbook-library-8)] while no compile of the session runs, whatever turn runs beside it; disabled, its tooltip names the reason — "No source yet", "Compiling", or the toolchain guidance; it reads "Compiling…" while a compile runs;
- the phase row names the pipeline's phases in human words [[playbook-library-6](#playbook-library-6)] — Normalize, Spec items, Optimize, Prefix, Machine, Link, Package ([DR-088](../decisions/088-playbook-17-slc-0-12-cligent-0-27-adoption.md)) — the compiler's ids in the tooltips ([DR-010](../decisions/010-interface-craft.md) §2), each waiting, running with its elapsed time, done with its duration, or failed, and a phase the compiler names that the row lacks is appended;
- "last output ⟨age⟩ ago" ticks beside the running phase from the compiler's last line, heartbeat included, so a silent agent-driven phase reads as alive rather than stuck ([DR-010](../decisions/010-interface-craft.md) §5);
- the band's caption names who started it — "asked by you" or "asked by the agent" — and a system line in the thread says the same;
- the row wraps under `@md` and the band keeps the Source, Gears, and Machine tabs readable beneath it.

#### playbook-library-58

While an authoring session's compile is running, when a phase fails or the compiler asks for clarification [[playbook-library-9](#playbook-library-9)], the Playbooks surface shall mark that phase failed in the band with its captured output — or the questions with their reasons, evidence, and choices — opened beneath, set the chip "Failed", and show in the thread what the agent was told [[playbook-library-68](#playbook-library-68)]:

- the system line reads "Compile failed at ⟨phase⟩ — sent to the agent", or "Compile failed at ⟨phase⟩ — three in a row; tell the agent how to proceed" when the relay stopped, or "Compile failed at ⟨phase⟩ — waiting for your queued message" when a Boss message carries the output instead — ⟨phase⟩ in the row's human words [[playbook-library-57](#playbook-library-57)];
- the band's caption names the same disposition — sent to the agent, three in a row, waiting for the queued message — read from the compile record the session publishes [[playbook-library-70](#playbook-library-70)], never from the line's words;
- a compile the Boss canceled reads "Compile canceled" and sends nothing;
- a failure before the compiler ran — the toolchain — shows its guidance in the band and sends nothing;
- Gears and Machine keep the last successful compile's artifacts, captioned "from the last good compile".

#### playbook-library-59

When an authoring session's workspace is opened after the core stopped while its compile was running, the Playbooks surface shall show the chip "Interrupted", the band reading "Compile interrupted when Spex closed" with Compile enabled, and shall relay nothing to the agent, so a compile cut by a restart is restarted by a person ([DR-010](../decisions/010-interface-craft.md) §5).

#### playbook-library-60

When an authoring session's compile succeeds, the Playbooks surface shall set the chip "Compiled", fill the Gears tab as the outline's read-only item rows over the parsed gears and the Machine tab as the FSM code under its pinned state list, each in the stage box idiom [[playbook-library-22](#playbook-library-22)] over the session's artifacts [[playbook-library-24](#playbook-library-24)], enable the Enable tab with a dot, and append the system line "Compiled — roles: ⟨roles⟩":

- before a successful compile the Gears, Machine, and Enable tabs stand disabled with "Compiles first" in their tooltips;
- the derived roles are the compiled entry's, never the prose's;
- the dot on Enable stays until the tab is opened after the agent's proposal lands [[playbook-library-68](#playbook-library-68)].

#### playbook-library-61

While an authoring session's last compile succeeded, the Enable tab shall present the form [[playbook-library-7](#playbook-library-7)] — command, intent, one player per derived role, and the spex repository to enable in — prefilled in this precedence: the Boss's own edits, then the agent's latest proposal [[playbook-library-66](#playbook-library-66)], then derived defaults — and on "Enable" shall enable the playbook [[playbook-library-69](#playbook-library-69)] ([DR-058](../decisions/058-chat-assisted-playbook-authoring.md), [DR-104](../decisions/104-spec-package-format-and-client-environments.md)):

- the id is the session's and not editable; the command defaults to the id; the intent defaults to the source's first prose paragraph, or, where it has none, to its level-one title; the spex repository defaults to the project, your own group offered only where its working folder holds the package and refused with that phrase otherwise;
- a role's player row offers the roster [[settings-26](settings.md#settings-26)] and a new player carrying the session's agent block, editable through the agent editor as a built-in's is [[playbook-library-34](#playbook-library-34)]; its derived `dev.⟨role⟩` id lowercases the role and replaces runs outside ASCII letters, digits, `_` and `-` with `-`, retaining a suffix that starts with a letter, otherwise trimming boundary `-` and `_` and prefixing `role-` to what remains or using `role` when nothing remains, so Unicode and digit-leading roles yield valid segmented ids ([DR-032](../decisions/032-session-players.md)); a proposed new player or the Boss's selected new player retains its explicit id;
- a proposal's roles match the derived roles case-insensitively; a role whose normally derived, letter-leading own lane the roster already holds receives that lane as its default only when neither another role explicitly selects it nor an earlier role received that named default, while a fallback base names only a new-lane candidate; otherwise its default is its new option; assigning named defaults in compiled-role order remains independent of the Boss choosing a row's new option; automatic new players and offered new options take the first free `-2`, `-3`, … suffix against the roster, all explicit new selections and proposals, and earlier automatic allocations in that order, so defaults do not accidentally share a conversation and enabling never overwrites a player; explicit equal ids preserve the Boss's or proposal's intentional sharing, and a selected new id remains that row's offered new option;
- a proposal naming a role the entry lacks, or missing a derived role, is shown beside the form as a mismatch with the derived roles authoritative;
- Enable is disabled until every role has a player and command and intent are non-empty, and reads "Enabling…" while it writes, whatever turn or compile runs beside it;
- a refusal names the violated rule inline and leaves the form standing; success lists the playbook among the enabled [[playbook-library-10](#playbook-library-10)], the chip reads "Enabled", and the list opens with the new card in view; the authoring session stays, so the playbook can be worked on further and published [[playbook-library-93](#playbook-library-93)].

#### playbook-library-62

When an authoring session's workspace is opened — in the same run or after a restart — the Playbooks surface shall restore its transcript from the stored records, its source, its queue, its last compile's outcome with the phase output or questions, its compiled tabs where a successful compile is recorded, and its proposal [[playbook-library-70](#playbook-library-70)], so a failed compile is resumed where it stopped ([DR-058](../decisions/058-chat-assisted-playbook-authoring.md)):

- the next message continues the conversation as one thread to the Boss, whatever the provider's own continuity did [[playbook-library-65](#playbook-library-65)];
- each opening, each reconnect and each `draft.history-replaced` announcement reads the whole transcript [[core-service-96](core-service.md#core-service-96)], and a streamed record not following the thread's last reads it again, so a history replaced on disk replaces the thread while the composer's text, the Source tab's edits and the Enable form's edits stand;
- the compile band takes progress lines and sends Cancel naming the instance shown [[core-service-96](core-service.md#core-service-96)];
- a session whose state names another instance than the one shown is another session: what the page kept for the former goes, and a late message or reply naming the former changes nothing;
- a session whose transcript is unreadable opens with the source intact and a scoped diagnostic in place of the thread.

#### playbook-library-63

When the Boss activates an authoring session row's Delete, the Playbooks surface shall ask with the inline confirm — "Delete" and "Keep", the safe default focused [[playbook-library-26](#playbook-library-26)] — and on Delete remove the session: its record, transcript, assets and preference [[playbook-library-70](#playbook-library-70)], leaving the spec package folder in the working folder and saying so:

- Delete while the session's turn or compile runs removes the files all the same, that work going on and writing nothing into them;
- an enabled playbook keeps its entry and its request; deleting the session changes neither.

#### playbook-library-93

While an authoring session's last compile succeeded and the home is signed in, the Enable tab shall offer "Publish" beneath the form, which publishes the spec package under development to the registry as the signed-in account [[environments-10](environments.md#environments-10)] after showing, inline, the package's name, version and the files it will upload with Publish and Cancel ([DR-104](../decisions/104-spec-package-format-and-client-environments.md)):

- a refusal from the core's checks or the registry shows its issues in place; success reads the published version with a link to its page at the registry;
- a signed-out home shows "Sign in to publish" in place of the control.

### Pipeline Artifacts

#### playbook-library-22

While a playbook is listed, the Playbooks surface shall carry that playbook's compilation stages as a permanent row of toggles — Source (the workflow markdown the playbook was compiled from) → Gears (the GEARS spec items) → State machine (the compiled FSM) — whose pressed stage opens its artifact beneath the row:

- Pressing a closed stage opens it and closes the stage that was open, so one stage at a time stands open for that playbook; pressing the open stage closes it.
- The first open requests that playbook's artifacts [[playbook-library-24](#playbook-library-24)], which the card holds for its later opens; the open stage reads as loading until they arrive, and a failed request leaves its message in the open stage until a later press asks again.
- A markdown stage renders as formatted text; the State machine stage renders the FSM as code, with the derived state list standing outside the box as its pinned header, chips wrapping ([DR-041](../decisions/041-chrome-that-fits.md) §9), so the states hold their place at every scroll position and every height.
- The Gears stage stands instead as the outline's read-only item rows [[spec-view-3](spec-view.md#spec-view-3)] over the parse the playbook's artifacts carry [[playbook-library-24](#playbook-library-24)]: every row collapsed until pressed, an expanded row rendering the item's body, a citation of an item in the same artifact previewing it at hand [[spec-view-61](spec-view.md#spec-view-61)] and landing on that item within the box [[spec-view-6](spec-view.md#spec-view-6)], no control that edits, and the rendered markdown wherever that parse is absent.
- The open stage's artifact sits in a box that caps its height and scrolls, whose bottom edge carries the house's grip turned horizontal ([DR-030](../decisions/030-workspace-chrome.md)): dragged, or moved a step per arrow key while focused, it sets the box between 8rem and 48rem, a double-click restores the default 24rem, and the height is remembered for that playbook across launches, one height serving its stages.
- The grip stands only while the artifact runs past the box — a stage the box fits has nothing to page through, so the box takes the artifact's height and shows no edge to pull.

#### playbook-library-23

Where the artifacts a playbook served name a stage absent, the Playbooks surface shall render that stage struck out and inactive in the playbook's stage row [[playbook-library-22](#playbook-library-22)] — its tooltip saying the stage was not found beside that playbook's module — and shall name the absent stages inside the open stage, leaving every located stage open-able:

- Until a playbook's artifacts arrive, the row marks no stage absent.

### Pipeline Artifact Handling

#### playbook-library-24

When a client requests a playbook's artifacts, the core package shall resolve them from the playbook artifact's folder — the installed one under `packages/` [[environments-7](environments.md#environments-7)], or the path source's folder in the working folder — in the compiled layout (`<id>.md`, `<id>.playbook/<id>.gears.md`, `<id>.playbook/<id>.fsm.ts`), serving each stage's content, the Gears stage also parsed into the item shape the outline's rows read [[spec-view-3](spec-view.md#spec-view-3)] — carried only where that parse yields an item, so a stage the parser cannot read serves its markdown alone — the state ids derived from the FSM, and the machine graph [[playbook-library-36](#playbook-library-36)] over the protocol, and naming absent stages without failing the request.

#### playbook-library-36

When the core package derives a playbook's artifacts from its FSM, the core package shall serve the machine graph beside the state ids, derived from the machine's own config rather than its source text ([DR-028](../decisions/028-run-machine-view.md)):

- nodes carry the state id, its parent for a nested state, its kind (a final state named as such), the player role the state invokes when its meta names one, and its tags;
- edges carry a stable identity of owner state, event, branch index, and target index — guarded sibling branches staying distinct — with the event name as the label and an empty event naming the always transition;
- a target naming a state's declared id resolves to that state, wherever it sits in the tree — never assumed to be machine-id-prefixed ([DR-031](../decisions/031-machine-call-tree.md));
- a compound state's own done transition is an edge out of that state ([DR-031](../decisions/031-machine-call-tree.md));
- a machine-level transition, having no single source state, is no edge;
- the graph names its initial state;
- a machine that cannot be loaded serves a null graph, named among the absent stages without failing the request.

### Naming and Copy

#### playbook-library-26

The Playbooks surface shall be presented to the user as "Playbooks": the navigation entry and the surface's user-facing copy shall say "Playbooks", "playbook" and "spec package", reserving the word "environment" for the section heading over a spex repository's spec packages, and shall name actions by their outcome — a playbook is enabled or disabled, a spec package is added or removed behind a confirm whose choices read "Remove" and "Keep", an authoring session is deleted behind a confirm whose choices read "Delete" and "Keep", the creation control reads "New playbook" — never by the config or environment write behind them ([DR-010](../decisions/010-interface-craft.md) §2).

#### playbook-library-29

While a playbook is listed, the Playbooks surface shall label its spec package and version with a muted "from" prefix that stays visible outside any truncation — `from sublang/playbooks 17.4.1`, with the source's kind for a path or Git request — and shall expose the installed folder's full path in the entry's tooltip.

### Built-ins and Example

#### playbook-library-34

When the Playbooks surface is opened, the surface shall list each playbook of the built-in spec package [[environments-11](environments.md#environments-11)] enabled in neither config with its command, intent, required roles, and browsable source markdown, and shall offer an enable flow — one "Enable" action per playbook, acknowledging while it writes — that gives each role a player and enables the playbook in the chosen spex repository's config [[playbook-library-16](#playbook-library-16)]:

- The built-in spec package carries `code`, `review`, `decide`, `dev`, `branch`, `pr`, and `inspect`, omitting an entry only when the installed artifact cannot load its module.
- Browsing a built-in's source requires no config change.
- With no playbook enabled, the list says so and points at enabling a built-in below or authoring one.
- A role's proposed player id is `dev.<role>`, editable before it is written, because the id is the sharing decision ([DR-032](../decisions/032-session-players.md)).
- A proposed id your own group's roster lacks is written to the roster first, carrying the agent block chosen for that role, so no binding is written dangling.

#### playbook-library-48

While `dev` is listed as enabled and `branch` or `pr` is not, the Playbooks surface shall mark `dev`'s pull-request delivery unavailable on its card, naming each missing built-in ([DR-059](../decisions/059-issue-delivery-through-dev.md)):

- the mark reads as a hint beside the card's roles, not as an invalid entry [[playbook-library-2](#playbook-library-2)], because a plain `/dev` request still runs;
- the mark disappears once both are listed as enabled.

#### playbook-library-89

While the validated enabled playbook catalog [[core-service-2](core-service.md#core-service-2)] lists the built-in spec package's `code` or `decide`, and lists no enabled `review`, the Playbooks surface shall place an unavailable hint beside that entry's roles, naming its effective command and directing the user to enable `/review` below before running it:

- The hint leaves the config valid and enables no playbook or player.
- The hint disappears when the validated catalog includes `review`.
- A playbook of another spec package with the same `code` or `decide` id receives no hint; this rule covers the built-in entries, whose `requires` the environment installs together ([DR-104](../decisions/104-spec-package-format-and-client-environments.md)), not dependency analysis of custom modules.
- The runtime refuses the fresh engagement from Playbook 17.4.1 on, per [DR-102](../decisions/102-playbook-17-4-1-adoption.md).

#### playbook-library-35

When the Playbooks surface is opened, the surface shall present a two-agent workflow adapted from slc's demo as a read-only example ([DR-015](../decisions/015-reference-content.md)) in the same permanent stage row a playbook wears [[playbook-library-22](#playbook-library-22)], over four stages held in memory rather than requested — source, normalized text, gears, and state machine — and shall offer a prefill action that opens a new authoring session's workspace [[playbook-library-51](#playbook-library-51)] with the example's normalized text placed in the Source tab's paste mode [[playbook-library-56](#playbook-library-56)], without writing or compiling anything:

- the example's six-line source is slc's demo with the two limits the bundled compiler asked about settled — the first agent's judgments count per loop, its last one in a loop being the conclusion, and the 2nd loop's commit ends the workflow without another review — and its normalized text says the same in slc's normalized form ([DR-089](../decisions/089-every-fresh-user-scenario-walked-for-real.md));
- sources and gears served for display drop their leading maintainer comment headers;
- the prefill is offered only with a project chosen, since an authoring session lives in a project.

### Compile Cancellation

#### playbook-library-27

While a compile is running, the Playbooks surface shall render a secondary cancel control beside the streamed compile progress and shall keep the compile start control disabled for the whole time the compile runs:

- Activating the cancel control requests that the core abort the compile ([DR-010](../decisions/010-interface-craft.md) §5), with the cancellation recorded in the compile progress log.

### Config Gate

#### playbook-library-28

While your own group's config is missing or invalid, the Playbooks surface shall replace its content with a gate that (1) explains that the Captain can only run playbooks listed on this surface, (2) states that playbooks need a valid config and directs the user to fix it in Settings, and (3) renders "Settings" as a navigation control when the host app provides surface navigation, falling back to plain text otherwise.

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

When a compile is started for playbook id `<id>`, the compile runner shall run `slc` as an external child process in the playbook artifact's folder `<working folder>/<package path>/playbooks/<language>/<id>/` of the spec package under development [[environments-10](environments.md#environments-10)] — materializing in-app source text as a markdown file there, linking the app-bundled runtime contract ([DR-005](../decisions/005-compilation-integration.md)), and provisioning that folder's `node_modules` with links to the app's own `xstate` and `@sublang/playbook`, listed in the working folder's `.git/info/exclude`, which the compiler's machine check and the entry it emits resolve from there ([DR-081](../decisions/081-the-app-supplies-the-compiler.md)) — and shall capture the process output per pipeline phase, reporting phase transitions for progress [[playbook-library-6](#playbook-library-6)] and the failing phase's output on failure [[playbook-library-9](#playbook-library-9)]:

- The runner grants `slc` a stall budget of 2400 seconds through `SLC_STALL_TIMEOUT` unless the environment already sets that variable, because agent-driven phases stay silent longer than `slc`'s ten-minute default.
- The compiler runs on the Node.js the resolver chose [[playbook-library-11](#playbook-library-11)], with the variable that runtime needs beside the caller's environment — `ELECTRON_RUN_AS_NODE=1` for Electron's, dropped again by the compiler's preload before it starts — so the compiler runs as Node while the agents it spawns inherit no such variable.
- Compiled outputs of a previously successful compile for the same id are replaced only after the new compile succeeds.

#### playbook-library-42

When a compile is started, the compile runner shall hand `slc` the block the compile's agent is resolved from — the authoring session's answering agent [[playbook-library-64](#playbook-library-64)], the Captain's block for a compile from the one-shot command — as `SLC_AGENT` (`claude` as `claude-code`; `codex`, `gemini` and `opencode` as named), with `SLC_MODEL`, `SLC_EFFORT` and `SLC_FAST_MODE` where the block sets them and `--config` naming an empty configuration the core ships, so nothing `slc` would discover fills what the block leaves unset, unless the environment sets any of those four variables, in which case the runner sets none of them and names no configuration ([DR-081](../decisions/081-the-app-supplies-the-compiler.md), [DR-084](../decisions/084-the-block-is-the-whole-compiler-agent.md)):

- a model, an effort or fast mode the block leaves unset stays unset for `slc`, which applies the adapter's own default;
- an adapter `slc` does not drive (`kimi`), with none of those variables in the environment, refuses the compile before the compiler runs, the guidance naming the adapters `slc` drives and `SLC_AGENT`;
- fast mode travels as the literal `true` or `false` the block holds;
- the progress log names the agent and its source before the compiler runs — `agent: <id> from the block`, or `agent: <SLC_AGENT, else slc's configuration> from the environment`.

### Registry Generation

#### playbook-library-13

When `slc` completes successfully, the registry generator shall derive `idleStateId`, `finalStateId`, and `parkStateIds` by introspecting the emitted machine definition ([DR-005](../decisions/005-compilation-integration.md)), each derived id naming a state present in that machine, and shall report them as compile metadata for display [[playbook-library-22](#playbook-library-22)] — never as registry-entry fields ([DR-014](../decisions/014-released-toolchain.md)):

- Ambiguous derivation: the registry generator surfaces the candidate state ids for user selection in the Enable form [[playbook-library-7](#playbook-library-7)] instead of choosing silently;
- the engine links the compile provisions [[playbook-library-12](#playbook-library-12)] are provisioned again for every installed playbook artifact folder at install, so an installed module resolves the app's engine the same way.

#### playbook-library-14

When the Enable form [[playbook-library-7](#playbook-library-7)] is submitted with valid entries, the registry generator shall emit a registry manifest module into the playbook artifact's folder as a thin wrapper over the `slc`-emitted registry entry ([DR-014](../decisions/014-released-toolchain.md)), returning the module's path for the environment's export [[environments-9](environments.md#environments-9)] and the derived role ids:

- the user's command and intent override the entry's;
- every other member of the entry passes through unchanged, including the role ids in their authored casing and the artifact schema the entry advertises — under artifact schema 2 a role is a playbook-local slot a user binds to a player, not a host player id ([DR-032](../decisions/032-session-players.md));
- the module carries the registry-contract marker;
- two role ids colliding fails the compile naming the offending role.

### Registry Validation

#### playbook-library-15

When a playbook is about to be enabled in a config, the registry validator shall apply the same fail-closed rules the playbook loader applies at load ([DR-004](../decisions/004-config-and-persistence.md)) — including: the `playbooks` key equals the manifest id; the module the environment exports imports successfully; no duplicate id or command among the playbooks of the composed config; no reserved captain role among role names; every required role resolved; at least one visible role; every agent resolving a supported adapter — and shall reject a violating enabling naming the violated rule, leaving the config file unmodified.

### Config Writes

#### playbook-library-32

When an enabling writes the `playbooks.<id>` entry after a compile, the compile flow shall re-key the submitted role bindings onto the derived role ids [[playbook-library-14](#playbook-library-14)] by case-insensitive name match:

- A derived role matching no binding: the compile flow fails naming the derived roles and the unmatched ones, writes no config change, and keeps the compiled artifacts so a corrected submission can enable without recompiling.

#### playbook-library-33

When playbook loading imports a module the environment exports from a file path, and the module does not carry the current registry-contract marker [[playbook-library-14](#playbook-library-14)], the registry validator shall treat the config as invalid with guidance naming the playbook, describing incompatibility with this version of Spex and directing source compilation in Playbooks as the remedy, without claiming when or by which toolchain the module was generated ([DR-014](../decisions/014-released-toolchain.md)):

- A built-in spec package's module needs no marker.

#### playbook-library-16

When the config writer updates a config file — enabling or disabling [[playbook-library-3](#playbook-library-3)], role-binding edits [[playbook-library-4](#playbook-library-4)], or an enabling from the form [[playbook-library-7](#playbook-library-7)] — it shall preserve comments, key order, and formatting of untouched content byte-for-byte, shall modify only the targeted keys, and shall replace the file atomically so an interrupted write cannot leave a partially written config.

### Authoring Conversation

#### playbook-library-64

When an authoring turn starts, the conversation runner shall run the session's agent block — the Captain's, or the preferred roster player's [[storage-5](storage.md#storage-5)] — through cligent directly, outside the Captain shell, loading the adapter class through the same adapter-import table the session runtime uses, with these options and no others ([DR-058](../decisions/058-chat-assisted-playbook-authoring.md)):

| Option | Value |
| --- | --- |
| model, subagentModel, effort, subagentEffort, fastMode | the block's, an unset subagentModel taken as `inherit` on an adapter Cligent serves one for and a `false` one as absent, as Playbook's launcher resolves them ([DR-095](../decisions/095-a-subagents-effort-and-the-agents-own-model.md)) |
| attachments | the current Boss turn's ordered verified authoring assets, supplied again on its resume-rejection retry [[media-5](media.md#media-5)] |
| browser | the block's off-by-default setting [[media-9](media.md#media-9)] |
| cwd | the spec package's folder in the working folder [[environments-10](environments.md#environments-10)] |
| permissions | exactly `{ mode: "auto" }`, with no additional `writablePaths` — the block's own policy dropped ([DR-112](../decisions/112-authoring-permissions-use-the-package-working-directory.md)) |
| allowedTools, disallowedTools, maxTurns | absent |
| resume | the token the previous turn of this run returned, when the agent is unchanged and the transcript is exactly as this run's own records left it — when the token returned and as the next turn begins; else none |
| abortSignal | the turn's, tripped by Abort |

- the block's `instruction` is not carried; the prompt composition carries everything [[playbook-library-65](#playbook-library-65)];
- no instance outlives the turn ([DR-051](../decisions/051-runtime-held-for-a-turn.md)); the token is held in memory for the app's run and never written;
- native media and large tool results are externalized through the shared owned-asset ingestion [[media-17](media.md#media-17)] before recording [[media-6](media.md#media-6)]; earlier input files stay in the visible transcript and are not automatically resent on later turns;
- a run ending in an error coded `SESSION_RESUME_REJECTED` is re-run once as a reseed;
- legacy `permission_request` telemetry is recorded as a failure line and never answered, while a live `approval_request` on an authoring turn is answered only through the core's approval broker [[approvals-1](approvals.md#approvals-1)] and recorded as history;
- the turn is recorded and streamed as `turn_started` carrying the Boss or system text, `player_prompt` with the exact prompt, one `player_event` per event, `player_finished`, and `turn_finished` or `turn_aborted`, every player record naming the player `author`, so the run view's transcript folds read them unchanged [[playbook-library-70](#playbook-library-70)].

#### playbook-library-65

When the conversation runner composes a turn's prompt, it shall compose it by the conversation's case, the file on disk always being the source of truth:

| Case | Prompt |
| --- | --- |
| First turn of a provider conversation | the preamble, the shape of a source, the shipped documents by path, the example's six-line source [[playbook-library-35](#playbook-library-35)], the directive protocol, the working rules, the session state, then `Boss:` and the message |
| Later turn of the same provider conversation | a `Since your last reply:` line when the session changed since the last prompt — the Boss edited or replaced the source, a compile settled — then `Boss:` and the message |
| Reseed — a restart, a switched agent, a rejected resume, a transcript another writer changed | as the first turn, with `Conversation so far:` holding the Boss, system, and agent final texts in order, oldest dropped past 24 KB, before the message |
| Relay | the failed phase, its elapsed time, the last 200 lines of its output — or the clarification questions with reason, evidence, and choices — then "Fix `<id>.md` and explain the cause; you may ask for another compile" as a system-origin message |
| Success | "The compile succeeded; the roles are ⟨roles⟩. Propose enabling in a register block" as a system-origin message |

- the preamble names the absolute source path inside the spec package, tells the agent to write and edit only that file and the package's `meta.yaml` description, never to run the compiler, git, or npm, and to ask at most one question per reply when the answer changes the roles or the ending, and says that a source the Boss placed may be a SKILL.md — YAML frontmatter `name` and `description`, then instructions — or other workflow markdown, to rewrite in place into a source with the description as the title and the intent, the instructions as the prompts, and the actors as the roles ([DR-082](../decisions/082-the-first-move-in-a-draft-is-an-act.md));
- the shape of a source is at most twenty lines: an H1, a `Roles:` list of capitalized unique names, behaviors as `When ⟨condition⟩, Captain shall prompt ⟨Role⟩:` with blockquoted prompts one point per line or a fenced `markdown` instruction block, runtime values relayed in quotes (`>`) as `<placeholders>`, `Results:` bullets only for several outcomes or a consumed value with `<field>: <verbatim final text>` for a relayed whole reply, each outcome with exactly one repository effect — an outcome that may either commit or leave the repository unchanged being two ([DR-088](../decisions/088-playbook-17-slc-0-12-cligent-0-27-adoption.md)) — nested calls as ``Captain shall call playbook `id`:``, at most two or three roles;
- the documents are the installed package's `slc/text2gears.md`, `reference/sdlc/review.md`, `reference/sdlc/code.md`, and `reference/sdlc/review.playbook/review.gears.md`, resolved from the package the core depends on;
- the session state names the id, the spec package's path, the source path or "none", the last compile's outcome, and the roster players with adapter and model; a malformed directive from the previous reply is named at the head of the prompt, before anything else;
- a queued Boss message dispatched after a compile settled carries the relay or success text as its preface instead of a separate turn [[playbook-library-68](#playbook-library-68)].

#### playbook-library-66

When an authoring turn ends with status success, the conversation runner shall parse every top-level fenced ```` ```spex ```` block of the reply's final text — the done result, else the concatenated text — as YAML with a `kind` key, act on the last block of each kind, and record each block as a directive:

| `kind` | Keys | Effect |
| --- | --- | --- |
| `compile` | none | starts the session's compile when Compile would be enabled [[playbook-library-57](#playbook-library-57)], else records a system line naming why not |
| `register` | `command`, `intent`, `players: {⟨Role⟩: ⟨player id⟩}` | replaces the session's proposal [[playbook-library-61](#playbook-library-61)]; a role the compiled entry lacks is kept as a mismatch |

- a fence opened inside another fence is content, not a directive; a block missing a key, carrying an unknown key or kind, or failing to parse is left as code, recorded as malformed, and named in the next prompt [[playbook-library-65](#playbook-library-65)];
- a turn ended by Abort or an error acts on nothing.

#### playbook-library-67

When an authoring session's compile starts, the compile runner shall run the pipeline on the `<id>.md` already in the playbook artifact's folder [[playbook-library-12](#playbook-library-12)] — copying nothing, packaging and validating the entry with the session's id as command and a placeholder intent [[playbook-library-14](#playbook-library-14)] [[playbook-library-15](#playbook-library-15)] — as one of its instance's compiles [[core-service-96](core-service.md#core-service-96)], write no config, and record the outcome on the session [[playbook-library-70](#playbook-library-70)]:

- progress lines broadcast as compile progress for the session id; the failed phase is the last `✗` line's phase, else the phase the compiler left open when it exited (`slc` when none was), "packaging" for a failure after the compiler finished, and the toolchain for a failure before it ran;
- an exit status 2 with an `SLC_CLARIFICATION:` line records the report's questions;
- success records the derived roles and the SHA-256 of the source as it stood when the compiler started, from which the "Changed" state derives;
- the outcome replaces only the compile's own running marker — its start time, later than any marker before it, on this device — so a compile settling after a newer one started, or after a sync brought another device's marker, records nothing and owes no follow-up;
- the compiler is an independent process: what it writes in the artifact's folder is its own, never staged or held back for the session.

#### playbook-library-68

When an authoring session's compile settles, the conversation runner shall start the follow-up by outcome once no turn or compile of the session runs, a queued Boss message always dispatching first and carrying the follow-up text as its preface [[playbook-library-65](#playbook-library-65)], never a second turn beside a running one:

| Outcome | Follow-up |
| --- | --- |
| Failed phase or clarification | a relay turn — unless the last three compiles failed with no Boss message between them, or the compile was canceled or failed before the compiler ran |
| Success | one success turn asking for the enabling proposal |
| Canceled, interrupted, toolchain | none |

- the latest outcome the session recorded decides the follow-up owed: one owing none clears what an earlier compile owed, and a follow-up whose outcome the session file no longer records when it would start — another writer replaced it — is dropped, a queued Boss message going without it;
- a Boss message resets the consecutive-failure count; the count and the queue persist on the session.

#### playbook-library-69

When an authoring session's playbook is enabled, the enabling path shall re-package the retained compiler outputs with the confirmed command and intent without rerunning the compiler [[playbook-library-14](#playbook-library-14)], request the spec package by path from the chosen spex repository's environment where it is not requested yet and resolve and install it [[environments-15](environments.md#environments-15)], write any player the submission names but your own group's roster lacks first, then write the `playbooks.<id>` entry re-keyed onto the derived role ids [[playbook-library-32](#playbook-library-32)] through the config writer [[playbook-library-16](#playbook-library-16)], reload the config, and mark the session enabled [[playbook-library-70](#playbook-library-70)]:

- the one-shot `compile.run` is an authoring-style compile followed by this same path in one reply, so both share one helper;
- each write is an ordinary write of its own file under the version it read [[environments-15](environments.md#environments-15)] [[shared-config-roundtrip-1](shared-config-roundtrip.md#shared-config-roundtrip-1)]; any failure after one of the writes leaves them written, undoes nothing, and the refusal names the writes made — the request, the lock, the install, each player, the entry — with the failure's own code and words ([DR-111](../decisions/111-the-core-coordinates-as-git-does.md));
- a refused write leaves the session standing with its artifacts, so a corrected submission enables without recompiling.

### Authoring Store

#### playbook-library-70

When an authoring session is created, opened, written, recorded, listed, or deleted, the authoring store shall keep the spec package under development in the working folder [[environments-10](environments.md#environments-10)] and the session's state, queue, and transcript in the project's spex repository [[storage-23](storage.md#storage-23)], read from their files at each use and written atomically under the version read or appended under the home lease [[storage-14](storage.md#storage-14)]:

| Case | Behavior |
| --- | --- |
| create | make `<working folder>/spex-packages/<id>/` with `meta.yaml` — `format: 2`, `org` the account's login or `local`, `name` and one `playbook` artifact `<id>` in `en`, version `0.1.0` — and `authoring/<id>.json` in the clone with a fresh instance; refuse an id a playbook of either environment or an authoring session of any project holds, and, leaving it in place, a transcript of that id standing in the clone without its session file |
| open | serve the state, the source with its version token, and the stored records after a given sequence, then stream new ones |
| write source | replace `<id>.md` atomically under the token, whatever runs beside it |
| write | replace the session file only where, at the instant before the rename, it still holds the bytes read and records the instance the writer names; else refuse, changed meanwhile, writing nothing |
| record | append each record as it is streamed, numbered after the last one the transcript holds, only while the session file records the writer's instance; keep the compile outcome — with what became of a failure: relayed, stopped, or carried by a queued message — the queue, the failure count, and the proposal in the session file; at core start, close as interrupted a compile running and a turn left open that this device recorded, leaving those another device or an earlier version recorded as they stand |
| list | every `authoring/<id>.json` of the project, with the source's first line and "source missing" when the package folder is gone |
| delete | remove the session file, its records, its assets and the preference, leaving the package folder |

- an id two clones hold is the session of the first clone the home lists, and a moved clone's sessions are found where it stands;
- a player choice an earlier version kept as `authoring:<id>:player` moves, at its first read, under the instance of the one session whose instance its id and creation time derive [[storage-23](storage.md#storage-23)], and no other session of that id reads it;
- no write recreates a session file or a clone gone since it was read, and work a session started finishes or fails on its own, writing nothing into another session of its id;
- an unreadable record or transcript is a scoped diagnostic that blocks that session alone until the file reads again.

#### playbook-library-71

When the conversation runner observes a `tool_result` event or the turn ends, it shall read `<id>.md`, and when its digest differs from the last one streamed, broadcast the source with its version token to every client, so the Source tab follows the agent's writes at tool-call granularity [[playbook-library-56](#playbook-library-56)].

## Verification

### Compile Coverage

#### playbook-library-17

Where a stub `slc` executable that emits a valid compiled playbook output is named as the configured compiler [[playbook-library-11](#playbook-library-11)], when the compile flow is driven end to end — source provided [[playbook-library-5](#playbook-library-5)], role names entered, the Enable form submitted [[playbook-library-7](#playbook-library-7)] — the test suite shall assert that the stub ran as an external process in the playbook artifact's folder of the spec package in the working folder [[playbook-library-12](#playbook-library-12)], that a registry manifest was emitted beside it whose entry passes the fail-closed registry validation [[playbook-library-15](#playbook-library-15)], that the project's `spex.yaml` gained a path request for the package and its lock exports the playbook [[playbook-library-7](#playbook-library-7)], that the project's config gained a `playbooks.<id>` entry with no `from` whose role bindings are keyed by the entry's derived role ids however the submission cased them [[playbook-library-32](#playbook-library-32)] [[playbook-library-14](#playbook-library-14)], that the surface lists the new playbook [[playbook-library-10](#playbook-library-10)], and that the stub ran with the Captain's block as `SLC_AGENT` and `SLC_MODEL` [[playbook-library-42](#playbook-library-42)].

#### playbook-library-98

Where the core runs with the scripted fake adapter and a stub `slc`, when an authoring session's playbook is compiled and `draft.register` is submitted with a new player while the project's config folder is a file another writer placed, the test suite shall assert that the enabling is refused after its request, lock and player were written, the refusal naming those writes and carrying the failure's own words, that those writes stand and the other writer's file is unchanged, and that a retry once the folder is back writes no request again and enables the playbook [[playbook-library-7](#playbook-library-7)] [[playbook-library-69](#playbook-library-69)].

#### playbook-library-18

Where the app's own `slc` is missing from the module trees the test names, its playbook engine disagrees with the app's, or every Node.js candidate fails the version floor [[playbook-library-11](#playbook-library-11)], the test suite shall assert that the compile flow is reported unavailable with guidance naming the missing prerequisite — the restore command, both engines, or the version found [[playbook-library-8](#playbook-library-8)] — and that no compiler process is spawned.

#### playbook-library-19

Where a stub `slc` fails at a known pipeline phase with error output, when a compile is run, the test suite shall assert that the failing phase is identified, that the phase's captured output is surfaced [[playbook-library-9](#playbook-library-9)], that no config or environment write occurs, and that previously compiled outputs for the same playbook id remain unchanged [[playbook-library-12](#playbook-library-12)].

#### playbook-library-79

Where the core runs from a checkout whose app shells declare `@sublang/slc`, when the test suite resolves the toolchain with neither `SPEX_SLC` nor `SPEX_NODE` set, the test suite shall assert that the compiler is the checkout's own copy, run on the Node.js chosen when one meets the floor [[playbook-library-11](#playbook-library-11)], and that from that copy's own `@sublang/cligent` the Claude agent SDK the shells declare loads — the import a compiler installed globally or through `npx` fails on a fresh machine [[playbook-library-11](#playbook-library-11)].

#### playbook-library-80

Where the desktop's Electron binary is at hand, when the test suite resolves the toolchain with that binary handed as the app's own runtime with the desktop's module directories, the test suite shall assert that it answers the probe as Node at or above the floor with `ELECTRON_RUN_AS_NODE=1` and that the compiler resolved is the app's copy from those directories [[playbook-library-83](#playbook-library-83)] [[playbook-library-11](#playbook-library-11)], that the supplied compiler's `--version` runs on it, and that a probe in the compiler's place sees that Node with the variable gone [[playbook-library-11](#playbook-library-11)].

#### playbook-library-81

When the test suite compiles through a stub `slc` named as the configured compiler, the test suite shall assert the compile's agent per case [[playbook-library-42](#playbook-library-42)]: a block naming `codex` at effort `medium` in an environment setting no `SLC_*` variable reaches the stub as `SLC_AGENT=codex` and `SLC_EFFORT=medium` with neither `SLC_MODEL` nor `SLC_FAST_MODE`, `--config` naming a file that holds no setting, the stall budget beside them and a progress line naming the agent from the block ahead of the compiler; with `SLC_AGENT` set in the environment nothing of the block and no `--config` reaches the stub and the line names the environment; a block naming `kimi` is refused before the stub runs, the guidance naming the adapters `slc` drives; and a block's fast mode reaches the stub as its literal.

#### playbook-library-82

When the test suite resolves the toolchain through a probe answering each command with its own version, the test suite shall assert the order of [[playbook-library-11](#playbook-library-11)]: an Electron runtime meeting the floor is chosen, probed with `ELECTRON_RUN_AS_NODE=1` in the caller's environment, and runs the compiler behind the preload ahead of any `PATH` Node, an own runtime below the floor yields to a `PATH` Node meeting it with both probed in that order, and a configured `SPEX_NODE` is the only candidate probed; and that a compile on the Electron runtime spawns the copy's CLI behind the preload with `ELECTRON_RUN_AS_NODE=1` beside the caller's environment [[playbook-library-12](#playbook-library-12)] [[playbook-library-83](#playbook-library-83)] while a compiler `SPEX_SLC` names runs without it [[playbook-library-11](#playbook-library-11)].

### Enabling and Config Coverage

#### playbook-library-20

When the Enable form [[playbook-library-7](#playbook-library-7)] is submitted with an entry violating a fail-closed rule, covering at least a command duplicating an existing playbook's and an id failing the character rule ([DR-004](../decisions/004-config-and-persistence.md)), the test suite shall assert that each submission is rejected naming the violated rule [[playbook-library-15](#playbook-library-15)] and that the config file bytes and `spex.yaml` are unchanged.

#### playbook-library-21

Where a config file contains comments and entries unrelated to the toggled playbook, when a playbook is disabled and then re-enabled [[playbook-library-3](#playbook-library-3)], the test suite shall assert after each write that comments and unrelated entries are byte-identical to the original [[playbook-library-16](#playbook-library-16)] and that the list reflects the new state, and after the round trip that the playbook's entry is enabled again; and that enabling in a project's config writes the player names alone while your own group's roster gained the missing player first [[playbook-library-3](#playbook-library-3)].

#### playbook-library-25

Where a playbook was compiled into a spec package in the working folder and installed as a path source, when its artifacts are requested over the protocol, the test suite shall assert the response carries the source markdown, the gears markdown, the FSM code [[playbook-library-22](#playbook-library-22)], the derived state ids, and that gears markdown parsed into items in document order, each with its first line, body, and citations [[playbook-library-24](#playbook-library-24)]:

- A stage file removed: the test suite asserts the response names the missing stage while still serving the others [[playbook-library-24](#playbook-library-24)].
- Gears the parser reads no item from: the test suite asserts the markdown still serves, with no parsed items beside it [[playbook-library-24](#playbook-library-24)].
- The same playbook installed from the stand-in registry serves the same stages from `packages/` [[playbook-library-24](#playbook-library-24)].

#### playbook-library-44

When each built-in playbook's artifacts are requested from the built-in spec package, the test suite shall assert that built-in's shipped gears file is served parsed [[playbook-library-24](#playbook-library-24)]: at least one item, every item carrying an ID of the authored casing, a non-empty first line, and a body, with the markdown the rows fall back to still served beside them.

#### playbook-library-37

When each built-in playbook's artifacts are requested, the test suite shall assert the served graph is whole [[playbook-library-36](#playbook-library-36)]: every edge's ends name served nodes, the edge set is non-empty for every built-in, declared-id targets resolve — the review machine's opening transition and a boss-reply resume transition among the resolved — and a compound state's done transition appears as an edge.

#### playbook-library-91

Where fresh file modules use the current artifact schema with absent or noncurrent markers, a file module has the current marker and the built-in spec package's module has none, when real config composition loads each entry in English and Chinese, the integration suite shall assert incompatible files are refused with the existing typed registry fault and truthful source-compilation guidance, while the current-marker and built-in entries remain accepted [[playbook-library-33](#playbook-library-33)].

#### playbook-library-94

Where a scratch home holds a project whose environment requests a spec package from the stand-in registry and your own group's environment requests the built-in spec package, when the Playbooks surface renders each side and the suite drives its controls, the test suite shall assert: each side lists its spec packages with versions, sources, artifacts with languages and fallback marks, and installed state [[playbook-library-92](#playbook-library-92)]; the playbooks of both environments list once per origin with their enabled state per config [[playbook-library-1](#playbook-library-1)]; Add from registry searches the stand-in and requests the chosen version, Resolve again stands while the lock is stale with the stale phrase, Remove asks Remove or Keep, and every control stays enabled during that spex repository's sync and while the core installs, its install reading as progress [[playbook-library-92](#playbook-library-92)]; and a playbook enabled in neither config, one enabled in the project's and one in your own group's each read so [[playbook-library-1](#playbook-library-1)].

### Binding Coverage

#### playbook-library-39

Where an enabled playbook binds two roles, one to a player another playbook also names, the test suite shall assert the surface prints each role's bound player with what that binding effectively runs [[playbook-library-1](#playbook-library-1)], marks the shared role and names the other position holding it [[playbook-library-38](#playbook-library-38)], and leaves the unshared role unmarked; and that rebinding through the editor on your own group's entry offers exactly the roster, writes the chosen player with pinned effort, a pinned subagent model, a pinned subagent effort from a list holding no orchestration value and inherit/on/off fast mode while preserving untouched tuning and comments, offers no subagent-model or subagent-effort field on a lane whose adapter serves no subagent model [[playbook-library-4](#playbook-library-4)], checks effective inherited tuning against known model support, names in its inherit choice the player's model by the display rule and a player's unset one as the provider's default followed by the catalog's default model where it reports one, names a player's unset effort in the effort's inherit choice by the "Provider default" words, a player's unset subagent model as "Same as agent" and unset subagent effort as "Agent chooses", keeps a cleared pin in pin mode with an inline error and no write, and surfaces a refusal inline while keeping the editor open [[playbook-library-4](#playbook-library-4)]; that on a project's entry the editor offers the player alone with the personal-tuning phrase and writes the name alone [[playbook-library-4](#playbook-library-4)]; and that the editor opens with focus inside and closes on Escape, on an outside click, and on Cancel with focus back on the role's control [[playbook-library-4](#playbook-library-4)].

#### playbook-library-40

When a built-in whose roles the roster does not cover is enabled, the test suite shall assert the missing player is written to your own group's roster first, carrying the block chosen for its role, and only then the playbook entry binding that role to it [[playbook-library-34](#playbook-library-34)].

#### playbook-library-49

Where a config lists `dev` without `branch` or `pr`, the test suite shall assert that the `dev` card carries the pull-request delivery hint naming each missing built-in, and that a config listing all three renders no hint [[playbook-library-48](#playbook-library-48)].

#### playbook-library-90

Where the validated config summary lists the built-in `code` and `decide` entries without `review`, when the surface renders and then receives a summary enabling `review`, the integration suite shall assert both hints name their effective commands, direct enabling `/review`, cause no configuration write and disappear on the update [[playbook-library-89](#playbook-library-89)]; it shall also render playbooks of another spec package with those same ids and unrelated built-in entries, asserting no hint for them, in English and Chinese.

### Cancellation and Gate Coverage

#### playbook-library-45

Where a playbook's artifacts carry a parsed Gears stage of two items, one citing the other, when the Gears stage is opened, the test suite shall assert the card draws the outline's rows [[playbook-library-22](#playbook-library-22)]: each row collapsed on its ID, group, and first line with no edit control, a pressed row rendering its body, a settled hover on the citation previewing the cited item and its jump dismissing that preview, the citation landing on the cited row expanded and highlighted without leaving the card, and — where the parse is absent — the gears markdown rendered instead.

#### playbook-library-30

While a compile driven through the app store is running, the test suite shall assert that a cancel control is rendered beside the compile progress output, that activating it issues the compile abort command for the running playbook id [[playbook-library-27](#playbook-library-27)], that the recorded cancellation appears in the progress log, and that the compile start control stays disabled until the compile settles.

#### playbook-library-31

Where your own group's config state is missing or invalid, the test suite shall assert that the surface renders the config gate — the Captain-scope explanation and the fix-it-in-Settings direction [[playbook-library-28](#playbook-library-28)] — with "Settings" as an activatable navigation control when a navigation callback is supplied and as plain text when it is not, and that no playbook list or compile form is rendered.

### Authoring Coverage

#### playbook-library-72

Where the core runs with the scripted fake adapter — its first reply writing a `Roles:`-led `<id>.md` into its working directory and ending in a compile block, its next reply a register block — and a stub `slc` named as the configured compiler emitting a two-role entry, when an authoring session is created in a project and one message sent over the protocol, the test suite shall assert that the fake ran with the spec package's folder as `cwd`, exactly `{ mode: "auto" }` as its permissions, no tool lists, and no resume, and that the chat and proposal calls pass the supported hosts' real Claude, Codex, Gemini and OpenCode permission mappers without additional write grants [[playbook-library-64](#playbook-library-64)]; that the prompt carried the source path, the four document paths, the one-effect rule for outcomes, and both directive kinds [[playbook-library-65](#playbook-library-65)]; that the records streamed as `author` player records and a Boss turn into the project's clone [[playbook-library-64](#playbook-library-64)] [[playbook-library-70](#playbook-library-70)]; that the source broadcast after the write [[playbook-library-71](#playbook-library-71)]; that a compile started without a further command, its progress lines streamed, and no config write occurred [[playbook-library-66](#playbook-library-66)] [[playbook-library-67](#playbook-library-67)]; that the stub `slc` ran with the session's answering agent as `SLC_AGENT` and `SLC_MODEL` [[playbook-library-42](#playbook-library-42)]; that the success turn's prompt named the roles and the proposal landed with the block's fields [[playbook-library-68](#playbook-library-68)] [[playbook-library-66](#playbook-library-66)]; and that `draft.register` requested the package by path, wrote the new player first, then `playbooks.<id>` keyed by the derived roles with the confirmed command and intent in the wrapper, after which the session reads enabled and the playbook is listed [[playbook-library-69](#playbook-library-69)] [[playbook-library-70](#playbook-library-70)].

#### playbook-library-73

Where the stub `slc` fails at `gears2fsm` on its first two runs and exits 2 with a `SLC_CLARIFICATION:` report on the third, and the fake replies with a compile block on every relay, when an authoring session's compile is started, the test suite shall assert that each failure recorded the phase and output [[playbook-library-67](#playbook-library-67)]; that a relay turn followed each of the first two with permissions accepted by the real adapter mappers [[playbook-library-64](#playbook-library-64)], the phase, elapsed time, and output tail in its prompt, and the third carried the questions with reasons and choices [[playbook-library-65](#playbook-library-65)] [[playbook-library-68](#playbook-library-68)]; that after the third failure no turn started and the session's state says so [[playbook-library-68](#playbook-library-68)]; that the session's compile record names what became of each failure — sent, sent, stopped, and queued for the one a queued message carried [[playbook-library-70](#playbook-library-70)]; that a Boss message reset the count and the next failure relayed again [[playbook-library-68](#playbook-library-68)]; that a `draft.send` queued during a compile dispatched before any relay with the failure as its preface [[playbook-library-65](#playbook-library-65)]; and that no config write occurred throughout [[playbook-library-67](#playbook-library-67)].

#### playbook-library-74

Where the fake's run stays in flight until aborted and the compile spawner blocks until canceled, the test suite shall assert as an explicit matrix that `draft.send` during a turn and during a compile reply queued; that `draft.source.write`, `draft.player.set` and `draft.compile` during a turn are admitted, the compile running beside the turn; that a second `draft.compile` during a compile is admitted, both running; that `draft.abort` ends the turn with an aborted record and leaves the queue standing; that one `compile.abort` naming the instance cancels both compiles with the canceled line last and no relay; and that the queued messages dispatched in order once the session was idle [[playbook-library-64](#playbook-library-64)] [[playbook-library-67](#playbook-library-67)] [[playbook-library-68](#playbook-library-68)] [[playbook-library-70](#playbook-library-70)].

#### playbook-library-75

Where an authoring session holds two turns and a compile was running, when the core is stopped and restarted and the session reopened, the test suite shall assert that the records replay in sequence and the compile reads interrupted with no relay [[playbook-library-70](#playbook-library-70)]; that the next turn's prompt is a reseed carrying the conversation so far and no resume [[playbook-library-65](#playbook-library-65)] [[playbook-library-64](#playbook-library-64)]; that the initial, resumed, resume-rejection retry, restored and switched-agent calls pass the real adapter permission mappers and within one run the second turn passed the first's token as `resume` [[playbook-library-64](#playbook-library-64)]; that `draft.player.set` wrote `authoring:<instance>:player` to the preferences and the next run used that player's block with a reseed [[playbook-library-64](#playbook-library-64)] [[playbook-library-65](#playbook-library-65)]; that a session whose transcript is damaged opens after a restart with its source and a diagnostic in place of its records and refuses a message [[playbook-library-70](#playbook-library-70)]; and that `draft.delete` removed the session file, records, assets and preference and left the package folder [[playbook-library-70](#playbook-library-70)].

#### playbook-library-76

Where the fake's reply carries, as an explicit case matrix, a block inside a fenced example, two register blocks, a block with an unknown key, a block that fails to parse, and a register block naming a role the entry lacks, the test suite shall assert that only the second register block became the proposal, the nested block acted as nothing, the malformed blocks were recorded malformed and named at the head of the next prompt, and the unknown role stood as a mismatch beside the derived roles [[playbook-library-66](#playbook-library-66)] [[playbook-library-65](#playbook-library-65)].

#### playbook-library-88

Where the Enable tab renders a compiled authoring session over a roster holding `dev.coder` and `dev.reviewer`, the test suite shall assert, as an explicit case matrix, each role row's default [[playbook-library-61](#playbook-library-61)]:

- a proposal naming `Coder` and `Verifier` fills the derived roles `coder` and `verifier` with the proposed players and shows no mismatch;
- with or without a proposal, the role `coder`, whose uncontested own lane `dev.coder` the roster holds, selects that lane as it stands;
- that role's new player is `dev.coder-2`, and `dev.coder-3` once the roster also holds `dev.coder-2`;
- Chinese roles and digit-leading or punctuation-only roles receive valid segmented ids, retaining ordinary ASCII defaults; submitting the rendered form passes the actual typed-command validator with one new lane per unproposed role, including when the roster already holds the fallback base;
- distinct roles whose normalization collides receive distinct automatic lanes and offered new options, including when the roster holds the normalized base; an implicit roster choice never shares another role's explicit existing-lane choice, while explicitly shared proposals or Boss selections retain one lane;
- an automatic lane avoids a later role's explicitly proposed or selected new id, and selecting an already offered new option or a roster lane leaves unaffected defaults and offered new options stable;
- the spex repository field defaults to the project and offers your own group [[playbook-library-61](#playbook-library-61)].

#### playbook-library-96

Where the core runs with the scripted fake adapter and a stub `slc`, when the test suite changes an authoring session's files beside the core as another writer would, the test suite shall assert, as an explicit case matrix:

- a transcript replaced under the same instance: the next open serves the replacement whole, the next record follows its last, and the next turn reseeds with no resume [[playbook-library-70](#playbook-library-70)] [[playbook-library-64](#playbook-library-64)] [[playbook-library-65](#playbook-library-65)];
- a session deleted and recreated under its id: a command naming the former instance is refused, the successor reads idle and takes a message while the former's compile runs, the former session's late compile settlement writes nothing into the successor, and no file of the former session is recreated [[playbook-library-70](#playbook-library-70)];
- a session deleted with `draft.delete` while its compile runs: the deletion is admitted and the compile, ending, makes no file of the session again [[playbook-library-70](#playbook-library-70)];
- two compiles of one session settling out of order, and a compile whose running marker a sync replaced with another device's: the settlement finding a marker not its own records nothing [[playbook-library-67](#playbook-library-67)];
- a compile settling while a turn runs: its follow-up waits for that turn, never running beside it; a newer compile canceled before the turn ends leaves none owed; and a compile record another writer replaced before the turn ends leaves none, the queued Boss message going without its preface [[playbook-library-68](#playbook-library-68)];
- a transcript replaced, or extended by another writer, while the provider ran, and one extended between turns: the next turn reseeds with no resume, while a turn over a transcript only this run wrote resumes [[playbook-library-64](#playbook-library-64)] [[playbook-library-65](#playbook-library-65)];
- a clone moved under the home: the session's next record lands in the moved clone and nothing is recreated at the former path [[playbook-library-70](#playbook-library-70)];
- a session file rewritten with a newer queue and proposal during a compile: its settlement keeps both, the queued message dispatching first, and a write against the bytes read before the rewrite is refused [[playbook-library-70](#playbook-library-70)] [[playbook-library-68](#playbook-library-68)];
- a damaged transcript repaired while the core runs: the session takes a message with no restart [[playbook-library-70](#playbook-library-70)];
- a compile running and a turn open that another device recorded, and an earlier version's unmarked turn, stand after a restart, while this device's own are closed as interrupted [[playbook-library-70](#playbook-library-70)];
- a player choice an earlier version kept by id: the session written without an instance answers with it and holds it under its derived instance after, while a new session of that id made after the former's deletion beside the core answers with the Captain [[playbook-library-70](#playbook-library-70)];
- a transcript standing without its session file: create refuses and leaves its bytes [[playbook-library-70](#playbook-library-70)];
- a source edited while the compiler runs: the success reads "Changed" [[playbook-library-67](#playbook-library-67)].

#### playbook-library-97

Where the authoring workspace renders over a simulated core, when that core replaces an open session's transcript under the same instance and then replaces the session under its id, the test suite shall assert that a reconnect, a `draft.history-replaced` announcement and a record not following the thread's last each reload the whole transcript while the composer's text, the Source tab's edits and the Enable form stand, that Cancel names the instance shown, that once another instance is announced a late record, source, progress line or reply — a source refresh, artifacts, an enabling's close, a send's error — naming the former changes nothing of the successor's while the enabling's config stands, and that a record arriving after the session's removal makes no thread [[playbook-library-62](#playbook-library-62)].

### Browser Journeys

#### playbook-library-41

Where the browser journey harness ([DR-039](../decisions/039-browser-acceptance-journeys.md)) boots the served shell on the demo config, when the journey works the Playbooks surface through the page, the test suite shall assert:

- every enabled playbook lists with its command, intent, spec package and role bindings, and the switch shows the project's side and your own group's [[playbook-library-1](#playbook-library-1)] [[playbook-library-29](#playbook-library-29)];
- the built-ins enabled in neither config list beside them, and enabling one writes it to the project's config and lists it among the enabled, after which the Captain home's slash menu offers its command [[playbook-library-34](#playbook-library-34)];
- a playbook's stage row opens the stage pressed, swaps to another pressed beside it, and closes on a second press of the open one [[playbook-library-22](#playbook-library-22)];
- the Gears stage stands as item rows carrying the artifact's own IDs, one of which expands to its body [[playbook-library-22](#playbook-library-22)];
- the State machine stage's state list stays in view with its box scrolled to the bottom [[playbook-library-22](#playbook-library-22)];
- the open stage's box carries a grip that names the stage, and a drag of it leaves the box taller with the height still standing after a reload [[playbook-library-22](#playbook-library-22)];
- disabling a playbook asks for no confirm and leaves the config without it, while removing a spec package asks Remove or Keep [[playbook-library-26](#playbook-library-26)] [[playbook-library-16](#playbook-library-16)] [[playbook-library-92](#playbook-library-92)];
- a role's binding editor opened at the 320-pixel viewport floor stands wholly inside the surface's box both on opening and after discovery followed by pinning a custom model, with the surface scrolling in neither direction [[playbook-library-43](#playbook-library-43)], its model and effort stacked there and side by side at 1280 pixels [[playbook-library-4](#playbook-library-4)].

#### playbook-library-77

Where the browser journey harness ([DR-039](../decisions/039-browser-acceptance-journeys.md)) boots the served shell with the authoring fake script and the stub `slc` named as the configured compiler, when the journey works a new playbook through the page, the test suite shall assert:

- "New playbook" asks for the id inline, refuses `Triage` naming the rule, and opens `triage` as the workspace with the divider, the tab strip, the two openers, and an Authoring row on returning [[playbook-library-51](#playbook-library-51)] [[playbook-library-52](#playbook-library-52)] [[playbook-library-84](#playbook-library-84)] [[playbook-library-50](#playbook-library-50)];
- "Try the example" places the example's prose in the composer and sends nothing; "Use a SKILL.md…" with no file pick on the page opens the Source tab's paste mode with its text focused and places the adapt sentence, and with a page-supplied pick on a session with no source writes the picked file as the source, shown in the Source tab with its path, with the adapt sentence placed [[playbook-library-84](#playbook-library-84)];
- a sent message stands as a Boss bubble, the agent's write as a tool card, its compile block as the "Asked to compile" card, and the Source tab shows the written markdown before the turn ends [[playbook-library-53](#playbook-library-53)] [[playbook-library-56](#playbook-library-56)];
- the band lists the phases in human words with the running one's output age, "asked by the agent", and Cancel [[playbook-library-57](#playbook-library-57)];
- a failing stub leaves a red phase with its output open, a "sent to the agent" system line, and the compiled tabs still disabled, then a second compile turns the chip "Compiled" with Gears rows and the Machine state list [[playbook-library-58](#playbook-library-58)] [[playbook-library-60](#playbook-library-60)];
- a message sent during the compile queues with "Send next" and dispatches afterwards [[playbook-library-54](#playbook-library-54)];
- Edit, Save, and a forced conflict behave as specified, and Paste's "Use as source" writes the file [[playbook-library-56](#playbook-library-56)];
- the Enable tab opens prefilled from the proposal and Enable lists `/triage` as enabled with the chip reading "Enabled" and the package requested by path on the project's side [[playbook-library-61](#playbook-library-61)] [[playbook-library-92](#playbook-library-92)];
- the agent picker offers "Captain" and each roster player, and a switch survives a reload with its system line [[playbook-library-55](#playbook-library-55)];
- a reload restores the transcript, the source, and the compiled tabs [[playbook-library-62](#playbook-library-62)];
- a session seeded with a compile still marked running when the shell booted opens with the chip "Interrupted", the band's interrupted line, Compile enabled, and no relay line in the thread [[playbook-library-59](#playbook-library-59)];
- Delete asks Delete or Keep and removes the row, the package folder staying [[playbook-library-63](#playbook-library-63)];
- the example card's Prefill opens the example's authoring workspace in the Source tab's paste mode with the normalized text placed and nothing written or compiled [[playbook-library-35](#playbook-library-35)];
- at the 320-pixel viewport with the rail collapsed the panes stack under a horizontal grip with the chip in view, every control keeps its accessible name, and the page scrolls in neither direction [[playbook-library-52](#playbook-library-52)].

#### playbook-library-78

Where the live journey lane is opted in ([DR-039](../decisions/039-browser-acceptance-journeys.md)) with the machine's real sign-in and the released `slc`, when the journey asks for "a two-role changelog playbook: Coder drafts release notes from the commits since the last tag and commits them; Reviewer checks them against the commits", follows the agent's compile request and enabling proposal, and answers any player's question in the run through the Captain ([DR-089](../decisions/089-every-fresh-user-scenario-walked-for-real.md)), the test suite shall assert that a source declaring Coder and Reviewer was written [[playbook-library-56](#playbook-library-56)], that the agent's compile ran to Link [[playbook-library-57](#playbook-library-57)], that the derived roles are those two [[playbook-library-60](#playbook-library-60)], that `/changelog` was enabled with a player per role [[playbook-library-61](#playbook-library-61)], that a new session's slash menu offers it, and that a session's `/changelog` turn then runs the enabled playbook to a finished turn with both role players engaged and the repository carrying a commit of its notes [[playbook-library-14](#playbook-library-14)] ([DR-086](../decisions/086-tests-in-tiers.md)):

- the journey picks a roster player bound to `gpt-6-astra` at `xhigh` as the session's agent before its first message, so the conversation and the compile run on that block [[playbook-library-55](#playbook-library-55)] [[playbook-library-42](#playbook-library-42)].

#### playbook-library-85

Where the browser journey harness ([DR-039](../decisions/039-browser-acceptance-journeys.md)) boots the served shell with the demo project registered and the passing stub `slc` on the toolchain path, when the journey opens the example's Prefill, uses the placed text as the source, compiles from the workspace's own control, and enables the result, the test suite shall assert through the page that the session's source is the pasted text [[playbook-library-35](#playbook-library-35)] [[playbook-library-56](#playbook-library-56)], that the compile band reads asked by you and runs to Link [[playbook-library-57](#playbook-library-57)], that with the agent proposing nothing the Enable tab's form stands on its derived defaults — the session's id as the command and, the example holding no prose paragraph, its title as the intent — with a player per derived role, enabling the example's `/workflow` with no intent typed [[playbook-library-61](#playbook-library-61)] [[playbook-library-7](#playbook-library-7)], that the surface lists it [[playbook-library-10](#playbook-library-10)], and that a new session's slash menu offers it.

#### playbook-library-86

Where the live journey lane runs with the machine's signed-in agents and the app's own `slc` ([DR-089](../decisions/089-every-fresh-user-scenario-walked-for-real.md)), when the journey opens the example's Prefill, uses the placed text as the source, compiles it from the workspace's own control, enables it on the Enable tab's prefill, sends the enabled command with a task in a new session, and answers any player's question through the Captain, the test suite shall assert through the page:

- the session's source is the pasted text [[playbook-library-35](#playbook-library-35)] [[playbook-library-56](#playbook-library-56)], and the compile band reads asked by you and its first compile runs to Link [[playbook-library-57](#playbook-library-57)], the chip reading "Compiled" with the example's two roles derived [[playbook-library-60](#playbook-library-60)];
- the Enable tab enables the example on its prefill with nothing typed [[playbook-library-61](#playbook-library-61)], and the surface lists it [[playbook-library-10](#playbook-library-10)]: where the agent's turn after the compile proposed nothing, the derived defaults — the session's id, `workflow`, as the command, the example's title as the intent, and each role on the roster's own lane for it as that lane stands — with nothing chosen; where it proposed, the proposal with its command, a role it leaves on a lane off `claude` moved to the roster's own lane for it;
- a new session's slash menu offers the enabled command, and its turn runs the enabled playbook to a finished turn with both role players engaged [[playbook-library-14](#playbook-library-14)];
- the journey picks a roster player bound to `gpt-6-astra` at `xhigh` as the session's agent before compiling, so the compile runs on that block [[playbook-library-55](#playbook-library-55)] [[playbook-library-42](#playbook-library-42)], while the roles' lanes run on `claude`.

#### playbook-library-87

Where the browser journey harness ([DR-039](../decisions/039-browser-acceptance-journeys.md)) boots the served shell with the demo project registered, substitute agents, and a stub `slc` whose compile places a committed fixture — the example as the real `slc` compiled it for the playbook engine generation the repository installs ([DR-089](../decisions/089-every-fresh-user-scenario-walked-for-real.md)) — when the journey compiles the example from its Prefill, enables it on the Enable tab's defaults, and sends `/workflow` with a task in a new session, the test suite shall assert through the page that the surface lists `/workflow` among the enabled playbooks [[playbook-library-10](#playbook-library-10)], and that the session's turn runs the fixture's compiled machine, through the registry module wrapping its entry, to a finished turn with both role players engaged [[playbook-library-14](#playbook-library-14)].

#### playbook-library-95

Where the browser journey harness ([DR-039](../decisions/039-browser-acceptance-journeys.md)) boots the served shell signed in against the stand-in host and the stand-in registry with a compiled authoring session enabled, when the journey activates Publish on the Enable tab, confirms the inline summary, and then, on a second scratch home, adds the published spec package from the registry and enables its playbook, the test suite shall assert through the page that the published version reads with its link [[playbook-library-93](#playbook-library-93)], that the second home's search finds it and Add requests it, that its playbook lists from the registry source and enables [[playbook-library-92](#playbook-library-92)] [[playbook-library-34](#playbook-library-34)], and that a signed-out home shows "Sign in to publish" in the control's place [[playbook-library-93](#playbook-library-93)].
