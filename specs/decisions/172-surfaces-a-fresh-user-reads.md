<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-172: Package and Space Surfaces a Fresh User Reads

## Status

Accepted (2026-10-31) on the owner's direction to make every package and Space operation easy to understand for a person who installed Spex today, favoring simple and reliable over complete.
Amends [DR-011](011-project-workspace.md) in the rail and the workspace's tabs, [DR-057](057-space-surface.md) and [DR-063](063-space-setup-and-repair.md) in the sign-in card, [DR-104](104-spec-package-format-and-client-environments.md) and [DR-165](165-one-package-manager-hosted-by-the-cli-and-the-app.md) in where packages are managed and in the two verbs, [DR-114](114-groups-and-sharing-from-spex.md), [DR-120](120-the-instance-is-the-space.md) and [DR-159](159-projects-in-groups-opened-where-you-work.md) in the headings, the rows and the acts offered, [DR-128](128-a-spex-repository-placed-at-several-instances.md) in the acts offered, [DR-151](151-publish-local-spec-packages.md) in where Publish stands, [DR-168](168-independent-package-registry.md) in how a site's two faces show, [DR-058](058-chat-assisted-playbook-authoring.md) in the Enable tab's words, and [DR-078](078-the-interface-speaks-the-readers-language.md) in the glossary; extends [DR-069](069-key-phrases-not-sentences.md); builds on [DR-171](171-personal-names-are-space-logins.md), whose logins name people on every surface here.

## Context

A fresh-user audit of every phrase and flow of the package and Space operations, in the code, the catalogs, the journeys and the English catalog read with no other context, found the same roots behind the owner's examples.
The thing a person signs in to had four names on one screen: Space, instance, host and site; this computer had three; "records" meant a project's synced history, a decision record and a transcript line.
The package manager's own nouns stood on surfaces as if they were the user's: environment, request, resolve, lock, placement, seat, ticket, namespace, manifest.
The sign-in card held two controls for one choice and three sentences around one button; a project row assembled its standing from a dot, two phrases, a badge and a count; the built-in playbooks read as a registry package offered for removal; the IDE said "Resolve again" where the command line said update.
"Add a spec package" stood under Playbooks because [DR-104](104-spec-package-format-and-client-environments.md) grew the package manager inside the playbook library when a package was how a playbook arrived, and the library's items pinned the package list above the playbooks.
A Spex Space site offers groups and a registry together, while [DR-168](168-independent-package-registry.md) keeps the two grants separate.

## Decision

### Principles, extending DR-010 and DR-069

- One name per thing, the user's, identical in the IDE, the command line, the core's phrases and the documentation.
- A surface shows the exception, not the norm: a row states only what deviates from a healthy, synced, installed state.
- A choice stands before a field: a list to pick from, and a field only behind "Other…" or where no list can be read.
- Kinds and places are icons with tooltips; a standing is one phrase; a consequence lives in its control's tooltip.
- One primary act that says what it gets you; every other act in one overflow, as a whole phrase.
- The IDE keeps the acts daily work needs; an act the Space site provides, or that few need, is not offered in the IDE.
- A failure says what happened and what to do, as a phrase in the user's words; internals stay behind Details.

### Vocabulary

| The user's word | Replaces on every surface |
| --- | --- |
| Space, by its display name | instance, host, site, origin |
| group | subgroup as a word; nesting shows a group inside a group |
| Personal | your own group, your namespace, Only you |
| project; project folder | working folder, bound, registered, paired |
| records | spex repository, clone, `-spex`, unit; "decision record" and "intent record" in full |
| this computer; "Here" as a row mark | device, machine |
| server, by name | seat, ticket, place |
| package; "spec package" where its nature is explained | artifact; the user's own spec files are "specs" |
| registry, by its display name | package destination, namespace; "org" is a package name's first half |
| `spex.yaml`, `spex.lock`, `meta.yaml` | environment, manifest, request, lock as nouns |
| Update; Install | resolve, resolve again |
| Add; Remove | request, stop requesting |
| Publish | upload |
| Sync; "2 to send"; "Synced 3 min ago" | push, apply, units, local changes |
| Started separately at ⟨Space⟩ — Combine… | unrelated history, merge histories |
| Changed here and at ⟨Space⟩ — Resolve | — |
| Code: ⟨where⟩, a glyph with a tooltip | on a remote, on this instance |
| To fix (2) · 1 set aside | issues, not added |

