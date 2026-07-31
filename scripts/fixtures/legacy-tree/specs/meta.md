<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# META: Spec Definition

## Intent

This spec defines the structure and organization of
specifications (specs) for this project.
Cross-package behavior lives under `compositions/`; the
scaffold's meta carries the same conventions.

## Organization

### META-1

The `specs/` directory shall contain the following
subdirectories and files:

| Path | Content | File Naming |
| --------- | ------- | ------ |
| `decisions/` | Decision records (DRs) | \<NNN\>-\<kebab-case\>.md |
| `intents/` | Intent records (IRs) | \<NNN\>-\<kebab-case\>.md |
| `packages/` | spec packages, one item file per package | [\<path\>/]\<kebab-case\>.md |
| `compositions/` | cross-package compositions: scenarios, bindings, and their tests | [\<path\>/]\<kebab-case\>.md |
| `map.md` | spec index for navigation | - |
| `meta.md` | the spec of specs | - |

### META-3

Each item file shall include an `## Intent` section stating its
purpose.

## Item Identity

### META-10

Each spec item shall carry a heading ID of the form
`<PREFIX>-<N>`: the file's ALLCAPS short form joined to a number
unique within the file.

### META-14

A spec item shall cite the items it relies on as inline links at
the phrases that rely on them, like
`[LIST-1](../packages/todo-list.md#list-1)`.
