<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Spec Map

Quick-reference index for locating spec files.
Spec items are the source of truth.
Code can be inconsistent with specs during development.

## Layout

```text
decisions/  Decision records (DRs)
iterations/ Iteration records (IRs)
user/       User-visible item files
dev/        Implementation item files
test/       Acceptance test item files
map.md      This index
meta.md     The spec of specs
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

## Packages

### CORE

| Group | File | Summary |
| --- | --- | --- |
| user | [core-service.md](user/core-service.md) | WebSocket endpoint, config load/seed/reload, session lifecycle, boss turns, record streaming, readiness, persistence |
| dev | [core-service.md](dev/core-service.md) | Package layout, protocol ownership, hidden-record filtering boundary, store schema, launcher parity, fake-adapter contract tests |
| test | [core-service.md](test/core-service.md) | Fake-adapter end-to-end session, visibility, config rejection, restart persistence, readiness coverage |

### DASH

| Group | File | Summary |
| --- | --- | --- |
| user | [dashboard.md](user/dashboard.md) | Ranked attention queue, running sessions, issues/PRs work lists, usage rollups, badge count |
| dev | [dashboard.md](dev/dashboard.md) | Deterministic attention derivation, store/live split, bounded forge caching |
| test | [dashboard.md](test/dashboard.md) | Attention ordering and clearing, usage rollups, stubbed-forge coverage |

### GIT

| Group | File | Summary |
| --- | --- | --- |
| dev | [git.md](dev/git.md) | Commit message format and AI co-authorship trailers |

### LIC

| Group | File | Summary |
| --- | --- | --- |
| dev | [licensing.md](dev/licensing.md) | SPDX header requirements and file-scope rules |
| test | [licensing.md](test/licensing.md) | Copyright and license header presence checks |

### PBLIB

| Group | File | Summary |
| --- | --- | --- |
| user | [playbook-library.md](user/playbook-library.md) | Playbook list, enable/disable, role–profile mapping, compile flow, toolchain guidance |
| dev | [playbook-library.md](dev/playbook-library.md) | Library-directory compiles, FSM introspection, registry validation, comment-preserving config writes |
| test | [playbook-library.md](test/playbook-library.md) | Stub-slc compile, missing toolchain, invalid registry, config round-trip coverage |

### PROJ

| Group | File | Summary |
| --- | --- | --- |
| user | [projects.md](user/projects.md) | Register/create projects, repo state cards, forge binding, issues/PRs lists, removal |
| dev | [projects.md](dev/projects.md) | Store-backed registry, local-git state refresh, adapter-only forge access, gh shell-outs |
| test | [projects.md](test/projects.md) | Fixture-repo registration, create flow, stubbed-gh forge panels, removal coverage |

### RELEASE

| Group | File | Summary |
| --- | --- | --- |
| dev | [release.md](dev/release.md) | Versioning, changelog, release process, CI-green publish gate, package hygiene |

### RUN

| Group | File | Summary |
| --- | --- | --- |
| user | [run-view.md](user/run-view.md) | Captain pane, read-only player transcripts, Boss composer, awaitBossReply, abort, layout, theme |
| dev | [run-view.md](dev/run-view.md) | Protocol-only rendering, virtualization, delta coalescing, glyph mapping, composer states |
| test | [run-view.md](test/run-view.md) | Fixture-stream rendering, hidden-record absence, reply routing, abort coverage |

### SCAF

| Group | File | Summary |
| --- | --- | --- |
| user | [scaffold.md](user/scaffold.md) | Target resolution, idempotency, top-level LICENSE emission, update mode, framework warn-before-replace, language selection, agent instructions, error handling |
| dev | [scaffold.md](dev/scaffold.md) | Directory creation, template copying, root LICENSE copy, localization overlays, update prechecks, framework pristine/modified classification and warning, file-history manifest contract, agent spec appending |
| test | [scaffold.md](test/scaffold.md) | Update state-matrix, framework warn-before-replace, top-level LICENSE emission, localization, and over-eager-indicator regression coverage |

### SET

| Group | File | Summary |
| --- | --- | --- |
| user | [settings.md](user/settings.md) | Profile editor with launcher-equivalent validation, captain selection, readiness indicators, layout/notification/theme preferences |
| dev | [settings.md](dev/settings.md) | Shared validation module, comment-preserving YAML round-trip, readiness parity, protocol-driven UI |
| test | [settings.md](test/settings.md) | Profile CRUD round-trip, validation parity, readiness fixtures, external-edit coverage |

### SHELL

| Group | File | Summary |
| --- | --- | --- |
| user | [app-shell.md](user/app-shell.md) | Single-instance window, native notifications, dock badge, native dialogs, quit safety |
| dev | [app-shell.md](dev/app-shell.md) | Core-in-main over WebSocket, login-shell env capture, asar unpacking, sandboxed renderer, app packaging |
| test | [app-shell.md](test/app-shell.md) | Packaged-app session, single instance, notification, env-capture coverage |
