<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-174: Workshop agents in one pass

## Status

Accepted (2026-11-01) on the owner's go-ahead after five review rounds.
Amends [DR-004](004-config-and-persistence.md) in its readiness: the credential forms follow Playbook's, readiness reports its faults by kind, and `claude` and `codex` are always reported.
Amends [DR-024](024-app-supplied-agent-runtimes.md) in how a runtime fault is reported: a kind of its own, never joined to the credential's reason.

## Context

- A Workshop attendee starts from one of four places: signed in to `claude` or `codex` already, holding an official or a third-party key, configured but failing, or holding nothing.
  A setup script outside the app — tested before it writes, writing environment variables only — brings each to a configured agent; inside the app the attendee must see each agent's state, make every agent use the chosen model, and know the next step when it is not ready.
- Readiness listed only the adapters the config references, so an attendee never saw the other agent's state or how to configure it, and listed nothing at all while the config was missing or invalid.
- The local credential rule recognized `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` alone, while Playbook's launcher also takes `ANTHROPIC_AUTH_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN`, `CODEX_API_KEY` and `CODEX_ACCESS_TOKEN`; an attendee with a third-party key in `ANTHROPIC_AUTH_TOKEN` and no `~/.claude` read as not ready.
- A runtime fault and a credential fault were joined into one string, so guidance could not tell reinstalling the app from setting a key.
- The first-run config pins `claude-opus-5-5` or `gpt-6-sol` on the Captain and every player; a third-party Anthropic-compatible service maps such a name by its own rule — DeepSeek runs `claude-opus*` as its Pro model and bills it so — so an attendee who chose another model silently runs and pays for a different one.
- Cligent's Claude discovery reports `ANTHROPIC_MODEL` as the default model where it is set, and reads nothing from `~/.claude/settings.json`.
- `config.edit` changes one object per command; making every agent use one model is many objects that must change together or not at all, against the config the reader saw.
- The core refuses to start on native Windows ([DR-049](049-supported-app-hosts.md)) and reads the login shell's environment at start ([DR-004](004-config-and-persistence.md)); a Windows host is another piece of work.

## Decision

### Readiness

- `claude` and `codex` are always reported, each with the positions using it, none where no position does; while the config is missing or invalid they are the only entries, with no positions.
  Other adapters are reported only where referenced, as before.
- The local credential half follows Playbook's credential forms: `claude` takes `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN` or `~/.claude`; `codex` takes `OPENAI_API_KEY`, `CODEX_API_KEY`, `CODEX_ACCESS_TOKEN` or `~/.codex`.
  Ready still means only that the runtime loads and a credential form is present; nothing is sent to the provider.
- Each entry lists its faults by kind — `runtime` or `credential` — beside the former joined requirement, which stays.
- The `claude` entry carries the state of `ANTHROPIC_BASE_URL` — unset or Anthropic's own host, a third-party host, a value that does not parse, or hidden on a seat — with the host name alone, never a path or a secret.
- Each entry carries the core's platform and the user's shell, so manual guidance is written for the computer it is followed on.

### One model for every agent of an adapter

- An agent card offers one model for the Captain and every player on that adapter, Provider default included, written as the removal of each `model` key.
- A role binding's own model is never changed by it, only listed before and after the change, since a binding's model is a deliberate choice for that role.
- The change is one `config.batch`: its operations validated together and written in one versioned write, or none of them.
  It carries the revision of your own group's config the reader saw, so a config changed meanwhile — a player added, a binding given a model — is refused as a conflict before anything is composed, and the reader confirms the recomputed list.
- A violation of the whole batch names the rule, the field and every operation that touched what it covers, since operations valid one by one can violate a rule together.
- `config.batch` takes only `captain.set`, `player.set` and `playbook.role.bind`, and only your own group's file: one file is one versioned write.

### A third-party model service

- Only Claude is judged, by its base URL's state alone: a default model says nothing about where requests go.
- A role is judged by the model it runs — its binding's own model where one stands, in any file, else its player's — and the Captain by its own.
  An official name is one beginning with `claude-`, or the aliases `opus`, `sonnet`, `haiku` and `fable`, optionally with `[1m]`: Anthropic's own naming, with no table of any provider's mapping.
- Fixing them writes Provider default where the official name stands: the Captain's or a player's `model` removed, and a binding in your own group's file set to `model: false`, never cleared to inherit a player the reader may have chosen on purpose.
  A binding in a project's file is outside the one write and is listed to be changed in that project's Playbooks tab.
- What remains after the write is recomputed from the newest config, never assumed from what was confirmed.
- Where the third-party service's default model cannot be read, nothing writes Provider default from the card and the field does not recommend it, since nobody could say which model would then run; a specific model stays available.

### Workshop scope

- A constant in the interface's code, on by default, limits adapter choices to `claude` and `codex` and offers the setup script first in each card's configuration steps; a configuration naming another adapter still loads and shows, and may be changed back.
  Turning it off in a later release restores every adapter and leaves only manual steps, with nothing for an attendee or an assistant to do.
- Guidance follows the fault's kind and, for Claude, the base URL's state; on a seat it points to the Credentials section and names no local command.

### Windows

- The Windows forms of manual guidance depend on a Windows host of the core, which is other work.
  Before this decision is accepted as delivered, that work must have revised core-service-89 and [DR-049](049-supported-app-hosts.md) — the core's refusal on native Windows — and app-shell-12, app-shell-19 and [DR-004](004-config-and-persistence.md) — where a Windows user's environment variables reach the core in place of a login shell's.

### Protocol

- The protocol version moves from 31 to 32: a client meeting an older core marks it mismatched and sends it no batch.

## Consequences

- settings-5 shows two standing agent cards with their configuration steps; settings-14 and core-service-9 take the new forms, the fault kinds, the base URL's state and the platform; settings-23, settings-34 and settings-39 follow; settings-56 to settings-61 are new.
- core-service-44 adds `config.batch` and core-service-45 the config state's revision; core-service-26 and core-service-143 follow.
- shared-config-roundtrip-1, -3 and -4 cover the batch.
- The setup script and the Workshop materials live outside the app's release.
