<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-021: Skill-Based Spec Migration

## Status

Superseded by [DR-022](022-prompt-based-migration.md)

## Context

- The [DR-000](000-spec-structure-format.md) rewrite created a new spec generation: a packages-only layout, basename item IDs, enclosed citations, and new record formats.
- Existing trees — this repo's, seeded projects', and every compositions-era tree — need migration to that generation.
- Earlier layout migrations were scripted in the CLI, but the old-to-new conversion is judgment work, hardly scriptable: binding and scenario items become package behaviors, items reclassify between External and Internal, Intents are rewritten standalone, and multi-statement items restructure into one GEARS statement with attachments.
- Mechanical parts — renames, moves, link rewrites — are the smallest share, and a mechanical pass alone leaves a tree that reads wrong while linting clean.

## Decision

- Migration to the new spec generation ships as an installable agent skill with a user guide, not as CLI code.
- The skill carries the process an agent follows: read the law, build the tree's rename map, apply the conversion recipes (packages, composition folds, records, maps), and loop until mechanical checks pass.
- The skill bundles the deterministic aids the process needs: the old-to-new meta item mapping and a conformance checker script whose findings drive the loop.
- The CLI narrows to detection and guidance: `spex scaffold` keeps refusing legacy trees, `spex scaffold --update` refreshes templates and directs legacy-generation trees to the skill, and `spex lint` reports legacy directories pointing the same way.
- The compositions-era scripted structural migrations — package-layout moves, citation rewriting, map restructuring — retire; their concerns pass to the skill.
- Human review closes every migration: the agent's changes land as an ordinary diff the tree's owners review.

## Consequences

- One migration path covers every legacy generation, with judgment applied where scripts could not.
- The CLI sheds its migration machinery; `spex lint` remains the mechanical gate a migration must pass.
- Seeded projects migrate with any capable agent, not only this repo's tooling.
- The skill is spec-adjacent content that must evolve alongside `meta.md`.
