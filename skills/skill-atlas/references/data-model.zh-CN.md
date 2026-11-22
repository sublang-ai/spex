<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->
<!-- skill-atlas:source sha256=9470270b20af9eef13907d36feecd96dc7a913c8fe6610e44c427032a5008eac own=8b6aac052be694d8b4929878ef4be4f6de033d49127a20742f9c6c1b6eb3ddbd -->

> 本文件是 `data-model.md` 的简体中文译本，供人阅读；代理使用的是原文件。

# 技能图谱数据模型

技能图谱读写的三个 JSON 文档。
手工编辑 `annotations.json` 或 `workflows.json` 之前，或在其他工具中使用 `atlas.json` 之前，请先阅读本文件。

## 目录

- [文件及其位置](#文件及其位置)
- [atlas.json — 扫描发现了什么](#atlasjson--扫描发现了什么)
- [annotations.json — 叠加在扫描之上的修正](#annotationsjson--叠加在扫描之上的修正)
- [workflows.json — 用户如何整理技能](#workflowsjson--用户如何整理技能)
- [语言](#语言)
- [检测规则](#检测规则)

## 文件及其位置

| 文件 | 写入者 | 读取者 | 位置 |
| --- | --- | --- | --- |
| `atlas.json` | `atlas.mjs scan` | 视图、代理 | stdout，或 `--out <file>` |
| `annotations.json` | 代理或用户 | `atlas.mjs scan` | 状态目录 |
| `workflows.json` | 视图（或用户） | 视图、代理 | 状态目录 |

状态目录为 `~/.skill-atlas/`，除非 `--state <dir>` 指定了其他目录，例如团队共享的仓库中的 `.skill-atlas/`。
每个技能都以其 id 为键：即它的 `name`，同名而内容不同的技能则为 `<name>@<rootId>`；从不以路径为键，因此两个状态文件在重新安装或移动后依然有效。

## atlas.json — 扫描发现了什么

```jsonc
{
  "version": 1,
  "generatedAt": "2026-11-21T08:00:00.000Z",
  "cwd": "/abs/project",
  "roots": [
    {
      "id": "project-claude",          // 稳定的短名，在本文件中唯一
      "path": "/abs/project/.claude/skills",
      "scope": "project",              // project | user | plugin | extra
      "agent": "claude-code",          // 加载此文件夹的代理，或 "universal"
      "label": "Project · Claude Code",
      "skillCount": 3
    }
  ],
  "tagCatalog": [                      // 下文用到的每个标签 id，无论静态还是动态
    { "id": "tool.shell", "category": "tool", "label": "Shell" }
  ],
  "skills": [
    {
      "id": "code",                    // 等于 name；同名而内容不同的第 2 个及以后的技能为 "<name>@<rootId>"
      "name": "code",
      "description": "…",
      "root": "project-claude",
      "plugin": null,                  // scope 为 "plugin" 时的插件名
      "dir": "/abs/project/.claude/skills/code",
      "file": "/abs/project/.claude/skills/code/SKILL.md",
      "digest": "9b90c1…",             // SKILL.md 字节的 SHA-256（十六进制）；无法读取时为 null
      "copies": [                      // 存放同一技能（逐字节相同）的其他文件夹
        { "root": "user-codex", "dir": "/home/me/.codex/skills/code" }
      ],
      "frontmatter": { "name": "code", "description": "…", "allowed-tools": "Bash Read" },
      "lines": 84,                     // SKILL.md 的行数
      "summary": null,                 // 一句话，只由标注设置
      "files": [                       // 附带的文件，不含 SKILL.md，最多 200 个
        { "path": "references/coder-phases.md", "kind": "reference", "linked": true }
      ],                               // kind：reference | script | asset | other；linked：SKILL.md 提到了该路径
      "stepKind": "step",              // step | section | none —— `steps` 是如何得出的
      "steps": [
        {
          "id": "code#2",              // "<skill id>#<index>"
          "index": 2,                  // 从 1 开始
          "title": "Run the phases",
          "line": 31, "endLine": 52,   // 在 SKILL.md 中，从 1 开始，含首尾
          "excerpt": "Plain text of the step, at most 400 characters…",
          "tags": [ /* TagHit */ ],
          "calls": ["review"]          // 此步骤链接到的技能 id（任何边类型）
        }
      ],
      "tags": [ /* TagHit：frontmatter、前言和各步骤的并集 */ ],
      "issues": ["oversized"]          // 见洞察类型
    }
  ],
  "edges": [
    {
      "from": "code", "fromStep": "code#3",   // 链接不在任何步骤中时，fromStep 为 null
      "to": "review",
      "kind": "calls",                 // calls | mentions
      "source": "scan",                // scan | annotation
      "evidence": { "line": 44, "text": "…invoke the `review` skill once…" }
    }
  ],
  "unresolved": [                      // 指向未安装技能的链接
    { "from": "dev", "fromStep": "dev#2", "name": "branch", "evidence": { "line": 12, "text": "…" } }
  ],
  "insights": [
    { "kind": "duplicate-name", "skills": ["code", "code@user-claude"], "message": "…" }
  ]
}
```

一个 `TagHit`：

```jsonc
{
  "id": "human.approval",
  "category": "human",                 // input | output | tool | human
  "label": "Needs approval",
  "source": "rule",                    // rule | frontmatter | annotation
  "evidence": [ { "line": 40, "text": "Wait for the user's approval before…" } ]   // 最多 3 条
}
```

洞察类型：`duplicate-name`、`unresolved-link`、`cycle`、`oversized`（SKILL.md 超过 500 行）、`missing-description`、`name-mismatch`（frontmatter 的 `name` 与文件夹名不同）、`invalid-frontmatter`、`no-steps`、`stale-annotation`（`annotations.json` 中按该技能的另一版文本写成、因而未被应用的条目）。

为多个代理安装的同一个技能（一个文件夹被链接到多个根目录，或被复制且每个文件都逐字节相同：相对路径相同，译本也算在内，其中每个链接的链接文本也相同）是一条记录，其他位置列在 `copies` 下。
大到无法完整列出（超过 5,000 个文件或 2,000 个文件夹）、总大小超过 64 MiB、含有指向其外部的链接或含有无法读取的条目的文件夹，算作不同。
只有同名而文件夹不同的技能才是 `duplicate-name`。

## annotations.json — 叠加在扫描之上的修正

扫描是模式匹配；读懂了技能的人在这个文件中修正它。
`atlas.mjs scan` 在检测之后应用此文件，并把它添加的每一项都标记为 `"source": "annotation"`。

```jsonc
{
  "version": 1,
  "skills": {
    "code": {
      "source": { "sha256": "9b90c1…" },   // 可选；写此条目时所依据的 SKILL.md 的 `digest`
      "summary": "Implements a request as one commit per phase, then has it reviewed once.",
      "steps": [                       // 可选；完全取代检测出的步骤
        { "title": "Classify the request", "summary": "New intent or an existing IR?" },
        { "title": "Run the phases", "summary": "One commit per phase." }
      ],
      "addTags":    [ { "id": "human.question", "step": 1, "note": "asks when the request is unclear" },
                      { "id": "output.commit", "step": 2, "note": "one commit per phase" } ],
      "removeTags": [ { "id": "tool.browser" } ],          // 省略 "step"：在整个技能中
      "addCalls":    [ { "to": "review", "step": 3, "kind": "calls", "note": "after the final phase" } ],
      "removeCalls": [ { "to": "pdf" } ]
    }
  }
}
```

- `step` 是从 1 开始的步骤序号；省略它表示针对整个技能。
- `steps` 中的一项包含 `title` 和 `summary`；新步骤的标签和链接通过带 `step` 和 `note` 的 `addTags` 和 `addCalls` 给出，它们在替换之后应用。
  （为了容错，`steps` 项中的 `tags` 和 `calls` 列表仍会被读取。）
- 被替换的步骤，其 `line` 和 `endLine` 为 null，其 `summary` 作为 `excerpt`；扫描在原步骤中找到的标签和链接保留在整个技能上（`fromStep` 为 null）。
- 不在 `tag-rules.json` 中的标签 id，只要形如 `<category>.<slug>` 就会被接受；其显示名称就是 slug。
- 指向未安装技能的条目会被忽略，并在 stderr 上报告。
- 记录的 `source` 哈希值与其技能的 `digest` 不同的条目不会被应用，其 `translations` 中的文字也不会，并报告为 `stale-annotation` 洞察：状态目录为所有项目共用，这样的条目可能是为另一个同名技能或本技能的早先文本写的。
  没有记录哈希值的条目照常应用。

## workflows.json — 用户如何整理技能

```jsonc
{
  "version": 1,
  "active": "sdlc",                    // 视图打开时显示的工作流 id，或 null
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

- 一个技能可以位于多个阶段，也可以不在任何阶段（视图把它列在“未分配”下）。
- 每一项是一个技能 id。没有对应已安装技能的项会被保留并显示为缺失，因此卸载技能后工作流依然完好。
- 视图用 `PUT /api/workflows` 保存，并在 `If-Match` 中发送它上次读取的版本的 `ETag`；针对此后已被修改的文件的保存会被拒绝（412），所存文件保持不变。
  检查与写入期间持有状态目录中的 `workflows.json.lock`，因此在共享该目录的服务器中，针对同一版本只有一个会写入；一秒后锁仍被持有时回答 503（`busy`，请稍后再次保存），超过 10 秒的锁会被视为中途停止的服务器留下的而被打破。

## 语言

语言以其标签命名：`en-US`、`zh-CN`。
页面自身的文字在源代码中是英文；其他每种语言都是下列文件中的数据。

### 技能文件的译本

一个文件的译本，是它旁边在扩展名前加上标签的文件：`SKILL.md` 的译本是 `SKILL.zh-CN.md`，`references/prompts.md` 的译本是 `references/prompts.zh-CN.md`。

- 只有当标签以规范形式（大小写除外）命名一种已知语言——两个字母的语言代码，可带子标签（`zh`、`zh-CN`、`en-US`），或至少带一个子标签的三个字母的语言代码（`yue-HK`），因此 `app.dev.yaml`、`data.min.json` 和 `notes.bak.md` 仍是普通文件——扩展名是 `.md`、`.json`、`.txt`、`.yaml` 或 `.yml`，且它所翻译的文件存在时，该文件名才被视为译本。
- 扫描先在技能自己的文件夹中查找，再到状态目录的 `translations/<skill id>/` 中按相同的相对路径查找：`~/.skill-atlas/translations/pdf/SKILL.zh-CN.md`。
  状态目录是代理为他人发布的技能写入译本的地方；见 [translate.md](translate.zh-CN.md)。
- 译本记录两者最后一致时源文件字节的 SHA-256，Markdown 译本还记录它自己的 SHA-256，由 `atlas.mjs pin` 写入：
  - 在 Markdown 中，是一行 `<!-- skill-atlas:source sha256=<64 hex> own=<64 hex> -->`，位于 frontmatter 及其后的 SPDX 注释行之后；`own` 是该文件去掉字节顺序标记、换行统一为 LF 并略去这一行之后的 UTF-8 文本的 SHA-256；
  - 在文本中，是同样的一行，但没有 `own=`；
  - 在 YAML 中，是一行 `# skill-atlas:source sha256=<64 hex>`；
  - 在 JSON 中，是一个顶层的 `"translationOf": { "sha256": "<64 hex>" }`。
- 所记录的源文件哈希值与源文件不符的译本是*过时的*（落后于源文件）；所记录的自身哈希值与自身不符的 Markdown 译本是*脱离源文件修改过的*（代理遵循的是源文件）；没有记录哈希值的译本两者都不是。
- `pin` 只改写记录行；只要有一个指定的译本无法写入记录，就不写入任何文件；`pin --check` 列出每个过时、脱离源文件修改过或没有记录哈希值（Markdown 译本则包括没有记录自身哈希值）的译本，以及每个指定的、不含任何译本的文件夹。
- 无法完整读取（超过 5,000 个文件或 2,000 个文件夹，或含有无法读取的条目）的指定文件夹会被列出，并使 `pin` 和 `pin --check` 都失败。
- 位于 `translations/<skill id>/` 下、其技能未被扫描报告或该技能缺少其源文件的译本，会被列出，并使 `pin` 和 `pin --check` 都失败；扫描选项（`--state`、`--cwd`、`--root`、`--agent`、`--no-user`、`--no-plugins`）决定用来找到这些技能的扫描。

在 `atlas.json` 中，每个技能都带有 `translations`，一个以标签为键的对象（没有译本时为空），`files` 的每一项都列出它被翻译成的标签：

```jsonc
"translations": {
  "zh-CN": {
    "origin": "skill",                 // skill | state | annotation（文字只来自 annotations.json）
    "file": "/abs/…/code/SKILL.zh-CN.md",   // origin 为 "annotation" 时为 null
    "frontmatter": { "name": "code", "description": "…", "compatibility": "…" },   // 译本的 frontmatter，形式同技能本身的；origin 为 "annotation" 时为 null
    "description": "…",                // 译本 frontmatter 中的 description，或 null
    "summary": null,                   // 只由标注设置
    "steps": [ { "title": "运行第一个阶段", "excerpt": "…" } ],   // 按序号；步骤数与技能的步骤数不同时为 null
    "stale": false,                    // 落后于源文件
    "edited": false                    // 脱离源文件修改过
  }
},
"files": [ { "path": "references/coder-phases.md", "kind": "reference", "linked": true, "translations": ["zh-CN"] } ]
```

步骤、链接和标签始终取自 `SKILL.md`；译本只提供文字。
有三种洞察类型报告译本的情况：`stale-translation`、`edited-translation` 和 `translation-steps`（译本的步骤数与技能的不同）。

每条洞察都带有 `params`，即构成其消息的值，以便页面用任何语言表述它：

| 类型 | `params` |
| --- | --- |
| `duplicate-name` | `name` |
| `unresolved-link` | `name`、`from` |
| `cycle` | `path`（按顺序排列的技能 id：一个最短的环，作为示例；洞察的 `skills` 列出这组相互调用的每一个技能） |
| `oversized` | `lines` |
| `missing-description`、`invalid-frontmatter`、`no-steps`、`stale-annotation` | —（`{}`） |
| `name-mismatch` | `name`、`folder` |
| `stale-translation` | `lang`、`files`（落后于源文件的相对路径） |
| `edited-translation` | `lang`、`files`（脱离源文件修改过的相对路径） |
| `translation-steps` | `lang`、`steps`、`expected` |

在 `annotations.json` 中，一个技能的条目可以按语言重复给出其文字；它们会进入该技能 `translations` 中对应标签的条目，否则进入语言和书写系统都相同的标签的条目（`zh-CN` 对应 `zh`，绝不对应 `zh-TW`）：

```jsonc
"code": {
  "summary": "Implements a request as one commit per phase.",
  "translations": {
    "zh-CN": { "summary": "把请求实现为每阶段一次提交。", "steps": [ { "title": "…", "summary": "…" } ] }
  }
}
```

### 服务器的应答

- `GET /api/file?skill=<id>&path=<relative path>&lang=<tag>` 返回 `{ "language", "path", "stale", "edited", "text" }`：有该标签下的译本，否则有同一语言和文字的标签下的译本（对 `zh-CN` 而言为 `zh` 或 `zh-Hans`，绝不是 `zh-TW`），且为其文件夹内的普通文件时，返回译本，并带有其标签作为 `"language"` 和译本自己的相对路径（`SKILL.zh-CN.md`）；否则为文件本身，并带有 `"language": null`、它的相对路径、`"stale": false` 和 `"edited": false`。
  不带 `lang` 时，答复是文件的纯文本。
- `GET /api/config` 增加：

```jsonc
{
  "lang": "zh-CN",                     // 命令给出的 --lang，或 null
  "locales": {                         // assets/locales/ 中的每个文件一项
    "zh-CN": { "name": "简体中文", "messages": { "Rescan": "重新扫描" } }
  },
  "labels": {                          // 来自 references/<name>.<tag>.json
    "zh-CN": {
      "title": "技能图谱",
      "categories": { "input": "数据输入" },
      "tags": { "tool.shell": "命令行" },
      "presets": { "sdlc": { "name": "软件交付", "description": "…", "phases": ["探索", "决策"] } }
    }
  }
}
```

### 消息目录与名称文件

- `assets/locales/<tag>.json` 是一个消息目录：`{ "version": 1, "language": "<tag>", "name": "<the language's own name>", "messages": { "<English text>": "<translation>" } }`。
  - 占位符写作 `{name}`，并在译文中保留。
  - 有两种形式的英文文本写作 `one|other`（`"{n} step|{n} steps"`）；其译文给出一种形式，或按 `Intl.PluralRules` 列出的顺序，为该语言的每个复数类别各给一种形式。
  - 没有条目的文本以英文显示。
- `references/tag-rules.<tag>.json`、`references/workflow-presets.<tag>.json` 和 `references/view-settings.<tag>.json` 是名称文件：与它们旁边的文件结构相同，从中只读取 `title`、`label`、`name` 和 `description`：标签和预设按 `id`，类别按键，预设的阶段按位置。
  模式、关键词、颜色和其他所有设置只取自源文件。
- 页面的语言依次取：读者在页面上的选择（保存在浏览器中），否则 `--lang`，否则浏览器的语言（当某个消息目录的标签就是它，或与它的主子标签和书写系统都相同时：`zh` 和 `zh-SG` 对应 `zh-CN`，`zh-TW` 没有对应），否则 `en-US`。

## 检测规则

扫描的文件夹：

- 项目和主目录中每个代理的技能文件夹（`.claude/skills`、`.agents/skills`、`.codex/skills`、`.cursor/skills`……；`CLAUDE_CONFIG_DIR` 和 `CODEX_HOME` 代替主目录的 `.claude` 和 `.codex`），主目录 Codex 技能下 `.system` 中 Codex 自带的技能，主目录的 `.config/opencode/skills`、`.config/agents/skills`（与 `.agents/skills` 一样被加载）、`.config/goose/skills`、`.copilot/skills` 和 `.codeium/windsurf/skills`，项目的 `.github/skills`，以及项目中含有技能的 `skills`。
- `--agent <id>` 保留该代理的文件夹、该代理加载的 `.agents/skills` 和 `.config/agents/skills`（除 Claude Code 外的代理都加载它们），以及 `--root` 指定的文件夹；项目的 `skills` 不保留。
- Claude Code 插件的 `skills`：`plugins/installed_plugins.json` 记录该插件为用户或本项目安装，且 `enabledPlugins` 没有把它设为 `false`；依次读取用户的 `settings.json`、项目的 `.claude/settings.json` 和项目的 `.claude/settings.local.json`，对同一插件，后读的文件的值优先于先读的。
- 在每个文件夹中，含有 `SKILL.md` 的子文件夹或其下一级文件夹是一个技能；名称以点开头的文件夹和 `node_modules` 会被跳过。

步骤按以下优先顺序识别，结构识别时忽略围栏代码：

1. 标题为 `Step N`、`Phase N`、`Stage N`、`Part N`、`步骤 N`、`阶段 N`、`第 N 步`、`第 N 阶段`、`第 N 部分` 或 `N. Title` 的标题，且有两个或更多处于同一级别。
2. 位于指明某种流程的标题（`Workflow`、`Steps`、`Process`、`Procedure`、`Instructions`、`How to`、`Usage`、`Quick start`、`工作流`、`流程`、`步骤`、`过程`、`规程`、`说明`、`指令`、`如何`、`用法`、`使用方法`、`快速开始`、`快速入门`）之下的有序列表，或正文开头的有序列表：位于可选的 `#` 标题和至多一段以冒号（`:` 或 `：`）结尾的引导段落之后，列表之前的空行、HTML 注释和引用说明（`>` 开头的行，例如译本给读者的说明）都会被跳过。
3. 否则取 `##` 章节，以 `stepKind: "section"` 报告。

从一个技能指向另一个名为 `N`（或 `<plugin>:N`）的已安装技能的链接，从描述和围栏代码之外的正文中读取：

| 文本中的形式 | 类型 |
| --- | --- |
| 作为命令的 `/N`：斜杠前紧邻的不是单词字符、`/`、`.`、`-`、`~`、`:` 或 `@`，斜杠前紧邻的也不是路径用词（`under`、`in`、`into`、`at`、`to`、`from`、`of`）或 HTTP 方法，名称之后不是单词字符、`/` 或 `-`（`.` 或 `:` 只能作为标点）；类似文件夹的名称（`docs`、`src`、`api`、`tmp`……）只在提到 skill、command、slash 或 playbook 的句子中算数 | `calls` |
| `Skill(N)` | `calls` |
| 作为键的 `skill: N`：小写，位于行首（或 `- ` 列表项开头），或在 `{` 或 `,` 之后 | `calls` |
| `N` 在某个表示使用的动词（invoke、call、run、use、load、delegate to、hand off to、follow、start、trigger、launch）之后几个词以内，且紧挨 skill 或 playbook 一词，或者在 `N` 带反引号或斜杠前缀时紧挨 command 一词 | `calls` |
| 以上任一形式，在其句子中位于引向别处的用词（`not for`、`do not use`、`don't use`、`never use`、`instead of`、`rather than`、`see also`、`, not`、`but not`）之后，且两者之间没有以使用类动词开头的分句（位于 `,`、`:` 或破折号之后），或出现在含有后面不跟 `of` 的 `instead` 的句子中——因此 ``use `/review` instead of `/publish` `` 和 ``instead of `/publish`, use `/review` `` 都调用 `review`、提及 `publish` | `mentions` |
| 单独的 `` `N` ``，当句子提到 skill 或名称中带连字符时 | `mentions` |

- 被多个技能共用的名称，解析为发出链接的技能所在文件夹中的那个（副本所在的文件夹也算），否则为最先找到的那个；`<plugin>:N` 也指在该插件中有副本的技能。
- 每个（技能、步骤、目标）只保留一条链接，`calls` 优先于 `mentions`；技能指向自身的链接被丢弃。
- 指向未安装技能的链接，只有三种形式会在 `unresolved` 下报告：在提到 skill、command、slash 或 type 的句子中带反引号的 `` `/x` ``（且 `x` 不是类似文件夹的名称，也不是宿主的内置命令，例如 `/help`、`/clear` 或 `/compact`）；任意词之后的 `` `x` skill ``（``the `x` skill``、``our `x` skill``）；以及 `Skill(x)`，无论 `x` 是什么。

标签来自 `tag-rules.json`：每条规则的模式会与 frontmatter 描述（以及 `context` 和 `agent` 键）、前言（所有步骤之外的每一行正文）和每个步骤的每一行逐一匹配，围栏代码也包括在内。
在其所在子句中先前被否定的匹配不算证据：同一句中它之前 60 个字符以内出现 never、not、no、nor、without、avoid、don't、doesn't、won't、cannot 或 can't 时，该匹配被丢弃，除非规则设置了 `"negatable": false`。
frontmatter 的 `allowed-tools` 列表和每个 `mcp__<server>__<tool>` 名称会直接添加工具标签，`argument-hint` 会添加 `input.arguments`：

| `allowed-tools` 条目 | 标签 |
| --- | --- |
| `Bash` | `tool.shell`；`Bash(git ...)` 添加 `tool.git`，`Bash(gh ...)` 添加 `tool.github`，`Bash(npm\|npx\|pnpm\|yarn ...)` 添加 `tool.package-manager` |
| `Read` | `input.files` |
| `Write`、`Edit`、`MultiEdit`、`NotebookEdit` | `tool.edit`、`output.files` |
| `Grep`、`Glob` | `tool.search` |
| `WebFetch`、`WebSearch` | `tool.web` |
| `Task`、`Agent` | `tool.subagent` |
| `AskUserQuestion` | `human.question` |
| `mcp__<server>` 或 `mcp__<server>__<tool>` | `tool.mcp-<server>`，显示名称为 `MCP: <server>` |

链接和标签检测最多读取每行的前 4,000 个字符。
