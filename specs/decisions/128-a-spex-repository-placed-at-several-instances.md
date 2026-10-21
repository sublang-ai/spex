<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-128: A Spex Repository Placed at Several Instances

## Status

Accepted (2026-10-21) on the owner's direction: one project's records shared at more than one instance — a team at spex.pub and a workshop at JiHu GitLab on the same records, or a project moving from the internal to the production instance — and either instance failing leaving the records live at the other.
Extends [DR-127](127-a-home-signed-in-to-several-instances.md), whose instances, keys, a clone's instance read from its key's folder and follow it needs, and amends it in your own group's sign-in, in one remote per clone and in Forget: your own group is placed at every instance the home signs in to, a clone holds a remote per placement, a code clone uses the broker of any signed-in placement's instance at the code's origin, and Forget refuses while a placement at the instance follows no signed-in instance, your own group's file rewritten or left.
Amends, under [DR-046](046-decision-record-evolution.md):

- [DR-103](103-the-home-and-its-groups.md) in its principle, its concepts, "What Spex does on a Git host", its spex repositories, what lives where, its sync, its projects on this device and its scenarios: a spex repository is one clone placed at any number of instances, at most once per instance, each placement a host repository with its own id and remote, named in a tracked file of its own; its readers are the members of every placement, each host deciding for its own; the sharing notice is owed per placement; the sync runs placement by placement; your own group is placed at every instance the home signs in to; a project is removed once every record reached some placement; a fork stays another project, a placement being the same records kept equal.
- [DR-057](057-space-surface.md), as [DR-103](103-the-home-and-its-groups.md) amended it, in one remote per clone and in "choices needed ends the sync": the merge-commit sync runs against each placement's remote in turn, and choices needed stops its placement alone, the merges already made standing.
- [DR-111](111-the-core-coordinates-as-git-does.md) in "the version its Save step committed": each placement's apply writes against the clone's `spex` as the previous placement's merge left it.
- [DR-120](120-the-instance-is-the-space.md) in its keys, its entries and rows, its acts and its Git lines: a clone's key follows its first placement; a placed clone has one row, under the group its key placement's instance last named for it, every other group that lists a placement of it showing one line; a move acts on one placement; a report reads each placement's remote as its path in its instance.
- [DR-122](122-a-sync-reads-its-destination.md) in the read before a sync and at admission: each placement's destination is read at that placement's turn, and admission reads only the placements owing the notice, a failed read stopping that placement alone.
- [DR-114](114-groups-and-sharing-from-spex.md) in a spex repository's Members, Share and removing a member: each acts on one placement at its instance.
- [DR-125](125-your-own-groups-path-sources-live-in-its-clone.md) in Spex's own paths: `placements/` joins them.
Amended by [DR-132](132-team-servers.md) in placing your own group at every instance: not on a seat.

## Context

- The sync of [DR-057](057-space-surface.md), as [DR-103](103-the-home-and-its-groups.md) and [DR-111](111-the-core-coordinates-as-git-does.md) keep it, is a merge: the host's `spex` fetched, each unit compared with the merge base, a merge commit with `spex` and the host's `spex` as parents or a fast-forward, and a join from the empty ancestor where the histories are unrelated. Every device is a peer of the host's branch.
- Git gives a repository any number of remotes, each a peer [[1]]. Merging with each in turn leaves the branch descending from every remote's head, so every push is a fast-forward unless that remote moved meanwhile, which the sync re-checks once.
- A membership is a set of accounts at one Git system, and cannot be copied to one where a person has no account; spex.pub stores no membership [[2]].
- Records cross between two instances only through a device that holds both placements, when it syncs.
- A clone's remotes are known to that clone alone; every other device, and every other member, would otherwise meet the second placement as a repository not on this device.
- Whoever can push a spex repository can write any tracked file in it, while only a member the host lets manage members may widen who reads it.
- A tracked file reaches every member and the explorer, so it names no Git system ([DR-120](120-the-instance-is-the-space.md)).
- A control in a list row reads at most 14 characters ([DR-041](041-chrome-that-fits.md)).

