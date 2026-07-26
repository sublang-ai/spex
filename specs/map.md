<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Spec Map

Quick-reference index for locating spec files.
Spec items are the source of truth.
Code can be inconsistent with specs during development.

## Layout

```text
decisions/    Decision records (DRs)
intents/      Intent records (IRs)
packages/     Spec packages (one file per package)
compositions/ Cross-package compositions: scenarios, bindings, tests
map.md        This index
meta.md       The spec of specs
```

## Decisions

| ID | File | Summary |
| --- | --- | --- |
| DR-000 | [000-spec-structure-format.md](decisions/000-spec-structure-format.md) | Spec structure, format, and naming conventions |
| DR-001 | [001-scaffold-localization.md](decisions/001-scaffold-localization.md) | Scaffold localization via per-language overlays |
| DR-002 | [002-desktop-app-architecture.md](decisions/002-desktop-app-architecture.md) | Spex desktop app: web-first three-layer architecture, monorepo, release preservation |
| DR-003 | [003-runtime-reuse.md](decisions/003-runtime-reuse.md) | Embedded headless runtime + captain shell; record-driven read-only panes |
| DR-004 | [004-config-and-persistence.md](decisions/004-config-and-persistence.md) | Shared playbook config ownership, app-local SQLite store, readiness |
| DR-005 | [005-compilation-integration.md](decisions/005-compilation-integration.md) | slc as external toolchain; in-app registry generation |
| DR-006 | [006-projects-and-forge.md](decisions/006-projects-and-forge.md) | Projects as local git repos; gh-CLI GitHub forge adapter |
| DR-007 | [007-conversational-session-start.md](decisions/007-conversational-session-start.md) | Sessions lands on a Captain-first start view; one motion to the first turn |
| DR-008 | [008-native-shell-bridge.md](decisions/008-native-shell-bridge.md) | Feature-detected `window.spexNative` bridge for OS pickers only |
| DR-009 | [009-at-hand-interaction.md](decisions/009-at-hand-interaction.md) | At-hand interaction: no forced surface switches; in-place popovers; global attention badge; browsable history |
| DR-010 | [010-interface-craft.md](decisions/010-interface-craft.md) | Interface craft: conversation-first, human status, honest async, guardrails, keyboard, accessibility, one visual grammar |
| DR-011 | [011-project-workspace.md](decisions/011-project-workspace.md) | Project-first workspace: four-surface taxonomy, project palette, per-project tabs + Specs/Repo, interactive spec view |
| DR-012 | [012-spec-package-files.md](decisions/012-spec-package-files.md) | One-file spec packages + interactions; mechanical migration; spec linter |
| DR-013 | [013-sublang-brand.md](decisions/013-sublang-brand.md) | SubLang brand adoption: purple interaction hue, warm light neutrals, brand-recolored product logo and app icon |
| DR-014 | [014-released-toolchain.md](decisions/014-released-toolchain.md) | Released toolchain adoption: playbook 2.0 / cligent 0.16 host boundary, effort key, slc-emitted registry wrapper, invalidation, session cwd |
| DR-015 | [015-reference-content.md](decisions/015-reference-content.md) | Reference content: built-in sources + catalog, slc demo example, Academy seed project, packages-layout spec view |
| DR-016 | [016-relationship-presentation.md](decisions/016-relationship-presentation.md) | Classified spec-relationship presentation: uses, binding clients/provisions, composes, verifies — derived from clause citations |
| DR-017 | [017-intent-records.md](decisions/017-intent-records.md) | Iterations become intents: intent records (IRs) with flexible, duplication-free recording (META-37), bare `IR-<N>` commit references (GIT-5), unchanged META-18, and mechanical migration |
| DR-018 | [018-one-sentence-items.md](decisions/018-one-sentence-items.md) | One GEARS pattern per item (META-42) with structured behavior attachments; META-21 split along its concerns (META-38..41); record identity re-homed to META-43; warning-first lint |

## Intents

