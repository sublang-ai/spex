<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Spec Map

Quick-reference index for locating spec files.
Spec items are the source of truth.
Code can be inconsistent with specs during development.

## Layout

```text
decisions/  Decision records (DRs)
iterations/ Iteration records (IRs)
items/      Spec item files
    user/       User-visible behavior
    dev/        Implementation requirements
    test/       Acceptance testing
map.md      This index
meta.md     The spec of specs
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

| Group | File | Summary |
| --- | --- | --- |
| dev | [git.md](items/dev/git.md) | Commit message format and AI co-authorship trailers |

### LIC

| Group | File | Summary |
| --- | --- | --- |
| dev | [licensing.md](items/dev/licensing.md) | SPDX header requirements and file-scope rules |
| test | [licensing.md](items/test/licensing.md) | Copyright and license header presence checks |

### SCAF

| Group | File | Summary |
| --- | --- | --- |
| user | [scaffold.md](items/user/scaffold.md) | Target resolution, idempotency, agent instructions, error handling |
| dev | [scaffold.md](items/dev/scaffold.md) | Directory creation, template copying, scaffold path resolution, agent spec appending |
