<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-023: One Contract Per Item

## Status

Done

## Intent

Apply [DR-018](../decisions/018-one-contract-per-item.md): split [[meta-22](../meta.md#meta-22)] along its concerns, state the one-contract rule with its per-kind attachments, re-home [[meta-1](../meta.md#meta-1)]'s record-identity sentence, and keep lint advisory.

## Deliverables

- [x] DR-018 recorded; [[meta-22](../meta.md#meta-22)] split into [[meta-24](../meta.md#meta-24)] and three since-retired items; [[meta-12](../meta.md#meta-12)] and [[meta-6](../meta.md#meta-6)] added; [[meta-1](../meta.md#meta-1)] slimmed — across this tree, both scaffold locales, and `demo/`, with citations re-pointed per claim
- [x] `spex lint` warns on multi-sentence items (`item/sentence`) while Binding items keep their error; messages cite the split items
- [x] [[meta-12](../meta.md#meta-12)] restated as the one-contract rule with its per-kind attachment table; the lint message, [[lint-14](../packages/lint.md#lint-14)], guidelines, and demo items follow it
- [x] Scaffold templates and `demo/` lint with no problems; this tree's warning backlog is measured and reported

## Tasks

1. Record DR-018 and this IR; index in `map.md`
2. Apply the meta surgery and citation re-pointing to the four meta files, records, and guides; fold the template's licensing-5
3. Add the `item/sentence` lint warning with tests; re-point lint messages; document in lint and the changelog
4. Fold `demo/`'s twelve multi-sentence items to one sentence each
5. Restate [[meta-12](../meta.md#meta-12)] as the one-contract rule and bring the corpus, lint wording, and guidelines onto it

## Verification

- Workspace tests pass; `spex lint` on a fresh scaffold and on `demo/` reports no problems
- `spex lint` on this tree reports zero errors, with the multi-sentence backlog visible as `item/sentence` warnings
- Every re-pointed citation resolves and names the item whose claim it relies on
