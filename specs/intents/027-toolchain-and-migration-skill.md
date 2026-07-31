<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-027: Toolchain Alignment and Migration Skill

## Status

Done

## Intent

Realize [DR-021](../decisions/021-skill-based-migration.md) and align the CLI with the rewritten [DR-000](../decisions/000-spec-structure-format.md) law: ship the migration as an installable agent skill with a user guide, and bring seeding, linting, and update messaging to the new generation.

## Deliverables

- [x] DR-021 recorded; the scaffold and lint package items restated for the skill-based migration story
- [x] `skills/spec-structure-migration/` skill: process instructions, meta ID mapping, conformance checker, install-and-run guide
- [x] `docs/spec-migration.md` walking a user through the migration end to end
- [x] CLI seeds the packages-only tree (template manifest and created directories)
- [x] `spex lint` implements the new law's rules
- [x] Scripted structural-migration modules retired; `--update` and legacy detection point at the skill
- [x] CLI test suite green against the rewritten scaffold

## Tasks

1. Record DR-021 and this intent; restate the scaffold and lint package items.
2. Author the migration skill and the user guide.
3. Align seeding: template manifest and created directories.
4. Rewrite the lint rules to the new law with fixture coverage.
5. Retire the scripted migration modules and reroute `--update` messaging.
6. Drive the CLI suite green and close out.

## Verification

- `npm test` green in `packages/cli` against the rewritten scaffold.
- `spex lint` clean on `specs/`, `demo/specs`, and a freshly scaffolded tree; each legacy fixture yields the skill pointer.
- The skill's checker reports zero problems on this repo's migrated trees.
