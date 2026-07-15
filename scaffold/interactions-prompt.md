<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

Fill in @specs/interactions/ — the home of cross-package behavior (see @specs/meta.md META-31):

- Read the ## Verification section of every file in @specs/packages/. Move each test item that exercises multiple spec packages into a file under @specs/interactions/, named after the behavior or scenario it exercises (kebab-case; never a concatenation of package names).
- Each interaction file needs an H1 with its own ALLCAPS short form, an ## Intent section, and GEARS items; test items keep a `Verifies:` line citing the package items they check (e.g. `[AUTH-3](../packages/auth.md#auth-3)`).
- Capture cross-package behaviors that are currently implicit: scan the Where/While/When clauses of package items for references to other packages' subjects, and specify the emerging scenarios as interaction items with their own integration or acceptance test items.
- Do not specify unit tests; interaction tests are integration and acceptance tests spanning two or more packages.
- List new interaction files in the ## Interactions section of @specs/map.md with one-line summaries.
- Finish by running `spex lint` and resolving remaining errors.
