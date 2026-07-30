<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-000: SPDX Headers

## Status

Pending

## Intent

Apply [[licensing-1](../packages/licensing.md#licensing-1)], [[licensing-2](../packages/licensing.md#licensing-2)], [[licensing-5](../packages/licensing.md#licensing-5)] to in-scope files and pin the project's header format.

## Deliverables

- [ ] Add SPDX headers to in-scope files missing them
- [ ] Add `licensing-9` to the External Behavior of [`packages/licensing.md`](../packages/licensing.md) with the project's actual header format, license, and copyright

## Tasks

1. Resolve scope: detect a project-root license file per [[licensing-7](../packages/licensing.md#licensing-7)]; enumerate in-scope files per [[licensing-6](../packages/licensing.md#licensing-6)].

2. Insert SPDX lines in each file's first comment block (after any shebang), using the file's native comment syntax.

3. Add `licensing-9` to the `## External Behavior` section of [`packages/licensing.md`](../packages/licensing.md), showing the concrete header per comment style. Example for a single Apache-2.0 `LICENSE`:

   ```markdown
   <!-- SPDX-License-Identifier: Apache-2.0 -->
   <!-- SPDX-FileCopyrightText: <year> <holder> -->
   ```

   ```typescript
   // SPDX-License-Identifier: Apache-2.0
   // SPDX-FileCopyrightText: <year> <holder>
   ```

## Verification

- [[licensing-3](../packages/licensing.md#licensing-3)], [[licensing-4](../packages/licensing.md#licensing-4)] pass on all in-scope files.
