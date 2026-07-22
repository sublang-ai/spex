<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# META: Demo Spec Definition

## Intent

This file defines the spec organization exercised by the course website demo.

## Organization

### META-1

The `specs/` tree shall use these entries:

| Path | Content |
| --- | --- |
| `decisions/` | durable choices and rationale |
| `iterations/` | incremental implementation plans and acceptance targets |
| `packages/` | standalone package contracts |
| `compositions/` | installed bindings, integrated scenarios, and their verification |
| `map.md` | navigation and traceability |
| `meta.md` | this format contract |

### META-2

Directories below `packages/` and `compositions/` shall be navigation-only collections.
Their names and nesting shall confer no semantic meaning.
Moving a file between navigation collections within the same root shall change only its path and affected relative citations, not its basename, short form, item IDs, anchors, ownership, or behavior.

## Items

### META-3

Each normative behavior statement shall use the GEARS pattern [[1]]:

```text
[Where <static preconditions>] [While <stateful preconditions>] [When <one trigger>] The <subject> shall <observable behavior>.
```

Given-When-Then maps Given to Where/While, When to When, and Then to the shall clause.
Adjacent domain tables are normative but are not behavior statements.

### META-4

Each behavior, binding, scenario, and verification item shall have a globally unique ID of the form `<SHORT>-<N>` as its Markdown heading.
`<SHORT>` shall equal the containing file's H1 short form.
An item ID and the normative concern it identifies are reserved if they appeared in any prior release.
A reserved ID shall not be renumbered, reused, or reassigned; wording under it may change only compatibly with the published concern.
Before publication, provisional items may be renumbered, replaced, or removed, and an ID absent from every prior release may be reassigned.
Each package and composition file shall have a globally unique short form in its H1 heading.
Its H1 shall use `# <SHORT>: <Title>`.
A short form is a stable mnemonic, not a derivation of the filename.

### META-5

