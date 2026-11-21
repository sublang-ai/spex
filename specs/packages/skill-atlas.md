<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# skill-atlas: Skill Atlas

## Intent

This package lets a person with many agent skills see what each does, how they link, and where each sits in their work, per [DR-242](../decisions/242-skills-shipped-from-the-repository-and-an-atlas-of-them.md).
It owns the `skill-atlas` skill's scan, its served page and its state files, not the skills it reads.

## External Behavior

### Scan

#### skill-atlas-1

When a scan runs, the scanner shall report one skill for each real folder holding a `SKILL.md` directly in a scanned folder or one folder below it, changing no file there:

| Scanned folder | In the project (`--cwd`) | In the home folder |
| --- | --- | --- |
| `.claude/skills`, or `skills` under `CLAUDE_CONFIG_DIR` | yes | yes |
| `.codex/skills`, or `skills` under `CODEX_HOME` | yes | yes |
| `.agents/skills`, `.cursor/skills`, `.gemini/skills`, `.opencode/skills`, `.kimi/skills`, `.windsurf/skills`, `.roo/skills`, `.goose/skills` | yes | yes |
| `.config/opencode/skills` | no | yes |
| `.github/skills`, and `skills` where it holds a skill | yes | no |
| `skills` of each Claude Code plugin recorded as installed, enabled, and installed for the user or for this project | — | yes |
| each folder named by `--root` | — | — |

- `--no-user` leaves out the home folder's rows, `--no-plugins` the plugins' row, and `--agent <id>` every row but that agent's and `--root`'s;
- a folder whose name starts with a dot, and `node_modules`, hold no skill;
- a folder reached through several links, and folders of one name whose `SKILL.md` are byte for byte the same, are one skill listing the others as copies;
- the second and later differing skills of one name are reported under `<name>@<root id>`;
- a `SKILL.md` whose frontmatter cannot be read is reported under its folder's name with an issue.

#### skill-atlas-2

When a skill is scanned, the scanner shall report the skill's steps from the first of these its text holds, ignoring fenced code:

| Text | Steps | Kind |
| --- | --- | --- |
| two or more headings of one level titled `Step N`, `Phase N`, `Stage N`, `Part N` or `N. Title` | each heading with its body | step |
| an ordered list under a heading naming a procedure, or opening the body | each item | step |
| `##` sections | each section | section |

#### skill-atlas-3

When a skill is scanned, the scanner shall report each link from the skill's description and its body outside fenced code to another reported skill, with its kind, the step holding it, and the line it was read from:

| Form | Kind |
| --- | --- |
| the name as a slash command, in `Skill(…)`, after `skill:`, or beside a verb of use and the word skill, playbook or command | calls |
| any such form in a sentence steering away from the skill | mentions |
| the name in backticks alone, where the sentence says skill or the name has a hyphen | mentions |

- a name is the skill's own or `<plugin>:<name>`, and resolves to the skill of that name in the linking skill's folder before any other;
- a name in a path or URL, and a skill's own name, are no link;
- one link is reported per step and target, calls before mentions;
- a backticked slash command in a sentence saying skill, command, slash or type, a backticked name followed by the word skill, and a name in `Skill(…)`, naming no reported skill and no command of the agent itself, are reported as unresolved.

#### skill-atlas-4

When a skill is scanned, the scanner shall attach to each step every tag whose rule matches a line of the step, with up to three matching lines as evidence, and to the skill the union of its steps' tags and those of its description and its body outside every step:

- rules are read at each scan from the skill's tag rules file, or from the file `--rules` names, each a tag id of a category — `input`, `output`, `tool` or `human` — a label and patterns;
- a match after a negation in its own clause is no evidence, except for a rule that says otherwise;
- each tool the frontmatter's `allowed-tools` names adds the tags that tool implies, and each MCP tool name in the text a tool tag of its server;
- a pattern that is no valid expression is skipped with a warning.

#### skill-atlas-5

