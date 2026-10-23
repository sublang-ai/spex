<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-146: A Lane Appears with Its First Call

## Status

Accepted (2026-10-24) for the owner's P0-1 refinement.
Amends [DR-032](032-session-players.md) in the run view's pane roster: a pane stands for each player a call has reached, not for each player the bindings reference.

## Context

- DR-032 gave every bound player a pane for the session's whole life, so a lane the reader follows never leaves under them.
- A fresh session therefore opens beside a row of idle panes, each reading "Idle until the playbook calls ⟨lane⟩", which take most of the width before any work runs.
- The reader cannot tell from that row which player a task will engage: `/branch` runs on `dev.coder`, yet the reviewer's idle pane stands beside it as if it were part of the work.
- Bringing a working lane into view used the browser's scroll-into-view, which also scrolls every scrolling ancestor, so in the stacked form a new call could carry the Captain's question and composer out of view.

## Decision

- A bound player's pane appears when the session holds that player's first call record — its prompt, an event, or its finish — and stays for the rest of the session; a player no call has reached takes no place, and a roster with no players still renders no pane.
- Panes stand in the order of their players' first call records and never reorder by which one is working, so simultaneous calls appear side by side in that order with no limit on their number.
- DR-032's guarantee that a lane the reader follows never leaves under them is kept, narrowed to the lanes a call has reached.
- A delegation that fails before any record of its player arrives adds no pane; its failure reads in the Captain thread alone, while a call that records anything and then fails keeps its pane with the failure in it.
- Which panes stand, and in which order, is derived from the session's records, so reopening a session, restarting the app or switching sessions shows the same panes in the same order.
- Until a first call, the Captain column stands alone at the Captain home's reading width with no divider, which DR-032 already required of a roster with no players; the layout changes once, when the first pane appears.
- Bringing a working or newly appeared lane into view moves only the player grid's own scroll offset, never the page, the Captain column or the keyboard focus.
- The idle lane's copy is retired with the idle lane.

**Accepted loss:** a player no call has reached has no pane header, so neither its agent chip nor that chip's session tuning is offered before its first call; the shared configuration in Settings still reaches it, and guidance before a first call is a separate concern.

**Considered and declined:**

- labelling a pane with the playbook or task it serves: a call does not always carry a resolvable playbook, `dev.coder` is shared by most built-ins, and a nested call would need a rule for which level to name;
- removing a pane when its call finishes: it reintroduces the lane leaving under the reader that DR-032 ruled out;
- ordering panes by which one is working: a working lane is already brought into view, and reordering moves what the reader is reading.

## Consequences

- The run view's pane-visibility item and the tests that asserted one pane per bound player or the idle copy are rewritten for panes that appear with their first call.
- Journeys that collapsed an idle lane now collapse a lane a finished call left standing.
- Both catalogs lose the idle lane's message.
