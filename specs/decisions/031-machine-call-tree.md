<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-031: The Run Call Tree

## Status

Accepted.
Amends [DR-028](028-run-machine-view.md): stacked machine cards give way to a drawn call tree; the trace-folded frames and the artifacts contract stand.

## Context

- DR-028's stacked cards met their first real runs and failed four ways, each traced to its mechanism:
  - every finished run grew a second, blank card labeled "stopped": trace events that merely report on a run — statuses, turn settlements, disposal — arrive after its closing transition, and the fold opened a fresh frame for any event whose session it did not know;
  - the `/review` card drew states with no edges: the graph extractor assumed `#machine.path` targets while that machine targets bare declared state ids, so all twenty-five of its edges resolved to nothing — and `/decide` silently lost its failure, join, and resume edges, a worse lie because the remainder looked complete;
  - a first-level child never visually joined its caller: the join gated on a depth threshold the runtime never reports, since the shell counts its root frame as depth zero;
  - arrowheads floated mid-air: a same-rank edge was classified forward and looped under its own row, skip edges cut through intervening rows, and the marker tip overshot a path that already stopped short of the border.
- The deeper failure is relational, not cosmetic: a nested run reads as a second, unrelated machine — nothing on screen says which state called it, and stacking order is the only clue.
  The call is the parent state's own interior — the child machine is what that state is doing — and the drawing hid exactly that.
- Running things spoke two visual languages: a running player pulses in its pane while the running state sat statically green, against the one-grammar rule ([DR-010](010-interface-craft.md) §8) and the one-channel-one-meaning rule ([DR-026](026-data-graphics-craft.md) §1).
- A settled run also dropped its full drawing into the thread, so a session of many runs scrolls through walls of diagrams to reach its own conversation.

## Decision

- **One run, one card, one lifetime.**
  A card exists exactly when its run's trace opened it: only evidence that a run is underway — its start, a transition, a call it makes — opens a frame; events that merely report on a run never do, and the captain shell's own frame is not a run and never draws one.
  A settled run's trace session is tombstoned in the folded state itself, so later events for it change nothing, in live folding and replay alike.
  Disposal closes only a frame still open, and with the run's own reported final status — a finished run stays "done"; "stopped" is reserved for a run that ended unfinished.
- **A call is containment, drawn.**
  A child run's card nests under its caller's card, indented, joined by a drawn connector that leaves the calling state itself — not the card's edge — so the line says "this state is running that machine."
  The calling state names its callee and carries the running mark while it delegates; the child card's header names its calling state in return, so the relation survives with the connector out of view.
  Nesting recurses by the trace's parent link, never by depth arithmetic; a child whose caller is unknown renders at the top level rather than vanishing.
  A child settles under its calling state's position as a strip, in invocation order among that state's calls; only a root run settles into the thread, at the position of the record that settled it.
- **Cards breathe: the full drawing or a strip.**
  A strip is one line — the playbook, its current state or outcome, its calling state for a child, and its status mark — and stands for the card wherever the full drawing would crowd the pane.
  Defaults partition the whole tree: every running leaf card is expanded, and every other card — running ancestors and settled runs — is a strip.
  A delegating caller's strip keeps the containment legible: it names the calling state and its callee, and the connector leaves the strip.
  Disclosure is the reader's arrangement axis ([DR-027](027-linked-views-contract.md)): a toggle overrides the default for that card, alters no fold state, and a replay renders identically whatever was expanded — so disclosure lives outside the fold and is not persisted.
- **One aliveness grammar.**
  The pulsing running mark is the only running mark: the active state box, a running run's strip, the running player's pane, and the sidebar's running rows wear the same pulse, static under reduced motion.
  A parked state keeps the attention voice and a failed state the failure voice, from the same derivations the tabs and sidebar use.
- **Arrows land, edges route.**
  Every edge ends with its head touching the target state's border, oriented along the approach; heads sharing a border distribute so none overlap.
  No edge crosses a state box: same-rank edges route as laterals, rank-skipping and backward edges take side lanes, and reciprocal pairs stay offset.
- **The extractor tells the whole machine.**
  Graph extraction resolves targets against the machine's declared state ids and includes a compound state's own done transition, keeping the stable edge identity so drawings keyed on edge ids never churn.
  A machine-level transition stays out: it has no single source state, so drawing it would either invent one or draw one edge per state — a hairball that says less than nothing.

**Considered and declined:**

- drawing the child machine inside the calling state's box (true statechart embedding): honest but explodes live layout, and a running child would resize its parent mid-read;
- a breadcrumb-only view of the deepest run: compact but hides the caller's shape, which is exactly what the owner asked to see on demand;
- persisting card disclosure: it is transient reading posture, not chrome ([DR-030](030-workspace-chrome.md) covers chrome; a fresh session starts from defaults).

## Consequences

- The run-view machine items are rewritten to this shape — lifetime, containment, strips, the aliveness grammar, and the edge law — with replay coverage for the ghost-card, nesting, and geometry cases.
- The playbook-library graph contract gains id-resolved targets, machine-level and compound-done transitions, and coverage that the installed built-ins each serve a complete, non-empty edge set.
- The card's stacked presentation and its depth-gated join are removed; the left-to-right direction [DR-028](028-run-machine-view.md) chose is corrected to the top-to-bottom the shipped drawing uses, recorded in that decision's Status, and the run-view item follows.
- The design-check gate re-runs on the drawn result in both themes.
