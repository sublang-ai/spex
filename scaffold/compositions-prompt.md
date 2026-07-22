<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

Fill in @specs/compositions/ using @specs/meta.md, especially META-16, META-20–META-22, and META-28–META-35:

- Audit every package Verification item and peer citation before composing. Retain an exact peer `## External Behavior` citation when it expresses an intentional fixed semantic dependency; move checks that require installed selections into composition Verification, and preserve each product-meaningful installed relationship as a Binding or Scenario rather than silently dropping it.
- Find External assembly roles in package `## External Behavior` and explicit consumed requirements in `## Internal Behavior`. Match assembly roles to External outcomes and supply requirements to External outcomes; do not bind private invariants or implementation allocation.
- Record each installed selection once in a Binding item with explicit endpoint roles, `Clients:`, `Suppliers:`, and `Scope:`. Name an external service's exact selected capability and decision; split endpoints or scopes that the installation owner intends to select, change, or verify independently. Keep package files unchanged and omit replaceable code dependencies.
- Write Scenario items for integrated outcomes requiring materially necessary behavior from two or more packages. Inline-cite each behavior beside the exact causal phrase, including at least one External item grounding the system outcome; cite Internal items only when necessary to state or inspect that outcome, without treating them as exposed package contracts. Inline-cite each materially exercised Binding at its handoff.
- Use a mixed file only when its bindings directly serve the same cohesive scenarios. Put cross-cutting bindings in binding-only files; use scenario-only files where no new binding is owned.
- Permit only direct operative item citations in Scenario and Verification—never background, transitive, supporting, navigation, or mere-call links.
- Add same-file Verification for every Binding and Scenario, inline-citing each target beside the assertion that directly checks it. Binding checks prove endpoint compatibility and scope; Scenario checks prove integrated outcomes. Do not specify unit tests.
- Treat directories below @specs/compositions/ as navigation-only collections and name files after the installed concern or outcome, not concatenated package names.
- List new files in the ## Compositions section of @specs/map.md, then validate exact links and the applicable META rules with format-compatible checks; never restore removed trace lines to satisfy an older checker.
