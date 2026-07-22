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
- **Items** must follow the active GEARS pattern defined by [META-6](../meta.md#meta-6) to specify behaviors and constraints; citation and metadata rules follow the active `meta.md`.
Each item file must include the active intent section defined by [META-3](../meta.md#meta-3).

### Organization

Spex creates the default `specs/` directory under the repo root, with the following subdirectories and files.

| Path | Content | File Naming |
| --------- | ------- | ------ |
| `decisions/` | DRs. Design decisions and rationale. | \<NNN\>-\<kebab-case\>.md |
| `iterations/` | IRs. Implementation plans. | \<NNN\>-\<kebab-case\>.md |
| `packages/` | Spec packages: one item file per package. | [\<path\>/]\<kebab-case\>.md |
| `compositions/` | Cross-package compositions: scenarios, bindings, and their tests. | [\<path\>/]\<kebab-case\>.md |
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

- `## External Behavior` for outcomes and guarantees the package's users may rely on.
- `## Internal Behavior` for consumed requirements and private invariants, hidden from the package's users.
- `## Verification` for test items that check the package's own claims.

Classification is relative to the package — a package's user may be a human, a host, or a peer component — not to what a human sees.
Package sources carry no installed-supplier annotations; a binding under `compositions/` records each selection, so a reusable package stays unchanged across installations.

For example, a spec package for generating short URLs may be `specs/packages/signing/gen-url.md`, where `signing/` is a local collection of related packages for development convenience.

### Compositions

Behavior that emerges from multiple packages working together lives in `compositions/`, organized by behavior or scenario per [META-31](../meta.md#meta-31) — never as a concatenation of package names.
Integration and acceptance tests that span packages are specified there; unit tests are never specified ([META-21](../meta.md#meta-21)).

`map.md` indexes packages and compositions.

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
