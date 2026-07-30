<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

Capture cross-package behavior as composition packages under @specs/packages/:

- Read the ## Verification section of every file in @specs/packages/. Move each test item that exercises multiple spec packages into a package named after the emergent behavior (kebab-case; never a concatenation of package names), with the standard package sections (meta-30): ## Intent, ## External Behavior, optional ## Internal Behavior, ## Verification.
- State the emergent behaviors as spec items whose phrases cite the peer packages' External Behavior inline (e.g. `[[auth-3](auth.md#auth-3)]`) — each citation at the exact phrase that relies on the cited behavior, never as background or transitive links.
- Capture cross-package reliance that is currently implicit: scan the Where/While/When clauses of package items for references to other packages' subjects, and make each reliance an explicit citation of the peer's External Behavior.
- Test items cite, inline at each assertion, the behavior items they verify, and prefer executing the real behavior of cited packages over supplying substitutes (meta-36).
- Do not specify unit tests (meta-21); composition tests are integration and system tests spanning the composed packages.
- List new package files in the ## Packages table of @specs/map.md with one-line summaries.
- Finish by running `spex lint` and resolving remaining errors.
