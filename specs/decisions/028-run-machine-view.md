<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-028: Run Machines Drawn

## Status

Accepted.
Applies [DR-026](026-data-graphics-craft.md)'s data-graphics craft and [DR-027](027-linked-views-contract.md)'s solved-layout doctrine to the run view; the playbook repository's sketch-view visualizer retires in its own repo once this lands.
Amended by [DR-031](031-machine-call-tree.md): the stacked cards ordered by depth, the left-to-right rank direction, and the full-drawing history entry give way to the drawn call tree, the top-to-bottom layout as shipped, and settled strips.

## Context

- A playbook run is a state machine running, but the Captain pane narrates it as glyph text lines (`▸ ⮕ ⤷`) and one header chip — the shape of the run, what has happened, and what comes next are invisible.
- The owner asked for the machine drawn live in the Captain pane: active states and transitions with player progress, stacked machines shown together, each run settling into chat history when it finishes; read-only.
- The data already flows: the runtime's `playbook.trace` telemetry names the machine (`playbookId`), its invocation (`sessionId`, `depth`, parent linkage), every `fsm.transition`, and each player call's owning state — today the reducer drops that topic on the floor.
- The machine's shape is nearly served: `playbook.artifacts` derives state ids from the hosted XState machine's config, but not the transitions; the UI is protocol-only, so the definition must arrive as data, never as an imported module.
- The playbook repository's `views/sketch` prototype proved the grammar — state boxes, active-state and fired-transition emphasis, a stable edge identity distinguishing guarded branches — and its own DR-003 recorded that a card-like presentation beats a sprawling arrow diagram.
- Stately's open-source work offers no embeddable renderer as of August 2026: the inspector UI is hosted-only, `xstate-viz` is archived, and Stately Sketch is a standalone application [[1]]; the graph utilities extract a digraph but lay out nothing [[2]].
- Separately, the owner's open pane hit a normal-chat failure whose real cause — the captain adapter's expired sign-in — reached the store only as hidden records, while the visible reply said "I could not finish deciding that turn": a DR-010 §5 violation in the flesh.

## Decision

- **The machine card.**
  While a playbook run's trace flows, the Captain pane draws that run as a live statechart card: every state a labeled box, every transition a directed edge, the active state emphasized, each firing transition flashing once, and the player activity of the active state shown on it.
  When the run finishes, the card settles into the thread as a static history entry at its finish position — the drawn record of what ran — and the live region empties.
  Concurrent machines — a playbook calling another — stack as linked cards ordered by call depth, the child visually joined to the parent, each live at once.
  The card is read-only: it drives nothing and never intercepts the composer.
- **Status speaks in the status palette.**
  The card spends no new hue: the active state runs emerald, a parked state awaiting the Boss holds amber, a failed state holds red, visited and idle states stay ink on the surface (DR-010 §8) — and every state label is the human label, raw ids in tooltips (DR-010 §2).
  A fired transition's flash decays in well under a second and collapses to an instant change under the reduced-motion preference; direction shows at rest with constant-size glyphs ([DR-026](026-data-graphics-craft.md) §5).
- **The definition arrives as data.**
  The core serves each hosted playbook's machine graph over the artifacts contract: nodes (id, parent, kind, player role, state tags), edges with the sketch view's stable identity — owner, event, branch index, target index — and the initial state, all derived from the machine config the core already imports.
  The UI never imports a playbook module; a run whose definition is unavailable still draws — the observed states and transitions alone — so the card degrades to the truth it has seen.
- **Live state folds from the trace.**
  The reducer folds `playbook.trace` records, schema-tolerantly: an invocation start opens a frame keyed by the trace's session identity; each `fsm.transition` moves the frame's active state and marks the fired edge; player-call traces attach player activity to their owning state; the settled or disposed trace closes the frame into history.
  The fold is pure over the record stream, so a replayed session reproduces the same cards with no live runtime attached; the definition is presentation-side data joined at draw time.
- **Layout is solved once, tiny and fixed.**
  A machine's card lays out left to right by rank from the initial state, siblings ordered stably, self-loops arced over their state, backward edges routed below the ranks; boxes are fixed-size, spacing computed, nothing physical and nothing tuned ([DR-027](027-linked-views-contract.md)).
  This is a hand-rolled layered layout of a dozen boxes — no dependency; `@dagrejs/dagre` (MIT, maintained) is the recorded escape hatch if real machines ever produce crossings that embarrass it [[3]].
- **The glyph stream folds into the card.**
  While a frame is open, the shell's state-progress glyph lines are absorbed — the card is their rendering — following the pane's existing precedent of replacing a status echo with its first-class form; failure lines are never absorbed (run-view-2 stands).
  Where no frame exists — older recordings, runtimes that emit no trace — the glyph lines render exactly as today, and the header chip stays in every case.
- **Captain failures surface whole (DR-010 §5 enforcement).**
  When a captain turn's result reports an error, the core synthesizes a visible failure record carrying the underlying error text, so the pane names the real cause — an expired sign-in names the sign-in — beside whatever polite reply the captain composed; hidden records stay hidden.

## Consequences

- The run-view package amends: the glyph vocabulary's progress stream gains its absorption rule, the fixture replay pins the cards, and new items legislate the live card, the history card, stacking, degradation, and the failure surfacing; the state chip and failure-line items stand unchanged.
- The playbook-library package's artifacts contract amends to carry the machine graph; the protocol's artifacts shape extends with it.
- The core-service package gains the captain-failure surfacing item.
- The playbook repository retires `views/sketch` and its CI and spec package by its own decision record, once this visualization stands in.
- The sketch view's spec invariants worth keeping — layout computed once per machine, active emphasis including ancestors, fired flash decay, stable edge identity — live on in the amended run-view items rather than in a retired package.

## References

[1]: https://stately.ai/blog/2026-03-26-introducing-stately-sketch "Stately Sketch announcement — open-source standalone application, not an embeddable component"
[2]: https://stately.ai/docs/xstate-graph "XState graph utilities — digraph extraction without layout"
[3]: https://www.npmjs.com/package/@dagrejs/dagre "@dagrejs/dagre — maintained MIT layered layout"
