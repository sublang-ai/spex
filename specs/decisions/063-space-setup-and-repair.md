<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-063: Space Sets Up by Remote and Repairs a Project in Place

## Status

Accepted (2026-09-14) on the owner's review of the first-run and second-device paths.
Amended by [DR-065](065-repairs-the-reader-answers.md): a repair counts until this device's reader answers it, and one he sets aside stands quietly; the app checks folders a repair already names and proposes one for a single gesture; and the palette hands its project back so a repair finishes in Space.
That record supersedes this one's declined Dismiss control and its shown-counts rule, and amends its disk-scanning bullet by upholding its ground as a rule; every other decision here stands.
Amends ([DR-046](046-decision-record-evolution.md)) [DR-057](057-space-surface.md):

- §"One surface, four duties": the clause "no binding controls of its own — an unbound project is pointed to the project palette, which already rebinds" is superseded, its premise being false of the shipped interface; the other four prohibitions stand.
- §"One surface, four duties" and §"Setting up": setting a space up takes a remote and one control, in place of Initialize, Join a space, and a remote optional to both.
- §"What the user sees": the issues list is a folded list of repairs rather than one row per diagnostic.

[DR-011](011-project-workspace.md) is not amended: the palette keeps sole ownership of choosing, adding, and creating projects, and Space never creates a project identity.

## Context

A home initialized without a remote records one commit and never another.
Commits are made at Initialize and at a sync's Save step [[space-4](../packages/space.md#space-4)] [[space-12](../packages/space.md#space-12)], a sync requires a remote [[space-11](../packages/space.md#space-11)], and [DR-057](057-space-surface.md) declined a separate Commit control.
The state therefore reads as a repository on `main` under a card offering to back the space up, while holding a snapshot of the moment the user pressed the control.

"Join a space" ceases to exist once the home is a repository, because the setup card is the only place it is offered and initializing twice is refused [[space-3](../packages/space.md#space-3)] [[space-4](../packages/space.md#space-4)].
The route that remains is unnamed: set a remote, sync, and read the word Join for the first time in the failure that reports unrelated histories [[space-13](../packages/space.md#space-13)].
A user who set a space up locally and then wants the space that already exists elsewhere must therefore provoke an error to find the control for it.

The palette cannot repair a synced project.
Registering mints a fresh identity, while rebinding preserves one and no interface path reaches it.
So the remedy [DR-057](057-space-surface.md) pointed to creates a second identity for a project the space already carries, leaves the synced identity unbound and its diagnostic standing, and sends the duplicate registration to every other device on the next sync.

One synced project with five sessions raises six diagnostics [[core-service-86](../packages/core-service.md#core-service-86)], each standing as its own row with its own control, and the identity's own row prints a bare identifier and carries no control at all.

A device that will never hold a given project has no action for its repair, and no way to stop being told.
Whether a project belongs on a device is a fact about that device, like where a project lives [[storage-6](../packages/storage.md#storage-6)].

## Decision

### Setting up takes a remote

- Space offers one setup control and one required remote URL field; a space is set up by naming where it lives.
- Setting up initializes the home, sets the remote, and starts a sync that joins unrelated histories — the remote's own state deciding the outcome, an empty remote filled by the first push and an occupied one joined under the whole-unit law [[space-13](../packages/space.md#space-13)] [[space-17](../packages/space.md#space-17)].
- The app creates no repository without a remote, because it can commit to one only once.
- A home that already is a repository without a remote — made by the command line, or before this decision — is shown as such and completed by adding a remote, never by a second setup.
- Where a home is a repository whose remote has never been checked, Join stands by name in the Sync tab before any transport, the join being inert where a common ancestor exists.

### Repairing a project's folder

- Space carries exactly one project control: pointing a project the space already carries at a folder on this device, in place, never creating an identity and never editing one.
- The repair preserves the project's identity, so its synced sessions, queue and history resolve to the project the space carries rather than to a new one.
- A project the space carries and a working directory the space records are one repair each, and the repair that resolves a project resolves every session recorded under it.
- A fault no folder repairs is not folded into a repair.
- Where no project identity fits a recorded directory, the repair offers the palette, because creating an identity belongs to [DR-011](011-project-workspace.md).
- The interface may pair a project with a recorded directory, but never silently: a pairing is shown in the repair and can be changed before it is saved.

### Attention a device can act on

- A repair stands in the issues list for as long as it is unresolved, and counts as an issue until it has been shown to this device's reader.
- Acknowledgement is this device's alone and never syncs, because whether a project belongs here is a fact about here.
- A repair whose recorded facts change is a new repair, and counts again.

### Staying where the work is

- Resolving a repair leaves the reader in Space with the outcome shown in place, because repairing a broken reference is not creating something to go to ([DR-009](009-at-hand-interaction.md)).
- Opening the repaired project is offered, never performed.

### Considered and declined

- keeping a remote-less Initialize for local backup: a local path is already an accepted remote, and a bare repository on the same disk keeps committing where a remote-less home commits once;
- renaming the setup control's two halves instead of removing one: the confusion is that a remote is optional to a control that cannot work without one later, which no wording fixes;
- resolving every repair from one chosen parent folder: several identity decisions taken on one guess, failing plural and silently;
- binding a project by scanning the disk for a matching folder: a silent identity decision, on evidence the user never sees;
- a Dismiss control for a repair: being shown is what the reader has to do anyway, so a control would ask for a second gesture to mean the same thing;
- an acknowledgement that syncs: it would teach one device's intent to every other.

## Consequences

- `space.md` gains the repair, its editor, its acknowledgement and the pre-transport Join, and amends the header's issue count, the setup card, and the copy that named Git's own vocabulary.
- `core-service.md`: a storage diagnostic gains an optional structured repair, so a control attaches to data rather than to a prose match, and the unbound-project diagnostic stops naming a bare identifier as its primary copy.
- `storage.md`: preferences gain the per-device acknowledgement key, ignored as every preference is.
- `project.rebind` reaches the interface for the first time, so its refusals become user-facing and need plain renderings.
- The protocol's diagnostic shape changes, so its version rises.
- A space set up before this decision keeps working: nothing about an existing repository, remote, or sync changes.
