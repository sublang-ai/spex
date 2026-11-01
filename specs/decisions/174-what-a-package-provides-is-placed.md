<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-174: What a Package Provides Is Placed

## Status

Accepted (2026-11-01) on the owner's direction, after a design review of the package operations that started from one gap: a spec package's spec could reach a project's agents as knowledge, but never its `specs/` as law.
Amends, under [DR-046](046-decision-record-evolution.md):

- [DR-104](104-spec-package-format-and-client-environments.md) in its manifest, its selection and its exports: a manifest declares what it `provides`; an install places each provided artifact where its kind goes, a provided spec in the project's `specs/packages/`; a release cites another release by address, and the address never leaves a release.
- [DR-115](115-a-spec-reaches-the-agents.md) in where a spec reaches the agents: in a project it stands in `specs/packages/`, read as any spec of the project; the generated skill stays the form for an environment whose root holds no `specs/`, your own group's.
- [DR-165](165-one-package-manager-hosted-by-the-cli-and-the-app.md) in how a package under development is made: `spex export` builds `spex-packages/<org>/<pkg>/` from the project's own files, as often as the author likes; `spex new` retires.
- [DR-113](113-a-projects-environment-lives-in-its-working-folder.md) in the environment's committed files: the specs an install places stand in the code beside `spex.yaml` and `spex.lock`, committed by the reader.
- [DR-043](043-minimal-spec-editing.md) in what the spec view edits: a placed spec is read there, not edited.
- [DR-012](012-spec-package-files.md) in the specs tree: a placed spec is a one-file package the linter reads as any other, whether or not the map lists it.
- [DR-172](172-surfaces-a-fresh-user-reads.md) in its vocabulary, its Packages tab and one accepted loss: "place" is the word for what an install writes for agents and into `specs/`; a row's spec line says where the spec stands; the command line's `export` closes the "New package…" loss.

## Context

- A release holds one spec. [DR-115](115-a-spec-reaches-the-agents.md) exports it to agents as a generated skill; nothing puts it into a project's `specs/`, where the project's own specs could cite it, the linter could check it and a reader would look for it. A package under development at `spex-packages/<org>/<pkg>/` has the same gap: its spec is never a spec of the project developing it.
- A release's spec carries relative citations to peer files that exist only in its author's tree; outside that tree they resolve nowhere, and no step — publish, install, export — checks them.
- `spex new` copies or moves files into a package folder once, requests the folder by path and cannot be run again; it reads like `scaffold`, and moving a file out of the tree surprises.
- An install exports every selected artifact: a playbook's support skills reach the agents' folders, and a spec a playbook was compiled `from` is exported as knowledge though it is that playbook's source.
- A spec has two honest forms, a package's own documentation — a skill's instructions, a playbook's source — and a project's law, and the review settled who decides: not the consumer, through a flag or a request key, but the author, in the manifest.
- The owner asked that `specs/` stay plain Markdown any editor or agent reads without extra knowledge, and that a citation export cannot carry be warned about and dropped, never refused.

## Decision

### The author declares what the package provides

- `meta.yaml` gains `provides`, a list of artifact kinds the project is offered: `[spec]` for a spec package, `[skill]` for a skill, `[playbook, skill]` for a playbook also callable through a skill of its own. Absent, every kind the package holds; an empty list is refused.
- An artifact a sibling names in `from`, or one a sibling of another kind names in `requires`, is that sibling's support and is never offered, whatever `provides` says: a playbook's source spec stays its source, a skill a playbook requires stays the playbook's; a playbook a playbook requires is a peer, offered on its own.
- Kinds, not ids: `provides` reads as the package's nature; `requires` already gives per-artifact precision where it is needed.

### An install places what is provided

| Kind, when provided | Where an install places it |
| --- | --- |
| spec | in a project, `specs/packages/<pkg>.md` under a root holding `specs/`; in your own group's environment, whose root holds none, the generated skill of DR-115 in the user-level agent folders |
| skill | the agent folders, as today |
| playbook | available to enable, with its generated skill, as today |
| applet | its tab, as today |

- An artifact not provided is installed and placed nowhere.
- A request narrows what it takes with `select`, as today. No consumer verb is added: `add` is the import, and `enable`/`disable` stay the playbook's words in the Playbooks tab, since a playbook alone needs a choice no file can make — a player per role. The command line gets neither.

### A placed spec is Spex's copy, derived once per install

