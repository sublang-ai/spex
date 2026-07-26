<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-020: Reference Content and Spec View Adaptation

## Goal

Ship the reference content and the packages-layout spec view per [DR-015](../decisions/015-reference-content.md): built-in playbook sources and catalog, the slc demo example card, the Academy seed project, and `specs.get`/spec-view adaptation to the [DR-012](../decisions/012-spec-package-files.md) layout.

## Deliverables

- [x] Vendored `code.md` and `discuss.md` core assets with provenance headers; artifact resolution falls back to them for package registries missing an adjacent source.
- [x] `library.builtins` catalog command; Library renders unconfigured built-ins with browsable sources and an add flow over `playbook.add`.
- [x] Config template ships `code` and `discuss`.
- [x] slc demo example card in the Playbooks surface from vendored raw-text assets, with a normalized-text compile prefill.
- [x] Academy corpus staged as a core asset from `demo/`; example mode on project creation (materialize, `git init`, add-all commit, register); palette and spec-view empty state offer it.
- [x] `specs.get` parses the packages layout (H1 short forms, section-kind groups, inline citations, collection dirs, legacy detection flag); protocol version 2.
- [x] Spec view renders packages and compositions with the external/internal/test toggles and the legacy migration notice.
- [x] dev-core fake mode seeds the Academy corpus; core and UI fixtures move to the packages layout.
- [x] SPECV package spec amended; new items for the catalog, example card, and seeding; map rows added.

## Tasks

1. Vendor the built-in sources as core assets and add the artifact-resolution fallback.
2. Add the `library.builtins` command and protocol entries; serve catalog descriptors from the loaded registry entries plus vendored sources.
3. Render unconfigured built-ins in the Library with source browsing and the add flow; template gains `discuss`.
4. Vendor the slc demo assets and render the example card with the pipeline grammar and compile prefill.
5. Stage the Academy corpus into core assets at build; implement example-mode project creation in forge and service.
6. Offer the Academy example from the project palette and the spec-view empty state.
7. Rewrite the `specs.get` parser for the packages layout with the legacy flag; bump the protocol version.
8. Adapt the spec-view model and component to section-kind groups, composition nodes, and the migration notice.
9. Swap dev-core's seeded tree to the staged Academy corpus and migrate core/UI test fixtures.
10. Amend the SPECV spec and `map.md`; green all suites.

## Acceptance criteria

- `npm run build` and `npm test` pass at the repo root.
- With a fresh config, the Library lists `/code` and `/discuss` with source, gears, and FSM stages populated.
- The example card renders all four demo stages, and its prefill fills the compile form with the normalized text.
- Example-mode creation from the palette yields a registered git project whose spec view renders the Academy tree with populated groups; a legacy-layout project shows the migration notice.
- A live end-to-end pass: create the Academy example project, start a session, and run one `/code` iteration to completion or a parked Boss question.
