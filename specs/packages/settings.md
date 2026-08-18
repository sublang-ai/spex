<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# settings: Settings

## Intent

This spec covers the Settings workspace surface of the Spex desktop app — its externally visible behavior, the implementation requirements behind it, and the integration coverage that verifies both.
The Settings surface is an editor over the shared playbook config file at `${XDG_CONFIG_HOME:-$HOME/.config}/playbook/playbook.config.yaml`, which stays the source of truth shared with the playbook CLI.
The inline agent block (adapter, optional model, optional reasoning effort, permissions), the adapter names known to the embedded runtime (`claude`, `codex`, `gemini`, `kimi`, `opencode`), the config's top-level entries (`captain`, `layout`, `notifications`, `theme`), and the fail-closed validation rules are those of the playbook launcher that shares this file.
Behind the surface, the implementation requires one validation module shared with core config loading, comment-preserving YAML writing, launcher-equivalent readiness checks, and the protocol boundary between the Settings UI and the core service.
Integration coverage is exercised through the core service's WebSocket protocol against real shared config files in fixture config directories, so that Settings behavior and the launcher's config contract are verified together.

## External Behavior

### Captain

#### settings-1

Where the Settings surface is open, the Settings surface shall present the Captain's agent editor over the shared config's top-level `captain` entry, with the fields of an inline agent block: adapter (one of the embedded runtime's known adapters, each carrying its readiness indicator), optional model, optional reasoning effort offered only from the selected adapter's effort vocabulary, and permissions (mode `auto` or `bypass`, optional writable paths):

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

Where the Settings surface is open, the Settings surface shall display the captain configuration from the shared config's top-level `captain` entry in the Captain's agent editor [[settings-1](#settings-1)], rendering a hand-written scalar adapter id as that adapter's default agent block with no shorthand label:

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

### Adapter Readiness

#### settings-5

Where the Settings surface is open, the Settings surface shall show a per-adapter readiness panel holding one deduplicated entry per adapter the shared config references, each entry naming the positions using that adapter — `captain`, and each session player with the `<playbook>.<role>` bindings it answers [[settings-26](#settings-26)] — and reflecting the launcher-equivalent readiness checks of [DR-004](../decisions/004-config-and-persistence.md): ready, not ready, or unknown for an adapter with no preflight rule:

- When an adapter is not ready, its entry includes concrete fix instructions naming the environment variable to set or the adapter's login step (for example, set `ANTHROPIC_API_KEY` or log in with the `claude` CLI), and an adapter with no preflight rule carries verify-yourself guidance instead.

### Preferences

#### settings-6

Where the Settings surface is open, the Settings surface shall provide editors for the shared config's `layout` (pane column weights), `notifications`, and `theme` maps:

- When a preference change is saved, the change appears under the corresponding top-level map in the shared config file.

### Config File Semantics

#### settings-7

When a Settings edit is saved, the Settings surface shall write the shared config file as a targeted edit that preserves comments, key order, and keys the Settings surface does not recognize, so the file stays hand-editable for playbook CLI use ([DR-004](../decisions/004-config-and-persistence.md); see [[settings-13](#settings-13)]).

#### settings-8

While the Settings surface is open, when the shared config file changes on disk from outside the app, the Settings surface shall refresh the displayed values to the new file content and show a notice that the config changed externally:

- When the external change conflicts with unsaved edits in the Settings surface, the notice says so; resolution is last-writer-wins per [DR-004](../decisions/004-config-and-persistence.md).

#### settings-9

Where the app starts on a machine with no shared config file, while the core service has seeded the starter config ([DR-004](../decisions/004-config-and-persistence.md)), the Settings surface shall display the starter's values as the current settings before any user save, and the displayed values shall equal the seeded file's content.

### Guidance

#### settings-10

Where the Settings surface presents an editable setting, the Settings surface shall accompany the setting with a short inline description of its effect; no setting shall appear as a bare, unexplained control.

#### settings-22

While the notifications editor lists notification events, each event shall be labeled with a human-readable phrase from the app's notification label map rather than the wire event id ([DR-010](../decisions/010-interface-craft.md) §2); the wire id shall remain available in the row's tooltip.

#### settings-23

While an adapter's readiness entry reports not ready, the accompanying fix requirement [[settings-5](#settings-5)] shall render in full, wrapping onto further lines as needed rather than truncating.

#### settings-24

While the shared config file is missing or invalid, the Settings surface shall show the config file's path together with a secondary control that copies the path to the clipboard and briefly confirms the copy in place, so the user can open the file in an editor.

## Internal Behavior

### Validation

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

Where the core service evaluates adapter readiness, the core service shall report readiness keyed by adapter — one deduplicated entry per adapter the active config references, each carrying the positions using it — `captain`, and each session player with the bindings it answers — applying per-adapter rules identical to the playbook launcher's, which combine a runtime half with a credential half ([DR-024](../decisions/024-app-supplied-agent-runtimes.md), [DR-004](../decisions/004-config-and-persistence.md)): an adapter whose cligent-published runtime is missing or below cligent's supported floor is not ready, carrying cligent's verdict and the repair for its install tree — the pinned global install for a `PATH` runtime, reinstall guidance for a bundled SDK — whatever its credential class; over a usable runtime, `claude` is ready when `ANTHROPIC_API_KEY` is set or `~/.claude` exists; `codex` is ready when `OPENAI_API_KEY` is set or `~/.codex` exists; both halves unmet report both requirements; an adapter with a usable runtime and no credential rule shall be reported with null readiness and verify-yourself guidance rather than not ready:

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

### Round-Trip Coverage

#### settings-17

Where captain agent-block edits [[settings-1](#settings-1)] are exercised through the core service's Settings command surface [[settings-7](#settings-7)], given a shared config file whose `captain` block carries comments, a hand-written `instruction`, and keys unknown to Settings, the test suite shall assert that after each merge-patch save the file contains the requested change, every comment, hand-written field, and unknown key survives [[settings-21](#settings-21)], and file content outside the edited nodes is byte-identical to the pre-run content [[settings-13](#settings-13)].

### Validation Coverage

#### settings-18

Where validation is exercised, given fixture edits the playbook launcher rejects — at minimum one reintroducing a retired `profile` key, one whose effort falls outside the selected adapter's vocabulary, and one naming an adapter outside the embedded runtime's set [[settings-2](#settings-2)] — the test suite shall assert for each fixture that the save command is rejected with a violation carrying a rule identifier and field location [[settings-12](#settings-12)], that the shared config file's bytes are unchanged [[settings-3](#settings-3)], and that for the effort and adapter fixtures loading a config with the same defect reports the same rule identifier as the rejected save [[settings-11](#settings-11)].

### Readiness Coverage

#### settings-19

Where adapter readiness is exercised, given fixture environments and home directories covering each launcher rule (credential environment variable set, credential directory present, both absent) and a config referencing one adapter from several positions, the test suite shall assert that the readiness results delivered over the protocol match the expected state per adapter as one deduplicated entry naming its positions [[settings-14](#settings-14)], that an adapter with no preflight rule reports null readiness with verify-yourself guidance [[settings-14](#settings-14)], and that each not-ready result includes fix instructions naming the environment variable or login step [[settings-5](#settings-5)].

### Roster Coverage

#### settings-28

Where the Settings surface renders a config whose roster holds a bound player and an unbound one, the test suite shall assert each player prints its id, its agent with the adapter's readiness, and the bindings it answers [[settings-26](#settings-26)]; that editing one writes a merge patch over that player alone [[settings-26](#settings-26)]; that a refused removal shows the write path's own words beside it [[settings-26](#settings-26)]; and that adding a player writes the named id with the seeded block from an untouched draft [[settings-27](#settings-27)].

### External Edit Coverage

#### settings-20

Where external edit reflection is exercised, given a connected client holding Settings state, when the shared config file is modified on disk by a writer other than the core service, the test suite shall assert that the client receives the updated config state [[settings-8](#settings-8)] and an external-change notice [[settings-15](#settings-15)], and that a subsequent save performed through the core service produces no external-change notice [[settings-15](#settings-15)].

### Presentation Coverage

#### settings-25

Where the Settings surface renders against fixture state, the test suite shall assert that each notification row shows its human-readable label with the wire event id in the row's tooltip [[settings-22](#settings-22)], that a not-ready adapter's long fix requirement renders without truncation [[settings-23](#settings-23)], and that with an invalid config the copy control places the config file path on the clipboard and shows a transient copied confirmation [[settings-24](#settings-24)].
