<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-030: Spec View Reading Craft

## Status

Done

## Intent

An internal three-lens design review panel walked the spec view rebuilt for the GPT-5.6-Sol-flagged gap and returned one verdict: the presentation is right, the reading craft falls short.
Digests leak raw markdown into one-line rows, per-file rollups drown the cross-file signal in intra-file chatter, a citation jump strands the reader at the target, and `meta.md` — the law the tree is read by — is unreachable from the view.
This round amends the spec-view law with the panel's accepted improvements and applies them.

## Deliverables

- [x] Spec-view law amended on spec-view-2/6/7/12/19/32/37: full expanded intent, plain-prose digests, cross-file rollups on every file node, jump return, search-time reveal, reachable `meta.md`
- [x] Core digests on spec-view-12: enclosed citations dropped whole, plain links reduced to their text, inline-code markers stripped with content kept, punctuation gaps closed
- [x] Citation rollups on spec-view-19: cross-file counts on every file row, collapsed included, with item hints and backlink groups staying complete
- [x] Citation jumps on spec-view-6: one-step return to the citing item after an in-view jump, and targets excluded by filter or search revealed and marked
- [x] Records reader on spec-view-6/7: a body link to the tree's `meta.md` opens in the reader, with the footer naming meta beside decisions and intents

## Tasks

1. Amend the spec-view law and record this intent.
2. Reduce parsed item digests to plain prose in the core package.
3. Rework the citation rollups to cross-file counts rendered on every file row.
4. Add the jump-origin return and the search-time reveal to citation jumps.
5. Open the tree's `meta.md` in the records reader and name it in the footer.
6. Integrate the slices, reshape the affected suites, and run the root gates.

## Verification

- `npm test` and `npm run test:integration` green across workspaces on the reshaped suites.
- `npm run smoke` green end to end.
- `spex lint` clean on `specs/`.
