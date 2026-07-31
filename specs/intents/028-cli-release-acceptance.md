<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-028: End-User Acceptance for the 1.0 CLI Release

## Status

Done

## Intent

Gate the 1.0 CLI release on what its users actually experience: an automated end-user pass over the published README journeys, a live acceptance run of the skill-based migration ([DR-021](../decisions/021-skill-based-migration.md)) driven by real coding agents, and READMEs regenerated for both a fresh user and a spex 0.x user upgrading across the generation change.

## Deliverables

- [x] `scripts/cli-smoke.mjs`: hermetic end-user pass — pack the tarball, install into an isolated prefix, walk the README's fresh-user and upgrading-user journeys through the installed `spex` bin — wired as the `cli-user` stage of `npm run smoke`
- [x] `scripts/migration-smoke.mjs` + `scripts/fixtures/legacy-tree/`: a previous-generation fixture repo migrated by a real agent (Claude Code or Codex) with the bundled skill, gated on the skill checker, `spex lint`, and content survival, wired as `npm run smoke:migration`
- [x] `packages/cli/README.md` and the root `README.md` regenerated for the current generation, with an upgrading section anchored to release versions (0.x generations, 1.0 law)
- [x] Legacy-generation guidance in the CLI, the migration guide, and the skill README anchored to spex 0.x
- [x] Retired `merge-package` module removed from the CLI source
- [x] Migration smoke observed green with a real agent before the tag (2026-07-31: Claude Code and Codex both passed every gate; one codex retry after an uncommitted-but-clean first tree)

## Tasks

1. Author the end-user CLI smoke from the rewritten README journeys and wire it into the smoke suite.
2. Build the legacy fixture and the agent-driving migration smoke with pre/post mechanical gates.
3. Regenerate both READMEs for the two audiences and anchor generation language to versions.
4. Run the migration smoke with the local Claude Code and Codex CLIs and record the outcomes.

## Verification

- `npm run smoke` passes with the `cli-user` stage included.
- `node scripts/migration-smoke.mjs --self-check` exits 0: the unmigrated fixture fails every mechanical gate and the migrated demo corpus passes them.
- `npm run smoke:migration` passes with at least one real agent, asserting the checker clean, `spex lint` clean, every fixture item surviving under its new id, IR checkbox states preserved, and no `compositions/` directory remaining [[release-24](../packages/release.md#release-24)].
