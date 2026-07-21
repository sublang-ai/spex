<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# META: 规约定义

## 意图

本规约定义 specifications（specs）的结构和组织方式，遵循 [DR-000](decisions/000-spec-structure-format.md)。

## Organization

### META-1

The `specs/` directory shall contain:

| Path | Content | File naming |
| --- | --- | --- |
| `decisions/` | decision records (DRs) | `<NNN>-<kebab-case>.md` |
| `iterations/` | iteration records (IRs) | `<NNN>-<kebab-case>.md` |
| `packages/` | standalone package contracts | `[<path>/]<kebab-case>.md` |
| `compositions/` | installed bindings, integrated scenarios, and verification | `[<path>/]<kebab-case>.md` |
| `map.md` | navigation index | — |
| `meta.md` | the spec of specs | — |

### META-2

Directories below `packages/` and `compositions/` shall be navigation-only collections.
Their names and nesting shall confer no semantic meaning.

<!-- spex-i18n-source: META-3 sha256-12d340f3809b0e5b716d164ba2e81ee7189d22ecb18331f8910277f65203efc6 -->
### META-3

每个条目文件应包含一个说明其目的的 `## 意图` 章节。

## Records

<!-- spex-i18n-source: META-4 sha256-78de85bb2ad12e771569847cdc6719ba6199080664c911a865a6cb62176f67f0 -->
### META-4

每个决策记录（DR）应遵循 ADR 格式 [[2]]，并包含以下章节：状态、背景、决策、影响。

<!-- spex-i18n-source: META-5 sha256-a18e7b70fe183caff6852fde1706685b6e487b12cd688d67aae376207704f258 -->
### META-5

每个迭代记录（IR）应包含以下章节：目标、交付项（带复选框）、任务（编号且每项为一次提交大小）和验收标准。

### META-23

DRs and IRs shall contain only what is needed to act on or audit the record, preferring bullets and tables over long prose.

### META-24

A DR shall specify durable choices, constraints, and tradeoffs rather than duplicate operative behavior or implementation logic.
Implementation detail belongs in a DR only when it is part of the design contract.

### META-25

In DR and IR prose, each sentence shall begin on a new line for diff readability.
List items, table cells, and fixed-width wrapping are exempt.

## Item syntax

<!-- spex-i18n-source: META-6 sha256-e636b351e794d22a019e6e77b1600ed3fe99f0cc89d51eb88005e90ebb4b186a -->
### META-6

每个规范性行为陈述应使用 GEARS 模式 [[1]]：

```text
[给定 <静态前置条件>] [如果 <状态前置条件>] [当 <一个触发条件>] <主体>应<可观察行为>。
```

<!-- spex-i18n-source: META-7 sha256-bfd5600754dbfbed7c079278d84e64822e56160b54ac0aee30d6b1456bab5ce2 -->
### META-7

当测试用例以 Given-When-Then（GWT）表达时，其规约条目应按以下方式将 GWT 映射到 GEARS [[1]]：

| GWT | 子句 |
| --- | ------ |
| Given | 给定/Where + 如果/While |
| When | 当/When |
| Then | 应/shall |

### META-8

Each item shall state every item-specific condition, value meaning, outcome, and failure in the item or an adjacent table it owns.
It may use package-wide meaning defined in Intent or an exact same-package citation; it shall not rely on folder placement, file inventory, implicit context, or an undefined token.

### META-26

A behavior item shall state observable semantic outcomes under named conditions, including when an outcome shall not occur.
Adjacent domain tables and trace lines are normative but are not behavior statements.

## Packages

### META-9

A package shall be one item file under `packages/`, so one read covers its complete contract.

### META-10

Each package and composition basename and `<ALLCAPS>` short form shall be globally unique across `packages/` and `compositions/`.
Each H1 shall use `# <SHORT>: <Title>`.

### META-28

Each package file shall use only these `##` sections, in order:

| Section | Presence | Content |
| --- | --- | --- |
| `Intent` | required | purpose, ownership, exclusions, and honest reuse scope |
| `User Behavior` | optional | outcomes visible to named humans |
| `Collaborator Behavior` | optional | outputs or guarantees offered to peers or hosts |
| `Internal Behavior` | optional | provider-neutral consumed requirements and private semantic invariants |
| `Verification` | optional | package-local contract verification |
| `References` | optional | authoritative external sources |

