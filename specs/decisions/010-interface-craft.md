<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-010: Interface Craft Principles

## Status

Accepted.
§8's interaction hue is amended by
[DR-013](013-sublang-brand.md): brand purple replaces indigo.

## Context

- The owner asked for a design pass not limited to the at-hand rule
  (DR-009): apply the best practices a design expert would.
- An eight-lens audit (Nielsen heuristics, first-run/empty states,
  IM conventions, information architecture, visual system,
  keyboard/accessibility, async feedback, microcopy) produced 51
  adversarially-verified findings. Individually small, they share
  root causes worth writing down so future work doesn't regress
  them.

## Decision

Eight principles govern the interface; every audit finding
cluster traces to one of them.

1. **The conversation is the primary surface.** Events that matter
   to the Boss — a player's question, work in progress, queued
   input — appear as first-class chat citizens (bubbles in the
   thread), not as log lines, side chips, or form banners.
2. **Status speaks human.** Internal identifiers (state-machine
   ids, wire event names, package paths) never serve as primary
   copy. Known states map to plain phrases; unknown ids are
   humanized; the raw id survives in a tooltip for debugging.
3. **Every action acknowledges within a frame.** A click that
   cannot complete instantly shows its in-flight state in place
   (disabled + progress label). No fire-and-forget controls.
4. **Guardrails match consequence.** Destructive actions get the
   one inline confirm pattern (safe default focused, Escape
   cancels); emergency controls (abort) stay one-click but
   self-announce. Confirms name what will be lost (queued
   messages).
5. **Truthful async.** Long operations never falsely fail
   (timeouts sized per command class), report progress, are
   cancelable, and reject concurrent duplicates fail-closed.
   Failures always land somewhere visible with a retry.
6. **Keyboard-first.** Every critical path is operable without a
   mouse; menus follow one keyboard idiom (arrows/Enter/Escape,
   focus stays in the composer); closing or confirming never
   strands focus; standard app shortcuts exist. Implemented
   renderer-side so the UI runs unmodified in a browser (SHELL-10).
7. **Accessible by construction.** Icon-only buttons carry
   aria-labels and ≥24px hit targets; one persistent polite live
   region announces the moments the product is built around;
   text and indicator colors meet WCAG contrast in both themes.
8. **One visual grammar.** A single status palette — emerald
   running, amber needs-you, red failed, neutral idle, indigo
   reserved for interaction — one icon language (inline SVG,
   currentColor), a small type scale (no arbitrary 10px), and one
   button taxonomy (solid primary / bordered secondary / text
   link, sentence-case verbs).

## Consequences

- Spec items under each surface package are amended so tests pin
  the behaviors as the principles land across the code.
- New strings and controls are held to principles 2, 4, and 8 at
  review time; deviations need a recorded decision.
- The compile pipeline gains cancel/busy semantics in the core
  (principle 5) — a protocol addition, not just UI.
