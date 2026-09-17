<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-071: Active Time Follows Held Calls

## Status

Accepted (2026-09-17) on review of the sibling tmux-play shell's existing per-agent timer.

Amends [DR-070](070-agent-active-time.md) in its measurement and publication timing alone.
That record's agent-local placement, independent overlap, silence for an incomplete stream, compact reading, and lack of a run-view rollup stand unchanged.

## Context

- [DR-070](070-agent-active-time.md) chose an agent's terminal reported invocation durations as the durable measure.
- The sibling tmux-play shell that Spex adopts as its behavioral twin already times an agent from its prompt record to its finished record ([DR-003](003-runtime-reuse.md)) [[1]].
  The run view's live player reading begins at that same prompt, so changing to the terminal duration at rest gives one call two meanings.
- The prompt-to-finish span measures how long the shell held that agent's call, including its wrapper work; the terminal duration measures only the invocation inside that wrapper.
  A call timed in the CLI while running must not acquire a different completed duration when the desktop later folds the same shared records ([DR-036](036-file-state-store.md), [DR-045](045-unified-session-storage.md)).
- Normal aborts, adapter failures, and adapter completion without a terminal event are normalized to a terminal duration before the shell finishes [[2]].
  Consistency with the existing timer, not a fallback for ordinary missing telemetry, is the reason to change the measure.
- The CLI timer is live process state rather than a replay-stable fold [[1]].
  The core can give the same measure durable session meaning by folding the shared records.
- A cumulative fold need not be published between an agent's terminal event and its finished record.
  Foreign-session scans may publish a folded summary and a batch of records in either observable order, and the view can converge on the latest summary without a protocol interleave.

## Decision

### A held call is the measure

- An agent's completed active time is the sum of the non-negative wall-clock spans from each of its prompt records to the corresponding finished record in the same turn, paired in record order.
- A player span belongs to its player across every role that player serves; a Captain span belongs to the Captain, including a hidden routing or playbook call ([DR-032](032-session-players.md)).
- Every closed call counts regardless of outcome.
  Terminal event durations, tool durations, turn spans, and gaps between calls are not added.
- An open call contributes nothing to the resting cumulative figure until it finishes.
  An unmatched prompt or finish contributes no span and never erases an earlier measured span.
- Only prompt and finished records with finite numeric timestamps can form a span.
  An invalid timestamp neither opens nor closes a pair and never changes an earlier measured span.
- Parallel spans retain their whole duration, including spans of different agents that overlap.
  Time between calls remains unowned, so the figures neither partition nor explain the session's wall-clock duration.

### One measure, presentation native to each shell

- The prompt-to-finish span is the authoritative per-agent cumulative measure for shared session history.
- The CLI shell may tick closed-plus-open time and show its existing session-wide turn timer; the desktop run view keeps its current-call live player reading, shows completed cumulative time at rest, and adds no combined total.
  Each shell formats the measure for its own established chrome.
- The core derives the completed fold from stored records so reload and foreign-session discovery produce the same resting figures.
- Publication is order-neutral: when a stored finish changes the fold, subscribers receive the revised summary without any required position relative to that finished record.
  Until it arrives, the view keeps the last published resting figure or silence.

Considered and declined:

- keeping terminal reported duration as the durable measure — it preserves two definitions for the same agent timer and breaks continuity between the live and resting readings;
- using terminal duration when present and record timestamps as a fallback — one figure would mix unlike measures according to call outcome;
- assigning player-free turn time to the Captain — it remains residual attribution of orchestration and settlement rather than the Captain's held call.

## Consequences

- [DR-070](070-agent-active-time.md)'s `active` reading and overlap disclosure remain, but "completed active time" now means completed prompt-to-finish spans.
- The protocol field and storage format do not change; the core fold changes its record inputs and advances when a call finishes.
- The view accepts either record/summary order at settlement and never derives the cumulative figure from terminal events.
- Verification covers direct Captain and player spans, failure outcomes, overlap, unmatched records, incomplete streams, restart stability, and both settlement message orders.

## References

[1]: https://unpkg.com/@sublang/cligent@0.26.0/dist/app/tmux-play/ "Cligent 0.26 tmux-play distribution"
[2]: https://unpkg.com/@sublang/cligent@0.26.0/dist/cligent.js "Cligent 0.26 normalized run protocol"
