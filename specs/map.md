<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Spec Map

Quick-reference index for locating spec files.
Spec items are the source of truth.
Code can be inconsistent with specs during development.

## Layout

```text
decisions/    Decision records (DRs)
iterations/   Iteration records (IRs)
packages/     Spec packages (one file per package)
interactions/ Cross-package behaviors and tests
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

## Iterations

| ID | File | Goal |
| --- | --- | --- |
| IR-000 | [000-spdx-headers.md](iterations/000-spdx-headers.md) | Add SPDX headers to applicable files |
| IR-001 | [001-scaffold-cli.md](iterations/001-scaffold-cli.md) | Implement scaffold CLI per SCAF package |
| IR-002 | [002-workspace-restructure.md](iterations/002-workspace-restructure.md) | Move the scaffold CLI to packages/cli in an npm-workspaces monorepo |
| IR-003 | [003-core-service.md](iterations/003-core-service.md) | Implement the headless core service per the CORE package |
| IR-004 | [004-run-view-ui.md](iterations/004-run-view-ui.md) | Implement the web UI run view per the RUN package |
| IR-005 | [005-desktop-shell.md](iterations/005-desktop-shell.md) | Implement the Electron desktop shell per the SHELL package |
| IR-006 | [006-projects-forge.md](iterations/006-projects-forge.md) | Implement Projects and the gh forge adapter per the PROJ package |
| IR-007 | [007-dashboard.md](iterations/007-dashboard.md) | Implement the Dashboard per the DASH package |
| IR-008 | [008-settings.md](iterations/008-settings.md) | Implement Settings over the shared config per the SET package |
| IR-009 | [009-library-compile.md](iterations/009-library-compile.md) | Implement the Library and slc compile flow per the PBLIB package |
| IR-010 | [010-hardening.md](iterations/010-hardening.md) | Real-shell verification, docs, and deferred-work inventory |
| IR-011 | [011-ux-round.md](iterations/011-ux-round.md) | Conversational start, native picker, pipeline view, organized work lists |
| IR-012 | [012-captain-chat-home.md](iterations/012-captain-chat-home.md) | IM-style Captain home: greeting, chip menu with silent init, quick start, slash menu |
| IR-013 | [013-at-hand-round.md](iterations/013-at-hand-round.md) | At-hand round: profile popover, nav badge, slash compile entry, past sessions |
| IR-014 | [014-public-readiness.md](iterations/014-public-readiness.md) | Blockers/majors from the adversarial public-readiness review |
| IR-015 | [015-interface-craft.md](iterations/015-interface-craft.md) | DR-010 applied: 51 audit findings across chat, async, keyboard, visual grammar, microcopy |
| IR-016 | [016-project-workspace.md](iterations/016-project-workspace.md) | DR-011 implemented: workspace IA, project palette, spec view |
| IR-017 | [017-spec-structure-refactor.md](iterations/017-spec-structure-refactor.md) | DR-012 implemented: packages/interactions layout, migration, linter, repo migration |
| IR-018 | [018-brand-round.md](iterations/018-brand-round.md) | DR-013 applied: brand theme tokens, indigo→brand sweep, product logo, app icon |

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
| [lint.md](packages/lint.md) | `spex lint`: structure, package sections, item IDs, Verifies lines, citations and anchors, reference markers, records, map listing |

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
| [spec-view.md](packages/spec-view.md) | Spec view: package tree, filters + search, citation jumps, records reader; specs.get/specs.read parse contract (pre-DR-012 layout; adaptation deferred per IR-017) |

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
