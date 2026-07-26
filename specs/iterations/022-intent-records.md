<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-022: Intent Records

## Goal

Apply [DR-017](../decisions/017-intent-records.md): rename iteration records to intent records across the framework definition, scaffold templates, tooling, and this repository's own trees.

## Deliverables

- [ ] DR-017 recorded; META-1/META-5 renamed, META-37 and GIT-5 added
- [ ] Scaffold templates (en and zh) seed `specs/intents/` and describe intent records
- [ ] `spex scaffold --update` migrates `specs/iterations/` to `specs/intents/`: files, citations, and map entries
- [ ] `spex lint` guards the intents layout with legacy tolerance
- [ ] Core parses and the spec view presents intent records, with a legacy-directory fallback
- [ ] This tree and `demo/` migrated; wording updated in `map.md`, `meta.md`, `README.md`, and DR-000

## Tasks

1. Record DR-017 and this IR; add META-37 and GIT-5; index in `map.md`
2. Rename scaffold templates and seeding, extend lint, and add the `--update` migration step (CLI)
3. Rename the records protocol field and spec-view copy (core and UI)
4. Migrate this tree and `demo/`, updating framework wording and citations

## Acceptance criteria

- Workspace tests pass and `spex lint` is clean on this tree and `demo/` after migration
- A packages-layout tree with `specs/iterations/` ends a `spex scaffold --update` run with `specs/intents/`, rewritten citations, and renamed map entries
- A tree not yet migrated still lints without unknown-entry errors and still renders its records in the spec view
