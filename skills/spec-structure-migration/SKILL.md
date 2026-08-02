---
name: spec-structure-migration
description: Migrate a Spex specs tree from a previous spec-structure generation (spex 0.x — user/dev/test or compositions directories, ALLCAPS short-form item IDs, single-bracket citations, Goal/Acceptance intent records) to the current generation defined by DR-000 and meta.md (packages-only layout, basename item IDs, enclosed citations, Status/Intent/Deliverables/Tasks/Verification records). Use when a repo's specs/ tree predates the current spec law — e.g. it has a specs/compositions/ or specs/user/ directory, item headings like AUTH-3, or citations like [AUTH-3](auth.md#auth-3).
---

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Spec Structure Migration

You are migrating one or more spec trees to the current spec generation.
This is judgment work with mechanical guardrails: renames and link rewrites are deterministic, but section classification, composition folding, Intent rewriting, and item restructuring require reading and understanding every file.
Work tree by tree; a tree is `specs/` or any directory laid out like it (`decisions/`, `intents/`, `packages/`, `map.md`, `meta.md`).

## Ground rules

- The law is the tree's `meta.md` and `decisions/000-spec-structure-format.md` (DR-000) **in their current-generation form** — read both fully before touching anything. If the tree's `meta.md` is still old-generation, refresh it first (`spex scaffold --update`, or sync from the current scaffold) so the law you follow is the law you migrate to.
- Never edit `meta.md` or DR-000 beyond that refresh without explicit human approval.
- Work on a branch with a clean working tree; commit in reviewable steps. Every change lands as an ordinary diff for the tree's owners to review.
- If the project has published releases, item IDs that appeared in a release are permanently bound to their concerns (meta-12). The generation change renames every ID's *spelling*; confirm with a human that this rename is approved before rewriting a released tree.
- Do not invent or drop behavior. Every stated behavior in the old tree must survive, restated under the new law; anything you cannot place, flag for the humans instead of deleting.

## The target law, in brief

1. Layout (meta-1): `decisions/`, `intents/`, `packages/`, `map.md`, `meta.md`. **No `compositions/` directory.**
2. A spec package is one file under `packages/` (subdirectories are navigation-only). Sections in order: `Intent`, `External Behavior`, `Internal Behavior` (optional), `Verification`, `References` (optional).
3. The package identifier is the file basename (lowercase kebab-case, unique per tree). An item ID is `<pack>-<N>`, lowercase — the heading, the anchor, and the citation text.
4. Each item states one requirement in one GEARS statement (`[Where …] [While …] [When …] <subject> shall <behavior(s)>`). When present, attachments follow a colon ending that statement and elaborate only the requirement.
5. Every behavior relationship with a peer package is expressed by a binding citation to its **External Behavior**, enclosed inline as `[[pack-3](pack.md#pack-3)]` at the phrase it makes specific. One phrase may carry several. Test behavior citations are verification evidence confined to the containing package. Record links (`[DR-000](…)`) stay plain.
6. DR sections: Status, Context, Decision, Consequences, References. IR sections: Status, Intent, Deliverables (checkboxes), Tasks (numbered, each sized to one commit), Verification. No DR or spec item cites an IR or names it in prose — `map.md` and the intent records themselves sit outside that prohibition.
7. One sentence per line, file-wide (lists, tables, diagrams exempt). Unwrap hard-wrapped sentences.
8. Spec tests are integration/system tests that prefer executing the real behaviors bound by the behaviors under test over substitutes.

## Process

### Phase 0 — inventory and rename map

1. List every file in the tree; note which are packages, compositions, records, maps.
2. Build the deterministic rename map: for each package and composition file, old ALLCAPS prefix → file basename (numbers always preserved: `AUTH-3` → `github-login-3` for `github-login.md`). Find each file's prefix from its item headings.
3. Composition files move to `packages/<basename>.md` (flat, or into an existing navigation subdirectory when one clearly fits). Check basename uniqueness across the whole tree first; on a clash, pick a new descriptive basename and record it in the map.
4. If the tree's records or items cite old `META-<N>` items, consult `references/meta-id-mapping.md` — the old→new meta numbering is NOT identity, and several numbers were reused with different meanings. Never map a META citation by number alone.
5. Write the complete map down before editing anything; every later phase depends on it.

### Phase 1 — packages

For each file already under `packages/`:

