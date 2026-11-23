<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# skill-atlas: Skill Atlas

## Intent

This package lets a person with many agent skills see what each does, how they link, and where each sits in their work, per [DR-242](../decisions/242-skills-shipped-from-the-repository-and-an-atlas-of-them.md), in the reader's language per [DR-245](../decisions/245-skills-and-the-atlas-in-the-readers-language.md) as amended by [DR-247](../decisions/247-a-refreshed-translation-is-the-one-read.md), with dependencies and differing versions per [DR-248](../decisions/248-the-atlas-shows-dependencies-and-differing-versions.md).
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
| `.config/opencode/skills`, `.config/agents/skills`, `.config/goose/skills`, `.copilot/skills`, `.codeium/windsurf/skills` | no | yes |
| `.github/skills`, and `skills` where it holds a skill | yes | no |
| `skills` of each Claude Code plugin recorded as installed for the user or for this project, and enabled by the user's settings, the project's and the project's local ones, the later over the earlier | — | yes |
| each folder named by `--root` | — | — |

- the project is `--cwd`'s folder and each folder above its real place up to the root of its repository, the nearer first, each scanned folder's id a function of that folder alone — its place in the repository, its plugin's install or its `--root` folder however spelled or reached — never of another folder, install or option or their order, and no other folder's;
- a folder reached by several rows is scanned once, under the id of a project's row before the home folder's, a plugin's and a `--root`'s, of one kind the row reaching it through no link of its own;
- the home folder's `.config` is `XDG_CONFIG_HOME` where that is set;
- `--no-user` leaves out the home folder's rows, `--no-plugins` the plugins' row, and `--agent <id>` every row but that agent's, `.agents/skills` and the home folder's `.config/agents/skills` where that agent loads them, and `--root`'s;
- a folder whose name starts with a dot, unless a row names it, and `node_modules`, hold no skill;
- a folder reached through several links, a scanned folder's skills reached through another row's by another path, and folders of one declared name, a plugin's included, whose every file is byte for byte the same and every link inside names the same target, as far as the scan's bounds on a folder let it compare them, are one skill listing the others as copies;
- of the differing skills of one name, letter case aside, the first — by its first folder's depth below the repository's root, that root's own and the folders outside the project at none, then the project's rows before the home folder's, the plugins' and `--root`'s, the rows in the scanner's fixed order of agents and the plugins and `--root`s by their ids, then by its folder's path in its root — is reported under the name, the next taking it where the first is removed, and each other under an id that is a function of its own name, root and folder in it alone, `<name>@<root id>` where that folder is named by the name;
- a name holding `@`, `#`, `/`, `\` or a control character, or `.` or `..`, stands in an id as its slug, `_` and eight hex digits of its SHA-256, and no two ids differ in letter case alone;
- a `SKILL.md` whose frontmatter cannot be read whole is reported with an issue, each field that reads standing, and under its folder's name where its name does not read.

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
| the name as a slash command, in `Skill(…)`, after `skill:`, as `$name` after a verb of use, or beside a verb of use and the word skill, playbook or command | calls |
| any such form after words steering away from it in its sentence, a negation before it included, with no clause opening with a verb of use between them, or in a sentence saying instead with neither of nor a verb of use after it | mentions |
| the name in backticks alone, where the sentence says skill or the name has a hyphen | mentions |

- a name is the skill's own or `<plugin>:<name>`, and resolves to the skill of that name in the linking skill's folder, a copy's included, else to the first of that name in the scanner's order, a skill with copies linking from its first folder;
- a name in a path or URL, and a skill's own name, are no link;
- a sentence's forms and kinds are read over every name in it, whether or not each names a reported skill, and over the visible text of its paragraph or list item, whatever its line breaks, a line continuing a quote's paragraph without `>` and a line opening with an inline tag or an autolink included, a Markdown link read as its text, steering words looked for in at most the 4,000 characters before a name;
- one link is reported per step and target, calls before mentions;
- a backticked slash command in a sentence saying skill, command, slash or type, naming no reported skill and no command of the agent itself, and a backticked name followed by the word skill and a name in `Skill(…)`, naming no reported skill, are reported as unresolved, each of the kind its form and sentence would give a link to a reported skill.

#### skill-atlas-4

When a skill is scanned, the scanner shall attach to each step every tag whose rule matches a line of the step, with up to three matching lines as evidence, and to the skill the union of its steps' tags and those of its description and its body outside every step:

- rules are read at each scan from the skill's tag rules file, or from the file `--rules` names, each a tag id of a category — `input`, `output`, `tool` or `human` — a label and patterns;
- a match after a negation in its own clause is no evidence, except for a rule that says otherwise;
- each tool the frontmatter's `allowed-tools` names adds the tags that tool implies, and each MCP tool name in the text a tool tag of its server;
- a pattern that is no valid expression is skipped with a warning.

#### skill-atlas-5

When a scan completes, the scanner shall report as insights each name differing skills go by [[skill-atlas-33](#skill-atlas-33)], with the folders where each goes by it, unresolved link with its kind and its first call's line where it is called, group of skills calling one another in a cycle with every skill of it, `SKILL.md` over 500 lines, missing description, unreadable frontmatter, name differing from its folder, skill with no steps, translation behind its source with the state folder's file its refresh is written to and the command pinning that file, translation edited apart from its source with the command pinning it, annotation written from another text of its skill, and translation whose steps number otherwise than its skill's, a translation's repair given as data as well as in words, each with its level, a problem where the reader must act on it and a note where not:

| Level | Insights |
| --- | --- |
| problem | an unresolved link of the calls kind, a cycle, unreadable frontmatter, a translation behind its source or edited apart from it, an annotation written from another text, a translation whose steps number otherwise |
| note | a name differing skills go by, an unresolved link of the mentions kind, a `SKILL.md` over 500 lines, a missing description, a name differing from its folder, a skill with no steps |

#### skill-atlas-6

Where the state folder holds an annotations file, when a scan runs, the scanner shall apply the file's entries after detection and mark each result as an annotation's:

- an entry may set a skill's summary, replace its steps, and add or remove tags and links, for the skill or one step;
- a link's target given by name is the skill a detected link from the same skill reaches [[skill-atlas-3](#skill-atlas-3)], and one given by an id that is no name, that skill;
- an entry may give its summary and its steps' titles and summaries again under a language's tag, reported under that tag over the words of a file's translation under the first tag in order of the same language and script;
- a key is a skill's name, serving every skill of the name with no key of its own id, or a skill's id, and holds one entry or a list of them;
- a skill whose steps are replaced keeps the tags and links its former steps held, at the skill, one link per target, calls before mentions;
- an entry recording the digest of the `SKILL.md` it was written from, and of each other file of the skill it was written from, is applied only to a skill whose files have those digests, the scan reporting each skill's `SKILL.md`'s;
- of a key's entries recording a skill's `SKILL.md` digest the last is that skill's, superseding the earlier ones, and where it is not applied the skill's annotation is reported stale with no earlier entry applied, so skills of one name whose `SKILL.md` are the same are told apart only by a key of each one's id;
- a skill none of a key's entries records the digest of takes the key's last entry recording none where the key is the name it is reported under or its id, and is otherwise reported stale where one of the entries records a digest no skill of the name has;
- an entry naming no reported skill is ignored with a warning;
- an unreadable file is ignored with a warning.

#### skill-atlas-7

When `scan --summary` is invoked, the command shall print in place of the atlas a plain-text digest: the number of problems and of notes [[skill-atlas-5](#skill-atlas-5)], the skills in each scanned folder, the most linked skills, each unresolved link with its kind, the calls and the mentions counted apart, name differing skills go by with their folders [[skill-atlas-33](#skill-atlas-33)], cycle, and skill whose steps were not detected, and every other problem, then every other note.

#### skill-atlas-33

When a scan completes, the scanner shall report with each skill the other reported skills going by a name it goes by, which differ from it [[skill-atlas-1](#skill-atlas-1)], a skill going by its declared name in each of its folders and by `<plugin>:<name>` in a plugin's, naming no agent and ranking none of them over another.

### Server

#### skill-atlas-8

When `serve` is invoked, the server shall scan, listen on the loopback interface alone, print one line of JSON holding the page's URL, and open the URL in the browser unless `--no-open` is given:

- the port is `--port`'s, else the default, else a free one where the default is taken.

#### skill-atlas-9

When the server receives a request, the server shall refuse it unless its `Host` is `127.0.0.1` or `localhost` with the server's port and, where it changes state, it carries the page's own header and a JSON content type.

#### skill-atlas-10

When the page asks for a file of a skill, the server shall return its text only where the file lies inside that skill's real folder, holds text, and is at most 512 KiB:

- asked in a language, the server returns the file's translation under that tag, else under the first tag in order of the same language and script, [[skill-atlas-27](#skill-atlas-27)] under the same bounds, saying whether it is behind its source or edited apart from it, else the file itself, saying it is the original, and in either case the relative path of the file returned;
- a file is named by the path asked, its translations, its language and the path returned following that name, and read from wherever a link there leads inside the folder.

#### skill-atlas-11

When the page asks to rescan, the server shall scan again, reading the rules and the annotations as they then stand, and return the new atlas.

#### skill-atlas-12

When the page saves the workflows document, the server shall write it to the state folder only where it has the workflows shape and the stored file is the version the page last read:

- a document of another shape is refused and the stored file stands;
- a document sent over 1 MiB, or over it as it would be stored, is refused and the stored file stands, and a stored file over it as a save would store it cannot be read as a workflows document, so every document read can be saved again as it was served;
- a save against a file changed since is refused and the stored file stands, the check and the write being one step among every server sharing the state folder;
- a stored file that cannot be read as a workflows document is reported as such, never as empty, and is replaced only on the page's explicit request, the file kept beside it under another name.

### Page

#### skill-atlas-13

While the page shows an atlas, the page shall present groups holding skills holding steps, each opened or closed by the reader, with every dependency drawn between the innermost shown ends:

| Grouping | Groups |
| --- | --- |
| Workflow | the active workflow's phases in order, then the skills in no phase; with no workflow, the presets to start one from where workflows can be edited |
| Dependencies | skills that call others and are called by none, each further call depth, skills called only within a cycle, then skills with no dependency |
| Source | the scanned folders, a skill under its own and each copy's |

- a dependency is a call [[skill-atlas-3](#skill-atlas-3)], a mention being neither drawn, listed nor counted anywhere on the page;
- a skill states how many skills it depends on, how many use it, how many steps it has and how many tags of each category, each only where it is not zero, and the number of folders it is installed in where that is more than one, naming those folders;
- a skill with a problem [[skill-atlas-5](#skill-atlas-5)] is marked, and the control opening the insights counts the problems alone.

#### skill-atlas-37

When the reader uses the steps control, the page shall close every shown skill where any is open, else open the steps of every shown skill having steps, leaving the groups as they are, the control saying which it will do and unavailable where no shown skill has steps.

#### skill-atlas-14

When the reader selects a skill, a step or a phase, the page shall show what it holds, its tags by category, and the skills it depends on and that use it, in a panel open only until the reader closes it or clears the selection, focus then returning to what was selected, the card it was selected on where a skill has several:

- a skill's and a step's tags each with its evidence, a phase's tags the union of its skills' each with the skills it comes from;
- a skill's problems, and apart from them its notes [[skill-atlas-5](#skill-atlas-5)];
- a skill's frontmatter as its properties, a value holding fields shown one field to a row, one level deep, a deeper value as plain text;
- a skill's other skills of its name [[skill-atlas-33](#skill-atlas-33)], counted and each named by its folder, in one short note raising no issue.

#### skill-atlas-15

When the reader follows a dependency from a step or from a skill's details, the page shall open the target's group, bring the target into view and select it.

#### skill-atlas-16

While a search, a tag filter or a focus on one skill is set, the page shall show only the skills matching all of them, a focus matching the skill and every skill it depends on or that depends on it through any number of calls.

#### skill-atlas-17

When the reader opens the insights, the page shall list the atlas's problems by kind, then its notes by kind under a heading of their own [[skill-atlas-5](#skill-atlas-5)], each saying what to do wherever the scanner's message does, and select an insight's skills on its choice:

- a translation's repair names, for each file, where its refresh is written and the skill folder's file that may be brought in line instead, and the command pinning them, the scanner's own message shown where the insight gives no repair as data;
- a name differing skills go by [[skill-atlas-33](#skill-atlas-33)] names how many versions it has and each folder where one goes by it with a control copying its path, and says that an agent reading more than one of those folders picks one by its own rules;
- an unresolved link of the mentions kind is not listed.

#### skill-atlas-34

When the reader compares two differing skills of one name from the name's insight or a skill's note on the served page, the page shall show their `SKILL.md` texts side by side with each differing line marked and no line alike in both marked, until the reader closes it, focus returning to where it was opened:

- where the name has more than two differing skills [[skill-atlas-33](#skill-atlas-33)], each side chooses its skill among them all;
- a space, a tab or a carriage return ending a differing line is shown;
- texts the same in both are said to be so, the skills differing in their other files;
- where too many lines differ to pair them in bounded work, the lines between the alike start and end are shown unmarked and said to be so.

#### skill-atlas-35

While skills are selected, a skill, a phase's skills or an insight's, or a skill's card holds focus, the page shall draw those skills' dependencies at full strength and every other dependency dimmed, a pointer resting on a card changing neither.

#### skill-atlas-36

When the reader opens the help, the page shall show the legend of its marks, a tag category's, a dependency's and a problem's, and the keys and gestures it answers to, those editing only where workflows can be edited, until the reader closes it, focus returning to the control that opened it.

#### skill-atlas-18

While the page shows an atlas, the page shall show every string read from a skill as text, never as markup.

#### skill-atlas-38

While the page shows an atlas, each of its controls shall say what it does, and whether it is open or busy, to the keyboard and to assistive technology as to the eye, its name to assistive technology holding the words it shows.

#### skill-atlas-39

While the page is shown at a phone's width, the page shall fit its controls without sideways scroll, each at least 24 pixels across.

### Workflows

#### skill-atlas-19

Where the page is served, when the reader edits a workflow on the page, the page shall save the workflows document with the change:

- a workflow is created blank or from a preset, renamed, duplicated and deleted;
- a preset, where the reader asks it to place skills, puts each skill into the one phase whose keyword occurs earliest in the skill's name, else in its description, the earlier phase on a tie, a keyword matching at a word's start and one of three characters or fewer as a whole word;
- a phase is added, renamed, reordered, noted and deleted;
- a skill is put into a phase, moved between phases and removed by dragging or by a menu, and may sit in several phases;
- a phase holds skill ids, and an id no reported skill has is shown as missing;
- the document is kept as it was read with the reader's changes alone, what the page shows for a field left unset, such as the workflow shown while none is active or the word for an empty name, never written into it;
- the latest edit alone can be undone, whichever edit it was, until the next.

#### skill-atlas-20

When a save is refused because the stored workflows changed, the page shall stop saving, say that the last edit was not saved, and allow no workflow edit until the reader loads the stored workflows.

#### skill-atlas-21

While the stored workflows file cannot be read, the page shall name the file, allow no workflow edit, and offer to start fresh with the file kept.

#### skill-atlas-31

When `workflows` is invoked, the command shall print the stored workflows document with its version, and with `--put` write the document given to it under the conditions of the server's save [[skill-atlas-12](#skill-atlas-12)], the version being the one `--if-match` names and a document over the server's limit refused.

#### skill-atlas-32

When `digest` is invoked with files, the command shall print each file's digest as annotations and translations record it:

- where a file cannot be read, every readable file's line is still printed whole, the unreadable ones are named on stderr, and the command fails.

### Export and settings

#### skill-atlas-22

When `export` is invoked, the command shall write the page as one file holding the atlas, the workflows, the settings and the catalogs, opening in `--lang`'s language, in which no held value can end the page's data element, and which opens with no server and shows the atlas and its workflows with no control editing a workflow, saying it is read-only.

#### skill-atlas-23

When the page loads, the page shall take its workflow presets and its view settings from the skill's `references/` files, their labels in a language from the files named `<name>.<tag>.json` beside them and beside the tag rules, and its catalogs from `assets/locales/`, as they then stand:

- a label file has its source's shape, and gives a tag's, a category's, a preset's and a phase's label, name and description, and the page's title, by id, a preset's phases by position.

### Languages

#### skill-atlas-27

When a skill is scanned, the scanner shall report each translation of the skill's `SKILL.md` under its language's tag, with its frontmatter, its steps' titles and text, and whether it is behind its source or edited apart from it:

- a file's translation into a language is the file beside it named with the language's tag before the extension, in the skill's folder, else under `translations/<skill id>/` of the state folder, under one tag the state folder's first where the skill's own is behind its source and the state folder's records its source's digest, and never a file that is its source itself through a link;
- a translation's steps are read as a skill's [[skill-atlas-2](#skill-atlas-2)] and reported only where they number as the skill's;
- a translation is behind where the source's digest it records is not its source's, and edited where its own digest it records is not its own, a Markdown translation alone recording its own; one recording none is neither;
- a translation is listed among no skill's files, and adds no link and no tag.

#### skill-atlas-28

When `pin` is invoked with translations or folders holding them at any depth, hidden and linked folders included, the command shall record in each translation the digest of the file it translates, and in a Markdown one its own, in a comment line of a Markdown file and a key of a JSON one:

- `pin --check` changes no file, names each translation that is behind, edited or records no digest, and fails where there is one;
- a translation in the state folder whose skill the scan does not report, a folder named holding no translation, a folder that cannot be read whole, and one file reached as the translation of two different sources, are named and fail the command before any file is written;
- a file that is its source itself through a symbolic or a hard link is no translation: passed over in a folder, refused where named, and never written;
- what a translation translates is told from the name it is reached by, and one that is, through any link, the same file as a source of the run or as a file that is no translation of its source in a folder the run involves — a folder named, the skill a state translation belongs to, the skill folder or folder holding the translation, and, where a name of it is found in none of those, every scanned skill's folder — a file of the state folder whose name names no translation being no skill's, or that has a hard link found in none of them, is named with that file and fails the command before any file is written.

#### skill-atlas-29

While the page shows an atlas, the page shall present its own text, the labels of tags, categories and presets, and each skill's description, frontmatter values, steps and files in one language — the reader's choice kept in the browser, else `--lang`'s, else the browser's where it is offered, else `en-US`:

- the languages offered are `en-US` and each language with a catalog;
- the control choosing the language shows the shown language's short name, its catalog's, else its tag's primary subtag in capitals, and opens a menu of every offered language in its own name, the one shown checked;
- the page's language among those offered, each of its label files among that file's and a skill's translation among the skill's are each the one under the tag asked, else under the first tag, in order of the tags themselves, of the same language and script;
- the page's text in a language is its catalog's entry under the English text, and the English text where the catalog has none;
- a skill's frontmatter keys are shown as they stand, each value as its translation's where the translation gives that key, else as the original's;
- a file is shown under the name of the file returned [[skill-atlas-10](#skill-atlas-10)];
- a skill with no translation in the language is shown in its original, and marked as such where the reader opens it, its language, which the scan reports, being the one its frontmatter's `metadata.language` names, else Chinese, Japanese or Korean by the script most of its words are in, else English where they are in Latin script, else unknown and marked in every language, a file's language being told from its own words, and another than the page's where their primary subtag or script differs; a translation behind its source or edited apart from it is shown and marked, an edited one as text agents do not follow;
- a search matches a skill's text in the language shown and in its original;
- a workflow's and a phase's name and note are shown as typed.

#### skill-atlas-30

When the reader chooses a language on the page, the page shall show the atlas in that language at once, keeping what is open, selected, filtered and unsaved.

## Verification

#### skill-atlas-24

When the command is run against skill folders built for the test, the test shall assert:

- skills found across agent folders and one folder below, a linked folder and an identical copy once, a copy differing in a bundled file apart, a differing skill of the same name under its second id, `--agent codex` keeping `.agents/skills` and Codex's `.system`, `--agent universal` leaving out the project's `skills`, the home folder's `.config/agents`, `.config/goose`, `.copilot` and `.codeium/windsurf` skills each kept by its agents, a link in one copy alone or of another text keeping copies apart, a plugin disabled by the project's settings left out, a folder's above `--cwd` included and a nearer folder's value winning, the folders above `--cwd` up to its repository's root scanned nearer first, each one's `skills` among them, and none with no repository, a repository scanned from its root and from folders in it, one reached through a link included, giving the folders all cover the same root and skill ids, a working folder reached through a link finding the folders above its real place with the same ids, two folders whose paths differ only in where a hyphen or a folder boundary falls told apart from any folder, a folder's skills linked to another's, each folder two rows name by one path listed once, a `--root` and `CLAUDE_CONFIG_DIR` naming a project's folder below the repository's root, an empty folder added beside one, a `--root` reached through a link, in another letter case or twice, the order of `--root`s and of plugin installs, and a plugin beside another install changing no root's or skill's id, a second skill of a name named by its own name, root and folder whatever other skills of the name but the first are removed and the first's removal giving the next the name, a name no folder can hold given its digest, names differing in letter case alone given ids differing otherwise, `XDG_CONFIG_HOME` standing for `.config`, unreadable frontmatter kept with each field that reads standing, a declared language among them, a flow collection closed at its key's column read, and no file changed [[skill-atlas-1](#skill-atlas-1)];
- steps for each of the three texts, a heading inside fenced code ignored, and a list opening the body after a quoted note [[skill-atlas-2](#skill-atlas-2)];
- calls and mentions with their step and line, a path, a URL and a bare word yielding none, two skills in one sentence the one steered away from, first or second, as a mention and the other as a call, a call from a copy's folder resolved to its sibling, a name several skills hold reaching the caller's sibling, else the first in the scanner's order, and `<plugin>:<name>` that plugin's skill, each unresolved form, a backticked name before the word skill unresolved after any word, `Skill(…)` naming an agent's command unresolved, `$name` after a verb of use a call, each joined to it after that verb a call too, steered a mention, and with no verb, naming no skill or in a path or URL nothing, each verb of use negated steering every form, an unresolved name steered away a mention and one after a verb of use a call, and a list holding a name no skill has, a clause opening with but or but instead, a clause after `, instead`, and `, not`, `and not` and `and never` before a `$name` each read as the sentence says, a sentence wrapped over lines, in a list item or a quote, a quote's line without `>`, a line opening with an inline tag or an autolink, a paragraph past 4,000 characters, or naming its names as Markdown links read as one with each link's own line as evidence, a negation over a sequence steering both names, and a new list item or paragraph a sentence of its own [[skill-atlas-3](#skill-atlas-3)];
- tags with evidence from rules, from `allowed-tools` and from an MCP tool name, rolled up to the skill, a negated match left out, and an edited rules file taking effect on the next scan [[skill-atlas-4](#skill-atlas-4)];
- each insight kind, a cycle's naming every skill of its group, one insight per name differing skills go by, naming the folders where each goes by it, none for two plugins' skills of one bare name, a name mentioned and later called a call with the call's line, and each insight's level, an unresolved call a problem and an unresolved mention and a name with differing skills a note [[skill-atlas-5](#skill-atlas-5)];
- each of two differing skills of one name in the home folder's `.agents/skills` and `.claude/skills` naming the other, a plugin's skill sharing no name with another plugin's or a differing skill of none, a plugin's skill byte for byte a skill of none, a plugin's skill folder linked to one and a plugin's skills folder linked to a scanned folder each a copy of it, reached as `<plugin>:<name>`, under the ids it has without the plugin and with the plugin's folder never listed under the name a differing skill of none shares, and no agent named in what the atlas says of them [[skill-atlas-33](#skill-atlas-33)];
- an annotation's summary, steps, tags and links applied and marked, a link added or removed by name reaching the skill a detected link from its skill reaches and by id the skill named, a removal by a name another skill has as its id removing no link to that skill, replaced steps' tags kept and their links one per target, a call over a mention, an unresolved name too, with the call's line, an entry recording another `SKILL.md` digest not applied with its words under a language, an entry listing other files applied only where each has its digest, a changed, missing or outside one never, of a name's several entries the last recording its digest applied whatever files the earlier list, and where a file it lists changed none applied and the skill stale, else the last recording none, each differing skill of the name given the entry recording its digest, skills of one name sharing their `SKILL.md` given under the name the last entry recording it, the one whose files differ stale, and each its own under keys of their ids, and each stale only where none applies and one was written for it, and an unknown name and an unreadable file warned of [[skill-atlas-6](#skill-atlas-6)];
- the digest's sections, its unresolved calls and mentions counted and said apart, its numbers of problems and notes as the atlas's levels count them, each other problem and note listed under its level alone, and each name differing skills declare listed with their folders [[skill-atlas-7](#skill-atlas-7)];
- steps from Chinese headings [[skill-atlas-2](#skill-atlas-2)];
- a translation in the skill's folder and one in the state folder reported with frontmatter, description and steps, the folder's first, one with other steps reported without them, one behind its source and one edited apart from it each marked, the state folder's reported where only the skill's is behind and it records its source's digest, one recording none never, none listed as a file or a skill, and tags and links unchanged by them [[skill-atlas-27](#skill-atlas-27)];
- an annotation's summary and step titles under a language's tag, reported under exactly that tag over its own entry, else over a copy of a file's under a tag of the same language and script with the file's entry unchanged, else alone [[skill-atlas-6](#skill-atlas-6)];
- each skill's language, its declared one first, in a flow mapping as in the block form, Chinese, Japanese, Korean, English and unknown told from its text outside fenced code [[skill-atlas-29](#skill-atlas-29)];
- `workflows` printing the stored document with its version, `--put` writing one against that version and printing the new one, a document holding its own `error` field written, and refusing one against a changed file, an invalid one, one over the limit and one while the lock is held, the stored file standing [[skill-atlas-31](#skill-atlas-31)], one over the limit only as it would be stored refused and a stored file over it reported [[skill-atlas-12](#skill-atlas-12)];
- `digest` printing each file's digest of its bytes, and, through a pipe past 64 KiB, every readable file's line whole before failing on a file it cannot read, named on stderr [[skill-atlas-32](#skill-atlas-32)];
- insights for a translation behind its source, for one edited apart from it, each repair given in the insight's params with the command its message gives, each repair command run as given from another folder for a skill found through `--root` with a translation's path holding a space, a skill folder's one behind its source refreshed into the state folder and that file pinned, the installed one unchanged, and for one of other steps [[skill-atlas-5](#skill-atlas-5)];
- `pin` recording a digest in a Markdown and a JSON translation, a Markdown one's own digest recorded, `pin --check` failing on one behind, on one edited and on one with none, changing no file, and both commands failing on one in the state folder of a skill not reported, on one there under no skill's folder, on a folder holding none and on a folder not read whole, a folder walked at every depth with hidden folders but not `.git` or `node_modules`, a folder linked in twice and a link loop walked once, both commands failing on a link they cannot follow, a file its source links to, symbolically or hard, passed over in a folder, refused where named and never written, a translation that is the same file as the source of another translation, in its skill or another's, as a skill's `SKILL.md`, its own skill's or another scanned skill's, beside its own source or not, or as a translation of another source, in the state folder too, failing both commands, naming both files, and one hard-linked to a file under `node_modules` or outside every folder read failing them too, with no file written, two names translating one source pinned as one, a state folder's translation linked to a file of another name there pinned as translating the file its own name names, as the scan reads it, and one file reached as the translation of two sources failing both commands, naming both, with no file written [[skill-atlas-28](#skill-atlas-28)].

#### skill-atlas-25

When the server is started on a free port by the test, the test shall assert:

- the printed URL answering with the atlas [[skill-atlas-8](#skill-atlas-8)];
- a foreign `Host` and a change without the header refused [[skill-atlas-9](#skill-atlas-9)];
- a skill's file returned, a path outside its folder refused, and a file asked in a language returned as its translation from the skill's folder, as the state folder's, as one under a tag of the same language and script and never of another script, as the state folder's where only the skill folder's is behind its source and the state folder's records its source's digest, never one recording none, under the tag asked or else the first of its language and script with folders compared within that tag alone, as the scan reports it for that tag, and as the original where there is none, each with its path, a file asked through a link translated, its language told and named by the name asked [[skill-atlas-10](#skill-atlas-10)], and a file its source links to no translation, in the scan as in the file returned [[skill-atlas-27](#skill-atlas-27)];
- a skill added after the start reported by a rescan [[skill-atlas-11](#skill-atlas-11)];
- a saved document returned and standing in the state folder, a malformed one and one against a changed file refused with the stored file standing, and an unreadable stored file reported and replaced only on request with the file kept, of two servers' saves against one version one written and one refused, a held lock refusing a save and a stale one broken, of three servers' saves against one version over a stale lock one written, and a document under 1 MiB sent but over it as stored refused while a document read saves again [[skill-atlas-12](#skill-atlas-12)], and a document at the limit as stored, with no workflow active, an empty name and no notes, kept by the page's own reading as it was served and saved again [[skill-atlas-19](#skill-atlas-19)];
- an exported file holding the atlas, the catalogs and `--lang`'s language with no text able to close its data element and a value holding `$&` kept as written [[skill-atlas-22](#skill-atlas-22)];
- an edited presets file, an edited label file and an edited catalog returned by the next read of the settings [[skill-atlas-23](#skill-atlas-23)];
- every text the page looks up present in the `zh-CN` catalog and no other, an original file returned with the language of its own text, and the page's catalog and label files chosen, from tags their file names order otherwise, by the rule a skill's translation is, each label file under its own tag [[skill-atlas-29](#skill-atlas-29)].

#### skill-atlas-26

When the page is opened in a browser against the server over skill folders built for the test, the journey shall assert:

- each grouping's groups, a project's folder above the working folder grouped and named apart from the working folder's, a skill opened to its steps, a dependency re-anchored to a closed group, a mention neither drawn, counted nor listed, a card's counts of the skills it depends on and that use it, of its steps and of each category of its tags, each only where not zero, the categories named with their counts, and of the folders it is installed in, each folder named alike to the eye and to assistive technology, its name holding the count it shows, a problem marking its skill and counted where a note does neither, and the served page with no workflow left by a refused deletion offering its presets [[skill-atlas-13](#skill-atlas-13)];
- the shown cards' steps opened and closed together with a closed group left closed, a card with no steps opened by hand closed by it, and nothing to open where no shown card has steps [[skill-atlas-37](#skill-atlas-37)];
- Rescan named and busy while it scans, Help saying it opens a dialog, and the language control named by the short name it shows [[skill-atlas-38](#skill-atlas-38)];
- at a phone's width the toolbar's controls each 24 pixels or more with no sideways scroll [[skill-atlas-39](#skill-atlas-39)];
- a skill's and a step's details with tags and evidence, a skill's notes, a property holding fields shown a field to a row, a phase's with each tag's skills, a skill's other versions of its name in one agent's folders, two agents' folders and the project's source each noted alike by folder, naming no agent and marking no problem, no control opening the details, which are closed with nothing selected, open on a skill's, a phase's and an insight's selection, and close by their Close and by Escape with focus back on what was selected, and on the card it was selected on of a skill in two phases, by F6 too, and each of three versions noting the other two [[skill-atlas-14](#skill-atlas-14)];
- the help showing the legend and the keys, closed by Escape and by its Close with focus back on its control and by a click elsewhere, and the exported page's naming no key or gesture that edits [[skill-atlas-36](#skill-atlas-36)];
- a followed dependency selecting its target [[skill-atlas-15](#skill-atlas-15)];
- search, a tag filter and a focus narrowing the skills shown [[skill-atlas-16](#skill-atlas-16)];
- an insight's choice selecting its skills, the problems listed before the notes and the notes alone leading the panel, and frontmatter in error said to keep the fields that read, the folder naming the skill only where its name does not, a translation's repair shown with where its refresh is written and the command pinning it, and a name with differing versions listed among the notes in one insight naming how many, each folder with a control copying its path and the agent's own rules, the exported page's alike, and an unresolved call listed with an unresolved mention not [[skill-atlas-17](#skill-atlas-17)];
- two skills compared from a name's insight and from a skill's note, the differing line marked and no other, any two of three versions compared from each one's note, two texts of 2,002 lines differing in their first and last line showing those two lines alone as differing, two texts too far apart to pair shown with no line marked and said to be so, a carriage return ending a differing line shown, versions whose `SKILL.md` is the same said to differ in their other files, and closed by Escape with focus returned, the exported page offering no comparison [[skill-atlas-34](#skill-atlas-34)];
- a selected skill's dependencies, an insight's skills' all of them, and then a focused one's at full strength and the others dimmed, with nothing selected none dimmed, and a pointer on a card changing nothing, in the light and the dark theme [[skill-atlas-35](#skill-atlas-35)];
- a skill whose name and step hold markup shown as text [[skill-atlas-18](#skill-atlas-18)];
- a workflow made from a preset with its skills placed, a phase added and renamed, a skill moved by the menu, an edit undone, a menu's edit undone by the keyboard after its notice has gone, an edit saved as the page is hidden followed by a further edit saved, and the result standing after a reload [[skill-atlas-19](#skill-atlas-19)];
- a file changed behind the page refusing the next edit with the file standing [[skill-atlas-20](#skill-atlas-20)];
- an unreadable file named, and started fresh with the file kept [[skill-atlas-21](#skill-atlas-21)];
- an exported file opened from disk showing its workflows with no control editing a workflow, a phase or a skill's place, saying it is read-only, its grouping, steps, search and details still at work [[skill-atlas-22](#skill-atlas-22)];
- a browser of Chinese opening the page in Chinese with its chrome, tag labels and presets, a translated skill's description, frontmatter values, steps and file in Chinese with the file named as its translation, an untranslated skill in its original and marked, a translation behind its source and one edited apart from it each marked, a skill written in Japanese, one in English quoting Chinese, and one declaring Traditional Chinese marked as original, one in Chinese holding a katakana middle dot not, a skill in Cyrillic and one described in English and written in Arabic with no steps marked as original in their details and their files alike on the English page, a skill folder's `zh` translation behind its source shown and marked over a current `zh-Hans` one, and a state folder's current `zh` one shown over the skill folder's in the card, the details and the file alike, a file marked by its own language, an atlas reporting no language marking nothing, and a search for a step's text in either language finding the skill [[skill-atlas-29](#skill-atlas-29)];
- the language control showing the shown language's short name and opening a menu of each language in its own name, the shown one checked, worked by the keyboard and closed by Escape and by a click elsewhere [[skill-atlas-29](#skill-atlas-29)], and a language chosen from it applied with the open skill, the selection and the filter kept, and standing after a reload [[skill-atlas-30](#skill-atlas-30)].
