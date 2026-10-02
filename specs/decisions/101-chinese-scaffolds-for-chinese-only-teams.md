<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-101: Chinese Scaffolds for Chinese-Only Teams

## Status

Accepted (2026-10-02).
Amends [DR-001](001-scaffold-localization.md) in translation coverage and source pins for the added seed overlays.

## Context

- The first Chinese scaffold localized writable syntax and the index while keeping most authoring rules and starter records in English.
- Chinese-only workshop teams need to read those rules, use the supplied Git and licensing contracts, and adapt the starter intent without a separate translation step.
- English remains the canonical source, and translations must preserve its requirements, identifiers, and relationships.

## Decision

- The Chinese overlay translates the complete bundled spec tree: the meta rules, structure decision, index, Git and licensing packages, and starter intent.
- Requirement meanings, item and record IDs, filenames, machine-readable markers, code syntax, and citation targets retain their canonical roles.
- The existing Chinese GEARS forms and authoritative reference remain in use.
- Meta keeps its per-item and whole-file source pins; the index keeps its existing whole-file pin and link parity.
- Each additional translated spec file carries one whole-file source pin naming its path relative to `scaffold/`, and preserves its canonical item IDs and citation targets.
- The root license text, managed agent-instruction marker and body, and tool-facing support prompts retain their current language.
- Existing update, pristine-file detection, and preservation of customized seeds apply to the expanded overlays unchanged.

## Consequences

- Chinese-only teams can read and adapt the entire seeded spec tree.
- Canonical source changes require corresponding translation review before the drift checks pass.
- Translation changes no authoring law and creates no separate Chinese set of requirements.
