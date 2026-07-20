<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# META: Demo Spec Definition

## Intent

This file defines the proposed spec organization exercised by the course website demo.

## Organization

### META-1

The `specs/` tree shall use these entries:

| Path | Content |
| --- | --- |
| `decisions/` | durable design choices and rationale |
| `packages/` | self-contained package contracts, one file per package |
| `compositions/` | cross-package outcome scenarios and acceptance verification |
| `map.md` | navigation and traceability index |
| `meta.md` | this format contract |

### META-2

Directories below `packages/` and `compositions/` shall be navigation-only collections.
Their names and nesting shall confer no ownership, visibility, dependency, runtime, or test semantics on the files they contain.
Moving a file between collections shall not change the meaning of its package or composition.

## Item syntax and identity

### META-3

Each normative behavior statement shall use the GEARS pattern [[1]]:

```text
[Where <static preconditions>] [While <stateful preconditions>] [When <one trigger>] The <subject> shall <observable behavior>.
```

Given-When-Then tests shall map Given to Where/While, When to When, and Then to the shall clause.
One item may contain consecutive statements for the same owned subject when they specify success and failure branches or one state transition; each statement shall still make its own trigger and outcome explicit.
Binding contract tables and trace lines are normative but are not behavior statements and therefore do not use GEARS syntax.

### META-4

Each item shall have a globally unique, stable ID of the form `<SHORT>-<N>` as its Markdown heading.
Released IDs shall not be renumbered or reused.
Each package and composition file shall have a globally unique short form in its H1 heading.

### META-5

Each behavior item shall be self-contained.
Its preconditions, trigger, subject, outcome, exceptional outcome, and any dependency shall be explicit in the item or in an immediately adjacent table owned by that item.

### META-6

Spec citations shall use relative Markdown links to exact item anchors.
External sources shall use numbered reference markers and authoritative URLs in the same file's `References` section.

## Packages

### META-10

A package shall own one intent and a closed set of concepts.
The subject of every shall clause in its External Behavior and Internal Behavior sections shall be one of the concepts named in its final Binding `Owns` field.
Another package may supply a precondition, input, or trigger, but the shall clause shall not assign behavior to that other package.

### META-11

Each package file shall use these `##` sections in order:

1. `Intent`
2. `External Behavior`, when the package has user-visible behavior
3. `Internal Behavior`, when the package has hidden behavior
4. `Verification`, when package-local verification is specified
5. `References`, when external sources are cited
6. `Binding`

At least one behavior section shall be present.

### META-12

The final `Binding` section shall begin with one stable `<SHORT>-0` item and name the package's immutable type-level binding contract in a table with these fields:

| Field | Purpose |
| --- | --- |
| Human users | people who exchange external language with the package |
| Owns | the package's closed subject and vocabulary set |
| Receives | semantic inputs or decisions required from its host or other packages |
| Provides | semantic outputs other packages may consume |
| Excludes | adjacent responsibilities that remain outside the package |
| Reuse | the intended portability and variation points |

Required and provided contracts shall describe meaning, not programming-language interfaces.
Any adjacent normative policy, route, state, or shape table shall be part of that same anchored Binding item unless it has its own stable item.
The section shall declare binding points rather than an installation: it shall not contain host-specific package instances, selected peer packages, deployment identities, secret values, or concrete cross-package wiring.
System-owned binding records shall select package instances and connect their declared `Provides` and `Receives` contracts without modifying the reusable package.

### META-13

External Behavior shall describe only outcomes visible to the Binding's named human users, including displayed information, accepted actions, URLs, files, status, and user-visible failures.
It shall use the vocabulary the package and those users speak to each other.

### META-14

Internal Behavior shall describe state transitions, invariants, trust boundaries, or collaborator-facing contracts hidden from the named human users but necessary to preserve external behavior.
It shall remain testable through the package's Binding contract.
It shall not prescribe source files, classes, algorithms, framework mechanics, or other replaceable implementation detail.
Chosen technologies and rationale belong in decision records; a package may cite them when a hidden behavioral guarantee depends on the choice.

### META-15

A reusable package shall keep all operative behavior in its own file, expose variation through its Binding `Receives` contract, and avoid project names in its owned concepts.
A project shall reuse a package by citing its items from any number of compositions rather than copying or specializing its requirements.

### META-16

A package Verification item shall carry a `Verifies:` line immediately below its heading, citing one or more behavior items in that same package.
Package Verification shall cover contract cases, hidden invariants, and failure boundaries that can be exercised without requiring another package's behavior.

### META-17

A package shall depend on another package only through that package's Binding `Provides` contract.
It shall not cite or require another package's Internal Behavior item.
Internal Behavior may therefore change without changing another package or a composition, provided the package's Binding contract and External Behavior remain satisfied.

## Compositions

### META-20

A composition shall describe an externally meaningful outcome that emerges from two or more packages.
It shall not own domain entities, restate a package's hidden behavior, serve as a dependency manifest, or compose another composition.

### META-21

Each composition file shall use these `##` sections in order:

1. `Intent`
2. `Scenarios`
3. `Verification`
4. `References`, when external sources are cited

### META-22

Each composition scenario shall carry a `Composes:` line immediately below its heading.
The line shall cite External Behavior items from at least two distinct packages whose visible outcomes produce the scenario.

### META-23

Each composition Verification item shall carry a `Verifies:` line immediately below its heading and cite one or more scenarios in the same composition.
The package links on each scenario shall provide transitive traceability from acceptance evidence to package behavior.
Every composition scenario shall be cited by at least one composition Verification item.

### META-24

Compositions shall hold most product-level acceptance verification: primary journeys, representative denials, dependency failures, recovery, consistency, and deployed operation.
Package-local validation matrices, hidden invariants, adapter edge cases, and component-level checks shall remain in package Verification.

### META-25

Where a composition scenario transfers a semantic value or decision between packages, it shall carry a `Binds:` block after `Composes:`.
The block shall contain one Markdown-list row per mapping in the form `<provider Binding item and contract> -> <receiver Binding item and contract>`.
Each mapping row shall cite the provider's and receiver's `<SHORT>-0` Binding items, name a contract declared verbatim in the provider's `Provides` field, and name the corresponding contract declared verbatim in the receiver's `Receives` field.
Shared preconditions, coincident outcomes, causal order, and presentation of a result are not contract transfers and shall remain in the scenario prose or `Composes:` trace rather than be represented as false bindings.
`Binds:` shall not cite Internal Behavior; it records the replaceable package seam, not hidden package design.

### META-26

Composition acceptance shall verify visible integrated outcomes and security boundaries through supported or adversarial external entry points.
It shall not duplicate every package-local invariant.
The complete acceptance trace shall therefore have two complementary paths:

```text
package External Behavior -> Composes -> scenario -> Verifies -> acceptance evidence
package Binding contract   -> Binds    -> scenario
```

## Records

### META-30

Each decision record shall use the ADR sections `Status`, `Context`, `Decision`, and `Consequences` [[2]].
Decisions shall explain durable choices and tradeoffs; they shall not be the sole source of operative package behavior.

## Authoring language

### META-31

Authoring language: en

The specs shall be authored in English.

## References

[1]: https://sublang.ai/ref/gears-ai-ready-spec-syntax "GEARS: AI-Ready Spec Syntax"
[2]: https://github.com/npryce/adr-tools "ADR Tools"
