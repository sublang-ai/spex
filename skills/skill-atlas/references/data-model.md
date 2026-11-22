<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Skill Atlas data model

The three JSON documents Skill Atlas reads and writes.
Read this file before editing `annotations.json` by hand, changing `workflows.json` through `atlas.mjs workflows`, or consuming `atlas.json` from another tool.

## Contents

- [Files and where they live](#files-and-where-they-live)
- [atlas.json — what the scan found](#atlasjson--what-the-scan-found)
- [annotations.json — corrections layered on the scan](#annotationsjson--corrections-layered-on-the-scan)
- [workflows.json — how the user organizes skills](#workflowsjson--how-the-user-organizes-skills)
- [Languages](#languages)
- [Detection rules](#detection-rules)

## Files and where they live

| File | Written by | Read by | Location |
| --- | --- | --- | --- |
| `atlas.json` | `atlas.mjs scan` | viewer, agent | stdout, or `--out <file>` |
| `annotations.json` | agent or user | `atlas.mjs scan` | state directory |
| `workflows.json` | viewer (or user), agent through `atlas.mjs workflows` | viewer, agent | state directory |

The state directory is `~/.skill-atlas/` unless `--state <dir>` names another, for example `.skill-atlas/` inside a repository a team shares.
Every skill is keyed by its id — its `name`, or `<name>@<rootId>` for a differing skill of the same name — never by a path, so both state files survive a reinstall or a move.

## atlas.json — what the scan found

```jsonc
{
  "version": 1,
  "generatedAt": "2026-11-21T08:00:00.000Z",
  "cwd": "/abs/project",
  "roots": [
    {
      "id": "project-claude",          // stable slug, unique in this file, naming the folder's place in the repository: "project-claude-packages-ui" for packages/ui's
      "path": "/abs/project/.claude/skills",
      "scope": "project",              // project | user | plugin | extra
      "agent": "claude-code",          // agent that loads this folder, or "universal"
      "label": "Project · Claude Code",
      "skillCount": 3
    }
  ],
  "tagCatalog": [                      // every tag id used below, static or dynamic
    { "id": "tool.shell", "category": "tool", "label": "Shell" }
  ],
  "skills": [
    {
      "id": "code",                    // equals name; "<name>@<rootId>" for the 2nd+ differing skill of one name
      "name": "code",
      "description": "…",
      "root": "project-claude",
      "plugin": null,                  // plugin name when scope is "plugin"
      "dir": "/abs/project/.claude/skills/code",
      "file": "/abs/project/.claude/skills/code/SKILL.md",
      "digest": "9b90c1…",             // SHA-256 (hex) of SKILL.md's bytes; null when it cannot be read
      "language": "en",                // the language SKILL.md is written in (see Languages); "und" when unknown
      "copies": [                      // other folders holding this same skill, byte for byte
        { "root": "user-codex", "dir": "/home/me/.codex/skills/code" }
      ],
      "frontmatter": { "name": "code", "description": "…", "allowed-tools": "Bash Read" },
      "lines": 84,                     // SKILL.md line count
      "summary": null,                 // one sentence, set only by annotations
      "files": [                       // bundled files, SKILL.md excluded, at most 200
        { "path": "references/coder-phases.md", "kind": "reference", "linked": true }
      ],                               // kind: reference | script | asset | other; linked: SKILL.md mentions the path
      "stepKind": "step",              // step | section | none — how `steps` was derived
      "steps": [
        {
          "id": "code#2",              // "<skill id>#<index>"
          "index": 2,                  // 1-based
          "title": "Run the phases",
          "line": 31, "endLine": 52,   // 1-based, inclusive, in SKILL.md
          "excerpt": "Plain text of the step, at most 400 characters…",
          "tags": [ /* TagHit */ ],
          "calls": ["review"]          // skill ids this step links to (any edge kind)
        }
      ],
      "tags": [ /* TagHit: union over frontmatter, preamble and steps */ ],
      "issues": ["oversized"]          // see insights kinds
    }
  ],
  "edges": [
    {
      "from": "code", "fromStep": "code#3",   // fromStep is null for a link outside every step
      "to": "review",
      "kind": "calls",                 // calls | mentions
      "source": "scan",                // scan | annotation
      "evidence": { "line": 44, "text": "…invoke the `review` skill once…" }
    }
  ],
  "unresolved": [                      // a link to a skill that is not installed
    { "from": "dev", "fromStep": "dev#2", "name": "branch", "evidence": { "line": 12, "text": "…" } }
  ],
  "insights": [
    { "kind": "duplicate-name", "skills": ["code", "code@user-claude"], "message": "…" }
  ]
}
```

A `TagHit`:

```jsonc
{
  "id": "human.approval",
  "category": "human",                 // input | output | tool | human
  "label": "Needs approval",
  "source": "rule",                    // rule | frontmatter | annotation
  "evidence": [ { "line": 40, "text": "Wait for the user's approval before…" } ]   // at most 3
}
```

Insight kinds: `duplicate-name`, `unresolved-link`, `cycle`, `oversized` (SKILL.md over 500 lines), `missing-description`, `name-mismatch` (frontmatter `name` differs from the folder), `invalid-frontmatter` (a field of the frontmatter does not read: that field is left out and every other stands, the folder naming the skill only where `name` does not read), `no-steps`, `stale-annotation` (an `annotations.json` entry written from another text of the skill, not applied).

One skill installed for several agents — a folder linked into several roots, or copied with every file byte for byte the same (the same relative paths, translations included) and every link inside it of the same link text — is one record listing the others under `copies`.
A folder too large to list whole (over 5,000 files or 2,000 folders), holding over 64 MiB, a link leading out of it or an entry that cannot be read, counts as differing.
Only skills of one name whose folders differ are a `duplicate-name`.

## annotations.json — corrections layered on the scan

The scan is pattern matching; this file is where a reader who understood the skill corrects it.
`atlas.mjs scan` applies it after detection, and marks everything it adds with `"source": "annotation"`.

```jsonc
{
  "version": 1,
  "skills": {
    "code": {
      "source": { "sha256": "9b90c1…",     // optional; the `digest` of the SKILL.md this entry was written from
                  "files": { "references/phases.md": "5e1f0a…" } },   // optional; each other file it was written from, by `atlas.mjs digest`
      "summary": "Implements a request as one commit per phase, then has it reviewed once.",
      "steps": [                       // optional; replaces the detected steps entirely
        { "title": "Classify the request", "summary": "New intent or an existing IR?" },
        { "title": "Run the phases", "summary": "One commit per phase." }
      ],
      "addTags":    [ { "id": "human.question", "step": 1, "note": "asks when the request is unclear" },
                      { "id": "output.commit", "step": 2, "note": "one commit per phase" } ],
      "removeTags": [ { "id": "tool.browser" } ],          // "step" omitted: everywhere in the skill
      "addCalls":    [ { "to": "review", "step": 3, "kind": "calls", "note": "after the final phase" } ],
      "removeCalls": [ { "to": "pdf" } ]
    }
  }
}
```

- `step` is the 1-based step index; omit it to address the skill as a whole.
- A `steps` entry carries a `title` and a `summary`; give the new steps' tags and links through `addTags` and `addCalls` with `step` and `note`, which apply after the replacement.
  (`tags` and `calls` lists inside a `steps` entry are still read, for tolerance.)
- A replaced step has `line` and `endLine` null and its `summary` as its `excerpt`; the tags and links the scan found in the former steps stay on the skill as a whole (`fromStep` null), one link per target, `calls` before `mentions`.
- A tag id absent from `tag-rules.json` is accepted when it has the form `<category>.<slug>`; its label is the slug.
- An entry naming a skill that is not installed is ignored and reported on stderr.
- A skill's value may be one entry or a list of entries, each written from another text of the skill: `"code": [ { "source": { "sha256": "9b90c1…" }, … }, { "source": { "sha256": "41d07e…" }, … } ]`.
- Of the entries whose `source` digest is its skill's `digest` and each of whose `source.files` has the digest recorded, the one listing the most files applies, the later on a tie, else the first recording none; an entry recording another digest is not applied, its `translations` words included.
  A listed file that is missing, outside the skill's folder or unreadable does not match; only the listed files are read, and only for a skill with such an entry.
  `atlas.mjs digest <file>...` prints one line per file, `<sha256 hex>  <path>`, the digest of its bytes exactly as `source` and a translation's record hold it.
  Under a name, an entry recording the digest of a differing skill of that name (`<name>@<rootId>`) applies to that skill, unless the file has an entry under its own id; an entry recording none stays with the first.
  Each skill of the name is judged on its own: one that no entry applies to reports a `stale-annotation` insight where an entry records its `digest` (a listed file has changed) or a digest no skill of that name has, since the state folder serves every project and such an entry may have been written for an earlier text of any of them.

## workflows.json — how the user organizes skills

```jsonc
{
  "version": 1,
  "active": "sdlc",                    // id of the workflow the viewer opens on, or null
  "workflows": [
    {
      "id": "sdlc",
      "name": "SDLC",
      "phases": [
        { "id": "p-decide", "name": "Decide", "note": "", "skills": ["decide"] },
        { "id": "p-build",  "name": "Build",  "note": "", "skills": ["code", "review"] }
      ]
    }
  ]
}
```

- A skill may sit in several phases, and in none (the viewer lists it under Unassigned).
- An entry is a skill id. One with no installed skill is kept and shown as missing, so a workflow survives an uninstall.
- The viewer saves with `PUT /api/workflows`, sending in `If-Match` the `ETag` of the version it last read; a save against a file changed since is refused (412) and the stored file stands.
  The check and the write hold `workflows.json.lock` in the state folder, so of servers sharing the folder only one writes against a version; a lock still held after a second answers 503 (`busy`, save again), and one older than 10 seconds is broken as left by a server that stopped mid-save.
- An agent reads and writes the file the same way:
  - `atlas.mjs workflows [--state <dir>]` prints `{ "etag": "<version>", "doc": { … } }`, an empty document and `"none"` where there is no file, and fails naming the file where it cannot be read as a workflows document;
  - `atlas.mjs workflows --put <file|-> --if-match <etag> [--state <dir>]` writes the document under the server's conditions and lock, and prints the new etag; a file changed since it was read (read it again), an invalid document and an unreadable stored file fail it, the stored file standing.

## Languages

A language is named by its tag: `en-US`, `zh-CN`.
The page's own text is English in its source; every other language is data in the files below.

### Translations of a skill's files

A file's translation is the file beside it with the tag before the extension: `SKILL.zh-CN.md` for `SKILL.md`, `references/prompts.zh-CN.md` for `references/prompts.md`.

- A name is read as a translation only where the tag names a known language in its canonical form but for case — a two-letter language with optional subtags (`zh`, `zh-CN`, `en-US`), or a three-letter one with at least one (`yue-HK`), so `app.dev.yaml`, `data.min.json` and `notes.bak.md` stay files — the extension is `.md`, `.json`, `.txt`, `.yaml` or `.yml`, and the file it translates exists.
- The scan looks in the skill's own folder first, then in `translations/<skill id>/` of the state directory, where the same relative path is used: `~/.skill-atlas/translations/pdf/SKILL.zh-CN.md`.
  Under one tag, the skill folder's translation stands, except where it is behind its source and the state directory's records its source's digest and that digest is the source's; a state translation recording no digest never displaces the skill's own.
  The scan's words, `files[].translations`, the stale and edited marks and `/api/file` all follow the one chosen.
  The state directory is where an agent writes translations of skills someone else ships; see [translate.md](translate.md).
- For a reader's language the tag is chosen first, and the folder within that tag alone: the tag asked where any translation is under it, else the first in name order among the tags of the same language and script (`zh` before `zh-Hans` for `zh-CN`, never `zh-TW`).
  So a `SKILL.zh.md` behind its source is read for `zh-CN` over a fresh `SKILL.zh-Hans.md`, marked behind, on the page and from `/api/file` alike.
- A translation records the SHA-256 of the source file's bytes as they stood when the two last matched, and a Markdown translation its own SHA-256 too, written by `atlas.mjs pin`:
  - in Markdown, a line `<!-- skill-atlas:source sha256=<64 hex> own=<64 hex> -->`, after the frontmatter and the SPDX comment lines that follow it; `own` is the SHA-256 of the file's UTF-8 text without a byte order mark, with LF line ends and with this line left out;
  - in text, the same line without `own=`;
  - in YAML, a line `# skill-atlas:source sha256=<64 hex>`;
  - in JSON, a top-level `"translationOf": { "sha256": "<64 hex>" }`.
- A translation whose recorded source digest differs from its source's is *stale* (behind its source); a Markdown one whose recorded own digest differs from its own is *edited* (apart from its source, which agents follow); one recording none is neither.
- `pin` rewrites only the record line and writes nothing where any named translation cannot hold a record; `pin --check` names each translation that is stale, edited or records no digest (or, in Markdown, not its own), and each folder named that holds no translation.
- A folder named stands for every translation in it at any depth, hidden folders such as `.agents` and `.claude` and linked ones (a skill linked in from elsewhere) included, each real folder once; only `.git` and `node_modules` are passed over.
  A link in it that cannot be followed is named and fails both `pin` and `pin --check`.
- A file that is its source itself through a link, symbolic or hard, is no translation: passed over in a folder, refused where named, never written.
  One file reached as the translation of two sources, or a translation that is itself a source (of another translation, a skill's `SKILL.md`, or the file a translation beside its real place translates), is named and fails both `pin` and `pin --check`, and no file is written.
- A folder named that cannot be read whole (over 5,000 files or 2,000 folders, or an entry that cannot be read) is named and fails both `pin` and `pin --check`.
- A translation under `translations/<skill id>/` whose skill the scan does not report, or whose source that skill lacks, is named and fails both `pin` and `pin --check`; the scan options (`--state`, `--cwd`, `--root`, `--agent`, `--no-user`, `--no-plugins`) choose the scan that finds the skills.

In `atlas.json` every skill carries `translations`, an object keyed by tag (empty when there is none), and each entry of `files` lists the tags it is translated into:

```jsonc
"translations": {
  "zh-CN": {
    "origin": "skill",                 // skill | state | annotation (words from annotations.json alone)
    "file": "/abs/…/code/SKILL.zh-CN.md",   // null when origin is "annotation"
    "frontmatter": { "name": "code", "description": "…", "compatibility": "…" },   // the translation's, as the skill's own; null when origin is "annotation"
    "description": "…",                // the translation's frontmatter description, or null
    "summary": null,                   // set only by annotations
    "steps": [ { "title": "运行第一个阶段", "excerpt": "…" } ],   // by index; null when the count differs from the skill's steps
    "stale": false,                    // behind its source
    "edited": false                    // edited apart from its source
  }
},
"files": [ { "path": "references/coder-phases.md", "kind": "reference", "linked": true, "translations": ["zh-CN"] } ]
```

Steps, links and tags always come from `SKILL.md`; a translation supplies words only.

A file's language is the one its frontmatter names in `metadata.language`, for `SKILL.md` alone, else told from its whole text outside fenced code and HTML comments: Han, kana and hangul letters, each counting as three, outweighing the Latin ones make it `ja` where kana are at least a tenth of the Han and kana, `ko` where hangul are most, else `zh`; Latin letters most make it `en`; letters of any other script most make it `und`.
Each skill's `language` in `atlas.json` is its `SKILL.md`'s.
Three insight kinds report on translations: `stale-translation`, `edited-translation` and `translation-steps` (the translation's steps number otherwise than the skill's).
A `stale-translation` message names the file under `translations/<skill id>/` of the state folder its refresh is written to and the `pin` command for that file; for a translation in the skill's folder it adds that file, to bring in line and pin instead where the folder is the user's own to edit.

Every insight carries `params`, the values its message is built from, so the page can phrase it in any language:

| Kind | `params` |
| --- | --- |
| `duplicate-name` | `name` |
| `unresolved-link` | `name`, `from` |
| `cycle` | `path` (skill ids in order: one shortest cycle, an example; the insight's `skills` name every skill of the group calling one another) |
| `oversized` | `lines` |
| `missing-description`, `no-steps`, `stale-annotation` | — (`{}`) |
| `invalid-frontmatter` | `named` (whether its `name` reads, so the folder does not name the skill) |
| `name-mismatch` | `name`, `folder` |
| `stale-translation` | `lang`, `files` (relative paths behind their source) |
| `edited-translation` | `lang`, `files` (relative paths edited apart from their source) |
| `translation-steps` | `lang`, `steps`, `expected` |

In `annotations.json` a skill's entry may repeat its words per language; words under a tag are always reported under exactly that tag, laid over that tag's own entry where there is one, else over a copy of a translation file's entry under the first tag in name order of the same language and script (`zh` for `zh-CN`, never `zh-TW`), else in an entry of their own (`origin` `"annotation"`).
A file's own entry is never changed by words for another tag: words under `en-US` and `en-GB` over a `SKILL.en.md` give three entries, `en` (the file's), `en-US` and `en-GB` (each the file's fields with its own words):

```jsonc
"code": {
  "summary": "Implements a request as one commit per phase.",
  "translations": {
    "zh-CN": { "summary": "把请求实现为每阶段一次提交。", "steps": [ { "title": "…", "summary": "…" } ] }
  }
}
```

### The server's answers

- `GET /api/file?skill=<id>&path=<relative path>&lang=<tag>` returns `{ "language", "path", "stale", "edited", "text" }`: the translation under that tag, else under the first tag in name order of the same language and script (`zh`, else `zh-Hans`, for `zh-CN`, never `zh-TW`), where there is one, the skill folder's or the state directory's by the rule above, a regular file inside its folder, with `"language"` its tag and its own relative path (`SKILL.zh-CN.md`); else the file itself with `"language": null`, its relative path, `"stale": false` and `"edited": false`.
  The original carries `"sourceLanguage"` too, the language it is written in, told from its own text (see above).
  Without `lang` the answer is the file's plain text.
- `GET /api/config` adds:

```jsonc
{
  "lang": "zh-CN",                     // the --lang the command was given, or null
  "locales": {                         // one per file in assets/locales/
    "zh-CN": { "name": "简体中文", "messages": { "Rescan": "重新扫描" } }
  },
  "labels": {                          // from references/<name>.<tag>.json
    "zh-CN": {
      "title": "技能图谱",
      "categories": { "input": "数据输入" },
      "tags": { "tool.shell": "命令行" },
      "presets": { "sdlc": { "name": "软件交付", "description": "…", "phases": ["探索", "决策"] } }
    }
  }
}
```

### Catalogs and label files

- `assets/locales/<tag>.json` is a catalog: `{ "version": 1, "language": "<tag>", "name": "<the language's own name>", "messages": { "<English text>": "<translation>" } }`.
  - A placeholder is `{name}` and is kept in the translation.
  - An English text with two forms is written `one|other` (`"{n} step|{n} steps"`); its translation gives one form, or one per plural category of its language in the order `Intl.PluralRules` lists them.
  - A text with no entry is shown in English.
- `references/tag-rules.<tag>.json`, `references/workflow-presets.<tag>.json` and `references/view-settings.<tag>.json` are label files: the same shape as the file they sit beside, from which only `title`, `label`, `name` and `description` are read — tags and presets by `id`, categories by key, a preset's phases by position.
  Patterns, keywords, colors and every other setting come from the source file alone.
- The page's language is the reader's choice on the page (kept in the browser), else `--lang`, else the browser's language where a catalog's tag is it or shares its primary subtag and script (`zh` and `zh-SG` name `zh-CN`, `zh-TW` none), else `en-US`.

## Detection rules

Folders scanned:

- The project is `--cwd`'s folder and each folder above its real path up to the root of its repository (the nearest folder holding a `.git` entry), the nearer first; with no repository, `--cwd`'s alone.
  A `--cwd` reached through a link so finds the same folders as the folder it leads to.
  A root's id names its folder's place in the repository, the same from every working folder in it: the rows of the repository's root (or, with no repository, of `--cwd`'s folder) keep ids such as `project-agents`; those of a folder below it add its path from the repository's root, each segment lowercased with every run of other characters than `a-z` and `0-9` one hyphen and none kept at either end, and a segment holding none of those named by `x` and eight hex digits of its SHA-256 (`project-agents-packages-ui` for `packages/ui`).
  Where another folder of the repository has the same words (`packages/ui-kit` and `packages/ui/kit`), each adds `.` and eight hex digits of the SHA-256 of its path from the root, so no two folders share an id.
  A plugin's root is `plugin-<name>`, a later install of that name in `installed_plugins.json` adding `-2`, `-3`, … over every install the file records, enabled here or not.
  A folder reached by several rows (`--cwd` the home folder, a `--root` or `CLAUDE_CONFIG_DIR` naming a project's folder, or one folder's skills linked to another's) is scanned once, as the row reaching it through no link of its own, of those a project's before the home folder's, the plugins' and `--root`'s, each then first in id order, so the other row changes no id.
  Its label adds that path: `Project (packages/ui) · Universal`.
- Each agent's skill folder in each project folder and in the home folder (`.claude/skills`, `.agents/skills`, `.codex/skills`, `.cursor/skills`, ...; `CLAUDE_CONFIG_DIR` and `CODEX_HOME` stand for the home folder's `.claude` and `.codex`), Codex's bundled skills in `.system` under the home folder's Codex skills, the home folder's `.config/opencode/skills`, `.config/agents/skills` (loaded as `.agents/skills` is), `.config/goose/skills`, `.copilot/skills` and `.codeium/windsurf/skills` (`XDG_CONFIG_HOME`, where set, standing for the home folder's `.config`), each project folder's `.github/skills`, and each project folder's `skills` where it holds a skill.
- `--agent <id>` keeps that agent's folders, `.agents/skills` and `.config/agents/skills` where that agent loads them (every agent but Claude Code does), and `--root`'s; the project's `skills` is left out.
- A Claude Code plugin's `skills`, where `plugins/installed_plugins.json` records the plugin for the user or for this project and `enabledPlugins` does not set it `false`: the user's `settings.json`, then the project's `.claude/settings.json`, then its `.claude/settings.local.json`, each of the project's folders read the farther first, a later file's value for a plugin over an earlier one's.
- In each folder, a folder or a folder one below it holding `SKILL.md` is a skill; folders whose name starts with a dot, and `node_modules`, are passed over.

Steps, in order of preference, with fenced code ignored for structure:

1. Headings titled `Step N`, `Phase N`, `Stage N`, `Part N`, `步骤 N`, `阶段 N`, `第 N 步`, `第 N 阶段`, `第 N 部分` or `N. Title`, when two or more share a level.
2. The ordered list under a heading that names a procedure (`Workflow`, `Steps`, `Process`, `Procedure`, `Instructions`, `How to`, `Usage`, `Quick start`, `工作流`, `流程`, `步骤`, `过程`, `规程`, `说明`, `指令`, `如何`, `用法`, `使用方法`, `快速开始`, `快速入门`), or the ordered list that opens the body: after an optional `#` title and at most one introductory paragraph ending in a colon (`:` or `：`), with blank lines, HTML comments and quoted notes (`>` lines, such as a translation's reader notice) passed over before it.
3. Otherwise the `##` sections, reported with `stepKind: "section"`.

Links from a skill to another installed skill named `N` (or `<plugin>:N`), read from the description and from the body outside fenced code:

| Form in the text | Kind |
| --- | --- |
| `/N` as a command: no word character, `/`, `.`, `-`, `~`, `:` or `@` right before the slash, no path word (`under`, `in`, `into`, `at`, `to`, `from`, `of`) or HTTP method right before it, and no word character, `/` or `-` after the name (a `.` or `:` only as punctuation); a folder-like name (`docs`, `src`, `api`, `tmp`, ...) only in a sentence saying skill, command, slash or playbook | `calls` |
| `Skill(N)` | `calls` |
| `skill: N` as a key: lowercase, at the start of a line (or a `- ` list item) or after `{` or `,` | `calls` |
| `$N` (backticked or not) within a few words after a verb of use, with no `,` between them, and each `$N` joined to such a one by `,`, `and`, `or`, or `not` or `never` after `,`, `and` or `but`, whether or not the names between name a skill; `$N` with no such verb, inside a path or URL (`bin/$N`), and `$` before a name no skill has, are nothing | `calls` |
| `N` within a few words after a verb of use (invoke, call, run, use, load, delegate to, hand off to, follow, start, trigger, launch) and next to the word skill or playbook, or next to the word command when `N` is backticked or slash-prefixed | `calls` |
| Any of the above after words steering away from it in its sentence (`not for`, `do not use`, `don't use`, `never use`, `instead of`, `rather than`, `see also`, `not` or `never` after `,`, `and` or `but`) with no clause opening with a verb of use (after `,`, `:`, a dash or `but`, `instead` allowed before the verb) between them, or in a sentence holding `instead` followed neither by `of` nor by a verb of use — so ``use `/review` instead of `/publish` `` and ``instead of `/publish`, use `/review` `` call `review` and mention `publish` | `mentions` |
| `` `N` `` alone, when the sentence says skill or the name has a hyphen | `mentions` |

- A name held by several skills resolves to the one in the linking skill's own folder, a copy's folder included, else the first found; `<plugin>:N` names a skill with a copy in that plugin too.
- One link is kept per (skill, step, target), `calls` before `mentions`; a skill's link to itself is dropped.
- A link to a skill that is not installed is reported under `unresolved` for three forms only: `` `/x` `` in backticks in a sentence saying skill, command, slash or type (and `x` not a folder-like name, nor a host built-in command such as `/help`, `/clear` or `/compact`); `` `x` skill `` after any word (``the `x` skill``, ``our `x` skill``); and `Skill(x)`, whatever `x` is.

Tags come from `tag-rules.json`: each rule's patterns are tried against every line of the frontmatter description (and the `context` and `agent` keys), the preamble (every body line outside every step) and each step, fenced code included.
A match negated earlier in its own clause is not evidence: a never, not, no, nor, without, avoid, don't, doesn't, won't, cannot or can't within the 60 characters before it in the same sentence drops it, unless the rule sets `"negatable": false`.
The frontmatter `allowed-tools` list and every `mcp__<server>__<tool>` name add tool tags directly, and `argument-hint` adds `input.arguments`:

| `allowed-tools` entry | Tags |
| --- | --- |
| `Bash` | `tool.shell`; `Bash(git ...)` adds `tool.git`, `Bash(gh ...)` `tool.github`, `Bash(npm\|npx\|pnpm\|yarn ...)` `tool.package-manager` |
| `Read` | `input.files` |
| `Write`, `Edit`, `MultiEdit`, `NotebookEdit` | `tool.edit`, `output.files` |
| `Grep`, `Glob` | `tool.search` |
| `WebFetch`, `WebSearch` | `tool.web` |
| `Task`, `Agent` | `tool.subagent` |
| `AskUserQuestion` | `human.question` |
| `mcp__<server>` or `mcp__<server>__<tool>` | `tool.mcp-<server>`, labelled `MCP: <server>` |

Link and tag detection read at most the first 4,000 characters of a line.
