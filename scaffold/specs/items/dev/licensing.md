<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# LIC: Licensing Headers

## Intent

This spec defines SPDX header requirements for files included in the project.

## Scope

### Exclusions

The following files are out of scope:

- No comment syntax: e.g., JSON, binaries
- Config: e.g., `.gitignore`, `.editorconfig`, `**/settings.json`, `AGENTS.md`, `.github/workflows/ci.yml`, lock files
- Generated/vendor: e.g., `dist/`, `node_modules/`, vendor directories
- License/legal documents

### License File Detection

Recognized patterns at project root:

- `LICENSE`, `LICENSE.txt`, `LICENSE.md`, `COPYING`
- `LICENSE-CONTENT`, `LICENSE-APACHE`, etc. (named variants)
- `LICENCE`, `LICENCE.txt` (British spelling)
- `LICENSES/` folder (REUSE convention)

## Headers

### LIC-1

Where the file has comment syntax and is not excluded by [Exclusions](#exclusions), while the file is git-tracked or `git add`-able, when preparing the file for inclusion in the repo, the file shall include `SPDX-FileCopyrightText` in its first comment block after any shebang.

### LIC-2

Where the file has comment syntax, is not excluded by [Exclusions](#exclusions), and one or more project-root license files match [License File Detection](#license-file-detection), while the file is git-tracked or `git add`-able, when preparing the file for inclusion in the repo, the file shall include `SPDX-License-Identifier` in its first comment block after any shebang.
