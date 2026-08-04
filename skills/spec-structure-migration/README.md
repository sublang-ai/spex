<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# spec-structure-migration

An installable skill that lets an AI agent migrate a Spex specs tree from the previous spec-structure generation to the current one — the layout and rules defined by the tree's `meta.md` and `decisions/000-spec-structure-format.md`.

Migration is judgment work — items reclassify, compositions fold into packages, intents get rewritten — so it ships as agent instructions rather than a script.
The skill pairs those instructions with two deterministic aids:

| File | Purpose |
| --- | --- |
| [SKILL.md](SKILL.md) | The process the agent follows, phase by phase |
| [references/meta-id-mapping.md](references/meta-id-mapping.md) | Old `META-<N>` → new `meta-<N>` citation mapping (several numbers were reused — never map by number) |
| [scripts/check_specs.py](scripts/check_specs.py) | Mechanical conformance checker the agent loops against |

## Is my tree old-generation?

A tree scaffolded by any spex 0.x release is; the current generation was introduced in spex 1.0 and tightened in 2.0.
Any of these means yes:

- a `specs/user/`, `specs/dev/`, or `specs/test/` directory (the oldest layout, spex ≤ 0.3);
- a `specs/compositions/` directory;
- item headings like `### AUTH-3` (ALLCAPS short forms);
- citations like `[AUTH-3](auth.md#auth-3)` (single brackets, no enclosure);
- intent records with `Goal` / `Acceptance criteria` sections.

## Install

**Claude Code** — copy this directory into the target repo (project scope) or your home (user scope):

```sh
# project scope: available to anyone working in the repo
mkdir -p .claude/skills && cp -r skills/spec-structure-migration .claude/skills/

# user scope: available in all your projects
mkdir -p ~/.claude/skills && cp -r skills/spec-structure-migration ~/.claude/skills/
```

Claude Code discovers the skill by its frontmatter; invoke it by asking for a spec migration, or explicitly with `/spec-structure-migration`.

**Any other agent** — the skill is plain markdown: provide `SKILL.md` (plus the `references/` and `scripts/` files) to the agent as instructions, or paste `SKILL.md` as the task prompt with the two support files attached.

## Run

1. Start from a clean working tree on a fresh branch.
2. Refresh the spec law first so the agent migrates *to* the current generation: `spex scaffold --update` (refreshes framework files, warns when it replaces local changes, keeps customized seeds, and prints merge guidance).
3. Kick off the agent, for example:

   > Migrate every spec tree in this repo to the current spec generation using the spec-structure-migration skill. Work tree by tree, commit in reviewable steps, and loop on the checker and `spex lint` until both are clean. Flag any judgment call you are unsure of instead of guessing.

4. The agent loops: migrate → `python3 scripts/check_specs.py specs` → fix → `spex lint` → fix, until both report clean.
5. Review the diff — see [docs/spec-migration.md](../../docs/spec-migration.md) for the end-to-end walkthrough and what to look for in review.

The migration is done only when the checker and `spex lint` are clean **and** a human has reviewed the diff.