- It is written from the release's spec file in its chosen language, opening with one comment line — `<!-- Placed by Spex from <org>/<pkg> <version>; an edit makes this file yours. -->` — so a reader, an agent, the linter and a fresh clone know the file without `.spex/`, its citations rewritten (below), its path, package, version and hash recorded in the install record, and committed with the code by the reader like `spex.yaml` and `spex.lock`, so a fresh clone installs to no diff and a version move shows the adopted spec's change in review.
- A file whose bytes equal the derivation is the package's copy, record or no record; one equal to the hash last recorded is rewritten when the derivation moves; any other is edited: the install leaves it standing, places nothing over it and reports it, naming the version that waits — the moment a person or an agent merges.
- The copy leaves when the package is removed or no longer provides its spec, unless edited: then it is the project's own, and that is how a project forks a spec.
- A file of that basename already in `specs/` that is not this package's copy blocks the placement, reported; of two packages of one `<pkg>`, the one whose copy already stands is placed, else the first by `<org>`, and the other is not. No alias renames a placed spec: its basename is its identity.
- A project's root without `specs/` places no spec and reports it, naming `spex scaffold`.

### A citation crosses a release's boundary by rewrite, in both directions

- An address `spex:<org>/<pkg>#<id>` cites another release's spec item and exists only inside a release: `spex-packages/`, the registry, `.spex/`. `specs/` holds plain relative links, always.
- `export`, tree to release: a relative citation whose target is the spec of a published or exported package becomes its address; one whose target is a local spec of no package is removed, the phrase kept, with a warning naming the item and the target; one whose target a `<pkg>.md` two packages under development claim is removed the same way, the warning naming both; one whose target is `meta.md` at the specs root, which the scaffold puts in every tree, is kept, written as the link from `specs/packages/` where the placed spec stands; a decision record's link keeps its text and loses its link, warned the same way. A citation never carries its meaning [[meta-15](../meta.md#meta-15)], so what is lost is the claim of a binding, which the author may restate in the item's own words.
- Place, release to tree: an address whose package's spec stands in this `specs/` becomes a relative link; one whose package does not is removed, the phrase kept, with a warning naming the package and `spex add <org>/<pkg>` to link them; a relative link to `meta.md` is kept as it is. Placed specs are derived again whenever the set of placed specs changes, so adding the cited package later makes its links appear.
- A publish uploads the folder as it is; the registry reads no prose.

### `spex export` builds the package from the project; `spex new` retires

- `spex export <org>/<pkg>`, with `--spec <file>` and `--skill <folder>` naming the project's own files on a first export and on any export adding an artifact, builds `spex-packages/<org>/<pkg>/` in the release layout by copying: the author's files stay where they are, in `specs/` and the agent folders, with their relative links, where editors, the linter and the Specs tab read them.
- A first export writes `meta.yaml` with `provides` from the kinds given, the description and the license as `new` derived them, and the version `0.1.0`; a later export keeps the manifest, which the author edits, and refreshes each artifact from the project by identity — the spec `<pkg>.md` wherever it stands under `specs/`, unique by [[meta-10](../meta.md#meta-10)]; a skill from the agent folder holding a folder of its name that Spex did not place.
- A playbook the authoring session compiles in the folder is left as it is: the folder is that playbook's home already.
- An export requests nothing: the author's project has the files in place. The folder is published as before, by name.

### Words

- "Place" is the word, on every surface and in the specs, for what an install writes for the agents and into `specs/`: a skill is placed for your agents, a spec is placed in `specs/`. The lock's `exports` key keeps its name; `spex export` is the author's verb alone.
- A Packages tab row counts and lists only what the package provides. Its spec line says where the spec stands and what to do: "spec · in specs/packages/⟨pkg⟩.md", "spec · edited in specs/ — left as yours", "spec · not placed — specs/ holds ⟨pkg⟩.md already", "spec · needs specs/ — scaffold first"; a spec whose links wait reads "⟨n⟩ links wait for ⟨org/pkg⟩" with one act, "Add", requesting that package.
- In the Specs tab a placed spec's package node reads "From ⟨org/pkg⟩ ⟨version⟩ · placed by Spex" and offers no Edit, nor do its items; the file is changed where it comes from.
- DR-172's accepted loss closes: an IDE "Export…" waits; the command line's `export` serves.

## Consequences

- The environments, command line, Playbooks and Packages, spec view and lint items are amended in one change with this record: the manifest's field, selection and placement, the install record, `environment.get`, the usage with `export` in `new`'s place, `list`'s spec lines, the causes, the row words, the read-only placed node, the map warning's exemption, and their verification; retired item ids are never reused.
- Three implementation changes follow, each merged on green: the library and the command line; the core's state and the IDE's two tabs with their catalogs; the journeys.
- A manifest without `provides` offers every kind it holds: a spec-only package's spec lands in each consumer's `specs/` at their next install, which is the change intended; a playbook compiled `from` its spec keeps that spec as its source.
- In a project, the generated spec skill of DR-115 is no longer written; your own group's environment keeps it, so a spec added for yourself still reaches every session on this device.
- The linter knows a placed spec by its first line, so a placed spec unlisted in `map.md` draws no warning on any checkout, and the project's own files draw it as before.
- The registry checks a manifest's fields and refuses one it does not know, so its own check accepts `provides` in a change of its own before a manifest naming the field is published there; the stand-in registry shares the library's check and needs nothing.