When a scan completes, the scanner shall report as insights each differing skill of a shared name, unresolved link, cycle of calls, `SKILL.md` over 500 lines, missing description, unreadable frontmatter, name differing from its folder, and skill with no steps.

#### skill-atlas-6

Where the state folder holds an annotations file, when a scan runs, the scanner shall apply the file's entries after detection and mark each result as an annotation's:

- an entry may set a skill's summary, replace its steps, and add or remove tags and links, for the skill or one step;
- a skill whose steps are replaced keeps the tags and links its former steps held, at the skill;
- an entry naming no reported skill is ignored with a warning;
- an unreadable file is ignored with a warning.

#### skill-atlas-7

When `scan --summary` is invoked, the command shall print in place of the atlas a plain-text digest: the skills in each scanned folder, the most linked skills, and each unresolved link, differing skill of a shared name, cycle, and skill whose steps were not detected.

### Server

#### skill-atlas-8

When `serve` is invoked, the server shall scan, listen on the loopback interface alone, print one line of JSON holding the page's URL, and open the URL in the browser unless `--no-open` is given:

- the port is `--port`'s, else the default, else a free one where the default is taken.

#### skill-atlas-9

When the server receives a request, the server shall refuse it unless its `Host` is `127.0.0.1` or `localhost` with the server's port and, where it changes state, it carries the page's own header and a JSON content type.

#### skill-atlas-10

When the page asks for a file of a skill, the server shall return its text only where the file lies inside that skill's real folder, holds text, and is at most 512 KiB.

#### skill-atlas-11

When the page asks to rescan, the server shall scan again, reading the rules and the annotations as they then stand, and return the new atlas.

#### skill-atlas-12

When the page saves the workflows document, the server shall write it to the state folder only where it has the workflows shape and the stored file is the version the page last read:

- a document of another shape is refused and the stored file stands;
- a save against a file changed since is refused and the stored file stands;
- a stored file that cannot be read as a workflows document is reported as such, never as empty, and is replaced only on the page's explicit request, the file kept beside it under another name.

### Page

#### skill-atlas-13

While the page shows an atlas, the page shall present groups holding skills holding steps, each opened or closed by the reader, with every link drawn between the innermost shown ends:

| Grouping | Groups |
| --- | --- |
| Workflow | the active workflow's phases in order, then the skills in no phase; with no workflow, the presets to start one from |
| Links | skills that link out and are linked from none, each further link depth, skills linked only within a cycle, then skills with no link |
| Source | the scanned folders, a skill under its own and each copy's |

- mentions are drawn, and count as links in the Links grouping, only while the reader keeps them shown.

#### skill-atlas-14

When the reader selects a skill, a step or a phase, the page shall show what it holds, its tags by category, and its links in and out: a skill's and a step's tags each with its evidence, a phase's tags the union of its skills' each with the skills it comes from.

#### skill-atlas-15

When the reader follows a link from a step or from a skill's details, the page shall open the target's group, bring the target into view and select it.

#### skill-atlas-16

While a search, a tag filter or a focus on one skill is set, the page shall show only the skills matching all of them, a focus matching the skill and every skill linked to or from it through any number of links.

#### skill-atlas-17

When the reader opens the insights, the page shall list the atlas's insights by kind and select an insight's skills on its choice.

#### skill-atlas-18

While the page shows an atlas, the page shall show every string read from a skill as text, never as markup.

### Workflows

#### skill-atlas-19

When the reader edits a workflow on the page, the page shall save the workflows document with the change:

- a workflow is created blank or from a preset, renamed, duplicated and deleted;
- a preset, where the reader asks it to place skills, puts each skill into the one phase whose keyword occurs earliest in the skill's name, else in its description, the earlier phase on a tie, a keyword matching at a word's start and one of three characters or fewer as a whole word;
- a phase is added, renamed, reordered, noted and deleted;
- a skill is put into a phase, moved between phases and removed by dragging or by a menu, and may sit in several phases;
- a phase holds skill ids, and an id no reported skill has is shown as missing;
- the latest edit alone can be undone.

