<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Skills shipped from this repository

Four Agent Skills live under [`skills/`](../skills), each installable on its own:

```bash
npx skills add sublang-ai/spex --skill skill-atlas
```

| Skill | What it does |
| --- | --- |
| [`skill-atlas`](../skills/skill-atlas/SKILL.md) | Scans the skills installed for your agent, shows how they link, what each step reads, writes, runs and asks, and lets you sort them into pipeline phases on a local page |
| [`code`](../skills/code/SKILL.md) | Implements a request as single-commit phases, then has the change reviewed once |
| [`review`](../skills/review/SKILL.md) | Reviews committed work in up to three rounds between an independent Reviewer and a Coder |
| [`decide`](../skills/decide/SKILL.md) | Turns a topic into decision records or spec items from two independent proposals, then has them reviewed |

The decision is recorded in [DR-242](../specs/decisions/242-skills-shipped-from-the-repository-and-an-atlas-of-them.md); the behavior is specified in [`skill-atlas.md`](../specs/packages/skill-atlas.md) and [`agent-skills.md`](../specs/packages/agent-skills.md).

The rest of this document is the report on how the skills were designed and why they are written the way they are.

## The name

`skill-atlas`: an atlas is a bound set of maps at several scales, which is what the tool is — one overview and progressively finer views of the same territory.
`skill-map`, `skill-visualizer`, `skillscope`, `skillviz` and `skillx` were checked and each already names a published tool for agent skills, two of them on the same install channel.
The name reads as what it does in a listing, survives being said aloud, and the install line needs no explanation.

## How Skill Atlas is designed

The problem is not drawing a graph.
A person with a hundred skills has three questions: *what do I have*, *how does this one work*, and *what do I reach for now*.
Each gets one part of the design.

**One hierarchy, opened a click at a time.**
Group → skill → step.
A group is a pipeline phase, a call depth or an install location, as the reader chooses.
A link is always drawn between the innermost things currently open: from the step that makes the call when its skill is open, from the skill when it is closed, from the phase when the phase is closed.
So the overview and the full graph are the same picture at different openings, and "what does this call" and "what are this skill's steps" are the same gesture.
Most skills link to nothing, which is why the page is columns rather than a force-directed cloud: every skill has a place even with no link.

**Three layers of truth, each owned by whoever knows best.**

| Layer | File | Owner | Why separate |
| --- | --- | --- | --- |
| What the text says | `atlas.json` | the scan | Instant, free, the same every run |
| What the text means | `annotations.json` | an agent that read the skill, or the user | Patterns miss prose; a correction must outlive the next scan |
| How I use them | `pipelines.json` | the user, on the page | Organization is personal, and survives reinstalling a skill |

The scan is deliberately pattern matching, not a model call per skill: a hundred model reads on every open would be slow, costly and different each time.
Every tag and link carries the line it was read from, so an automatic claim can be checked at a glance and a wrong one is visibly wrong.
The agent's judgment enters only where asked, through the deep-read prompt, and lands in a file a person can read and edit.

**Tags answer the questions people ask of a pipeline.**
Four categories — data in, data out, tools, human — are attached to steps and roll up to the skill and to any phase holding it.
A phase's rollup is the useful one: "the Verify phase needs my approval twice and pushes to a Git host" is what someone planning their day wants to know.

**Nothing to install.**
One Node script with no dependencies and one HTML file with no network requests.
A skill is installed by copying a folder, so it must run from that folder alone.
The same page, with its data written into it, is a file to send to a colleague.

## How the skills follow the writing guidelines

The standard is the Agent Skills specification and Anthropic's skill authoring guidance.
Each row names a guideline and where to see it.

