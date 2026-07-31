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
2. A spec package is one file under `packages/` (subdirectories are navigation-only). Sections in order: `Intent`, `External Behavior`, `Internal Behavior` (optional), `Verification` (required unless irrelevant), `References` (optional).
3. The package identifier is the file basename (lowercase kebab-case, unique per tree). An item ID is `<pack>-<N>`, lowercase — the heading, the anchor, and the citation text.
4. Each item is exactly one GEARS statement (`[Where …] [While …] [When …] <subject> shall <behavior(s)>.`) elaborated only by attachments (notes, lists, tables, diagrams, examples).
5. Citations are the only relationship between packages: an item citation is an enclosed inline link, `[[pack-3](pack.md#pack-3)]`, written at the exact phrase that relies on the cited behavior. A behavior item may cite only a peer's **External Behavior**; a test item may also cite Internal Behavior its assertion materially needs. Record links (`[DR-000](…)`) stay plain.
6. DR sections: Status, Context, Decision, Consequences, References. IR sections: Status, Intent, Deliverables (checkboxes), Tasks (numbered), Verification. Nothing cites an IR except `map.md`.
7. One sentence per line, file-wide (lists, tables, diagrams exempt). Unwrap hard-wrapped sentences.
8. Spec tests are integration/system tests that prefer executing the real behavior of cited packages over substitutes.

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
- Rename all item headings per the map; convert every citation to the enclosed lowercase form with retargeted paths/anchors; make the link text the item ID and keep descriptive words as plain prose at the phrase.
- Enforce the section set and order; a package with only Internal Behavior moves its user-relied guarantees to External Behavior (External is required).
- Restructure items violating one-statement-per-item: keep the governing GEARS statement, push extra sentences into attachment case lists. Split into a new item ID only when the sentences are genuinely distinct contracts — and then fix every inbound citation tree-wide.
- Unwrap sentences; keep SPDX headers byte-identical.

### Phase 1b — the oldest layout (spex ≤ 0.3): merge `user/`/`dev/`/`test/` into packages

A tree may predate even the compositions generation: item files grouped under `specs/user/`, `specs/dev/`, and `specs/test/` (sometimes `specs/items/` or `specs/interactions/`), with `specs/iterations/` for records.
Treat each package's files across those directories as the sources of one `packages/<basename>.md`: `user/` items are candidate External Behavior, `dev/` items candidate Internal Behavior, `test/` items Verification, then apply every Phase 1 rule to the merged file (IDs, citations, sections, one statement per item).
`interactions/` files fold like compositions (Phase 2); `iterations/` records migrate like intents (Phase 3).
The directory a rule lived in is a hint, not the law — classify each item by who relies on it, exactly as Phase 1 demands.

### Phase 2 — fold compositions into packages

For each file under `compositions/` (sections Intent / Binding? / Scenario? / Tests):

- Move it to `packages/` per the map; H1 `# <basename>: <Title>`; keep item numbers.
- `Scenario` items → `External Behavior` (they are the outcomes the composed system's users rely on).
- `Binding` items → behaviors of this package: rewrite "the deployment shall resolve/bind …" jargon into plain GEARS behaviors of the installed system, preserving concrete names (services, values, policies). Default them to `Internal Behavior` (installed wiring hidden from users) — but an item that another file's *behavior* item cites must land in `External Behavior`.
- `Tests` → `Verification`, keeping citations of what each assertion checks.
- Rewrite the Intent as self-contained prose without citations and without binding/scenario/composition kind-language: the file is now an ordinary package whose behavior emerges when the cited packages work together.
- Resolve citation legality: where a behavior item cites a peer's Internal Behavior, either (a) the cited item is genuinely a guarantee the peer offers its users — hoist it to the peer's External Behavior — or (b) it is implementation discipline — drop the citation and let the phrase stay general (an uncited phrase is legal and sufficient), keeping the citation in a Verification item if a test materially needs it. Reliance by a peer's behavior is evidence of (a); module/coding constraints are evidence of (b).

### Phase 3 — records

- Every DR: sections Status/Context/Decision/Consequences(/References); item citations to the enclosed form per the map; META citations per the mapping reference; where a cited item no longer exists, keep the historical prose truthful and drop the link. A DR whose primary decision the new DR-000 *reverses* gets `Status: Superseded by [DR-000](000-spec-structure-format.md)`; an absorbed-but-true decision stays Accepted.
- Every IR: rename/reorder sections (`Goal`→`Intent`, `Acceptance criteria`→`Verification`, add `Status` — `Done` when the deliverables are checked, `In progress` otherwise, keep abandonment markings); retarget citations; add a minimal honest `Tasks` section when missing (e.g. `1. Realized across the commits referencing \`IR-<N>\`.`). Do not enrich or trim content otherwise — IRs are disposable history.
- ALLCAPS short-form prose mentions ("the AUTH package") become basename references ("the github-login package").

### Phase 4 — maps and guides

- Rewrite `map.md`: layout block without `compositions/`; Decisions/Intents tables with refreshed summaries; one flat Packages table (File | Summary) listing every package file. Update any project guides/READMEs that describe the old structure.

### Phase 5 — verify until clean

1. Run the bundled checker on each tree and fix every finding, repeating until it reports zero:
   `python3 scripts/check_specs.py <path-to-tree>`
2. Run `spex lint` (when the CLI is available) and resolve findings the same way.
3. Re-read every file you restructured heavily (composition folds, multi-statement splits) end to end: does it read standalone, truthfully, with each citation at the phrase that relies on it?
4. Grep for residue: old ALLCAPS IDs, `](…#` single-bracket item citations, `compositions/` paths, `Verifies:`-style metadata lines. None may remain outside historical commit references.

### Phase 6 — hand over

Summarize for the reviewers: the rename map, every judgment call (hoisted vs generalized citations, supersede statuses, split items, moved files), and anything you flagged instead of deciding.
Migration ends with human review of the diff — never merge it yourself.
