<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-065: Repairs the Reader Answers

## Status

Accepted (2026-09-15) on the owner's report of an issue count reading zero over three repairs he had not handled.
Amends ([DR-046](046-decision-record-evolution.md)) [DR-057](057-space-surface.md) through [DR-063](063-space-setup-and-repair.md), whose repair rules this record replaces in part.

Supersedes in [DR-063](063-space-setup-and-repair.md):

- §"Considered and declined", the Dismiss control: being shown was never a gesture — it carried no content, was taken on nothing, and could not be undone.
- §"Attention a device can act on", the rule that a repair counts until it has been shown.

Amends in [DR-063](063-space-setup-and-repair.md), its ground upheld rather than reversed:

- §"Considered and declined", the disk-scanning bullet: the app may check a folder it can already name and shall render what it found before any gesture accepts it, and it shall never search the disk for one.

[DR-011](011-project-workspace.md) is not amended: creating a project identity stays the palette's, and Space still creates none.

## Context

A repair was marked answered by being drawn.
The count then read zero over rows the reader had never touched, which is the opposite of what a count is for — and the rows he most needed to act on were the ones the interface had quietly excused him from.

The reader's own words settle what an answer is: a repair counts until he has acted on it, and what he has answered stands quietly rather than vanishing.
Three conditions follow, and they are genuinely different: unanswered, set aside by him, and resolved — the last needing no record at all, because a resolved repair stops being reported.

The interface also asked for typing where it already knew the answer.
Most repairs name a working directory that still exists on this device, is a Git work tree, and is claimed by no project — the reader's own repository, where those sessions ran.
Asking him to type a path the app could verify is work the app should have done.

Where no project identity exists, the row sent him to the palette, discarded the folder he had typed, and left the surface when the palette completed.
Creating an identity does belong to the palette; carrying him away from a list he is working through does not.

## Decision

### An answer, not a form

- A repair stands in one of three conditions: unanswered, set aside, or resolved.
- Only the reader's act moves a repair between them; drawing a row, opening the list, and re-reading the state move nothing.
- A repair counts as an issue until he has answered it; a set-aside repair stands in the list and counts no more; a resolved one leaves the list because the core stops reporting it.
- Setting aside says this project does not belong on this device, is this device's alone, and is reversible on its own row.
- An answer lapses only when the repair's own recorded facts change, never because a folder appeared or vanished under it: an app-side event shall not retract the reader's decision.

### Checked, never searched

- The core may check a path a repair already names, or one named by joining the folder this device's projects most share to that repair's own last segment; it shall check nothing else, list no directory, and descend none.
- Every path checked is a path reported, and what was found is rendered before any gesture can accept it.
- Where exactly one checked folder is present, a Git work tree, and claimed by no project, the core proposes it; where two qualify, the repair proposes nothing and the row asks instead.
- A check is bounded, and one that cannot complete reports as unknown and proposes nothing, so an unreachable folder never delays the surface.

### One gesture on each side

- Where a proposal stands and the space already carries the project, one gesture binds it, preserving that identity.
- Where a proposal stands and no identity exists, one gesture opens the palette seeded with that folder; the palette creates the identity, hands the project back, and the reader stays in Space with the repair finished in place.
- Where a repair cannot be proposed, the reader may still name a folder himself or set the repair aside — each one gesture away.
- A registration that succeeds while its binding is refused is reported as what it is; a half-done repair never shows an outcome.

### Told apart

- A standing repair, a set-aside one, and a resolved one differ by mark, by word and by weight, and each condition is named in the row's accessible description, so the distinction never rests on colour.
- A row that changes condition holds its place until the reader's own re-read.

### Considered and declined

- letting a folder's appearance or disappearance clear an answer: an app-side event standing in for the reader's retraction, which is the fault of this record's own predecessor with its sign reversed;
- one gesture accepting a proposal and creating an identity together: creating one is a different act with a different owner, and deserves its own confirmation;
- setting every repair aside at once: one answer taken over several identity decisions the reader has not seen.

## Consequences

- `space.md` gains the proposal, the record and the three appearances, and rewrites the repair's editor, outcome and attention rules around them.
- `core-service.md`: a repair carries what the core checked about each folder it names and the one it proposes.
- `storage.md`: the preference holds one record per repair, written only by the reader's act.
- `projects.md`: the palette hands a registered or created project back to whatever opened it, and that opener decides where the reader lands.
- The protocol's repair shape and its command for answering a repair change, so its version rises.
- A device whose count had gone quiet under the superseded rule speaks again once, because those marks were written by drawing and are dropped rather than converted.
