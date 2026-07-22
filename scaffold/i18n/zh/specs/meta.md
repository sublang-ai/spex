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

<!-- spex-i18n-source: META-3 sha256-12d340f3809b0e5b716d164ba2e81ee7189d22ecb18331f8910277f65203efc6 -->
### META-3

每个条目文件应包含一个说明其目的的 `## 意图` 章节。

### META-22

Directories below `packages/` and `compositions/` shall be navigation-only collections.
Their names and nesting shall confer no semantic meaning.
Moving a file between navigation collections within the same root shall change only its path and affected relative citations, not its basename, short form, item IDs, anchors, ownership, or behavior.

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
It may use meaning defined in its file's Intent and exact citations allowed for its section; it shall not rely on folder placement, file inventory, implicit context, or an undefined token.

### META-26

A behavior item shall state observable semantic outcomes under named conditions, including when an outcome shall not occur.
Adjacent domain tables are normative but are not behavior statements.

## Packages

### META-9

A package shall be one item file under `packages/`, so one read covers its complete package-owned contract and exposes every fixed dependency by an exact link.

### META-10

Each package and composition basename and `<ALLCAPS>` short form shall be globally unique across `packages/` and `compositions/`.
Each H1 shall use `# <SHORT>: <Title>`.
A short form is a stable mnemonic, not a derivation of the filename.

### META-28

Each package file shall use only these `##` sections, in order:

| Section | Presence | Content |
| --- | --- | --- |
| `Intent` | required | purpose, ownership, exclusions, and honest reuse scope |
| `External Behavior` | optional | outcomes and guarantees on which the package's users may rely |
| `Internal Behavior` | optional | provider-neutral consumed requirements and private semantic invariants |
| `Verification` | optional | package-local contract verification |
| `References` | optional | authoritative external sources |

