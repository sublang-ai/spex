<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-018: One Requirement Per Item

## Status

Accepted

## Context

- GEARS [[meta-6](../meta.md#meta-6)] is a single-sentence template, and [[meta-25](../meta.md#meta-25)] already puts each sentence on its own line for diffs.
  Elsewhere, items grow by accretion, and an accreted part is often a second requirement hiding from citation, or commentary that belongs in a DR [[meta-24](../meta.md#meta-24)] — but it is as often another case of the one requirement, which is why counting parts settles nothing.
- Bundled items make citations imprecise: recent reviews caught a uniqueness rule citing the wrong meta item and a derivation citing nothing, and the linter implements [[meta-21](../meta.md#meta-21)]'s bundle as four separate rules that could only cite the blob.
- Measured before this decision: 158 multi-sentence items in this tree (mostly two sentences), 12 in `demo/`, and exactly one in the scaffold templates.
- A first, syntactic formulation — one trigger governing one `shall` — proved unstable in review: it condemned coordinated outcomes of a single operation (a deployment's failure fallback, an upload interruption's cleanup and restart) while a splice of two requirements past one `shall` satisfied it, and it invited compliance theater, joining two triggers with a semicolon to quiet the counter.
  Counting syntax cannot decide what is one requirement; naming the unit can.

## Decision

- **One requirement per item** [[meta-29](../meta.md#meta-29)]: each spec item has one governing GEARS statement, with every attachment introduced by its final colon and elaborating that requirement alone — ordered steps or the cases and outcomes of one operation or decision for Behavior, and the assertions of one execution flow or one explicit case matrix for a Test; an attachment may take a form such as a note, list, table, (renderable) diagram, or example.
  A condition inside an attachment is a case label, not a second trigger, so [[meta-6](../meta.md#meta-6)]'s one-trigger rule governs the statement and not its attachments; differing stateful preconditions or triggers are evidence of additional requirements; and an umbrella such as "handle correctly" names no requirement.
  Displaced commentary moves into the clause as a rider, into the attachment, or into a DR — never into shared section prose, which [[meta-8](../meta.md#meta-8)] forbids items to lean on.
- **The rule sets a ceiling on cohesion, never a floor**: an item finer than the rule requires already conforms, so nothing is re-merged and no exception is needed for items already split — [[meta-12](../meta.md#meta-12)] reserves their ids and their citations stand.
- **Enforcement stays advisory**: `spex lint` reports a multi-sentence item as an `item/sentence` warning prompting a read for a second requirement — sentence count neither defines nor decides conformance, since one requirement's cases may run to several sentences and a second requirement can hide inside one; counting uses ASCII terminators before whitespace or line end and fullwidth terminators anywhere, with `e.g.`/`i.e.` exempt, over prose outside fences, lists, tables, blockquotes, and headings.
- **[[meta-1](../meta.md#meta-1)] re-homes its second sentence**: record identity moves to [[meta-22](../meta.md#meta-22)], making the layout item itself one sentence plus its table.
- The scaffold templates and `demo/` conform now — templates must lint with no problems on a fresh scaffold — while this tree's flagged items are read for a second requirement as they are touched; the warning is never promoted to an error, since a conformant item may carry several sentences of one requirement's cases.

## Consequences

- One item is one citable, testable claim; lint rules, reviews, and commits cite exactly the rule they rely on.
- Review argues about requirements rather than punctuation: the question "which requirement does this part answer?" has an evidenced answer, where "is this one sentence?" had a countable but wrong one.
- The `item/sentence` warning count stops tracking conformance — a conformant item may carry several sentences of one requirement's cases — so the count is a reading list, and promotion to an error is withdrawn.
- Meta items follow [[meta-29](../meta.md#meta-29)]; records follow the discipline editorially.
- Downstream trees inherit the rule with the next release's templates and linter; the playbook repository's essay-sized items are expected to decompose when that tree migrates layouts.
