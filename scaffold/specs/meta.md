<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# META: Spec Definition

## Intent

This spec defines the structure and organization of specifications, per [DR-000](decisions/000-spec-structure-format.md).

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

### META-3

Each item file shall include an `## Intent` section stating its purpose.

### META-22

Directories below `packages/` and `compositions/` shall be navigation-only collections.
Their names and nesting shall confer no semantic meaning.
Moving a file between navigation collections within the same root shall change only its path and affected relative citations, not its basename, short form, item IDs, anchors, ownership, or behavior.

## Records

### META-4

Each DR shall follow the ADR format [[2]] with `Status`, `Context`, `Decision`, and `Consequences` sections.

### META-5

Each IR shall contain `Goal`, `Deliverables` with checkboxes, numbered one-commit-size `Tasks`, and `Acceptance criteria`.

### META-23

DRs and IRs shall contain only what is needed to act on or audit the record, preferring bullets and tables over long prose.

### META-24

A DR shall specify durable choices, constraints, and tradeoffs rather than duplicate operative behavior or implementation logic.
Implementation detail belongs in a DR only when it is part of the design contract.

### META-25

In DR and IR prose, each sentence shall begin on a new line for diff readability.
List items, table cells, and fixed-width wrapping are exempt.

## Item syntax

### META-6

Each normative behavior statement shall use GEARS [[1]]:

```text
[Where <static preconditions>] [While <stateful preconditions>] [When <one trigger>] The <subject> shall <observable behavior>.
```

### META-7

Given-When-Then shall map Given to Where/While, When to When, and Then to the shall clause.

### META-8

Each item shall state every item-specific condition, value meaning, outcome, and failure in the item or an adjacent table it owns.
It may use package-wide meaning defined in Intent, an exact same-package citation, or an exact peer-package External Behavior citation allowed by [META-14](#meta-14); it shall not rely on folder placement, file inventory, implicit context, or an undefined token.

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
Except for the Binding endpoint lines required by [META-31](#meta-31), every citation inside a normative item shall appear inline immediately after the exact phrase, table cell, or assertion whose meaning it supplies or checks.
The trace lines `Composes:`, `Bindings:`, and `Verifies:` shall not be used.
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

### META-19

External sources shall use numbered markers such as `[[1]]` linked to authoritative URLs in the same file's `References` section, with no uncited entries.

## Verification

### META-20

Each Verification item shall inline-cite at least one target item beside the exact assertion that directly checks it.
In a package Verification item, item citations may target only same-package behavior.
In a composition Verification item, item citations may target only a same-file Binding or Scenario, plus an external Binding it directly checks.
Within Verification, every item citation denotes direct coverage of its target; setup, background, supporting, and merely transitive citations are prohibited.

### META-21

Package Verification shall check the package's offered contract, consumed requirements, private invariants, and local failures with controlled collaborators.
Binding Verification shall check installed endpoint compatibility, selection, and scope.
Scenario Verification shall check integrated system outcomes.
Assembly Binding Verification shall exercise the assembled package-user role at its external surface; supply Binding Verification may use conformance inspection.

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
The metadata keys `Clients:`, `Suppliers:`, and `Scope:` are language-neutral tokens.

### META-31

Each Binding item shall carry these lines immediately below its heading:

```text
Clients: <role> = <exact package behavior citation>, ...
Suppliers: <role> = <exact package External Behavior citation or named external service selected by a cited DR>, ...
Scope: <package instances, environment, profile, request, resource, tenant, or other installation scope>
```

`Clients:` and `Suppliers:` declare endpoint direction and roles; `Scope:` declares the installed instances and applicability.
Ordinary citations cannot supply those facts, so these lines are authoritative Binding structure rather than duplicate trace lists.
Every endpoint shall have an explicit role.
The prose shall explain semantic compatibility without broadening, weakening, or translating either endpoint.
Required conversion shall be owned by an adapter package.

A supply Binding shall cite a complete provider-neutral Internal consumed meaning as its client and External Behavior or a selected service as its supplier; it shall not bind a private invariant or implementation allocation.
An assembly Binding shall cite External Behavior as its endpoints to install a package-user-visible role; it does not let one package import another.
A Binding shall not mix External and Internal client roles; split them because they have different audiences and evidence grades.
An Internal item cited as a client shall contain one complete consumed requirement and its rejection behavior, not an unrelated private invariant or second independently supplied requirement.
If a controlled collaborator could satisfy the meaning, it is consumed and bindable; otherwise it is a private invariant and is not a Binding endpoint.
For a named external service, the Binding shall name the exact selected capability, cite the selecting decision, and verify compatibility with the client meaning.

### META-32

A Binding may group several clients or suppliers only when they form one atomic installation decision; bindings are not assumed to be one-to-one.
The item shall state how its supplier roles collectively satisfy its client roles.
If the installation owner intends an endpoint or scope to be selected, changed, or verified independently, it belongs in a separate Binding; merely imaginable technical replacement does not split one declared policy decision.
For each client role and applicable scope, exactly one effective Binding shall exist unless the client contract defines aggregation, fallback, or runtime selection.
Here a client role is identified by its cited item, role label, resolved package instance, and scope.

When one contract has several installed instances, `Scope:` shall assign each a stable local instance name; the package citation identifies the contract and the name identifies its installation.

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
Every projection shall resolve deterministically from the authoritative items and agree on that graph; no projection becomes an independent source of truth.

The traces are:

```text
package Behavior -> inline package Verification citation -> contract evidence
package External Behavior -> inline Scenario citation -> Scenario -> inline Verification citation -> acceptance evidence
material package Internal Behavior -> inline Scenario citation -> Scenario (remains hidden from package users)
supplier External Behavior -> assembly Binding -> External client role
supplier External Behavior or selected service -> Binding -> package Internal requirement
Binding -> inline Scenario citation -> Scenario
Binding -> inline Verification citation -> conformance evidence
```

## Authoring language

### META-27

Authoring language: en

Where a specs tree declares an authoring language, its specs shall use that language.
The declaration shall use exactly `Authoring language: <code>`, where `<code>` contains only ASCII letters, digits, and hyphens.

## References

[1]: https://sublang.ai/ref/gears-ai-ready-spec-syntax "GEARS: AI-Ready Spec Syntax"
[2]: https://github.com/npryce/adr-tools "ADR Tools"
