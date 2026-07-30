<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-016: Spec Relationship Presentation

## Status

Superseded by [DR-000](000-spec-structure-format.md) — the new DR-000 collapses relationship kinds into one citation mechanism, reversing this DR's classified presentation model.

## Context

- The [DR-012](012-spec-package-files.md) layout made spec relationships first-class and of distinct kinds: a package item's precondition may cite a peer's External Behavior (direct use), a composition binding resolves client needs to providers, scenarios compose package items into integrated behavior, and test items cite what they verify and execute.
- The spec view renders every citation the same way — a flat cites row and a generic cited-by backlink — so the kinds that make the model legible are invisible.
- Relationship metadata lines are banned; an item's clause citations are the single source of its relationships, and the Academy seed corpus exercises every kind.
- The view is a left-rooted outline by prior decision ([DR-011](011-project-workspace.md)); a graph surface is out of scope.

## Decision

### Classification, derived not declared

- The view classifies each citation edge from the citing item alone; the protocol carries no relationship metadata.
- A package behavior item's edge to a peer-file target is a *use*; its same-file citations are unlabeled internal references.
- A Binding-section item's edges split by clause side per the one-sentence binding grammar: citations before the item's `shall` are the *clients* it serves, citations after it are the *provisions* it resolves to.
- A Scenario-section item's edges are *composes*; its same-file binding targets present as the bindings the scenario runs *via*.
- A Verification- or Tests-section item's edges are *verifies*; a composition test's same-file scenario and binding targets present as what it *executes*.

### Presentation

- Expanded items carry labeled relationship rows with a fixed glyph-and-word grammar — uses; serves and provides; composes and via; verifies and executes — every entry an in-view jump.
- Inbound relationships appear as grouped, expandable backlink rows on the target: used by, client of and provided by, composed in, verified by.
- Kind is never conveyed by color alone; the group hues stay the group channel, and kind labels are words with glyphs.
- An expanded file node's header carries a per-kind relationship rollup (counts in and out), so a package's coupling is visible before opening items.

### Degradation

- A binding whose text does not match the one-sentence grammar keeps plain unlabeled citation rows; classification never invents an edge it cannot place.

## Consequences

- The presentation makes the meta package's relationship semantics visible without new spec syntax or protocol change; classification is a client-side derivation over the served tree.
- The clause-side split leans on the binding grammar; malformed bindings degrade gracefully and lint remains the enforcement point.
- The spec-view package's item and citation behaviors are amended to the classified model.
- The Academy seed becomes the teaching surface: opening any composition shows bindings resolving clients to providers and scenarios composing package behavior.
