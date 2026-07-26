<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-023: One-Sentence Items

## Goal

Apply [DR-018](../decisions/018-one-sentence-items.md): split META-21 along its concerns, state the one-GEARS-sentence rule with its structured-behavior allowance, re-home META-1's record-identity sentence, and stage lint enforcement.

## Deliverables

- [x] DR-018 recorded; META-21 split into META-38..41; META-42 and META-43 added; META-1 slimmed — across this tree, both scaffold locales, and `demo/`, with citations re-pointed per claim
- [x] `spex lint` warns on multi-sentence items (`item/sentence`) while Binding items keep their error; messages cite the split items
- [x] Scaffold templates and `demo/` lint with no problems; this tree's warning backlog is measured and reported

## Tasks

1. Record DR-018 and this IR; index in `map.md`
2. Apply the META surgery and citation re-pointing to the four meta files, records, and guides; fold the template's LIC-5
3. Add the `item/sentence` lint warning with tests; re-point lint messages; document in LINT and the changelog
4. Fold `demo/`'s twelve multi-sentence items to one sentence each

## Acceptance criteria

- Workspace tests pass; `spex lint` on a fresh scaffold and on `demo/` reports no problems
- `spex lint` on this tree reports zero errors, with the multi-sentence backlog visible as `item/sentence` warnings
- Every re-pointed citation resolves and names the item whose claim it relies on
