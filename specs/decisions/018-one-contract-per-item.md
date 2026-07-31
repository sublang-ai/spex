<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-018: One Contract Per Item

## Status

Accepted

## Context

- GEARS [[meta-9](../meta.md#meta-9)] is a single-sentence template, [[meta-3](../meta.md#meta-3)] already puts each sentence on its own line for diffs, and the binding rule already demanded one sentence of bindings — with lint enforcement.
  Elsewhere, items grow by accretion, and an accreted part is often a second requirement hiding from citation, or commentary that belongs in a DR [[meta-7](../meta.md#meta-7)] — but it is as often another case of the one requirement, which is why counting parts settles nothing.
- Bundled items make citations imprecise: recent reviews caught a uniqueness rule citing the wrong meta item and a derivation citing nothing, and the linter implements [[meta-22](../meta.md#meta-22)]'s bundle as four separate rules that could only cite the blob.
- Measured before this decision: 158 multi-sentence items in this tree (mostly two sentences), 12 in `demo/`, and exactly one in the scaffold templates.
- A first, syntactic formulation — one trigger governing one `shall` — proved unstable in review: it condemned coordinated outcomes of a single operation (a deployment's failure fallback, an upload interruption's cleanup and restart) while a splice of two contracts past one `shall` satisfied it, and it invited compliance theater, joining two triggers with a semicolon to quiet the counter.
  Counting syntax cannot decide what is one requirement; naming the unit can.

## Decision

- **One contract per item** [[meta-12](../meta.md#meta-12)]: each item has one governing GEARS clause naming one concrete domain contract — a request, decision, state transition, invariant, installed relationship, integrated journey, or verification run — and its structured attachments, which inherit that clause's normative force, elaborate that contract alone, per kind: steps or the cases and outcomes of one operation, decision, transition, or invariant for a behavior item, the mappings of one installed relationship for a binding, the stages of one journey or the cases of one standing rule for a scenario, and the assertions of one verification objective — one setup and flow, or one explicit case matrix — for a test, plus any format, grammar, or definition the clause names.
  A condition inside an attachment is a case label, not a second trigger, so [[meta-9](../meta.md#meta-9)]'s one-trigger rule governs the clause and not its attachments; differing triggers or lifecycles are strong evidence of a second contract rather than proof of one; and an umbrella such as "handle correctly" names no contract.
  Displaced commentary moves into the clause as a rider, into the attachment, or into a DR — never into shared section prose, which [[meta-11](../meta.md#meta-11)] forbids items to lean on.
- **The rule sets a ceiling on cohesion, never a floor**: an item finer than the rule requires already conforms, so nothing is re-merged and no exception is needed for items already split — [[meta-18](../meta.md#meta-18)] reserves their ids and their citations stand.
- **Enforcement stays advisory**: `spex lint` reports a multi-sentence item as an `item/sentence` warning prompting a read for a second governing clause — sentence count neither defines nor decides conformance, since one contract's cases may run to several sentences and a second contract can hide inside one — while the released Binding promise stays an error; counting reuses the binding rule's terminators (ASCII before whitespace or line end, fullwidth anywhere, `e.g.`/`i.e.` exempt) over prose outside fences, lists, tables, blockquotes, and headings.
- **[[meta-22](../meta.md#meta-22)] splits along its concerns**, keeping its reserved headline under [[meta-18](../meta.md#meta-18)]: it keeps the integration/system scope with the unit-test exclusion, while package-test placement and isolation, composition-test placement with its citation duties and floors, binding/scenario coverage, and acceptance-versus-inspection grading each take an item of their own.
  Citations re-point per claim: the Verification row of [[meta-15](../meta.md#meta-15)] to the package-test item; the binding realization question in the binding rule and the composition citation duties in [[meta-28](../meta.md#meta-28)] to the composition-test item; lint's floor and coverage rules to the composition-test and coverage items.
- **[[meta-1](../meta.md#meta-1)] re-homes its second sentence**: record identity moves to [[meta-6](../meta.md#meta-6)], making the layout item itself one sentence plus its table.
- The scaffold templates and `demo/` conform now — templates must lint with no problems on a fresh scaffold — while this tree's flagged items are read for a second contract as they are touched; the warning is never promoted to an error, since a conformant item may carry several sentences of one contract's cases.

## Consequences

- One item is one citable, testable claim; lint rules, reviews, and commits cite exactly the rule they rely on.
- Review argues about contracts rather than punctuation: the question "which contract does this part answer?" has an evidenced answer, where "is this one sentence?" had a countable but wrong one.
- The `item/sentence` warning count stops tracking conformance — a conformant item may carry several sentences of one contract's cases — so the count is a reading list, and promotion to an error is withdrawn.
- Meta items and records are outside [[meta-12](../meta.md#meta-12)]'s classes; they follow the discipline editorially, as this decision's own edits do.
- Downstream trees inherit the rule with the next release's templates and linter; the playbook repository's essay-sized items are expected to decompose when that tree migrates layouts.
