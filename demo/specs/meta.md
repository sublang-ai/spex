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
| `packages/` | standalone package contracts |
| `compositions/` | installed bindings, integrated scenarios, and their verification |
| `map.md` | navigation and traceability |
| `meta.md` | this format contract |

### META-2

Directories below `packages/` and `compositions/` shall be navigation-only collections.
Their names and nesting shall confer no semantic meaning.

## Items

### META-3

Each normative behavior statement shall use the GEARS pattern [[1]]:

```text
[Where <static preconditions>] [While <stateful preconditions>] [When <one trigger>] The <subject> shall <observable behavior>.
```

Given-When-Then maps Given to Where/While, When to When, and Then to the shall clause.
Adjacent domain tables and trace lines are normative but are not behavior statements.

### META-4

Each behavior, binding, scenario, and verification item shall have a globally unique stable ID of the form `<SHORT>-<N>` as its Markdown heading.
`<SHORT>` shall equal the containing file's H1 short form.
Released IDs shall not be renumbered or reused.
Each package and composition file shall have a globally unique short form in its H1 heading.
Its H1 shall use `# <SHORT>: <Title>`.

### META-5

Each item shall state every item-specific condition, value meaning, outcome, and failure in the item or an adjacent table it owns.
It may use package-wide meaning defined in Intent or an exact same-package citation; it shall not rely on folder placement, file inventory, implicit context, or an undefined token.

### META-6

Spec citations shall use relative Markdown links to exact item anchors.
External sources shall use numbered markers and authoritative URLs in the same file's `References` section.

## Packages

### META-10

A package shall own one intent and a cohesive set of concepts.
Every shall-clause subject in its behavior sections shall be package-owned.

### META-11

Each package file shall use only these `##` sections, in order:

1. `Intent`
2. `User Behavior`, when named humans observe package outcomes
3. `Collaborator Behavior`, when another package or host may rely on provided outcomes
4. `Internal Behavior`, when the package has consumed requirements or private invariants
5. `Verification`, when package-local verification is specified
6. `References`, when external sources are cited

At least one behavior section shall be present.

### META-12

A package shall define locally every domain value, result, state, policy, route, shape, provenance rule, scope rule, and mismatch outcome needed by its behavior.
Package-wide meaning belongs in Intent; item-specific meaning belongs beside its owning item.
Human-readable domain meaning shall not be replaced by a package-interface manifest.

### META-13

User Behavior shall describe only outcomes visible to the named humans, using the language those humans and the package exchange.

### META-14

Collaborator Behavior shall describe provider outputs and guarantees on which a peer package or host may rely.
Internal Behavior shall describe provider-neutral requirements the package consumes and semantic invariants it keeps private.
Internal does not mean source layout, classes, algorithms, framework mechanics, or other replaceable implementation detail.
Human visibility alone does not decide the boundary: reliance and direction do.

A peer may rely only on Collaborator Behavior.
An installation Binding may cite Internal Behavior as a client requirement, but that citation does not make the item a provided contract.
Scenarios and peer packages shall not cite Internal Behavior.

### META-15

A reusable package shall remain understandable, contract-testable, and usable unchanged outside this project.
It shall define collaborator meanings in its own vocabulary and shall not cite peer packages, bindings, compositions, or project decisions.
Intrinsic domain or provider specialization is allowed when Intent states it honestly and the package remains reusable unchanged within that scope.
A package tied to one product instance shall say that it is project-local.

Package presence shall not imply a closed-world rule.
For example, a GitHub identity package does not by itself mean that the installed system permits only GitHub login.

### META-16

Each package Verification item shall carry a `Verifies:` line immediately below its heading and cite behavior items in the same package.
Package Verification shall use controlled collaborators to check the package contract, private invariants, and local failure boundaries without executing a selected peer implementation.

### META-17

Package files shall contain no `Requires:`, `Uses:`, or `Binds:` relationship metadata.
A package shall state a consumed collaborator requirement as Internal Behavior without naming its supplier.
The selected supplier shall be recorded once by an installation Binding outside both packages.

### META-18

A replaceable code dependency shall not create a behavioral package dependency, Binding, or Scenario.
Its behaviorally relevant guarantee belongs in the owning package; its selection belongs in implementation artifacts or, when rationale is durable, a decision record.

## Compositions

### META-20

`compositions/` shall contain system-instantiation files.
A file may bind package requirements, describe integrated human or operator outcomes, or do both.
Bindings and Scenarios are distinct item kinds; no file-level type flag shall restate the sections present.