At least one behavior section shall be present.
The active authoring-language overlay may localize these section headings; a heading with no localized label keeps the English label shown here.

### META-11

Each behavior, binding, scenario, and verification item shall have a globally unique ID of the form `<SHORT>-<N>` as its Markdown heading.
`<SHORT>` shall equal the containing file's H1 short form.

### META-12

Released item IDs shall not be renumbered or reused; new items shall use new IDs.

### META-13

A package shall own one intent and a cohesive set of concepts.
Every shall-clause subject in its behavior sections shall be package-owned.

### META-14

User Behavior shall use the language exchanged by the package and named humans.
Collaborator Behavior shall define provider outputs and guarantees on which a peer or host may rely.
Internal Behavior shall define provider-neutral requirements consumed by the package and semantic invariants it keeps private.

Internal does not mean source files, classes, algorithms, framework mechanics, or other replaceable implementation detail.
Human visibility alone does not decide the boundary: reliance and direction do.
A peer may rely only on Collaborator Behavior.
A Binding may cite Internal Behavior as a client requirement; peers and Scenarios shall not cite it.

### META-15

A reusable package shall define every operative meaning and variation point locally and shall remain understandable, contract-testable, and usable unchanged outside its source project.
It shall not cite peer packages, bindings, compositions, or project decisions.
Intrinsic domain or provider specialization is allowed when Intent states it honestly; a package tied to one product instance shall say that it is project-local.

Package presence shall not imply a system-wide exclusivity rule.

## Citations and dependencies

### META-16

Citations to items shall use relative Markdown links with exact anchors.

### META-17

Package files shall contain no `Requires:`, `Uses:`, or `Binds:` relationship metadata.
A package shall state a consumed collaborator requirement as Internal Behavior without naming its supplier.
The installed supplier shall be recorded once by a Binding outside both packages.

A replaceable code dependency shall create neither a behavioral package dependency nor a Composition item.
Its relevant guarantee belongs in the owning package; its concrete selection belongs in implementation artifacts or a DR when the rationale is durable.

### META-18

IRs shall not be cited by any spec except `map.md`.

<!-- spex-i18n-source: META-19 sha256-59b85d6e8b3f9dbfa386b0730ee128306731c69ef2661420cc282a4563d2dd37 -->
### META-19

规约中的外部引用应引用权威来源（例如官方文档），并使用带编号的标记（例如 `[[1]]`）指向 `## 参考资料` 章节中的具体 URL，且该章节不应包含未被引用的条目。

## Verification

### META-20

Each Verification item shall carry one `Verifies:` line immediately below its heading.
A package Verification item shall cite same-package behavior.
A composition Verification item shall cite at least one same-file Binding or Scenario item; it may additionally cite an external Binding it directly checks.

### META-21

Package Verification shall check the package contract, private invariants, and local failures with controlled collaborators.
Binding Verification shall check installed endpoint compatibility, selection, and scope.
Scenario Verification shall check integrated human or operator outcomes.
Public Binding Verification shall exercise the assembled human- or host-visible role at its public surface; supply Binding Verification may use conformance inspection.

Every Binding and Scenario shall have same-file Verification coverage.
One Verification item need not jointly cite both kinds in a mixed file.
Scenarios shall hold most product-level acceptance; unit tests remain implementation artifacts.

## Compositions

### META-31

`compositions/` shall contain system-instantiation files.
Each file shall use only these `##` sections, in order:

1. `Intent`
2. `Binding`, optional
3. `Scenario`, optional
4. `Verification`, required
5. `References`, optional

At least one of `Binding` and `Scenario` shall be present.
Section presence identifies the file's content; no file-level type flag shall duplicate it.
The active authoring-language overlay may localize section headings; a heading with no localized label keeps the English label shown here.
The metadata keys `Clients:`, `Suppliers:`, `Scope:`, `Composes:`, `Bindings:`, and `Verifies:` are language-neutral tokens.

