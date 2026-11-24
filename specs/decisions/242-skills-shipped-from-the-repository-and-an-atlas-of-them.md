<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-242: Skills Shipped From the Repository, and an Atlas of Them

## Status

Accepted (2026-11-21).
Extended in the atlas's scan, page and state folder and in the form of a shipped skill by [DR-245](245-skills-and-the-atlas-in-the-readers-language.md), which adds translations and the page's language.
Amended in the links the page shows, the exported page, what a shared name reports, the insights' levels and the page's controls by [DR-248](248-the-atlas-shows-dependencies-and-differing-versions.md).
Amended in the form of a shipped skill, adding its version, by [DR-249](249-a-skills-version-rises-with-its-content.md).

## Context

- Agent Skills [[1]] are folders holding a `SKILL.md` that many coding agents load; the `skills` CLI [[2]] installs them from a repository's `skills/` folder with `npx skills add`.
- A person with dozens of skills cannot tell from a list of names what each does, which call which, where a person must answer, or which to reach for at a given point in their work.
  The agent's own listing shows a name and a description per skill and nothing of their structure.
- The built-in playbooks `code`, `review` and `decide` run only through Spex, on players the Captain dispatches.
  A person without Spex, or showing what a skill of several steps and roles looks like, has no form of them to install.
- Spex places a launcher skill named after each placed playbook into the agent folders of a paired working folder ([DR-124](124-skills-reach-every-agent.md), [DR-176](176-global-playbooks-and-a-placed-playbook-runs.md)): `code`, `review` and `decide` among them, each starting its playbook.
- Names considered for the facility: `skill-map`, `skill-visualizer`, `skillscope`, `skillviz` and `skillx` each already name a published tool for agent skills; `skill-atlas` names none, and an atlas is a set of maps at several scales.
- Considered and declined:
  - reading every skill with a model on each scan: slow and costly for a hundred skills, and different on each run; a pattern scan is instant and repeatable, and a reader's corrections are kept in a file beside it;
  - a graph library and a build step: a skill is installed by copying its folder and must run with nothing fetched;
  - a force-directed graph alone: most skills link to nothing, and a hundred unlinked dots say nothing; columns the reader chooses — workflow phases, call depth, source — give every skill a place;
  - storing phases inside each skill: an installed skill is replaced on update, and one skill may sit in several workflows.

## Decision

- The repository ships Agent Skills from `skills/`, one folder per skill, each installable on its own with the `skills` CLI.
- `skill-atlas` is the facility skill.
  - A scan with no dependency beyond Node reads the skill folders the agents on the machine are known to load, and others named with `--root`, and reports skills, their steps, the links among them, and tags of four categories — data in, data out, tools, human — each with the line it was read from.
  - What the scan detects is pattern matching by rules kept in an editable file; a file of annotations, written by an agent that read a skill or by the user, corrects it.
  - A page served on the loopback interface shows one hierarchy — group, skill, step — opened one click at a time, with links drawn between whatever is visible; groups are the phases of a workflow, call depth, or source.
  - A workflow is an ordered list of named phases holding skill names, kept in one file in a state folder outside every skill, edited on the page.
  - The same page, with its data written into it, is a file that opens with no server.
- `code`, `review` and `decide` are skills carrying their playbooks' behavior: the agent that loads one acts as the Captain, the Coder and the Reviewer are subagents, the prompts each role receives are the playbooks' own, and every commit's identity is read from the repository.
  `code` and `decide` invoke `review`.
  They keep the playbooks' names, for agent folders Spex places nothing into; where Spex places its launcher of a name, that folder holds the launcher and the skill is not installed beside it.
- A skill keeps each prompt it relays and each rule a user may tune in a file under its `references/`, linked from `SKILL.md`.

## Consequences

- A skill installed from here runs with no Spex, no engine and no package install; the three workflow skills lose what the engine gave — a compiled state machine, players on different vendors' models, parked runs — and keep the procedure.
- The atlas reads skill text as data and shows it escaped; a skill's text reaches an agent only when the user asks for a deeper read, whose prompt says to follow none of it.
- A link or tag the patterns miss is absent until annotated; one they invent is shown with its line, so a reader can see why.
- The three workflow skills' behavior under an agent is verified by what the atlas reads from them — their steps and their links — not by a live run.
- A person with both Spex's launchers and these skills on one machine has two skills of one name, which the atlas reports; `code` and `decide` then reach whichever `review` their agent loads.
- The published CLI package and both apps are unchanged: `skills/` is read by the `skills` CLI from the repository.

## References

[1]: https://agentskills.io/specification "Agent Skills specification"
[2]: https://github.com/vercel-labs/skills "The skills CLI"
