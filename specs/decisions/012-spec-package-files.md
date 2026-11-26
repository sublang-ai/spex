<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-012: One-File Spec Packages

## Status

Accepted.
Amended by [DR-022](022-prompt-based-migration.md), [DR-046](046-decision-record-evolution.md), [DR-174](174-what-a-package-provides-is-placed.md).

## Context

- The three-folder layout (`specs/user/`, `specs/dev/`, `specs/test/`) split every package across up to three files; understanding one package meant reading three places, and the split invited drift between them.
- Structure and citation hygiene were enforced only by review; nothing mechanical caught broken anchors, duplicate IDs, or layout drift.

## Decision

- `specs/packages/` replaces the three folders ([DR-000](000-spec-structure-format.md)): one file per package with `## External Behavior`, `## Internal Behavior`, and `## Verification` sections [[meta-30](../meta.md#meta-30)]; one read covers a package.
- `spex lint` guards the format (the [lint](../packages/lint.md) package); this repo's own tree is lint-gated by the CLI test suite.
  A spec an install placed under `specs/packages/` is a one-file package the linter reads as any other, whether or not the map lists it ([DR-174](174-what-a-package-provides-is-placed.md)).
- A legacy tree migrates through the prompt `spex scaffold --update` prints for an agent to apply ([DR-022](022-prompt-based-migration.md)); the CLI restructures no legacy content itself.
- The meta package's items evolve in place when their roles are unchanged, keeping anchors and citations valid; only IDs and concerns present in a published release are reserved [[meta-12](../meta.md#meta-12)].
  [DR-000](000-spec-structure-format.md) likewise evolves in place as the framework-owned record of the current structure.
- Citations inside intent records are rewritten to new paths when the layout moves: IRs are historical, but dead links serve nobody and the linter would flag them forever.

## Consequences

- One file answers "what does this package do, how, and how is it checked".
- Downstream repos migrate with an agent and the printed prompt, gated by `spex lint` and human review.
