<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

Review Git diffs under @specs/ and perform a spec update merge:

- If @specs/decisions/000-spec-structure-format.md or @specs/meta.md changed, update existing @specs/ files to conform while preserving local content that still applies.
- Preserve every item ID and normative concern that appeared in a prior release; provisional IDs may be compacted before publication. Classify behavior relative to each package: outcomes and guarantees on which a human, host, component, or higher layer using the contract may rely belong in `## External Behavior`; behavior hidden from package users, including provider-neutral consumed requirements and private semantic invariants, belongs in `## Internal Behavior`.
- Make every package self-contained. Keep an exact peer External citation only when an intentional fixed semantic dependency is part of the package contract. Otherwise remove peer, Binding, Scenario, `Requires:`, `Uses:`, and `Binds:` relationship annotations from package source, define selectable requirements locally as Internal Behavior, and select suppliers outside the package.
- Migrate cross-package files to @specs/compositions/ and the fixed Intent/Binding?/Scenario?/Tests/References? grammar (META-34). In each Binding, state applicability and client givens in its `Where` clause and the installed provision in its shall clause, using exact inline endpoint citations, a named service with its selecting decision, an installation-owned rule over cited External inputs, or a concrete installed value. Put every material behavior, installed-handoff, and verification citation inline beside the exact causal phrase or assertion; remove endpoint metadata, `Composes:`, `Bindings:`, and `Verifies:` trace lines, and every supporting or incidental item link.
- Do not infer system-wide exclusivity from package inventory, convert replaceable code dependencies into bindings, or force one test to cite both a Binding and a Scenario.
- Weave every detached `Verifies …` sentence the mechanical migration left (`spex lint` flags each as `cite/detached`): move each citation into the assertion it verifies, then delete the sentence.
- Rewrite merged ## Intent paragraphs into one concise statement (no citations — META-15) and check each file's title still fits.
- Update @specs/map.md summaries where the merge left them stale.
- Focus only on the update merge; do not refine unrelated spec content.
- Finish by running `spex lint` and resolving remaining errors; never restore removed trace lines to satisfy an older checker.
