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
| `user/` | item files for user-visible behavior | [\<path\>/]\<kebab-case\>.md |
| `dev/` | item files for implementation requirements | [\<path\>/]\<kebab-case\>.md |
| `test/` | item files for acceptance testing | [\<path\>/]\<kebab-case\>.md |
| `map.md` | spec index for navigation with item files organized by packages | - |
| `meta.md` | the spec of specs | - |

<!-- spex-i18n-source: META-3 sha256-12d340f3809b0e5b716d164ba2e81ee7189d22ecb18331f8910277f65203efc6 -->
### META-3

每个条目文件应包含一个说明其目的的 `## 意图` 章节。

### META-21

Test items shall focus on integration and system testing.

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
[在 <静态前置条件>] [当处于 <状态前置条件>] [当 <触发>] <主体>应<行为>。
```

子句和标点应遵循标准中文习惯。

| 子句 | 用途 | 示例 |
| ------ | ------- | ------- |
| 在 | 静态前置条件（功能、配置） | 在启用调试模式时 |
| 当处于 | 状态前置条件（运行时状态） | 当处于连接活动状态时 |
| 当 | 触发事件（至多一个） | 当用户点击提交时 |
| 应 | 所要求的行为 | 表单应校验输入 |

<!-- spex-i18n-source: META-7 sha256-7e2912d02d3d967a84c2ec8c850db8baa378197d78e517eb269ee665b9676426 -->
### META-7

当测试用例以 Given-When-Then（GWT）表达时，其规约条目应按以下方式将 GWT 映射到 GEARS [[1]]：

| GWT | 子句 |
| --- | ------ |
| Given | 在 + 当处于 |
| When | 当 |
| Then | 应 |

### META-8

Each item shall be self-contained:

- It shall have no implicit dependency on sections other than its own subsections.
- Citations to other specs or shared sections shall be explicit.

### META-26

A spec item shall describe behavior as observable outcomes (e.g., file state, exit code, printed output, return value, network call) under named conditions, including any conditions under which a particular outcome shall not occur.

## Spec packages

### META-9

A spec package shall consist of one to three coordinated item files sharing the same relative path and basename under `user/`, `dev/`, or `test/`.

### META-10

A spec package shall have a basename \<kebab-case\>.md unique across `specs/user/`, `specs/dev/`, and `specs/test/`, with a short form \<ALLCAPS\>.

Example: `package-management.md` has short form `PKGMGT`.

### META-11

Each item shall have an ID unique within `specs/`, following \<PACK\>-\<N...\> format (e.g., AUTH-11, URL-3) as a markdown heading for anchor linking.

Note: \<PACK\> refers to the short form of the package name.

### META-12

Item IDs shall not be modified once released; new items shall use higher IDs per package.

### META-13

A spec package shall define a closed set of subjects and their behaviors for a single intent. The shall clause (see [META-6](#meta-6)) of any item shall only involve subjects and behaviors within its own package.

### META-14

The precondition and trigger clauses (Where, While, When; see [META-6](#meta-6)) of items shall be allowed to reference subjects and behaviors from other spec packages.

### META-15

Each spec package shall minimize references to the containing project. When a project-specific reference is essential to a package's intent, it shall be documented in the package's `## Intent` section.

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

The `Verifies:` line shall contain one or more comma-separated [citations](#meta-16) to the user or dev items that the test item verifies.

## Authoring language

<!-- spex-i18n-source: META-27 sha256-80c5891fd1d7a5fe80d0ceec4f37c20fd9c0e9d8a6486ae77e3899726924cd90 -->
### META-27

Authoring language: zh

在规约树声明编写语言时，规约应使用该语言编写。

本条目中的声明行是 scaffold 的机器可读语言标记。

## 参考资料

[1]: https://sublang.ai/zh/ref/gears-ai-ready-spec-syntax "GEARS：面向 AI 的规约语法（中文）"
[2]: https://github.com/npryce/adr-tools "ADR Tools"
