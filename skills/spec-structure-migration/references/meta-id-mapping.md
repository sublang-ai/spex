<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Old META → new meta item mapping

Trees seeded from the previous scaffold generation carry `meta.md` items with ALLCAPS `META-<N>` IDs.
The current generation renumbered and reworked them; retarget citations with this table, never by number alone.

⚠ The 1.0 law renumbered every surviving item by document order (`meta-1`…`meta-29`): outside META-1, META-4, META-5, and META-13 no number maps to itself — a blind `META-x` → `meta-x` rewrite corrupts citations.

| Old | New | Note |
| --- | --- | --- |
| META-1 | meta-1 | layout table; the compositions row is gone |
| META-3 | meta-15 | the Intent-section rule folded into the package-sections item |
| META-4 | meta-4 | DR sections (References now listed) |
| META-5 | meta-5 | IR sections changed: Status/Intent/Deliverables/Tasks/Verification |
| META-6 | meta-9 | GEARS pattern |
| META-7 | meta-10 | GWT mapping |
| META-8 | meta-11 | self-contained items |
| META-9 | meta-14 | one file per package |
| META-10 | meta-16 | basename identifier; ALLCAPS short forms abolished |
| META-11 | meta-17 | `<pack>-<N>` lowercase heading/anchor/citation text |
| META-12 | meta-18 | released IDs permanently bound |
| META-13 | meta-13 | closed set of subjects (slot machinery gone) |
| META-14 | meta-19 | citation is the only package relationship: a general phrase binds to a peer's External Behavior |
| META-15 | meta-20 | a package stands alone |
| META-16 | meta-25 | citation form is the enclosed `[[id](path#id)]` link, written inline at the phrase that relies on it |
| META-17 | — | DRs-and-items-may-cite-each-other — removed in 1.0; drop the link, keep the prose (the general citation rules govern) |
| META-18 | meta-26 | reworked: no DR or spec item cites an IR or names it in prose — map.md and the IRs themselves sit outside the prohibition |
| META-19 | meta-27 | numbered external references |
| META-20 | meta-28 | test citations, inline at the assertion; the peer-Internal allowance is gone — the 1.0 law is silent on it |
| META-21 | meta-22 | integration/system tests only |
| META-23 | meta-2 | minimal, bullets/tables/diagrams over prose |
| META-24 | meta-7 | DRs record decisions, not implementation |
| META-25 | meta-3 | one sentence per line — now file-wide, wrapping allowance gone |
| META-26 | — | observable-outcomes rule deleted; drop the citation, keep true prose |
| META-28 | meta-15 | package sections |
| META-31 | — | compositions directory — dead; composition is a package pattern (DR-000) |
| META-32 | meta-21 | subdirectories are navigation-only |
| META-33 | — | dead (packages-may-not-cite-compositions) |
| META-34 | — | composition file sections — dead |
| META-35 | — | bindable/consumed/invariant — dead |
| META-36 | — | binding items — dead (tests-prefer-real-behavior is meta-23) |
| META-37 | meta-8 | intent-record semantics → IR disposability (or meta-5 for the format) |
| META-38 | meta-24 | ⚠ content reversed: stubs-only verification became verify-unless-irrelevant; see also meta-23 |
| META-39 | — | composition-test homing — dead |
| META-40 | — | binding test coverage — dead |
| META-41 | — | acceptance/inspection test grade — dead |
| META-42 | meta-12 | one GEARS statement per item |
| META-43 | meta-6 | record IDs |
| META-44 | — | removed in 1.0; the DR-support rule lives in DR-000 prose |

When a phrase cites a dead item: keep the prose if the claim still holds under the new law and drop or retarget the link; if the claim itself is dead law (bindings, composition tests, stub-only verification), rewrite or remove the claim.
Never leave a link to a nonexistent anchor.
