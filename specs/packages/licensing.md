<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# licensing: Licensing Headers

## Intent

This spec covers SPDX header requirements for files included in the project, together with the acceptance tests that verify copyright and license headers.

## External Behavior

### Scope

#### licensing-5

When a project file is classified for licensing headers, the licensing scope shall exclude exactly these categories:

- No comment syntax: e.g., JSON, binaries
- Config: e.g., `.gitignore`, `.editorconfig`, `**/settings.json`, `AGENTS.md`, `.github/workflows/ci.yml`, lock files
- Generated/vendor: e.g., `dist/`, `node_modules/`, vendor directories
- License/legal documents

#### licensing-6

When the project root is inspected for its license, the license-file detector shall recognize these patterns:

- `LICENSE`, `LICENSE.txt`, `LICENSE.md`, `COPYING`
- `LICENSE-CONTENT`, `LICENSE-APACHE`, etc. (named variants)
- `LICENCE`, `LICENCE.txt` (British spelling)
- `LICENSES/` folder (REUSE convention)

### Headers

#### licensing-1

Where the file has comment syntax and is not excluded by the licensing scope [[licensing-5](#licensing-5)], while the file is git-tracked or `git add`-able, when preparing the file for inclusion in the repo, the file shall include `SPDX-FileCopyrightText` in its first comment block after any shebang.

#### licensing-2

Where the file has comment syntax, is not excluded by the licensing scope [[licensing-5](#licensing-5)], and one or more project-root license files match the license-file detector patterns [[licensing-6](#licensing-6)], while the file is git-tracked or `git add`-able, when preparing the file for inclusion in the repo, the file shall include `SPDX-License-Identifier` in its first comment block after any shebang:

- This project carries a single `LICENSE` file (Apache-2.0), so all applicable files use:

  ```markdown
  <!-- SPDX-License-Identifier: Apache-2.0 -->
  <!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->
  ```

- For source code files with `//` comment syntax:

  ```typescript
  // SPDX-License-Identifier: Apache-2.0
  // SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>
  ```

## Verification

### Header Checks

#### licensing-3

Where the file has comment syntax and is not excluded by the licensing scope [[licensing-5](#licensing-5)], while git-tracked or `git add`-able, when checking its first comment block after any shebang, the file shall contain `SPDX-FileCopyrightText` [[licensing-1](#licensing-1)].

#### licensing-4

Where the file has comment syntax, is not excluded by the licensing scope [[licensing-5](#licensing-5)], and a license file matching the detector patterns [[licensing-6](#licensing-6)] exists at project root, while git-tracked or `git add`-able, when checking its first comment block after any shebang, the file shall contain `SPDX-License-Identifier` [[licensing-2](#licensing-2)].
