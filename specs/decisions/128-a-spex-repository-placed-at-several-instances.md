<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-128: A Spex Repository Placed at Several Instances

## Status

Accepted (2026-10-21) on the owner's direction.
Amends [DR-057](057-space-surface.md), [DR-103](103-the-home-and-its-groups.md), [DR-111](111-the-core-coordinates-as-git-does.md), [DR-120](120-the-instance-is-the-space.md), [DR-122](122-a-sync-reads-its-destination.md), [DR-125](125-your-own-groups-path-sources-live-in-its-clone.md), [DR-127](127-a-home-signed-in-to-several-instances.md).
Amended by [DR-172](172-surfaces-a-fresh-user-reads.md), [DR-246](246-remove-groups-and-team-servers-from-the-clients.md).

## Context

- The owner's direction: one project's records kept at more than one instance — a project moving from the internal to the production instance, or kept at both — and either instance failing leaving the records live at the other.
- The sync of [DR-057](057-space-surface.md), as [DR-103](103-the-home-and-its-groups.md) and [DR-111](111-the-core-coordinates-as-git-does.md) keep it, is a merge: the host's `spex` fetched, each unit compared with the merge base, a merge commit with `spex` and the host's `spex` as parents or a fast-forward, and a join from the empty ancestor where the histories are unrelated. Every device is a peer of the host's branch.
- Git gives a repository any number of remotes, each a peer [[1]]. Merging with each in turn leaves the branch descending from every remote's head, so every push is a fast-forward unless that remote moved meanwhile, which the sync re-checks once.
- spex.pub stores no membership and never proxies Git bytes [[2]].
- Records cross between two instances only through a device that holds both placements, when it syncs.
- A clone's remotes are known to that clone alone; every other device would otherwise meet the second placement as a repository not on this device.
- A tracked file reaches every device and the explorer, so it names no Git system ([DR-120](120-the-instance-is-the-space.md)).

## Decision

### A placement

- A spex repository on this device is one clone with a set of **placements**, at most one per instance: a host repository — its Git origin and id, as [DR-127](127-a-home-signed-in-to-several-instances.md) identifies one — in the signed-in account's own namespace there, held as a remote named by the instance's folder with the id beside it.
  A host repository two instances list is one placement both list, held under the instance through which it was first joined or created, matched by the Git origins and ids the core read.
  A remote the reader names — a path, or a URL at no signed-in instance's Git origin — is a placement with no instance: one per clone, named `origin`, synced last, with no catalog read.
  A clone with no placement is local only.
- Each placement with an instance is named in a tracked file of its own, `placements/<instance folder>.yaml`, one unit each, recording its instance's URL and its host id and nothing of the Git system; a path placement is written to none.
  Every act that creates or joins a placement writes its file — choosing a Space, opening a personal project, the sign-in's global-records step and Place — and the first sync after the instances migration writes each existing placement's file, the same bytes on every device; two devices placing at one instance meet as one choice, the unchosen side's remote dropped and its host repository left to its owner.
  The files are a proposal every device reads: a device whose signed-in instance lists a repository a file names shows it on the clone's row as a placement not yet on this device, and the reader attaches it explicitly; Attach confirms the repository is in the account's own namespace there ([DR-246](246-remove-groups-and-team-servers-from-the-clients.md)), attaches it and syncs the clone as an operation of the clone's machine; a device holding that host repository under another instance's name renames its remote to the file's instance instead, where that instance is signed in on this device.
  The file follows the clone: every re-key a Sync, a Leave or a removal from the list makes under [DR-127](127-a-home-signed-in-to-several-instances.md)'s follow rewrites the placement file to the followed instance in the same step; two files naming one host repository are one placement, the file of the instance the clone follows kept and the other deleted.
  After each placement's merge, before the next placement's turn, a sync drops every remote whose file that merge removed or changed to name another host repository, the clone's records kept; a remote lacking a file is not dropped.
- The key follows the first placement; the global records repository keeps `workspace/<own>/<own>-spex` whatever its placements.
  Removing the first placement moves the clone to the next placement's path, or under the personal records folder when none is left; dropping the key remote and moving the clone are one step, refused together while a session lease beneath names a live writer and retried at the next sync.
- Place, Leave and Attach are operations of the clone's machine, each following a running sync as a Sync follows a Check; an operation whose move a session lease beneath refuses is refused whole, naming the session, with Retry.
- A placement is reachable, read-only or unreachable on its own, by its instance's answer; the repository is unreachable only where every placement is.

### Sync, placement by placement

- Sync saves once and reads its placements once, then for each in the order added: reads that instance's destination ([DR-122](122-a-sync-reads-its-destination.md)), prepares the branch where the first push is ahead, fetches that remote's `spex`, compares against their merge base, applies the selection as a merge commit with `spex` and that remote's `spex` as parents or a fast-forward — each placement's apply writing against the clone's `spex` as the previous placement's merge left it — re-validates, and pushes; then pushes `spex` once more to each placement the later merges left behind, a fast-forward.
  A catch-up push rejected re-runs that placement once from Check; a placement still behind then ends behind, Sync again.
  Synced is said per placement, where its `spex` equals the clone's.
- A placement that stops — unreachable, refused, choices needed, unrelated history — stops itself alone; the merges and pushes made before it stand, and the next placement runs.
  Stop ends the sync with no later placement run.
  A Save, an Apply's refusal and Git's own failure stop the whole sync, as Stop does.
