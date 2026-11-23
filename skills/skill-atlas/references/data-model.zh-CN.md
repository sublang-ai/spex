<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->
<!-- skill-atlas:source sha256=e43d6412bd3a4a40bce90a0e039045df2e83595099ccd7bd5d452026bd0f932c own=3eec62218556450af9517dff08fd5b066d9791c26bcee494517560263a7371e1 -->

> 本文件是 `data-model.md` 的简体中文译本，供人阅读；代理使用的是原文件。

# 技能图谱数据模型

技能图谱读写的三个 JSON 文档。
手工编辑 `annotations.json`、通过 `atlas.mjs workflows` 修改 `workflows.json`，或在其他工具中使用 `atlas.json` 之前，请先阅读本文件。

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
| `workflows.json` | 视图（或用户）、通过 `atlas.mjs workflows` 的代理 | 视图、代理 | 状态目录 |

状态目录为 `~/.skill-atlas/`，除非 `--state <dir>` 指定了其他目录，例如团队共享的仓库中的 `.skill-atlas/`。
每个技能都以其 id 为键：即它的 `name`，同名而内容不同的后续技能则为 `<name>@<rootId>`（见[检测规则](#检测规则)）；从不以路径为键，因此两个状态文件在重新安装或移动后依然有效。

## atlas.json — 扫描发现了什么

```jsonc
{
  "version": 1,
  "generatedAt": "2026-11-21T08:00:00.000Z",
  "cwd": "/abs/project",
  "roots": [
    {
      "id": "project-claude",          // 只取决于该文件夹本身，指明它在仓库中的位置：packages/ui 中的为 "project-claude.packages.ui"
      "path": "/abs/project/.claude/skills",
      "scope": "project",              // project | user | plugin | extra
      "agent": "claude-code",          // 加载此文件夹的代理，或 "universal"
      "label": "Project · Claude Code",
      "agents": ["claude-code"],       // 加载此文件夹的代理；--root 的和项目的 skills/ 则没有
      "skillCount": 3
    }
  ],
  "agentNames": { "claude-code": "Claude Code", "gemini-cli": "Gemini CLI" },   // 各代理的名称，以其键为键
  "tagCatalog": [                      // 下文用到的每个标签 id，无论静态还是动态
    { "id": "tool.shell", "category": "tool", "label": "Shell" }
  ],
  "skills": [
    {
      "id": "code",                    // 等于 name；同名而内容不同的第 2 个及以后的技能为 "<name>@<rootId>"，其在根中的文件夹不是其名称时为 "<name>@<rootId>@<folder>"
      "name": "code",
      "description": "…",
      "root": "project-claude",
      "plugin": null,                  // scope 为 "plugin" 时的插件名
      "dir": "/abs/project/.claude/skills/code",
      "file": "/abs/project/.claude/skills/code/SKILL.md",
      "digest": "9b90c1…",             // SKILL.md 字节的 SHA-256（十六进制）；无法读取时为 null
      "language": "en",                // SKILL.md 所用的语言（见“语言”）；无法判断时为 "und"
      "copies": [                      // 存放同一技能（逐字节相同）的其他文件夹
        { "root": "user-codex", "dir": "/home/me/.codex/skills/code" }
      ],
      "sameName": [                    // 此名称下其他内容不同的技能（见下文）
        { "id": "code@user-claude", "relation": "override", "agents": ["claude-code"], "wins": "code@user-claude" }
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
    { "from": "dev", "fromStep": "dev#2", "name": "branch", "kind": "calls", "evidence": { "line": 12, "text": "…" } }
  ],
  "insights": [
    { "kind": "duplicate-name", "skills": ["lint", "lint@project-codex"], "params": { "name": "lint", "agents": ["codex"], "copies": [ /* … */ ] }, "message": "…" }
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

洞察类型：`duplicate-name`（同名而内容不同、某个代理可能加载其中任一个的技能）、`unresolved-link`、`cycle`、`oversized`（SKILL.md 超过 500 行）、`missing-description`、`name-mismatch`（frontmatter 的 `name` 与文件夹名不同）、`invalid-frontmatter`（frontmatter 中有字段无法读取：该字段被略去，其余字段照常保留，只有 `name` 无法读取时才以文件夹名命名技能）、`no-steps`、`stale-annotation`（`annotations.json` 中按该技能的另一版文本写成、因而未被应用的条目）。

为多个代理安装的同一个技能（一个文件夹被链接到多个根目录，或被复制且每个文件都逐字节相同：相对路径相同，译本也算在内，其中每个链接的链接文本也相同）是一条记录，其他位置列在 `copies` 下。
大到无法完整列出（超过 5,000 个文件或 2,000 个文件夹）、总大小超过 64 MiB、含有指向其外部的链接或含有无法读取的条目的文件夹，算作不同。
同名而文件夹不同的技能各自在 `sameName` 下列出其余几个，`{ "id", "relation", "agents", "wins" }`，关系由各代理加载它们（副本也算在内）所用的文件夹判定，取第一个适用的行：

| `relation` | 何时 | `agents` | `wins` |
| --- | --- | --- | --- |
| `conflict` | 某个代理两者都加载，且它对两者所在的文件夹不分先后 | 这些代理 | null |
| `override` | 两者都加载的每个代理都偏向其中一个文件夹 | 加载 `wins` 的代理 | 这些代理加载的那个 id；各代理加载的不一致时，每个被加载的 id 一个条目 |
| `other-agent` | 没有代理两者都加载，因此各自只看到一个，两者可能已各自改动 | 没有，因为没有代理两者都加载 | null |

- 代理把项目的文件夹排在主目录的之前，把较近的项目文件夹排在较远的之前；Claude Code 则把主目录的排在项目的之前，把较远的项目文件夹排在较近的之前；Codex 在这个名称下两者都提供，不分先后；Gemini CLI 还在同一处把共享的 `.agents` 文件夹排在它自己的之前（见 `scripts/lib/roots.mjs` 中的 `AGENT_PRECEDENCE`）。
- 插件的技能名为 `<plugin>:<name>`，因此只与同一插件的技能同名；`--root` 的技能和项目自己的 `skills/` 都不被任何代理加载。
- 加载其他代理的副本的代理，是其各文件夹 `agents` 中的代理。
- 只有含 `conflict` 的名称才是 `duplicate-name` 洞察，涵盖相互冲突的各个副本；覆盖和其他代理的副本都不算问题。

## annotations.json — 叠加在扫描之上的修正

扫描是模式匹配；读懂了技能的人在这个文件中修正它。
`atlas.mjs scan` 在检测之后应用此文件，并把它添加的每一项都标记为 `"source": "annotation"`。

```jsonc
{
  "version": 1,
  "skills": {
    "code": {
      "source": { "sha256": "9b90c1…",     // 可选；写此条目时所依据的 SKILL.md 的 `digest`
                  "files": { "references/phases.md": "5e1f0a…" } },   // 可选；写此条目时所依据的其他每个文件，由 `atlas.mjs digest` 得出
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
- 被替换的步骤，其 `line` 和 `endLine` 为 null，其 `summary` 作为 `excerpt`；扫描在原步骤中找到的标签和链接保留在整个技能上（`fromStep` 为 null），每个目标一条链接，`calls` 优先于 `mentions`。
- 不在 `tag-rules.json` 中的标签 id，只要形如 `<category>.<slug>` 就会被接受；其显示名称就是 slug。
- 指向未安装技能的条目会被忽略，并在 stderr 上报告。
- 键是技能的名称（为该名称下没有以自己 id 为键的每个技能服务），或技能的 id；其值可以是一个条目，也可以是一组条目，每个条目依据该技能的另一版文本写成：`"code": [ { "source": { "sha256": "9b90c1…" }, … }, { "source": { "sha256": "41d07e…" }, … } ]`。
- 条目的 `source` 哈希值表明它是为哪个技能写的：在记录了某技能 `digest` 的条目中，最后一个就是该技能的注解，并完全取代之前的条目——其 `source.files` 中每个文件都具有所记录的哈希值时它被应用，否则该技能报告 `stale-annotation`，之前的条目也不会被应用；该键下没有任何条目记录其哈希值的技能，在该键是它被报告时所用的名称或它的 id 时，取该键最后一个没有记录哈希值的条目；记录了其他哈希值的条目不会被应用，其 `translations` 中的文字也不会。
  列出的文件缺失、位于技能文件夹之外或无法读取时即不相符；只读取列出的文件，且只为有这种条目的技能读取。
  `atlas.mjs digest <file>...` 为每个文件打印一行 `<sha256 hex>  <path>`，即其字节的哈希值，与 `source` 和译本记录中所存的完全一致。
  在一个名称下，记录了同名的另一个不同技能（`<name>@<rootId>`）哈希值的条目应用于那个技能，除非文件中有以它自己的 id 为键的条目；没有记录哈希值的条目仍归持有该名称的技能。
  同名、`SKILL.md` 相同而其他文件不同的技能共用同一个哈希值，因此在名称下，最后一个记录它的条目是每个这类技能的注解，其文件未被该条目列出的那个报告 `stale-annotation`：应改为以各自的 id 为键。
  同名的每个技能各自判断：没有任何条目应用于它、而有条目记录了它的 `digest`（某个列出的文件已改动）或记录了不属于任何同名技能的哈希值时，它报告 `stale-annotation` 洞察，因为状态目录为所有项目共用，这样的条目可能是为其中任何一个技能的早先文本写的。

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
- 代理以同样的方式读写该文件：
  - `atlas.mjs workflows [--state <dir>]` 打印 `{ "etag": "<version>", "doc": { … } }`，没有文件时为空文档和 `"none"`，文件无法作为工作流文档读取时失败并指出该文件；
  - `atlas.mjs workflows --put <file|-> --if-match <etag> [--state <dir>]` 在服务器的条件和锁之下写入该文档，并打印新的 etag；文件在读取之后已被修改（请重新读取）、文档无效或所存文件无法读取时都会失败，所存文件保持不变。

## 语言

语言以其标签命名：`en-US`、`zh-CN`。
页面自身的文字在源代码中是英文；其他每种语言都是下列文件中的数据。

### 技能文件的译本

一个文件的译本，是它旁边在扩展名前加上标签的文件：`SKILL.md` 的译本是 `SKILL.zh-CN.md`，`references/prompts.md` 的译本是 `references/prompts.zh-CN.md`。

- 只有当标签以规范形式（大小写除外）命名一种已知语言——两个字母的语言代码，可带子标签（`zh`、`zh-CN`、`en-US`），或至少带一个子标签的三个字母的语言代码（`yue-HK`），因此 `app.dev.yaml`、`data.min.json` 和 `notes.bak.md` 仍是普通文件——扩展名是 `.md`、`.json`、`.txt`、`.yaml` 或 `.yml`，且它所翻译的文件存在时，该文件名才被视为译本。
- 扫描先在技能自己的文件夹中查找，再到状态目录的 `translations/<skill id>/` 中按相同的相对路径查找：`~/.skill-atlas/translations/pdf/SKILL.zh-CN.md`。
  在同一个标签下，采用技能文件夹中的译本，除非它落后于源文件、而状态目录中的译本记录了源文件的哈希值且该哈希值与源文件相符；没有记录哈希值的状态目录译本绝不取代技能自己的译本。
  扫描得到的文字、`files[].translations`、过时与修改标记以及 `/api/file` 都依从被选中的那一个。
  状态目录是代理为他人发布的技能写入译本的地方；见 [translate.md](translate.zh-CN.md)。
- 对读者的语言，先选标签，再只在该标签内选文件夹：有译本位于所要的标签下时用该标签，否则用同一语言和文字的各标签中名称顺序的第一个（对 `zh-CN` 而言 `zh` 先于 `zh-Hans`，绝不是 `zh-TW`）。
  因此对 `zh-CN` 而言，落后于源文件的 `SKILL.zh.md` 优先于未落后的 `SKILL.zh-Hans.md` 被读取，并标记为落后，在页面上和 `/api/file` 中都是如此。
- 译本记录两者最后一致时源文件字节的 SHA-256，Markdown 译本还记录它自己的 SHA-256，由 `atlas.mjs pin` 写入：
  - 在 Markdown 中，是一行 `<!-- skill-atlas:source sha256=<64 hex> own=<64 hex> -->`，位于 frontmatter 及其后的 SPDX 注释行之后；`own` 是该文件去掉字节顺序标记、换行统一为 LF 并略去这一行之后的 UTF-8 文本的 SHA-256；
  - 在文本中，是同样的一行，但没有 `own=`；
  - 在 YAML 中，是一行 `# skill-atlas:source sha256=<64 hex>`；
  - 在 JSON 中，是一个顶层的 `"translationOf": { "sha256": "<64 hex>" }`。
- 所记录的源文件哈希值与源文件不符的译本是*过时的*（落后于源文件）；所记录的自身哈希值与自身不符的 Markdown 译本是*脱离源文件修改过的*（代理遵循的是源文件）；没有记录哈希值的译本两者都不是。
- `pin` 只改写记录行；只要有一个指定的译本无法写入记录，就不写入任何文件；`pin --check` 列出每个过时、脱离源文件修改过或没有记录哈希值（Markdown 译本则包括没有记录自身哈希值）的译本，以及每个指定的、不含任何译本的文件夹。
- 指定的文件夹代表其中任意深度的每个译本，`.agents`、`.claude` 等隐藏文件夹和链接进来的文件夹（从别处链接进来的技能）也包括在内，每个实际文件夹只读一次；只有 `.git` 和 `node_modules` 会被跳过。
  其中无法跟随的链接会被列出，并使 `pin` 和 `pin --check` 都失败。
- 通过链接（符号链接或硬链接）即为其源文件本身的文件不是译本：在文件夹中被跳过，被点名时被拒绝，绝不会被写入。
  译本翻译的是什么，按到达它所用的名称判断，与扫描和服务器的读法一致（链接到旁边 `body.md` 的 `translations/<skill id>/SKILL.zh.md` 翻译的是 `SKILL.md`）；能否写入它，则按它实际是哪个文件判断。
  被当作两个源文件之译本的同一文件，或通过任何链接与本次运行的某个源文件、或与本次运行涉及的某个文件夹（每个指定的文件夹、状态目录中译本所属的技能，按其路径和按其实际指向的、容纳该译本的技能文件夹和文件夹，以及在这些文件夹中都找不到它的某个名称时，每个被扫描技能的文件夹；状态目录中名称不表示译本的文件不属于任何技能）中某个并非其源文件之译本的文件是同一文件的译本，或有一个在这些文件夹中都找不到的硬链接（例如在 `.git` 或 `node_modules` 下，或在读取的所有文件夹之外）的译本，会连同那个文件一起被列出，并使 `pin` 和 `pin --check` 都失败，且不写入任何文件。
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

一个文件的语言，是其 frontmatter 在 `metadata.language` 中指明的语言（仅限 `SKILL.md`），否则由它在围栏代码和 HTML 注释之外的全部文本判断：汉字、假名和谚文字母各按三个计，多于拉丁字母时，假名至少占汉字与假名的十分之一则为 `ja`，谚文占多数则为 `ko`，否则为 `zh`；拉丁字母占多数为 `en`；其他任何文字的字母占多数为 `und`。
`atlas.json` 中每个技能的 `language` 是其 `SKILL.md` 的语言。
有三种洞察类型报告译本的情况：`stale-translation`、`edited-translation` 和 `translation-steps`（译本的步骤数与技能的不同）。
`stale-translation` 的消息指明更新后的译本要写入的、状态目录 `translations/<skill id>/` 下的文件，以及为该文件执行的 `pin` 命令；对于位于技能文件夹中的译本，消息还指明该文件：技能文件夹归用户本人编辑时，可以改为就地更新并固定它。
它的 `params` 和 `edited-translation` 的 `params` 以数据形式给出同样的修复：`repairs`，每个文件一项，`{ "file": "<相对路径>", "writeTo": "<state>/translations/<skill id>/<相对路径>" 或 null, "own": "<技能文件夹中的绝对路径>" 或 null }`——`writeTo` 是状态目录中要写入的文件（技能文件夹中被修改过的译本为 null），`own` 是该文件本身位于技能文件夹中时的路径——以及 `command`，即消息中给出的那条 `pin` 命令，原样照录，`<skill-dir>` 和 `<state>` 分别代表本技能的文件夹和状态目录。

每条洞察都带有 `params`，即构成其消息的值，以便页面用任何语言表述它：

| 类型 | `params` |
| --- | --- |
| `duplicate-name` | `name`、`agents`（可能加载其中任一副本的代理）、`copies`（每个冲突副本一项 `{ "id", "path", "root", "rootLabel" }`，`path` 为其文件夹） |
| `unresolved-link` | `name`、`from`、`kind`（其中任一链接为调用时为 `calls`，否则为 `mentions`） |
| `cycle` | `path`（按顺序排列的技能 id：一个最短的环，作为示例；洞察的 `skills` 列出这组相互调用的每一个技能） |
| `oversized` | `lines` |
| `missing-description`、`no-steps`、`stale-annotation` | —（`{}`） |
| `invalid-frontmatter` | `named`（其 `name` 是否可读，即技能是否不以文件夹命名） |
| `name-mismatch` | `name`、`folder` |
| `stale-translation` | `lang`、`files`（落后于源文件的相对路径）、`repairs`、`command` |
| `edited-translation` | `lang`、`files`（脱离源文件修改过的相对路径）、`repairs`、`command` |
| `translation-steps` | `lang`、`steps`、`expected` |

在 `annotations.json` 中，一个技能的条目可以按语言重复给出其文字；某个标签下的文字总是报告在恰为该标签之下：有该标签自己的条目时覆盖在它之上，否则覆盖在名称顺序中第一个语言和文字相同的标签下译本文件条目的副本之上（`zh-CN` 对应 `zh`，绝不对应 `zh-TW`），否则自成一个条目（`origin` 为 `"annotation"`）。
文件自己的条目绝不因另一个标签的文字而改变：`SKILL.en.md` 之上 `en-US` 和 `en-GB` 下的文字得出三个条目，`en`（文件的）、`en-US` 和 `en-GB`（各为文件的字段加上自己的文字）：

```jsonc
"code": {
  "summary": "Implements a request as one commit per phase.",
  "translations": {
    "zh-CN": { "summary": "把请求实现为每阶段一次提交。", "steps": [ { "title": "…", "summary": "…" } ] }
  }
}
```

### 服务器的应答

- `GET /api/file?skill=<id>&path=<relative path>&lang=<tag>` 返回 `{ "language", "path", "stale", "edited", "text" }`：有该标签下的译本，否则有名称顺序中第一个语言和文字相同的标签下的译本（对 `zh-CN` 而言为 `zh`，否则为 `zh-Hans`，绝不是 `zh-TW`），且为其文件夹内的普通文件时，按上述规则返回技能文件夹或状态目录中的译本，并带有其标签作为 `"language"` 和译本自己的相对路径（`SKILL.zh-CN.md`）；否则为文件本身，并带有 `"language": null`、它的相对路径、`"stale": false` 和 `"edited": false`。
  返回原文件时还带有 `"sourceLanguage"`，即它所用的语言，由它自己的文本判断（见上文）。
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
  在 `labels` 下，一个标签只含它自己的名称文件的字段，页面按选择技能译本的同一规则，为三个名称文件各自选择标签，因此一个文件的标签绝不会遮住另一个文件的。
- 页面的语言依次取：读者在页面上的选择（保存在浏览器中），否则 `--lang`，否则浏览器的语言（当某个消息目录的标签就是它，或与它的主子标签和书写系统都相同时：`zh` 和 `zh-SG` 对应 `zh-CN`，`zh-TW` 没有对应），否则 `en-US`。

## 检测规则

扫描的文件夹：

- 项目是 `--cwd` 所在的文件夹，以及其真实路径之上直到所在仓库根目录（最近的含有 `.git` 条目的文件夹）的每一级文件夹，近的在前；不在仓库中时只有 `--cwd` 的文件夹。
  经由链接到达的 `--cwd` 因此找到的文件夹与链接所指的文件夹相同。
  根 id 只取决于其文件夹本身，从不取决于其他文件夹、安装或选项，也不取决于它们的顺序；它指明该文件夹在仓库中的位置，从仓库中任何工作文件夹扫描都相同：仓库根目录（不在仓库中时为 `--cwd` 的文件夹）中的各项保留 `project-agents` 这样的 id；其下文件夹中的各项再加上 `.` 和该文件夹相对仓库根目录、按文件系统拼写的路径，各段以 `.` 连接，由小写字母和数字组成、以单个连字符连接的段保持原样，其他段则为其短名加 `_` 和该段 SHA-256 的八位十六进制数字（`packages/ui-kit` 对应 `project-agents.packages.ui-kit`，`packages/ui/kit` 对应 `project-agents.packages.ui.kit`，`packages/UI kit` 对应 `project-agents.packages.ui-kit_<hex>`）。
  `--root` 的 id 为 `extra-`，加上按上述规则处理的文件夹名、`_` 和其真实路径 SHA-256 的八位十六进制数字，二者都按文件系统的拼写，因此经由链接或以另一种大小写给出时也相同；同一文件夹指定两次只算一个根。
  插件的 id 为 `plugin-`，加上 `installed_plugins.json` 中其键给出的名称和市场，各按上述规则处理，以 `.` 连接（`tools@m` 对应 `plugin-tools.m`）；为某个项目记录的安装再加上 `.`、其作用域、`_` 和该项目路径 SHA-256 的八位十六进制数字；同一插件对同一位置的两条记录，取第一条。
  同名（不计大小写）而内容不同的技能中，按其第一个文件夹排在最前的那个——先按在仓库根目录以下的深度（根目录自己的文件夹和项目之外的文件夹深度为零，较浅的在先），再是项目的行先于主文件夹的、插件的和 `--root` 的行，项目和主文件夹的各行按扫描器固定的代理顺序（`scripts/lib/roots.mjs` 中的 `AGENT_ROOTS`），插件和 `--root` 按其 id，然后按其在根中的文件夹路径逐字符比较——以名称本身为 id，因此不带限定的 id 取决于安装了哪些同名技能，排在最前的那个被移除时由下一个取得；其余每个的 id 只取决于它自己的名称、根和文件夹：`<name>@<rootId>`，其在根中的文件夹路径不是其名称时再加上 `@` 和按上述规则处理的该路径（`a/foo` 对应 `foo@project-agents@a.foo`）。
  含有 `@`、`#`、`/`、`\` 或控制字符的名称，以及 `.` 或 `..`，在 id 中写作其短名加 `_` 和其 SHA-256 的八位十六进制数字。
  任何两个 id 都不会只在大小写上不同，因此在任何文件系统上，每个 id 都指明状态目录 `translations/` 下它自己的文件夹：两个只在大小写上不同的名称，第二个按上述规则加以限定。
  被多行到达的同一文件夹（`--cwd` 即主文件夹，`--root` 或 `CLAUDE_CONFIG_DIR` 指向项目的某个文件夹，或一个文件夹的技能链接到另一个的）只扫描一次，项目的行先于主文件夹的、插件的和 `--root` 的行，同一类中取不经自身链接到达它的那一行，各自再取 id 顺序中的第一行，因此另一行不会改变任何 id。
  其显示名称带有该路径：`Project (packages/ui) · Universal`。
- 每个项目文件夹和主目录中每个代理的技能文件夹（`.claude/skills`、`.agents/skills`、`.codex/skills`、`.cursor/skills`……；`CLAUDE_CONFIG_DIR` 和 `CODEX_HOME` 代替主目录的 `.claude` 和 `.codex`），主目录 Codex 技能下 `.system` 中 Codex 自带的技能，主目录的 `.config/opencode/skills`、`.config/agents/skills`（与 `.agents/skills` 一样被加载）、`.config/goose/skills`、`.copilot/skills` 和 `.codeium/windsurf/skills`（设置了 `XDG_CONFIG_HOME` 时，由它代替主目录的 `.config`），每个项目文件夹的 `.github/skills`，以及每个项目文件夹中含有技能的 `skills`。
- `--agent <id>` 保留该代理的文件夹、该代理加载的 `.agents/skills` 和 `.config/agents/skills`（除 Claude Code 外的代理都加载它们），以及 `--root` 指定的文件夹；项目的 `skills` 不保留。
- Claude Code 插件的 `skills`：`plugins/installed_plugins.json` 记录该插件为用户或本项目安装，且 `enabledPlugins` 没有把它设为 `false`；依次读取用户的 `settings.json`、项目的 `.claude/settings.json` 和项目的 `.claude/settings.local.json`，项目的每个文件夹都读取，较远的先读，对同一插件，后读的文件的值优先于先读的。
- 在每个文件夹中，含有 `SKILL.md` 的子文件夹或其下一级文件夹是一个技能；名称以点开头的文件夹和 `node_modules` 会被跳过。

步骤按以下优先顺序识别，结构识别时忽略围栏代码：

1. 标题为 `Step N`、`Phase N`、`Stage N`、`Part N`、`步骤 N`、`阶段 N`、`第 N 步`、`第 N 阶段`、`第 N 部分` 或 `N. Title` 的标题，且有两个或更多处于同一级别。
2. 位于指明某种流程的标题（`Workflow`、`Steps`、`Process`、`Procedure`、`Instructions`、`How to`、`Usage`、`Quick start`、`工作流`、`流程`、`步骤`、`过程`、`规程`、`说明`、`指令`、`如何`、`用法`、`使用方法`、`快速开始`、`快速入门`）之下的有序列表，或正文开头的有序列表：位于可选的 `#` 标题和至多一段以冒号（`:` 或 `：`）结尾的引导段落之后，列表之前的空行、HTML 注释和引用说明（`>` 开头的行，例如译本给读者的说明）都会被跳过。
3. 否则取 `##` 章节，以 `stepKind: "section"` 报告。

从一个技能指向另一个名为 `N`（或 `<plugin>:N`）的已安装技能的链接，从描述和围栏代码之外的正文中读取，每个段落或列表项作为一段文本：其各行无论在何处换行都连接起来，引用的 `>` 不计，没有 `>` 的行延续引用中的段落，Markdown 链接或图片按其可见文字读取（`[$review](…)` 读作 `$review`），因此链接的形式和类型从不取决于在何处换行或名称是否加了链接；空行、标题、列表项的开头、表格行、HTML 块的开头（注释、声明、`<script>`、`<pre>`、`<style>`、`<textarea>` 或 `<div>` 这样的块级标签，绝不是 `<kbd>` 这样的行内标签或自动链接）、分隔线和围栏代码都会结束一段文本，无论这段文本多长，证据引用并标出名称所在的那一行：

| 文本中的形式 | 类型 |
| --- | --- |
| 作为命令的 `/N`：斜杠前紧邻的不是单词字符、`/`、`.`、`-`、`~`、`:` 或 `@`，斜杠前紧邻的也不是路径用词（`under`、`in`、`into`、`at`、`to`、`from`、`of`）或 HTTP 方法，名称之后不是单词字符、`/` 或 `-`（`.` 或 `:` 只能作为标点）；类似文件夹的名称（`docs`、`src`、`api`、`tmp`……）只在提到 skill、command、slash 或 playbook 的句子中算数 | `calls` |
| `Skill(N)` | `calls` |
| 作为键的 `skill: N`：小写，位于行首（或 `- ` 列表项开头），或在 `{` 或 `,` 之后 | `calls` |
| `$N`（带或不带反引号）在某个表示使用的动词之后几个词以内，且两者之间没有 `,`，以及以 `,`、`and`、`or`，或位于 `,`、`and` 或 `but` 之后的 `not` 或 `never` 与这样的 `$N` 相连的每个 `$N`，无论其间的名称是否为某个技能的名称；前面没有这样的动词的 `$N`、路径或 URL 中的 `$N`（`bin/$N`），以及 `$` 之后跟着没有技能叫这个名字的名称，都不算链接 | `calls` |
| `N` 在某个表示使用的动词（invoke、call、run、use、load、delegate to、hand off to、follow、start、trigger、launch）之后几个词以内，且紧挨 skill 或 playbook 一词，或者在 `N` 带反引号或斜杠前缀时紧挨 command 一词 | `calls` |
| 以上任一形式，在其句子中位于引向别处的用词（`not for`、`do not use`、`don't use`、`never use`、`instead of`、`rather than`、`see also`、位于 `,`、`and` 或 `but` 之后的 `not` 或 `never`）之后，且两者之间没有以使用类动词开头的分句（位于 `,`、`:`、破折号或 `but` 之后，动词前可有 `instead`），或出现在含有后面既不跟 `of` 也不跟使用类动词的 `instead` 的句子中——因此 ``use `/review` instead of `/publish` `` 和 ``instead of `/publish`, use `/review` `` 都调用 `review`、提及 `publish` | `mentions` |
| 单独的 `` `N` ``，当句子提到 skill 或名称中带连字符时 | `mentions` |

- 否定一直作用到其句子结束，除非其后跟着以使用类动词开头的分句，因此 ``do not run `$lint` and then run `$review` `` 对两者都是提及，而 ``do not run `$lint`, but run `$review` `` 调用 `review`。
- 被多个技能共用的名称，解析为发出链接的技能所在文件夹中的那个（副本所在的文件夹也算），否则为最先找到的那个；`<plugin>:N` 也指在该插件中有副本的技能。
- 每个（技能、步骤、目标）只保留一条链接，`calls` 优先于 `mentions`；技能指向自身的链接被丢弃。
- 指向未安装技能的链接，只有三种形式会在 `unresolved` 下报告：在提到 skill、command、slash 或 type 的句子中带反引号的 `` `/x` ``（且 `x` 不是类似文件夹的名称，也不是宿主的内置命令，例如 `/help`、`/clear` 或 `/compact`）；任意词之后的 `` `x` skill ``（``the `x` skill``、``our `x` skill``）；以及 `Skill(x)`，无论 `x` 是什么。
  每个的类型与该形式指向已安装技能时相同：`` `x` skill `` 只有在某个表示使用的动词之后几个词以内才是调用，任何被引开的形式都是提及；每个（技能、步骤、名称）只保留一个，`calls` 优先于 `mentions`。

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

链接和标签检测最多读取每行的前 4,000 个字符，链接检测在名称之前、其所在句子中最多 4,000 个字符内寻找引开的词。
