<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Migrating a specs tree to the current generation

The spec structure defined by `specs/decisions/000-spec-structure-format.md` and `specs/meta.md` — introduced in spex 1.0 and tightened in 2.0 — replaced the previous one; trees scaffolded by spex 0.x releases carry it:

| | Previous generation (spex 0.x) | Current generation (spex 2.0) |
| --- | --- | --- |
| Layout | `packages/` + `compositions/` | `packages/` only — composition is a package pattern |
| Cross-package behavior | binding and scenario items in composition files | binding citations to peers' External Behavior |
| Item IDs | ALLCAPS short form (`AUTH-3`) | lowercase file basename (`github-login-3`) |
| Item citations | `[AUTH-3](auth.md#auth-3)` | enclosed: `[[github-login-3](github-login.md#github-login-3)]` |
| Package sections | Intent, External?, Internal?, Verification? | Intent, External (required), Internal?, Verification, References? |
| Intent records | Goal, Deliverables, Tasks, Acceptance criteria | Status, Intent, Deliverables, Tasks, Verification |
| Tests | drive the package against stubs | prefer executing real behavior bound by the behavior under test |

Migrating a tree is judgment work — items reclassify between External and Internal, bindings become behaviors, intents are rewritten standalone — so it is done by an AI agent following the bundled **[spec-structure-migration skill](../skills/spec-structure-migration/README.md)**, not by a script ([DR-021](../specs/decisions/021-skill-based-migration.md)).

## The process, end to end

1. **Update spex and refresh the templates.**
   Upgrade to a spex release carrying the current scaffold, then run `spex scaffold --update` in the repo.
   This merges the new `meta.md`, `map.md`, and prompt assets into your tree (local edits are conflict-kept for review) and — when it detects a legacy-generation tree — prints a pointer to this guide.
   After this step the *law* in your tree is current while the *content* is still old-generation; that mismatch is what the migration resolves.

2. **Install the skill.**
   Follow [the skill's README](../skills/spec-structure-migration/README.md): copy `skills/spec-structure-migration/` into `.claude/skills/` (Claude Code) or hand `SKILL.md` plus its support files to whatever agent you use.

3. **Branch and run the agent.**
   From a clean working tree on a fresh branch, ask the agent to migrate using the skill (a ready-made kickoff prompt is in the skill README).
   Expect it to work tree by tree — `specs/`, plus any additional spec trees the repo carries — committing in reviewable steps.

4. **Let it loop until mechanically clean.**
   The agent alternates migrating with two gates until both pass clean:
   - `python3 .claude/skills/spec-structure-migration/scripts/check_specs.py specs` — links, anchors, item and record citation forms, ID case, sections, and behavior/test citation targeting;
   - `spex lint` — the CLI's rule set for the current generation.

5. **Review the diff.**
   The mechanical gates cannot judge meaning; that is the reviewer's job. Focus on:
   - **External vs Internal calls** — did guarantees your users rely on stay External, and behavior hidden from them stay Internal?
   - **Folded composition packages** — do the former binding/scenario files read as truthful packages, with citations at the phrases that rely on them?
   - **Removed dependencies** — where the agent dropped a citation, did it also remove the peer-specific dependency rather than leave it hidden in prose?
   - **Record statuses** — superseded DRs, intent-record statuses, and any judgment calls the agent flagged instead of deciding.

6. **Merge.**
   The migration is complete when the gates are clean and review approves the diff.
   From then on, `spex lint` keeps the tree on the current generation.

## If the repo has published releases

Item IDs that appeared in a release are permanently bound to their concerns (`meta-12`).
The generation change renames every ID's spelling while preserving numbers and concerns; approve that rename explicitly before the agent rewrites a released tree, and keep the old→new map from the agent's hand-over summary with the release notes.
