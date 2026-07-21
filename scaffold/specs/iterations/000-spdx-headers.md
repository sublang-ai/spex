<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-000: SPDX Headers

## Goal

Apply [LIC-1](../packages/licensing.md#lic-1), [LIC-2](../packages/licensing.md#lic-2), [LIC-5](../packages/licensing.md#lic-5) to in-scope files and pin the project's header format.

## Deliverables

- [ ] Add SPDX headers to in-scope files missing them
- [ ] Add `LIC-8` to the User Behavior of [`packages/licensing.md`](../packages/licensing.md) with the project's actual header format, license, and copyright

## Tasks

1. Resolve scope: detect a project-root license file per [LIC-7](../packages/licensing.md#lic-7); enumerate in-scope files per [LIC-6](../packages/licensing.md#lic-6).

2. Insert SPDX lines in each file's first comment block (after any shebang), using the file's native comment syntax.

3. Add `LIC-8` to the `## User Behavior` section of [`packages/licensing.md`](../packages/licensing.md), showing the concrete header per comment style. Example for a single Apache-2.0 `LICENSE`:

   ```markdown
   <!-- SPDX-License-Identifier: Apache-2.0 -->
   <!-- SPDX-FileCopyrightText: <year> <holder> -->
   ```

   ```typescript
   // SPDX-License-Identifier: Apache-2.0
   // SPDX-FileCopyrightText: <year> <holder>
   ```

## Acceptance criteria

- [LIC-3](../packages/licensing.md#lic-3), [LIC-4](../packages/licensing.md#lic-4) pass on all in-scope files.
