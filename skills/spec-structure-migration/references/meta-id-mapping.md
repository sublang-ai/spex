<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Old META → new meta item mapping

Trees seeded from the previous scaffold generation carry `meta.md` items with ALLCAPS `META-<N>` IDs.
The current generation renumbered and reworked them; retarget citations with this table, never by number alone.

⚠ Numbers 34, 38, 39, 40, 41, and 43 were **reused with different meanings** — a blind `META-x` → `meta-x` rewrite corrupts citations.

| Old | New | Note |
| --- | --- | --- |
| META-1 | meta-1 | layout table; the compositions row is gone |
| META-3 | meta-30 | the Intent-section rule folded into the package-sections item |
| META-4 | meta-4 | DR sections (References now listed) |
| META-5 | meta-5 | IR sections changed: Status/Intent/Deliverables/Tasks/Verification |
| META-6 | meta-6 | GEARS pattern |
| META-7 | meta-7 | GWT mapping |
| META-8 | meta-8 | self-contained items |
| META-9 | meta-9 | one file per package |
| META-10 | meta-10 | basename identifier; ALLCAPS short forms abolished |
| META-11 | meta-11 | `<pack>-<N>` lowercase heading/anchor/citation text |
| META-12 | meta-12 | released IDs permanently bound |
| META-13 | meta-13 | closed set of subjects (slot machinery gone) |
| META-14 | meta-14 | citation is the only package relationship, targets External Behavior |
| META-15 | meta-15 | a package stands alone |
| META-16 | meta-16 | citation form is now the enclosed `[[id](path#id)]` link |
| META-17 | meta-17 | DRs and items may cite each other |
| META-18 | meta-18 | only map.md cites an IR |
| META-19 | meta-19 | numbered external references |
| META-20 | meta-20 | test citations (the adjacent-phrase rule moved to meta-41) |
| META-21 | meta-21 | integration/system tests only |
| META-23 | meta-23 | minimal, bullets/tables/diagrams over prose |
| META-24 | meta-24 | DRs record decisions, not implementation |
| META-25 | meta-25 | one sentence per line — now file-wide, wrapping allowance gone |
| META-26 | — | observable-outcomes rule deleted; drop the citation, keep true prose |
| META-28 | meta-30 | package sections |
| META-31 | — | compositions directory — dead; composition is a package pattern (DR-000) |
| META-32 | meta-34 | subdirectories are navigation-only |
| META-33 | — | dead (packages-may-not-cite-compositions) |
| META-34 | — | composition file sections — dead. ⚠ new meta-34 = subdirectories rule |
| META-35 | — | bindable/consumed/invariant — dead |
| META-36 | — | binding items — dead. ⚠ new meta-36 = tests prefer real behavior |
| META-37 | meta-43 | intent-record semantics → IR disposability (or meta-5 for the format) |
| META-38 | meta-38 | ⚠ content reversed: stubs-only verification became verify-unless-irrelevant; see also meta-36 |
| META-39 | — | composition-test homing — dead. ⚠ new meta-39 = record IDs (old META-43) |
| META-40 | — | binding test coverage — dead. ⚠ new meta-40 = DR references support own statements (old META-44) |
| META-41 | — | acceptance/inspection test grade — dead. ⚠ new meta-41 = citation binds its adjacent phrase |
| META-42 | meta-29 | one GEARS statement per item |
| META-43 | meta-39 | record IDs. ⚠ new meta-43 = IR disposability |
| META-44 | meta-40 | DR references support the DR's own statements |

When a phrase cites a dead item: keep the prose if the claim still holds under the new law and drop or retarget the link; if the claim itself is dead law (bindings, composition tests, stub-only verification), rewrite or remove the claim.
Never leave a link to a nonexistent anchor.
