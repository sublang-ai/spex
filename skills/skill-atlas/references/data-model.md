<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Skill Atlas data model

The three JSON documents Skill Atlas reads and writes.
Read this file before editing `annotations.json` or `workflows.json` by hand, or before consuming `atlas.json` from another tool.

## Contents

- [Files and where they live](#files-and-where-they-live)
- [atlas.json — what the scan found](#atlasjson--what-the-scan-found)
- [annotations.json — corrections layered on the scan](#annotationsjson--corrections-layered-on-the-scan)
- [workflows.json — how the user organizes skills](#workflowsjson--how-the-user-organizes-skills)
- [Detection rules](#detection-rules)

## Files and where they live

| File | Written by | Read by | Location |
| --- | --- | --- | --- |
| `atlas.json` | `atlas.mjs scan` | viewer, agent | stdout, or `--out <file>` |
| `annotations.json` | agent or user | `atlas.mjs scan` | state directory |
| `workflows.json` | viewer (or user) | viewer, agent | state directory |

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
      "id": "project-claude",          // stable slug, unique in this file
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
      "copies": [                      // other folders holding this same skill, byte for byte
        { "root": "user-codex", "dir": "/home/me/.codex/skills/code" }
      ],
      "frontmatter": { "name": "code", "description": "…", "allowed-tools": "Bash Read" },
      "lines": 84,                     // SKILL.md line count
      "summary": null,                 // one sentence, set only by annotations
      "files": [                       // bundled files, SKILL.md excluded, at most 200
        { "path": "references/coder-phase.md", "kind": "reference", "linked": true }
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

Insight kinds: `duplicate-name`, `unresolved-link`, `cycle`, `oversized` (SKILL.md over 500 lines), `missing-description`, `name-mismatch` (frontmatter `name` differs from the folder), `invalid-frontmatter`, `no-steps`.

One skill installed for several agents — a folder linked into several roots, or copied with an identical `SKILL.md` — is one record listing the others under `copies`.
Only skills of one name whose `SKILL.md` differ are a `duplicate-name`.

## annotations.json — corrections layered on the scan

The scan is pattern matching; this file is where a reader who understood the skill corrects it.
`atlas.mjs scan` applies it after detection, and marks everything it adds with `"source": "annotation"`.

```jsonc
{
  "version": 1,
  "skills": {
    "code": {
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
- A replaced step has `line` and `endLine` null and its `summary` as its `excerpt`; the tags and links the scan found in the former steps stay on the skill as a whole (`fromStep` null).
- A tag id absent from `tag-rules.json` is accepted when it has the form `<category>.<slug>`; its label is the slug.
- An entry naming a skill that is not installed is ignored and reported on stderr.

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

## Detection rules

Steps, in order of preference, with fenced code ignored for structure:

1. Headings titled `Step N`, `Phase N`, `Stage N`, `Part N` or `N. Title`, when two or more share a level.
2. The ordered list under a heading that names a procedure (`Workflow`, `Steps`, `Process`, `Procedure`, `Instructions`, `How to`, `Usage`, `Quick start`), or the ordered list that opens the body.
3. Otherwise the `##` sections, reported with `stepKind: "section"`.

Links from a skill to another installed skill named `N` (or `<plugin>:N`), read from the description and from the body outside fenced code:

| Form in the text | Kind |
| --- | --- |
| `/N` as a command: no word character, `/`, `.`, `-`, `~`, `:` or `@` right before the slash, no path word (`under`, `in`, `into`, `at`, `to`, `from`, `of`) or HTTP method right before it, and no word character, `/` or `-` after the name (a `.` or `:` only as punctuation); a folder-like name (`docs`, `src`, `api`, `tmp`, ...) only in a sentence saying skill, command, slash or playbook | `calls` |
| `Skill(N)` | `calls` |
| `skill: N` as a key: lowercase, at the start of a line (or a `- ` list item) or after `{` or `,` | `calls` |
| `N` within a few words after a verb of use (invoke, call, run, use, load, delegate to, hand off to, follow, start, trigger, launch) and next to the word skill or playbook, or next to the word command when `N` is backticked or slash-prefixed | `calls` |
| Any of the above in a sentence that steers away (`not for`, `do not use`, `don't use`, `never use`, `instead` not followed by `of`, `rather than`, `see also`) | `mentions` |
| `` `N` `` alone, when the sentence says skill or the name has a hyphen | `mentions` |

- A name held by several skills resolves to the one in the linking skill's own folder, else the first found.
- One link is kept per (skill, step, target), `calls` before `mentions`; a skill's link to itself is dropped.
- A link to a skill that is not installed is reported under `unresolved` for three forms only: `` `/x` `` in backticks in a sentence saying skill, command, slash or type (and `x` not a folder-like name); ``the `x` skill``; and `Skill(x)`. A host built-in command (`/help`, `/clear`, `/compact`, ...) is never unresolved.

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