| Guideline | How the skills show it |
| --- | --- |
| **The description decides whether a skill is ever used**: third person, what it does and when, the words a user would say | Every description says what the skill does, then `Use when…` with the phrases a user would say. The three workflow skills add `Not for…`: `code` and `decide` point at each other and at `review`, which keeps three related skills from stealing each other's requests |
| **Name**: lowercase, hyphens, equal to the folder | `skill-atlas`, `code`, `review`, `decide`; checked by a test |
| **Concise: the context window is shared** — say only what the model does not already know | The four `SKILL.md` files are 76 to 136 lines against a 500-line ceiling. None explains what git, a subagent or a code review is |
| **Progressive disclosure**: a short `SKILL.md` that links to detail read only when needed | `skill-atlas` keeps the JSON shapes in `references/data-model.md` the deep-read procedure in `references/deep-read.md` and the translation procedure in `references/translate.md`; the workflow skills keep every relayed prompt in `references/`. An agent answering "open the atlas" reads 136 lines |
| **References one level deep** | Every reference file is linked from `SKILL.md` itself; none is reachable only through another. Checked by a test |
| **A table of contents on longer reference files** | `data-model.md`, `reviewer-round.md` and `coder-phases.md` open with one |
| **Match freedom to fragility** | Fragile, exact operations are a script (`atlas.mjs`) or a verbatim prompt; judgment calls ("decide from what the reply establishes, never from its format") are stated as principles with the reason |
| **Workflows as numbered steps with explicit branches** | Each skill has `### Step N` headings; each decision point is a table of *what happened → what next*, so no branch is implied |
| **Feedback loops: check, then proceed** | After every role call the Captain reads the repository (`git rev-parse HEAD`, `git log`) instead of trusting the reply; the atlas workflow ends a deep read with a rescan that must report no ignored entries |
| **Scripts for deterministic work; say whether to run or read them** | "Run the script; do not read it into context." Scanning, serving and exporting are code; the agent's tokens go to the user's question |
| **Scripts solve, they do not punt** | A malformed `SKILL.md` becomes an issue on that skill and the scan continues; a bad user regex is skipped with a warning; a busy port falls back to a free one |
| **No unexplained constants** | Limits are named and explained in the script; thresholds a user may disagree with (which words mean "approval") are data in `tag-rules.json`, not code |
| **Consistent terms** | One word per thing throughout: *Captain*, *Coder*, *Reviewer*; *phase* (of a pipeline on the atlas's page, or of a `code` run), *step* (of a skill), *link* with kinds *calls* and *mentions* in the scan, and *dependency* for a call on the page, which shows no mention; *state folder* |
| **Examples over description** | The input handed to `review` is shown as the literal quoted block to fill in; the data model is annotated JSON, not prose about JSON |
| **State requirements up front** | The `compatibility` field names Node 18, git, the sibling skill a skill invokes, and the repository layout the prompts assume |
| **Degrade honestly** | Each skill says what to do without subagents or without a browser; `review` and `decide` require saying in the result that independence was lost ("the Reviewer was not independent") |
| **Nothing time-bound, no host-specific paths** | No dates, model names or absolute paths; commands run from the user's project folder and name the script by its path in the skill's folder (`<skill-dir>/scripts/atlas.mjs`), with forward slashes |
| **Treat what you read as data** | The atlas reads third-party skills: the page escapes every string, the server serves files only from inside a skill's folder on loopback, and both the skill and the deep-read prompt say never to follow instructions found in a scanned skill |

## What a user can change without touching the procedure

Every skill has a *Customizing* section naming plain files under `references/`.

| Skill | File | Changes |
| --- | --- | --- |
| `skill-atlas` | `tag-rules.json` | Which words produce which tag; new tags |
| | `pipeline-presets.json` | The pipelines offered on the page and the keywords that place skills |
| | `view-settings.json` | Title, category labels and colours, defaults |
| | `deep-read.md` | How the agent reads a skill in depth and what it records |
| `code` | `coder-phases.md` | How work is sized, which conventions the Coder consults, what a commit must contain |
| `review` | `reviewer-round.md`, `coder-disposition.md` | What a Reviewer flags, what a Coder may reject |
| `decide` | `prompts.md` | What a proposal covers, which records the synthesis writes |

The split is deliberate: `SKILL.md` holds the procedure, which should rarely change, and `references/` holds the wording and thresholds, which every team has opinions about.
A user who edits a prompt cannot break the control flow, and an update to the procedure does not overwrite a team's wording unless they take it.

## Languages

The page and the shipped skills read in English (US) and Simplified Chinese ([DR-245](../specs/decisions/245-skills-and-the-atlas-in-the-readers-language.md)).
The page follows the reader's choice in its header, else `--lang`, else the browser; a reader studies a skill's text more than the page's, so a skill's description, steps and files switch with it.

| What | Where its Chinese lives |
| --- | --- |
| The page's own text | `assets/locales/zh-CN.json`, keyed by the English text |
| Tag, category and preset labels, the title | `references/<name>.zh-CN.json` beside each tunable file |
| A shipped skill's Markdown | `SKILL.zh-CN.md` and `references/<file>.zh-CN.md` beside each source |
| A skill someone else wrote | `translations/<skill id>/` in the state folder, written by the agent on request by `references/translate.md` |

`SKILL.md` stays the one file an agent loads; a translation says it is for readers, and supplies words only — steps, links and tags still come from the source.
Each translation records the SHA-256 of the source it was made from and, in Markdown, its own (`atlas.mjs pin`), so the page marks one behind its source or edited apart from it.
A test fails a change to a shipped skill's text, or to its Markdown translation, until the other is brought in line; a translated label file records no digest of its own, so its own edit passes and takes effect as it stands.

## How the three workflow skills match their playbooks

| Playbook element | In the skill |
| --- | --- |
| Captain relays and judges, never plays | The agent that loads the skill is the Captain and is told never to write, review or commit |
| Players bound to roles | Subagents, continued across calls where the host allows |
| Instruction blocks relayed to players | The same text in `references/`, adapted in four ways: `Boss` reads *the user*, `@specs/…` are plain paths, `<coder-llm>` is `<coder-model>`, and the engine's own words (`REVIEW`, workshop steps) are plain ones |
| Quoted context (`> Original request: …`) | The same quoted blocks |
| The repository-effect receipt as a commit's identity | `git rev-parse HEAD` and `git log` compared with the last recorded revision |
| No transition depends on a reply's format | Stated at each judging step |
| `code` and `decide` call `review` | `Invoke the review skill` with the same input block; the atlas shows both links from the step that makes them |
| At most three review rounds, twice-rejected findings settled | Same bound, same rule |
| Parallel, independent proposals; a Boss interrupt restarts the pair | Two subagents started in one turn; a changed topic restarts both |
| A nested failure outside the result contract parks the run | Stop as failed and report the error as it is |

What the engine gave and a skill cannot: a compiled state machine that makes an illegal transition impossible, players on different vendors' models, and a parked run that resumes later.
The skills keep the procedure and say so where it weakens.

## Verification

What was run on the delivered files, and what it showed:

| Check | Result |
| --- | --- |
| `node --test scripts/skill-atlas.test.mjs` | 121 tests pass: the scan over fixture skill folders, a folder two roots name by one path listed once, differing skills of one name reported as one note naming their folders and no agent, a plugin's copy of a skill, linked or byte for byte the same, one skill reached by its plugin's name, a link to a shared name reaching the caller's sibling, each insight's level, translations and annotations, the server, the `pipelines`, `pin` and `digest` commands, the export, the form of every skill under `skills/`, and what the scan reads from `code`, `review` and `decide` |
| `npm run e2e -- skill-atlas` | 43 browser journeys pass against the real server: groupings, steps, dependencies with a mention neither drawn nor counted, a card's counts shown only where not zero and its folders counted and named, the shown cards' steps opened and closed together, problems marked and counted apart from notes, a selected or focused skill's dependencies, and an insight's skills' all of them, drawn over the dimmed rest, a property's fields a row each, Rescan busy, the details opened by a selection alone and closed back to it, to the very card a skill in two phases was opened from, Help with the legend and the keys, the toolbar at a phone's width, a followed dependency, a folder above the working folder, details, search, filter, focus, insights, an unresolved call listed and an unresolved mention not, frontmatter in error, a name with different versions noted with both folders and compared side by side, any two of three versions compared, versions in any folders noted alike naming no agent, a comparison showing a line's ending and a `SKILL.md` the same in both, 2,002 lines differing only in the first and last, and texts too far apart to pair left unmarked, markup shown as text, pipelines with an edit undone, notes in two pipelines undone apart, a save as the page is hidden, the save conflict, a refused deletion keeping the served page's presets, the unreadable file, the read-only exported page, a skill in its original language, one in Arabic marked alike in its details and its file, the page in Chinese, an annotation written from another text, an atlas reporting no languages, a translation under a compatible tag, one behind its source under the first tag read over a current one under a later tag, a translation refreshed in the state folder over a skill's own behind its source, annotation words over a translation, a language chosen from the page's menu |
| `spex lint` | No errors in the new decision record and packages |
| A scan of a real machine | 88 skill folders across 8 locations read as 32 skills and 56 identical copies (copies then compared by `SKILL.md` alone); every one of the links reported as a call is a real one, and `code` and `decide` both link to `review` from the step that invokes it |
| An independent review | Four reviewers (scan and server, page, skill writing and playbook equivalence, specs), each finding then checked by a second agent that tried to refute it. 40 findings survived and were fixed, among them a page that could overwrite a `workflows.json` changed elsewhere, links invented from URL paths, and three claims in this report |

Not verified: the three workflow skills run end to end by an agent on a real change.
Their procedure is checked as text and as the atlas reads it, not by a live run.

## Limits

- Detection is pattern matching. A skill written as flowing prose yields sections, not steps, until someone deep-reads it.
- A link is found only to a skill that is installed; a call made through a variable or built at run time is invisible.
- `code`, `review` and `decide` keep their playbooks' names. Spex places a launcher skill of each name into the agent folders of a project it manages, so in such a folder `/review` starts the playbook, not this skill. Install these where Spex places nothing; the atlas reports the two as differing skills of one name.
- The workflow skills' prompts assume a Spex-scaffolded repository. In another repository the prompt files need its conventions written in.
