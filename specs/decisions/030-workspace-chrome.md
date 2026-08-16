<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-030: Workspace Chrome

## Status

Accepted.
Generalizes [DR-027](027-linked-views-contract.md)'s pane divider into house chrome law; [DR-029](029-session-history-home.md)'s sidebar tree rides on it.

## Context

- The app's chrome is rigid: the navigation rail has one width forever, and every pane boundary except the spec view's graph divider is fixed.
- The owner asked for the rail to resize or collapse, naming Claude Desktop as the reference — whose sidebar's essence is a two-state collapse to an icon rail, not free resizing.
- DR-027 already built the divider idiom once — pointer- and keyboard-operable, bounded so no pane is squeezed past reading, persisted — but as a one-off for the spec view rather than law.
- Chrome that collapses can hide a duty: the rail carries the app's attention signal ([DR-009](009-at-hand-interaction.md)), so whatever folds away must leave its signals reachable.

## Decision

- **The navigation rail collapses, two states.**
  Expanded shows icons with labels and the sidebar's content; collapsed shows the icon rail alone, each entry keeping its accessible name and gaining a tooltip.
  A toggle at the rail's foot and one keyboard shortcut flip it; the state persists across launches.
  Free-form rail resizing is declined — two good states beat a continuum of mediocre ones.
- **The divider idiom is house law.**
  Every boundary between persistent panes the reader may want to rebalance is a divider: draggable by pointer, operable by arrow keys when focused, bounded so neither side is squeezed past reading, and persisted.
  A divider that also collapses names its collapsed state with a visible reopen affordance and never strands focus (DR-010 §6).
- **Chrome state is preference, not project state.**
  Rail collapse, divider positions, and disclosure state persist app-wide across launches — they are how this person arranges their tool, not facts about a project.
- **Collapse never hides a duty.**
  A collapsed surface's attention signals survive on what remains — the badge on the collapsed entry, a dot on the reopen affordance — so "needs you" is never behind a closed door ([DR-009](009-at-hand-interaction.md)).
  The rail's foot has two tenants, the collapse control and the config-and-playbooks indicator, and both keep an icon-only form with their accessible names: a first-hour failure must not go quiet because the chrome folded (DR-010 §5).
  Collapse is chrome only — it rearranges nothing and reaches nothing away; what the collapsed rail stops listing, the open tabs still hold.

**Considered and declined:**

- free-form resizing of the navigation rail — the reference product's essence is the two-state collapse, and a continuously resizable label rail buys only tuning;
- hover-peek of collapsed chrome — pointer-only, invisible to keyboards, and a surprise on trackpads;
- auto-collapse at narrow widths — chrome that moves by itself trades predictability for cleverness.

## Consequences

- The run-view package gains the rail-collapse item and its coverage; the sidebar tree ([DR-029](029-session-history-home.md)) cites this idiom rather than restating it.
- The spec view's graph divider stands as the idiom's first instance, unchanged.
- The navigation entries gain glyphs in the one icon language (DR-010 §8), since a collapsed rail has only icons to speak with.