The Chinese catalog follows one glossary: Space (as a product name), 群组, 个人, 项目, 记录, 本机, 服务器, 规约包, 注册中心, 更新, 安装, 添加, 移除, 发布, 同步, 解决, 合并; 实例, 托管平台, 注册表, 软件包, 放置 and 此设备 retire.

### The map

- The rail holds Dashboard, Projects, Space and Settings; the Playbooks entry retires, its playbook half becoming the project's Playbooks tab and its package half the project's Packages tab.
- A project's workspace holds the tabs Specs, Playbooks, Packages and Overview, then one per installed applet; the Playbooks and Packages tabs are at the project's place by construction, so the place selector serves Settings and Space alone.
- The Packages tab holds the project's packages with add, update, remove and publish, the registry the project's `spex.yaml` names with the person's sign-in there, and beneath them the person's Personal packages, available in every project of theirs.
- The Playbooks tab holds what a session in the project can run: enabled playbooks with a player per role and where each is enabled, available ones with the package each came from or "built in", authoring and compile, the example; nothing of packages or the registry.
- The Space surface holds each Space the person signed in to with its two faces: its groups with their projects and servers, and one line for its registry with the person's sign-in there; the "This computer" section of what is not yet shared; the sign-in to a Space; what needs fixing. Package management never stands on Space; the registry sign-in and the Space sign-in stay separate grants as DR-168 decided.
- Settings holds agents, the language and the config; no accounts page and no registries page.
- The command line is the Packages tab without an app, verb for verb, with the same words.

### The surfaces

- Sign-in: one card titled by its act, one chooser of Spaces by display name with providers as icons, a last entry "Other Space…" revealing a field "Space address", the field alone where no directory can be read, one primary "Sign in", and no sentence.
- A Space's heading: its display name and the person's login, "New group" disabled with the reason as its tooltip where the Space says the person may not create one, Sign out, and an overflow holding "Remove from this list"; beneath it one registry line.
- A project row: its name, a code glyph whose tooltip names where the code is, place marks, one standing phrase in a fixed precedence, one primary "Open here", "Open on ⟨server⟩" or "Show", and one overflow holding Sync now, Members, Explore records and "Add to a group…" where it applies.
- What needs fixing: a control "⚠ 2 to fix", a list "To fix (2) · 1 set aside", a repair row naming the project and its group with "Use ⟨folder⟩", "Choose folder…" and "Not on this computer".
- The Sync tab, the sharing confirm and the group picker name the Space by its display name, the steps as Saving, Checking, Comparing, Merging, Reloading and Sending, and offer "Join the records already in" and "Share into" with Personal first.
- The Packages tab: a header with the registry chooser and the sign-in, chips "spex.yaml, spex.lock not committed" and "spex.yaml changed" with Update, one row per package with its version, a source glyph, what it provides and its standing, Remove in the overflow with its consequence as the tooltip, the built-in playbooks as one quiet line with Update when the app ships a newer release and never a removable row, one "Add…" opening the registry search, a folder and a Git source, with a known name the registry does not list addable where it was typed.
- A package row expands to what it provides, one line each with its one act, "Enable" on a playbook in place, so installing is never mistaken for enabling.
- Publish shows the registry's display name, the package's name and version, the file count and the org, and reads "Sign in to publish" while signed out.

### What the IDE no longer offers

Renaming and deleting a group, subgroups, moving a project between groups, placing a project at a second Space, leaving a Space, attaching a copy another computer added, and the records' Git acts beyond those a row's standing offers; each stays in the protocol and the command line where it exists.

### Accepted losses

- With no project open there is no package or playbook surface.
- An uncommitted `spex.yaml` and `spex.lock` are guarded by one chip.
- An IDE "New package…" waits for a core command; the command line's `new` serves until then.

## Consequences

- The Space, Playbooks, environments, command line, projects, run view, settings, applets, localization and core service items are amended to these words and this map in the same change; retired item ids are never reused.
- Three implementation changes follow, each merged on green and staged so the move lands before the words: the Space surface with the core's Space phrases; the Packages and Playbooks tabs; the command line, the core's package phrases and the documentation.
- The English and Chinese catalogs, the interface tests and the browser journeys change with each surface; the fit journey measures four pinned tabs at the narrowest width.
- A remembered Playbooks surface opens the project's Playbooks tab; Cmd/Ctrl+3 lands on Space.
