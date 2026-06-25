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
user/       User-visible item files
dev/        Implementation item files
test/       Acceptance test item files
map.md      This index
meta.md     The spec of specs
```

## Decisions

| ID | File | Summary |
| --- | --- | --- |
| DR-000 | [000-spec-structure-format.md](decisions/000-spec-structure-format.md) | Spec structure, format, and naming conventions |
| DR-001 | [001-scaffold-localization.md](decisions/001-scaffold-localization.md) | Scaffold localization via per-language overlays |

## Iterations

| ID | File | Goal |
| --- | --- | --- |
| IR-000 | [000-spdx-headers.md](iterations/000-spdx-headers.md) | Add SPDX headers to applicable files |
| IR-001 | [001-scaffold-cli.md](iterations/001-scaffold-cli.md) | Implement scaffold CLI per SCAF package |

## Packages

### GIT

| Group | File | Summary |
| --- | --- | --- |
| dev | [git.md](dev/git.md) | Commit message format and AI co-authorship trailers |

### LIC

| Group | File | Summary |
| --- | --- | --- |
| dev | [licensing.md](dev/licensing.md) | SPDX header requirements and file-scope rules |
| test | [licensing.md](test/licensing.md) | Copyright and license header presence checks |

### RELEASE

| Group | File | Summary |
| --- | --- | --- |
| dev | [release.md](dev/release.md) | Versioning, changelog, release process, package hygiene |

### SCAF

| Group | File | Summary |
| --- | --- | --- |
| user | [scaffold.md](user/scaffold.md) | Target resolution, idempotency, update mode, framework warn-before-replace, language selection, agent instructions, error handling |
| dev | [scaffold.md](dev/scaffold.md) | Directory creation, template copying, localization overlays, update prechecks, framework pristine/modified classification and warning, file-history manifest contract, agent spec appending |
| test | [scaffold.md](test/scaffold.md) | Update state-matrix, framework warn-before-replace, localization, and over-eager-indicator regression coverage |
