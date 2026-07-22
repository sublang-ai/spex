<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-000: Spec Structure and Format

## Status

Accepted

## Context

Specifications (specs) need a standardized format and structure to support iterative development and collaboration between AI and humans.
Earlier revisions of this record split each spec package across up to three files (`user/`, `dev/`, `test/`), which forced a reader to open several files to understand one package.

## Decision

### Elements

Spex organizes specs around three essential elements of software development:

- **Decisions**. The choices made in product and system *design*.
- **Iterations**. The incremental plans for *implementation*.
- **Requirements**. The *behaviors* and *constraints* of the product and system.

### Forms

Spex uses two forms of specs to balance unification and flexibility.

- **Records** must follow specified formats and may use free-form content within those formats.
Decisions and iterations are stored as records.
  - Decision records (DRs) follow the ADR (Architectural Decision Record) format [[1]], with active section titles defined by [META-4](../meta.md#meta-4).
  - Iteration records (IRs) contain the sections defined by [META-5](../meta.md#meta-5).
- **Items** use the active GEARS pattern defined by [META-6](../meta.md#meta-6) for their normative behavior statements; structural metadata and trace lines follow `meta.md`.
Each item file must include the active intent section defined by [META-3](../meta.md#meta-3).

### Organization

Spex creates the default `specs/` directory under the repo root, with the following subdirectories and files.

| Path | Content | File Naming |
| --------- | ------- | ------ |
| `decisions/` | DRs. Design decisions and rationale. | \<NNN\>-\<kebab-case\>.md |
| `iterations/` | IRs. Implementation plans. | \<NNN\>-\<kebab-case\>.md |
| `packages/` | Standalone package contracts: one item file per package. | [\<path\>/]\<kebab-case\>.md |
| `compositions/` | Installed bindings, integrated scenarios, and verification. | [\<path\>/]\<kebab-case\>.md |
| `map.md` | spec index for navigation | - |
| `meta.md` | the spec of specs | - |

### Item syntax

The active `meta.md` defines the GEARS [[2]] item pattern, clause forms, and GWT mapping.
This keeps localized scaffolds aligned with the same framework without restating English-only syntax here.

### Spec packages

A spec package is a coherent set of spec items for a *single* intent.
It is the basic unit for spec composition, reuse, and extension.

A spec package is one file under `packages/`, so one read covers its complete package-owned contract and exposes every fixed dependency by an exact link.
Each package file carries the sections defined by [META-28](../meta.md#meta-28):

- `## External Behavior` for outcomes and guarantees on which the package's human, host, or component users may rely.
- `## Internal Behavior` for behavior hidden from package users, including provider-neutral consumed requirements and private semantic invariants.
- `## Verification` for package-local contract checks with controlled collaborators.

Behavior classification is relative to the package, not to whether a human sees it.
Package sources contain no installed supplier or relationship annotations; they may cite exact peer External Behavior when a fixed semantic dependency is intentionally part of the package contract.
A reusable package stays unchanged across compatible installations.

For example, a spec package for generating short URLs may be `specs/packages/signing/gen-url.md`, where `signing/` is a local collection of related packages for development convenience.

### Compositions

System-instantiation files live in `compositions/` per [META-31](../meta.md#meta-31).
A `Binding` item installs either an External assembly role across External Behavior or External Behavior/a named service for a package's Internal requirement; a `Scenario` item describes an integrated outcome from materially necessary behavior across packages, grounded by at least one External item.
One cohesive file may contain either or both, without a file-type flag.

Bindings are authoritative outside packages and may be projected back as read-only installed overlays.
Scenarios carry integrated acceptance while package-local invariants remain in package Verification ([META-21](../meta.md#meta-21)).

`map.md` indexes packages and compositions.

### Citations

DRs and items are persistent and may cite each other only where `meta.md` permits; reusable packages contain no project-decision citations and may cite peer packages only through exact External Behavior for intentional fixed semantic dependencies.
IRs may be temporary and must not be cited by DRs or items.
`map.md` may cite IRs, as it indexes all spec files and is kept in sync as files change.

## Consequences

- Consistent structure and format across development cycles
- One file per package: a single read covers its complete package-owned contract and exposes each fixed dependency by an exact link
- Installed dependencies and integrated outcomes have distinct item kinds and one explicit home
- Package source remains reusable while derived installed views keep bindings easy to navigate
- Flexible expression of design and implementation
- Legacy `user/`/`dev/`/`test/` trees migrate via `spex scaffold --update`

## References

[1]: https://github.com/npryce/adr-tools "ADR Tools"
[2]: https://sublang.ai/ref/gears-ai-ready-spec-syntax "GEARS: AI-Ready Spec Syntax"