#### skill-atlas-20

When a save is refused because the stored workflows changed, the page shall stop saving, say that the last edit was not saved, and allow no workflow edit until the reader loads the stored workflows.

#### skill-atlas-21

While the stored workflows file cannot be read, the page shall name the file, allow no workflow edit, and offer to start fresh with the file kept.

### Export and settings

#### skill-atlas-22

When `export` is invoked, the command shall write the page as one file holding the atlas, the workflows and the settings, in which no held value can end the page's data element, and which opens with no server and keeps workflow edits in the browser.

#### skill-atlas-23

When the page loads, the page shall take its workflow presets and its view settings from the skill's `references/` files as they then stand.

## Verification

#### skill-atlas-24

When the command is run against skill folders built for the test, the test shall assert:

- skills found across agent folders and one folder below, a linked folder and an identical copy once, a differing skill of the same name under its second id, unreadable frontmatter kept, and no file changed [[skill-atlas-1](#skill-atlas-1)];
- steps for each of the three texts and a heading inside fenced code ignored [[skill-atlas-2](#skill-atlas-2)];
- calls and mentions with their step and line, a path, a URL and a bare word yielding none, and each unresolved form [[skill-atlas-3](#skill-atlas-3)];
- tags with evidence from rules, from `allowed-tools` and from an MCP tool name, rolled up to the skill, a negated match left out, and an edited rules file taking effect on the next scan [[skill-atlas-4](#skill-atlas-4)];
- each insight kind [[skill-atlas-5](#skill-atlas-5)];
- an annotation's summary, steps, tags and links applied and marked, replaced steps' tags kept, and an unknown name and an unreadable file warned of [[skill-atlas-6](#skill-atlas-6)];
- the digest's sections [[skill-atlas-7](#skill-atlas-7)].

#### skill-atlas-25

When the server is started on a free port by the test, the test shall assert:

- the printed URL answering with the atlas [[skill-atlas-8](#skill-atlas-8)];
- a foreign `Host` and a change without the header refused [[skill-atlas-9](#skill-atlas-9)];
- a skill's file returned, and a path outside its folder refused [[skill-atlas-10](#skill-atlas-10)];
- a skill added after the start reported by a rescan [[skill-atlas-11](#skill-atlas-11)];
- a saved document returned and standing in the state folder, a malformed one and one against a changed file refused with the stored file standing, and an unreadable stored file reported and replaced only on request with the file kept [[skill-atlas-12](#skill-atlas-12)];
- an exported file holding the atlas with no text able to close its data element [[skill-atlas-22](#skill-atlas-22)];
- an edited presets file returned by the next read of the settings [[skill-atlas-23](#skill-atlas-23)].

#### skill-atlas-26

When the page is opened in a browser against the server over skill folders built for the test, the journey shall assert:

- each grouping's groups, a skill opened to its steps, a link re-anchored to a closed group, and mentions hidden on the reader's choice [[skill-atlas-13](#skill-atlas-13)];
- a skill's and a step's details with tags and evidence, and a phase's with each tag's skills [[skill-atlas-14](#skill-atlas-14)];
- a followed link selecting its target [[skill-atlas-15](#skill-atlas-15)];
- search, a tag filter and a focus narrowing the skills shown [[skill-atlas-16](#skill-atlas-16)];
- an insight's choice selecting its skills [[skill-atlas-17](#skill-atlas-17)];
- a skill whose name and step hold markup shown as text [[skill-atlas-18](#skill-atlas-18)];
- a workflow made from a preset with its skills placed, a phase added and renamed, a skill moved by the menu, an edit undone, and the result standing after a reload [[skill-atlas-19](#skill-atlas-19)];
- a file changed behind the page refusing the next edit with the file standing [[skill-atlas-20](#skill-atlas-20)];
- an unreadable file named, and started fresh with the file kept [[skill-atlas-21](#skill-atlas-21)];
- an exported file opened from disk whose workflow edit stands after a reload [[skill-atlas-22](#skill-atlas-22)].
