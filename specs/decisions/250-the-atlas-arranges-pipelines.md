<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-250: The Atlas Arranges Pipelines

## Status

Accepted (2026-11-24).
Amends [DR-242](242-skills-shipped-from-the-repository-and-an-atlas-of-them.md), [DR-245](245-skills-and-the-atlas-in-the-readers-language.md), [DR-248](248-the-atlas-shows-dependencies-and-differing-versions.md).

## Context

- The atlas lets a reader arrange skills into ordered lists of named phases, which [DR-242](242-skills-shipped-from-the-repository-and-an-atlas-of-them.md) called workflows, "工作流" in Chinese.
- "Workflow" already names other things a reader meets beside the atlas: a skill's own procedure, often under a `## Workflow` heading the scan reads steps from, the three workflow skills `code`, `review` and `decide`, Spex's playbook workflows and CI workflows.
  A reader could not tell an arrangement of skills from the procedure inside one.
- An arrangement is a sequence of phases that work passes through in order, which "pipeline", "流水线" in Chinese, names.
- A reader's arrangements are saved in `workflows.json` in the state folder, which a newer atlas must not lose.
- Considered and declined:
  - renaming the words alone and keeping `workflows` in files, keys and the command: an agent would read "pipeline" in `SKILL.md` and run `atlas.mjs workflows`;
  - renaming every "workflow" in the repository: the workflow skills, a skill's procedure heading and CI workflows are other things.

## Decision

- Amends [DR-242](242-skills-shipped-from-the-repository-and-an-atlas-of-them.md), [DR-245](245-skills-and-the-atlas-in-the-readers-language.md) and [DR-248](248-the-atlas-shows-dependencies-and-differing-versions.md) in the name of the ordered lists of phases the reader arranges skills into, and in that name alone.
- The atlas calls the reader's arrangement a pipeline, "流水线" in Chinese, which keeps its phases, "阶段", in order.
- The name holds throughout the atlas: its page and catalogs, its skill text and references, the grouping, the state file `pipelines.json`, its document's key `pipelines`, the `pipelines` command, the page's `/api/pipelines` and the presets file `pipeline-presets.json`.
- With no `pipelines.json`, the atlas reads the pipelines of a `workflows.json` an earlier atlas wrote as the stored document of no file, so the first save writes them to `pipelines.json`; it never writes `workflows.json`.
- "Workflow" keeps its other meanings: the workflow skills, a procedure heading the scan reads steps under, and CI workflows.

## Consequences

- A reader of an earlier atlas finds their arrangements on the page and keeps them by saving once; `workflows.json` stays behind, unchanged, for an earlier atlas sharing the state folder.
- An earlier atlas sharing the state folder does not see pipelines saved by a newer one.
- The page's grouping remembered in a browser as `workflow` is unknown to the page and falls back to its default.
- The rename is incompatible for an agent or script calling `atlas.mjs workflows` or `/api/workflows`, so it lands within `skill-atlas` 2.0.0 ([DR-249](249-a-skills-version-rises-with-its-content.md)).