| ID | File | Goal |
| --- | --- | --- |
| IR-000 | [000-spdx-headers.md](intents/000-spdx-headers.md) | Add SPDX headers to applicable files |
| IR-001 | [001-scaffold-cli.md](intents/001-scaffold-cli.md) | Implement scaffold CLI per SCAF package |
| IR-002 | [002-workspace-restructure.md](intents/002-workspace-restructure.md) | Move the scaffold CLI to packages/cli in an npm-workspaces monorepo |
| IR-003 | [003-core-service.md](intents/003-core-service.md) | Implement the headless core service per the CORE package |
| IR-004 | [004-run-view-ui.md](intents/004-run-view-ui.md) | Implement the web UI run view per the RUN package |
| IR-005 | [005-desktop-shell.md](intents/005-desktop-shell.md) | Implement the Electron desktop shell per the SHELL package |
| IR-006 | [006-projects-forge.md](intents/006-projects-forge.md) | Implement Projects and the gh forge adapter per the PROJ package |
| IR-007 | [007-dashboard.md](intents/007-dashboard.md) | Implement the Dashboard per the DASH package |
| IR-008 | [008-settings.md](intents/008-settings.md) | Implement Settings over the shared config per the SET package |
| IR-009 | [009-library-compile.md](intents/009-library-compile.md) | Implement the Library and slc compile flow per the PBLIB package |
| IR-010 | [010-hardening.md](intents/010-hardening.md) | Real-shell verification, docs, and deferred-work inventory |
| IR-011 | [011-ux-round.md](intents/011-ux-round.md) | Conversational start, native picker, pipeline view, organized work lists |
| IR-012 | [012-captain-chat-home.md](intents/012-captain-chat-home.md) | IM-style Captain home: greeting, chip menu with silent init, quick start, slash menu |
| IR-013 | [013-at-hand-round.md](intents/013-at-hand-round.md) | At-hand round: profile popover, nav badge, slash compile entry, past sessions |
| IR-014 | [014-public-readiness.md](intents/014-public-readiness.md) | Blockers/majors from the adversarial public-readiness review |
| IR-015 | [015-interface-craft.md](intents/015-interface-craft.md) | DR-010 applied: 51 audit findings across chat, async, keyboard, visual grammar, microcopy |
| IR-016 | [016-project-workspace.md](intents/016-project-workspace.md) | DR-011 implemented: workspace IA, project palette, spec view |
| IR-017 | [017-spec-structure-refactor.md](intents/017-spec-structure-refactor.md) | DR-012 implemented: packages/interactions layout, migration, linter, repo migration |
| IR-018 | [018-brand-round.md](intents/018-brand-round.md) | DR-013 applied: brand theme tokens, indigo→brand sweep, product logo, app icon |
| IR-019 | [019-toolchain-upgrade.md](intents/019-toolchain-upgrade.md) | DR-014 applied: playbook 2.0 / cligent 0.16 upgrade, effort rename, slc entry adoption, invalidation, session cwd |
| IR-020 | [020-reference-content.md](intents/020-reference-content.md) | DR-015 applied: built-in sources + catalog, slc demo example, Academy seed, packages-layout spec view |
| IR-021 | [021-release-readiness.md](intents/021-release-readiness.md) | DR-016 applied + smoke suite + source re-vendor + mainline merge |
| IR-022 | [022-intent-records.md](intents/022-intent-records.md) | DR-017 applied: intents rename across framework, scaffold, tooling, and this tree |
| IR-023 | [023-one-sentence-items.md](intents/023-one-sentence-items.md) | DR-018 applied: META surgery, item/sentence lint warning, template and demo conformance |

## Packages

### CORE

| File | Summary |
| --- | --- |
| [core-service.md](packages/core-service.md) | Headless core service: WebSocket protocol, config load/seed/reload, session lifecycle, record streaming, persistence, readiness — with fake-adapter end-to-end coverage |

### DASH

| File | Summary |
| --- | --- |
| [dashboard.md](packages/dashboard.md) | Dashboard: ranked attention queue, running sessions, forge work lists, usage rollups; deterministic derivation from the record stream and store |

### GIT

| File | Summary |
| --- | --- |
| [git.md](packages/git.md) | Commit message format and AI co-authorship trailers |

### LIC

| File | Summary |
| --- | --- |
| [licensing.md](packages/licensing.md) | SPDX header requirements, file-scope rules, and header presence checks |

### LINT

| File | Summary |
| --- | --- |
| [lint.md](packages/lint.md) | `spex lint`: structure, package and composition sections, item IDs, inline-citation coverage, citation discipline, citations and anchors, reference markers, records, map listing |

### PBLIB

| File | Summary |
| --- | --- |
| [playbook-library.md](packages/playbook-library.md) | Playbook library: browse/enable, role–profile mapping, slc compile pipeline, registry validation, comment-preserving config writes |

### PROJ

| File | Summary |
| --- | --- |
| [projects.md](packages/projects.md) | Projects: register/create local git repos, repo state, gh forge binding and work lists, safe removal |

### RELEASE

| File | Summary |
| --- | --- |
| [release.md](packages/release.md) | Versioning, changelog, release process, CI-green publish gate, package hygiene |

### RUN

| File | Summary |
| --- | --- |
| [run-view.md](packages/run-view.md) | Run view: Captain pane, read-only player transcripts, Boss composer, protocol-only rendering, fixture-stream coverage |

### SCAF

| File | Summary |
| --- | --- |
| [scaffold.md](packages/scaffold.md) | Scaffold CLI: target resolution, idempotent seeding, LICENSE emission, language selection, --update with legacy-layout migration, citation rewrite, map restructure, prompts |

### SPECV

| File | Summary |
| --- | --- |
| [spec-view.md](packages/spec-view.md) | Spec view: package tree, filters + search, citation jumps, records reader; specs.get/specs.read parse contract for the packages layout (deferred from IR-017, realized in IR-020) |

### SET

| File | Summary |
| --- | --- |
| [settings.md](packages/settings.md) | Settings: profile editor with launcher-parity validation, captain selection, readiness, comment-preserving YAML round-trip |

### SHELL

| File | Summary |
| --- | --- |
| [app-shell.md](packages/app-shell.md) | Desktop shell: single-instance window, notifications, dock badge, core-in-main over WebSocket, packaging; packaged-app acceptance |

## Compositions

| File | Summary |
| --- | --- |
| [desktop-session.md](compositions/desktop-session.md) | DESK: a Boss session in the packaged app — shell process topology, core streaming, run-view rendering, one protocol |
| [forge-work-lists.md](compositions/forge-work-lists.md) | FORGE: Repo tab and Dashboard render the same forge-adapter data |
| [shared-config-roundtrip.md](compositions/shared-config-roundtrip.md) | CONF: one config file, one fail-closed rule set across Settings, core, and Library |
