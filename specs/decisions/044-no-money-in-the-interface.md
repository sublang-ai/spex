<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-044: No Money in the Interface

## Status

Accepted (2026-09-03).

## Context

[DR-032](032-session-players.md) restored a cost figure to the player pane's usage line once cligent gave cost a provenance: `$0.05` when the provider reported it, `≈$0.40` when an account or the agent estimated it.
In a demo, and for anyone meeting Spex for the first time, a dollar amount beside every turn reads as a running bill — the figure stands out from everything around it and is what a watcher remembers, however small and however labeled.
The runtime still reports it, and the core still records it: the question is only whether the interface shows it.

## Decision

The interface shows no monetary amount anywhere.

- The player pane's usage line reports token totals only, and stays silent where the turn reported none.
- A cost the runtime reports stays in the session record and the protocol as recorded data; no surface renders it, whatever its provenance.
- Showing money again, in any form — a per-turn figure, a session rollup, a budget — takes a new decision, not a flag.

## Consequences

- The run view's usage item is rewritten to state tokens only; the interface's usage view drops its cost fields.
- The recorded fixture stream keeps carrying a cost, so the replay proves the pane never shows one.
- The core's protocol and its records are untouched: nothing about what is recorded changes, only what is shown.