- Choices and a join are keyed by placement; where several placements end in choices, the picker shows the first in order, naming the instance for the host's side, and a sync sent with its choices runs again from Save, planning the rest afresh and passing a placement already equal as a fast-forward.
- A placement whose `spex` shares no ancestor with the clone's joins from the empty tree on an explicit join, every unit on both sides a choice, as any two histories do.
- A failed destination read stops that placement alone, as unreachable; a sync is refused only where no placement could run.
- A read-only placement brings and does not receive; a new session reaches the placements that take pushes.
- Each placement's transport uses the credential of its own instance, and a refused credential signs out that instance alone; the clone's commit identity follows its key placement's instance, the global records repository's its first placement's; a project's instance, for its intents' author, is its key placement's, and its code clone uses the broker of any signed-in placement's instance whose Git origin is the code's.
- In a report, every placement's remote reads as its path in its instance, and a path placement as itself with any embedded user removed.
- One operation per clone at a time stands; a sync is one operation over every placement.

### Placing and leaving

- Place adds a placement at a signed-in instance the clone has none at: it joins a personal spex repository there whose `project.json` names the folder's remote, or creates `<name>-spex` in the account's namespace there and prepares its branch, then writes the placement's file and syncs the clone, as Attach does.
  A clone holding only the path placement chooses its first Space instead.
- Leave fetches that placement first and refuses, unless confirmed, while that placement or the clone holds records no remaining placement has received; where the placement cannot be read, it says that records pushed there since the last sync may be left behind.
  It drops the remote and deletes the placement's file; nothing at the host changes.
  On a placement several instances list, it rewrites the file to the instance the clone follows, as [DR-127](127-a-home-signed-in-to-several-instances.md) has it follow, and renames the remote.
- Removing an instance from the list refuses while a placement of a project at that instance follows no signed-in instance; the reader leaves it first.
- Removing a project counts a record as reached when any placement holds it.
- The global records repository is placed at every instance the home signs in to, in the account's namespace there as `<own>-spex`, created or joined at that sign-in; Place and Leave are refused for it, and removing an instance from the list renames this device's remote there to a signed-in instance that lists the same host repository, rewriting its file, else drops the remote and leaves the file.

### Scenarios

| Situation | What happens |
| --- | --- |
| The internal instance retires | Sign in to production, place each project there, and leave the internal placement once production holds everything; a repository both list follows production on its own. |
| One instance is down | Its placements read unreachable; the others sync. |
| A second device holding both instances | Its instance lists the placement a file names; the row offers it, and Attach adds and syncs it. |

### Considered and declined

- An automatic backup placement made without the reader's choice: it equals this device's clone; a placement is chosen.
- Mirroring through the Space or by its service identity: Git bytes never pass the Space, a service identity at one host has no standing at the other, and a mirror pushes as nobody [[2]].
- A clone per placement: two sets of sessions under one project, and two keys.
- Placements known to one clone alone: every other device would meet a new row and make the second clone.
- One tracked file listing every placement: two devices adding placements at once would conflict over the whole file, and the picker would drop one.
- The Git origin in a placement's file: it would name the Git system on every device and in the explorer; the core matches a shared placement by what it reads.
- Attaching a listed placement without the reader: a file written on one device would have every other device carry the records there.
- Keying a clone by a Spex-minted id or by its root commit: [DR-103](103-the-home-and-its-groups.md) declined a second identity beside the host's; the first placement's path is as stable as a host's rename, which the sync already follows.
- A primary placement the others copy: Git has no primary; each remote is a peer, and the merge is the same.
- Two placements at one instance: the same records twice in one path space; one placement per instance.
- Every project placed at every instance at sign-in: a project's placement is a choice; only the global records follow you.
- One Sync control per placement: one row, one Sync; its lines say what each placement did.

## Consequences

- Records at two instances are two failure domains, kept equal by whoever holds both; a host that fails or ends its terms leaves the records live at the other.
- A placement file reaches every device; a device carries records there only once its reader attaches it.
- The global records reach every instance you sign in to.
- `placements/` joins Spex's own paths: a request naming a path under it is refused, and a `meta.yaml` there forms no unit.
- These specs change: `storage` for the placement files as units, `placements/` among Spex's own paths, the remotes and ids per placement, the key rule, the apply's version per placement, and the last sync recorded per placement; `space` for the lines per placement, Sync over placements, Stop, the picker's sides, Place, Leave and Attach as operations, the report lines and the instance each command names; `git-host` for creation and join at a named instance and the credential per placement; `environments` for `placements/` among the refused path segments; `projects` for removal; the storage Git tool keeps its contract with the remote named.
- Acceptance checks: two stand-in instances; records placed at both, a device holding one alone reading what a device holding both brought; a second device offered a placement a file names, attaching it, and dropping a remote whose file a merge removed; the first sync after the migration writing an existing placement's file alike on two devices; one instance unreachable while the other syncs; choices at the second placement with the first's merge and push standing, and the sync sent with choices passing the first as a fast-forward; a unit the first placement's merge rewrote taken from the second placement's side without a restart; a catch-up push rejected and the placement re-run once; Stop ending the sync before the next placement; a placement left and the key moved, the last leaving a local-only clone under the personal records folder, and a leaving refused while records reached no remaining placement; the global records placed at both at sign-in, and at two instances on one Git backend listed as one placement whose file follows a removal from the list; the device that did not make the choice between two placements at one instance dropping its remote to the unchosen repository at its next sync; a placement joined from the empty ancestor; a path remote synced last.

## References

[1]: https://git-scm.com/book/en/v2/Git-Basics-Working-with-Remotes "Pro Git: Working with Remotes — a repository with several remotes"
[2]: https://github.com/sublang-ai/spex-pub/blob/main/specs/decisions/018-the-git-host-service.md "spex.pub DR-018: The Host Service — no member list stored, Git bytes never proxied"
