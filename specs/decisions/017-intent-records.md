<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-017: Intent Records

## Status

Accepted

## Context

- AI-driven development shrinks an "iteration" to a single realized intent; the sprint-heritage name no longer describes what `specs/iterations/` holds: a goal, a decomposition into one-commit tasks, and a done/not-done ledger.
- Project management shifts toward intent management: a human needs a durable, in-repo answer to "what was intended, what is done, what is not."
- The vocabulary already converges on *intent* everywhere but the directory name: the CODE playbook receives work as a Boss coding intent and files an IR exactly when one exceeds a single commit, and playbook registry entries carry an `intent` field.
- A spec package's `## Intent` section is the same concept at a different time-scale: the standing purpose that accumulated realizations serve.
  Records are the flow; spec items are the stock.

## Decision

- `specs/iterations/` becomes `specs/intents/`, and an IR is an **intent record** ([META-1](../meta.md#meta-1)).
  The acronym, existing item IDs, and `<NNN>-<kebab-case>.md` naming are unchanged, so existing `IR-<N>` prose references stay valid everywhere.
- Recording stays flexible and duplication-free ([META-37](../meta.md#meta-37)): an intent realized in a single commit needs no record, an intent is recorded when its realization spans commits or must be tracked before completion, and a record carries only what is needed to understand the intent and its realization state — commits and issues are cited, never duplicated.
- A commit realizing a recorded intent references it by bare ID (`IR-<N>`) in the subject or body ([GIT-5](../packages/git.md#git-5)), the way issue keys are conventionally embedded in commit messages; no trailer key is needed.
- Intent records stay on the management plane: [META-18](../meta.md#meta-18) is unchanged, so specs never cite IRs and behavior truth remains reimplementable from spec items alone.
- Migration is mechanical, following the [DR-012](012-spec-package-files.md) pattern: `spex scaffold --update` moves `specs/iterations/` to `specs/intents/` with conflict-keeping, rewrites citations, and renames the map's Iterations entries in both scaffold languages ([SCAF package](../packages/scaffold.md)); `spex lint` guards the renamed layout ([LINT package](../packages/lint.md)); the core spec parser reads `intents/` and a legacy `iterations/` directory together — shadowing same-named files and reporting coexistence as tree notices — so un-migrated and partially migrated trees keep working ([SPECV package](../packages/spec-view.md)).

## Consequences

- One word spans the Boss intent, the intent record, and the package Intent section — episodic want, tracked realization, and standing purpose.
- Downstream trees migrate with one `--update` run; un-migrated trees keep linting and rendering meanwhile.
- The playbook prompts that name `@specs/iterations` need the dual-path treatment in their own repository, mirroring their layout-agnostic spec-item handling.
- Historical DR and IR prose keeps the word "iteration" where it meant a work cycle; only the record type and directory are renamed, and record path citations are rewritten because dead links serve nobody.
