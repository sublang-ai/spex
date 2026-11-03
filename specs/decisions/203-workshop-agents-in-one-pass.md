<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-203: Workshop agents in one pass

## Status

Accepted (2026-11-01) on the owner's go-ahead after five review rounds.
Amends [DR-004](004-config-and-persistence.md) in its readiness: the credential variables follow Playbook's, a home folder alone is no credential and the agent's own sign-in status decides without a variable, readiness reports its faults by kind, and `claude` and `codex` are always reported.
Amends [DR-024](024-app-supplied-agent-runtimes.md) in how a runtime fault is reported: a kind of its own, never joined to the credential's reason.
Amended by [DR-204](204-agent-cards-read-alike.md): one not-ready tone whoever uses the agent, one frame for every card, a Recommended tag until Claude is ready, the section's verdict, what is missing in plain text, and the online service's action enabled before its address; Claude Code's user settings reach every run through the core, since a run isolated from settings files reads none.
Amended by [DR-205](205-the-workshop-points-to-its-guide.md): a not-ready card offers the setup guide alone, with no online service.

## Context

- A Workshop attendee starts from one of four places: signed in to `claude` or `codex` already, holding an official or a third-party key, configured but failing, or holding nothing.
  A setup script outside the app — tested before it writes, writing environment variables only — brings each to a configured agent; inside the app the attendee must see each agent's state, make every agent use the chosen model, and know the next step when it is not ready.
- Readiness listed only the adapters the config references, so an attendee never saw the other agent's state or how to configure it, and listed nothing at all while the config was missing or invalid.
- The local credential rule recognized `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` alone, while Playbook's launcher also takes `ANTHROPIC_AUTH_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN`, `CODEX_API_KEY` and `CODEX_ACCESS_TOKEN`; an attendee with a third-party key in `ANTHROPIC_AUTH_TOKEN` and no `~/.claude` read as not ready.
- The credential rule also counted `~/.claude` and `~/.codex` as signed in, as Playbook's launcher does; each runtime creates its folder on its first start, signed in or not, so an attendee who never signed in read as ready once Spex had opened.
  Each agent's own status command — `claude auth status`, `codex login status` — answers within a second, and Claude's counts its environment variables, `settings.json` and `apiKeyHelper`; Codex's counts no API key variable, and creates `~/.codex` where it runs in a home without one, as Claude's creates `~/.claude`.
- A runtime fault and a credential fault were joined into one string, so guidance could not tell reinstalling the app from setting a key.
- The first-run config pins `claude-opus-5-5` or `gpt-6-sol` on the Captain and every player; a third-party Anthropic-compatible service maps such a name by its own rule — DeepSeek runs `claude-opus*` as its Pro model and bills it so — so an attendee who chose another model silently runs and pays for a different one.
- Cligent's Claude discovery reports `ANTHROPIC_MODEL` as the default model where it is set, and reads nothing from `~/.claude/settings.json`.
- `config.edit` changes one object per command; making every agent use one model is many objects that must change together or not at all, against the config the reader saw.
- The core refuses to start on native Windows ([DR-049](049-supported-app-hosts.md)) and reads the login shell's environment at start ([DR-004](004-config-and-persistence.md)); a Windows host is another piece of work.

## Decision

### Readiness

- `claude` and `codex` are always reported, each with the positions using it, none where no position does; while the config is missing or invalid they are the only entries, with no positions.
  Other adapters are reported only where referenced, as before.
- The local credential half takes Playbook's credential variables: `claude` takes `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` or `CLAUDE_CODE_OAUTH_TOKEN`; `codex` takes `OPENAI_API_KEY`, `CODEX_API_KEY` or `CODEX_ACCESS_TOKEN`.
- Claude Code's user settings file — `settings.json` in `CLAUDE_CONFIG_DIR` or `~/.claude` — sets variables a Claude run applies over those it inherits, so its `env` counts for the credential and the base URL alike; a card reading only the core's environment would call a run sent to a third party Anthropic's.
- With none set, the agent's own status command decides, run as an agent run would be and only where the agent's configuration folder exists, so it never creates the folder Playbook's seed reads; a home folder alone is no credential.
  Spex's readiness thereby departs from Playbook's launcher, which still counts the folders.
- A status command that cannot answer — it does not start, runs past five seconds, fails otherwise or says what is not read — leaves the sign-in unconfirmed: neither ready nor not ready, with its reason and a re-check, since calling it signed out would send a signed-in reader to sign in again.
  Ready still means only that the runtime loads and a credential is present; nothing is sent to the provider.
- Each entry lists its faults by kind — `runtime` or `credential` — beside the former joined requirement, which stays.
- The `claude` entry carries the state of `ANTHROPIC_BASE_URL` — unset or Anthropic's own host, a third-party host, a value that does not parse, or hidden on a seat — with the host name alone, never a path or a secret.
- Each entry carries the core's platform and the user's shell, so manual guidance is written for the computer it is followed on.

### One model for every agent of an adapter

