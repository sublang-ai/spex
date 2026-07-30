<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-017: Spec Structure Refactor

## Status

Done

## Intent

Implement DR-012: one-file spec packages under `specs/packages/`, cross-package specs under `specs/interactions/`, mechanical migration in `spex scaffold --update`, a spec linter, and this repo's own migration.

## Deliverables

- [x] CLI: package-layout migration (mdast-based merge, citation rewrite, map restructure, legacy file-history manifest, agent-file refresh on update, interactions prompt) per scaffold-39..[[scaffold-47](../packages/scaffold.md#scaffold-47)]
- [x] CLI: `spex lint` per the lint package
- [x] Templates: meta.md ([[meta-1](../meta.md#meta-1)], [[meta-9](../meta.md#meta-9)], [[meta-10](../meta.md#meta-10)], [[meta-20](../meta.md#meta-20)], [[meta-21](../meta.md#meta-21)] revised, [[meta-30](../meta.md#meta-30)] added), DR-000, map.md, packages/git.md, packages/licensing.md, interactions/.gitkeep, agent-specs.txt, both prompts, zh overlays, manifests
- [x] Tests: merge/rewrite/restructure/lint units, migration state matrix, chained items→flat→packages, zh, packaging, repo-specs lint gate
- [x] Repo migration: `spex scaffold --update` run over this repo; intents reconciled; scaffold rewritten for the new behavior; lint package added; interactions seeded (desktop-session, shared-config-roundtrip, forge-work-lists); DR-012; map.md
- [x] Deferred here: adapt the desktop app to the new layout — `specs.get` parser in `packages/core`, protocol group triple, spec-view package (tree, filters, counts), DR-011 amendments. Landed with the later reference-content round, which realized the packages-layout spec view.

## Tasks

1. Implement the migration modules (`merge-package`, `rewrite-citations`, `restructure-map`, `migrate-package-layout`) and wire them into `--update` with a pristine-state snapshot.
2. Implement `spex lint` and its rule engine over shared mdast helpers.
3. Rewrite bundled templates, prompts, and overlays; split the legacy file-history manifest.
4. Rebuild the CLI test suite around the new layout and migration matrix.
5. Run the migration over this repo; reconcile intents; rewrite the scaffold spec; add the lint package, interaction specs, DR-012, and map rows.
6. Follow-up (deferred): desktop app adaptation per the deliverable above.

## Verification

- Monorepo build and tests green, including the repo-specs lint gate.
- `spex scaffold --update` on a legacy-layout fixture repo migrates, rewrites citations, restructures the map, and lints clean.
- `spex lint` exits zero on this repo's migrated tree.
