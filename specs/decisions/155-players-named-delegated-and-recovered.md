<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-155: Players Named, Delegated and Recovered

## Status

Accepted (2026-10-26) for the owner's P0-2 refinement.
Amends [DR-032](032-session-players.md) in how a player is named on every surface: by a short name and a letter mark, its id in a tooltip.
Amends [DR-075](075-a-failure-says-what-and-what-now.md) in a failure's "what now": a failure naming its agent offers the way to that agent's settings.
Amended by [DR-160](160-the-captain-dispatches-in-plain-sight.md) in its delegation lines: every call puts its line at its traced start, naming its step, and a return line follows it.

## Context

- Players read as raw ids — `dev.reviewer`, `inspect.inspector` — in the lane header, Settings, the Library and failures, while the Captain reads as a name with a letter mark.
- A reader therefore does not notice that each player is a separate agent with its own adapter and model, which is what makes a cross-provider review, or a player that fails alone, understandable.
- Asking before a first call was considered and declined: the Captain picks the playbook and calls a player in one turn, the host has no point at which to pause before that call, and a model change applies from the next message only ([DR-051](051-runtime-held-for-a-turn.md), [DR-067](067-tuning-for-one-conversation.md)); a gate before every send would teach players and their settings to someone whose task is still simple, and a session-wide panel of all agents was ruled out by [DR-068](068-an-agents-settings-where-the-agent-is.md).
- A failed call already reads in plain words, but the run view offers no way from the failure to the agent that failed.

## Decision

### Names and marks

- A player's name is the last dot-separated segment of its id (`dev.reviewer` → reviewer, `alice` → alice); a dot is a naming habit, so no prefix is assumed.
- Where two players of one roster share a last segment, those players read as their full ids.
- A player's mark is the Captain's letter-in-a-circle style holding its name's first letter, uppercased; the Captain keeps the brand colour and every player takes one neutral colour, so `coder` and the Captain, both "C", differ by colour and name.
- The full id rides the tooltip wherever the name stands.
- Name and mark stand in the run view's lane header and rail, Settings' player list, the Library's role bindings and the Captain thread's delegation lines.
- Not decided here: author- or user-chosen names, which need a `name` field in Playbook's config format, and renaming the template's ids.

### Delegation lines

- A player's first call in a session puts one system line in the Captain thread naming it and what it runs — "(R) Handed to reviewer · codex · gpt-6-sol"; a later call adds a line only where its adapter or model differs from that player's previous call, so rounds of review do not repeat it.
- Each call's line is derived from that call's own records: its first record's `role` and the execution context it ran under.
- The configured model is the binding's for that role, falling back to the player's; where the role cannot be resolved to one binding, no configured model is shown, so a player's default never poses as this call's.
- The call's `init` report of the model it ran replaces the configured model ([DR-091](091-models-named-by-the-runtime.md)); with no report, a confirmed setting that names no model reads as the provider default, and an unconfirmed one names no model.
- The session summary's latest model per agent is not used: after a model change it would rewrite earlier lines.
- The line stands in the thread in record order, outside any machine card, so it outlives the run and its card; activating it brings the player's lane into view.
- A call that fails before its player records anything puts no line, and its failure reads in the Captain thread alone.
- Reopening a session derives the same lines from the same records; no prompt, model output or new record is involved.

### Recovery from a failure

- A failure attributable to the Captain or a player names it by its name and offers recovery by cause, reading causes only from the existing runtime-message mapping: Playbook has no cause for an expired credential or an unavailable model, and none is invented here.
- "Adjust ⟨name⟩" opens that agent's existing chip popover ("This conversation only"), effective from the next message: for a player the lane is brought into view and its chip briefly highlighted first, so the reader learns where the setting lives; where the player has no lane yet, the same popover hangs from the failure line.
- "Change ⟨name⟩ in Settings" opens Settings at that agent's row editor, where the adapter is changed for new sessions, since the popover offers no adapter ([DR-051](051-runtime-held-for-a-turn.md)).
- A cause outside Spex — an expired sign-in, a missing command — keeps its existing words of what to do there and gets no button of its own; a failure of the adapter itself — an expired sign-in, a rate limit — adds the Settings entry; an unrecognized failure offers both entries.
- For the Captain, "Adjust Captain" opens the popover on the Captain pane's chip and "Change Captain in Settings" opens the Captain row; where the Captain's chip is not available, only the Settings entry and the words stand.
- No entry swaps a failed player onto another player's settings: that player may fail too, the reader's playbook may not have it, and what it would change is not visible.
- Nothing changes a model or adapter silently.

## Consequences

- The run-view, settings and playbook-library items naming players, the failure entries and the delegation line are amended or added; tests that read raw ids from those surfaces read names.
- Both catalogs gain the delegation line's and the entries' words.
- The wording is a draft to be checked against real sessions.
