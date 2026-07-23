<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-015: Reference Content and the Packages-Layout Spec View

## Status

Accepted

## Context

- The built-in `/code` and `/discuss` playbooks load from `@sublang/playbook` registry exports, but the published package omits their prose sources (`code.md`, `discuss.md`); only the compiled gears and FSM artifacts ship.
  The Library's pipeline panel therefore shows the built-ins without the source stage.
- Only `/code` ships in the config template; `/discuss` is absent from the app entirely, and the Library lists configured playbooks only — there is no way to see or enable a known built-in that is not yet in the config.
- slc's repository carries a complete worked example — a six-line two-agent workflow compiled to gears, FSM, and runtime — that demonstrates what compilation produces; the app has no example content in the Playbooks surface.
- The repository's `demo/` directory ("Academy") is a complete, lint-clean specs corpus in the [DR-012](012-spec-package-files.md) packages layout, self-described as the initial example project for the app; no code references it.
- The spec view still parses the legacy `user/`/`dev/`/`test/` layout; adapting it to the packages layout was deferred when [DR-012](012-spec-package-files.md) landed, so the view cannot render Academy — or this repository's own tree.
- The compile form prefills need a normalized source: the pipeline writes sources as `<id>.md`, which skips slc's normalize phase for raw prose.

## Decision

### Built-in playbook sources

- Spex vendors `code.md` and `discuss.md` from the playbook project as core assets, with provenance headers naming the upstream path.
- Artifact resolution falls back to the vendored source when a published-package registry's directory has no adjacent source; gears and FSM keep resolving from the package.
- `captain.md` is not vendored; the published package ships it.

### Built-in catalog

- The core serves a catalog of known built-in playbooks (`code`, `discuss`) — id, command, intent, derived role ids, registry specifier, and source markdown — loaded from the registry modules the core already depends on plus the vendored sources.
- The Library renders uncofigured built-ins from the catalog: their sources are browsable before any config change, and an add flow maps roles to profiles and applies the existing `playbook.add` config edit.
- The config template ships both built-ins ([DR-004](004-config-and-persistence.md) seeding rules unchanged: existing configs are never rewritten).

### The slc demo example

- The Playbooks surface shows slc's two-agent workflow demo as a read-only example card: raw source, normalized text, gears, and FSM staged from vendored raw-text assets, presented in the same pipeline grammar as compiled playbooks.
- A prefill action copies the normalized text (not the raw prose) into the compile form, since the compile pipeline skips slc's normalize phase.
- The example is display content owned by the UI; it does not touch config, protocol, or the library directory.

### Academy as the seed project

- The Academy corpus ships as a core asset, staged at build from the repository's `demo/` directory (the single source of truth).
- Project creation gains an example mode, mutually exclusive with scaffold mode: materialize the corpus into an empty or absent directory, `git init`, add everything, and commit; then register the project as usual.
- The project palette and the spec view's empty state offer the example with one action.

### Spec view: packages layout

- `specs.get` parses the [DR-012](012-spec-package-files.md) layout: `packages/**` and `compositions/**` (collection directories are navigation only), `decisions/`, `iterations/`, `map.md`, `meta.md`.
- A file's short form comes from its `# <SHORT>: <Title>` heading, falling back to the majority item prefix.
- The three filter groups become section kinds, keeping the [DR-011](011-project-workspace.md) three-toggle model and hues:
  external (sky: External Behavior and Scenario items), internal (fuchsia: Internal Behavior and Binding items), test (teal: Verification and Tests items).
- Citations are read from inline links only; `Verifies:` metadata lines are gone per META-20.
- The legacy layout is detected and reported as an explicit tree state; the view renders a migration notice naming `npx @sublang/spex scaffold --update` instead of a package tree.
- The protocol version bumps with the tree-shape change; core and UI move together.

## Consequences

- [DR-011](011-project-workspace.md)'s spec-view group model (user/dev/test) is amended by this decision; its other sections stand.
- The vendored sources and Academy corpus add a sync burden, bounded by staging from single sources of truth and provenance headers; upstreaming the source files into the published playbook package would remove the vendored copies.
- The example card and catalog give the Playbooks surface teaching content without inventing a second pipeline grammar.
- Seeding Academy gives every fresh install a real project to open, browse in the spec view, and run `/code` against.
- The legacy spec layout stops rendering; migration guidance replaces silent partial parses.