- H1 becomes `# <basename>: <Title>`.
- Rename all item headings per the map; convert every spec-item citation to the enclosed lowercase form with retargeted paths/anchors; make the link text the item ID and keep descriptive words as plain prose at the phrase.
- Enforce the section set and order; a package with only Internal Behavior moves its user-relied guarantees to External Behavior (External is required).
- Restructure items violating one-requirement-per-item: keep the governing GEARS statement and move its cases into attachments introduced by its final colon. Split only for a distinct requirement, then fix every inbound citation tree-wide.
- Unwrap sentences; keep SPDX headers byte-identical.

### Phase 1b — the oldest layout (spex ≤ 0.3): merge `user/`/`dev/`/`test/` into packages

A tree may predate even the compositions generation: item files grouped under `specs/user/`, `specs/dev/`, and `specs/test/` (sometimes `specs/items/` or `specs/interactions/`), with `specs/iterations/` for records.
Treat each package's files across those directories as the sources of one `packages/<basename>.md`: `user/` items are candidate External Behavior, `dev/` items candidate Internal Behavior, `test/` items Verification, then apply every Phase 1 rule to the merged file (IDs, citations, sections, one requirement per item).
`interactions/` files fold like compositions (Phase 2); `iterations/` records migrate like intents (Phase 3).
The directory a rule lived in is a hint, not the law — classify each item by who relies on it, exactly as Phase 1 demands.

### Phase 2 — fold compositions into packages

For each file under `compositions/` (sections Intent / Binding? / Scenario? / Tests):

- Move it to `packages/` per the map; H1 `# <basename>: <Title>`; keep item numbers.
- `Scenario` items → `External Behavior` (they are the outcomes the composed system's users rely on).
- `Binding` items → behaviors stating the installed realization through binding citations to External Behavior. Bind behavior, never package state or implementation; a technology choice with no required behavior belongs in a DR. Default hidden installed behavior to `Internal Behavior`, but an item another file's behavior item cites must be External.
- `Tests` → `Verification`, citing only this package's behavior at each assertion; move any peer dependency into the local behavior the test verifies.
- Rewrite the Intent as self-contained prose without binding/scenario/composition kind-language: the file is now an ordinary package whose behavior emerges when its cited packages work together, and no supporting citation may carry the Intent's meaning.
- Resolve peer-Internal citations: promote behavior peers may rely on to External Behavior, or remove both the citation and the peer-specific dependency; a Verification item retains only same-package behavior citations.

### Phase 3 — records

- Every DR: sections Status/Context/Decision/Consequences(/References); item citations to the enclosed form per the map; record citations as plain links labeled by record ID; META citations per the mapping reference; where a cited item no longer exists, keep the historical prose truthful and drop the link. A DR whose primary decision the new DR-000 *reverses* gets `Status: Superseded by [DR-000](000-spec-structure-format.md)`; an absorbed-but-true decision stays Accepted.
- Every IR: rename/reorder sections (`Goal`→`Intent`, `Acceptance criteria`→`Verification`, add `Status` — `Done` when the deliverables are checked, `In progress` otherwise, keep abandonment markings); retarget citations; when `Tasks` is missing, recover one minimal truthful task per realizing commit where history supports it, otherwise write a single catch-all task stating that the decomposition is not recoverable, and flag the gap for humans. Do not enrich or trim content otherwise — IRs are disposable history.
- ALLCAPS short-form prose mentions ("the AUTH package") become basename references ("the github-login package").

### Phase 4 — maps and guides

- Rewrite `map.md`: layout block without `compositions/`; Decisions/Intents tables linking each record through its ID; one flat Packages table (File | Summary) listing every package file. Update any project guides/READMEs that describe the old structure.

### Phase 5 — verify until clean

1. Run the bundled checker on each tree and fix every finding, repeating until it reports zero:
   `python3 scripts/check_specs.py <path-to-tree>`
2. Run `spex lint` (when the CLI is available) and resolve findings the same way.
3. Re-read every file you restructured heavily (composition folds, requirement splits) end to end: does it read standalone and truthfully, with binding citations at the behavior phrases they make specific and test citations at the assertions they verify?
4. Grep for residue: old ALLCAPS IDs, `](…#` single-bracket item citations, `compositions/` paths, `Verifies:`-style metadata lines. None may remain outside historical commit references.

### Phase 6 — hand over

Summarize for the reviewers: the rename map, every judgment call (hoisted behavior, removed dependencies, supersede statuses, split items, moved files), and anything you flagged instead of deciding.
Migration ends with human review of the diff — never merge it yourself.
