<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-019: Inline Agent Configuration

## Status

Accepted.
Amends [DR-002](002-desktop-app-architecture.md), [DR-004](004-config-and-persistence.md), [DR-009](009-at-hand-interaction.md), [DR-011](011-project-workspace.md), [DR-014](014-released-toolchain.md).
Amended by [DR-032](032-session-players.md), [DR-052](052-runtime-model-options.md), [DR-093](093-a-players-subagent-model.md), [DR-095](095-a-subagents-effort-and-the-agents-own-model.md), [DR-097](097-media-and-browser-tools-across-hosts.md), [DR-141](141-project-start-explains-the-task-and-slash-discovery.md), [DR-154](154-the-seed-follows-playbooks-rule.md), [DR-235](235-independent-ultracode.md), [DR-237](237-published-agent-runtime-floors.md).

## Context

- Playbook removed the shared config's `profiles` map and the agent-block `profile` key: every agent is an inline agent block (`adapter`, `model`, `effort`, `permissions`) or a scalar adapter shorthand, and the launcher migrates profiles-era configs in place once, with a backup.
- The launcher now hands the Captain shell its own adapter (`captainOptions.captainAdapter`); the shell restricts control-call tools at the provider level only for adapters that enforce them, falling back to prompt-level restriction otherwise.
  Spex composes captain options itself, so it must supply the same field or Codex captains keep failing every turn.
- Effort vocabularies are adapter-scoped in the embedded runtime (Codex adds `ultra`, Kimi accepts only `off`/`on`); a single flat effort list both rejects valid configs and accepts ones that fail mid-turn.
- The runtime starts sessions only for its known adapter set (claude, codex, gemini, kimi, opencode); ids outside it fail at session start regardless of acceptance at load.
- The owner retires the shorthand concept from the product: seeded first-use defaults make it unnecessary, and per-playbook, per-run tuning is the norm.

## Decision

### Config model

- Spex validation accepts what the launcher accepts: inline agent blocks and scalar shorthands, with scalars normalizing to bare-adapter blocks during composition.
- Adapter ids are bounded by the embedded runtime's known set; an id outside it is rejected at composition with the runtime's own wording, since its session would fail to start.
- Effort validation is adapter-scoped, sourced from the embedded runtime's vocabulary; the protocol carries effort as plain text and composition is the gate.
- Composition emits the Captain's adapter alongside the playbook enablement in the captain options, matching the launcher.
- A profiles-era config migrates in place at load, matching the launcher's semantics: scalar profile references inline the named profile; a block's `profile` inlines with the block's own fields winning; a `profile` naming a missing entry is a hard error leaving the file untouched; an unmatched scalar stays as written; the `profiles` map is deleted after inlining; the pre-migration file is backed up beside the config; comments survive; migration runs once and no-ops when the launcher migrated first.
  Config edits never accept retired keys.

### Spex writes only blocks

- The seeded template is fully explicit inline blocks — no scalars — whose agents Playbook's credential-based seeding rule selects ([DR-154](154-the-seed-follows-playbooks-rule.md)).
- Every config edit writes inline blocks.
  Edits are merge patches over the existing block — only the provided keys change, so hand-written fields (`instruction`, granular permissions) survive.
  A patch key set to null on a player or the Captain unsets it, so a pinned model or effort can return to its adapter's default and a cleared field means what it shows; on a role binding it means "inherit the player" ([DR-032](032-session-players.md)).
  Registration flows carry full blocks whose schema includes the optional hand-written fields.

### Protocol

- The profile surface leaves the protocol: no profile summaries, no profile edit operations.
  An agent summary (adapter, model, effort, permissions) describes the captain and each player; ops take agent blocks.
- Readiness is keyed by adapter, deduplicated, each entry naming the positions using it (captain, `<playbook>.<role>`); a supported adapter without a preflight rule reports unknown readiness with verify-yourself guidance.
- The version bumps; core and UI move together.

### UX

- One shared editor grammar — adapter with readiness dot, model and effort from the runtime's choices ([DR-052](052-runtime-model-options.md)), subagent model and effort on one row with them ([DR-093](093-a-players-subagent-model.md), [DR-095](095-a-subagents-effort-and-the-agents-own-model.md)), Claude's independent Ultracode ([DR-235](235-independent-ultracode.md)), permission mode and writable paths, and the browser execution setting ([DR-097](097-media-and-browser-tools-across-hosts.md)) — and one agent chip (adapter · model @ effort, readiness dot) everywhere an agent is shown or edited; players and role bindings fork the editor by what each owns ([DR-032](032-session-players.md)).
- Settings carries the Captain's editor and a per-adapter readiness panel; player editing lives with the playbooks, opened in place per [DR-009](009-at-hand-interaction.md).
- The Captain's chip beside the task composer opens its full editor in place ([DR-141](141-project-start-explains-the-task-and-slash-discovery.md)).
- Adding a new player starts with the model pair for the chosen adapter ([DR-237](237-published-agent-runtime-floors.md)), with an explicit "same as Captain" action copying adapter, model, effort, and permissions only.
- The shorthand concept does not appear in the product: no shorthand options, no shorthand labels; a scalar read from a hand-edited config displays as its adapter's defaults and becomes a block on the next edit.

### Compiles

- Compiles invoke slc without an explicit link target (the canonical bare form); a compiled entry with no derived roles is refused with recompile guidance.

## Consequences

- The launcher-parity boundary stays honest in both directions: everything the launcher accepts composes, and everything spex composes can actually start a session.
- Codex captains work through the prompt-level restriction; the composed captain options are the carrier, and a test pins it.
- Existing user configs keep composing through the load-time migration; the launcher and Spex can migrate interchangeably, whichever runs first.
- The settings editor's coverage intent (comment preservation, fail-closed edits) holds over the block operations.
