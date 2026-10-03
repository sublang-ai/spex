<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# settings: Settings

## Intent

This spec covers the Settings workspace surface of the Spex desktop app — its externally visible behavior, the implementation requirements behind it, and the integration coverage that verifies both.
The Settings surface is an editor over the shared playbook config file at `${SPEX_HOME:-$HOME/.spex}/config/playbook.config.yaml`, which stays the source of truth shared with the playbook CLI.
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

Where the Settings surface is open, the Settings surface shall present the shared config's session-player roster ([DR-032](../decisions/032-session-players.md)) — each player's id, its agent with that adapter's readiness, and the `<playbook>.<role>` bindings it answers — and shall offer, per player, an agent editor with the fields of an inline agent block and a removal control:

- A player no binding names is listed and marked as bound to no role, because an unreferenced lane is legal and reaching no session.
- A saved player edit is a merge patch altering only the fields the editor surfaced, preserving hand-written fields such as `instruction` and granular permissions.
- A removal the shared-config write path refuses is reported in that path's own words beside the player, and writes nothing.

#### settings-27

Where the Settings surface is open, the Settings surface shall offer adding a session player by naming its id and giving it a whole agent block ([DR-032](../decisions/032-session-players.md)), and shall report a rejected id in the shared-config write path's own words without writing:

- The seeded block is a complete, deliberate choice, so an untouched draft is savable.

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
- Show unsupported effort or fast-mode selections as requiring correction, never silently removing values during discovery.
- Explicitly switching an agent's adapter resets model, subagent model, subagent effort, effort, and fast mode to defaults because those settings belong to the previous adapter.

#### settings-35

When the core receives `agent.options` for a known adapter, it shall return Cligent's adapter capabilities and bounded, task-free model discovery result without changing shared config or opening a Spex session:

- Discovery uses the core's captured environment.
- Adapter effort values, fast-mode support, subagent-model support and the adapter's subagent efforts — its effort values less its orchestration values, none where it serves no subagent model — accompany the discovery result ([DR-093](../decisions/093-a-players-subagent-model.md), [DR-095](../decisions/095-a-subagents-effort-and-the-agents-own-model.md)).
- Available results carry Cligent's optional `unreportedEffortValues` separately from each model's effort list: adapter efforts the discovery interface cannot report.
- Available results carry each model's optional `description` and the result's optional `defaultModel` — the model the runtime runs when none is configured — as Cligent reported them, absent where it reported none ([DR-091](../decisions/091-models-named-by-the-runtime.md)).
- Unknown adapters are rejected by the protocol.
- Discovery failure is returned as unavailable; config load and save do not depend on discovery.

#### settings-38

