<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-017: Spec Structure Refactor

## Goal

Implement DR-012: one-file spec packages under `specs/packages/`,
cross-package specs under `specs/interactions/`, mechanical
migration in `spex scaffold --update`, a spec linter, and this
repo's own migration.

## Deliverables

- [x] CLI: package-layout migration (mdast-based merge, citation
  rewrite, map restructure, legacy file-history manifest, agent-file
  refresh on update, interactions prompt) per SCAF-39..47
- [x] CLI: `spex lint` per the LINT package
- [x] Templates: meta.md (META-1/9/10/20/21 revised, META-28/31
  added), DR-000, map.md, packages/git.md, packages/licensing.md,
  interactions/.gitkeep, agent-specs.txt, both prompts, zh overlays,
  manifests
- [x] Tests: merge/rewrite/restructure/lint units, migration state
  matrix, chained items→flat→packages, zh, packaging, repo-specs
  lint gate
- [x] Repo migration: `spex scaffold --update` run over this repo;
  intents reconciled; SCAF rewritten for the new behavior; LINT
  package added; interactions seeded (DESK, CONF, FORGE); DR-012;
  map.md
- [ ] Deferred: adapt the desktop app to the new layout — `specs.get`
  parser in `packages/core`, protocol group triple, SPECV spec view
  (tree, filters, counts), DR-011 amendments. Until then the Specs
  tab cannot render a `packages/`-layout tree, including this
  repo's.

## Tasks

1. Implement the migration modules (`merge-package`,
   `rewrite-citations`, `restructure-map`, `migrate-package-layout`)
   and wire them into `--update` with a pristine-state snapshot.
2. Implement `spex lint` and its rule engine over shared mdast
   helpers.
3. Rewrite bundled templates, prompts, and overlays; split the
   legacy file-history manifest.
4. Rebuild the CLI test suite around the new layout and migration
   matrix.
5. Run the migration over this repo; reconcile intents; rewrite the
   SCAF spec; add the LINT package, interaction specs, DR-012, and
   map rows.
6. Follow-up (deferred): desktop app adaptation per the deliverable
   above.

## Acceptance criteria

- Monorepo build and tests green, including the repo-specs lint
  gate.
- `spex scaffold --update` on a legacy-layout fixture repo migrates,
  rewrites citations, restructures the map, and lints clean.
- `spex lint` exits zero on this repo's migrated tree.
