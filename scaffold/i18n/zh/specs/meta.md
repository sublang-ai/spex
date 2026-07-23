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
| `compositions/` | cross-package compositions: scenarios, bindings, and their tests | [\<path\>/]\<kebab-case\>.md |
| `map.md` | spec index for navigation | - |
| `meta.md` | the spec of specs | - |

<!-- spex-i18n-source: META-3 sha256-12d340f3809b0e5b716d164ba2e81ee7189d22ecb18331f8910277f65203efc6 -->
### META-3

每个条目文件应包含一个说明其目的的 `## 意图` 章节。

### META-21

Test items shall focus on integration and system testing.

A package's `## Verification` section shall hold test items that check that package's own claims.
Package test items shall drive the package against controlled collaborators — stubs standing in for its peers and services — never by executing a selected supplier; supplier-facing checks are composition tests ([META-31](#meta-31)).
Test items that involve multiple spec packages shall live in `compositions/` files.

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
DRs shall carry no implementation details: a detail that code generation requires shall be a spec item with its observable outcome stated ([META-26](#meta-26)); a detail that code generation does not require shall appear in no spec.

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
Packages may be grouped into subdirectories of `packages/` for navigation convenience ([META-32](#meta-32)).

### META-10

A spec package shall have a basename \<kebab-case\>.md unique across `specs/packages/` and `specs/compositions/`, with a short form \<ALLCAPS\> unique across the same set.

Example: `package-management.md` has short form `PKGMGT`.

### META-28

Each package file shall contain only the following `##` sections, in this order:

| Section | Presence | Content |
| ------- | -------- | ------- |
| `## Intent` | required | the package's purpose ([META-3](#meta-3)) |
| `## External Behavior` | optional | outcomes and guarantees the package's users may rely on |
| `## Internal Behavior` | optional | consumed requirements and private invariants, hidden from the package's users |
| `## Verification` | optional | test items checking this package's claims ([META-21](#meta-21)) |
| `## References` | optional | external sources ([META-19](#meta-19)) |

At least one of `## External Behavior` and `## Internal Behavior` shall be present.
A package's user is any human, host, or peer component using its contract; classification is package-relative, and a peer may rely only on External Behavior.
Topic subsections (`###`) and item headings (`###` or `####`) live inside the behavior and Verification sections.
Localized scaffolds translate these section headings; the bundled templates define the active names.

### META-11

Each item shall have an ID unique within `specs/`, following \<PACK\>-\<N...\> format (e.g., AUTH-11, URL-3) as a markdown heading for anchor linking.

Note: \<PACK\> refers to the short form of the containing file's name.

### META-12

An item ID, and the concern it identifies, is reserved once it has appeared in any release; a reserved ID shall not be renumbered, reused, or reassigned, and wording may change under it only while it preserves the cited concern.
Unreleased IDs may be renumbered or overwritten to keep a file's numbering compact; an ID that has appeared in no release may be reassigned, and new items take the next free ID.

### META-13

A spec package shall define a closed set of subjects and their behaviors for a single intent. The shall clause (see [META-6](#meta-6)) of any item shall only involve subjects and behaviors within its own package; where a package leaves an open slot for another party (e.g., "the deployment's media provider"), the slot shall be named abstractly, and its binding shall live in a composition ([META-31](#meta-31)).

### META-14

The precondition and trigger clauses (Where, While, When; see [META-6](#meta-6)) of items may cite another package's External Behavior where the reliance is an intentional, fixed semantic dependency of the package's contract; such citations shall never target a peer's Internal Behavior.
Where the counterparty is selectable, the package shall state an abstract subject instead, bound in a composition ([META-31](#meta-31)).

### META-15

Each spec package shall minimize references to the containing project and stand alone: its `## Intent` section shall be self-contained prose carrying no citations.
Dependencies on other packages shall appear only as item-level precondition citations ([META-14](#meta-14)); bindings of abstract subjects — to another package or to an external service — shall be binding items under `compositions/` ([META-31](#meta-31)), and the decision record that chooses the bound party shall cite those binding items ([META-17](#meta-17)).
A package shall claim no site-wide exclusivity for itself; exclusivity is an installation policy, stated by a binding item ([META-31](#meta-31)).

### META-31

Files under `compositions/` shall describe how multiple spec packages work together.

- Each file shall cover one integrated behavior, scenario, or binding concern and be named after it; file names shall not be concatenations of package names.
- Each file shall follow the item-file conventions: an H1 with a short form ([META-10](#meta-10)), an `## Intent` section ([META-3](#meta-3)), and GEARS items ([META-6](#meta-6)), with sections per [META-34](#meta-34).
- Composition items may take the composed system as their subject, and may bind an open slot one package leaves to a surface another package provides (a binding item). Where no product user observes the seam, a binding item may bind an abstract subject to an external service instead (a supply binding); its tests are inspections of a deployment rather than user journeys. What a controlled stand-in could satisfy is consumed behavior and bindable; what no stand-in could satisfy is a private invariant, and no binding may target it. A replaceable code dependency — a library, a framework — is no seam at all: it gets no binding item, and its selection lives in a decision record.
- A binding item declares its endpoints by clause: its precondition clauses cite the client items — or name the deployment surface — it serves, and its shall clause cites the supplier items or names the service. This is the uniform GEARS reading — preconditions carry an item's givens, the shall clause its provision; a binding's given is the client's stated need. A binding item is static: Where preconditions and a shall clause, never a While or When trigger — a triggered sequence is a scenario item. A binding declares the installed relationship; whether the deployment realizes it is its tests' question. Citations to decision records in either clause are policy references, not endpoints. Supplier-side citations shall be External Behavior — what the supplier offers its users — never another package's internal items. Where no single supplier serves the need, the shall clause may state a rule the installation itself owns — an authorization policy, an exclusivity constraint — citing the External Behavior it depends on as the rule's inputs. Clause placement alone fixes the direction: a provision-side citation reads as the supplier serving the need or, under an installation-owned rule, as the rule's input — both provide, neither consumes. Each slot or abstract subject shall have exactly one effective binding per deployment, unless the client item itself defines aggregation or selection; a slot with no effective binding is an incomplete installation, not a disabled feature.
- Integration and acceptance test items shall live here, each citing ([META-20](#meta-20)) the same-file scenario or binding items it executes plus the package items it directly checks; a scenario test shall cite items from two or more packages. Every binding and scenario item shall be cited by at least one same-file test item.

A binding item reads as one GEARS sentence:

```text
Where <the client's cited need or named deployment surface>, the deployment shall <serve it: cite supplier External Behavior, name the selected service, or state the installation's own rule over cited External inputs>.
```

### META-32

Subdirectories under `packages/` and `compositions/` shall be navigation collections only, with no semantic meaning: no spec, tool, or reader shall infer package relationships, layering, or ownership from directory placement.
A file's identity is its basename and short form ([META-10](#meta-10)); moving a file between collections changes relative citation paths but shall change no item ID, short form, or anchor.

### META-33

Files under `packages/` shall not cite files under `compositions/`.
Composition files cite package items; packages stay ignorant of the compositions built on them, so a package can be moved to another project without dragging scenario context along.

### META-34

Each composition file shall contain only the following `##` sections, in this order:

| Section | Presence | Content |
| ------- | -------- | ------- |
| `## Intent` | required | the concern's purpose ([META-3](#meta-3)) |
| `## Binding` | optional | binding items ([META-31](#meta-31)) |
| `## Scenario` | optional | integrated-behavior items over the composed system |
| `## Tests` | required | test items citing what they verify ([META-20](#meta-20)) |
| `## References` | optional | external sources ([META-19](#meta-19)) |

At least one of `## Binding` and `## Scenario` shall be present.
A file may hold bindings alone; whether its tests are acceptance journeys or deployment inspections follows from its seams' audience ([META-31](#meta-31)), not from the file's section shape.
Where both sections are present, each binding item shall be cited by at least one same-file scenario item whose outcome depends on it — a binding no same-file scenario depends on, or one that serves several files' concerns, shall live in a bindings-only file.
Binding conformance and scenario acceptance may share one test item but need not.
Binding overlays, package-focused indexes, and other projections over these files shall be derived, read-only views — never a second source of truth.
Localized scaffolds translate these section headings; the bundled templates define the active names.

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

A test item shall cite every behavior item it verifies, inline at the assertion that verifies it: same-file anchors for a package's own Verification items, and `packages/` citations plus same-file scenario or binding anchors for composition test items ([META-31](#meta-31)).
A citation binds its adjacent phrase: cite exactly the behavior that phrase directly relies on, exercises, or checks — never ambient, transitive, or merely invoked behavior.
Spec items shall carry no relationship-metadata lines — `Verifies:`, `Binds:`, `Composes:`, `Clients:`, `Suppliers:`, `Scope:`, or any other line declaring an item relationship; the citations in an item's clauses are the single source of its relationships.
A machine-readable declaration an item itself defines — like the language marker of [META-27](#meta-27) — is item content, not relationship metadata.

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
