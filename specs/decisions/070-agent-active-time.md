<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-070: Agent Active Time

## Status

Accepted (2026-09-17) on the owner's choice of cumulative session time, with its measurement and resting place decided together.

## Context

- The Boss chose a session-cumulative figure rather than a duration repeated beside every turn.
- The run view already shows a player's open call as "working · ⟨elapsed⟩" and reports tokens on a completed call, but it carries no durable reading of how long an agent has worked across the session.
- The current runtime reports the whole invocation's `durationMs` on terminal agent `done` events; the record identifies the actor as the Captain or a player, and hidden Captain records remain in persistence under [DR-003](003-runtime-reuse.md).
- Deriving Captain time as the remainder of a turn would charge orchestration and settlement gaps to the Captain even though the runtime reports the Captain's own invocation time directly.
- Different agents may run concurrently, so honest per-agent figures can exceed the session's wall-clock duration and cannot be presented as a partition.
- A cumulative fact repeated in the transcript would go stale or recur, while a separate session rollup would add a surface for information already anchored by each agent's pane ([DR-068](068-an-agents-settings-where-the-agent-is.md)).

## Decision

### The measure is reported active time

- Each session carries one optional cumulative **active time** for the Captain and for each player.
- An agent's active time is the sum of every finite, non-negative `durationMs` on that agent's terminal `done` events across the session.
- A `captain_event` accrues to the Captain, including a hidden routing or playbook call; a `player_event` accrues to its player lane across every role and playbook that shares it ([DR-032](032-session-players.md)).
- Every terminal status counts because the invocation consumed agent time regardless of its outcome.
- A tool's duration is not added separately, because the terminal duration covers the whole invocation.
- An open call does not enter the completed-call figure; the existing live elapsed reading describes open player work without estimating its eventual reported duration.
- A terminal `done` without a valid reported duration, or a finished-call record with no preceding unmatched `done`, makes that agent's cumulative figure unmeasured and therefore silent rather than leaving a partial total.
- A stream marked incomplete makes every cumulative figure silent, because its retained prefix cannot establish a session total for any agent.
- Time between agent calls, orchestration and settlement gaps, between-turn idle time, and time awaiting the Boss belong to no agent.

### Parallel figures are independent

- Each agent's reported time is accumulated independently, and overlapping calls keep their full reported durations even when attributed to the same agent, so the figures may sum beyond wall-clock session time.
- The interface shows no combined total, share, percentage, bar, or ranking, and claims neither that the figures partition the session nor that they explain all of its elapsed time.

### One quiet reading where the agent lives

- The core folds complete persisted records and publishes one optional figure per measured agent; the view formats that fold and never derives another, so replay after a restart produces the same reading.
- The Captain pane's header and each player pane's header carry a separate muted phrase, `active · 3m 12s`, beside the agent's identity and outside its settings chip, whose meaning remains a setting rather than an execution receipt ([DR-067](067-tuning-for-one-conversation.md)).
- A player's existing "⟨role⟩ working · ⟨elapsed⟩" occupies the same at-a-glance place while its call is open; a fold-changing terminal event refreshes the cached cumulative figure behind it, and after the closing record the slot follows the latest published figure or silence.
- The Captain's existing "Captain is thinking…" thread indicator remains the turn's live non-player progress signal, but it does not itself advance the Captain's active-time figure; only a folded terminal `done` does.
- The title and accessible description name the measure, its value, and its overlap rule in one phrase: "Completed active time this session: 3m 12s · parallel calls overlap" ([DR-069](069-key-phrases-not-sentences.md)).
- Before an agent has a reported duration, its header says nothing rather than `0`; a reported zero is measured and uses the duration vocabulary's `<1s` form.
- The phrase is the first header extra to yield as its pane narrows under [DR-041](041-chrome-that-fits.md), while its reading remains in the header's accessible description; a folded player lane carries it only in the rail's tooltip and accessible description.
- Per-call token usage stays on the completed call's result line and leaves the player header, so the cumulative reading adds no second resting metric there; no time figure enters the transcript.
- The one duration vocabulary covers cumulative readings through hours with at most two units and no zero padding — `<1s`, `12s`, `3m 12s`, `2h 5m` — never raw milliseconds.

Considered and declined:

- assigning every part of a turn not held by a player to the Captain — it makes unlike figures by calling runtime overhead Captain work;
- deriving call spans from record timestamps — it duplicates a terminal whole-invocation measure the runtime already reports and disagrees with it when wrapper work surrounds the call;
- dividing parallel time among agents so their figures add up — it turns actual invocation durations into arbitrary shares;
- a session-level summary, transcript line, Dashboard figure, or history-row figure — each adds or repeats a surface beyond the requested in-session reading.

## Consequences

- The session summary protocol gains one derived per-agent active-time field and republishes whenever stored history or its completeness state alters the fold, with no storage-format change or additional fetch.
- The run view gains the compact header reading and removes the player's duplicate header token rollup while retaining its per-call result-line usage.
- Persistence, replay, and foreign-session scans rebuild the same fold from each complete stored stream; no renderer-local accumulator can drift after reload.
- Verification covers direct Captain attribution, shared players, parallel durations, non-success outcomes, missing or incomplete measurements, restart stability, and narrow-pane presentation.
- [DR-044](044-no-money-in-the-interface.md) remains unchanged: active time carries no rate, cost, or implication of spend.
