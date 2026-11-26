<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# agent-skills: Skills Shipped From the Repository

## Intent

This package defines the Agent Skills the repository ships from `skills/` and the three workflow skills among them, per [DR-242](../decisions/242-skills-shipped-from-the-repository-and-an-atlas-of-them.md), their translations per [DR-245](../decisions/245-skills-and-the-atlas-in-the-readers-language.md), their versions per [DR-249](../decisions/249-a-skills-version-rises-with-its-content.md), and the `guard` skill, which drafts a guard with a person, per [DR-252](../decisions/252-a-guard-is-kept-beside-the-code.md).
It owns their form and procedure, not the atlas that reads them and not the guard a draft becomes [[guards-1](guards.md#guards-1)].

## External Behavior

### Form

#### agent-skills-1

Each folder under `skills/` shall be one Agent Skill [[1]] a person installs on its own:

- its `SKILL.md` opens with frontmatter whose `name` equals the folder's name and whose `description`, of at most 1024 characters, says what the skill does and when to use it;
- the body of `SKILL.md` is at most 500 lines;
- every relative link in `SKILL.md` names a file in the skill's folder, and every file under `references/` that is no translation is linked from `SKILL.md`.

#### agent-skills-2

Where a skill relays a prompt to a role or applies a rule a user may tune, the skill shall keep that text in a file under its `references/` that `SKILL.md` links.

#### agent-skills-10

Each Markdown file of a skill under `skills/`, and each file under its `references/` holding labels a reader sees, shall have beside it a `zh-CN` translation, named with the tag before the extension, recording its source's digest and, where Markdown, its own:

- a translation of `SKILL.md` keeps the `name`, translates the `description`, holds as many steps as its source, links the translations of the files its source links, and opens with a quoted note saying that agents load `SKILL.md`;
- a translation keeps every code span, command, file name, identifier and placeholder of its source unchanged.

#### agent-skills-11

Each skill under `skills/` shall declare a semantic version [[2]] as the string `metadata.version` in the frontmatter of its `SKILL.md` and the same string in that of each translation of `SKILL.md`.

#### agent-skills-12

When a change alters any file of a skill's folder, the change shall raise that skill's version [[agent-skills-11](#agent-skills-11)] above the version the folder has at the change's merge base with `main`, by the part the change calls for:

| Change | Part raised |
| --- | --- |
| something a user, their saved state or a calling skill relied on removed or changed incompatibly | major |
| behavior added, with what was relied on still holding | minor |
| anything else, such as a fix, a wording or a translation | patch |

- A folder absent at the merge base is new, and its first version is not compared.

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

- a scope that is missing, names nothing committed, or does not end at the checked-out revision of the checked-out branch is asked of the user first;
- the checked-out branch and revision are recorded at the start and read again after each role's turn, and a branch changed, or a revision moved other than by a Coder's one commit, ends the run as failed;
- a Reviewer edits nothing;
- a Coder accepts or rejects each finding, and commits nothing where it rejects all;
- findings raised or kept in the third round are returned unsettled.

#### agent-skills-5

When the `decide` skill is given a topic, the loading agent shall take a proposal from a Coder and a Reviewer, at the same time and neither seeing the other's where the host runs two subagents at once, else in turn with that said in its result, have the Coder commit their synthesis as decision records or spec items in one commit, and invoke the `review` skill over that commit.

#### agent-skills-6

While the `code`, `review` or `decide` skill runs, the loading agent shall read each new commit's identity and the evaluated revision from the repository, and end the run as failed where a step left no commit it required, several, or a rewritten one.

### The guard skill

#### agent-skills-13

When the `guard` skill is asked to protect a behavior, the loading agent shall draft a guard with the person in these five steps, running `spex approve` [[guards-16](guards.md#guards-16)] only when the person says so ([DR-252](../decisions/252-a-guard-is-kept-beside-the-code.md)):

1. write the assertion and the examples as test items that cite the behavior item [[guards-2](guards.md#guards-2)], and the binding's events and effects from those items [[guards-3](guards.md#guards-3)];
2. have independent agents each draft a reading [[guards-6](guards.md#guards-6)] from the items and that declaration alone, before any agent reads the code;
3. where readings disagree, show the person one distinguishing sequence at a time, which the person marks permitted or forbidden and which then becomes an example [[guards-10](guards.md#guards-10)], and drop the readings it contradicts;
4. read the code only then, to write the binding's module, files and commands [[guards-5](guards.md#guards-5)], and plant a fault or restore a past defect as a kept fault [[guards-11](guards.md#guards-11)];
5. run `spex verify` [[guards-17](guards.md#guards-17)] and tell the person what it found.

- without subagents, the loading agent drafts the readings in separate passes from the items and the declaration alone, and says in its result that the readings were not independent;
- when an item of a guard changes, the skill drafts the readings again before it asks for approval;
- the skill needs the `spex` command and says so in its `compatibility`;
- the prompts it relays and the forms of the files it writes stand under its `references/` [[agent-skills-2](#agent-skills-2)].

## Verification

#### agent-skills-7

When every folder under `skills/` is checked, the test shall assert its name, description, body length and links, and each linked `references/` file present [[agent-skills-1](#agent-skills-1)] [[agent-skills-2](#agent-skills-2)], and each translation present with its source's digest and, where Markdown, its own, its `SKILL.md`'s name and step count, and its links to translations [[agent-skills-10](#agent-skills-10)], and its version a semantic version equal in `SKILL.md` and each translation [[agent-skills-11](#agent-skills-11)] and, where the folder's files differ from those at its merge base with `origin/main`, higher than the version there [[agent-skills-12](#agent-skills-12)].

#### agent-skills-8

When the repository's `skills/` alone is scanned by the atlas, the test shall assert the three workflow skills reported and what the scan reads from them:

- each of the three naming the Captain, the Coder and the fallback without subagents [[agent-skills-9](#agent-skills-9)];
- `code`'s steps in order, its review step calling `review`, and a step tagged as asking the user [[agent-skills-3](#agent-skills-3)];
- `review`'s steps in order with no call to another skill, its three-round bound stated, and each of its outcomes returning the evaluated revision [[agent-skills-4](#agent-skills-4)];
- `decide`'s steps in order, its review step calling `review` [[agent-skills-5](#agent-skills-5)];
- each of the three stating that commits are read from the repository [[agent-skills-6](#agent-skills-6)].

#### agent-skills-14

When the repository's `skills/` alone is scanned by the atlas, the test shall assert the `guard` skill reported and what the scan reads from it [[agent-skills-13](#agent-skills-13)]:

- its five steps in order: the items and the declaration, the readings, the distinguishing sequence, the binding and the kept fault, and the check;
- its second step naming independent agents, the items and the declaration alone and "before any agent reads the code", and the fallback without subagents saying that the readings were not independent;
- its third step tagged as asking the user;
- `spex verify` and `spex approve` named, with `spex approve` run only when the person says so;
- that an item's change has the readings drafted again, and that the skill needs the `spex` command.

## References

[1]: https://agentskills.io/specification "Agent Skills specification"
[2]: https://semver.org/spec/v2.0.0.html "Semantic Versioning 2.0.0"
