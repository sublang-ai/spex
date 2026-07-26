<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-018: One-Sentence Items

## Status

Accepted

## Context

- GEARS ([META-6](../meta.md#meta-6)) is a single-sentence template, [META-25](../meta.md#meta-25) already puts each sentence on its own line for diffs, and [META-36](../meta.md#meta-36) already demands one sentence of bindings — with lint enforcement.
  Elsewhere, items grow by sentence accretion, and every extra sentence is either a second requirement hiding from citation or commentary that belongs in a DR ([META-24](../meta.md#meta-24)).
- Bundled items make citations imprecise: recent reviews caught a uniqueness rule citing the wrong META item and a derivation citing nothing, and the linter implements [META-21](../meta.md#meta-21)'s bundle as four separate rules that could only cite the blob.
- Measured before this decision: 158 multi-sentence items in this tree (mostly two sentences), 12 in `demo/`, and exactly one in the scaffold templates.

## Decision

- **One GEARS pattern per item** ([META-42](../meta.md#meta-42)): each behavior, binding, scenario, or test item carries at most one trigger governing one shall clause — a second `When` or a second governing `shall` is a second item, so one grammatical sentence is the usual consequence rather than the rule itself — and its `<behavior>` may attach structured content that clause governs: an ordered list for a journey's or algorithm's steps, a table for a mapping or case set, a fenced block for a format or grammar, or a text chart.
  Displaced commentary moves into the sentence (riders), the attached structure, or a DR — never into shared section prose, which [META-8](../meta.md#meta-8) forbids items to lean on.
- **Staged enforcement**: `spex lint` reports a multi-sentence item as an advisory warning (`item/sentence`) — a proxy for the pattern rule, since reliable trigger counting needs more than a regex over prose, leaving multi-trigger items to review — while the released Binding promise stays an error; sentence counting reuses the binding rule's terminators (ASCII before whitespace or line end, fullwidth anywhere, `e.g.`/`i.e.` exempt) over prose outside fences, lists, tables, blockquotes, and headings.
- **META-21 splits along its concerns**, keeping its reserved headline under [META-12](../meta.md#meta-12): META-21 keeps the integration/system scope with the unit-test exclusion; [META-38](../meta.md#meta-38) takes package-test placement and isolation; [META-39](../meta.md#meta-39) takes composition-test placement, citation duties, and floors; [META-40](../meta.md#meta-40) takes binding/scenario coverage; [META-41](../meta.md#meta-41) takes acceptance-versus-inspection grading.
  Citations re-point per claim: the Verification row of [META-28](../meta.md#meta-28) to META-38; the binding realization question in [META-36](../meta.md#meta-36) and the composition citation duties in [META-20](../meta.md#meta-20) to META-39; lint's floor and coverage rules to META-39 and META-40.
- **META-1 re-homes its second sentence**: record identity moves to [META-43](../meta.md#meta-43), making the layout item itself one sentence plus its table.
- The scaffold templates and `demo/` conform now — templates must lint with no problems on a fresh scaffold — while this tree's remaining multi-sentence items reduce opportunistically under the warning, promoted to an error once clean.

## Consequences

- One item is one citable, testable claim; lint rules, reviews, and commits cite exactly the rule they rely on.
- The warning surfaces ~158 items in this tree; that is the visible backlog of the staged adoption, not a regression.
- Meta items and records are outside META-42's classes; they follow the discipline editorially, as this decision's own edits do.
- Downstream trees inherit the rule with the next release's templates and linter; the playbook repository's essay-sized items are expected to decompose when that tree migrates layouts.
