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

### META-2

Directories below `packages/` and `compositions/` shall be navigation-only collections.
Their names and nesting shall confer no semantic meaning.

### META-3

Each item file shall include an `## Intent` section stating its purpose.

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

### META-19

External sources shall use numbered markers such as `[[1]]` linked to authoritative URLs in the same file's `References` section, with no uncited entries.

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

### META-27

Authoring language: en

Where a specs tree declares an authoring language, its specs shall use that language.
The declaration shall use exactly `Authoring language: <code>`, where `<code>` contains only ASCII letters, digits, and hyphens.

## References

[1]: https://sublang.ai/ref/gears-ai-ready-spec-syntax "GEARS: AI-Ready Spec Syntax"
[2]: https://github.com/npryce/adr-tools "ADR Tools"
