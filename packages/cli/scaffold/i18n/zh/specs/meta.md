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
| `decisions/` | Decision records (DRs) | \<NNN\>-\<kebab-case\>.md |
| `iterations/` | Iteration records (IRs) | \<NNN\>-\<kebab-case\>.md |
| `packages/` | spec packages, one item file per package | [\<path\>/]\<kebab-case\>.md |
| `interactions/` | cross-package behaviors, scenarios, and their tests | [\<path\>/]\<kebab-case\>.md |
| `map.md` | spec index for navigation | - |
| `meta.md` | the spec of specs | - |

<!-- spex-i18n-source: META-3 sha256-12d340f3809b0e5b716d164ba2e81ee7189d22ecb18331f8910277f65203efc6 -->
### META-3

每个条目文件应包含一个说明其目的的 `## 意图` 章节。

### META-21

Test items shall focus on integration and system testing.

A package's `## Verification` section shall hold test items that check that package's own claims.
Test items that involve multiple spec packages shall live in `interactions/` files.

Unit tests shall be part of the implementation and shall not be specified as spec items.

## Record format

<!-- spex-i18n-source: META-4 sha256-9fc0367f908c00eccdabd063021de2a66421a128ec34234a611f9271676598cc -->
### META-4

每个决策记录（DR）应遵循 ADR 格式 [[2]]，并包含以下章节：状态、背景、决策、影响。

<!-- spex-i18n-source: META-5 sha256-f50b8ba3ae8a9c1e8ebb9d7f368a1acb3159de392169c2e9296ab37883572ef1 -->
### META-5

每个迭代记录（IR）应包含以下章节：目标、交付项（带复选框）、任务（编号且每项为一次提交大小）和验收标准。

### META-23

DRs and IRs shall be written in concise language, including only what is needed to act on or audit the record, with preference for bullets and tables over prose paragraphs.

### META-24

A DR shall specify design decisions and constraints, not duplicate implementation logic.
A DR is sufficient when an implementer can generate or audit code from the design intent, constraints, and tradeoffs.
Implementation details shall be included only when they are part of the design contract.

### META-25

In prose paragraphs of DRs and IRs, each sentence shall begin on a new line for diff readability.
List items and table cells are exempt, since their delimiters already isolate per-entry changes.
Fixed-width column wrapping within a sentence is allowed.

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

- It shall have no implicit dependency on sections other than its own subsections.
- Citations to other specs or shared sections shall be explicit.

### META-26

A spec item shall describe behavior as observable outcomes (e.g., file state, exit code, printed output, return value, network call) under named conditions, including any conditions under which a particular outcome shall not occur.

## Spec packages

### META-9

A spec package shall be a single item file under `packages/`, so one read covers the whole package.
Related packages may be grouped into subdirectories of `packages/` for navigation convenience.

### META-10

A spec package shall have a basename \<kebab-case\>.md unique across `specs/packages/` and `specs/interactions/`, with a short form \<ALLCAPS\> unique across the same set.

Example: `package-management.md` has short form `PKGMGT`.

### META-28

Each package file shall contain only the following `##` sections, in this order:

| Section | Presence | Content |
| ------- | -------- | ------- |
| `## Intent` | required | the package's purpose ([META-3](#meta-3)) |
| `## External Behavior` | optional | user-visible behavior: what the system does |
| `## Internal Behavior` | optional | implementation requirements: how the system is built |
| `## Verification` | optional | test items checking this package's claims ([META-21](#meta-21)) |
| `## References` | optional | external sources ([META-19](#meta-19)) |

At least one of `## External Behavior` and `## Internal Behavior` shall be present.
Topic subsections (`###`) and item headings (`###` or `####`) live inside the behavior and Verification sections.
Localized scaffolds translate these section headings; the bundled templates define the active names.

### META-11

Each item shall have an ID unique within `specs/`, following \<PACK\>-\<N...\> format (e.g., AUTH-11, URL-3) as a markdown heading for anchor linking.

Note: \<PACK\> refers to the short form of the containing file's name.

### META-12

Item IDs shall not be modified once released; new items shall use higher IDs per package.

### META-13

A spec package shall define a closed set of subjects and their behaviors for a single intent. The shall clause (see [META-6](#meta-6)) of any item shall only involve subjects and behaviors within its own package.

### META-14

The precondition and trigger clauses (Where, While, When; see [META-6](#meta-6)) of items shall be allowed to reference subjects and behaviors from other spec packages.

### META-15

Each spec package shall minimize references to the containing project. When a project-specific reference is essential to a package's intent, it shall be documented in the package's `## Intent` section.

### META-31

Files under `interactions/` shall describe how multiple spec packages work together.

- Each file shall cover one behavior or scenario and be named after it; file names shall not be concatenations of package names.
- Each file shall follow the item-file conventions: an H1 with a short form ([META-10](#meta-10)), an `## Intent` section ([META-3](#meta-3)), and GEARS items ([META-6](#meta-6)); other sections are free-form.
- Integration and acceptance test items that span multiple packages shall live here, each carrying a `Verifies:` line ([META-20](#meta-20)) citing items from two or more packages.

## Citation

### META-16

Citations to specific items shall use relative links with anchors (e.g., `[META-1](meta.md#meta-1)`).

### META-17

DRs and items shall be allowed to cite each other.

### META-18

IRs shall not be cited by any spec except `map.md`.

<!-- spex-i18n-source: META-19 sha256-3f6ffcfc6f8e3c50369236b4ccba2bec39ef6972b12b425946b2e9dcb2ae79d0 -->
### META-19

规约中的外部引用应引用权威来源（例如官方文档），并使用带编号的标记（例如 `[[1]]`）指向 `## 参考资料` 章节中的具体 URL，且该章节不应包含未被引用的条目。

### META-20

Each test item shall include one `Verifies:` metadata line immediately below its item ID heading.

The `Verifies:` line shall contain one or more comma-separated [citations](#meta-16) to the behavior items that the test item verifies: same-file anchors for a package's own Verification items, and `packages/` citations for interaction test items.

## Authoring language

<!-- spex-i18n-source: META-27 sha256-1fba59bae8903b6db86c0b1ed345082eabdce1cd65fa483e932e6df265a046ec -->
### META-27

Authoring language: zh

在规约树声明编写语言时，规约应使用该语言编写。

本条目中的声明行是 scaffold 的机器可读语言标记。
该声明行应使用精确格式 `Authoring language: <code>`，其中 `<code>` 只包含 ASCII 字母、数字和连字符。

## 参考资料

[1]: https://sublang.ai/zh/ref/gears-ai-ready-spec-syntax "GEARS：面向 AI 的规约语法（中文）"
[2]: https://github.com/npryce/adr-tools "ADR Tools"
