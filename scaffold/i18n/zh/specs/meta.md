<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# META: 规约定义

## 意图

本规约定义 specifications（specs）的结构和组织方式，遵循 [DR-000](decisions/000-spec-structure-format.md)。

## Organization

### META-1

The `specs/` directory shall contain the following subdirectories and files:

| Path | Content | File Naming |
| --------- | ------- | ------ |
| `decisions/` | decision records (DRs) | \<NNN\>-\<kebab-case\>.md |
| `intents/` | intent records (IRs) | \<NNN\>-\<kebab-case\>.md |
| `packages/` | spec packages ([META-9](#meta-9)) | [\<path\>/]\<kebab-case\>.md |
| `compositions/` | composition files ([META-31](#meta-31)) | [\<path\>/]\<kebab-case\>.md |
| `map.md` | spec index for navigation | - |
| `meta.md` | the spec of specs | - |

### META-43

A record's ID shall join its kind prefix to its filename's leading number: `DR-<NNN>` under `decisions/`, `IR-<NNN>` under `intents/`.
The leading number shall be unique within each record kind.
<!-- spex-i18n-source: META-3 sha256-512066ba4de4451666ad56ef74adb75f4ec372b3f60c4e3951c1e129764aa00c -->
### META-3

每个条目文件应包含一个说明其目的的 `## 意图` 章节。

### META-21

Spec test items shall specify integration and system tests only.
Unit tests belong to the implementation; no spec item shall specify one.

### META-38

A package's `## Verification` section shall hold only test items that verify the package's own items.
Such a test shall execute no other package and no external service; where an item relies on another party — a cited peer ([META-14](#meta-14)) or a slot ([META-13](#meta-13)) — the test itself supplies that party's behavior.
A test that executes another package or an external service is a composition test ([META-39](#meta-39)).

### META-39

A test item that executes more than one package, or a package with an external service, shall live in a composition file.
A composition test shall cite ([META-20](#meta-20)) the same-file binding or scenario items it executes, and the package items it directly checks.
A scenario test shall cite items of two or more packages; a binding test may involve one package and its service.

### META-40

Every binding and scenario item shall be cited by at least one same-file test item.

### META-41

A composition test's grade shall follow visibility: what is observable at the deployment's external boundary shall be tested there, as an acceptance test; what is observable only inside the deployment may be verified by deployment inspection.

## Record format

<!-- spex-i18n-source: META-4 sha256-26c850709807ff037ff721f22adc7257a68c219c12ee83a14d07ae6fa736dbd5 -->
### META-4

每个决策记录（DR）应遵循 ADR 格式 [[2]]，并包含以下章节：状态、背景、决策、影响。

<!-- spex-i18n-source: META-5 sha256-b6a4218645b0143fb80c4470575f67ac628d9e32d9ac4612a25c230e7b9cb78f -->
### META-5

每个意图记录（IR）应包含以下章节：目标、交付项（带复选框）、任务（编号且每项为一次提交大小）和验收标准。

### META-23

A record shall contain only what is needed to act on it or audit it, preferring bullets and tables to prose.

### META-24

A DR shall record design decisions and constraints, not implementation logic.
A DR is sufficient when an implementer can generate or audit code from it.
An outcome that code must honor shall be a spec item ([META-26](#meta-26)); a technology or architecture choice shall be a recorded decision with its rationale; a detail that is neither shall appear in no spec.

### META-25

In DR and IR prose, each sentence shall begin on a new line.
List items and table cells are exempt.
A sentence may wrap at a fixed column.

### META-37

An intent whose realization spans commits, or must be tracked before completion, shall have an IR; an intent realized in one commit needs none.
An IR shall carry only what is needed to understand the intent and its realization state, citing commits and issues rather than duplicating them.
The Deliverables checkboxes carry that state; realizing commits are found by their `IR-<N>` references, not relisted; an abandoned intent shall be marked abandoned, not deleted.

## Item syntax

<!-- spex-i18n-source: META-6 sha256-6a388878944a9426f53055410b686e33879d1e10c06c86d0d103b6a2f2d3a66c -->
### META-6

每个规约条目应使用 GEARS 模式 [[1]]：

```text
[给定 <静态前置条件>] [如果 <状态前置条件>] [当 <触发>] <主体>应<行为>。
```

子句和标点应遵循标准中文习惯。

| 子句 | 用途 | 示例 |
| ------ | ------- | ------- |
| 给定/Where | 静态前置条件（特性、配置） | 给定调试模式已启用 |
| 如果/While | 状态前置条件（运行时状态） | 如果连接处于活动状态 |
| 当/When | 触发事件（最多一个） | 当用户点击提交 |
| 应/shall | 所要求的行为 | 表单应校验输入 |

<!-- spex-i18n-source: META-7 sha256-7e2912d02d3d967a84c2ec8c850db8baa378197d78e517eb269ee665b9676426 -->
### META-7

当测试用例以 Given-When-Then（GWT）表达时，其规约条目应按以下方式将 GWT 映射到 GEARS [[1]]：

| GWT | 子句 |
| --- | ------ |
| Given | 给定/Where + 如果/While |
| When | 当/When |
| Then | 应/shall |

### META-8

Each item shall be self-contained:

- It shall have no implicit dependency on any section outside its own subsections.
- Every reliance on another spec or on a shared section shall be an explicit citation.

### META-26

A spec item shall state behavior as observable outcomes — file state, exit code, printed output, return value, network call — under named conditions, including any condition under which an outcome shall not occur.

### META-42

Each behavior, binding, scenario, or test item shall have one governing GEARS clause ([META-6](#meta-6)) naming one domain contract: a request, a decision, a state transition, an invariant, an installed relationship, a journey, or a verification run.
The item's attachments — its lists, tables, and code blocks — inherit the clause's normative force and shall elaborate that contract alone, including any format, grammar, or definition the clause names:

| Item kind | Attachments may carry |
| --- | --- |
| Behavior | ordered steps, or the cases and outcomes of one operation, decision, transition, or invariant |
| Binding | the mappings of one installed relationship ([META-36](#meta-36)) |
| Scenario | the stages of one journey or transition, or the cases of one standing rule |
| Test | the assertions of one verification objective: one setup and execution flow, or one explicit case matrix |

A condition inside an attachment is a case label, not a trigger; the one-trigger rule of [META-6](#meta-6) governs the clause alone.
Differing triggers or lifecycles are evidence of two contracts.
An umbrella phrase — "handle correctly", "support behavior" — names no contract.

## Spec packages

### META-9

A spec package shall be one item file ([META-3](#meta-3)) under `packages/`.
Subdirectories of `packages/` group files for navigation only ([META-32](#meta-32)).

### META-10

A spec package shall have a basename \<kebab-case\>.md unique across `specs/packages/` and `specs/compositions/`, and a short form \<ALLCAPS\> unique across the same set.

Example: `package-management.md` has short form `PKGMGT`.
<!-- spex-i18n-source: META-28 sha256-c8fb6a33f07dc6e9dfb8b8ab0511bc2b9c76f8856e67ff8ad61d033a34d0af11 -->
### META-28

每个包文件应只包含下列 `##` 章节，并按此顺序排列：

| 章节 | 是否必需 | 内容 |
| ------- | -------- | ------- |
| `## 意图` | 必需 | 包的目的（[META-3](#meta-3)） |
| `## 外部行为` | 可选 | 包的使用者可以依赖的结果与保证 |
| `## 内部行为` | 可选 | 消费型需求与私有不变量，对包的使用者隐藏 |
| `## 验证` | 可选 | 检验本包主张的测试条目（[META-38](#meta-38)） |
| `## 参考资料` | 可选 | 外部来源（[META-19](#meta-19)） |

`## 外部行为` 与 `## 内部行为` 至少应有其一。
包的使用者是使用其契约的任何人、宿主或对等组件；这一分类相对于包而言，对等组件只可依赖外部行为。
主题小节（`###`）与条目标题（`###` 或 `####`）位于行为章节和验证章节内部。
本地化 scaffold 会翻译这些章节名；以捆绑模板定义的名称为准。

### META-11

Each item shall have an ID unique within `specs/`, in \<PACK\>-\<N...\> format (e.g., AUTH-11, URL-3), as a markdown heading for anchor linking.
\<PACK\> is the short form ([META-10](#meta-10)) of the containing file.

### META-12

An ID that has appeared in a release is reserved, together with the concern it names: it shall not be renumbered, reused, or reassigned, and its wording may change only while that concern is preserved.
An ID that has appeared in no release may be renumbered, reassigned, or overwritten; a new item takes the next free ID.

### META-13

A spec package shall define a closed set of subjects and their behaviors for a single intent.
The shall clause ([META-6](#meta-6)) of a package item shall involve only subjects and behaviors of its own package.
A party the package requires but does not select (e.g., "the deployment's media provider") shall be named abstractly; such a name is a slot, and only a binding item ([META-36](#meta-36)) binds it.

### META-14

A precondition or trigger clause ([META-6](#meta-6)) of a package item may cite another package's External Behavior where the reliance is a fixed semantic dependency of the citing package's contract; no clause of a package item shall cite another package's Internal Behavior.
Where the counterparty is selectable, the item shall name a slot ([META-13](#meta-13)) instead.

### META-15

A spec package shall stand alone, minimizing references to the containing project; its `## Intent` section shall be self-contained prose with no citations.
A package's dependencies on other packages shall appear only as clause citations ([META-14](#meta-14)); a slot's binding shall live under `compositions/` ([META-31](#meta-31)), and the DR that selects the bound party shall cite the binding item ([META-17](#meta-17)).
A package shall claim no exclusivity over the deployment; exclusivity is a deployment rule, stated by a binding item ([META-36](#meta-36)).

### META-31

Files under `compositions/` shall describe the deployment: the installed system that packages and selected external services compose.
They shall use two item kinds: a binding item declares one installed relationship ([META-36](#meta-36)); a scenario item declares one runtime behavior of the deployment, triggered or standing, and may take the deployment as its subject.
Each composition file shall cover one concern and be named after that concern, not after the packages it involves.

### META-35

Only a declared counterparty is bindable: a slot ([META-13](#meta-13)), or a deployment surface the binding item itself names ([META-36](#meta-36)).
A consumed requirement is an Internal Behavior item stating a supplied meaning together with the package's own acceptance and rejection handling of it.
A private invariant is an Internal Behavior item whose behavior no declared counterparty supplies; it shall not be a binding endpoint, and declaring a counterparty solely to externalize it does not make it consumed.
Replaceability alone creates no slot: a dependency no package item names — a library, a framework — gets no binding item, and its selection lives in a DR.
A slot stays bindable however its party is realized: in-process, in-house, or remote.

### META-36

A binding item shall declare one installed relationship by clause: each precondition clause cites the client need it serves — a slot ([META-13](#meta-13)), a consumed requirement ([META-35](#meta-35)), or a deployment surface the item itself names — and the shall clause states the provision.
The provision shall be one or more mappings, each in one of two forms: resolve the need to a supplier — another package's External Behavior, or a named external service; or state what the deployment itself supplies — a rule over cited External inputs (an authorization policy, an exclusivity constraint), or a concrete installed value (a name, a label).
The item's wording shall make each mapping's form plain.
A provision-side citation shall target External Behavior only; a DR citation in either clause is a policy reference, not an endpoint.
A binding item is static: Where preconditions and a shall clause, never a While or When trigger; a triggered sequence is a scenario item ([META-31](#meta-31)).
A binding item declares; whether the deployment realizes the relationship is the question of its tests ([META-39](#meta-39)).
Each client need shall have exactly one effective binding per deployment, unless its own declaration defines aggregation or selection; a need with no effective binding marks an incomplete deployment, not a disabled feature.

A binding item reads as one GEARS sentence:

```text
Where <the client need>, the deployment shall <resolve it to supplier External Behavior or a named external service, or state the deployment's own rule or value>.
```

### META-32

A subdirectory under `packages/` or `compositions/` is a navigation collection only: no spec, tool, or reader shall infer relationships, layering, or ownership from directory placement.
A file's identity is its basename and short form ([META-10](#meta-10)); moving a file between collections changes relative citation paths and shall change no item ID, short form, or anchor.

### META-33

Files under `packages/` shall not cite files under `compositions/`.
<!-- spex-i18n-source: META-34 sha256-7b12efd27bd5c100b388b86ce8a7cf448be913c6dc3aedc88eff17efce1d66c4 -->
### META-34

每个组合文件应只包含下列 `##` 章节，并按此顺序排列：

| 章节 | 是否必需 | 内容 |
| ------- | -------- | ------- |
| `## 意图` | 必需 | 该组合关注点的目的（[META-3](#meta-3)） |
| `## 绑定` | 可选 | 绑定条目（[META-36](#meta-36)） |
| `## 场景` | 可选 | 面向组合系统的集成行为条目 |
| `## 测试` | 必需 | 引用其所验证内容的测试条目（[META-20](#meta-20)） |
| `## 参考资料` | 可选 | 外部来源（[META-19](#meta-19)） |

`## 绑定` 与 `## 场景` 至少应有其一。
当两个章节同时存在时，每个绑定条目应被至少一个结果依赖于它的同文件场景条目引用——没有任何同文件场景依赖的绑定，或服务于多个文件关注点的绑定，应放入仅含绑定的文件。
绑定总览、以包为中心的索引等基于这些文件的投影应是派生的只读视图。
本地化 scaffold 会翻译这些章节名；以捆绑模板定义的名称为准。

## Citation

### META-16

A citation of an item shall be a relative link with an anchor (e.g., `[META-1](meta.md#meta-1)`), written inline at the phrase that relies on it; a reference-style link is not a citation.

### META-17

DRs and items may cite each other.

### META-18

No spec except `map.md` shall cite an IR; naming an IR in prose is a citation.
<!-- spex-i18n-source: META-19 sha256-2cfff4baa08792e11640935155b6b6d6de19de8523c645a91603e28f7cb91285 -->
### META-19

规约中的外部引用应引用权威来源（例如官方文档），并使用带编号的标记（例如 `[[1]]`）指向 `## 参考资料` 章节中的具体 URL，且该章节不应包含未被引用的条目。

### META-20

A test item shall cite every behavior item it verifies, inline at the assertion that verifies it: a Verification item cites same-file anchors; a composition test cites `packages/` items plus the same-file binding or scenario anchors ([META-39](#meta-39)).
A citation binds its adjacent phrase: it shall cite exactly the behavior that phrase relies on, exercises, or checks — never ambient, transitive, or merely invoked behavior.
A binding item's precondition may cite a consumed requirement as its client ([META-35](#meta-35)); a scenario or test item may cite Internal Behavior its claim materially needs; neither citation reclassifies or exposes the cited item.
No item shall carry a relationship-metadata line — `Verifies:`, `Binds:`, `Clients:`, or any other line declaring a relationship; the citations in an item's clauses are the single source of its relationships.
A machine-readable declaration an item defines as its own content — like the language marker of [META-27](#meta-27) — is not relationship metadata.

## Authoring language

<!-- spex-i18n-source: META-27 sha256-c878edc894f7534dc6712c0987aeeb1048d7452e19cc0c965aad2c3229fc0875 -->
### META-27

Authoring language: zh

在规约树声明编写语言时，规约应使用该语言编写。

本条目中的声明行是 scaffold 的机器可读语言标记。
该声明行应使用精确格式 `Authoring language: <code>`，其中 `<code>` 只包含 ASCII 字母、数字和连字符。

## 参考资料

[1]: https://sublang.ai/zh/ref/gears-ai-ready-spec-syntax "GEARS：面向 AI 的规约语法（中文）"
[2]: https://github.com/npryce/adr-tools "ADR Tools"
