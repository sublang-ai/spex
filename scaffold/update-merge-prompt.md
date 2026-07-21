<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

Review Git diffs under @specs/ and perform a spec update merge:

- If @specs/decisions/000-spec-structure-format.md or @specs/meta.md changed, update existing @specs/ files to conform while preserving local content that still applies.
- Preserve all released item IDs while classifying package behavior by meaning: human-visible outcomes in ## User Behavior, supplied peer/host outcomes in ## Collaborator Behavior, and provider-neutral consumed requirements or private semantic invariants in ## Internal Behavior.
- Make every package self-contained. Remove peer, Binding, Scenario, `Requires:`, `Uses:`, and `Binds:` citations from package source; define the required meaning locally before selecting a supplier outside the package.
- Migrate cross-package files to @specs/compositions/ and the fixed Intent/Binding?/Scenario?/Verification/References? grammar. Add explicit endpoint roles and scope to bindings, and `Composes:` plus material `Bindings:` citations to scenarios.
- Do not infer system-wide exclusivity from package inventory, convert replaceable code dependencies into bindings, or force one test to cite both a Binding and a Scenario.
- Rewrite merged ## Intent paragraphs into one concise statement and check each file's title still fits.
- Update @specs/map.md summaries where the merge left them stale.
- Focus only on the update merge; do not refine unrelated spec content.
- Finish by running `spex lint` and resolving remaining errors.