### META-32

Each Binding item shall carry these lines immediately below its heading:

```text
Clients: <role> = <exact package behavior citation>, ...
Suppliers: <role> = <exact package User or Collaborator Behavior citation or named external service selected by a cited DR>, ...
Scope: <package instances, environment, profile, request, resource, tenant, or other installation scope>
```

Every endpoint shall have an explicit role.
The prose shall explain semantic compatibility without broadening, weakening, or translating either endpoint.
Required conversion shall be owned by an adapter package.

A supply Binding shall cite a complete provider-neutral Internal consumed meaning as its client and Collaborator Behavior or a selected service as its supplier; it shall not bind a private invariant or implementation allocation.
A public Binding may cite User or Collaborator Behavior as its endpoints to install a human- or host-visible role; it does not let one package import another.
A Binding shall not mix public and Internal client roles; split them because they have different audiences and evidence grades.
An Internal item cited as a client shall contain one complete consumed requirement and its rejection behavior, not an unrelated private invariant or second independently supplied requirement.
If a controlled collaborator could satisfy the meaning, it is consumed and bindable; otherwise it is a private invariant and is not a Binding endpoint.
For a named external service, the Binding shall name the exact selected capability, cite the selecting decision, and verify compatibility with the client meaning.

### META-33

A Binding may group several clients or suppliers only when they form one atomic installation decision; bindings are not assumed to be one-to-one.
The item shall state how its supplier roles collectively satisfy its client roles.
If the installation owner intends an endpoint or scope to be selected, changed, or verified independently, it belongs in a separate Binding; merely imaginable technical replacement does not split one declared policy decision.
For each client role and applicable scope, exactly one effective Binding shall exist unless the client contract defines aggregation, fallback, or runtime selection.
Here a client role is identified by its cited item, role label, resolved package instance, and scope.

When one contract has several installed instances, `Scope:` shall assign each a stable local instance name; the package citation identifies the contract and the name identifies its installation.

Each installed relationship shall have one authoritative Binding item.
Package annotations, indexes, and overlays shall be derived rather than copied into package source.

### META-34

Each Scenario item shall carry a `Composes:` line immediately below its heading, citing User or Collaborator Behavior from at least two packages, including User Behavior that grounds the human- or operator-meaningful outcome.
It shall cite no Internal Behavior and shall not list a package merely because code calls it.

When a Scenario materially depends on installed bindings, a `Bindings:` line citing them shall immediately follow `Composes:`.
Scenario prose shall state the causal handoff in product language without redefining binding endpoints.

### META-35

Binding and Scenario may share a file when they have one cohesive intent, owner, scope, and change cadence and the binding materially serves a same-file Scenario.
Every Binding in a mixed file shall be cited by at least one same-file Scenario.
Cross-cutting or independently changing bindings shall live in a binding-only file and may be cited by Scenarios elsewhere.

### META-36

Authoritative package and Binding sources shall remain separate.
A package-focused installed overlay, global binding index, and text projection may expose the installed graph, but all shall be read-only derived views.
Every projection shall resolve deterministically from the authoritative items and agree on that graph; no projection becomes an independent source of truth.

The traces are:

```text
package User or Collaborator Behavior -> Composes -> Scenario -> Verifies -> acceptance evidence
supplier User or Collaborator Behavior -> Binding -> public client role
supplier Collaborator Behavior or selected service -> Binding -> package Internal requirement
```

## Authoring language

<!-- spex-i18n-source: META-27 sha256-6ef43533cb56555d9817d70d86c9a6b8ba7eebbad0ddae420840ab4a30804c85 -->
### META-27

Authoring language: zh

在规约树声明编写语言时，规约应使用该语言编写。

本条目中的声明行是 scaffold 的机器可读语言标记。
该声明行应使用精确格式 `Authoring language: <code>`，其中 `<code>` 只包含 ASCII 字母、数字和连字符。

## 参考资料

[1]: https://sublang.ai/zh/ref/gears-ai-ready-spec-syntax "GEARS：面向 AI 的规约语法（中文）"
[2]: https://github.com/npryce/adr-tools "ADR Tools"
