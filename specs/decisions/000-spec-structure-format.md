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
- **Items** must follow the active GEARS pattern defined by [META-6](../meta.md#meta-6) to specify behaviors and constraints.
Each item file must include the active intent section defined by [META-3](../meta.md#meta-3).

### Organization

Spex creates the default `specs/` directory under the repo root, with the following subdirectories and files.

| Path | Content | File Naming |
| --------- | ------- | ------ |
| `decisions/` | DRs. Design decisions and rationale. | \<NNN\>-\<kebab-case\>.md |
| `iterations/` | IRs. Implementation plans. | \<NNN\>-\<kebab-case\>.md |
| `packages/` | Spec packages: one item file per package. | [\<path\>/]\<kebab-case\>.md |
| `interactions/` | Cross-package behaviors, scenarios, and their tests. | [\<path\>/]\<kebab-case\>.md |
| `map.md` | spec index for navigation | - |
| `meta.md` | the spec of specs | - |

### Item syntax

The active `meta.md` defines the GEARS [[2]] item pattern, clause forms, and GWT mapping.
This keeps localized scaffolds aligned with the same framework without restating English-only syntax here.

### Spec packages

A spec package is a coherent set of spec items for a *single* intent.
It is the basic unit for spec composition, reuse, and extension.

A spec package is one file under `packages/`, so a developer reads one file to understand one package.
Each package file carries the sections defined by [META-28](../meta.md#meta-28):

- `## External Behavior` for user-visible behavior — what the system does.
- `## Internal Behavior` for implementation requirements — how the system is built.
- `## Verification` for test items that check the package's own claims.

For example, a spec package for generating short URLs may be `specs/packages/signing/gen-url.md`, where `signing/` is a local collection of related packages for development convenience.

### Interactions

Behavior that emerges from multiple packages working together lives in `interactions/`, organized by behavior or scenario per [META-30](../meta.md#meta-30) — never as a concatenation of package names.
Integration and acceptance tests that span packages are specified there; unit tests are never specified ([META-21](../meta.md#meta-21)).

`map.md` indexes packages and interactions.

### Citations

DRs and items are persistent and may cite each other.
IRs may be temporary and must not be cited by DRs or items.
`map.md` may cite IRs, as it indexes all spec files and is kept in sync as files change.

## Consequences

- Consistent structure and format across development cycles
- One file per package: a single read covers a package's external behavior, internal behavior, and verification
- Cross-package behavior has a dedicated home instead of being implicit
- Flexible expression of design and implementation
- Legacy `user/`/`dev/`/`test/` trees migrate via `spex scaffold --update`

## References

[1]: https://github.com/npryce/adr-tools "ADR Tools"
[2]: https://sublang.ai/ref/gears-ai-ready-spec-syntax "GEARS: AI-Ready Spec Syntax"
