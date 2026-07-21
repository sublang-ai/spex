<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

Fill in @specs/compositions/ using @specs/meta.md META-31–META-36:

- Find public assembly roles in package ## User Behavior or ## Collaborator Behavior and explicit consumed requirements in ## Internal Behavior. Match public roles to User/Collaborator outcomes and supply requirements to Collaborator outcomes; do not bind private invariants or implementation allocation.
- Record each installed selection once in a Binding item with explicit endpoint roles, `Clients:`, `Suppliers:`, and `Scope:`. Name an external service's exact selected capability and decision; split endpoints or scopes that the installation owner intends to select, change, or verify independently. Keep package files unchanged and omit replaceable code dependencies.
- Write Scenario items for human- or operator-meaningful outcomes requiring public behavior from two or more packages. Add `Composes:` and cite materially used Binding items through `Bindings:`.
- Use a mixed file only when its bindings directly serve the same cohesive scenarios. Put cross-cutting bindings in binding-only files; use scenario-only files where no new binding is owned.
- Add same-file Verification for every Binding and Scenario. Binding checks prove endpoint compatibility and scope; Scenario checks prove integrated outcomes. Do not specify unit tests.
- Treat directories below @specs/compositions/ as navigation-only collections and name files after the installed concern or outcome, not concatenated package names.
- List new files in the ## Compositions section of @specs/map.md, then run `spex lint` and resolve applicable errors.
