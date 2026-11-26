<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-172: Package and Space Surfaces a Fresh User Reads

## Status

Accepted (2026-10-31) on the owner's direction to make every package and Space operation easy to understand for a person who installed Spex today, favoring simple and reliable over complete.
Amends [DR-010](010-interface-craft.md), [DR-011](011-project-workspace.md), [DR-041](041-chrome-that-fits.md), [DR-057](057-space-surface.md), [DR-058](058-chat-assisted-playbook-authoring.md), [DR-065](065-repairs-the-reader-answers.md), [DR-069](069-key-phrases-not-sentences.md), [DR-078](078-the-interface-speaks-the-readers-language.md), [DR-103](103-the-home-and-its-groups.md), [DR-104](104-spec-package-format-and-client-environments.md), [DR-120](120-the-instance-is-the-space.md), [DR-128](128-a-spex-repository-placed-at-several-instances.md), [DR-135](135-a-welcome-page-before-the-first-project.md), [DR-137](137-specs-first-welcome-and-distinct-project-paths.md), [DR-151](151-publish-local-spec-packages.md), [DR-165](165-one-package-manager-hosted-by-the-cli-and-the-app.md), [DR-168](168-independent-package-registry.md).
Amended by [DR-173](173-the-registry-is-no-face-of-a-space.md), [DR-174](174-what-a-package-provides-is-placed.md), [DR-176](176-global-playbooks-and-a-placed-playbook-runs.md), [DR-189](189-repairs-explain-the-next-step.md), [DR-194](194-saved-work-is-a-choice-not-setup-debt.md), [DR-209](209-a-project-row-with-one-menu.md), [DR-218](218-write-a-playbook-before-publishing.md), [DR-225](225-bounded-surfaces-and-attached-records.md), [DR-226](226-project-names-align-with-their-actions.md), [DR-227](227-remove-the-storage-footer-from-space.md), [DR-246](246-remove-groups-and-team-servers-from-the-clients.md).

## Context

A fresh-user audit of every phrase and flow of the package and Space operations, in the code, the catalogs, the journeys and the English catalog read with no other context, found the same roots behind the owner's examples.
The thing a person signs in to had four names on one screen: Space, instance, host and site; this computer had three; "records" meant a project's synced history, a decision record and a transcript line.
The package manager's own nouns stood on surfaces as if they were the user's: environment, request, resolve, lock, placement, namespace, manifest.
The Space surface listed spex repositories named `<name>-spex`; "Join" named two acts — cloning records here, and merging two unrelated histories — under one phrase; a repair named a spex repository and a path where the reader knows the project by its name.
The sign-in card held two controls for one choice and three sentences around one button; a project row assembled its standing from a dot, two phrases, a badge and a count; the IDE said "Resolve again" where the command line said update.
A sync's conflict read "Needs your choice" on the row, its picker in a tab the row opened; and after the reader chose where a project's records sync, a separate sharing confirmation asked the same question again before anything was sent.

## Decision

### Principles

- Extends [DR-010](010-interface-craft.md) and [DR-069](069-key-phrases-not-sentences.md) with these principles.
- One name per thing, the user's, identical in the IDE, the command line, the core's phrases and the documentation.
- A surface shows the exception, not the norm: a row states only what deviates from a healthy, synced, installed state.
- A choice stands before a field: a list to pick from, and a field only behind "Other…" or where no list can be read.
- Kinds and places are icons with tooltips; a standing is one phrase; a consequence lives in its control's tooltip.
- One primary act that says what it gets you; every other act in one overflow, as a whole phrase.
- The IDE keeps the acts daily work needs; an act the Space site provides, or that few need, is not offered in the IDE.
- A failure says what happened and what to do, as a phrase in the user's words; internals stay behind Details.

### One model

- A person's projects are on this computer; each project's records — its sessions, intents and history — can sync to their own namespace at a Space, and its code stays in its own Git working folder.
- The person meets no spex repository, placement, unit or namespace by name: the records and their Git are means, reached from a project's row where needed and shown nowhere else.

### Vocabulary

| The user's word | Replaces on every surface |
| --- | --- |
| Space, by its display name | instance, host, site, origin |
| project; project folder | working folder, bound, registered, paired |
| records | spex repository, clone, `-spex`, unit; "decision record" and "intent record" in full |
| this computer | device, machine |
| package; "spec package" where its nature is explained | artifact; the user's own spec files are "specs" |
| registry, by its display name | package destination, namespace; "org" is a package name's first half |
| `spex.yaml`, `spex.lock`, `meta.yaml` | environment, manifest, request, lock as nouns |
| Update; Install | resolve, resolve again |
| Add; Remove | request, stop requesting |
| Publish | upload |
| Sync; "2 records to sync"; "Synced 3 min ago" | push, apply, units, local changes |
| Started separately at ⟨Space⟩ — Combine… | unrelated history, merge histories, Join |
| Changed here and at ⟨Space⟩ — Resolve | — |
| Code: ⟨where⟩ | on a remote, on this instance |

- Amends [DR-078](078-the-interface-speaks-the-readers-language.md) and [DR-120](120-the-instance-is-the-space.md): the Chinese catalog follows one glossary — Space as a product name, 项目, 记录, 本机, 规约包, 注册中心, 更新, 安装, 添加, 移除, 发布, 同步, 解决, 合并 — and 实例, 托管平台, 注册表, 软件包 and 此设备 retire.

