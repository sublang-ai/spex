<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# skill-atlas: Skill Atlas

## Intent

This package lets a person with many agent skills see what each does, how they link, and where each sits in their work, per [DR-242](../decisions/242-skills-shipped-from-the-repository-and-an-atlas-of-them.md), in the reader's language per [DR-245](../decisions/245-skills-and-the-atlas-in-the-readers-language.md).
It owns the `skill-atlas` skill's scan, its served page and its state files, not the skills it reads.

## External Behavior

### Scan

#### skill-atlas-1

When a scan runs, the scanner shall report one skill for each real folder holding a `SKILL.md` directly in a scanned folder or one folder below it, changing no file there:

| Scanned folder | In the project (`--cwd`) | In the home folder |
| --- | --- | --- |
| `.claude/skills`, or `skills` under `CLAUDE_CONFIG_DIR` | yes | yes |
| `.codex/skills`, or `skills` under `CODEX_HOME` | yes | yes |
| `.system` under the home folder's Codex skills | no | yes |
| `.agents/skills`, `.cursor/skills`, `.gemini/skills`, `.opencode/skills`, `.kimi/skills`, `.windsurf/skills`, `.roo/skills`, `.goose/skills` | yes | yes |
| `.config/opencode/skills` | no | yes |
| `.github/skills`, and `skills` where it holds a skill | yes | no |
| `skills` of each Claude Code plugin recorded as installed for the user or for this project, and enabled by the user's settings, the project's and the project's local ones, the later over the earlier | — | yes |
| each folder named by `--root` | — | — |

- `--no-user` leaves out the home folder's rows, `--no-plugins` the plugins' row, and `--agent <id>` every row but that agent's, `.agents/skills` where that agent loads it, and `--root`'s;
- a folder whose name starts with a dot, unless a row names it, and `node_modules`, hold no skill;
- a folder reached through several links, and folders of one name whose every file is byte for byte the same, are one skill listing the others as copies;
- the second and later differing skills of one name are reported under `<name>@<root id>`;
- a `SKILL.md` whose frontmatter cannot be read is reported under its folder's name with an issue.

#### skill-atlas-2

When a skill is scanned, the scanner shall report the skill's steps from the first of these its text holds, ignoring fenced code and, before a list opening the body, comments and quoted notes:

| Text | Steps | Kind |
| --- | --- | --- |
| two or more headings of one level titled `Step N`, `Phase N`, `Stage N`, `Part N`, `步骤 N`, `阶段 N`, `第 N 步`, `第 N 阶段`, `第 N 部分` or `N. Title` | each heading with its body | step |
| an ordered list under a heading naming a procedure in English or Chinese, or opening the body | each item | step |
| `##` sections | each section | section |

#### skill-atlas-3

When a skill is scanned, the scanner shall report each link from the skill's description and its body outside fenced code to another reported skill, with its kind, the step holding it, and the line it was read from:

| Form | Kind |
| --- | --- |
| the name as a slash command, in `Skill(…)`, after `skill:`, or beside a verb of use and the word skill, playbook or command | calls |
| any such form after words steering away from it in its sentence, with no clause opening with a verb of use between them | mentions |
| the name in backticks alone, where the sentence says skill or the name has a hyphen | mentions |

- a name is the skill's own or `<plugin>:<name>`, and resolves to the skill of that name in the linking skill's folder, a copy's included, before any other;
- a name in a path or URL, and a skill's own name, are no link;
- one link is reported per step and target, calls before mentions;
- a backticked slash command in a sentence saying skill, command, slash or type, naming no reported skill and no command of the agent itself, and a backticked name followed by the word skill and a name in `Skill(…)`, naming no reported skill, are reported as unresolved.

#### skill-atlas-4

When a skill is scanned, the scanner shall attach to each step every tag whose rule matches a line of the step, with up to three matching lines as evidence, and to the skill the union of its steps' tags and those of its description and its body outside every step:

- rules are read at each scan from the skill's tag rules file, or from the file `--rules` names, each a tag id of a category — `input`, `output`, `tool` or `human` — a label and patterns;
- a match after a negation in its own clause is no evidence, except for a rule that says otherwise;
- each tool the frontmatter's `allowed-tools` names adds the tags that tool implies, and each MCP tool name in the text a tool tag of its server;
- a pattern that is no valid expression is skipped with a warning.

#### skill-atlas-5

When a scan completes, the scanner shall report as insights each differing skill of a shared name, unresolved link, group of skills calling one another in a cycle with every skill of it, `SKILL.md` over 500 lines, missing description, unreadable frontmatter, name differing from its folder, skill with no steps, translation behind its source, translation edited apart from its source, and translation whose steps number otherwise than its skill's.

#### skill-atlas-6

Where the state folder holds an annotations file, when a scan runs, the scanner shall apply the file's entries after detection and mark each result as an annotation's:

