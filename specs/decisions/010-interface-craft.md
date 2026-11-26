<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-010: Interface Craft Principles

## Status

Accepted; revised (2026-09-02).
Amended by [DR-013](013-sublang-brand.md), [DR-026](026-data-graphics-craft.md), [DR-041](041-chrome-that-fits.md), [DR-066](066-every-summons-has-a-door.md), [DR-069](069-key-phrases-not-sentences.md), [DR-078](078-the-interface-speaks-the-readers-language.md), [DR-085](085-boss-talks-through-captain.md), [DR-111](111-the-core-coordinates-as-git-does.md), [DR-135](135-a-welcome-page-before-the-first-project.md), [DR-172](172-surfaces-a-fresh-user-reads.md), [DR-181](181-owned-session-start-wait.md), [DR-211](211-a-panel-carries-its-own-way-out.md).

## Context

- The owner asked for a design pass not limited to the at-hand rule ([DR-009](009-at-hand-interaction.md)): apply the best practices a design expert would.
- An eight-lens audit (Nielsen heuristics, first-run/empty states, IM conventions, information architecture, visual system, keyboard/accessibility, async feedback, microcopy) produced 51 adversarially-verified findings. Individually small, they share root causes worth writing down so future work doesn't regress them.

## Decision

Eight principles govern the interface; every audit finding cluster traces to one of them.
Later decisions add more: chrome that fits ([DR-041](041-chrome-that-fits.md)), every summons has a door ([DR-066](066-every-summons-has-a-door.md)), key phrases rather than sentences ([DR-069](069-key-phrases-not-sentences.md)), the interface speaks the reader's language ([DR-078](078-the-interface-speaks-the-readers-language.md)), the surfaces a fresh user reads ([DR-172](172-surfaces-a-fresh-user-reads.md)), and a panel carries its own way out ([DR-211](211-a-panel-carries-its-own-way-out.md)).

1. **The conversation is the primary surface** once a project is registered ([DR-135](135-a-welcome-page-before-the-first-project.md)). Events that matter to the Boss — the Captain's questions and replies, work in progress — appear as first-class chat citizens (bubbles in the thread), not as log lines, side chips, or form banners; the Captain owns a question's wording ([DR-085](085-boss-talks-through-captain.md)).
2. **Status speaks human.** Internal identifiers (state-machine ids, wire event names, package paths) never serve as primary copy. Known states map to plain phrases; unknown ids are humanized; the raw id survives in a tooltip for debugging.
3. **Every action acknowledges within a frame.** A click that cannot complete instantly shows its in-flight state in place (disabled + progress label). No fire-and-forget controls.
4. **Guardrails match consequence.** Destructive actions get the one inline confirm pattern (safe default focused, Escape cancels); emergency controls (abort) stay one-click but self-announce. Confirms name what will be lost.
5. **Truthful async.** Long operations never falsely fail (timeouts sized per command class, and none on a session start that owns runtime initialization — [DR-181](181-owned-session-start-wait.md)), report progress, are cancelable, and reject concurrent duplicates fail-closed — except that a duplicate Space operation joins the one running and environment commands start beside one another ([DR-111](111-the-core-coordinates-as-git-does.md)). Failures always land somewhere visible with a retry.
6. **Keyboard-first.** Every critical path is operable without a mouse; menus follow one keyboard idiom (arrows/Enter/Escape, focus stays in the composer); closing or confirming never strands focus; standard app shortcuts exist. Implemented renderer-side so the UI runs unmodified in a browser [[app-shell-10](../packages/app-shell.md#app-shell-10)].
7. **Accessible by construction.** Icon-only buttons carry aria-labels and ≥24px hit targets; one persistent polite live region announces the moments the product is built around; text and indicator colors meet WCAG contrast in both themes.
8. **One visual grammar.** A single status palette — emerald running, amber needs-you, red failed, neutral idle, brand purple reserved for interaction ([DR-013](013-sublang-brand.md)) — one icon language (inline SVG, currentColor), a small type scale whose smallest step is 12px — readable text, a chip, an age, a caption, or a badge, never wears an arbitrary 10–11px size, which only a tooltip may — and one button taxonomy (solid primary / bordered secondary / text link, sentence-case verbs).

## Consequences

- Spec items under each surface package are amended so tests pin the behaviors as the principles land across the code.
- New strings and controls are held to these principles and those later decisions add at review time; deviations need a recorded decision.
- The compile pipeline gains cancel/busy semantics in the core (principle 5) — a protocol addition, not just UI.
