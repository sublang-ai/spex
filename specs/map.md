<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Spec Map

Quick-reference index for locating spec files.
Spec items are the source of truth.
Code can be inconsistent with specs during development.

## Authoring and reviewing specs

Know the rules in [`meta.md`](meta.md) before authoring, modifying, or reviewing a DR, IR, or item.

- DRs and IRs: see [Overall](meta.md#overall), [Record format](meta.md#record-format), and [Citation](meta.md#citation).
- Items: see [Overall](meta.md#overall), [Item syntax](meta.md#item-syntax), [Spec packages](meta.md#spec-packages), [Testing](meta.md#testing), and [Citation](meta.md#citation).

## Layout

```text
decisions/    Decision records (DRs)
intents/      Intent records (IRs)
packages/     Spec packages (one file per package)
map.md        This index
meta.md       The spec of specs
```

## Decisions

| ID | File | Summary |
| --- | --- | --- |
| [DR-000](decisions/000-spec-structure-format.md) | 000-spec-structure-format.md | Spec structure, format, and naming conventions |
| [DR-001](decisions/001-scaffold-localization.md) | 001-scaffold-localization.md | Scaffold localization via per-language overlays |
| [DR-002](decisions/002-desktop-app-architecture.md) | 002-desktop-app-architecture.md | Spex desktop app: web-first three-layer architecture, monorepo, release preservation |
| [DR-003](decisions/003-runtime-reuse.md) | 003-runtime-reuse.md | Embedded headless runtime + captain shell; record-driven read-only panes |
| [DR-004](decisions/004-config-and-persistence.md) | 004-config-and-persistence.md | Shared playbook config ownership, app-local SQLite store, readiness |
| [DR-005](decisions/005-compilation-integration.md) | 005-compilation-integration.md | slc as external toolchain; in-app registry generation |
| [DR-006](decisions/006-projects-and-forge.md) | 006-projects-and-forge.md | Projects as local git repos; gh-CLI GitHub forge adapter |
| [DR-007](decisions/007-conversational-session-start.md) | 007-conversational-session-start.md | Sessions lands on a Captain-first start view; one motion to the first turn |
| [DR-008](decisions/008-native-shell-bridge.md) | 008-native-shell-bridge.md | Feature-detected `window.spexNative` bridge for OS pickers only |
| [DR-009](decisions/009-at-hand-interaction.md) | 009-at-hand-interaction.md | At-hand interaction: no forced surface switches; in-place popovers; global attention badge; browsable history |
| [DR-010](decisions/010-interface-craft.md) | 010-interface-craft.md | Interface craft: conversation-first, human status, honest async, guardrails, keyboard, accessibility, one visual grammar |
| [DR-011](decisions/011-project-workspace.md) | 011-project-workspace.md | Project-first workspace: four-surface taxonomy, project palette, per-project tabs + Specs/Repo, interactive spec view |
| [DR-012](decisions/012-spec-package-files.md) | 012-spec-package-files.md | One-file spec packages; mechanical migration; spec linter |
| [DR-013](decisions/013-sublang-brand.md) | 013-sublang-brand.md | SubLang brand adoption: purple interaction hue, warm light neutrals, brand-recolored product logo and app icon |
| [DR-014](decisions/014-released-toolchain.md) | 014-released-toolchain.md | Released toolchain adoption: playbook 2.0 / cligent 0.16 host boundary, effort key, slc-emitted registry wrapper, invalidation, session cwd |
| [DR-015](decisions/015-reference-content.md) | 015-reference-content.md | Reference content: built-in sources + catalog, slc demo example, Academy seed project, packages-layout spec view |
| [DR-016](decisions/016-relationship-presentation.md) | 016-relationship-presentation.md | Superseded by DR-000: classified relationship presentation gives way to one citation mechanism |
| [DR-017](decisions/017-intent-records.md) | 017-intent-records.md | Iterations become intents: disposable intent records, bare `IR-<N>` commit references, mechanical migration |
| [DR-018](decisions/018-one-contract-per-item.md) | 018-one-contract-per-item.md | One requirement per item: one governing GEARS statement with per-kind attachments; advisory lint |
| [DR-019](decisions/019-inline-agent-configuration.md) | 019-inline-agent-configuration.md | Inline agent configuration: profile-less blocks, runtime-bounded adapters, adapter-scoped efforts, captain-adapter parity, no shorthand surface |
| [DR-020](decisions/020-desktop-live-smoke.md) | 020-desktop-live-smoke.md | Desktop live smoke: env-guarded handshake, real-run driver, split hermetic/live release gates |
| [DR-021](decisions/021-skill-based-migration.md) | 021-skill-based-migration.md | Skill-based spec migration: installable agent skill + guide replace scripted structural migration; CLI narrows to detection and guidance |

## Intents

| ID | File | Intent |
| --- | --- | --- |
| [IR-000](intents/000-spdx-headers.md) | 000-spdx-headers.md | Add SPDX headers to applicable files |
| [IR-001](intents/001-scaffold-cli.md) | 001-scaffold-cli.md | Implement the scaffold CLI per the scaffold package |
| [IR-002](intents/002-workspace-restructure.md) | 002-workspace-restructure.md | Move the scaffold CLI to packages/cli in an npm-workspaces monorepo |
| [IR-003](intents/003-core-service.md) | 003-core-service.md | Implement the headless core service per the core-service package |
| [IR-004](intents/004-run-view-ui.md) | 004-run-view-ui.md | Implement the web UI run view per the run-view package |
| [IR-005](intents/005-desktop-shell.md) | 005-desktop-shell.md | Implement the Electron desktop shell per the app-shell package |
| [IR-006](intents/006-projects-forge.md) | 006-projects-forge.md | Implement Projects and the gh forge adapter per the projects package |
| [IR-007](intents/007-dashboard.md) | 007-dashboard.md | Implement the Dashboard per the dashboard package |
| [IR-008](intents/008-settings.md) | 008-settings.md | Implement Settings over the shared config per the settings package |
| [IR-009](intents/009-library-compile.md) | 009-library-compile.md | Implement the Library and slc compile flow per the playbook-library package |
| [IR-010](intents/010-hardening.md) | 010-hardening.md | Real-shell verification, docs, and deferred-work inventory |
| [IR-011](intents/011-ux-round.md) | 011-ux-round.md | Conversational start, native picker, pipeline view, organized work lists |
| [IR-012](intents/012-captain-chat-home.md) | 012-captain-chat-home.md | IM-style Captain home: greeting, chip menu with silent init, quick start, slash menu |
| [IR-013](intents/013-at-hand-round.md) | 013-at-hand-round.md | At-hand round: profile popover, nav badge, slash compile entry, past sessions |
| [IR-014](intents/014-public-readiness.md) | 014-public-readiness.md | Blockers/majors from the adversarial public-readiness review |
| [IR-015](intents/015-interface-craft.md) | 015-interface-craft.md | DR-010 applied: 51 audit findings across chat, async, keyboard, visual grammar, microcopy |
| [IR-016](intents/016-project-workspace.md) | 016-project-workspace.md | DR-011 implemented: workspace IA, project palette, spec view |
| [IR-017](intents/017-spec-structure-refactor.md) | 017-spec-structure-refactor.md | DR-012 implemented: packages layout, migration, linter, repo migration |
| [IR-018](intents/018-brand-round.md) | 018-brand-round.md | DR-013 applied: brand theme tokens, indigo→brand sweep, product logo, app icon |
| [IR-019](intents/019-toolchain-upgrade.md) | 019-toolchain-upgrade.md | DR-014 applied: playbook 2.0 / cligent 0.16 upgrade, effort rename, slc entry adoption, invalidation, session cwd |
| [IR-020](intents/020-reference-content.md) | 020-reference-content.md | DR-015 applied: built-in sources + catalog, slc demo example, Academy seed, packages-layout spec view |
| [IR-021](intents/021-release-readiness.md) | 021-release-readiness.md | DR-016 applied + smoke suite + source re-vendor + mainline merge |
| [IR-022](intents/022-intent-records.md) | 022-intent-records.md | DR-017 applied: intents rename across framework, scaffold, tooling, and this tree |
| [IR-023](intents/023-one-contract-per-item.md) | 023-one-contract-per-item.md | DR-018 applied: meta surgery, advisory item/sentence lint, template and demo conformance |
| [IR-024](intents/024-inline-agents.md) | 024-inline-agents.md | DR-019 applied: playbook 3.1 / slc 0.2 inline-agent adaptation |
| [IR-025](intents/025-desktop-live-smoke.md) | 025-desktop-live-smoke.md | DR-020 applied: live desktop smoke driver and gate split |
| [IR-026](intents/026-spec-structure-alignment.md) | 026-spec-structure-alignment.md | DR-000 rewrite applied: packages-only layout, basename IDs, enclosed citations across every tree |
| [IR-027](intents/027-toolchain-and-migration-skill.md) | 027-toolchain-and-migration-skill.md | DR-021 applied: migration skill, guide, seeding/lint alignment, migration modules retired |
| [IR-028](intents/028-cli-release-acceptance.md) | 028-cli-release-acceptance.md | 1.0 CLI release gated on end-user smoke, live agent migration acceptance, regenerated READMEs |
| [IR-029](intents/029-spec-view-alignment.md) | 029-spec-view-alignment.md | Desktop parser and spec view aligned with the 1.0 law: legacy compositions, citation-only rows |
| [IR-030](intents/030-spec-view-reading-craft.md) | 030-spec-view-reading-craft.md | Three-lens reading-craft round: plain-prose digests, cross-file rollups, jump return, reachable meta.md |
| [IR-031](intents/031-meta-law-1-0.md) | 031-meta-law-1-0.md | Owner-tightened meta law renumbered to document order (meta-1..29) and propagated repo-wide |

## Packages

| File | Summary |
| --- | --- |
| [app-shell.md](packages/app-shell.md) | Desktop shell: single-instance window, notifications, dock badge, core-in-main over WebSocket, packaging; packaged-app acceptance |
| [core-service.md](packages/core-service.md) | Headless core service: WebSocket protocol, config load/seed/reload, session lifecycle, record streaming, persistence, readiness — with fake-adapter end-to-end coverage |
| [dashboard.md](packages/dashboard.md) | Dashboard: ranked attention queue, running sessions, forge work lists, usage rollups; deterministic derivation from the record stream and store |
| [desktop-session.md](packages/desktop-session.md) | A Boss session in the packaged app: shell process topology, core streaming, and run-view rendering over one protocol |
| [forge-work-lists.md](packages/forge-work-lists.md) | Repo tab and Dashboard render the same forge-adapter data |
| [git.md](packages/git.md) | Commit message format and AI co-authorship trailers |
| [licensing.md](packages/licensing.md) | SPDX header requirements, file-scope rules, and header presence checks |
| [lint.md](packages/lint.md) | `spex lint`: structure with the legacy-tree skill pointer, package sections, item IDs, citation form and coverage, citation discipline, reference markers, records, map listing |
| [playbook-library.md](packages/playbook-library.md) | Playbook library: browse/enable, per-role inline agents, slc compile pipeline, registry validation, comment-preserving config writes |
| [projects.md](packages/projects.md) | Projects: register/create local git repos, repo state, gh forge binding and work lists, safe removal |
| [release.md](packages/release.md) | Versioning, changelog, release process, CI-green publish gate, package hygiene, end-user and live migration smokes |
| [run-view.md](packages/run-view.md) | Run view: Captain pane, read-only player transcripts, Boss composer, protocol-only rendering, fixture-stream coverage |
| [scaffold.md](packages/scaffold.md) | Scaffold CLI: target resolution, idempotent seeding, LICENSE emission, language selection, --update template refresh with merge prompt and legacy-generation migration guidance to the spec-structure-migration skill |
| [settings.md](packages/settings.md) | Settings: Captain agent editor with launcher-parity validation, adapter readiness, comment-preserving YAML round-trip |
| [shared-config-roundtrip.md](packages/shared-config-roundtrip.md) | One config file, one fail-closed rule set across Settings, core, and Library |
| [spec-view.md](packages/spec-view.md) | Spec view: package tree, filters + search, citation jumps, records reader; specs.get/specs.read parse contract for the packages layout (deferred from IR-017, realized in IR-020) |