- an entry may set a skill's summary, replace its steps, and add or remove tags and links, for the skill or one step;
- an entry may give its summary and its steps' titles and summaries again under a language's tag;
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

When the page asks for a file of a skill, the server shall return its text only where the file lies inside that skill's real folder, holds text, and is at most 512 KiB:

- asked in a language, the server returns the file's translation in it [[skill-atlas-27](#skill-atlas-27)] under the same bounds, saying whether it is behind its source or edited apart from it, else the file itself, saying it is the original, and in either case the relative path of the file returned.

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
- the latest edit alone can be undone, whichever edit it was, until the next.

#### skill-atlas-20

When a save is refused because the stored workflows changed, the page shall stop saving, say that the last edit was not saved, and allow no workflow edit until the reader loads the stored workflows.

#### skill-atlas-21

While the stored workflows file cannot be read, the page shall name the file, allow no workflow edit, and offer to start fresh with the file kept.

### Export and settings

#### skill-atlas-22

When `export` is invoked, the command shall write the page as one file holding the atlas, the workflows, the settings and the catalogs, opening in `--lang`'s language, in which no held value can end the page's data element, and which opens with no server and keeps workflow edits in the browser.

#### skill-atlas-23

When the page loads, the page shall take its workflow presets and its view settings from the skill's `references/` files, their labels in a language from the files named `<name>.<tag>.json` beside them and beside the tag rules, and its catalogs from `assets/locales/`, as they then stand:

- a label file has its source's shape, and gives a tag's, a category's, a preset's and a phase's label, name and description, and the page's title, by id, a preset's phases by position.

### Languages

#### skill-atlas-27

When a skill is scanned, the scanner shall report each translation of the skill's `SKILL.md` under its language's tag, with its frontmatter, its steps' titles and text, and whether it is behind its source or edited apart from it:

