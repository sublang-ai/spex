<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-190: Agent Cards Read Alike, and a Third-Party Seed Names No Official Model

## Status

Accepted (2026-11-02) on the owner's direction during the Workshop's manual verification.
Amends [DR-189](189-workshop-agents-in-one-pass.md) in its agent cards: a card no position uses keeps the not-ready tone of every other; a ready card shares the not-ready card's frame; the section states what needs doing before a task can start; what is missing is plain text; the online service's action is enabled before it has an address; a ready card has no closing line and no tag; and in its reading of Claude Code's user settings: the core writes their variables into every run's environment, since a run that reads no settings file would not apply them.
Amends [DR-091](091-models-named-by-the-runtime.md) in its model list: rows running one model read as one row, and a resolution the name already says reads once.
Amends [DR-154](154-the-seed-follows-playbooks-rule.md) in "the core chooses no adapter, model, effort or writable path itself": behind a third-party Claude service, the seed's Claude agents take the provider's default in place of an official model name; and in "That seed reads credentials alone": it reads confirmed credentials, never an agent's home folder alone.
The reseed of [DR-156](156-an-untouched-seed-follows-the-credentials.md) applies that seed unchanged, so an untouched seed follows a base URL as it follows a credential.
Amended by [DR-191](191-the-workshop-points-to-its-guide.md) in "The online service before its address": the action is removed.

## Context

- A not-ready card took a muted tone where no position used its agent and an alarm where one did, so one state had two looks; an attendee who reopened Spex after setting up Claude found the Codex card changed though nothing about Codex had.
- What the attendee must learn is that a task needs at least one agent, Claude recommended, and Codex optional; a card's tone said that only by implication.
- With nothing set up, the section's line and each card's missing service took the same amber warning, so three warnings said one thing, two of them word for word and again in the badges.
- A green line saying a task can start, on a page the attendee only opened to look, read like the toast of an action nobody took, and repeated the ready badge.
- A ready card stacked seven blocks — its badge with a note, its users, its model service, its default model, the one-model control, a note on a single role's model and the official-name list — so what runs, and what needs doing, was hard to find.
- "Change model" read as muted text, not as something to press; and the closing line on the first task stood on every ready card though the attendee could do nothing with it.
- Behind DeepSeek, Claude Code's catalog lists its default alias, its Opus and Sonnet slots and the model's own row, all running one model the provider's default already runs, each slot's name the model it resolves to, so one model filled four rows and read twice in each.
- DR-189 counted the `env` of Claude Code's `settings.json` because a Claude run applies it, but a run with no tools — the Captain's control calls — loads no settings file, so a key or base URL written only there left the Captain failing while players ran and the card read ready; and Cligent names no default model where that `env` sets `ANTHROPIC_MODEL`, so the card read "Unavailable".
- Playbook's seed names `claude-opus-5-5` for every Claude agent.
  A third-party service receives that name as written: an `ANTHROPIC_DEFAULT_*_MODEL` variable maps only an alias, and DeepSeek bills a `claude-opus` name as its Pro model while another service may refuse it.
  So every attendee with a third-party key met the official-name list on first start, though nobody had chosen those names.

## Decision

### One frame, one tone per state

- A not-ready badge and its warning take one amber attention tone whoever uses the agent; red is kept for errors.
- The `claude` card carries the tag "Recommended" until it is ready, when the recommendation has done its work and the tag would only crowd the badge; the `codex` card carries none, its heading saying where no role uses it.
- What a not-ready card is missing is plain text beneath the badge, which carries the tone; the section's verdict is the one warning.
- Every card has one frame: a heading with the agent's name, its tag, its badge and its users in brief; one line saying what is missing or what runs; then what to do; then one closing line.
- A ready card's line names the model service with the model its agents run — the one model, Provider default's by name, or "Several models" where they run different models, values naming one model as the runtime resolves them counting once — and "Change model", a link in the brand tone, opens the one-model control there; the official-name list follows as one sentence naming the service and its consequence, a fix named by the model it sets, and the roles folded beneath.
- That the connection is checked on the first task is the ready badge's tooltip, not a line: a key that fails says so on that task.
- The one-model control's label says it changes the Captain and every player on the agent at once — the only words the Settings surface uses for who runs an agent — and that the Captain or one player is changed alone in its settings above, in the same line above the field, not split by it.

