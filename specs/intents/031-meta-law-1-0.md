<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-031: The Meta Law at 1.0

## Status

Done

## Intent

The owner tightened the spec law before its first release: clearer citation vocabulary, an IR-reference rule scoped to DRs and spec items, the test-to-Internal citation allowance withdrawn to silence, and three items folded away.
Numbers published in any 0.x npm release stay pinned regardless of the ALLCAPS-to-lowercase spelling change — released `META-<N>` reserves `meta-<N>` — so twenty-two items keep their numbers, the seven post-0.3.0 items renumber into the free slots (22, 28–33) in document order, and 2, 3, 17, and 26 remain reserved gaps.

## Deliverables

- [x] `scaffold/specs/meta.md` and `specs/meta.md` carry the reviewed law: released numbers pinned, unreleased items renumbered in document order (29 items)
- [x] The zh overlay mirrors the edits with recomputed source pins; the scaffold file-history working entries rewritten in place
- [x] Every meta citation retargeted across scaffold, repo specs, demo, docs, and the migration skill; citations of the three deleted items dropped with prose kept truthful
- [x] `spex lint` and the skill checker rescope the IR-reference rule to DR and spec-item files, with intent records naming IRs now clean
- [x] The skill's meta-id mapping recomposed old ALLCAPS ids to the 1.0 numbering, deleted targets marked removed

## Tasks

1. Renumber the law files with a simultaneous map substitution.
2. Propagate the map and the rule changes across the four file sets.
3. Rescope the IR-reference rule in the linter and the checker.
4. Run the root gates and the migration self-check.

## Verification

- `npm test` green across workspaces; `npm run smoke` green end to end.
- `spex lint` clean on `specs/` and `demo/`; the skill checker clean on both trees.
- The i18n-drift and file-history suites green on the rewritten overlay and manifest.