### META-21

Each composition file shall use only these `##` sections, in order:

1. `Intent`
2. `Binding`, optional
3. `Scenario`, optional
4. `Verification`
5. `References`, optional

At least one of `Binding` and `Scenario` shall be present.

### META-22

Each Binding item shall carry these lines immediately below its heading:

```text
Clients: <role> = <exact package behavior citation>, ...
Suppliers: <role> = <exact package User or Collaborator Behavior citation or named external service selected by a cited decision>, ...
Scope: <the package instances, environment, profile, request class, or other installation scope>
```

Each endpoint shall have an explicit role; roles and prose shall make an n:m item unambiguous without positional pairing.
The prose shall explain why the supplied meaning satisfies the client requirement without changing either endpoint.
If conversion is required, an adapter package shall own it.

A supply Binding shall cite a complete provider-neutral Internal consumed meaning as its client and Collaborator Behavior or a selected service as its supplier; it shall not bind a private invariant or implementation allocation.
A public Binding may cite User or Collaborator Behavior as its endpoints to install a human- or host-visible role; it does not let one package import another.
A Binding shall not mix public and Internal client roles; split them because they have different audiences and evidence grades.
An Internal item cited as a client shall contain one complete consumed requirement and its rejection behavior, not an unrelated private invariant or second independently supplied requirement.
If a controlled collaborator could satisfy the meaning, it is consumed and bindable; otherwise it is a private invariant and is not a Binding endpoint.
For a named external service, the Binding shall name the exact selected capability, cite the selecting decision, and verify compatibility with the client meaning.

### META-23

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

### META-24

Each Scenario item shall carry a `Composes:` line immediately below its heading.
`Composes:` shall cite User or Collaborator Behavior from at least two packages, including at least one User Behavior item that grounds the human- or operator-meaningful outcome.
It shall not cite Internal Behavior or list a package merely because code calls it.

When a Scenario materially depends on installed bindings, a `Bindings:` line citing those Binding items shall immediately follow `Composes:`.
Scenario prose shall state the causal handoff in product language rather than redefine either binding endpoint.

### META-25

Binding and Scenario may share a file when they have one cohesive intent, owner, scope, and change cadence and the binding materially serves a same-file scenario.
Every Binding in a mixed file shall be cited by at least one same-file Scenario.
Cross-cutting or independently changing bindings shall live in a binding-only file and may be cited by Scenarios elsewhere.

### META-26

Each composition Verification item shall carry a `Verifies:` line immediately below its heading and cite same-file Binding or Scenario items it checks.
Every same-file Binding and Scenario shall be covered.
Binding verification checks endpoint compatibility, selection, and scope; Scenario verification checks the integrated outcome.
Public Binding verification shall exercise the assembled human- or host-visible role at its public surface; supply Binding verification may use conformance inspection.
One verification item need not cite both kinds merely because the file is mixed.
A composition Verification item may additionally cite an external Binding that it directly checks; that Binding still requires coverage in its defining file.

### META-27

Authoritative package and Binding sources shall remain separate.
A package-focused installed overlay and a global binding index may project the same Binding graph for navigation, but both shall be read-only derived views.
Every text and UI projection shall resolve deterministically from the authoritative items and agree on the same installed graph; no projection becomes an independent source of truth.

### META-28

Scenarios shall hold most product-level acceptance: primary journeys, representative denials, dependency failure and recovery, cross-package consistency, integrated accessibility, security boundaries, and deployed operation.
Package-local validation matrices, private invariants, local races, and adapter edge cases shall remain in package Verification.

The acceptance trace shall be:

```text
package User or Collaborator Behavior -> Composes -> Scenario -> Verifies -> acceptance evidence
supplier User or Collaborator Behavior -> Binding -> public client role
supplier Collaborator Behavior or selected service -> Binding -> package Internal requirement
```

## Records

### META-30

Each decision record shall use the ADR sections `Status`, `Context`, `Decision`, and `Consequences` [[2]].
Decisions explain durable choices and rationale; they shall not be the sole source of operative behavior or installed binding truth.

## Authoring language

### META-31

Authoring language: en

The specs shall be authored in English.

## References

[1]: https://sublang.ai/ref/gears-ai-ready-spec-syntax "GEARS: AI-Ready Spec Syntax"
[2]: https://github.com/npryce/adr-tools "ADR Tools"
