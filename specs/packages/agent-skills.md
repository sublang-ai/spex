<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# agent-skills: Skills Shipped From the Repository

## Intent

This package defines the Agent Skills the repository ships from `skills/` and the three workflow skills among them, per [DR-242](../decisions/242-skills-shipped-from-the-repository-and-an-atlas-of-them.md).
It owns their form and procedure, not the atlas that reads them.

## External Behavior

### Form

#### agent-skills-1

Each folder under `skills/` shall be one Agent Skill [[1]] a person installs on its own:

- its `SKILL.md` opens with frontmatter whose `name` equals the folder's name and whose `description`, of at most 1024 characters, says what the skill does and when to use it;
- the body of `SKILL.md` is at most 500 lines;
- every relative link in `SKILL.md` names a file in the skill's folder, and every file under `references/` is linked from `SKILL.md`.

#### agent-skills-2

Where a skill relays a prompt to a role or applies a rule a user may tune, the skill shall keep that text in a file under its `references/` that `SKILL.md` links.

### Workflow skills

#### agent-skills-9

While the `code`, `review` or `decide` skill runs, the loading agent shall act as the Captain, who relays prompts and judges replies and neither edits nor commits, and run the Coder and the Reviewer each as a subagent where the host allows, else play each in turn and say so in its result.

#### agent-skills-3

When the `code` skill is given a coding request, the loading agent shall have a Coder complete it in phases of one new commit each and then invoke the `review` skill once over every commit of the run:

| Phase result | Next |
| --- | --- |
| the change complete in one commit | review |
| an intent record written, no task of it implemented | the record's next task |
| a task done, another unfinished | the record's next task |
| the record's last task done | review |
| a question for the user | the user's answer, then the same phase, which commits only then |

#### agent-skills-4

When the `review` skill is given an intent and a scope of committed work, the loading agent shall run at most three Reviewer rounds, each further round following a Coder's disposition of the round's findings in at most one new commit, and return the evaluated revision with whether a finding is left unsettled:

- a scope that is missing or names nothing committed is asked of the user first;
- a Reviewer edits nothing;
- a Coder accepts or rejects each finding, and commits nothing where it rejects all;
- findings raised or kept in the third round are returned unsettled.

#### agent-skills-5

When the `decide` skill is given a topic, the loading agent shall take a proposal from a Coder and a Reviewer at the same time, neither seeing the other's, have the Coder commit their synthesis as decision records or spec items in one commit, and invoke the `review` skill over that commit.

#### agent-skills-6

While the `code`, `review` or `decide` skill runs, the loading agent shall read each new commit's identity and the evaluated revision from the repository, and end the run as failed where a step left no commit it required, several, or a rewritten one.

## Verification

#### agent-skills-7

When every folder under `skills/` is checked, the test shall assert its name, description, body length and links, and each linked `references/` file present [[agent-skills-1](#agent-skills-1)] [[agent-skills-2](#agent-skills-2)].

#### agent-skills-8

When the repository's `skills/` is scanned by the atlas, the test shall assert what the scan reads from the three workflow skills:

- each of the three naming the Captain, the Coder and the fallback without subagents [[agent-skills-9](#agent-skills-9)];
- `code`'s steps in order, its review step calling `review`, and a step tagged as asking the user [[agent-skills-3](#agent-skills-3)];
- `review`'s steps in order with no call to another skill, and its three-round bound stated [[agent-skills-4](#agent-skills-4)];
- `decide`'s steps in order, its review step calling `review` [[agent-skills-5](#agent-skills-5)];
- each of the three stating that commits are read from the repository [[agent-skills-6](#agent-skills-6)].

## References

[1]: https://agentskills.io/specification "Agent Skills specification"
