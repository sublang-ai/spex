<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-041: Chrome That Fits

## Status

Accepted (2026-09-02) on the owner's review: overlapping text in narrow panes, a composer whose buttons leave their box, a native resize grip inside a custom control, and button labels that run to sentences.
Amends [DR-010](010-interface-craft.md) with a ninth principle and clarifies [DR-030](030-workspace-chrome.md): panes stacking under a container width is layout, not chrome that moves by itself.

## Context

- The same pane renders at many widths: the Captain column is set by a divider and the rail's state, the served page has no window floor, and the desktop window has none either.
  A row laid out for one width overlaps at another: the Specs outline's count chips paint over the package name below about 800px, and the composer's three buttons leave their box whenever a turn runs in a column narrower than about 530px.
- Two idioms already point the way — the player pane hides its usage below a container width, and the settings requirement text wraps rather than truncates — but nothing names the rule, so each new row invents its own.
- Button labels grow when a busy form is added ("Compiling… (agent-driven, this takes a while)") or a sentence is used as a label ("Start a new session"), shifting neighbours and breaking at the first narrow pane.
- The composer's text field carries the browser's native resize grip mid-row and a placeholder too long for the field it sits in; the hint about `/` commands has nowhere else to live.
- [DR-010](010-interface-craft.md) governs copy, status, guardrails, keyboard, accessibility, and one visual grammar, but says nothing about width, wrapping, truncation, or overlap.

## Decision

### §9 Chrome that fits

- The unit of fit is the pane, not the window: every row, toolbar, and header fits its own container, and width-dependent forms are container queries on the pane or row — never viewport media queries, never a JavaScript width hook.
- Three named container steps serve the whole interface: `@xs` (20rem, the reflow floor: a pane at 320px still shows its duty and its primary control), `@md` (28rem: labels and hints return), `@2xl` (42rem: at-a-glance extras return).
  Literal steps normalize to these.
- A control in constrained chrome — the tab strip, the rail, the composer's action row, row menus, list rows, pane and card headers — reads at most 14 characters, its busy form included, preferring two words; the busy form never widens the control; the longer truth lives in the title and, where it changes meaning, the accessible name.
  A control on a wide surface — forms, empty states, banners — may run to a sentence-case phrase, never a sentence.
  A product name ("Try the Academy example") is exempt on wide surfaces only.
- In every row exactly one child owns the slack — minimum width zero, growing, truncating with the full text in its title; marks, chips, ages, and controls refuse to shrink only when narrower than about 6rem; no text child is both unshrinkable and unbounded.
- The ladder, applied in order as the container narrows: the action row wraps, primary last and right; free text truncates with its title; at-a-glance duplicates hide first — usage, ages, rollups, the words beside counts — information the surface repeats elsewhere; a labelled control collapses to icon plus tooltip with its accessible name and its taxonomy unchanged; side-by-side panes stack; only canvases — a machine drawing, the graph, a table — scroll sideways, inside their own scrolling container with the fade mask.
  Overlap and clipping are never on the ladder, and the page body never scrolls sideways.
- Floors: every pane fits at 280px with nothing overlapping; the whole interface at a 320px viewport paints nothing over anything and nothing outside the viewport except inside a scrolling canvas.
  The open rail is 224px, so the 320px floor holds with the rail collapsed; the rail still moves only by the user's hand.
- Native chrome stays out of custom controls: no resize grips, no native scrollbars in a composer box; a text field grows to a stated maximum, then scrolls.
  A positioned badge never covers a glyph; a count prints "9+".
- The composer's shape: the field on top, growing with its text to a maximum; an action row beneath that wraps — secondary on the left, the primary last on the right; a placeholder of at most 24 characters; hints and acknowledgments share one caption line.

### Verification

- A browser journey measures fit: for each surface, each rail state, and viewports from 320px to 1280px, no element scrolls sideways unless it is a canvas, no two visible siblings in a row overlap, every child lies inside its parent, and every control keeps its accessible name at every width.
  Simulated documents cannot measure layout, so the journey is the only home of this evidence.

## Consequences

- Composer labels shorten ("Send" and "Send next"), the ended notice's control becomes "New session", busy forms keep their width, and the composer is rebuilt to the shape above.
- The Specs outline's count chips keep their words above `@md` and print numbers alone below it, the words riding the accessible name.
- [DR-010](010-interface-craft.md)'s review list gains this principle: a new row or control is held to the label budget, the yield order, and the ladder.