- a file's translation into a language is the file beside it named with the language's tag before the extension, in the skill's folder, else under `translations/<skill id>/` of the state folder;
- a translation's steps are read as a skill's [[skill-atlas-2](#skill-atlas-2)] and reported only where they number as the skill's;
- a translation is behind where the source's digest it records is not its source's, and edited where its own digest it records is not its own, a Markdown translation alone recording its own; one recording none is neither;
- a translation is listed among no skill's files, and adds no link and no tag.

#### skill-atlas-28

When `pin` is invoked with translations or folders holding them, the command shall record in each translation the digest of the file it translates, and in a Markdown one its own, in a comment line of a Markdown file and a key of a JSON one:

- `pin --check` changes no file, names each translation that is behind, edited or records no digest, and fails where there is one;
- a translation in the state folder whose skill the scan does not report, and a folder named holding no translation, are named and fail the command.

#### skill-atlas-29

While the page shows an atlas, the page shall present its own text, the labels of tags, categories and presets, and each skill's description, frontmatter values, steps and files in one language — the reader's choice kept in the browser, else `--lang`'s, else the browser's where it is offered, else `en-US`:

- the languages offered are `en-US` and each language with a catalog;
- the page's text in a language is its catalog's entry under the English text, and the English text where the catalog has none;
- a skill's frontmatter keys are shown as they stand, each value as its translation's where the translation gives that key, else as the original's;
- a file is shown under the name of the file returned [[skill-atlas-10](#skill-atlas-10)];
- a skill with no translation in the language is shown in its original, and marked as such where the reader opens it, its language being the one its frontmatter's `metadata.language` names, else Chinese, Japanese or Korean by the script most of its words are in, else English, and another than the page's where their primary subtag or script differs; a translation behind its source or edited apart from it is shown and marked, an edited one as text agents do not follow;
- a search matches a skill's text in the language shown and in its original;
- a workflow's and a phase's name and note are shown as typed.

#### skill-atlas-30

When the reader chooses a language on the page, the page shall show the atlas in that language at once, keeping what is open, selected, filtered and unsaved.

## Verification

#### skill-atlas-24

When the command is run against skill folders built for the test, the test shall assert:

- skills found across agent folders and one folder below, a linked folder and an identical copy once, a copy differing in a bundled file apart, a differing skill of the same name under its second id, `--agent codex` keeping `.agents/skills` and Codex's `.system`, a plugin disabled by the project's settings left out, unreadable frontmatter kept, and no file changed [[skill-atlas-1](#skill-atlas-1)];
- steps for each of the three texts, a heading inside fenced code ignored, and a list opening the body after a quoted note [[skill-atlas-2](#skill-atlas-2)];
- calls and mentions with their step and line, a path, a URL and a bare word yielding none, two skills in one sentence the one steered away from, first or second, as a mention and the other as a call, a call from a copy's folder resolved to its sibling, each unresolved form, and `Skill(…)` naming an agent's command unresolved [[skill-atlas-3](#skill-atlas-3)];
- tags with evidence from rules, from `allowed-tools` and from an MCP tool name, rolled up to the skill, a negated match left out, and an edited rules file taking effect on the next scan [[skill-atlas-4](#skill-atlas-4)];
- each insight kind, a cycle's naming every skill of its group [[skill-atlas-5](#skill-atlas-5)];
- an annotation's summary, steps, tags and links applied and marked, replaced steps' tags kept, and an unknown name and an unreadable file warned of [[skill-atlas-6](#skill-atlas-6)];
- the digest's sections [[skill-atlas-7](#skill-atlas-7)];
- steps from Chinese headings [[skill-atlas-2](#skill-atlas-2)];
- a translation in the skill's folder and one in the state folder reported with frontmatter, description and steps, the folder's first, one with other steps reported without them, one behind its source and one edited apart from it each marked, none listed as a file or a skill, and tags and links unchanged by them [[skill-atlas-27](#skill-atlas-27)];
- an annotation's summary and step titles under a language's tag [[skill-atlas-6](#skill-atlas-6)];
- insights for a translation behind its source, for one edited apart from it and for one of other steps [[skill-atlas-5](#skill-atlas-5)];
- `pin` recording a digest in a Markdown and a JSON translation, a Markdown one's own digest recorded, `pin --check` failing on one behind, on one edited and on one with none, changing no file, and both commands failing on one in the state folder of a skill not reported, on one there under no skill's folder and on a folder holding none [[skill-atlas-28](#skill-atlas-28)].

#### skill-atlas-25

When the server is started on a free port by the test, the test shall assert:

- the printed URL answering with the atlas [[skill-atlas-8](#skill-atlas-8)];
- a foreign `Host` and a change without the header refused [[skill-atlas-9](#skill-atlas-9)];
- a skill's file returned, a path outside its folder refused, and a file asked in a language returned as its translation from the skill's folder, as the state folder's, and as the original where there is none, each with its path [[skill-atlas-10](#skill-atlas-10)];
- a skill added after the start reported by a rescan [[skill-atlas-11](#skill-atlas-11)];
- a saved document returned and standing in the state folder, a malformed one and one against a changed file refused with the stored file standing, and an unreadable stored file reported and replaced only on request with the file kept [[skill-atlas-12](#skill-atlas-12)];
- an exported file holding the atlas, the catalogs and `--lang`'s language with no text able to close its data element and a value holding `$&` kept as written [[skill-atlas-22](#skill-atlas-22)];
- an edited presets file, an edited label file and an edited catalog returned by the next read of the settings [[skill-atlas-23](#skill-atlas-23)];
- every text the page looks up present in the `zh-CN` catalog [[skill-atlas-29](#skill-atlas-29)].

#### skill-atlas-26

When the page is opened in a browser against the server over skill folders built for the test, the journey shall assert:

- each grouping's groups, a skill opened to its steps, a link re-anchored to a closed group, and mentions hidden on the reader's choice [[skill-atlas-13](#skill-atlas-13)];
- a skill's and a step's details with tags and evidence, and a phase's with each tag's skills [[skill-atlas-14](#skill-atlas-14)];
- a followed link selecting its target [[skill-atlas-15](#skill-atlas-15)];
- search, a tag filter and a focus narrowing the skills shown [[skill-atlas-16](#skill-atlas-16)];
- an insight's choice selecting its skills [[skill-atlas-17](#skill-atlas-17)];
- a skill whose name and step hold markup shown as text [[skill-atlas-18](#skill-atlas-18)];
- a workflow made from a preset with its skills placed, a phase added and renamed, a skill moved by the menu, an edit undone, a menu's edit undone by the keyboard after its notice has gone, an edit saved as the page is hidden followed by a further edit saved, and the result standing after a reload [[skill-atlas-19](#skill-atlas-19)];
- a file changed behind the page refusing the next edit with the file standing [[skill-atlas-20](#skill-atlas-20)];
- an unreadable file named, and started fresh with the file kept [[skill-atlas-21](#skill-atlas-21)];
- an exported file opened from disk whose workflow edit stands after a reload [[skill-atlas-22](#skill-atlas-22)];
- a browser of Chinese opening the page in Chinese with its chrome, tag labels and presets, a translated skill's description, frontmatter values, steps and file in Chinese with the file named as its translation, an untranslated skill in its original and marked, a translation behind its source and one edited apart from it each marked, a skill written in Japanese, one in English quoting Chinese, and one declaring Traditional Chinese marked as original, one in Chinese holding a katakana middle dot not, and a search for a step's text in either language finding the skill [[skill-atlas-29](#skill-atlas-29)];
- a language chosen on the page applied with the open skill, the selection and the filter kept, and standing after a reload [[skill-atlas-30](#skill-atlas-30)].