Each item shall state every item-specific condition, value meaning, outcome, and failure in the item or an adjacent table it owns.
It may use package-wide meaning defined in Intent, an exact same-package citation, or an exact peer External Behavior citation allowed by [META-12](#meta-12); it shall not rely on folder placement, file inventory, implicit context, or an undefined token.

### META-6

Spec citations shall use relative Markdown links to exact item anchors.
Except for the Binding endpoint lines required by [META-18](#meta-18), every citation inside a normative item shall appear inline immediately after the exact phrase, table cell, or assertion whose meaning it supplies or checks.
The trace lines `Composes:`, `Bindings:`, and `Verifies:` shall not be used.
A normative item shall not cite another item for background, navigation, further reading, incidental or transitive context, or a mere code call.
External sources shall use numbered markers and authoritative URLs in the same file's `References` section.

## Packages

### META-7

A package shall own one intent and a cohesive set of concepts.
Every shall-clause subject in its behavior sections shall be package-owned.

### META-8

Each package file shall use only these `##` sections, in order:

1. `Intent`
2. `External Behavior`, when a package user may rely on the behavior
3. `Internal Behavior`, when the package has consumed requirements or private invariants hidden from its users
4. `Verification`, when package-local verification is specified
5. `References`, when external sources are cited

At least one behavior section shall be present.

### META-9

A package shall define locally every package-owned domain value, result, state, policy, route, shape, provenance rule, scope rule, and mismatch outcome needed by its behavior; an intentional fixed peer meaning remains at its exact External Behavior citation rather than being copied.
Package-wide meaning belongs in Intent; item-specific meaning belongs beside its owning item.
Human-readable domain meaning shall not be replaced by a package-interface manifest.

### META-10

External Behavior shall state outcomes and guarantees on which a package user may rely, using the language that user and the package exchange.
A package user may be a human, host, component, or higher layer; the classification is relative to this package, so External does not mean human-visible or publicly accessible in the installed product.

### META-11

Internal Behavior shall describe provider-neutral requirements the package consumes and semantic invariants hidden from its users.
Internal does not mean source layout, classes, algorithms, framework mechanics, or other replaceable implementation detail.
The same component may be an internal part of one installed system and an external user of another package; only the boundary of the package being written decides the section.

A peer may rely on and cite only External Behavior of another package.
An installation Binding may cite Internal Behavior as a client requirement, but that citation does not make the item a provided contract.
A Scenario may cite Internal Behavior only when it is materially necessary to specify or inspect the integrated system outcome under [META-20](#meta-20); that citation does not expose the item to a package user.

### META-12

Each package Intent shall be self-contained prose without citations; exact fixed dependencies belong only at the item precondition or trigger that relies on them.
A reusable package shall remain understandable, contract-testable, and usable unchanged outside this project.
It shall define its operative meanings in its own vocabulary and shall not cite peer Internal Behavior, bindings, compositions, or project decisions.
It may cite exact peer External Behavior when that peer contract is an intentional fixed semantic dependency and every claimed reuse retains the dependency.
Such a citation may constrain an item's precondition or trigger, but the shall-clause subject remains package-owned under [META-7](#meta-7).
When the supplier is selected per installation or avoiding the fixed dependency materially improves reuse, the package shall instead define a provider-neutral Internal requirement and let a composition Binding select the supplier.
Intrinsic domain or provider specialization is allowed when Intent states it honestly and the package remains reusable unchanged within that scope.
A package tied to one product instance shall say that it is project-local.

Package presence shall not imply a closed-world rule.
For example, a GitHub identity package does not by itself mean that the installed system permits only GitHub login.

### META-13

Each package Verification item shall inline-cite at least one same-package behavior beside the exact assertion that directly checks it and may cite no other item.
Every item citation in package Verification denotes direct coverage; setup, background, supporting, and merely transitive citations are prohibited.
Package Verification shall use controlled collaborators to check the package's offered contract, consumed requirements, private invariants, and local failure boundaries without executing a selected peer implementation.

### META-14

Package files shall contain no `Requires:`, `Uses:`, or `Binds:` relationship metadata.
An exact peer External Behavior citation itself declares a fixed semantic dependency and shall not be duplicated as relationship metadata or a Binding merely to restate it.
A package shall state a selectable consumed requirement as Internal Behavior without naming its supplier; the selected supplier shall be recorded once by an installation Binding outside both packages.

### META-15

A replaceable code dependency shall not create a behavioral package dependency, Binding, or Scenario.
Its behaviorally relevant guarantee belongs in the owning package; its selection belongs in implementation artifacts or, when rationale is durable, a decision record.

## Compositions

### META-16

`compositions/` shall contain system-instantiation files.
A file shall cover one cohesive installed concern and be named after that concern or outcome, not a concatenation of package names.
Binding items may take the installation as their subject; Scenario items may take the composed system as their subject.
A file may bind package requirements, describe integrated system-user or operator outcomes, or do both.
Bindings and Scenarios are distinct item kinds; no file-level type flag shall restate the sections present.

### META-17

Each composition file shall use only these `##` sections, in order:

1. `Intent`
2. `Binding`, optional
3. `Scenario`, optional
4. `Verification`
5. `References`, optional

At least one of `Binding` and `Scenario` shall be present.

### META-18

Each Binding item shall carry these lines immediately below its heading:

```text
Clients: <role> = <exact package behavior citation>, ...
Suppliers: <role> = <exact package External Behavior citation or named external service selected by a cited decision>, ...
Scope: <the package instances, environment, profile, request class, or other installation scope>
```

`Clients:` and `Suppliers:` declare endpoint direction and roles; `Scope:` declares the installed instances and applicability.
Ordinary citations cannot supply those facts, so these lines are authoritative Binding structure rather than duplicate trace lists.
Each endpoint shall have an explicit role; roles and prose shall make an n:m item unambiguous without positional pairing.
The prose shall explain why the supplied meaning satisfies the client requirement without changing either endpoint.
If conversion is required, an adapter package shall own it.

A supply Binding shall cite a complete provider-neutral Internal consumed meaning as its client and External Behavior or a selected service as its supplier; it shall not bind a private invariant or implementation allocation.
An assembly Binding shall cite External Behavior as its endpoints to install a package-user- or host-visible role; it does not create a fixed package dependency.
A Binding shall not mix External and Internal client roles; split them because they have different audiences and evidence grades.
An Internal item cited as a client shall contain one complete consumed requirement and its rejection behavior, not an unrelated private invariant or second independently supplied requirement.
If a controlled collaborator could satisfy the meaning, it is consumed and bindable; otherwise it is a private invariant and is not a Binding endpoint.
For a named external service, the Binding shall name the exact selected capability, cite the selecting decision, and verify compatibility with the client meaning.

### META-19

A Binding item may group several clients or suppliers only when they form one atomic installation decision.
The relationship is therefore not assumed to be one-to-one.
The item shall state how its supplier roles collectively satisfy its client roles.
If the installation owner intends an endpoint or scope to be selected, changed, or verified independently, it belongs in a separate Binding; merely imaginable technical replacement does not split one declared policy decision.
For each client role and applicable scope, exactly one effective Binding shall exist unless the client contract explicitly defines aggregation, fallback, or runtime selection.
Here a client role is identified by its cited item, role label, resolved package instance, and scope.
When one contract has several installed instances, `Scope:` shall assign each a stable local instance name; the package citation identifies the contract and the name identifies its installation.
The same supplier may satisfy many clients, and the same package may have different bindings in different installations.

Each installed relationship shall have one authoritative Binding item.
Package annotations, indexes, and overlays shall be derived from it rather than copied into package source.

### META-20

Each Scenario item shall inline-cite materially necessary behavior from at least two packages at the exact causal phrase, including at least one External Behavior item that grounds the system-user- or operator-meaningful outcome.
A Scenario citation to package behavior denotes direct composition of that behavior.
It may cite Internal Behavior only when materially necessary to specify or inspect the integrated outcome; the citation shall not reclassify or expose the item.
A Scenario citation to a Binding denotes an installed handoff directly exercised by the adjacent phrase.
A Scenario may cite only package behavior and Bindings and shall not cite ambient, transitive, supporting, or merely called behavior.
Scenario prose shall state each causal handoff in product language rather than redefine either binding endpoint.

### META-21

Binding and Scenario may share a file when they have one cohesive intent, owner, scope, and change cadence and the binding materially serves a same-file scenario.
Every Binding in a mixed file shall be inline-cited by at least one same-file Scenario.
Cross-cutting or independently changing bindings shall live in a binding-only file and may be cited by Scenarios elsewhere.

### META-22

Each composition Verification item shall inline-cite at least one same-file Binding or Scenario beside the exact assertion that directly checks it.
It may additionally inline-cite an external Binding it directly checks and may cite no other item.
Every item citation in composition Verification denotes direct coverage; setup, background, supporting, and merely transitive citations are prohibited.
Every same-file Binding and Scenario shall be inline-cited by at least one same-file Verification item.
Binding verification checks endpoint compatibility, selection, and scope; Scenario verification checks the integrated outcome.
Assembly Binding verification shall exercise the assembled package-user- or host-visible role at its external surface; supply Binding verification may use conformance inspection.
One verification item need not cite both kinds merely because the file is mixed.
An external Binding still requires coverage in its defining file.

### META-23

Authoritative package and Binding sources shall remain separate.
A package-focused installed overlay and a global binding index may project the same Binding graph for navigation, but both shall be read-only derived views.
Every text and UI projection shall resolve deterministically from the authoritative items and agree on the same installed graph; no projection becomes an independent source of truth.

### META-24

Scenarios shall hold most product-level acceptance: primary journeys, representative denials, dependency failure and recovery, cross-package consistency, integrated accessibility, security boundaries, and deployed operation.
Package-local validation matrices, private invariants, local races, and adapter edge cases shall remain in package Verification.

The acceptance trace shall be:

```text
package Behavior -> inline package Verification citation -> contract evidence
package External or materially relevant Internal Behavior -> inline Scenario citation -> Scenario -> inline Verification citation -> acceptance evidence
supplier External Behavior -> Binding -> External client role
supplier External Behavior or selected service -> Binding -> package Internal requirement
Binding -> inline Scenario citation -> Scenario
Binding -> inline Verification citation -> conformance evidence
```

## Records

### META-25

Each iteration record shall use `Goal`, `Deliverables` with checkboxes, numbered one-commit-size `Tasks`, and `Acceptance criteria` sections.
It shall contain only what is needed to act on or audit the plan.

### META-26

An iteration may cite decisions and exact package or composition items to define its scope and acceptance.
No spec other than `map.md` shall cite an iteration.

### META-27

Each decision record shall use the ADR sections `Status`, `Context`, `Decision`, and `Consequences` [[2]].
Decisions explain durable choices and rationale; they shall not be the sole source of operative behavior or installed binding truth.

## Authoring language

### META-28

Authoring language: en

The specs shall be authored in English.

## References

[1]: https://sublang.ai/ref/gears-ai-ready-spec-syntax "GEARS: AI-Ready Spec Syntax"
[2]: https://github.com/npryce/adr-tools "ADR Tools"