- An agent card offers one model for the Captain and every player on that adapter, Provider default included, written as the removal of each `model` key.
- A role binding's own model is never changed by it, only listed before and after the change, since a binding's model is a deliberate choice for that role.
- The change is one `config.batch`: its operations validated together and written in one versioned write, or none of them.
  It carries the revision of your own group's config the reader saw, so a config changed meanwhile — a player added, a binding given a model — is refused as a conflict before anything is composed; the card then reads the config again and the reader confirms the recomputed list.
- A violation of the whole batch names the rule, the field and every operation that touched what it covers, since operations valid one by one can violate a rule together; the check that raises it states its rule and field, since words in the reader's language name no field reliably.
- `config.batch` takes only `captain.set`, `player.set` and `playbook.role.bind`, and only your own group's file: one file is one versioned write.

### A third-party model service

- Only Claude is judged, by its base URL's state alone: a default model says nothing about where requests go.
- A role is judged by the model it runs — its binding's own model where one stands, else its player's — and the Captain by its own.
  A project's file binds players by name alone, so a role of a project runs a model your own group's file names, and every official name is fixed there.
  An official name is one beginning with `claude-`, or the aliases `opus`, `sonnet`, `haiku` and `fable`, optionally with `[1m]`: Anthropic's own naming, with no table of any provider's mapping.
- Fixing them writes Provider default where the official name stands: the Captain's or a player's `model` removed, and a binding in your own group's file set to `model: false`, never cleared to inherit a player the reader may have chosen on purpose.
- What remains after the write is recomputed from the newest config, never assumed from what was confirmed.
- Where the third-party service's default model cannot be read, nothing writes Provider default from the card and the field does not recommend it, since nobody could say which model would then run; a specific model stays available.

### Workshop scope

- A constant in the interface's code, on by default, limits adapter choices to `claude` and `codex` and gives a not-ready card the Workshop's two routes; a configuration naming another adapter still loads and shows, and may be changed back.
  Turning it off in a later release restores every adapter and leaves only manual steps, with nothing for an attendee or an assistant to do.
- The routes are the temporary online model service we provide, the primary one since most attendees hold no key, and the agent's own subscription or API key on this computer; they stand side by side, each over its own action and joined by "or", and each says whom it is for, so the attendee picks by their own situation rather than by guessing what a button does.
  The service has no address yet, so its action is disabled and says it is not open yet until one is set, rather than a primary action doing nothing.
  The local route opens the configuration document at the attendee's platform, at Codex's own section on the Codex card, rather than short steps in the card, since clearing an earlier setup is what short steps leave out; the setup script is not offered while it is not ready for attendees.
  Codex's local route names only OpenAI's subscription and key, since Codex takes no third-party key.
- A not-ready card first says what is missing, as a warning apart from the routes, so "not ready" has a meaning, in amber rather than red since it is a step still to take rather than an error; it hides its model settings, which have nothing to act on before the agent runs.
  Those settings are the adapter-wide model and the official-name fix, not a role's editor, so a ready card says a single role's model is set in its player.
- Guidance follows the fault's kind and, for Claude, the base URL's state; on a seat it points to the Credentials section and names no local command.
- A sign-in is read by the status command at each re-check, while a variable reaches the core only from a new start; reopening Spex covers both, so the Workshop card closes on that one step, once per card, and the section's heading keeps the control alone.
- The core's requirement repeats the card's guidance in other words, so it stays in the guidance's tooltip; it shows only where it is the guidance itself.
- A card no position uses keeps its not-ready state and its tone, since a tone changing with use made one state look like two ([DR-204](204-agent-cards-read-alike.md)).
- A blocked task start is explained where the attendee acts: the start control stays enabled and a press re-checks, starting the task once the Captain's agent is ready, otherwise bringing the notice forward with its way to the Captain's agent card.

### Windows

- The Windows forms of manual guidance depend on a Windows host of the core, which is other work.
  Before this decision is accepted as delivered, that work must have revised core-service-89 and [DR-049](049-supported-app-hosts.md) — the core's refusal on native Windows — and app-shell-12, app-shell-19 and [DR-004](004-config-and-persistence.md) — where a Windows user's environment variables reach the core in place of a login shell's.

### Protocol

- The protocol version moves from 32, which DR-176 took, to 33: a client meeting an older core marks it mismatched and sends it no batch.

## Consequences

- settings-5 shows two standing agent cards with their configuration steps and an unconfirmed sign-in; settings-14 and core-service-9 take the new forms, the sign-in status, the fault kinds, the base URL's state and the platform; settings-23, settings-34 and settings-39 follow; settings-58 to settings-63, settings-70 and settings-71 are new; run-view-45 opens Settings at the agent card and keeps the start control enabled.
- core-service-44 adds `config.batch` and core-service-45 the config state's revision; core-service-26 and core-service-143 follow.
- shared-config-roundtrip-1, -3 and -4 cover the batch.
- The setup script and the Workshop materials live outside the app's release.
- A known limit: Playbook's launcher and its seed still count `~/.claude` and `~/.codex`.
  Spex's status commands never create either folder, so only a runtime that ran once without a sign-in leaves one, and an untouched seed reseeded at the next start ([DR-156](156-an-untouched-seed-follows-the-credentials.md)) may then pick that agent.
