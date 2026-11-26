<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-015: Reference Content and the Packages-Layout Spec View

## Status

Accepted.
Amends [DR-011](011-project-workspace.md).
Amended by [DR-058](058-chat-assisted-playbook-authoring.md), [DR-089](089-every-fresh-user-scenario-walked-for-real.md), [DR-104](104-spec-package-format-and-client-environments.md), [DR-140](140-reopen-the-removed-academy-example.md), [DR-158](158-a-legible-graph-and-outline.md).

## Context

- slc's repository carries a complete worked example — a short two-agent workflow compiled to gears, FSM, and runtime — that demonstrates what compilation produces; the app had no example content in the Playbooks surface.
- The repository's `demo/` directory ("Academy") is a complete, lint-clean specs corpus in the [DR-012](012-spec-package-files.md) packages layout, self-described as the initial example project for the app; no code referenced it.
- The spec view still parsed the legacy `user/`/`dev/`/`test/` layout, so it could not render Academy — or this repository's own tree.

## Decision

### The built-in playbooks

- The built-in playbooks come from a spec package the app ships ([DR-104](104-spec-package-format-and-client-environments.md)), their sources browsable before any configuration change.

### The slc demo example

- A project's Playbooks tab shows an example adapted from slc's two-agent workflow demo as a read-only example card: source, normalized text, gears, and FSM, presented in the same pipeline grammar as compiled playbooks and crediting slc's demo ([DR-089](089-every-fresh-user-scenario-walked-for-real.md)).
- A prefill action opens an authoring workspace with the example placed ([DR-058](058-chat-assisted-playbook-authoring.md)).
- The example is display content owned by the UI; it does not touch config or protocol.

### Academy as the seed project

- The Academy corpus ships as a core asset, staged at build from the repository's `demo/` directory (the single source of truth).
- Project creation gains an example mode, mutually exclusive with scaffold mode: materialize the corpus into an empty or absent directory, `git init`, add everything, and commit; then register the project as usual.
  An existing unregistered Academy working folder is registered and opened without reseeding ([DR-140](140-reopen-the-removed-academy-example.md)).
- The project palette and the spec view's empty state offer the example with one action.

### Spec view: packages layout

- `specs.get` parses `packages/**` (collection directories are navigation only), `decisions/`, `intents/`, `map.md`, and `meta.md`.
- A file's short form comes from its `# <SHORT>: <Title>` heading, falling back to the majority item prefix.
- The three filter groups are section kinds, keeping [DR-011](011-project-workspace.md)'s three-toggle model: external (sky: External Behavior), internal (lime: Internal Behavior — [DR-158](158-a-legible-graph-and-outline.md)), and test (teal: Verification).
- Citations are read from inline links only and presented as plain inbound and outbound rows with no derived classes; relationship-metadata lines are absent.
- The legacy layout is detected and reported as an explicit tree state; the view renders a migration notice naming `npx @sublang/spex scaffold --update` instead of a package tree.
- The protocol version bumps with the tree-shape change; core and UI move together.

## Consequences

- The Academy corpus adds a sync burden, bounded by staging from its single source of truth.
- The example card gives the Playbooks tab teaching content without inventing a second pipeline grammar.
- Seeding Academy gives every fresh install a real project to open, browse in the spec view, and run `/code` against.
- The legacy spec layout stops rendering; migration guidance replaces silent partial parses.