### One row per model

- A model list shows one row per model its rows run, preferring a held value's row, then the row named by the model itself, then the last listed, since the runtime lists its default alias first; where Provider default is recommended it stands for its own model.
- A row's resolution that its name already says is not repeated.
- A model the list does not name, such as another of the provider's models, is chosen through "Custom model…", in the card and in a player alike.

### The section's verdict

- Beneath the section's heading one amber line says what needs doing before a task can start or run whole, read from the Captain's agent since the Captain runs first: at least one agent is needed, Claude recommended; the Captain's agent is not ready while another is; tasks can start, but a role's agent is not ready.
- Where nothing needs doing, no line stands: the badges say what is ready.
- No verdict stands before the core answers or where the Captain's agent has no check.

### The online service before its address

- The online service's action is a normal primary action before the Workshop has its address, doing nothing when pressed, since the service opens soon and a disabled action with "Not open yet" made the primary route look withdrawn; the address is set in the interface's code when the service opens.
- The action reads "Use the online service", the service no longer called temporary.

### Claude's settings in every run

- Off a seat, the core writes the variables of Claude Code's user settings into the environment every run inherits — at start, before each run and before each readiness report — over the values inherited, as Claude Code's own precedence has them, so what the card counts is what every run, the Captain's included, receives.
- A variable the file no longer sets goes back as it stood, and a stop puts every name back, as a seat's credentials do.
- On a seat it writes none: the seat's readiness names the member's or the shared credentials as what runs, and the server account's settings are no member's, so writing them would run on a credential the card does not name.
- A player's Claude Code on a seat still reads the server account's settings itself, as it did before this decision; keeping them from it needs Cligent to name a run's settings sources, or a configuration folder of the seat's own, and is left to a later decision.
- Where Cligent names no default model, `ANTHROPIC_MODEL` of that environment is the default, since it is what a run selects.
- Counting no settings-only credential was rejected: a player reads the file itself and runs, so the card would call ready agents not ready.

### A third-party seed

- Where Claude's base URL — read as a run reads it, Claude Code's user settings over the environment — names a third-party host, the seed removes each Claude agent's official `model`, so it runs on the provider's default; other agents, other fields and the template's comments stand.
- An untouched seed is reseeded on that rule like any other, so an attendee who set the key after the first start needs no fix; a file changed in any byte is left to the official-name list.

### A folder is no credential

- The seed counts an agent as set up by its credential variable — for Claude, in Claude Code's user settings too — or by a sign-in its own status command confirms where its folder stands, and hands Playbook's seed only those, one variable standing for each, with no home folder to read.
- On a seat it counts the member's and the shared credentials alone, as the seat's readiness does: the server account's settings and sign-ins are no member's.
- Playbook's rule counts `~/.claude` or `~/.codex` as a credential, but the runtime creates that folder on its first start, signed in or not, and Spex starts Codex to read its models: an attendee who set up only Claude found the reviewer on Codex at the next start, its steps failing.
- An unconfirmed sign-in counts as none, so a slow status command leaves the template's agents on Claude, which a later start reseeds.

## Consequences

- An attendee reads one warning instead of inferring urgency from colors, and two cards in one state look the same.
- A third-party attendee's agents run the model the service names by default from their first task, with no list to act on.
- The seed under a third-party base URL no longer matches the `playbook` CLI's seed in its models; its adapters, efforts and writable paths still do.
- The seed asks each agent's status command at start where its folder stands and no variable is set, as readiness does.
- The seed no longer matches the `playbook` CLI's where a folder stands with no confirmed sign-in; the CLI still counts the folder until Playbook changes its rule.
