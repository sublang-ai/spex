<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

Fill in @specs/compositions/ — the home of cross-package behavior (see @specs/meta.md META-31):

- Read the ## Verification section of every file in @specs/packages/. Move each test item that exercises multiple spec packages into a file under @specs/compositions/, named after the behavior or scenario it exercises (kebab-case; never a concatenation of package names).
- Each composition file needs an H1 with its own ALLCAPS short form and the sections of META-34: ## Intent, then ## Binding and/or ## Scenario, then ## Tests; test items cite, inline at each assertion, the same-file items they execute plus the package items they check (e.g. `[AUTH-3](../packages/auth.md#auth-3)`). Cite only what a phrase directly exercises or checks — no background or transitive links, and no metadata lines.
- Capture cross-package behaviors that are currently implicit: scan the Where/While/When clauses of package items for references to other packages' subjects, and specify the emerging scenarios as composition items with their own integration or acceptance test items.
- Where a package names an abstract subject or open slot (e.g. "the deployment's media provider"), add a binding item wiring it to another package's items or to a concrete service (META-31); a seam no product user observes is a supply binding, tested by inspecting the deployment rather than by a user journey.
- A binding item is static — no trigger clause: its preconditions cite the client items (or name the deployment surface), and its shall clause cites the supplier's External Behavior, names the selected service, or states the installation's own rule over cited External inputs (META-31).
- Do not specify unit tests; composition tests are integration and acceptance tests spanning two or more packages.
- List new composition files in the ## Compositions section of @specs/map.md with one-line summaries.
- Finish by running `spex lint` and resolving remaining errors.
