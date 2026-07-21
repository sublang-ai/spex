<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Spec Map

Quick-reference index for locating spec files.
Spec items are the source of truth.
Code can be inconsistent with specs during development.

## Authoring and reviewing specs

Know the rules in [`meta.md`](meta.md) before authoring, modifying, or reviewing a DR, IR, or item.

- DRs and IRs: see [Organization](meta.md#organization), [Records](meta.md#records), and [Citations and dependencies](meta.md#citations-and-dependencies).
- Items: see [Item syntax](meta.md#item-syntax), [Packages](meta.md#packages), [Compositions](meta.md#compositions), and [Verification](meta.md#verification).

## Layout

```text
decisions/    Decision records (DRs)
iterations/   Iteration records (IRs)
packages/     Standalone package contracts
compositions/ Installed bindings, integrated scenarios, and verification
map.md        This index
meta.md       The spec of specs
```

## Decisions

| ID | File | Summary |
| --- | --- | --- |
| DR-000 | [000-spec-structure-format.md](decisions/000-spec-structure-format.md) | Spec structure, format, and naming conventions |

## Iterations

| ID | File | Goal |
| --- | --- | --- |
| IR-000 | [000-spdx-headers.md](iterations/000-spdx-headers.md) | Add SPDX headers to applicable files |

## Packages

### GIT

| File | Summary |
| --- | --- |
| [git.md](packages/git.md) | Commit message format and AI co-authorship trailers |

### LIC

| File | Summary |
| --- | --- |
| [licensing.md](packages/licensing.md) | SPDX header requirements and verification checks |

## Compositions

None yet. Add files under `compositions/` when packages need installed bindings or integrated scenarios.
