<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# settings: Settings

## Intent

This spec covers the Settings workspace surface of the Spex desktop app — its externally visible behavior, the implementation requirements behind it, and the integration coverage that verifies both.
The Settings surface is an editor over the shared playbook config file at `${SPEX_HOME:-$HOME/.spex}/config/playbook.config.yaml`, which stays the source of truth shared with the playbook CLI.
Signing in to a Space or a registry has no page here: Settings holds no accounts or registries page ([DR-172](../decisions/172-surfaces-a-fresh-user-reads.md)).
The inline agent block (adapter, optional model, optional reasoning effort, optional adapter-scoped fast mode, permissions), the adapter names known to the embedded runtime (`claude`, `codex`, `gemini`, `kimi`, `opencode`), the config's top-level entries (`captain`, `layout`, `notifications`, `theme`), and the fail-closed validation rules are those of the playbook launcher that shares this file.
Behind the surface, the implementation requires one validation module shared with core config loading, comment-preserving YAML writing, launcher-equivalent readiness checks, and the protocol boundary between the Settings UI and the core service.
Integration coverage is exercised through the core service's WebSocket protocol against real shared config files in fixture config directories, so that Settings behavior and the launcher's config contract are verified together.

## External Behavior

### Captain

#### settings-1

Where the Settings surface is open, the Settings surface shall present the Captain as a row of the session players' shape [[settings-26](#settings-26)] — its agent with that adapter's readiness, and no removal control — whose edit control opens, in place, the Captain's agent editor over the shared config's top-level `captain` entry, with the fields of an inline agent block: adapter (one of the embedded runtime's known adapters, each carrying its readiness indicator), optional model and reasoning effort selected from runtime options [[settings-34](#settings-34)], a subagent model and a subagent effort [[settings-34](#settings-34)] where the adapter serves a subagent model or a value already stands, so a stale one is always clearable ([DR-093](../decisions/093-a-players-subagent-model.md), [DR-095](../decisions/095-a-subagents-effort-and-the-agents-own-model.md)), a fast-mode switch following the selected model's known support or the adapter's declared support when model metadata is absent ([DR-038](../decisions/038-history-is-done-work.md)), and permissions (mode `auto` or `bypass`, optional writable paths):

- The editor offers Save and Cancel, and closes on either — Escape cancels too — handing focus back to the row's edit control ([DR-010](../decisions/010-interface-craft.md) §6); one row's editor stands open at a time across the Captain and the players, a second opening closing the first.
- The model and the effort stand on one row and the subagent model and the subagent effort on the next, each pair stacking into one column where the editor's content box is narrower than 320 pixels, as it is at the 320-pixel viewport floor ([DR-095](../decisions/095-a-subagents-effort-and-the-agents-own-model.md), [DR-041](../decisions/041-chrome-that-fits.md)).
- When a captain edit is saved, the change appears in the shared config file's `captain` entry as a merge patch that alters only the fields the editor surfaced, preserving hand-written fields such as `instruction` and granular permissions (see [[settings-21](#settings-21)]).

#### settings-2

While a pending Settings edit violates a shared-config validation rule — the same fail-closed rule set the playbook launcher applies ([DR-004](../decisions/004-config-and-persistence.md), amended by [DR-019](../decisions/019-inline-agent-configuration.md)) — the Settings surface shall mark the offending field inline with a message naming the violated rule, clearing the marker once the edit no longer violates the rule, covering at least:

- an edit reintroducing the retired `profiles` map or a `profile` key, rejected as a retired key;
- a reasoning effort outside the selected adapter's vocabulary, rejected with a message naming that adapter's valid efforts;
- an adapter id outside the embedded runtime's known set, rejected with a message naming the runtime's set.

#### settings-3

While any pending edit in the Settings surface violates a shared-config validation rule ([DR-004](../decisions/004-config-and-persistence.md), amended by [DR-019](../decisions/019-inline-agent-configuration.md)), when the user attempts to save, the Settings surface shall not write the shared config file and shall state which violations block the save:

- The Settings surface never writes an on-disk config that the shared validation rules reject, however small the saved merge patch.

#### settings-4

Where the Settings surface is open, the Settings surface shall display the captain configuration from the shared config's top-level `captain` entry on the Captain's row and, once opened, as its agent editor's seeded draft [[settings-1](#settings-1)], rendering a hand-written scalar adapter id as that adapter's default agent block with no shorthand label:

- When a captain edit is saved, the entry appears in the shared config file as an inline agent block, a scalar entry becoming a block on that first save.

### Session Players

#### settings-26

Where the Settings surface is open, the Settings surface shall present the shared config's session-player roster ([DR-032](../decisions/032-session-players.md)) — each player's name beside its mark, its id in the tooltip [[run-view-177](run-view.md#run-view-177)], its agent with that adapter's readiness, and the `<playbook>.<role>` bindings it answers — and shall offer, per player, an agent editor with the fields of an inline agent block and a removal control:

- A player no binding names is listed and marked as bound to no role, because an unreferenced lane is legal and reaching no session.
- A saved player edit is a merge patch altering only the fields the editor surfaced, preserving hand-written fields such as `instruction` and granular permissions.
- A removal the shared-config write path refuses is reported in that path's own words beside the player, and writes nothing.

#### settings-52

When the run view asks for Settings at an agent's row [[run-view-179](run-view.md#run-view-179)], the Settings surface shall open with that agent's row editor open and in view — the Captain's row, or that player's in the session-player roster [[settings-26](#settings-26)] — and shall leave every other row as it was ([DR-155](../decisions/155-players-named-delegated-and-recovered.md)):

- a player the roster no longer holds opens Settings with no editor open;
- the request is taken once, so returning to Settings later opens it as the reader left it.

#### settings-68

When the run view asks for Settings at an adapter's agent card [[run-view-45](run-view.md#run-view-45)], the Settings surface shall open with that adapter's card — or its entry beneath the cards [[settings-5](#settings-5)] — in view, leaving every other part as it was ([DR-189](../decisions/189-workshop-agents-in-one-pass.md)):

- the request is taken once, so returning to Settings later opens it as the reader left it.

#### settings-27

Where the Settings surface is open, the Settings surface shall offer adding a session player by naming its id and giving it a whole agent block ([DR-032](../decisions/032-session-players.md)), and shall report a rejected id in the shared-config write path's own words without writing:

- The seeded block is a complete, deliberate choice, so an untouched draft is savable.

### Workshop Adapters

#### settings-56

Where the Workshop switch — a constant in the interface's code, on by default — is on, the agent editor's adapter choices [[settings-1](#settings-1)] shall offer only `claude`, `codex` and the adapter the edited block already names, so a configuration naming `gemini`, `kimi` or `opencode` still loads, shows and may be changed to `claude` or `codex` while none of them is newly chosen ([DR-189](../decisions/189-workshop-agents-in-one-pass.md)):

- the validation rules of [[settings-2](#settings-2)] are unchanged;
- with the switch off, as in the release after the Workshop, every adapter the embedded runtime knows is offered, with nothing for a reader to do.

### Browser Capability

#### settings-42

Where an agent editor offers Browser, its control shall distinguish the agent's explicit tool-enabled choice from the execution host's reported preparation state ([DR-097](../decisions/097-media-and-browser-tools-across-hosts.md)):

- the control identifies an isolated browser on the computer running the session, never native desktop control;
- enabling changes only the choice, while Set up, Check, Retry and Cancel invoke their separately supplied preparation actions;
- preparing, ready and failed states display the host's supplied detail without inferring readiness from the choice or credentials;
- a failed state's summary stays compact, with the complete diagnostic available through a keyboard-accessible disclosure that preserves lines and strips terminal formatting; long diagnostics scroll within their own box and leave Retry reachable;
- an unsupported agent cannot be enabled, while a stale enabled choice can be cleared;
- a conversation's inherited or changed choice is identified, with a supplied reset action returning to Settings;
- disabled controls dispatch no change or preparation action.

#### settings-44

When an agent editor or conversation settings opens, the UI shall bind its browser control to the core's contextual capability and preparation protocol [[media-7](media.md#media-7)] [[media-8](media.md#media-8)] through these rules:

- query the proposed agent settings and selected project or draft context, rechecking after relevant edits and discarding stale replies;
- report known tool-approval transport support separately from browser admission and preserve unknown facts [[approvals-6](approvals.md#approvals-6)];
- show a known empty media-output source set as a screenshot-return limitation alongside the control without disabling supported browser tools, while absent output facts remain unknown;
- persist Browser only through the editor's ordinary explicit save, preserving false and conversation reset-to-configuration semantics [[media-9](media.md#media-9)];
- keep preparation separate from enabling, relay progress and diagnostic detail, allow retry and cancellation, and cancel owned work on close or context change;
- offer preparation for the authoring draft's selected configured agent without changing that agent's shared browser choice;
- leave unknown or unsupported capabilities disabled for new admission — a Browser the edit turns on or carries to another adapter — while a standing enabled choice can be cleared or kept as other values save, and preserve other editor values after failure.

### Model and Tuning Options

#### settings-34

When an agent, role-binding, or session-tuning editor opens or the adapter it uses changes, the editor shall request Cligent's model and tuning options through the core protocol [[settings-35](#settings-35)] ([DR-052](../decisions/052-runtime-model-options.md), [DR-091](../decisions/091-models-named-by-the-runtime.md)):

- Offer runtime model IDs, provider default, and explicit custom entry in the model field [[settings-39](#settings-39)], each model named by the display rule [[settings-38](#settings-38)]; recognize a saved ID reported as an alias's resolution without rewriting it, and retain unlisted values.
- Where Cligent reports the adapter serves a subagent model, or a value already stands, offer the subagent-model field [[settings-39](#settings-39)]: "Same as agent" first — the configured omission, running every subagent on the agent's own model — then the same runtime model IDs and custom entry, and "Off" — a `false`, which switches delegation off — only while one stands, in the block or in the editor's draft ([DR-093](../decisions/093-a-players-subagent-model.md), [DR-095](../decisions/095-a-subagents-effort-and-the-agents-own-model.md)).
- Beside it, offer the subagent-effort field: "Agent chooses" first — the configured omission, leaving each subagent's effort to the agent — then the adapter's subagent efforts [[settings-35](#settings-35)], a standing value outside them shown as requiring correction ([DR-095](../decisions/095-a-subagents-effort-and-the-agents-own-model.md)).
- Use known model effort and fast-mode support; supplement efforts only with adapter choices Cligent identifies as unreported by its discovery interface, labeling only added choices adapter-wide. Missing model metadata leaves adapter-wide options unverified for that model.
- Preserve draft values while loading or after failure, name unavailable discovery, and offer refresh.
- Where an agent editor's or an agent card's [[settings-57](#settings-57)] `claude` model field serves a `third-party` base URL [[settings-14](#settings-14)] and the catalog reports a `defaultModel` [[settings-35](#settings-35)], mark Provider default as recommended [[settings-39](#settings-39)]; with no `defaultModel`, mark nothing ([DR-189](../decisions/189-workshop-agents-in-one-pass.md)).
- Show unsupported effort or fast-mode selections as requiring correction, never silently removing values during discovery.
- Explicitly switching an agent's adapter resets model, subagent model, subagent effort, effort, and fast mode to defaults because those settings belong to the previous adapter.

#### settings-35

When the core receives `agent.options` for a known adapter, it shall return Cligent's adapter capabilities and bounded, task-free model discovery result without changing shared config or opening a Spex session:

- Discovery uses the core's captured environment.
- Adapter effort values, fast-mode support, subagent-model support and the adapter's subagent efforts — its effort values less its orchestration values, none where it serves no subagent model — accompany the discovery result ([DR-093](../decisions/093-a-players-subagent-model.md), [DR-095](../decisions/095-a-subagents-effort-and-the-agents-own-model.md)).
- Available results carry Cligent's optional `unreportedEffortValues` separately from each model's effort list: adapter efforts the discovery interface cannot report.
- Available results carry each model's optional `description` and the result's optional `defaultModel` — the model the runtime runs when none is configured — as Cligent reported them, absent where it reported none ([DR-091](../decisions/091-models-named-by-the-runtime.md)).
- Where Cligent reports no `defaultModel` for `claude` while the environment a run inherits sets `ANTHROPIC_MODEL` — Claude Code's user settings included [[core-service-150](core-service.md#core-service-150)] — the result's `defaultModel` is that value, the model a run then selects ([DR-190](../decisions/190-agent-cards-read-alike.md)).
- Unknown adapters are rejected by the protocol.
- Discovery failure is returned as unavailable; config load and save do not depend on discovery.

#### settings-38

Where a model editor [[settings-34](#settings-34)] names a model value against the runtime's catalog [[settings-35](#settings-35)] — a row, the runtime's `defaultModel`, or a value the field holds or the editor inherits, an empty one included — it shall read the value by one display rule, naming the specific model wherever the runtime reports one ([DR-091](../decisions/091-models-named-by-the-runtime.md)):

| The value is | It reads as |
| --- | --- |
| a row's id | the row's name, then the row's specific model: its `resolvedModel` where the id is an alias of it — differing from it and not beginning with it — and the name does not already say it ignoring case, nothing where it does, else the id where it differs from the name ignoring case, else nothing |
| only a row's `resolvedModel` | itself, a canonical pin recognized without rewriting it [[settings-34](#settings-34)] |
| no row's id or `resolvedModel` | itself |
| empty, taking the provider's default | "Provider default", then the runtime's `defaultModel` read by this rule where reported |
| empty, or the literal `inherit`, in a subagent-model field | "Same as agent" alone: every subagent runs on the agent's own model, so the catalog's `defaultModel` never follows ([DR-095](../decisions/095-a-subagents-effort-and-the-agents-own-model.md)) |
| `false`, in a subagent-model field | "Off": no subagent model is sent, and the runtime chooses a subagent's model by its own order ([DR-095](../decisions/095-a-subagents-effort-and-the-agents-own-model.md)) |

- in one line of text the name and the specific model join with " · ", and so do "Provider default" and the default model, as in "Opus · claude-opus-5-5", "Fable · claude-fable-5-1[1m]", "GPT-6-Astra" and "Provider default · opus[1m]";
- a name, an id, a resolved model and a description are the runtime's words, rendered as they came [[localization-1](localization.md#localization-1)].

#### settings-39

Where a model editor offers the runtime's model choices [[settings-34](#settings-34)], its model field shall present them as a single-select listbox opened from a trigger, each model read by the display rule [[settings-38](#settings-38)] ([DR-091](../decisions/091-models-named-by-the-runtime.md)):

- the trigger reads the chosen row: the value with its specific model muted, "Custom model…" while the hand-typed field holds the value, and for the empty value "Provider default" followed, muted, by the runtime's `defaultModel` where reported, or in a subagent-model field "Same as agent" alone [[settings-38](#settings-38)];
- the rows stand in this order: "Provider default" where the editor allows it, "Recommended" beside it where the editor marks it so [[settings-34](#settings-34)], its second line the `defaultModel` where reported, or in a subagent-model field "Same as agent" with no second line, then "Off" while it stands [[settings-34](#settings-34)] [[settings-38](#settings-38)]; a value recognized only through a resolution, as its own row; each catalog row in the runtime's order — one row per model the rows run, their `resolvedModel` else their id: the held value's row, else the row whose id is that model, else the group's last, the runtime listing its own default alias first; none for Provider default's model where it is marked recommended, unless held —, its first line the name with the specific model muted beside it and its second line the runtime's `description` where reported; and "Custom model…" last;
- the selected row wears a check and is marked selected to assistive technology, and a line too long for its row ends in an ellipsis, whole in the row's title;
- choosing "Custom model…", or holding a value no row lists, shows the hand-typed model ID field beneath the trigger, the unlisted value with the hint that the runtime does not list it, and while the catalog is loading, unavailable or empty the hand-typed field stands alone.

#### settings-40

While a model field's trigger has focus or its listbox is open [[settings-39](#settings-39)], the field shall answer the keyboard and the pointer alike, as the listbox idiom does ([DR-091](../decisions/091-models-named-by-the-runtime.md), [DR-010](../decisions/010-interface-craft.md) §6):

| Input | Effect |
| --- | --- |
| Enter, Space, Arrow Down or Arrow Up on the closed trigger | opens the listbox with the selected row active |
| a click on the trigger | opens the listbox with the selected row active, or closes it when open |
| Arrow Down or Arrow Up; Home or End | moves the active row by one; to the first or the last row — scrolled into view |
| Enter or Space, or a click on a row | chooses that row, closes the listbox and returns focus to the trigger |
| Escape | closes the listbox without choosing and returns focus to the trigger, the editor around it staying open |
| Tab | closes the listbox and moves on from the trigger |
| a press outside the field | closes the listbox |

- the listbox lies inside the box that must show it — the nearest box that clips, else the window — at every width down to the 320-pixel floor, refitting as either box resizes and scrolling its own rows when that box is the shorter ([DR-041](../decisions/041-chrome-that-fits.md)).

### Adapter Readiness

#### settings-5

Where the Settings surface is open, in its full form and in its broken-config form [[settings-24](#settings-24)] alike, the Settings surface shall show an Agents section holding a standing card for `claude` and one for `codex` — shown whether or not any position uses them — and beneath them one entry per other adapter the shared config references, each reflecting the core's readiness report [[settings-14](#settings-14)] ([DR-189](../decisions/189-workshop-agents-in-one-pass.md), [DR-190](../decisions/190-agent-cards-read-alike.md)):

- every card has one frame: a heading with the agent's name, its tag — "Recommended" on the `claude` card until it is ready, none on the `codex` card — its badge and its positions in brief; one line saying what is missing or what runs; and what to do, a not-ready card closing with one line;
- a card states ready in green, not ready in one amber attention tone whoever uses its adapter, sign-in unconfirmed — with "Sign-in could not be confirmed just now: <reason>. Re-check to try again." and no configuration steps — or unknown for an adapter with no preflight rule; a ready badge's tooltip reads "Found a sign-in or key; whether it works is checked on your first task.";
- its heading names the positions using its adapter — `captain`, and each session player with the `<playbook>.<role>` bindings it answers [[settings-26](#settings-26)] — naming the first and counting the rest, as using it, or not ready as needing it, a press opening the whole list beneath and the tooltip holding it; or it says no role uses it yet;
- not ready, a card shows its configuration [[settings-61](#settings-61)] alone, without its model service, its model, its one-model control [[settings-57](#settings-57)] or its official-name list [[settings-59](#settings-59)];
- ready, unconfirmed or unknown, its line names the `claude` card's model service by the base URL's state [[settings-14](#settings-14)] — "Anthropic official" for `unset`, "Third party <host>" for `third-party`, "Unrecognized" for `unknown`, nothing for `hidden` — beside the model its adapter's agents run in your own group's config: the one model by the display rule [[settings-38](#settings-38)], for Provider default the runtime's `defaultModel` [[settings-35](#settings-35)] or "Unavailable" where discovery failed or reported none, and "Several models" where they run different models — compared as they run, Provider default as the runtime's `defaultModel` and a catalog row's id or alias as its `resolvedModel`, so values naming one model read as that model; the model catalog is no readiness signal;
- with a valid config that line carries "Change model", a link in the brand tone with an edit icon, opening beneath it the one-model control [[settings-57](#settings-57)];
- a card not ready for a local credential of `claude` or `codex`, on this computer with the Workshop switch on [[settings-56](#settings-56)], offers the Workshop's setup guide [[settings-69](#settings-69)]; any other not-ready card offers a closed "How to configure" disclosure, holding the manual steps on this computer and, on a seat [[core-service-125](core-service.md#core-service-125)], a pointer to the Credentials section [[settings-48](#settings-48)] with no local step;
- the manual steps follow the core's platform and the user's shell [[settings-14](#settings-14)]: on Windows, a user environment variable set with `setx` or the system settings; elsewhere, an `export` line in `~/.zshrc` for zsh, in `~/.bash_profile` for bash, and otherwise in the shell's login configuration file;
- under "How to configure", the manual steps end "Quit Spex completely and open it again", the `codex` card's first saying it needs an official OpenAI key;
- the section heading carries the Re-check control — a refresh icon and "Re-check", its tooltip saying it reads each agent's sign-in and Claude Code's settings again while a key set as an environment variable needs Spex reopened — whose icon turns while the check runs, its readiness request reseeding an untouched seed [[core-service-137](core-service.md#core-service-137)] ([DR-191](../decisions/191-the-workshop-points-to-its-guide.md)).

### Agent Cards

#### settings-70

While the core has reported readiness, the Agents section shall state beneath its heading, with a warning icon in the amber attention tone, what needs doing before a task can start or run whole, read from the adapter the Captain uses, since the Captain runs first ([DR-190](../decisions/190-agent-cards-read-alike.md)):

| Readiness | Verdict |
| --- | --- |
| no adapter ready | "Set up at least one agent to start a task; Claude is recommended." |
| the Captain's not ready, another ready | "The Captain uses <adapter>, which is not ready: set it up, or switch the Captain to <ready adapter>." |
| the Captain's ready, a position on another adapter not ready | "Tasks can start, but <first position> uses <other>, which is not ready, so its steps fail until it is set up." |
| the Captain's ready otherwise | none |

- The Captain's adapter with null readiness states no verdict.

#### settings-57

Where your own group's config is valid, the `claude` card and the `codex` card [[settings-5](#settings-5)] shall each offer one model for every agent on its adapter — "This changes the model of every Captain and player on <adapter> at once. To change only the Captain's or one player's, edit its settings above." as one line above "[model] [Apply]" — through the model field of [[settings-39](#settings-39)], Provider default and custom entry included, its targets the Captain where its adapter is the card's and each session player on that adapter [[settings-26](#settings-26)] ([DR-189](../decisions/189-workshop-agents-in-one-pass.md)):

- a target takes the chosen model as its `model`, and Provider default as the removal of its `model` key;
- a role binding's own model is no target.

#### settings-58

When the reader chooses Apply on a card's one-model control [[settings-57](#settings-57)], the Settings surface shall ask for confirmation listing the agents it changes and the roles whose binding names a model of its own, which it leaves, and on confirmation submit the changes as one `config.batch` [[core-service-44](core-service.md#core-service-44)] carrying the revision of the config state the surface shows [[core-service-45](core-service.md#core-service-45)], then say it is done, listing the roles it left again ([DR-189](../decisions/189-workshop-agents-in-one-pass.md)):

- a batch refused `conflict` changes nothing, reads your own group's config and each project's composition shown again, offering no batch from any agent card's control from the start of that reading until every read succeeds — the hold kept with the place, through leaving the Settings surface and entering it again, and the answers shown only once all settle, never where a later reading again or a newer config state already replaced them — and once every read settles asks the reader to retry over them, or, where a read failed, says so with a control reading again; a refused violation names the agent and the rule [[settings-12](#settings-12)], and changes nothing;
- an effort the new model does not support stays, shown as requiring correction [[settings-34](#settings-34)];
- where the `claude` base URL is `third-party` [[settings-14](#settings-14)] and discovery failed or reported no `defaultModel` [[settings-35](#settings-35)], Apply is disabled while Provider default is chosen, beside "The default model can't be read right now: retry, or choose a specific model" and a Retry rediscovering the models, while a specific model applies as ever.

#### settings-59

While the `claude` readiness entry's base URL is `third-party` [[settings-14](#settings-14)], the `claude` card shall list every role whose effective model is an official model name — the Captain by its own `model`; a role of your own group's config or of a project's composition [[core-service-2](core-service.md#core-service-2)] by its binding's own model, a specific model or Provider default alike, else by its player's `model`, a project's file binding players by name alone — saying "Some roles still name a Claude model, which <host> may bill as another model or refuse" with the control "Use <model> for all", naming Provider default by the runtime's `defaultModel` [[settings-35](#settings-35)], or "Set all to Provider default" where none is read, and the roles folded beneath "Show which roles", the list recomputed from the newest config state ([DR-189](../decisions/189-workshop-agents-in-one-pass.md), [DR-190](../decisions/190-agent-cards-read-alike.md)):

- an official model name begins with `claude-`, or is `opus`, `sonnet`, `haiku` or `fable`, each optionally followed by `[1m]`, ignoring case;
- under any other base-URL state the card shows neither the list nor the control.

#### settings-60

When the reader chooses the official-name list's control [[settings-59](#settings-59)], the Settings surface shall ask for confirmation listing each role, its model now and its target — Provider default with the runtime's `defaultModel` [[settings-35](#settings-35)] — and on confirmation submit one `config.batch` [[core-service-44](core-service.md#core-service-44)] carrying the revision of the config state shown [[core-service-45](core-service.md#core-service-45)], writing by where each official name stands ([DR-189](../decisions/189-workshop-agents-in-one-pass.md)):

| The official name stands on | The batch writes |
| --- | --- |
| the Captain | the Captain's `model` removed |
| a player, its role's binding naming no model of its own | that player's `model` removed |
| a binding in your own group's file | `model: false` on that binding — Provider default, never inheriting the player |

- once written, the card recomputes the list from the newest config state and lists every role still naming an official model, saying all were set only where none remains;
- a batch refused `conflict` changes nothing, reads your own group's config and each project's composition shown again, offering no batch from any agent card's control from the start of that reading until every read succeeds — the hold kept with the place, through leaving the Settings surface and entering it again, and the answers shown only once all settle, never where a later reading again or a newer config state already replaced them — and once every read settles asks the reader to retry over them, or, where a read failed, says so with a control reading again;
- where discovery failed or reported no `defaultModel`, the control is disabled beside "The default model can't be read right now" and a Retry rediscovering the models.

#### settings-61

While an agent card reports not ready [[settings-14](#settings-14)], the card shall phrase each fault by its kind and, for `claude`, by the base URL's state, keeping the core's own requirement, where its guidance is in other words, as that guidance's tooltip rather than a second line ([DR-189](../decisions/189-workshop-agents-in-one-pass.md)):

| Fault | Guidance |
| --- | --- |
| `runtime` | the core's requirement, as it reads |
| local `credential` of `claude` or `codex`, the Workshop switch on [[settings-56](#settings-56)] | what is missing, then the setup guide [[settings-69](#settings-69)] |
| `credential` of `claude`, base URL `unset`, the switch off | "Sign in by running claude in a terminal, or set `ANTHROPIC_API_KEY`" |
| `credential` of `claude`, base URL `third-party`, the switch off | "Set `ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_BASE_URL`" |
| `credential` of `claude`, base URL `unknown`, the switch off | "`ANTHROPIC_BASE_URL` is not recognized: check the address, then set its credential" |
| `credential` of `codex`, the switch off | "Run codex login, or set `OPENAI_API_KEY` (an official OpenAI key)" |
| `credential` on a seat | the credential class's phrase [[settings-49](#settings-49)], pointing to the Credentials section [[settings-48](#settings-48)] |
| `credential` of another adapter | the core's requirement, as it reads |

- both kinds unmet show both;
- with the switch off, a local credential fault of `claude` with base URL `unset`, or of `codex`, ends "After signing in, re-check; after setting the key, quit Spex completely and open it again — see How to configure", any other local credential fault "Then quit Spex completely and open it again — see How to configure".

#### settings-69

Where the Workshop switch is on [[settings-56](#settings-56)], while an agent card on this computer reports a credential fault of `claude` or `codex` [[settings-14](#settings-14)], the card shall state what is missing, the core's requirement as its tooltip, then say whom the setup is for over its one action, the setup guide, and close with a line saying to re-check once connected ([DR-189](../decisions/189-workshop-agents-in-one-pass.md), [DR-191](../decisions/191-the-workshop-points-to-its-guide.md)):

| Fault | What is missing |
| --- | --- |
| `claude`, base URL `unset` | "Not signed in on this computer, and no key set" |
| `claude`, base URL `third-party` | "The third-party service <host> is set, but its key is not" |
| `claude`, base URL `unknown` | "`ANTHROPIC_BASE_URL` is not an address Spex recognizes" |
| `codex` | "Not signed in on this computer, and no key set" |

- what is missing stands in neutral text with no icon, as the route does, the badge carrying the attention tone [[settings-5](#settings-5)] and the section's verdict the one warning [[settings-70](#settings-70)];
- no online service is offered;
- the route reads, on the `claude` card, "Connect Claude with a Claude subscription, or an Anthropic-compatible API key such as DeepSeek's: the setup guide walks you through it.", and on the `codex` card "Connect Codex with a ChatGPT subscription or an official OpenAI API key: the setup guide walks you through it.", over the primary action "Open the setup guide", sized as the card's other controls, which opens the Workshop's configuration document in the browser at its section for the core's platform — Windows or macOS — on the `codex` card at that platform's Codex section, and at its top on any other platform;
- the closing line reads "Once connected, press Re-check; if nothing changes, quit Spex completely and open it again."

### Preferences

#### settings-6

Where the Settings surface is open, the Settings surface shall provide editors for the shared config's `layout` (pane column weights), `notifications`, and `theme` maps:

- When a preference change is saved, the change appears under the corresponding top-level map in the shared config file.
- A preference control is disabled while its edit is in flight and, once the edit lands, a transient "Saved ✓" status stands beside it — on the row beside the edit control for an agent editor, which has closed by then [[settings-1](#settings-1)] — so no edit goes unacknowledged ([DR-010](../decisions/010-interface-craft.md) §3).
- The `theme` editor is labeled as the terminal pane theme for CLI-run sessions only, stands last, and says Spex itself follows the OS theme.

#### settings-37

Where the Settings surface is open, the Settings surface shall provide a language control in its own section before the terminal pane theme, offering System, English and 简体中文, showing the home's choice [[core-service-108](core-service.md#core-service-108)] and writing a change as the home's choice [[core-service-109](core-service.md#core-service-109)], so every page of the home follows it [[localization-3](localization.md#localization-3)]:

- the control's effect is a phrase beside it — System follows the reader's device — and no sentence ([DR-069](../decisions/069-key-phrases-not-sentences.md));
- the control is disabled while its write is in flight and shows the transient Saved status once it lands, as any preference control [[settings-6](#settings-6)], the status surviving the interface's re-rendering in the chosen language.

### Config File Semantics

#### settings-7

When a Settings edit is saved, the Settings surface shall write your own group's config file — `config/playbook.config.yaml` in your own group's spex repository [[storage-1](storage.md#storage-1)] — as a targeted edit that preserves comments, key order, and keys the Settings surface does not recognize, so the file stays hand-editable for playbook CLI use ([DR-004](../decisions/004-config-and-persistence.md), [DR-103](../decisions/103-the-home-and-its-groups.md); see [[settings-13](#settings-13)]).

#### settings-8

While the Settings surface is open, when the shared config file changes on disk from outside the app, the Settings surface shall refresh the displayed values to the new file content and show a notice that the config changed externally:

- When the external change conflicts with unsaved edits in the Settings surface, the notice says so; resolution is last-writer-wins per [DR-004](../decisions/004-config-and-persistence.md).

#### settings-9

Where the app starts on a machine whose own group holds no config file, while the core service has seeded the starter config there ([DR-004](../decisions/004-config-and-persistence.md)), the Settings surface shall display the starter's values as the current settings before any user save, and the displayed values shall equal the seeded file's content:

- For that run the surface says it created a starter config at the file's path, so the file's origin is never a mystery.
- Where the core instead rewrote an untouched seed for the current sign-ins [[core-service-137](core-service.md#core-service-137)], the surface says it updated the starter config at the file's path for the current sign-ins, never that it created one ([DR-156](../decisions/156-an-untouched-seed-follows-the-credentials.md)).

#### settings-46

While a project's config file names, for a role, a player your own group's file lacks [[core-service-2](core-service.md#core-service-2)], the Settings surface shall show that player in the roster as "Named by <project>, not set up here" with an Add control that creates it from the neutral block, so every member names players and each person picks their own models ([DR-103](../decisions/103-the-home-and-its-groups.md), [DR-172](../decisions/172-surfaces-a-fresh-user-reads.md)):

- the Settings surface shows the file it writes — your own group's — by its path [[settings-54](#settings-54)], naming no spex repository, and names no project file as editable here: a project's playbooks and role bindings are edited in the project's Playbooks tab [[playbook-library-1](playbook-library.md#playbook-library-1)].

### Guidance

#### settings-10

Where the Settings surface presents an editable setting, the Settings surface shall accompany the setting with a short inline description of its effect; no setting shall appear as a bare, unexplained control:

- the permission mode's description follows the selected mode — `auto` working on its own inside the repo under the adapter's protections, `bypass` running with no permission prompts and for sandboxed repos only, none leaving the adapter's default;
- the writable-paths field carries a worked example;
- the surface lists the app's keyboard shortcuts [[run-view-49](run-view.md#run-view-49)] as a sheet of keys and what each does, printing the platform's own modifier.

#### settings-22

While the notifications editor lists notification events, each event shall be labeled with a human-readable phrase from the app's notification label map rather than the wire event id ([DR-010](../decisions/010-interface-craft.md) §2); the wire id shall remain available in the row's tooltip:

- the label takes a 14rem basis and shrinks, and the row wraps its select under the label when the pane is too narrow for both ([DR-041](../decisions/041-chrome-that-fits.md)).

#### settings-23

While an agent card reports not ready, the core's own requirement — shown where the card phrases a fault in it [[settings-61](#settings-61)] — shall render in full, wrapping onto further lines as needed rather than truncating.

#### settings-24

While the shared config file is missing or invalid, the Settings surface shall show the config file's path together with a secondary control that copies the path to the clipboard and briefly confirms the copy in place, so the user can open the file in an editor:

- missing: the surface says Spex could not create a starter config at that path, tells the user to check the folder is writable and retry, and offers a Retry control that re-reads the app state — never telling the user to fix a file that is not there;
- invalid: the surface lists the errors and says the file, fixed in an editor, reloads live.

### Surface Fit

#### settings-32

The Settings surface shall scroll its sections inside its own box, which fills the surface it is given and never grows past it — in its broken-config form [[settings-24](#settings-24)] as in its full one ([DR-041](../decisions/041-chrome-that-fits.md)):

- that box and the shortcut sheet's sideways-scrolling table [[settings-10](#settings-10)] are positioned boxes, so the screen-reader-only text they hold — the sheet's own caption — is contained by the box it sits in rather than being carried by the page.

#### settings-33

While the agent editor [[settings-1](#settings-1)] stands open as an anchored popover ([DR-009](../decisions/009-at-hand-interaction.md)), the popover shall lie inside the box that must show it — the nearest box that clips, else the window — at every pane width down to the 320-pixel floor, refitting whenever the window or the popover's own box resizes ([DR-041](../decisions/041-chrome-that-fits.md)):

- that box bounds the popover's width and height, and the editor scrolls its own content when the box is the shorter of the two;
- an anchor too near an edge for the popover's side moves the popover along that edge instead of past it, because what leaves a pane to the left or above it never becomes scrollable.

#### settings-54

The Settings surface's header shall name the place shown — "This computer", or the server's name where the selector names a seat [[run-view-168](run-view.md#run-view-168)] — beneath its title, and shall show the config file's path `~`-shortened under the user's home directory with the full path in its title, saying "Shared with the playbook CLI — edits made outside appear here" in that title alone and naming no spex repository ([DR-159](../decisions/159-projects-in-groups-opened-where-you-work.md)).

### Credentials on a Seat

#### settings-48

Where the core runs as a seat [[core-service-125](core-service.md#core-service-125)], the Settings surface shall show, in its full form and in its broken-config form [[settings-24](#settings-24)] alike, a Credentials section taking a code host's token — the host name and the token — and, per agent, a credential of the member's own by the agent's forms [[settings-49](#settings-49)], each sent as `credential.set {kind: 'host' | 'agent', name, values}`, removed with `credential.remove {kind, name}`, and listed by `credential.list` as the hosts and agents set with no secret echoed ([DR-132](../decisions/132-team-servers.md)):

- the core keeps them under `local/` [[storage-44](storage.md#storage-44)], applies an agent's to its runs as its environment [[core-service-126](core-service.md#core-service-126)] and a host's to every transport to that host [[git-host-9](git-host.md#git-host-9)];
- the section says "A credential you place here stays on this server until you remove it", and names a host whose clone failed for want of one [[space-103](space.md#space-103)];
- a blank name or value, a host name that is no host, or an agent credential without the agent's key form — Kimi's `KIMI_MODEL_API_KEY` beside its companions [[settings-49](#settings-49)] — is refused `invalid_request` before anything is written.

#### settings-49

Where the core runs as a seat [[core-service-125](core-service.md#core-service-125)], when readiness is evaluated, the core service shall count the forms below as an agent's credential half over the launcher's rules [[settings-14](#settings-14)], run the agent's own status command with the run's environment where the agent has one — `claude auth status`, `codex login status` — and report each adapter's credential class with its phrase ([DR-132](../decisions/132-team-servers.md)):

| Agent | Shared and own forms |
| --- | --- |
| `claude` | `CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` |
| `codex` | `CODEX_ACCESS_TOKEN`, `CODEX_API_KEY`, `OPENAI_API_KEY` |
| `opencode` | `OPENCODE_AUTH_CONTENT` |
| `gemini` | `GEMINI_API_KEY`, `GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_API_KEY` |
| `kimi` | `KIMI_MODEL_API_KEY` with `KIMI_MODEL_NAME`, `KIMI_MODEL_BASE_URL` and `KIMI_MODEL_PROVIDER_TYPE` |

| Class | Holds while | Phrase |
| --- | --- | --- |
| `own` | the member set a credential for the agent [[settings-48](#settings-48)] | "Your own credential" |
| `shared` | a shared form of the agent is in the shared file [[core-service-126](core-service.md#core-service-126)] | "Signed in by this server's administrator" |
| `unreadable` | the shared file cannot be read | "This server's shared sign-in cannot be read: ask its administrator" |
| `expired` | the agent's status command reports the credential expired or refused | "This server's shared sign-in has expired: ask its administrator", or "Your own credential has expired" |
| none | no form of the agent is set | the launcher's not-ready guidance, naming the Credentials section in place of a terminal login |

## Internal Behavior

### Validation

#### settings-31

Where the Settings surface is open, the Settings surface shall print the app's version beside the protocol version — the desktop's build version from the page's `?version=` query, else the served shell's version from the page's `spex-version` meta element [[server-shell-4](server-shell.md#server-shell-4)] — printing "dev" only where neither shell delivered the page.

#### settings-11

Where the core service validates the shared config — at load for session composition and on a Settings save command — the core service shall use a single validation module applying one launcher-parity rule set ([DR-019](../decisions/019-inline-agent-configuration.md)) with stable rule identifiers in both paths: inline agent blocks with scalar adapter ids normalizing to bare-adapter blocks, adapter ids bounded by the embedded runtime's known set, and reasoning efforts bounded by each adapter's vocabulary:

- A config rejected at load time is rejected on save with the same rule identifier, and vice versa; the retired `profiles` map and `profile` key are the one asymmetry — migrated in place at load, rejected in a save [[settings-2](#settings-2)].

#### settings-12

When a Settings save command carries a merge patch whose resulting config fails validation (see [[settings-11](#settings-11)]), the core service shall reject the command without writing the shared config file and shall return each violation with its rule identifier and field location over the WebSocket protocol.

### Config Writing

#### settings-13

When the core service applies an accepted Settings save to the shared config file, the core service shall perform a targeted YAML edit: comments, key order, and keys not touched by the edit shall be preserved, and file content outside the edited nodes shall remain byte-identical:

- Reformatting is confined to the edited nodes.

### Readiness

#### settings-14

Where the core service evaluates adapter readiness, the core service shall report readiness keyed by adapter — an entry for `claude` and one for `codex` always, and one deduplicated entry per other adapter the active config references, each carrying the positions using it — `captain`, and each session player with the bindings it answers — none where no position does, and while the config is missing or invalid the `claude` and `codex` entries alone with no positions — applying per-adapter rules that combine a runtime half with a credential half ([DR-024](../decisions/024-app-supplied-agent-runtimes.md), [DR-004](../decisions/004-config-and-persistence.md), [DR-189](../decisions/189-workshop-agents-in-one-pass.md)): an adapter whose runtime cligent's availability probe finds unusable [[core-service-9](core-service.md#core-service-9)] is not ready whatever its credential class, and one whose cligent-published runtime is missing or below cligent's supported floor carries cligent's verdict and the repair for its install tree — the pinned global install for a `PATH` runtime, reinstall guidance for a bundled SDK; over a usable runtime, `claude` is ready when `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` or `CLAUDE_CODE_OAUTH_TOKEN` is set, in the core's environment or the `env` of Claude Code's user settings file, and `codex` when `OPENAI_API_KEY`, `CODEX_API_KEY` or `CODEX_ACCESS_TOKEN` is set — the variables of Playbook's launcher — and otherwise by the agent's own sign-in, its home folder alone never counting; both halves unmet report both requirements; an adapter with a usable runtime and no credential rule shall be reported with null readiness and verify-yourself guidance rather than not ready; on a seat the credential half is [[settings-49](#settings-49)]'s:

- The agent's own sign-in is its status command — `claude auth status` read by the `loggedIn` its JSON states, `codex login status` by exit 0 or "Not logged in" on a failing exit — run on the executable the adapter spawns with the environment an agent run inherits, for at most 5 seconds, and only where the agent's configuration folder exists — `CLAUDE_CONFIG_DIR` or `~/.claude`, `CODEX_HOME` or `~/.codex` — a missing folder reading signed out, so no status command creates the folder Playbook's seed reads [[core-service-3](core-service.md#core-service-3)].
- A status command that does not start, runs past its time, fails otherwise or answers in words not read leaves the sign-in unconfirmed: null readiness carrying the reason in the reader's words and no fault, never not ready; an unusable runtime still makes the entry not ready, its runtime fault alone.
- Each entry lists its unmet requirements as faults, each of kind `runtime` or `credential` with its own requirement, beside the requirement string joining them.
- The `claude` entry carries its base URL's state and every entry the core's platform and the user's shell, as the protocol reports them [[core-service-9](core-service.md#core-service-9)].
- Environment lookups use the environment the core captured ([DR-004](../decisions/004-config-and-persistence.md)) — on macOS and Linux the login shell's — not the bare app process environment; on Windows, its source is the Windows host's ([DR-189](../decisions/189-workshop-agents-in-one-pass.md)).

### External Changes

#### settings-15

While the core service watches the shared config file, when the file changes on disk from a write the core service did not perform, the core service shall reload and revalidate the file and push the updated config state together with an external-change notice over the WebSocket protocol:

- Writes performed by the core service do not trigger the external-change notice.

### UI Boundary

#### settings-16

Where the Settings UI renders or edits configuration, the Settings UI shall obtain config state, validation results, and readiness results exclusively as WebSocket protocol messages and shall submit edits exclusively as protocol commands ([DR-002](../decisions/002-desktop-app-architecture.md)); it shall not read or write the filesystem or the process environment.

#### settings-21

When an in-place editor saves an agent-block tweak — the captain's or a player's — the core package shall apply it as a merge patch that alters only the provided keys, leaving every other field, hand-written keys such as `instruction`, and comments of the block's config node intact, per [DR-009](../decisions/009-at-hand-interaction.md) and [DR-019](../decisions/019-inline-agent-configuration.md).

## Verification

### Browser Control Coverage

#### settings-43

Where a rendered browser control receives capability and preparation updates from its host-facing owner, the integration suite shall verify independent choice and preparation actions, retained off state after successful preparation, reported progress and failure detail, cancellation, unsupported stale-choice clearing, conversation reset, disabled behavior and localized labels [[settings-42](#settings-42)]:

- multiline terminal diagnostics remain completely readable through the disclosure, without terminal formatting, while a long first line cannot displace the summary or Retry;
- the rendered failure control and expanded diagnostics fit at 320 pixels, with Retry still reachable.

### Model Options Coverage

#### settings-36

Where runtime discovery supplies model-specific metadata, unavailable discovery, and a delayed response for a previously selected adapter, the test suite shall exercise the protocol and editors to verify model IDs and alias resolutions, model-specific tuning with only discovery-declared supplements, preserved custom values, adapter switches resetting model/subagent model/subagent effort/effort/fast mode, refresh, and rejection of stale results [[settings-34](#settings-34)], without task execution or config mutation during discovery and with each model's description and the catalog's default model carried as reported, and each adapter's subagent-model support and subagent efforts as Cligent reports them, never an orchestration value among the efforts [[settings-35](#settings-35)], and, where Claude's discovery names no default model while Claude Code's user settings set `ANTHROPIC_MODEL`, that value as the default model [[settings-35](#settings-35)].

#### settings-41

Where the agent editor and the role-binding editor render against fixture catalogs modeled on the Claude and Codex runtimes — aliases resolving to specific models, a row whose id extends its resolved model, rows named as their ids, descriptions on some rows, and a `defaultModel` in one catalog and none in the other — the test suite shall assert through the rendered editors:

- the trigger and every row read by the display rule, the runtime's default alias of the held model listing no row of its own, and a value recognized only through a resolution and a value no row lists each read as themselves, the unlisted one with its hint [[settings-38](#settings-38)] [[settings-39](#settings-39)];
- the provider default reads "Provider default" with the `defaultModel` where the catalog reports one, joined by " · " in the trigger's title, and nothing more where it does not [[settings-38](#settings-38)] [[settings-39](#settings-39)], and each description stands as its row's second line [[settings-39](#settings-39)];
- the keyboard opens the listbox on its selected row, walks it with the arrows, Home and End, chooses with Enter, and closes it with Escape leaving the editor open and focus on the trigger, while a click chooses a row and a press outside closes it [[settings-40](#settings-40)];
- choosing "Custom model…" shows the hand-typed field, which keeps what is typed [[settings-39](#settings-39)];
- the Captain's and a player's editor stands the model beside the effort and the subagent model beside the subagent effort [[settings-1](#settings-1)];
- the subagent-model field reads "Same as agent" for an unset value with no default model beside it and offers "Off" only while a `false` stands, configured or copied into the draft, and the subagent-effort field reads "Agent chooses" for an unset value and lists the adapter's efforts without its orchestration value [[settings-34](#settings-34)] [[settings-38](#settings-38)] [[settings-39](#settings-39)].

### Round-Trip Coverage

#### settings-17

Where captain agent-block edits [[settings-1](#settings-1)] are exercised through the core service's Settings command surface [[settings-7](#settings-7)], given a shared config file whose `captain` block carries comments, a hand-written `instruction`, and keys unknown to Settings, the test suite shall assert that after each merge-patch save the file contains the requested change, every comment, hand-written field, and unknown key survives [[settings-21](#settings-21)], and file content outside the edited nodes is byte-identical to the pre-run content [[settings-13](#settings-13)].

### Validation Coverage

#### settings-18

Where validation is exercised, given fixture edits the playbook launcher rejects — at minimum one reintroducing a retired `profile` key, one whose effort falls outside the selected adapter's vocabulary, and one naming an adapter outside the embedded runtime's set [[settings-2](#settings-2)] — the test suite shall assert for each fixture that the save command is rejected with a violation carrying a rule identifier and field location [[settings-12](#settings-12)], that the shared config file's bytes are unchanged [[settings-3](#settings-3)], and that for the effort and adapter fixtures loading a config with the same defect reports the same rule identifier as the rejected save [[settings-11](#settings-11)].

### Readiness Coverage

#### settings-19

Where adapter readiness is exercised, given fixture environments and home directories covering each credential rule — each credential environment variable of `claude` and of `codex`; the agents' folders present with their status commands answering signed out, signed in and unconfirmed; the folders absent — a usable and an unusable runtime, base URLs unset, naming `api.anthropic.com`, naming another host with a path and a key, and not parsing, a Claude settings file setting a key and another host over an environment naming `api.anthropic.com`, and a config referencing one adapter from several positions and not referencing `codex`, the test suite shall assert that the readiness results delivered over the protocol:

- match the expected state per adapter as one deduplicated entry naming its positions, with `claude` and `codex` both present and the unreferenced one naming none [[settings-14](#settings-14)];
- ask no status command where a credential variable is set or the agent's folder is absent, and ask the others in the core's home, the folders alone reading not ready [[settings-14](#settings-14)];
- report an unconfirmed sign-in as null readiness with its reason and no fault, and over an unusable runtime as not ready with the runtime fault alone [[settings-14](#settings-14)];
- list a runtime fault and a credential fault each by its kind, both where both halves are unmet, beside the joined requirement [[settings-14](#settings-14)];
- carry the `claude` base URL as `unset`, `unset`, `third-party` with the host name alone, and `unknown`, and the settings file's host over the environment's, its key counting as the credential [[settings-14](#settings-14)], and the core's platform and shell on every entry [[settings-14](#settings-14)];
- report null readiness with verify-yourself guidance for an adapter with no preflight rule [[settings-14](#settings-14)];
- with the config missing, and again invalid, hold the `claude` and `codex` entries alone, with no positions [[settings-14](#settings-14)].

#### settings-45

When rendered editors exchange capability and browser preparation messages with a fixture core client, integration verification shall assert contextual requests, stale-result suppression, scoped progress, cancellation and retry, unchanged choices after setup, explicit shared saves and conversation false/null overrides, and authoring preparation without configuration writes [[settings-44](#settings-44)]:

- known empty media output shows its limitation without blocking supported browser access, unknown output shows no unsupported claim, and stale capability replies cannot replace either state;
- an agent configured with Browser whose support check failed or reads unknown saves an effort change through the shared editor and the conversation settings, while Browser newly copied from the Captain onto such an agent leaves Save disabled [[settings-44](#settings-44)];
- a served-browser journey shall verify unknown support and stale-choice clearing through the real core, including the editor at 320-pixel and 1280-pixel widths;
- served-browser and Electron host acceptance shall perform native credential-free browser preparation from the UI and save an explicit choice, keeping successful setup separate from that choice; source and packaged Electron hosts shall each start with an independently empty managed browser cache and no external Node on PATH.
- acceptance waits observe the current control's terminal outcome: ready continues, failure or explicit cancellation stops promptly with the complete displayed diagnostic, and an absent terminal outcome remains bounded; initial idle state never passes or fails preparation.

### Roster Coverage

#### settings-53

Where Settings is asked for the Captain's row and, separately, for `dev.reviewer`'s and for a player the roster lacks, the test suite shall assert the asked row's editor opens in view while the others stay closed, the missing player opens none, and a later visit opens Settings as the reader left it [[settings-52](#settings-52)], and that Settings asked for the `codex` agent card brings that card into view once, a later visit leaving the scroll as the reader left it [[settings-68](#settings-68)].

#### settings-28

Where the Settings surface renders a config whose roster holds a bound player and an unbound one, the test suite shall assert each player prints its name and mark with its id in the tooltip, its agent with the adapter's readiness, and the bindings it answers [[settings-26](#settings-26)]; that editing one writes a merge patch over that player alone [[settings-26](#settings-26)]; that a refused removal shows the write path's own words beside it [[settings-26](#settings-26)]; and that adding a player writes the named id with the seeded block from an untouched draft [[settings-27](#settings-27)].

### External Edit Coverage

#### settings-20

Where external edit reflection is exercised, given a connected client holding Settings state, when the shared config file is modified on disk by a writer other than the core service, the test suite shall assert that the client receives the updated config state [[settings-8](#settings-8)] and an external-change notice [[settings-15](#settings-15)], and that a subsequent save performed through the core service produces no external-change notice [[settings-15](#settings-15)].

### Presentation Coverage

#### settings-25

Where the Settings surface renders against fixture state, the test suite shall assert that each notification row shows its human-readable label with the wire event id in the row's tooltip [[settings-22](#settings-22)], that a not-ready adapter's long fix requirement renders without truncation [[settings-23](#settings-23)], and that with an invalid config the copy control places the config file path on the clipboard and shows a transient copied confirmation [[settings-24](#settings-24)]:

- the Captain stands as a collapsed row with an edit control and no removal, its editor opening on that control with Save and Cancel, Cancel and Escape closing it without a write and handing focus back to the control, and a player's editor opening closing the Captain's [[settings-1](#settings-1)];
- a saved Captain edit closes its editor and shows the transient Saved status on the Captain's row, and a notification select is disabled while its edit is in flight and ticks once it lands [[settings-6](#settings-6)];
- the language control lists System, English and 简体中文, shows the home's stored choice, is disabled while a change is in flight, and ticks once the write lands, through the whole app re-rendering in the new language as well [[settings-37](#settings-37)];
- the terminal theme editor stands last under its CLI-only name [[settings-6](#settings-6)];
- a seeded config names the created file, a reseeded one names the file it updated for the current sign-ins and never a creation, and a loaded one says nothing [[settings-9](#settings-9)];
- the permission mode's description follows the selected mode, and the shortcut sheet lists the bindings with the platform's modifier [[settings-10](#settings-10)];
- a missing config names the could-not-create remedy with a Retry that refreshes the app state, and never the fix-in-editor line [[settings-24](#settings-24)].

#### settings-51

Where the UI holds a seat's store over a fake client, the test suite shall assert the Credentials section [[settings-48](#settings-48)]: its fixed sentence; the host form sending `credential.set` with the host and the token and the agent forms sending it with the agent's names; the listing naming the hosts and agents set with no secret shown; a remove sending `credential.remove`; a blank name or value refused in place; the host a failed clone named shown; and the section opened at that host.

### Agent Card Coverage

#### settings-62

Where the agent editor renders over a block naming `claude` and over one naming `gemini`, with the Workshop switch on and again off, the test suite shall assert that with it on the adapter choices are `claude` and `codex`, and `gemini` beside them for the block naming it, which reads `gemini` and may be changed to `claude`, while off every known adapter is offered [[settings-56](#settings-56)].

#### settings-63

Where the Settings surface renders a valid config whose roles bind official and third-party model names, against a `claude` catalog reporting a `defaultModel`, for each base-URL state of the case table, the test suite shall assert through the rendered cards:

| Base URL | Model service | Official-name list | Credential guidance, not ready | Recommended mark |
| --- | --- | --- | --- | --- |
| `unset` | "Anthropic official" [[settings-5](#settings-5)] | none [[settings-59](#settings-59)] | with the Workshop switch on, no model service [[settings-69](#settings-69)]; off, sign in or set it [[settings-61](#settings-61)] | none [[settings-34](#settings-34)] |
| `third-party` | "Third party" with its host [[settings-5](#settings-5)] | listed, with the control [[settings-59](#settings-59)] | on, the host's missing key [[settings-69](#settings-69)]; off, `ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_BASE_URL` [[settings-61](#settings-61)] | on Provider default [[settings-34](#settings-34)] [[settings-39](#settings-39)] |
| `unknown` | "Unrecognized" [[settings-5](#settings-5)] | none [[settings-59](#settings-59)] | on, the unrecognized address [[settings-69](#settings-69)]; off, check the address [[settings-61](#settings-61)] | none [[settings-34](#settings-34)] |
| `hidden`, on a seat | nothing [[settings-5](#settings-5)] | none [[settings-59](#settings-59)] | the class's phrase and the Credentials section, no local step [[settings-61](#settings-61)] | none [[settings-34](#settings-34)] |

- each fault the card phrases in its own words keeps the core's requirement whole as its tooltip and shows it nowhere else, while a runtime fault shows it whole [[settings-23](#settings-23)] [[settings-61](#settings-61)];
- with the switch off, the `unset` guidance and the `codex` guidance end with re-checking after signing in, the others with quitting and reopening Spex [[settings-61](#settings-61)]; with it on, none ends so, the route's closing line closing them [[settings-69](#settings-69)];
- a runtime fault shows the core's requirement alone, and a card missing both halves shows both [[settings-61](#settings-61)];
- a card whose sign-in is unconfirmed reads "sign-in unconfirmed" with its reason and Re-check, no configuration steps, while an adapter with no preflight rule still reads unknown with no such line [[settings-5](#settings-5)].

#### settings-64

Where the Settings surface renders a not-ready `claude` card and an unused `codex` card for each case — this computer with the Workshop switch on and off, a seat, and the core's platform and shell given as macOS with zsh, macOS with bash, macOS with fish and Windows — the test suite shall assert:

- only on this computer with the switch on, each card states what is missing in neutral text, then the route naming the card's subscription and keys with the primary action "Open the setup guide", which opens the configuration document at the section for macOS, for Windows, Codex's own within each on the `codex` card, and at its top otherwise, and closes with its re-check line, showing no manual step and no online service [[settings-69](#settings-69)];
- with the switch off, the manual steps stand closed under "How to configure", ending with quitting and reopening Spex, the `codex` card's naming an official OpenAI key, and a seat points to the Credentials section with no local step [[settings-5](#settings-5)];
- with the switch off, the manual steps name `~/.zshrc`, `~/.bash_profile`, the shell's login file and `setx` respectively [[settings-5](#settings-5)];
- a not-ready card names its first position and counts the rest, opening the whole list beneath and holding it as the tooltip, and shows no model service, default model or one-model control [[settings-5](#settings-5)];
- the `codex` card's not-ready badge, unused, takes the same attention tone as the `claude` card's, used, the `claude` card alone tagged [[settings-5](#settings-5)];
- a ready card has no closing line, its badge's tooltip saying the connection is checked on the first task; it names its positions in brief, opening the whole list, and states its model service with the model its agents run — one model, or "Several models" — opening the one-model control only from "Change model", its label and the Session players line one line above the field [[settings-5](#settings-5)] [[settings-57](#settings-57)];
- the Re-check control reads "Re-check" with its tooltip naming the sign-ins and Claude Code's settings, and no restart line stands beside it [[settings-5](#settings-5)].

#### settings-71

Where the Settings surface renders the cards over each readiness row of [[settings-70](#settings-70)], and again before the core has answered, the test suite shall assert the verdict's text for each row, none where nothing needs doing and none before the answer [[settings-70](#settings-70)], with the `claude` card tagged "Recommended" in every row where it is not ready and untagged where it is, and the `codex` card untagged in every row [[settings-5](#settings-5)], and that behind a third-party service the official-name list states its one line naming the host, its control naming the runtime's default model and its roles folded [[settings-59](#settings-59)], and that over a catalog modeled on Claude Code's behind DeepSeek the one-model control lists one row per model, none for Provider default's [[settings-39](#settings-39)], a resolution its name already says reading once [[settings-38](#settings-38)].

#### settings-65

Where the Settings surface renders with the config missing and again invalid, the test suite shall assert that the `claude` and `codex` cards still show their readiness and configuration steps beside the broken-config notice, with no one-model control and no official-name control [[settings-5](#settings-5)] [[settings-57](#settings-57)] [[settings-59](#settings-59)], and that on a seat the Credentials section their steps point to stands too [[settings-48](#settings-48)].

#### settings-66

Where the Settings surface renders a config whose Captain and two players run on `claude`, one of their roles' bindings naming a model of its own, and a `codex` player, when the reader chooses a model on the `claude` card and Apply, the test suite shall assert:

- the confirmation lists the Captain and the two players, and the role it leaves for its own model [[settings-58](#settings-58)];
- confirming sends one `config.batch` with the shown state's revision, a `captain.set` and a `player.set` per player whose patch sets `model`, or with Provider default removes it, and nothing for the `codex` player or the binding [[settings-57](#settings-57)] [[settings-58](#settings-58)];
- the done notice lists the left role again, and a refused `conflict` says to retry, reads the config again, and the next confirmation lists a player the file gained and sends its revision [[settings-58](#settings-58)];
- with the base URL `third-party` and a catalog reporting no `defaultModel`, Apply is disabled while Provider default is chosen, with its line and a Retry that rediscovers, and enabled for a specific model [[settings-58](#settings-58)].

#### settings-67

Where the Settings surface renders a `third-party` base URL over a config whose Captain names an official model, whose roles cross official and third-party names on the player and on the binding, one binding in your own group's file naming an official model, and a project's composition binding a role to an official-named player your own roles leave unbound, the test suite shall assert:

- a role on an official-named player whose binding names a third-party model is not listed, and one on a third-party player whose binding names an official model is [[settings-59](#settings-59)];
- the confirmation lists each role with its model and the target, the project's role by its project among them [[settings-60](#settings-60)];
- confirming sends one `config.batch` with the shown revision removing the Captain's and each official-named player's `model`, the project's included, and writing `model: false` on your own group's binding [[settings-60](#settings-60)];
- once a project's composition binds a further official-named player after the confirmation, the done notice lists that role alone and never says all were set [[settings-60](#settings-60)];
- a `conflict` refused to the one-model control whose project read fails holds Apply, the official-name control and its open confirmation from the start of the reading again, reports nothing until your own read settles too, then says the read failed, still holding them after the surface is left and entered again until reading again succeeds, the next batch carrying the revision read [[settings-58](#settings-58)] [[settings-60](#settings-60)];
- two readings again answered in reverse order leave the later's states shown, and a config state broadcast during one is kept over its answers [[settings-60](#settings-60)];
- with no `defaultModel`, the control is disabled with its line and a Retry that rediscovers [[settings-60](#settings-60)].

### Browser Journeys

#### settings-47

Where the browser journey harness ([DR-039](../decisions/039-browser-acceptance-journeys.md)) boots the served shell on a home whose project's config names a player your own group's roster lacks, when the journey opens Settings through the page, the test suite shall assert that the roster shows the player as named by that project and not set up here, that Add creates it from the neutral block so the row leaves the missing list, and that the surface names the file it writes by its path and no spex repository [[settings-46](#settings-46)].

#### settings-29

Where the browser journey harness ([DR-039](../decisions/039-browser-acceptance-journeys.md)) boots the served shell on a demo config carrying a comment, when the journey edits Settings and opens an agent editor through the page, the test suite shall assert:

- the Captain's row shows the config's captain block, its edit control opens the editor seeded from it, and saving a changed model writes the file with the comment and key order kept, the editor closed, the row showing the new value and the Saved status [[settings-1](#settings-1)] [[settings-4](#settings-4)] [[settings-7](#settings-7)] [[settings-6](#settings-6)];
- the shortcut sheet lists the palette binding with the platform's modifier [[settings-10](#settings-10)];
- the surface prints the served shell's version, never "dev" [[settings-31](#settings-31)];
- an edit the fail-closed rules reject is refused with its message shown and the file left unchanged [[settings-2](#settings-2)];
- the Agents section shows the `claude` and `codex` cards and an entry for each other adapter the config names [[settings-5](#settings-5)];
- an edit made to the file on disk from outside the app is reflected on the surface without a reload [[settings-8](#settings-8)];
- an agent editor opened at a role's control at the 320-pixel viewport floor stands wholly inside its surface's box both on opening and after model discovery grows its content, leaving the page scrolling in neither direction [[settings-33](#settings-33)], its model and effort stacked there and side by side at 1280 pixels [[settings-1](#settings-1)];
- a model listbox opened in an agent editor at the 320-pixel viewport floor lies wholly inside the box that must show it, its last row reachable by its own scrolling, leaving the page scrolling in neither direction [[settings-40](#settings-40)].

#### settings-30

Where the browser journey harness ([DR-039](../decisions/039-browser-acceptance-journeys.md)) boots the served shell on the demo config, when the journey shows the Settings surface at the widths 320, 480, 640, 800, 1024, and 1280 pixels, each at 800 and 400 pixels tall, with the sidebar collapsed and, from 480 pixels, open ([DR-041](../decisions/041-chrome-that-fits.md)), the test suite shall assert fit through the page, naming every offending element: no element outside the shortcut sheet's sideways-scrolling table is wider than its box [[settings-10](#settings-10)], the surface scrolls inside its own box with nothing positioned past the viewport uncontained [[settings-32](#settings-32)], within every list row and header no two visible siblings overlap and every child lies inside its parent [[settings-22](#settings-22)] [[settings-5](#settings-5)], and every control keeps its accessible name at every size [[settings-6](#settings-6)].

#### settings-50

Where the core runs as a seat with fixture shared files — present, absent and unreadable — a fake status command answering valid and expired, and a member's own credential set for one agent, the test suite shall assert each class and phrase of [[settings-49](#settings-49)] delivered over the protocol, every `claude` base URL `hidden` [[settings-14](#settings-14)], and that `credential.set`, `credential.list` and `credential.remove` write, list without a secret and remove the member's credentials with the file owner-only [[settings-48](#settings-48)].

#### settings-55

Where the Settings surface renders over the local store and over a seat store whose place is named "lab-1", the test suite shall assert that the header reads "This computer" at the local place and "lab-1" at the seat's, that the config path reads `~`-shortened under the user's home with the full path and the CLI sentence in its title alone, and that no spex repository is named in the header [[settings-54](#settings-54)].