## Decision

### A placement

- A spex repository on this device is one clone with a set of **placements**, at most one per instance: a host repository — its Git origin and id, as [DR-127](127-a-home-signed-in-to-several-instances.md) identifies one — in a group or a namespace there, held as a remote named by the instance's folder with the id beside it.
  A host repository two instances list is one placement both list, held under the instance through which it was first joined or created, matched by the Git origins and ids the core read.
  A remote the reader names — a path, or a URL at no signed-in instance's Git origin — is a placement with no instance: one per clone, named `origin`, synced last, with no catalog read, no notice and no members.
  A clone with no placement is local only.
- Each placement with an instance is named in a tracked file of its own, `placements/<instance folder>.yaml`, one unit each, recording its instance's URL and its host id and nothing of the Git system; a path placement is written to none.
  Every act that creates or joins a placement writes its file — Pick a group, Join, a group's first session, the sign-in's own-group step and Place — and the first sync after the instances migration writes each existing placement's file, the same bytes on every device; two devices placing at one instance meet as one choice, the unchosen side's remote dropped and its host repository left to its owner.
  The files are a proposal every device reads: a device whose signed-in instance lists a repository a file names shows it on the clone's row as a placement not yet on this device, with Attach; Attach is the notice for that placement, naming the instance and the path, and attaches it and syncs the clone as an operation of the clone's machine; a device holding that host repository under another instance's name renames its remote to the file's instance instead, where that instance is signed in on this device.
  The file follows the clone: every re-key a Sync, a Leave or a Forget makes under [DR-127](127-a-home-signed-in-to-several-instances.md)'s follow, your own group's Forget rename included, rewrites the placement file to the followed instance in the same step; two files naming one host repository are one placement, the file of the instance the clone follows kept and the other deleted.
  After each placement's merge, before the next placement's turn, a sync drops every remote whose file that merge removed or changed to name another host repository, the clone's records kept, and then offers Attach for the placement the file names; a remote lacking a file is not dropped.
- The key follows the first placement; your own group's own repository keeps `workspace/<own>/<own>-spex` whatever its placements, and its row stays under "Your own group".
  Removing the first placement moves the clone to the next placement's path, or under your own group's folder when none is left; dropping the key remote and moving the clone are one step, refused together while a session lease beneath names a live writer and retried at the next sync.
- Place, Leave and Attach are operations of the clone's machine, each following a running sync as a Sync follows a Check; an operation whose move a session lease beneath refuses is refused whole, naming the session, with Retry.
- A placement is reachable, read-only or unreachable on its own, by its instance's answer; the repository is unreachable only where every placement is.

### Sync, placement by placement

- Sync saves once and reads its placements once, then for each in the order added: reads that instance's catalog and the repository there, prepares the branch where the first push is ahead, fetches that remote's `spex`, compares against their merge base, applies the selection as a merge commit with `spex` and that remote's `spex` as parents or a fast-forward — each placement's apply writing against the clone's `spex` as the previous placement's merge left it — re-validates, and pushes; then pushes `spex` once more to each placement the later merges left behind, a fast-forward.
  A catch-up push rejected re-runs that placement once from Check; a placement still behind then ends behind, Sync again.
  Synced is said per placement, where its `spex` equals the clone's.
- A placement that stops — unreachable, refused, choices needed, unrelated history, its notice owed and not continued — stops itself alone; the merges and pushes made before it stand, and the next placement runs.
  Stop ends the sync with no later placement run.
  A Save, an Apply's refusal and Git's own failure stop the whole sync, as Stop does.