At least one behavior section shall be present.
A package user is any human, host, component, or higher layer using that package's contract.
Classification is package-relative rather than based on human visibility: External Behavior is offered to a package user; Internal Behavior is hidden from package users.
Internal does not mean source files, classes, algorithms, framework mechanics, or other replaceable implementation detail.
A peer package may rely only on External Behavior.
A Binding may cite Internal Behavior as a client requirement, and a Scenario may cite it only as allowed by [META-33](#meta-33); neither citation makes it External Behavior or exposes it to a package user.
The active authoring-language overlay may localize these section headings; a heading with no localized label keeps the English label shown here.

### META-11

Each behavior, binding, scenario, and verification item shall have a globally unique ID of the form `<SHORT>-<N>` as its Markdown heading.
`<SHORT>` shall equal the containing file's H1 short form.

### META-12

An item ID and the normative concern it identifies are reserved if they appeared in any prior release.
A reserved ID shall not be renumbered, reused, or reassigned; wording under it may change only compatibly with the published concern.
Before publication, provisional items may be renumbered, replaced, or removed, and an ID absent from every prior release may be reassigned.

### META-13

A package shall own one intent and a cohesive set of concepts.
Every shall-clause subject in its behavior sections shall be package-owned.

### META-14

The precondition and trigger clauses of an item may cite exact External Behavior from another package when that reliance is an intentional fixed semantic dependency of the package contract.
Such a citation shall state the relied-on meaning and shall not cite the peer's Internal Behavior.
Where supplier selection or reuse without that peer is intended, the client package shall instead state a provider-neutral consumed requirement as Internal Behavior and leave supplier selection to a composition Binding.

### META-15

Each package Intent shall be self-contained prose without citations; exact fixed dependencies belong only at the item precondition or trigger that relies on them.
A reusable package shall define every package-owned operative meaning and variation point locally and shall remain understandable, contract-testable, and usable unchanged outside its source project.
It shall not cite bindings, compositions, or project decisions.
It may cite peer External Behavior only for an intentional fixed semantic dependency under [META-14](#meta-14).
Intrinsic domain or provider specialization is allowed when Intent states it honestly; a package tied to one product instance shall say that it is project-local.

Package presence shall not imply a system-wide exclusivity rule.

## Citations and dependencies

### META-16

Citations to items shall use relative Markdown links with exact anchors.
Every citation inside a normative item shall appear inline immediately after the exact phrase, table cell, or assertion whose meaning it supplies or checks.
The detached relationship lines `Composes:`, `Bindings:`, `Verifies:`, `Clients:`, `Suppliers:`, and `Scope:` shall not be used.
A normative item shall not cite another item for background, navigation, further reading, incidental or transitive context, or a mere code call.

### META-17

DRs and items may cite each other subject to the package restrictions in [META-15](#meta-15), the IR restriction in [META-18](#meta-18), the behavior-section restrictions in [META-28](#meta-28), and the Scenario and Verification target restrictions in [META-20](#meta-20) and [META-33](#meta-33).
A citation shall not change whether cited behavior is External or Internal to its package.

### META-29

Package files shall contain no `Requires:`, `Uses:`, or `Binds:` relationship metadata.
A fixed semantic package dependency shall be expressed by an exact peer External Behavior citation under [META-14](#meta-14).
A selectable dependency shall be expressed as provider-neutral Internal Behavior without naming its supplier, with the installed supplier recorded once by a Binding outside both packages.

A replaceable code dependency shall create neither a behavioral package dependency nor a Composition item.
Its relevant guarantee belongs in the owning package; its concrete selection belongs in implementation artifacts or a DR when the rationale is durable.

### META-18

IRs shall not be cited by any spec except `map.md`.

<!-- spex-i18n-source: META-19 sha256-59b85d6e8b3f9dbfa386b0730ee128306731c69ef2661420cc282a4563d2dd37 -->
### META-19

规约中的外部引用应引用权威来源（例如官方文档），并使用带编号的标记（例如 `[[1]]`）指向 `## 参考资料` 章节中的具体 URL，且该章节不应包含未被引用的条目。

## Verification

### META-20

Each Verification item shall inline-cite at least one target item beside the exact assertion that directly checks it.
In a package Verification item, item citations may target only same-package behavior.
In a composition Verification item, item citations may target only a same-file Binding or Scenario, plus an external Binding it directly checks.
Within Verification, every item citation denotes direct coverage of its target; setup, background, supporting, and merely transitive citations are prohibited.

### META-21

Package Verification shall check the package's offered contract, consumed requirements, private invariants, and local failures with controlled collaborators.
Binding Verification shall check installed compatibility, selection, scope, and endpoint mapping.
Scenario Verification shall check integrated system outcomes.
Binding evidence shall follow the installed seam's audience and observable claim, not the Binding category or file shape.
A relationship observable outside the installed system boundary shall be exercised at that external surface; an installation-hidden relationship may use conformance or deployment inspection.
The external consumer may be a human, operator, host, component, or higher layer.

Every Binding and Scenario shall be inline-cited by at least one same-file Verification item.
One Verification item need not jointly cite both kinds in a mixed file.
Scenarios shall hold most product-level acceptance; unit tests remain implementation artifacts.

## Compositions

### META-30

`compositions/` shall contain system-instantiation files.
Each file shall cover one cohesive installed concern and be named after that concern or outcome, not a concatenation of package names.
Binding items may take the installation as their subject; Scenario items may take the composed system as their subject.
Each file shall use only these `##` sections, in order:

1. `Intent`
2. `Binding`, optional
3. `Scenario`, optional
4. `Verification`, required
5. `References`, optional

At least one of `Binding` and `Scenario` shall be present.
Section presence identifies the file's content; no file-level type flag shall duplicate it.
The active authoring-language overlay may localize section headings; a heading with no localized label keeps the English label shown here.

### META-31

Each Binding item shall use its GEARS clauses as the sole authoritative expression of direction, roles, and scope:

```text
Where <the exact static installation scope and every client role>, the installation shall <provision, assemble, or enforce policy using every supplier or load-bearing External input>.
```

The `Where` clause shall name the applicable environment, profile, request or resource class, tenant, resolved package instances, and other scope needed to distinguish the relationship, and shall cite each package client beside its role.
An installation-owned client surface with no package item shall be named precisely there.
The shall clause shall state the installed selection, assembly, or policy and cite each package supplier or load-bearing input beside its role.
Supplier and load-bearing-input citations shall target External Behavior; a selected external service shall instead be named by its exact capability and cite the selecting DR.
Across item kinds, preconditions carry the item's givens and the shall clause carries its provision.
For an applicable, resolved Binding, the `Where` clause identifies the client's scope and roles, the shall clause identifies the provision and its suppliers or load-bearing External inputs, and the Binding declares the installed relationship rather than requiring “package B is installed” in package source.
The adjacent prose or an item-owned table shall make semantic roles and pairing explicit; citation order shall carry no meaning.
The prose shall explain semantic compatibility without broadening, weakening, or translating either endpoint.
Required conversion shall be owned by an adapter package.

A supply Binding shall cite, for each client role, one complete provider-neutral Internal consumed meaning and shall map it to External Behavior or a selected service; it shall not bind a private invariant or implementation allocation.
An assembly Binding shall cite External Behavior as its endpoints to install a package-user-visible role; it does not let one package import another.
A policy Binding may install product rules such as exclusivity or authorization over cited External state; the composition owns that policy, while the cited behavior remains only its load-bearing input.
An Internal item cited as a client shall contain one complete consumed requirement and its rejection behavior, not an unrelated private invariant or second independently supplied requirement.
If a controlled collaborator could satisfy the meaning, it is consumed and bindable; otherwise it is a private invariant and is not a Binding endpoint.
For a named external service, the Binding shall name the exact selected capability, cite the selecting decision, and verify compatibility with the client meaning.
A Binding is a static installation declaration, not a trigger, journey, runtime dispatch, or proof that deployment matches the declaration; it shall use `Where` and a shall clause without `While` or `When`.

### META-32

A Binding may group several clients or suppliers only when they form one atomic installation decision; bindings are not assumed to be one-to-one.
Its clauses or adjacent table shall map every client role to the supplier roles or load-bearing External inputs that satisfy or define it; list order shall not imply pairing.
For derived views, the Binding item is the authoritative hyperedge: tools shall preserve its complete endpoint sets and render its pairing prose or table rather than invent separate pairwise binding facts.
If the installation owner intends an endpoint or scope to be selected, changed, or verified independently, it belongs in a separate Binding; merely imaginable technical replacement does not split one declared policy decision.

A Binding is applicable when its `Where` scope matches a closed installation profile and resolved when every named endpoint identifies one installed package instance or selected service capability.
An applicable, resolved Binding declares the intended installed relationship; Verification establishes that the deployment realizes it.
The presence of a Binding outside an applicable profile does not mean that relationship is installed in that profile.

For each client role and applicable scope, exactly one applicable, resolved Binding shall govern it by default.
A client contract may instead define zero or several providers, optional or disabled behavior, aggregation, fallback, or runtime selection; a Binding shall define any such rule for an installation-owned client surface.
No or several applicable Bindings are invalid unless that behavior is explicit; absence alone shall not imply optionality, disablement, or intentional non-installation.
Here a client role is identified by its cited item or named installation-owned surface, its semantic role, resolved package instance, and `Where` scope.

When one contract has several installed instances, the `Where` clause shall assign each a stable local instance name; the package citation identifies the contract and that name identifies its installation.

Each installed relationship shall have one authoritative Binding item.
Package annotations, indexes, and overlays shall be derived rather than copied into package source.

### META-33

Each Scenario item shall inline-cite materially necessary behavior from at least two packages at the exact causal phrase, including at least one External Behavior item that grounds the integrated system outcome.
A Scenario citation to package behavior denotes direct composition of that behavior.
It may cite Internal Behavior only when materially necessary to state or inspect the integrated outcome; the citation shall not expose that behavior to a package user.
A Scenario citation to a Binding denotes an installed handoff directly exercised by the adjacent phrase.
A Scenario may cite only package behavior and Bindings and shall not cite ambient, transitive, supporting, or merely called behavior.
Scenario prose shall state each causal handoff in product language without redefining binding endpoints.

### META-34

Binding and Scenario may share a file when they have one cohesive intent, owner, scope, and change cadence and the binding materially serves a same-file Scenario.
Every Binding in a mixed file shall be inline-cited by at least one same-file Scenario.
Cross-cutting or independently changing bindings shall live in a binding-only file and may be cited by Scenarios elsewhere.

### META-35

Authoritative package and Binding sources shall remain separate.
A package-focused installed overlay, global binding index, and text projection may expose the installed graph, but all shall be read-only derived views.
Tools shall derive Binding direction, roles, scope, and endpoint membership from the clauses and item-owned tables defined by [META-31](#meta-31) and [META-32](#meta-32), without a second metadata source.
Every projection shall resolve deterministically from the authoritative items and agree on that graph; no projection becomes an independent source of truth.

The traces are:

```text
package Behavior -> inline package Verification citation -> contract evidence
package External Behavior -> inline Scenario citation -> Scenario -> inline Verification citation -> acceptance evidence
material package Internal Behavior -> inline Scenario citation -> Scenario (remains hidden from package users)
package External client -> inline Binding precondition citation -> installed assembly or policy
package Internal requirement -> inline Binding precondition citation -> installed supply
supplier or load-bearing External Behavior -> inline Binding shall-clause citation -> installed relationship
selected service capability -> Binding shall-clause name and selecting DR -> installed relationship
Binding -> inline Scenario citation -> Scenario
Binding -> inline Verification citation -> conformance evidence
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
