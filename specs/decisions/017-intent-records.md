<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-017: Intent Records

## Status

Accepted; the mechanical migration is superseded by [DR-022](022-prompt-based-migration.md) — `--update` refreshes the law and prints a migration prompt, restructuring nothing.

## Context

- AI-driven development shrinks an "iteration" to a single realized intent; the sprint-heritage name no longer describes what `specs/iterations/` holds: a goal, a decomposition into one-commit tasks, and a done/not-done ledger.
- Project management shifts toward intent management: while an intent is tracked, a human needs an in-repo answer to "what was intended, what is done, what is not."
- The vocabulary already converges on *intent* everywhere but the directory name: the CODE playbook receives work as a Boss coding intent and files an IR exactly when one exceeds a single commit, and playbook registry entries carry an `intent` field.
- A spec package's `## Intent` section is the same concept at a different time-scale: the standing purpose that accumulated realizations serve.
  Records are the flow; spec items are the stock.

## Decision

- `specs/iterations/` becomes `specs/intents/`, and an IR is an **intent record** [[meta-1](../meta.md#meta-1)].
  The acronym, existing item IDs, and `<NNN>-<kebab-case>.md` naming are unchanged, so existing `IR-<N>` references stay valid wherever they were already allowed — commits and issues, never a spec [[meta-18](../meta.md#meta-18)].
- Recording stays flexible and duplication-free [[meta-28](../meta.md#meta-28)]: an intent realized in a single commit needs no record; one spanning commits or requiring prior tracking gets an IR whose tasks are each sized to one commit [[meta-5](../meta.md#meta-5)]; the record carries only what is needed to understand the intent and its state, citing commits and issues rather than duplicating them.
- A commit realizing a recorded intent references it by bare ID (`IR-<N>`) in the subject or body [[git-5](../packages/git.md#git-5)], the way issue keys are conventionally embedded in commit messages; no trailer key is needed.
- Intent records stay on the management plane: no spec cites an IR — not the map, not another IR [[meta-18](../meta.md#meta-18)] — so behavior truth remains reimplementable from spec items alone and each IR stays independently disposable.
- Migration was mechanical at decision time, following the [DR-012](012-spec-package-files.md) pattern; [DR-022](022-prompt-based-migration.md) retired that: `--update` now refreshes the law and prints a prompt an agent applies, moving no legacy content (the [scaffold](../packages/scaffold.md) package). `spex lint` guards the renamed layout (the [lint](../packages/lint.md) package), and the core spec parser reads `intents/` and a legacy `iterations/` directory together — shadowing same-named files and reporting coexistence as tree notices — so un-migrated and partially migrated trees keep working (the [spec-view](../packages/spec-view.md) package).

## Consequences

- One word spans the Boss intent, the intent record, and the package Intent section — episodic want, tracked realization, and standing purpose.
- Downstream trees keep linting and rendering while un-migrated; migration itself is agent work behind the printed prompt.
- The playbook prompts that name `@specs/iterations` need the dual-path treatment in their own repository, mirroring their layout-agnostic spec-item handling.
- Historical DR and IR prose keeps the word "iteration" where it meant a work cycle; only the record type and directory are renamed, and record path citations are rewritten because dead links serve nobody.
