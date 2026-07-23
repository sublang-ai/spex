<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-012: One-File Spec Packages and Interactions

## Status

Accepted

## Context

- The three-folder layout (`specs/user/`, `specs/dev/`, `specs/test/`) split every package across up to three files; understanding one package meant reading three places, and the split invited drift between them.
- Behavior that emerges from packages working together had no home: cross-package scenarios lived implicitly in Where/While clauses and in test items filed under whichever package hosted them.
- Structure and citation hygiene were enforced only by review; nothing mechanical caught broken anchors, duplicate IDs, or layout drift.

## Decision

- Two item directories replace the three folders ([DR-000](000-spec-structure-format.md)):
  - `specs/packages/` — one file per package with `## External Behavior`, `## Internal Behavior`, and `## Verification` sections ([META-28](../meta.md#meta-28)); one read covers a package.
  - `specs/interactions/` — cross-package behaviors and scenarios, named after the behavior (never package-name concatenations), holding the integration/acceptance tests that span packages — superseded by `specs/compositions/` in the 0.4.0 composed-model port ([META-31](../meta.md#meta-31)).
- Migration is mechanical, not manual: `spex scaffold --update` merges legacy trees with a real Markdown parser (byte-faithful slicing, heading demotion, reference renumbering), rewrites citations across `specs/`, and restructures a customized `map.md` ([SCAF-39](../packages/scaffold.md#scaf-39)–[SCAF-42](../packages/scaffold.md#scaf-42)). Agent prompts cover what a tool cannot infer: intent reconciliation and interactions content.
- `spex lint` guards the format from then on ([LINT package](../packages/lint.md)); this repo's own tree is lint-gated by the CLI test suite.
- META items evolve in place: META-1/9/10/20/21 were rewritten for the new structure under their existing IDs — following the precedent of the `specs/items/` flattening — because their roles (layout, package composition, naming, Verifies, test scope) are unchanged; anchors and citations stay valid. New rules use provisional IDs (META-28, META-31); only IDs and concerns present in a published release are reserved. DR-000 likewise evolved in place, as the framework-owned living record of the current structure.
- The in-place rewrites were legal under the META-12 released with v0.3.0, which locked item IDs against renumbering but not their wording; the stricter release-boundary META-12 (a reserved ID keeps its concern) is itself part of this restructure and applies from its release onward, not retroactively. The root port landed with the 0.4.0 composed-model release: this tree now carries the converged `meta.md`, `specs/compositions/`, and inline citations, gated by `spex lint`; only the desktop spec-view adaptation remains deferred.
- Citations inside iteration records were mechanically rewritten to the new paths: IRs are historical, but dead links serve nobody and the linter would flag them forever.
- The desktop app's spec view still parses the legacy layout (SPECV package); adapting `packages/core`'s parser, the protocol group triple, and the view is deferred to a follow-up iteration — until then the Specs tab cannot render this repo's own migrated tree.

## Consequences

- One file answers "what does this package do, how, and how is it checked".
- Cross-package behavior is specified and tested where it belongs; the first three interaction specs (desktop session flow, shared-config round-trip, forge work lists) replace previously implicit contracts.
- Downstream repos migrate with one command and keep their history recoverable (clean-tree precondition, write-before-delete migration).
- The spec view of the desktop app lags the new layout until that follow-up completes.