- Choices and a join are keyed by placement; where several placements end in choices, the picker shows the first in order, naming the instance for the host's side, and a sync sent with its choices runs again from Save, planning the rest afresh and passing a placement already equal as a fast-forward.
- A placement whose `spex` shares no ancestor with the clone's joins from the empty tree on an explicit join, every unit on both sides a choice, as any two histories do.
- Admission reads only the placements whose sharing notice is owed; a failed read stops that placement alone, as unreachable; the notice is seen once per placement whose spex repository may have other members, before the first push there, and a placement whose notice is not yet continued reads "Waiting for you to continue" with Continue on its line while the others sync; a sync is refused only where no placement could run.
- A read-only placement brings and does not receive; a new session reaches the placements that take pushes.
- Each placement's transport uses the credential of its own instance, and a refused credential signs out that instance alone; the clone's commit identity follows its key placement's instance, your own group's its first placement's; a project's instance, for its intents' author, is its key placement's, and its code clone uses the broker of any signed-in placement's instance whose Git origin is the code's.
- In a report, every placement's remote reads as its path in its instance, and a path placement as itself with any embedded user removed.
- One operation per clone at a time stands; a sync is one operation over every placement.

### Sharing per placement

- The readers of a spex repository are the members of every placement — each placement's spex repository's members at its instance, direct or through its group — each host deciding for its own placement.
- Members, Share, removing a member and Move act on one placement, at its instance; only a move of the key placement moves the clone.
  The row stands under the group the key placement's instance last named for it, under its key's group only where that instance lists nothing for it, and names each placement by its instance's display name and its path there; every other group whose listing holds a placement of it shows one line naming the row, with no controls; each placement's Members panel says the records are also placed at the other instances the files name, so a member at one instance knows.
- Placing in a repository with other members shows the notice: every record, past and future, hidden parts and attachments included, reaches that repository's members.
  The members of the existing placements are not asked.

### Placing and leaving

- "Place at…" stands on a project's row, one control opening the choice of instance where more than one is offered, its title and accessible name "Also place at <instance>", for each signed-in instance the clone has no placement at, where the view says the person may manage the members of every placement the clone holds.
  It opens the pick for that instance — the spex repositories there whose `project.json` names the folder's remote, offered where the person may manage their members, then its groups and your namespace there — as "Pick a group" does for a local-only clone: a listed spex repository joins; a group creates `<name>-spex` there, prepares its branch and pushes, as Pick a group does; either writes the placement's file and syncs the clone, as Attach does.
  A clone holding only the path placement offers "Pick a group", not "Place at…", its pick adding its first placement.
- "Leave…" stands on a project's row, its title and accessible name "Remove from <instance>".
  It fetches that placement first and refuses, unless confirmed, while that placement or the clone holds records no remaining placement has received; where the placement cannot be read, it says that records pushed there since the last sync may be left behind.
  It drops the remote and deletes the placement's file; nothing at the host changes.
  On a placement several instances list, it rewrites the file to the instance the clone follows, as [DR-127](127-a-home-signed-in-to-several-instances.md) has it follow, and renames the remote.
- Forget refuses while a placement of a project or a group at that instance follows no signed-in instance; the reader leaves it first.
- Removing a project counts a record as reached when any placement holds it.
- A group's own spex repository stays in its group at one instance; only a project's and your own group's are placed at several.
- Your own group is placed at every instance the home signs in to, in your namespace there as `<login there>-spex`, created or joined as the first sign-in does, its first push at every instance after the first waiting for Continue as the sharing notice does; "Leave…" is not offered on its row, and Forget renames this device's remote there to a signed-in instance that lists the same host repository, rewriting its file, else drops the remote and leaves the file.
  The sign-in card for every instance after the first says that your own group's records will be kept there too.

### Scenarios

| Situation | What happens |
| --- | --- |
| A workshop at the JiHu instance works on a team's project at spex.pub | A member who may manage both places the project at the workshop's group. Each side syncs with its own instance; whoever holds both placements carries records across at their sync. |
| The internal instance retires | Sign in to production, place each project in its group there, and leave the internal placement once production holds everything; a project in your namespace follows production on its own. |
| One instance is down | Its placements read unreachable; the others sync. |
| A member at one instance only | Sees what those holding both brought, sees that the records are placed elsewhere, and shares there. |
| A second device, or another member holding both instances | Its instance lists the placement a file names; the row offers Attach, and Continue attaches it. |

### Considered and declined

