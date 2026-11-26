<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-065: Repairs the Reader Answers

## Status

Accepted (2026-09-15) on the owner's report of an issue count reading zero over three repairs he had not handled.
Amends [DR-011](011-project-workspace.md), [DR-057](057-space-surface.md).
Amended by [DR-189](189-repairs-explain-the-next-step.md), [DR-194](194-saved-work-is-a-choice-not-setup-debt.md), [DR-246](246-remove-groups-and-team-servers-from-the-clients.md).

## Context

Synced records can name a project whose folder is not on this computer.
The project palette could not repair that: registering mints a fresh identity, while rebinding preserves one and no interface path reached it.
So the palette's remedy created a second identity for a project the records already carried, left the synced identity unbound, and sent the duplicate to every other computer on the next sync.

One synced project with five sessions raised six diagnostics [[core-service-86](../packages/core-service.md#core-service-86)], each standing as its own row with its own control.
Whether a project belongs on a computer is a fact about that computer, like where a project lives [[storage-6](../packages/storage.md#storage-6)].

A repair was then marked answered by being drawn.
The count read zero over rows the reader had never touched, which is the opposite of what a count is for — and the rows he most needed to act on were the ones the interface had quietly excused him from.
The reader's own words settle what an answer is: a repair counts until he has acted on it, and what he has answered stands quietly rather than vanishing.

The interface also asked for typing where it already knew the answer.
Most repairs name a working directory that still exists on this computer, is a Git work tree, and is claimed by no project — the reader's own repository, where those sessions ran.
Asking him to type a path the app could verify is work the app should have done.

## Decision

### A folder repaired in place

- Amends [DR-057](057-space-surface.md): Space repairs a project's folder in place, pointing a project whose records are on this computer at its folder here, never creating an identity and never editing one.
- The repair preserves the project's identity, so its synced sessions, queue and history resolve to the project the records carry rather than to a new one.
- Every diagnostic a folder would repair folds into one task per project's records, and the task that resolves a project resolves every session recorded under it; a fault no folder repairs is not folded.
- A pairing is never silent: it is shown in the repair and can be changed before it is saved.
- Amends [DR-011](011-project-workspace.md): the palette remains where projects are browsed, chosen and created, and a repair also pairs the project it names with the folder it has checked.
- Resolving a repair leaves the reader in Space with the outcome shown in place, holding its place until his own re-read; opening the repaired project is offered, never performed ([DR-009](009-at-hand-interaction.md)).
- An outcome reports what was saved: a folder saved while some older conversation still cannot be opened keeps that conversation's own report.

### An answer, not a form

- A repair stands in one of three conditions: unanswered, dismissed, or resolved.
- Only the reader's act moves a repair between them; drawing a row, opening the list, and re-reading the state move nothing.
- A repair counts until he has answered it; a dismissed repair keeps its saved conversations and counts no more; a resolved one leaves the list because the core stops reporting it.
- Dismissal is this computer's alone and never syncs, because whether a project belongs here is a fact about here.
- An answer lapses only when the repair's own recorded facts change, never because a folder appeared or vanished under it: an app-side event shall not retract the reader's decision.

### Checked, never searched

- The core may check a path a repair already names, or one named by joining the parent this computer's working folders most share to the project's records repository name without `-spex`; it shall check nothing else, list no directory, and descend none.
- Every path checked is a path reported, and what was found is rendered before any gesture can accept it.
- Where exactly one checked folder is present, a Git work tree, and claimed by no project, the core proposes it, and accepting it takes one gesture; where two qualify, the repair proposes nothing and the reader chooses.
- A check is bounded, and one that cannot complete reports as unknown and proposes nothing, so an unreachable folder never delays the surface.

### Considered and declined

- resolving every repair from one chosen parent folder: several identity decisions taken on one guess, failing plural and silently;
- searching the disk for a matching folder: a silent identity decision, on evidence the user never sees;
- an acknowledgement that syncs: it would teach one computer's intent to every other;
- letting a folder's appearance or disappearance clear an answer: an app-side event standing in for the reader's retraction;
- routing a repair's folder choice through the palette: the folder is already named and already checked, and the palette's completion would carry him off the list he is working through.

## Consequences

- `space.md` holds the folded task, its proposal, its dismissal and its outcome.
- `core-service.md`: a storage diagnostic carries an optional structured repair with what the core checked about each folder it names and the one it proposes, so a control attaches to data rather than to a prose match.
- `storage.md`: the preferences hold one record per dismissed repair, written only by the reader's act.
- `projects.md`: adding a project is not the palette's alone, the palette keeping its own flow unchanged.
