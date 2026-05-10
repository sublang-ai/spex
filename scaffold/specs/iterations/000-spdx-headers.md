<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-000: SPDX Headers

## Goal

Apply [LIC-1](../dev/licensing.md#lic-1), [LIC-2](../dev/licensing.md#lic-2), [LIC-5](../dev/licensing.md#lic-5) to in-scope files and pin the project's header format.

## Deliverables

- [ ] Add SPDX headers to in-scope files missing them
- [ ] Add a `## Format` section to [`dev/licensing.md`](../dev/licensing.md) with the project's actual license and copyright

## Tasks

1. Resolve scope: detect a project-root license file per [License File Detection](../dev/licensing.md#license-file-detection); enumerate in-scope files per [Exclusions](../dev/licensing.md#exclusions).

2. Insert SPDX lines in each file's first comment block (after any shebang), using the file's native comment syntax.

3. Append a `## Format` section to [`dev/licensing.md`](../dev/licensing.md) showing the concrete header per comment style. Example for a single Apache-2.0 `LICENSE`:

   ```markdown
   <!-- SPDX-License-Identifier: Apache-2.0 -->
   <!-- SPDX-FileCopyrightText: <year> <holder> -->
   ```

   ```typescript
   // SPDX-License-Identifier: Apache-2.0
   // SPDX-FileCopyrightText: <year> <holder>
   ```

## Acceptance criteria

- [LIC-3](../test/licensing.md#lic-3), [LIC-4](../test/licensing.md#lic-4) pass on all in-scope files.
