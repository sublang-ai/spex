<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# LIC: Licensing Headers

## Intent

This package lets contributors and reviewers identify the copyright and license of included project files through consistent SPDX headers.
It owns header scope and content, not the project's license choice.
It is project-local.

## External Behavior

### LIC-6

When a project file is classified for licensing headers, the licensing scope shall exclude exactly these categories:

- files with no comment syntax, such as JSON and binaries;
- configuration such as `.gitignore`, `.editorconfig`, `**/settings.json`, `AGENTS.md`, `.github/workflows/ci.yml`, and lock files;
- generated or vendor content such as `dist/`, `node_modules/`, and vendor directories; and
- license and legal documents.

### LIC-7

When the project root is inspected for its license, the license-file detector shall recognize these patterns:

- `LICENSE`, `LICENSE.txt`, `LICENSE.md`, `COPYING`
- `LICENSE-CONTENT`, `LICENSE-APACHE`, etc. (named variants)
- `LICENCE`, `LICENCE.txt` (British spelling)
- `LICENSES/` folder (REUSE convention)

### LIC-1

Where the file has comment syntax and is not excluded by [LIC-6](#lic-6), while the file is git-tracked or `git add`-able, when preparing the file for inclusion in the repo, the file shall include `SPDX-FileCopyrightText` in its first comment block after any shebang.

### LIC-2

Where the file has comment syntax, is not excluded by [LIC-6](#lic-6), and one or more project-root license files match [LIC-7](#lic-7), while the file is git-tracked or `git add`-able, when preparing the file for inclusion in the repo, the file shall include `SPDX-License-Identifier` in its first comment block after any shebang.

### LIC-5

Where a file's first comment block already contains `SPDX-FileCopyrightText` or `SPDX-License-Identifier` from an upstream source (e.g., a template or vendored file copied from another project), when preparing the file for inclusion in the repo, those existing SPDX lines shall be preserved unmodified, even when the project root carries a different license.

Each preserved upstream line satisfies its respective [LIC-1](#lic-1)/[LIC-2](#lic-2) requirement; any missing required line shall be supplied from upstream, not the project license.

## Verification

### LIC-3

Where the file has comment syntax and is included by the [licensing scope](#lic-6), while git-tracked or `git add`-able, when checking its first comment block after any shebang, the verification shall assert the [copyright-header requirement](#lic-1) by finding `SPDX-FileCopyrightText`.

### LIC-4

Where the file has comment syntax, is included by the [licensing scope](#lic-6), and the [license-file detector](#lic-7) recognizes a project-root license, while git-tracked or `git add`-able, when checking its first comment block after any shebang, the verification shall assert the [license-header requirement](#lic-2) by finding `SPDX-License-Identifier`.

### LIC-8

Where a file already contains upstream SPDX lines and the project license differs, when inclusion preparation runs, the verification shall assert [byte-for-byte preservation of every upstream line and use of upstream rather than project license data for any missing required line](#lic-5).
