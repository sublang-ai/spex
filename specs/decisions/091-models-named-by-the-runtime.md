<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-091: Models Named by the Runtime

## Status

Accepted (2026-09-28) on the owner's report: "Spex desktop only shows default or recommended, not specific model name, with Claude."
Amends [DR-052](052-runtime-model-options.md), which remains accepted, in how a model choice reads alone: one display rule names every choice, and the model field becomes a listbox whose rows carry the runtime's own words.
Amends [DR-067](067-tuning-for-one-conversation.md), which remains accepted, in §"A chip is a setting, not a receipt" alone: while an agent still runs on the adapter and model setting its latest reporting call began under, its chip's model reads what the runtime reported for that call.
Amends [DR-068](068-an-agents-settings-where-the-agent-is.md), which remains accepted, in the reading its chip carries alone: the reported model in place of the set one, with what is set kept in the chip's title and accessible name.

## Context

- The model field is a native select whose options read `name · id`, so Claude's catalog reads "Default (recommended) · default" and "Opus · opus": the specific model each alias resolves to, `claude-opus-5-5`, matches a saved pin but is never shown.
- A native option holds one line of text, so a model's own description has nowhere to go, and the field's half of a 384-pixel editor truncates what it does show.
- The pane chip reads the configured value: an agent on the provider's default reads its adapter's name and one on the `default` alias reads "default", though the runtime knows which model it ran.
- Cligent's `init` event names a model, but that field can be the requested value or `unknown`, so it cannot be shown as what ran.
- Cligent's next release reports three facts, each absent where the runtime reports none: a model's `description`; the available catalog's `defaultModel` — what the runtime runs when nothing is configured, from its own effective configuration and possibly outside its catalog; and the `init` payload's `reportedModel`, the model the runtime names for the call.
- The Captain's calls are hidden records ([DR-003](003-runtime-reuse.md)), so no page receives the Captain's `init` event.

## Decision

### One display rule

- A value equal to a catalog row's id reads as the row's name followed by the row's specific model: its resolved model where the id is an alias of it — differing from it and not beginning with it — else the id where it differs from the name ignoring case, else nothing.
- A value matching only a row's resolved model — a canonical pin, recognized as [DR-052](052-runtime-model-options.md) decided — reads as itself, and so does a value no row lists.
- An inherited model is named by the same rule wherever an editor offers inheriting it.
- Names, ids, resolved models and descriptions are the runtime's words, never translated.

Claude's rows read "Opus · claude-opus-5-5" and "Default (recommended) · claude-opus-5-5"; a row whose id extends its resolved model reads "Fable · claude-fable-5-1[1m]"; Codex's rows, named as their ids, read by name alone.

### A listbox, not a select

- The model field is a trigger opening a single-select listbox; the trigger reads the value's display, and the empty value reads "Provider default" followed by the runtime's default model where reported.
- Each row has two lines: the name with the specific model muted beside it, then the runtime's description where reported.
  "Provider default" leads, its second line the default model; "Custom model…" ends.
- The listbox follows the listbox idiom the slash menu already uses — opened from the keyboard or a click, walked with the arrows, chosen with Enter, dismissed with Escape — and lies inside the box that must show it ([DR-041](041-chrome-that-fits.md)).
- The agent editor gives the field its full width.

### The chip says what ran

- The core folds, per agent, the model the runtime reported for its latest call to report one, with the adapter and model setting that call began under as the execution context in the stream records them; the Captain's hidden calls fold like any other, as active time does ([DR-070](070-agent-active-time.md)).
- While the agent still runs on that adapter with that model setting, its pane chip reads the reported model in place of the set value; a change to either — this conversation's own or the configured value — returns the chip to the set value at once, as [DR-067](067-tuning-for-one-conversation.md) requires of a setting.
- Effort and fast mode do not change which model the runtime runs, so changing them keeps the report standing.
- A player whose role bindings run it on different models keeps its set value, since no one report names what that lane runs.
- The chip's title and accessible name keep both what is set — the value, or the provider-default words — and what the runtime reported.
- The chips of Settings, the Library, the Captain home and drafts keep reading the configuration: they describe a file, not a run.

Considered and declined:

- Showing or saving the resolved model in the configuration: [DR-052](052-runtime-model-options.md) forbids rewriting a pin, and an alias is the reader's choice to follow the provider.
- Reading the `init` event's `model` field: it can be the requested value or `unknown`.
- Folding in the page from its session channel: the Captain's calls never reach it.
- Timing each settings change: the configuration is also edited by hand, and change times would need a store of their own, while the settings each call began under are already in the stream and replay identically.
- Discovery for the chip: discovery belongs to an open editor ([DR-052](052-runtime-model-options.md)), and a chip waiting on a subprocess reads nothing while it runs.

## Consequences

- The protocol carries a model's `description`, an available catalog's `defaultModel` and a session summary's `agentReportedModels`, each optional and additive, so its version stands; records keep `reportedModel` as sent.
- `settings-29`, `settings-34`, `settings-35` and `settings-36` are amended and `settings-38` to `settings-41` added; `run-view-102`, `run-view-138`, `run-view-139`, `run-view-140` and `run-view-144` are amended and `run-view-152` added; `core-service-32` and `core-service-34` are amended and `core-service-115` and `core-service-116` added; `playbook-library-4` and `playbook-library-39` are amended.
- Until Cligent reports these facts, rows carry no descriptions, the provider default names no model, and every chip reads its set value as before.
