<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-000: SPDX Headers

## Status

Pending

## Intent

Apply [[licensing-1](../packages/licensing.md#licensing-1)], [[licensing-2](../packages/licensing.md#licensing-2)], [[licensing-5](../packages/licensing.md#licensing-5)] to in-scope files, using the project's own header format [[licensing-9](../packages/licensing.md#licensing-9)].

## Deliverables

- [ ] `licensing-9` of [`packages/licensing.md`](../packages/licensing.md) names the project's license and copyright holder, with no `<...>` placeholder left
- [ ] Add SPDX headers to in-scope files missing them

## Tasks

1. Confirm the header format: the scaffold pinned `licensing-9` from the project's `LICENSE` and `git config user.name`; replace any `<license>` or `<holder>` placeholder it left with the project's SPDX license identifier and copyright holder.

2. Resolve scope: detect a project-root license file per [[licensing-7](../packages/licensing.md#licensing-7)]; enumerate in-scope files per [[licensing-6](../packages/licensing.md#licensing-6)].

3. Insert SPDX lines in each file's first comment block (after any shebang), in the file's native comment syntax as `licensing-9` shows.

## Verification

- `licensing-9` carries no `<...>` placeholder.
- [[licensing-3](../packages/licensing.md#licensing-3)], [[licensing-4](../packages/licensing.md#licensing-4)] pass on all in-scope files.