### The map

- Amends [DR-011](011-project-workspace.md): a project's workspace holds the tabs Specs, Playbooks, Packages and Overview, then one per installed applet.
- Amends [DR-104](104-spec-package-format-and-client-environments.md) and [DR-165](165-one-package-manager-hosted-by-the-cli-and-the-app.md): the Packages tab holds the project's packages with add, update, remove and publish, and the registry the project's `spex.yaml` names with the person's sign-in there.
- Amends [DR-058](058-chat-assisted-playbook-authoring.md): the Playbooks tab holds what a session in the project can run, with authoring and compile; nothing of packages or the registry.
- The Space surface holds the sign-in to each Space, each Space's flat list of the person's projects, the projects on this computer whose records sync nowhere, and Files & history; package management never stands on Space, and the registry sign-in and the Space sign-in stay separate grants ([DR-168](168-independent-package-registry.md)).
- Settings holds agents, the language and the config; no accounts page and no registries page.
- The command line is the Packages tab without an app, verb for verb, with the same words.

### The Space surface

- Amends [DR-057](057-space-surface.md) in the sign-in card: one card titled by its act, one chooser of Spaces by display name with providers as icons, a last entry "Other Space…" revealing a field "Space address", the field alone where no directory can be read, one primary "Sign in", and no sentence.
- A Space's heading carries its display name and the person's login, Sign in or Sign out, and "Remove from this list" while signed out.
- Amends [DR-057](057-space-surface.md) and [DR-103](103-the-home-and-its-groups.md) in the rows: a row is a project, named as its code is, never a spex repository named `<name>-spex`; it carries one standing phrase in a fixed precedence, one primary act and one overflow.
- Amends [DR-128](128-a-spex-repository-placed-at-several-instances.md) in its presentation alone: a placement's lines stand in the row's Sync tab, and its acts behind the row's overflow, their meanings standing.
- A unit changed on both sides reads "Changed here and at ⟨Space⟩" on its row with Resolve, which opens the picker in place beneath the row, the choices reading "Keep this computer's" and "Take ⟨Space⟩'s"; histories that started apart read "Started separately at ⟨Space⟩" with "Combine…", never Join.
- The Sync tab names the Space by its display name and the steps as Saving, Checking, Comparing, Merging, Reloading and Sending.
- Amends [DR-065](065-repairs-the-reader-answers.md) in a repair's naming: a repair names the project, the folder it remembers secondary.
- Amends [DR-041](041-chrome-that-fits.md) in its label budget: a menu's entry, and a row's act a decision fixes as a whole phrase, may exceed fourteen characters and wraps within its row.

### Opening and syncing a project

- Amends [DR-135](135-a-welcome-page-before-the-first-project.md) and [DR-137](137-specs-first-welcome-and-distinct-project-paths.md): a signed-in home's welcome page also offers "Open a project from Space", opening the Space surface, and one not signed in offers "Sign in to your Space".
- Opening a project from Space that this computer lacks clones its records and its code into a folder the reader picks, the picker opened by the act itself, or takes a working folder the reader already has; a project created at the Space since its last read opens without a Refresh.
- A project whose records sync nowhere offers "Sync to a Space…", choosing a signed-in Space and either a new copy there or matching records the Space already holds, committed by one "Sync records".
- Amends [DR-103](103-the-home-and-its-groups.md) and [DR-128](128-a-spex-repository-placed-at-several-instances.md) in first-send acknowledgement: choosing a destination, Attach and Sync authorize sending the records they name without a separate sharing acknowledgement, first and later sends taking the same permission and transport checks.
  A destination a former acknowledgement gate left unpublished resumes its ordinary sync while idle; legacy acknowledgement parameters and stored preferences are inert, and no operation writes an acceptance preference.

### The Packages tab

- A header with the registry chooser and the sign-in; chips "spex.yaml, spex.lock not committed" and "spex.yaml changed" with Update.
- One row per package with its version, a source glyph, what it provides and its standing, Remove in the overflow with its consequence as the tooltip; a row expands to what it provides, one line each.
- Amends [DR-151](151-publish-local-spec-packages.md): one "Add…" opens the registry search, a folder and a Git source, with a known name the registry does not list addable where it was typed; Publish shows the registry's display name, the package's name and version, the file count and the org, and reads "Sign in to publish" while signed out.

### What the IDE does not offer

Placing a project at a second Space, leaving a Space, attaching a copy another computer added, and the records' Git acts beyond those a row's standing offers; each stays in the protocol and the command line where it exists.

### Considered and declined

- A sync on a timer: the host is read on events alone ([DR-103](103-the-home-and-its-groups.md)).

### Accepted losses

- An uncommitted `spex.yaml` and `spex.lock` are guarded by one chip.
- A person who wants the records' Git acts takes one more click, into the overflow.

## Consequences

- The Space, Playbooks, environments, command line, projects, run view, settings, applets, localization and core service items use these words and this map; retired item ids are never reused.
- The English and Chinese catalogs, the interface tests and the browser journeys follow each surface; the fit journey measures four pinned tabs at the narrowest width.