Where a model editor [[settings-34](#settings-34)] names a model value against the runtime's catalog [[settings-35](#settings-35)] — a row, the runtime's `defaultModel`, or a value the field holds or the editor inherits, an empty one included — it shall read the value by one display rule, naming the specific model wherever the runtime reports one ([DR-091](../decisions/091-models-named-by-the-runtime.md)):

| The value is | It reads as |
| --- | --- |
| a row's id | the row's name, then the row's specific model: its `resolvedModel` where the id is an alias of it — differing from it and not beginning with it — else the id where it differs from the name ignoring case, else nothing |
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
- the rows stand in this order: "Provider default" where the editor allows it, its second line the `defaultModel` where reported, or in a subagent-model field "Same as agent" with no second line, then "Off" while it stands [[settings-34](#settings-34)] [[settings-38](#settings-38)]; a value recognized only through a resolution, as its own row; each catalog row in the runtime's order, its first line the name with the specific model muted beside it and its second line the runtime's `description` where reported; and "Custom model…" last;
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

Where the Settings surface is open, the Settings surface shall show a per-adapter readiness panel holding one deduplicated entry per adapter the shared config references, each entry naming the positions using that adapter — `captain`, and each session player with the `<playbook>.<role>` bindings it answers [[settings-26](#settings-26)] — and reflecting the launcher-equivalent readiness checks of [DR-004](../decisions/004-config-and-persistence.md): ready, not ready, or unknown for an adapter with no preflight rule:

- When an adapter is not ready, its entry includes concrete fix instructions naming the environment variable to set or the adapter's login step (for example, set `ANTHROPIC_API_KEY` or log in with the `claude` CLI), and an adapter with no preflight rule carries verify-yourself guidance instead.

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

When a Settings edit is saved, the Settings surface shall write the shared config file as a targeted edit that preserves comments, key order, and keys the Settings surface does not recognize, so the file stays hand-editable for playbook CLI use ([DR-004](../decisions/004-config-and-persistence.md); see [[settings-13](#settings-13)]).

#### settings-8

While the Settings surface is open, when the shared config file changes on disk from outside the app, the Settings surface shall refresh the displayed values to the new file content and show a notice that the config changed externally:

- When the external change conflicts with unsaved edits in the Settings surface, the notice says so; resolution is last-writer-wins per [DR-004](../decisions/004-config-and-persistence.md).

#### settings-9

Where the app starts on a machine with no shared config file, while the core service has seeded the starter config ([DR-004](../decisions/004-config-and-persistence.md)), the Settings surface shall display the starter's values as the current settings before any user save, and the displayed values shall equal the seeded file's content:

- For that run the surface says it created a starter config at the file's path, so the file's origin is never a mystery.

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

While an adapter's readiness entry reports not ready, the accompanying fix requirement [[settings-5](#settings-5)] shall render in full, wrapping onto further lines as needed rather than truncating.

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

Where the core service evaluates adapter readiness, the core service shall report readiness keyed by adapter — one deduplicated entry per adapter the active config references, each carrying the positions using it — `captain`, and each session player with the bindings it answers — applying per-adapter rules identical to the playbook launcher's, which combine a runtime half with a credential half ([DR-024](../decisions/024-app-supplied-agent-runtimes.md), [DR-004](../decisions/004-config-and-persistence.md)): an adapter whose runtime cligent's availability probe finds unusable [[core-service-9](core-service.md#core-service-9)] is not ready whatever its credential class, and one whose cligent-published runtime is missing or below cligent's supported floor carries cligent's verdict and the repair for its install tree — the pinned global install for a `PATH` runtime, reinstall guidance for a bundled SDK; over a usable runtime, `claude` is ready when `ANTHROPIC_API_KEY` is set or `~/.claude` exists; `codex` is ready when `OPENAI_API_KEY` is set or `~/.codex` exists; both halves unmet report both requirements; an adapter with a usable runtime and no credential rule shall be reported with null readiness and verify-yourself guidance rather than not ready:

- Environment lookups use the captured login-shell environment ([DR-004](../decisions/004-config-and-persistence.md)), not the bare app process environment.

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

Where runtime discovery supplies model-specific metadata, unavailable discovery, and a delayed response for a previously selected adapter, the test suite shall exercise the protocol and editors to verify model IDs and alias resolutions, model-specific tuning with only discovery-declared supplements, preserved custom values, adapter switches resetting model/subagent model/subagent effort/effort/fast mode, refresh, and rejection of stale results [[settings-34](#settings-34)], without task execution or config mutation during discovery and with each model's description and the catalog's default model carried as reported, and each adapter's subagent-model support and subagent efforts as Cligent reports them, never an orchestration value among the efforts [[settings-35](#settings-35)].

#### settings-41

Where the agent editor and the role-binding editor render against fixture catalogs modeled on the Claude and Codex runtimes — aliases resolving to specific models, a row whose id extends its resolved model, rows named as their ids, descriptions on some rows, and a `defaultModel` in one catalog and none in the other — the test suite shall assert through the rendered editors:

- the trigger and every row read by the display rule, and a value recognized only through a resolution and a value no row lists each read as themselves, the unlisted one with its hint [[settings-38](#settings-38)] [[settings-39](#settings-39)];
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

Where adapter readiness is exercised, given fixture environments and home directories covering each launcher rule (credential environment variable set, credential directory present, both absent) and a config referencing one adapter from several positions, the test suite shall assert that the readiness results delivered over the protocol match the expected state per adapter as one deduplicated entry naming its positions [[settings-14](#settings-14)], that an adapter with no preflight rule reports null readiness with verify-yourself guidance [[settings-14](#settings-14)], and that each not-ready result includes fix instructions naming the environment variable or login step [[settings-5](#settings-5)].

#### settings-45

When rendered editors exchange capability and browser preparation messages with a fixture core client, integration verification shall assert contextual requests, stale-result suppression, scoped progress, cancellation and retry, unchanged choices after setup, explicit shared saves and conversation false/null overrides, and authoring preparation without configuration writes [[settings-44](#settings-44)]:

- known empty media output shows its limitation without blocking supported browser access, unknown output shows no unsupported claim, and stale capability replies cannot replace either state;
- an agent configured with Browser whose support check failed or reads unknown saves an effort change through the shared editor and the conversation settings, while Browser newly copied from the Captain onto such an agent leaves Save disabled [[settings-44](#settings-44)];
- a served-browser journey shall verify unknown support and stale-choice clearing through the real core, including the editor at 320-pixel and 1280-pixel widths;
- served-browser and Electron host acceptance shall perform native credential-free browser preparation from the UI and save an explicit choice, keeping successful setup separate from that choice; source and packaged Electron hosts shall each start with an independently empty managed browser cache and no external Node on PATH.
- acceptance waits observe the current control's terminal outcome: ready continues, failure or explicit cancellation stops promptly with the complete displayed diagnostic, and an absent terminal outcome remains bounded; initial idle state never passes or fails preparation.

### Roster Coverage

#### settings-28

Where the Settings surface renders a config whose roster holds a bound player and an unbound one, the test suite shall assert each player prints its id, its agent with the adapter's readiness, and the bindings it answers [[settings-26](#settings-26)]; that editing one writes a merge patch over that player alone [[settings-26](#settings-26)]; that a refused removal shows the write path's own words beside it [[settings-26](#settings-26)]; and that adding a player writes the named id with the seeded block from an untouched draft [[settings-27](#settings-27)].

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
- a seeded config names the created file, and a loaded one says nothing [[settings-9](#settings-9)];
- the permission mode's description follows the selected mode, and the shortcut sheet lists the bindings with the platform's modifier [[settings-10](#settings-10)];
- a missing config names the could-not-create remedy with a Retry that refreshes the app state, and never the fix-in-editor line [[settings-24](#settings-24)].

### Browser Journeys

#### settings-29

Where the browser journey harness ([DR-039](../decisions/039-browser-acceptance-journeys.md)) boots the served shell on a demo config carrying a comment, when the journey edits Settings and opens an agent editor through the page, the test suite shall assert:

- the Captain's row shows the config's captain block, its edit control opens the editor seeded from it, and saving a changed model writes the file with the comment and key order kept, the editor closed, the row showing the new value and the Saved status [[settings-1](#settings-1)] [[settings-4](#settings-4)] [[settings-7](#settings-7)] [[settings-6](#settings-6)];
- the shortcut sheet lists the palette binding with the platform's modifier [[settings-10](#settings-10)];
- the surface prints the served shell's version, never "dev" [[settings-31](#settings-31)];
- an edit the fail-closed rules reject is refused with its message shown and the file left unchanged [[settings-2](#settings-2)];
- the readiness panel lists one entry per adapter the config names [[settings-5](#settings-5)];
- an edit made to the file on disk from outside the app is reflected on the surface without a reload [[settings-8](#settings-8)];
- an agent editor opened at a role's control at the 320-pixel viewport floor stands wholly inside its surface's box both on opening and after model discovery grows its content, leaving the page scrolling in neither direction [[settings-33](#settings-33)], its model and effort stacked there and side by side at 1280 pixels [[settings-1](#settings-1)];
- a model listbox opened in an agent editor at the 320-pixel viewport floor lies wholly inside the box that must show it, its last row reachable by its own scrolling, leaving the page scrolling in neither direction [[settings-40](#settings-40)].

#### settings-30

Where the browser journey harness ([DR-039](../decisions/039-browser-acceptance-journeys.md)) boots the served shell on the demo config, when the journey shows the Settings surface at the widths 320, 480, 640, 800, 1024, and 1280 pixels, each at 800 and 400 pixels tall, with the sidebar collapsed and, from 480 pixels, open ([DR-041](../decisions/041-chrome-that-fits.md)), the test suite shall assert fit through the page, naming every offending element: no element outside the shortcut sheet's sideways-scrolling table is wider than its box [[settings-10](#settings-10)], the surface scrolls inside its own box with nothing positioned past the viewport uncontained [[settings-32](#settings-32)], within every list row and header no two visible siblings overlap and every child lies inside its parent [[settings-22](#settings-22)] [[settings-5](#settings-5)], and every control keeps its accessible name at every size [[settings-6](#settings-6)].
