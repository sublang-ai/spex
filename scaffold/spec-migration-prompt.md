<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

Migrate every legacy Spex specs tree in this repository to the current spec generation:

- Read current `@specs/meta.md` and `@specs/decisions/000-spec-structure-format.md` fully before editing; they are the target law, and `spex scaffold --update` refreshed them while leaving legacy content untouched.
Synchronize each additional spec tree's framework law to that target while preserving tree-specific context; do not revise the target law itself without explicit human approval.
- Preserve every stated behavior, local extension, record state, checkbox, and item's concern; invent or drop nothing.
If an item ID appeared in a public release, obtain owner approval for the generation-wide spelling change before editing.
- Inventory the whole tree and build a complete rename map before moving content.
Each old short-form ID becomes `<destination-file-basename>-<N>`, lowercase, with `<N>` unchanged; resolve basename clashes first, then retarget headings, prose names, links, paths, anchors, and inbound citations tree-wide.
- Retarget old `META-*` citations by concern, never by number alone.
Non-identity mappings are `META-3` and `META-28` to `meta-30`, `META-32` to `meta-31`, `META-37` to `meta-28`, `META-38` to `meta-33`, `META-42` to `meta-29`, and `META-43` to `meta-22`; `META-17`, `META-26`, `META-31`, `META-33` through `META-36`, `META-39` through `META-41`, and `META-44` have no direct successor.
For removed law, keep still-true prose and drop the link; rewrite or remove a dead claim.
- Merge old `user/`, `dev/`, `test/`, and `items/` sources for one subject into one package; those directories are classification hints only.
Fold `interactions/` and `compositions/` into ordinary packages, and move `iterations/` records to `intents/`.
When the update created a current seed at a destination, reconcile legacy local content into it rather than overwriting or duplicating it.
- Make each package self-contained with `# <basename>: <Title>` and the current section order.
Classify guarantees its human or component users rely on as External Behavior and hidden behavior as Internal Behavior; behavior cited by a peer must be External.
- Restate each item as one GEARS requirement and place its cases or steps after the statement's final colon.
Use current item and record citation forms, put every peer binding citation at the behavior phrase it makes specific, confine Verification citations to the containing package, and remove relationship-metadata lines or detached `Verifies` sentences.
- Give every DR and IR the current sections and truthful status.
For a legacy IR missing commit-sized Tasks, recover minimal truthful tasks from history or flag the gap rather than inventing them; no DR or spec item may cite or name an IR.
- Update `map.md` and any project guidance describing the old layout.
Preserve SPDX headers byte-for-byte, keep one sentence per line, and remove legacy files or directories only after their content and citations survive in the new tree.
- Loop on `spex lint` until clean.
Manually review for residue it may not catch — old uppercase item IDs, single-bracket item citations, legacy paths, relationship-metadata lines, and dangling links — and re-read heavily restructured files for semantic fidelity.
- Hand over the rename map, every classification, dependency, status, and split judgment, and every unresolved question for human diff review; do not merge it yourself.