- An automatic backup placement made without the reader's pick: it equals this device's clone; a placement is a shared space, chosen.
- Mirroring through spex.pub or by its service identity: Git bytes never pass spex.pub, a service identity at one host has no standing at the other, and a mirror pushes as nobody [[2]].
- A clone per placement: two sets of sessions under one project, and two keys.
- Placements known to one clone alone: every other device and member would meet a Join row and make the second clone.
- One tracked file listing every placement: two devices adding placements at once would conflict over the whole file, and the picker would drop one.
- The Git origin in a placement's file: it would name the Git system to every member and in the explorer; the core matches a shared placement by what it reads.
- Attaching a listed placement without the reader: whoever can push could name a placement and have another member's device carry every record there.
- Keying a clone by a Spex-minted id or by its root commit: [DR-103](103-the-home-and-its-groups.md) declined a second identity beside the host's; the first placement's path is as stable as a host's rename, which the sync already follows.
- A primary placement the others copy: Git has no primary; each remote is a peer, and the merge is the same.
- Two placements at one instance: the same records twice in one path space, with two member lists; one placement per instance.
- Every project placed at every instance at sign-in: sharing is a choice per group; only your own group follows you.
- One Sync control per placement: one row, one Sync; its lines say what each placement did.
- A bridge inside the instance: spex.pub holds no clone and no membership; a Spex server signed in to both, syncing on a schedule, is a bridge a group may run for itself.

## Consequences

- Records at two instances are two failure domains and two member lists, kept equal by whoever holds both; a host that fails or ends its terms leaves the records live at the other, for the people who hold accounts there.
- Whoever can push may name a placement in a file; a device carries records there only when its reader continues past Attach, and "Place at…" stays the surface's gated act.
- Every placement's members see the other placements' instances, and the logins that committed under the key placement's identity; your own group's records reach every instance you sign in to, the sign-in card saying so before the second.
- `placements/` joins Spex's own paths: a request naming a path under it is refused, and a `meta.yaml` there forms no unit.
- These specs change: `storage` for the placement files as units, `placements/` among Spex's own paths, the remotes and ids per placement, the key rule, the apply's version per placement, and the last sync and the notice recorded per placement; `space` for the rows' lines per placement, Sync over placements, Stop, the picker's sides, Members, Share, removing a member and Move per placement, "Place at…", "Leave…" and Attach as operations, the report lines and the instance each command names; `git-host` for creation and join at a named instance and the credential per placement; `environments` for `placements/` among the refused path segments; `projects` for removal; the storage Git tool keeps its contract with the remote named.
- Acceptance checks: two stand-in instances; records placed at both, a member at one alone reading what a device holding both brought and seeing the other placement named; a second device offered Attach for the placement a file names, attaching on Continue, and dropping a remote whose file a merge removed; a placement file written by a device that may not manage members left unattached until a reader continues; the first sync after the migration writing an existing placement's file alike on two devices; one instance unreachable while the other syncs; choices at the second placement with the first's merge and push standing, and the sync sent with choices passing the first as a fast-forward; a unit the first placement's merge rewrote taken from the second placement's side without a restart; a catch-up push rejected and the placement re-run once; Stop ending the sync before the next placement; a notice not continued stopping its placement alone; a placement left and the key moved, the last leaving a local-only clone under your own group's folder, and a leaving refused while records reached no remaining placement; your own group placed at both at sign-in, and at two instances on one Git backend listed as one placement whose file follows a Forget; the device that did not make the choice between two placements at one instance dropping its remote to the unchosen repository at its next sync and offered Attach for the chosen one; the sharing notice once per placement, and the own-group notice at the second sign-in; a placement joined from the empty ancestor; a path remote synced last.

## References

[1]: https://git-scm.com/book/en/v2/Git-Basics-Working-with-Remotes "Pro Git: Working with Remotes — a repository with several remotes"
[2]: https://github.com/sublang-ai/spex-pub/blob/main/specs/decisions/018-the-git-host-service.md "spex.pub DR-018: The Host Service — no member list stored, Git bytes never proxied"
