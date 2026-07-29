<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-000: Spec Structure and Format

## Status

Accepted

## Context

Specifications (specs) need a normative format and structure to support iterative development and collaboration between AI and humans.
AI-native software development is a series of human intent realization.

## Decision

### Elements

Spex organizes specs around three essential elements of software development:

- **Decisions**. The choices made in product and system *design*.
- **Intents**. The recorded development intents and their *realization*.
- **Requirements**. The *behaviors* and *constraints* of the product and system.

### Forms

Spex uses two forms of specs to balance normalization and flexibility.

- **Records** must follow specified formats and may use free-form content within those formats.
Decisions and intents are stored as records.
  - Decision records (DRs) follow the ADR (Architectural Decision Record) format [[1]].
  - Intent records (IRs) plan an intent's realization and track its progress ([META-5](../meta.md#meta-5)).
- **Items** must follow the GEARS pattern [[2]] to specify behaviors and constraints.
Each item file states its own intent alongside its items ([META-3](../meta.md#meta-3)).

### Organization

Spex creates the default `specs/` directory under the repo root, with the following subdirectories and files.

| Path | Content | File Naming |
| --------- | ------- | ------ |
| `decisions/` | DRs. Design decisions and rationale. | \<NNN\>-\<kebab-case\>.md |
| `intents/` | IRs. Intent realization plans. | \<NNN\>-\<kebab-case\>.md |
| `packages/` | Spec packages: collections of requirements and their tests. | \<kebab-case\>.md |
| `compositions/` | Cross-package compositions: scenarios, bindings, and their tests. | \<kebab-case\>.md |
| `map.md` | spec index for navigation | - |
| `meta.md` | the spec of specs | - |

### Item syntax

The active `meta.md` defines the GEARS [[2]] item pattern, clause forms, and GWT mapping.
Each scaffold language's `meta.md` states the GEARS pattern in that language's own clause forms.

### Spec packages

A spec package is a coherent set of spec items for a *single* intent.
It is the basic unit for spec composition, reuse, and extension.

A spec package is one file under `packages/` or its subdirectory.
Each package file carries the same sections in a fixed order ([META-28](../meta.md#meta-28)):

- `## External Behavior` for outcomes and guarantees the package's users see and rely on.
A package's user may be a human, a host, or a peer component.
- `## Internal Behavior` for private requirements and realizations, hidden from the package's users.
- `## Verification` for test items that check the package's own claims.

For example, a spec package for generating short URLs may be `specs/packages/signing/gen-url.md`, where `signing/` is a local collection of related packages for development convenience.

### Package relationships

A package may depend on another.
Direct use and binding are both dependencies.
Composition is not a dependency of any one package: it is behavior that exists only when several run together.

#### Direct use

The package names a specific peer behavior and relies on it.
The peer package has to be present for the behavior to hold, so the item cites the exact External Behavior it relies on — never the peer's Internal Behavior.
The citation goes wherever the reliance is: a precondition when the peer's guarantee conditions the behavior, the behavior itself when the package invokes the peer to deliver it.

#### Binding

The package needs a collaborator but does not choose it, so it names a slot rather than a peer.
A binding item under `compositions/` resolves that slot for one deployment — to another package's External Behavior, to a named external service, or to a rule or value the deployment itself supplies — which is what lets one package source serve every installation unchanged ([META-13](../meta.md#meta-13), [META-35](../meta.md#meta-35), [META-36](../meta.md#meta-36)).

#### Composition

The behavior belongs to no single package and appears only when several run together.
A scenario item under `compositions/` states it as behavior of the deployment, citing each participating package item at the phrase that uses it, and the tests that span packages live in the same file ([META-20](../meta.md#meta-20), [META-31](../meta.md#meta-31), [META-39](../meta.md#meta-39)).

### Citations

DRs and items are persistent and may cite each other.
A DR references a spec item only to support what the DR itself states, never to carry content it leaves unsaid ([META-44](../meta.md#meta-44)).
IRs may cite, but must not be cited by, DRs or items.
`map.md` may cite all spec files and is kept in sync as files change.

## Consequences

- Consistent structure and format across development cycles
- One file per package: a single read covers a package's external behavior, internal behavior, and verification
- Cross-package behavior has a dedicated home instead of being implicit
- Flexible expression of design and implementation

## References

[1]: https://github.com/npryce/adr-tools "ADR Tools"
[2]: https://sublang.ai/ref/gears-ai-ready-spec-syntax "GEARS: AI-Ready Spec Syntax"
