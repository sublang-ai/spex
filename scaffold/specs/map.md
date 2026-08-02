<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Spec Map

Quick-reference index for locating spec files.
Spec items are the source of truth.
Code can be inconsistent with specs during development.

## Authoring and reviewing specs

Know the rules in [`meta.md`](meta.md) before authoring, modifying, or reviewing a DR, IR, or item.

## Layout

```text
decisions/    Decision records (DRs)
intents/      Intent records (IRs)
packages/     Spec packages (one file per package)
map.md        This index
meta.md       The spec of specs
```

## Decisions

| ID | File | Summary |
| --- | --- | --- |
| [DR-000](decisions/000-spec-structure-format.md) | 000-spec-structure-format.md | Spec structure, format, and naming conventions |

## Intents

| ID | File | Intent |
| --- | --- | --- |
| [IR-000](intents/000-spdx-headers.md) | 000-spdx-headers.md | Add SPDX headers to applicable files |

## Packages

| File | Summary |
| --- | --- |
| [git.md](packages/git.md) | Commit message format and AI co-authorship trailers |
| [licensing.md](packages/licensing.md) | SPDX header requirements and verification checks |
