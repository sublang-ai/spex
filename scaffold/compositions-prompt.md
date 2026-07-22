<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

Fill in @specs/compositions/ using @specs/meta.md, especially META-31–META-38:

- Audit every package Verification item and peer citation before composing. Retain an exact peer `## External Behavior` citation when it expresses an intentional fixed semantic dependency; move checks that require installed selections into composition Verification, and preserve each product-meaningful installed relationship as a Binding or Scenario rather than silently dropping it.
- Find External assembly roles in package `## External Behavior` and explicit consumed requirements in `## Internal Behavior`. Match assembly roles to External outcomes and supply requirements to External outcomes; do not bind private invariants or implementation allocation.
- Record each installed selection once in a Binding item with explicit endpoint roles, `Clients:`, `Suppliers:`, and `Scope:`. Name an external service's exact selected capability and decision; split endpoints or scopes that the installation owner intends to select, change, or verify independently. Keep package files unchanged and omit replaceable code dependencies.
- Write Scenario items for integrated outcomes requiring materially necessary behavior from two or more packages. Add `Composes:` with at least one External item grounding the system outcome; include Internal items only when necessary to state or verify that outcome, without treating them as exposed package contracts. Cite materially used Binding items through `Bindings:`.
- Use a mixed file only when its bindings directly serve the same cohesive scenarios. Put cross-cutting bindings in binding-only files; use scenario-only files where no new binding is owned.
- Add same-file Verification for every Binding and Scenario. Binding checks prove endpoint compatibility and scope; Scenario checks prove integrated outcomes. Do not specify unit tests.
- Treat directories below @specs/compositions/ as navigation-only collections and name files after the installed concern or outcome, not concatenated package names.
- List new files in the ## Compositions section of @specs/map.md, then run `spex lint` and resolve applicable errors.
