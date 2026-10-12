<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# space: The Groups Surface

## Intent

This package defines the Groups surface under [DR-103](../decisions/103-the-home-and-its-groups.md), the surface [DR-057](../decisions/057-space-surface.md) named Space: where the reader signs in to the Git host, sees their groups with the spex repositories in each and where their code lives, syncs each spex repository's `spex` branch with the host between Boss turns, reads a spex repository's members, repairs a project whose folder is missing on this device, and reads a clone as an annotated tree.
A **spex repository** holds one project's or one group's records on its `spex` branch and is known by its key, the clone's path under `workspace/` [[storage-1](storage.md#storage-1)]; a **unit** is one whole-unit selection subject — a session bundle, an intent with its attachments, an authoring session, a group's own environment's two files, the configuration, `project.json`, or one other tracked file [[storage-11](storage.md#storage-11)]; a **choice** takes a unit whole from this device or from the host; a **local** unit is one this device changed and an **incoming** unit one the host's copy changed, each against their common ancestor.
The core performs every Git operation and every call to the Git host; the surface renders the core's state and runs neither itself.

## External Behavior

### At a Glance

#### space-1

While the app is connected, the Groups surface — reached from the sidebar's Groups entry [[run-view-67](run-view.md#run-view-67)] — shall present the home in one header and one groups list:

| Field | Content |
| --- | --- |
| account | while signed in, "Signed in as @<login> at <host>" with the host's display name, and Sign out [[git-host-10](git-host.md#git-host-10)]; while signed out, the sign-in card [[space-3](#space-3)] |
| last read | while signed in, the time the host was last read, with Refresh, whose caption prints that time; "Not read yet" until a read since the core started is held — on a signed-in start, the one its first `space.get` begins [[git-host-5](git-host.md#git-host-5)] |
| issues | present while any repair or diagnostic stands, reading the count the core carries — the repairs this device's reader has not answered [[space-49](#space-49)] and every diagnostic no repair folds [[core-service-86](core-service.md#core-service-86)] — without a number where that count is none, and opening the issues list in place |
| Git | "Git is not installed" with install guidance, replacing every other field, where no `git` runs |

- the groups list stands beneath the header: your own group first, headed "Your own group" beside its path while signed in and beside "named after your login at sign-in" while signed out, then, in the order of their paths, every group the host lists, headed by its name beside its path in the instance where the two differ and by its name alone where they are equal, and every other account's login under which the host lists a spex repository, headed by that login; under each, one row per spex repository [[space-61](#space-61)], the group's own repository first; before sign-in the list holds your own group alone with its repositories ([DR-120](../decisions/120-the-instance-is-the-space.md));
- a row stands under the group the host's last read names for its spex repository [[git-host-5](git-host.md#git-host-5)], and under its key's group only where the host lists nothing for it, so a clone the host moved stands under its new heading, its key unchanged until its sync moves it [[space-60](#space-60)]; no group the host lists displaces your own group or takes its rows;
- what stands beside a heading's name follows the separator " · " in the surface's secondary tone;
- while signed in, "New group" stands at the list's head where the host's view says the person may create one, and where the view says the person may not, the phrase "Groups are made by the people who run <display name>" stands there instead, <display name> being the host's, with no link and no control; before a read is held, neither stands ([DR-120](../decisions/120-the-instance-is-the-space.md)); a group's heading carries "New subgroup", "Share", "Rename" and "Delete" where the view says the person may create a subgroup in it, add a member to it, rename it and delete it [[git-host-5](git-host.md#git-host-5)] [[space-68](#space-68)] [[space-69](#space-69)] [[space-76](#space-76)] [[space-77](#space-77)], "Delete" only while the list holds no spex repository under that group and no group inside it ([DR-120](../decisions/120-the-instance-is-the-space.md)) — nothing else is shown for an act the host does not let this person take, the headings of your own group and of another account's login carrying none ([DR-114](../decisions/114-groups-and-sharing-from-spex.md));
- a spex repository's row carries its name, where its code lives — the remote `project.json` names, "Group records" for a group's own, "Code not on a remote" for a project's whose `project.json` names none, or "Not on this device" — its reachability, its local-changes count [[space-7](#space-7)], the time of its last sync, and its Sync control, titled as sending what is here and bringing back anything new, or the control its state offers [[space-61](#space-61)], and, on a project's, "Move to another group" where the view says the person may move it to another group [[git-host-5](git-host.md#git-host-5)] [[space-78](#space-78)] — a group's own staying in its group ([DR-103](../decisions/103-the-home-and-its-groups.md));
- activating a row opens that spex repository's Sync and Explore tabs beneath the list;
- while signed in, the surface ends in one quiet line, "Spex keeps this device's files in <home>", the home's absolute path `~`-shortened under the user's home directory, selectable, with the full path in its title and no control;
- the surface links no page but the sign-in's [[space-3](#space-3)] and prints no URL but the host's own and a code remote as the reader set it ([DR-120](../decisions/120-the-instance-is-the-space.md)).

#### space-2

The Groups surface shall re-read the core's state only on an event, never on a timer: when the surface opens, when the window regains focus, when the core announces a sync's end, a sign-in's end, a host read, a project added or removed, or a session, intent or configuration change, and when the reader activates Refresh, which also makes the core read the host [[git-host-5](git-host.md#git-host-5)].

### Signing In

#### space-3

While the home is not signed in, the Groups surface's header shall be one card titled "Not signed in" that reads "Sign in to see your groups and share each project's records with the people in them." and "Until you do, everything stays on this device and nothing is contacted.", with Sign in as its one primary control ([DR-103](../decisions/103-the-home-and-its-groups.md)):

- on the desktop, Sign in starts the browser flow [[git-host-2](git-host.md#git-host-2)], and the card reads "Your browser is open at <host name>: sign in there and approve; you return here signed in." with the link "Open it again" to the sign-in URL; where the shell did not open the browser, the card reads as the device flow's with the sign-in URL as its link;
- in a browser client of the server shell, Sign in starts the device flow [[git-host-3](git-host.md#git-host-3)], and the card reads "Continue in your browser:", the link "Open <host name> to sign in" to the verification URL in a new tab, and "Sign in there and approve; you return here signed in.", showing no code;
- <host name> is the host name of the home's host URL: the page the person opens says how to sign in there, and the surface names no account elsewhere;
- while a flow runs, Sign in reads "Signing in…", disabled, beside Cancel, and no row offers a sign-in control;
- a denial, an expiry or a refusal ends the flow, the card reading the core's cause as one sentence and the control "Sign in again";
- while no flow runs or stands failed and the core reports that the host signed this device out [[git-host-4](git-host.md#git-host-4)], the card reads "<host name> signed this device out. Sign in again to continue as @<login>." in place of its first sentence, <login> being the account's, and Sign in reads "Sign in again";
- while signed out, your own group's spex repository reads "On this device only — shared once you sign in" with no control, a spex repository with a remote at the host is unreachable with "Sign in again" and the others are local only [[space-61](#space-61)], and the surface never contacts the host.

#### space-4

When a sign-in completes [[git-host-2](git-host.md#git-host-2)] [[git-host-3](git-host.md#git-host-3)], the core shall set the home up for the account in this order, announcing the end:

1. rename your own group's folder and its spex repository after the account's login where it bore this device's user name [[space-59](#space-59)];
2. read the host [[git-host-5](git-host.md#git-host-5)];
3. create your own group's spex repository on the host where the host lists none in your own group — a group of the host named like your login never counting as it [[git-host-5](git-host.md#git-host-5)] — and push it [[space-65](#space-65)]; where one exists, join the two histories as any two [[space-13](#space-13)];
4. list every local-only spex repository of a project with its "Pick a group" control [[space-58](#space-58)], creating nothing for them unasked.

- a session lease standing beneath a clone the rename would move refuses the whole rename [[space-59](#space-59)], the sign-in standing complete with the rename retried on the next read;
- a step the host refuses leaves the later steps for the next read and shows the refusal with the host's words [[space-64](#space-64)].

#### space-5

When a working folder's remote is read for `project.json` [[storage-3](storage.md#storage-3)], or the reader names a remote for a spex repository's code, the core shall write the URL without any transport and never a credential:

| URL | Outcome |
| --- | --- |
| `ssh://…`, `git@host:path`, `https://…`, `http://…`, an absolute local path | written as the remote, an SSH form's user being the transport's own and no credential |
| blank, or containing whitespace or control characters | refused as malformed |
| carrying anything before the host on `http://` or `https://`, with or without a colon (`https://user:secret@host`, `https://token@host`) | refused naming the rule that the app stores no credential, pointing to SSH keys or the machine's credential helper |

- the Git host's own remote URLs are those it hands over, used as given and never edited by the reader ([DR-103](../decisions/103-the-home-and-its-groups.md));
- a clone's last check, the host's `spex` it holds and this device's recorded last sync [[space-22](#space-22)] are of the repository it records by the host's id, which survives renames and transfers ([DR-103](../decisions/103-the-home-and-its-groups.md)): the host's remote written for that id keeps all three; taking the remote away clears the last check alone, keeping the id; any other remote — one the reader names, recording no id, or the host's for another id — clears all three, what the old remote held saying nothing of the new one.

#### space-6

When the reader activates Sign out, the core shall revoke this device at the host and forget its credential [[git-host-10](git-host.md#git-host-10)], and the surface shall read "Not signed in", every spex repository with a remote at the host turning unreachable with "Sign in again" and the others local only, their records and clones kept ([DR-103](../decisions/103-the-home-and-its-groups.md)).

### Groups and Spex Repositories

#### space-57

While a spex repository has other members and has never been pushed from this device, when a sync of it, or a pick joining it [[space-58](#space-58)], is admitted, the surface shall first say once that every session goes there whole — hidden parts and attachments included — that nothing recalls what others downloaded, and, where the repository is public, that its records are public, with Continue and Cancel, Cancel focused and Escape cancelling ([DR-010](../decisions/010-interface-craft.md) §4) ([DR-103](../decisions/103-the-home-and-its-groups.md)):

- a sync's notice stands beneath its row, and a pick's in the picker beneath the spex repository picked [[space-58](#space-58)];
- Continue records that this device's reader has seen it [[storage-5](storage.md#storage-5)] and starts the sync or the pick with `noticed`; Cancel starts nothing, focus returning to the control that asked;
- a spex repository whose only member is the account says nothing, and one whose members' count the host's last read lacks [[git-host-5](git-host.md#git-host-5)] is taken to have other members.

#### space-58

When a working folder is added while signed in [[storage-6](storage.md#storage-6)], or the reader activates a local-only spex repository's "Pick a group", the surface shall offer, in one picker, the spex repositories the host lists whose `project.json` names the folder's remote — each with its group, read as the list reads it [[space-1](#space-1)], and its members' count — and, below them, each group the host lists, since only the host knows where the account may create, the folder's name as the new repository's name in an editable field followed by `-spex` ([DR-103](../decisions/103-the-home-and-its-groups.md)):

- picking a listed spex repository clones it and pairs it with the folder, or, for a local-only one, joins its history with the clone's as any two [[space-13](#space-13)], once the sharing notice is seen where that repository may have other members [[space-57](#space-57)];
- picking a group creates `<name>-spex` there [[git-host-6](git-host.md#git-host-6)], the pick naming it by its host id and your own group by none, and pushes the local branch; a name the host reports taken is refused in place and the field asks for another;
- a creation the host refuses for the account's rights leaves the repository local only with "Waiting for a member who can create it in <group>" on its row [[space-64](#space-64)];
- Cancel leaves the repository local only, under your own group's folder, with "Pick a group" offered again;
- the groups offered are your own and each the host lists, each read by its name with its path in the instance after it where the path differs, as the list reads it [[space-1](#space-1)], never another account's login.

#### space-59

When the account's login differs from the name your own group's folder bears, the core shall rename the folder under `workspace/` and its spex repository `<login>-spex`, rewriting every pair that names it [[storage-2](storage.md#storage-2)] in the same step, and where the host already holds `<login>-spex` pushed from another device, shall join the two histories, every unit on both sides being one choice [[space-13](#space-13)] ([DR-103](../decisions/103-the-home-and-its-groups.md)):

- the rename is one step at its instant — every clone beneath moved by one rename and every pair rewritten, with nothing awaited between — refusing nothing beneath the folder [[space-21](#space-21)];
- where the clone of your own group on this device holds nothing of its own — no session, intent or authoring session, and no commit beyond those the core made at set-up — the join takes the host's side for every unit without asking, this device having nothing to lose, so a second device starts from what the first pushed; otherwise every unit on both sides is one choice [[space-13](#space-13)] ([DR-114](../decisions/114-groups-and-sharing-from-spex.md));
- the rename moves nothing, leaving every clone, pair and session where it was for the next set-up to ask again, where any clone's destination is already taken — by another folder, by the clone itself under another spelling of its group, or by a folder on its path below `workspace/` that stands spelled otherwise — or where any clone beneath holds a session lease `sessions/.<id>.lock` other than a Playbook session-lease record whose `hostname` and `pid` read as a dead owner of this machine by steps 3 and 4 of the root lease's rule [[storage-26](storage.md#storage-26)], such a lease moving with the clone ([DR-108](../decisions/108-the-root-lease-names-the-machine.md)).

#### space-60

When a host read [[git-host-5](git-host.md#git-host-5)] reports a spex repository, known by its id, under another name or group than its clone's path, the core shall move the clone to the new path on that repository's next sync, rewriting every pair that names it and the exports beneath it in the same step, so that its key and name follow the host ([DR-103](../decisions/103-the-home-and-its-groups.md)):

- the move is one rename within the sync at its instant, made only while the clone still reads the remote its check read before asking the host, records the host's id and lies where the home says [[space-21](#space-21)];
- the move stops the sync, the clone, its pairs and its sessions left where they were, where the destination is taken by anything but the clone itself under the same group folder — which a rename changing only the case of the repository's own name moves onto — or a folder on its path below `workspace/` stands spelled otherwise, or where the clone holds a session lease that refuses a sign-in's rename [[space-59](#space-59)], naming that session with Retry [[space-15](#space-15)];
- a group the host renamed still holds its spex repositories under their own names, since the host renames no repository with its group.

#### space-61

The Groups surface shall show each spex repository in exactly one of these states, read from the host's last answer and this device's files ([DR-103](../decisions/103-the-home-and-its-groups.md)):

| State | Holds while | Row reads | Control |
| --- | --- | --- | --- |
| local only | the clone has no remote on the host | "On this device only", your own group's reading "On this device only — shared once you sign in" while signed out [[space-3](#space-3)] | Pick a group [[space-58](#space-58)], none while signed out |
| reachable | the home's current view lists it [[git-host-5](git-host.md#git-host-5)] and the clone is here, no join of it running [[space-63](#space-63)] | its last sync | Sync |
| read-only | the host listed it archived, or with the account below the role that may push, or refused the push | "Read-only: <the host's reason>"; new sessions stay on this device, said so | Sync, bringing only |
| unreachable | the host stopped listing it, refused the read, the device is offline, or the home is signed out while the clone has a remote | "Unreachable: <cause>" | Retry, none while signed out with the remote at the host |
| not on this device | the host listed it and no clone is here, or its join still runs [[space-63](#space-63)] | "Not on this device" | Join [[space-63](#space-63)] |

- a reachable row's last sync is read from this device's last completed sync of it [[space-22](#space-22)] as "Synced <age>", or, where none is recorded, from the last one its clone holds ([DR-111](../decisions/111-the-core-coordinates-as-git-does.md)): "Synced <age>" at `spex`'s commit time where `spex` equals the host's `spex` as the clone last fetched or pushed it, "Not synced since <moment>" at their common ancestor's commit time where the two differ, and "Never synced" where the clone holds no host's `spex` sharing its history;
- nothing on this device is deleted because the host refused or stopped listing;
- a spex repository the host lists in a group held as colliding [[git-host-5](git-host.md#git-host-5)] reads "Unreachable: a group named like your login" whether or not a clone is here, offering no Join and no Sync, and no clone is made or moved for it ([DR-120](../decisions/120-the-instance-is-the-space.md));
- a waiting creation or branch preparation [[space-64](#space-64)] shows its phrase on the row in place of the state's; the wait is held for the app's run alone, so after a restart the row offers its control again and the next attempt finds what a member did meanwhile.

#### space-62

When the reader activates Members on a reachable spex repository's row, another account's login's among them, the surface shall list its members as the host reports them [[git-host-8](git-host.md#git-host-8)] — login, display name and the host's own role name — with Share where the view says the person may add a member to it [[git-host-5](git-host.md#git-host-5)] [[space-69](#space-69)] ([DR-103](../decisions/103-the-home-and-its-groups.md), [DR-114](../decisions/114-groups-and-sharing-from-spex.md)):

- the list is read on activation, on Refresh and after a share, never cached across reads;
- the panel links no page of the host ([DR-120](../decisions/120-the-instance-is-the-space.md)).

#### space-68

When the reader activates "New group" at the groups list's head, or "New subgroup" on a group's heading, the surface shall open an inline editor in that place with a field captioned "Group name", a field captioned "Path" that follows the name as the host derives it — lower-cased, each run outside letters, digits, `.`, `_` and `-` one `-`, leading and trailing `-` and `.` dropped — until the reader edits it, Create and Cancel, Escape cancelling ([DR-010](../decisions/010-interface-craft.md) §6), and on Create shall send `space.group.create` with the name, the path and, from a group, that group as the parent [[git-host-15](git-host.md#git-host-15)] ([DR-114](../decisions/114-groups-and-sharing-from-spex.md)):

- Create reads "Creating…" and the editor refuses a second submission while the command runs;
- a name that derives no path — one in Chinese, say — leaves the path field empty for the reader to fill, and an empty path disables Create;
- a success closes the editor, the group already standing in the list with its full path, after its parent where it has one, as the core holds it [[git-host-15](git-host.md#git-host-15)] until a read begun after the creation is held [[git-host-5](git-host.md#git-host-5)];
- a refusal — the name taken there, the host's words, or that the host could not be reached [[git-host-11](git-host.md#git-host-11)] — shows in the editor with the name kept;
- an empty name disables Create.

#### space-69

When the reader activates Share — on a group of the host, or in a spex repository's members panel [[space-62](#space-62)] — the surface shall open an inline editor there with a field captioned "Login at <host name>", a listbox of the host's roles in its order preselecting the least that may push [[git-host-16](git-host.md#git-host-16)], Add and Cancel, Escape cancelling ([DR-010](../decisions/010-interface-craft.md) §6), and on Add shall send `space.share` naming that group or spex repository, the login and the role ([DR-114](../decisions/114-groups-and-sharing-from-spex.md)):

- Add reads "Adding…" and the editor refuses a second submission while the command runs;
- a success closes the editor and says in one line "@<login> added as <role>", a members panel standing open listing the members the reply carries;
- a refusal — no account under that login, the account already a member, or the host's words — shows in the editor with the login kept;
- an empty login disables Add.

#### space-72

When the reader activates Remove on a member in a members panel [[space-62](#space-62)], the surface shall ask with the inline confirm — "Remove" and "Keep", Keep focused, Escape keeping ([DR-010](../decisions/010-interface-craft.md) §4) — and on Remove shall send `space.unshare` naming that group or spex repository and the member's login [[git-host-17](git-host.md#git-host-17)] ([DR-114](../decisions/114-groups-and-sharing-from-spex.md)):

- the row reads "Removing…" until the reply;
- a success lists the members the reply carries and says in one line "@<login> removed";
- a refusal — the host's words — shows on the row with the member kept.

#### space-76

When the reader activates "Rename" on a group's heading [[space-1](#space-1)], the surface shall open there the inline editor of [[space-68](#space-68)], its "Group name" field holding the group's name and its "Path" field the group's own path segment, which no longer follows the name, with Save and Cancel, Escape cancelling, and on Save shall send `space.group.rename` naming that group with the name and the path where each differs from the group's [[git-host-18](git-host.md#git-host-18)] ([DR-120](../decisions/120-the-instance-is-the-space.md)):

- Save is disabled while neither differs or either is empty, and reads "Saving…" while the command runs, the editor refusing a second submission;
- a success closes the editor, the group standing in the list under its new name and path, and every group inside it under its new path, as the core holds it [[git-host-18](git-host.md#git-host-18)];
- a refusal — the path taken there, the host's words, or that the host could not be reached [[git-host-11](git-host.md#git-host-11)] — shows in the editor with the name kept.

#### space-77

When the reader activates "Delete" on a group's heading [[space-1](#space-1)], the surface shall ask with the inline confirm — "Delete <the group's path>?", "Delete" and "Keep", Keep focused, Escape keeping ([DR-010](../decisions/010-interface-craft.md) §4) — and on Delete shall send `space.group.delete` naming that group [[git-host-19](git-host.md#git-host-19)] ([DR-120](../decisions/120-the-instance-is-the-space.md)):

- the heading's control reads "Deleting…" until the reply;
- a success leaves the list without the group, as the core holds it [[git-host-19](git-host.md#git-host-19)];
- a refusal — the host's words, or that the host could not be reached [[git-host-11](git-host.md#git-host-11)] — shows beneath the heading with the group kept.

#### space-78

When the reader activates "Move to another group" on a project's spex repository's row [[space-1](#space-1)], the surface shall open beneath the row a picker of groups as in [[space-58](#space-58)] — your own group first, then each group the host lists, each read by its name with its path in the instance after it where the path differs, as the list reads it [[space-1](#space-1)], never another account's login, the group the row stands under left out — with Cancel, Escape cancelling, and on a pick shall send `space.repository.move` naming the spex repository and that group, or none for your own group [[git-host-20](git-host.md#git-host-20)] ([DR-120](../decisions/120-the-instance-is-the-space.md)):

- the row's control reads "Moving…" and the picker refuses a second pick while the command runs;
- a success closes the picker, the row standing under its new group at once with its key unchanged, as the core holds it [[git-host-20](git-host.md#git-host-20)], and its clone moving on its next sync [[space-60](#space-60)];
- a refusal — the name taken in that group, a group named like your login, the host's words, or that the host could not be reached [[git-host-11](git-host.md#git-host-11)] — shows in the picker with the row kept where it stood.

#### space-63

When the reader activates Join on a spex repository the host lists and this device lacks, the core shall clone it under `workspace/<group>/`, then, where its `project.json` names a remote, clone the code from that remote with this device's own Git and its credentials into a folder the reader picks, or take a working folder the reader already has, and pair the two [[storage-6](storage.md#storage-6)] ([DR-103](../decisions/103-the-home-and-its-groups.md)):

- a group's own spex repository, holding no `project.json`, asks for the working folder its sessions run in on this device; the folder is paired through the same command a repair uses [[space-47](#space-47)];
- the join runs at its Check step while the spex repository clones and at its Code step, its line reading "Cloning code…", while the code clones, offering Stop at neither, and ends only once the code is cloned and paired or its clone has failed [[space-61](#space-61)];
- the spex repository clones into a private folder beside its place and moves there only where nothing stands at that instant; a join finding its place taken — another join's clone — stops, leaving that clone as it stands, and every join removes its own private folder alone;
- a code clone that fails stops the join at its Code step with Git's words, leaving the spex repository cloned and the row offering "Choose folder…" to pair it later.

#### space-64

When a step at the host — creating a spex repository [[git-host-6](git-host.md#git-host-6)] or preparing its `spex` branch [[git-host-7](git-host.md#git-host-7)] — is refused for the account's rights, the surface shall show the step as waiting on the repository's row, with the host's words in the row's title, and the core shall ask again at the next read, finding the result when a member with the rights has done it from their own Spex ([DR-103](../decisions/103-the-home-and-its-groups.md)):

- nobody is sent to edit the host's settings: the row names the step and the group, never a host page to change.

#### space-65

When the first session of a group starts in the working folder paired with that group [[storage-6](storage.md#storage-6)], or sign-in finds your own group without a spex repository on the host [[space-4](#space-4)], the core shall create `<group>-spex` in that group on the host [[git-host-6](git-host.md#git-host-6)], prepare its branch [[git-host-7](git-host.md#git-host-7)], and push the local clone ([DR-103](../decisions/103-the-home-and-its-groups.md)):

- a refused creation leaves the clone local only and the session running [[space-64](#space-64)].

### Repairs

#### space-46

When the core reports the home's diagnostics, it shall fold every diagnostic a folder on this device would repair into one repair each, carrying the facts the repair needs, and leave every other diagnostic unfolded [[core-service-86](core-service.md#core-service-86)] ([DR-063](../decisions/063-space-setup-and-repair.md)):

| Repair | Raised by | Named by |
| --- | --- | --- |
| a spex repository with no working folder here | a clone under `workspace/` that no pair names [[storage-2](storage.md#storage-2)] | the spex repository's name, with its group |
| a working folder whose clone is missing | a pair naming a clone that is not under `workspace/` | the folder's path |

- one spex repository's repair resolves every session it holds, however many sessions ran there;
- a fault no folder repairs — a session working directory missing or invalid, a blocking diagnostic, a pending merge — folds into no repair and keeps its own row;
- repairs stand before unfolded diagnostics, blocking ones first, then unanswered repairs before declined ones [[space-54](#space-54)], then by session count descending, then by name, then by path, and no row reorders while an editor is open.

#### space-47

When the user pairs a repair's spex repository with the folder proposed [[space-53](#space-53)] or with one he names, or declines to, the Groups surface shall settle that repair in place ([DR-065](../decisions/065-repairs-the-reader-answers.md)):

- pairing a folder the home already pairs with that spex repository sets that pair's folder, carrying the repair's recorded directories as aliases so every session recorded under them may continue [[storage-6](storage.md#storage-6)];
- pairing a folder the home pairs with nothing writes the pair [[storage-6](storage.md#storage-6)], and where that folder is not one the repair records, attaches those recorded directories to it as aliases;
- naming a different folder opens the row as an in-place editor over the proposed or recorded path, with Add project, Cancel, Escape cancelling, and an Open folder… control where the running deployment offers a directory picker;
- the editor says that where a project lives is recorded on this device alone and never syncs [[storage-1](storage.md#storage-1)];
- a refusal shows in the row with the path kept and the control offered again: a folder inside another working folder, a folder already another spex repository's, and a spex repository whose turn is still running;
- a sync of that spex repository running meanwhile disables no repair control and refuses no rebind [[space-21](#space-21)].

#### space-48

When pairing a repair's spex repository succeeds with every recorded folder attached [[space-47](#space-47)], the Groups surface shall replace that row with its outcome in the row's own place, keeping the reader on the surface ([DR-009](../decisions/009-at-hand-interaction.md)) ([DR-063](../decisions/063-space-setup-and-repair.md)):

- the outcome names the project and the folder it is now a project at, with the count of sessions listed where any ran there, and offers Open project, which is the only control here that leaves the surface;
- the core no longer reports the repair, so the issues count leaves it out [[space-1](#space-1)], and the live region says how many issues are left as that count reads — declined repairs not among them [[space-49](#space-49)] — or that every issue is resolved where none is;
- focus moves to the first control of the next unanswered repair below it, wrapping to the list's top — its Add project where it proposes a folder, else its Choose folder… — or, where no unanswered repair remains, to the outcome's Open project;
- the outcome holds that place, the issues list standing with it though the core reports no diagnostic, until the reader's own Refresh [[space-2](#space-2)] or his leaving the Sync tab, when it leaves the list.

#### space-49

While a repair stands unanswered, the Groups surface shall count it as an issue [[space-1](#space-1)], only this device's reader's own act settling it ([DR-065](../decisions/065-repairs-the-reader-answers.md)):

- drawing a row, opening the list and re-reading the state settle nothing;
- declining says this is not a project on this device: the row stands in the list, counts no more, and keeps the controls it had, so changing that answer is pairing the project rather than undoing anything;
- resolving a repair removes it from the list, the core no longer reporting it;
- an answer lapses only when the repair's own recorded facts change, never because a folder appeared or vanished beneath it.

#### space-53

When the core reports a repair, it shall check the folders that repair already names and the one named by joining the parent this device's working folders most share to the spex repository's own name without `-spex`, reporting what it found and proposing at most one, and shall search the disk for none ([DR-065](../decisions/065-repairs-the-reader-answers.md)):

| Finding | Reported |
| --- | --- |
| the folder is not on this device | present false |
| it is here, a Git work tree root, and no pair names it | present, a repository, unclaimed |
| it is here and another pair names it | present, with that spex repository's name |
| it is here and is no work tree root | present, not a repository |
| the check could not complete within its bound | unknown |

- exactly one folder present, a work tree root and unclaimed is the proposal; two qualifying folders propose nothing, and the row asks instead;
- the check lists no directory and descends none, so a path never reported is a path never examined;
- a check is bounded and one that exceeds it reports unknown, so an unreachable folder never delays the surface's read [[space-2](#space-2)];
- the surface renders what was found before any control can accept it.

#### space-54

While this device's reader has declined to pair a repair's spex repository, the core shall hold that answer in this device's preferences alone, keyed by the facts the repair names [[storage-5](storage.md#storage-5)] ([DR-065](../decisions/065-repairs-the-reader-answers.md)):

- the record is written only when he declines, and removed when the repair is answered otherwise, never by a read or a render;
- a repair whose recorded facts change is another repair, so it carries no record and counts afresh;
- an answer naming no repair the core still reports is discarded, except where the fold carries a blocking diagnostic;
- answering a repair the core does not report is refused.

#### space-55

While the issues list stands, the Groups surface shall tell a repair's three conditions apart by mark, by word and by weight, each named in the row's accessible description ([DR-065](../decisions/065-repairs-the-reader-answers.md)) ([DR-010](../decisions/010-interface-craft.md) §8):

| Condition | Mark | Row |
| --- | --- | --- |
| unanswered | a filled dot | the spex repository's name and group, where its sessions ran, what the core found, and its controls |
| declined | a hollow dot | "not added" after the fact, in the surface's secondary tone, its controls kept |
| resolved | a check | the project, the folder it is now a project at and the sessions listed, with Open project [[space-48](#space-48)] |

- the list's heading counts the unanswered repairs and names how many stand not added;
- the issues list and the header's control wear the surface's attention colour only while a repair stands unanswered, reading as settled — and staying reachable — once none does;
- a declined row holds its place until the reader's own Refresh [[space-2](#space-2)] or his leaving the Sync tab, then standing after the unanswered repairs [[space-46](#space-46)].

### Changes

#### space-7

While a spex repository's Sync tab is shown, it shall list the local units — those whose working-tree bytes differ from the common ancestor with the host's `spex` branch while the host's do not, or from the last commit where the host has never been checked [[space-33](#space-33)] — grouped by kind in this order with these labels, never a raw diff of a session:

| Kind | Unit | Label | Detail |
| --- | --- | --- | --- |
| Sessions | `sessions/<id>` bundle | the session's title, or "untitled session" | new, updated or deleted; turn count |
| Intents | `intents/<id>.json` with its assets | the intent's title | new, updated or deleted |
| Authoring | `authoring/<id>` | the session's title, or "untitled authoring session" | new, updated or deleted |
| Environment | `spex.yaml` with `spex.lock`, wherever a clone holds them — a group's own, or a project's until the migration moves them [[storage-1](storage.md#storage-1)] | "Spec packages changed" | a View diff control [[space-10](#space-10)] |
| Settings | `config/playbook.config.yaml` | "Settings changed" | a View diff control [[space-10](#space-10)] |
| Code | `project.json` | "Code remote changed" | a View diff control [[space-10](#space-10)] |
| Sync rules | `.gitignore`, `.gitattributes` | "Sync rules updated" | a View diff control [[space-10](#space-10)] |
| Other | any other tracked path | the path | new, updated or deleted |

- a session row carries Open session, which opens the session as a tab [[run-view-68](run-view.md#run-view-68)];
- with no local unit the list reads "Nothing to send from this device".

#### space-8

When the user activates Check host on a spex repository, the core shall fetch the host's `spex` branch without merging, and the Sync tab shall list the incoming units [[space-33](#space-33)] with the labels of [[space-7](#space-7)], each marked new, updated or deleted against the common ancestor and marked as a choice to make where this device changed it too:

- the control reads "Checking…" in flight and offers Stop [[space-16](#space-16)];
- ahead, behind and the check time update on the row;
- a repository holding no `spex` branch reads "The host holds no records yet; Sync will send these";
- unrelated histories read "Unrelated history" with Join in place of Sync [[space-13](#space-13)] and list nothing;
- a failed transport reports per [[space-15](#space-15)].

#### space-9

While a sync has ended in choices needed, the Sync tab shall show the incoming list above the conflict picker [[space-17](#space-17)] with the step line reading "Needs your choice" and the caption "Your changes are saved; nothing is pushed yet".

#### space-10

When the user activates View diff on an Environment, Settings, Code, Sync rules or Other row, the surface shall show that unit's line diff in place — this device's version against the common ancestor for a local row, the host's version against it for an incoming row, either side on a conflict row — additions and removals marked in text as well as color, and Hide diff removing it; a session, intent or authoring row offers no diff.

### Syncing

#### space-11

When the user activates Sync on a spex repository, the core shall admit it only while every condition below holds, otherwise refusing before the first step with the surface showing the reason beside the disabled control:

| Condition | Refusal shown |
| --- | --- |
| the home is signed in, or the spex repository's remote is a path this device can reach | "Sign in first" |
| the spex repository is reachable or read-only [[space-61](#space-61)] | the state's phrase |
| no Git merge is pending from a terminal in the clone | "Finish or abort the merge in your terminal" |
| no blocking storage diagnostic stands for a file inside its clone or for a home file outside `workspace/` [[core-service-86](core-service.md#core-service-86)], a refresh's finding aside [[space-20](#space-20)] and, while its repair marker stands, every diagnostic of a file inside its clone, the repair's own finding among them [[space-67](#space-67)] | the file and reason |
| `git` runs | the install guidance |

- no turn, session, compile, upload or environment change, and no operation of another spex repository, refuses or delays the sync; an operation of its own clone runs first, the sync joining or following it [[space-21](#space-21)].

#### space-12

When a sync is admitted, the core shall run these steps in order on the clone, the Sync control reading "Syncing…" and a step line naming the step in flight, and end in one of the outcomes below:

| Step | The core | The line reads |
| --- | --- | --- |
| 1 Save | refresh the managed rules [[storage-17](storage.md#storage-17)], stage the catalog files, refuse a staged ignored-family path, validate the staged tree in a private copy [[storage-12](storage.md#storage-12)], commit that tree, where it differs from `HEAD`'s, on the `HEAD` it was staged against by a conditional ref update | "Saving changes…" |
| 2 Check | read the host for this repository [[git-host-5](git-host.md#git-host-5)], prepare its branch where the first push is ahead [[git-host-7](git-host.md#git-host-7)], fetch the host's `spex` branch with the brokered credential [[git-host-9](git-host.md#git-host-9)] | "Checking host…" |
| 3 Compare | plan every unit against the common ancestor [[storage-11](storage.md#storage-11)] [[space-33](#space-33)]; nothing incoming skips to Push | "Comparing…" |
| 4 Apply | write the selection and one merge commit, or fast-forward [[space-19](#space-19)] | "Applying…" |
| 5 Refresh | re-validate and re-index [[space-20](#space-20)] | "Refreshing…" |
| 6 Push | push `spex` to the host, setting the upstream once; skipped for a read-only repository | "Pushing…" |

| Outcome | State afterwards |
| --- | --- |
| synced | `spex` equals the host's `spex`; the line reads "Synced just now · N sent · M received", or "Everything is in sync" when nothing moved; a read-only repository reads "Brought M; nothing sent" |
| choices needed | the Save commit stands, nothing merged, no operation running [[space-14](#space-14)] |
| stopped | the step, cause and way forward shown [[space-15](#space-15)] |

- where the repair marker an interrupted Apply left stands, the sync first runs its repair, before Save [[space-67](#space-67)].

#### space-13

Where the clone's `spex` and the host's `spex` share no common ancestor, when a sync compares, the core shall stop with "Unrelated history" unless the sync was started as a join, whereupon it shall compare against the empty tree [[storage-11](storage.md#storage-11)] — a unit present on one side only taken, a unit present on both sides with different bytes a choice [[space-17](#space-17)] except at a sign-in's join of a clone holding nothing of its own, where the host's side is taken [[space-59](#space-59)]:

- Join confirms inline, naming that both histories become one and that a unit present on both sides differently will ask for a choice ([DR-010](../decisions/010-interface-craft.md) §4);
- a join a sign-in [[space-59](#space-59)] or a pick [[space-58](#space-58)] starts needs no second confirmation, those acts having said so.

#### space-14

When the Compare step finds a unit changed differently on both sides without a choice for it [[storage-11](storage.md#storage-11)], the sync shall end in choices needed — the Save commit kept, nothing merged, no lease held — and the surface shall show the picker [[space-9](#space-9)] [[space-17](#space-17)].

#### space-15

When a sync or check step fails, the core shall stop leaving the clone in the state below, and the surface shall show the step, the cause in plain words and its guidance, offering Retry where retrying can help:

| Step | Cause | State left | Surface |
| --- | --- | --- | --- |
| Save | a staged path of an ignored family, or validation refusing a file | index reset, no commit, files untouched | the path or file and reason; "Nothing was saved" |
| Save | `spex` moved while the Save validated — a commit from a terminal | no commit; that commit and every file stand | Git's last lines; Retry |
| Check, Push | the host unreachable, or the device offline | commits stand | "Could not reach <host>"; check the network; Retry |
| Check, Push | the host answering that this device must sign in again [[git-host-4](git-host.md#git-host-4)] | commits stand | "Sign in again"; the header's Sign in; Retry after |
| Check, Push | the host refusing with its words — the repository read-only, the push rejected by a rule, the account's role too low | commits stand | "<host> refused: <the host's words>" [[space-50](#space-50)]; the repository turns read-only |
| Check, Push | the host no longer listing the repository | commits stand | "No longer shared with you"; the repository turns unreachable; nothing deleted |
| Check, Push | no answer within the transport limit, or Stop | commits stand | "No answer from <host>"; Retry |
| Check, Push | the host answering its transport with an HTTP status no row above reads | commits stand | "<host> answered with an error (HTTP <status>)"; Retry |
| Compare | unrelated history | unchanged | Join [[space-13](#space-13)] |
| Apply | a chosen unit refused by validation | nothing written; the Save commit stands | the unit and reason; the picker stays with the unit marked; Retry |
| Check | a session lease beneath a clone the host moved [[space-60](#space-60)] | commits stand; the clone where it was | the session and reason; Retry |
| Apply | a written session's lease held elsewhere, or a written authoring session's turn running [[space-19](#space-19)] | no merge commit; the Save commit stands, the units written before it kept with the repair marker | the session and reason; Retry, whose repair finishes the selection [[space-67](#space-67)] |
| Apply | a written unit changed since Save on the second cycle [[space-19](#space-19)] | no merge commit; the Save commit stands, the units written before it left as local changes | "The space changed twice while syncing"; Retry |
| Refresh | a diagnostic | the merge stands committed | the file and reason under issues |
| Push | rejected as not fast-forward | merge committed, ahead shown | one automatic cycle from Check; a second rejection reads "The host changed again"; Retry |
| any | Git's own error, or a failing system call such as a clone removed meanwhile, otherwise | that step's row | its last lines; Retry |

- a report naming the host prints its display name, and a remote URL never with a credential;
- no line a report carries — Git's last lines and the host's `remote:` words alike — holds a URL under the host's Git origin: the clone's own remote, with or without `.git` and a trailing `/`, reads as the repository's path in the instance, and any other URL under that origin as the host's display name, a code clone's lines alone naming the code's remote as the reader set it [[space-63](#space-63)] ([DR-120](../decisions/120-the-instance-is-the-space.md));
- the report stands until the next operation or Dismiss.

#### space-16

While a sync or check runs a transport step — Check or Push — the surface shall offer Stop, which ends the Git child and leaves that step's stopped state [[space-15](#space-15)]; Save, Compare, Apply and Refresh are bounded local steps and offer no Stop, and the Check step offers it only once its Git child runs, the host read before it being bounded by the client's own timeout.

#### space-50

Where a failure could turn on what the host let this account do — the host refusing a push or a read [[space-15](#space-15)] — the core shall name in that failure's guidance only what the host said, with the host's own words, and, where membership decides, Share or a member who may share it, in Spex ([DR-064](../decisions/064-honest-remote-failure.md)) ([DR-103](../decisions/103-the-home-and-its-groups.md)) ([DR-120](../decisions/120-the-instance-is-the-space.md)):

- no role name or cached list is read for the guidance: the refusal is the answer;
- a spex repository whose remote is a local path, used without the host, names the folder's permissions rather than an account.

### Choices

#### space-17

While conflicting units stand, the picker shall present each as one row — its label [[space-7](#space-7)] and two exclusive choices, "Keep mine" and "Take host's", each carrying its side's summary — with nothing preselected and Apply disabled with "N of M chosen" until every row has a choice:

| Unit | Side summary |
| --- | --- |
| session, authoring | updated or deleted; last activity; turn count |
| intent | updated or deleted; its title |
| Environment, Settings, Code, Sync rules, Other | changed at; a View diff control per side [[space-10](#space-10)] |

- "All mine" and "All host's" fill every row at once;
- a deletion on one side against a change on the other reads "deleted" on the deleting side; taking it deletes the whole unit;
- each row is a radio group named by the unit's label, arrow keys moving within it ([DR-010](../decisions/010-interface-craft.md) §6).

#### space-18

When every conflict has a choice and the user activates Apply, the surface shall ask one inline confirm — naming how many units the host's version replaces, that the other version stays in Git history [[storage-11](storage.md#storage-11)], and that a replaced session loses its local resume hints and viewed position — with Cancel focused and Escape cancelling ([DR-010](../decisions/010-interface-craft.md) §4), and on confirmation shall start a sync carrying the choices [[space-12](#space-12)], and the join while the histories are still unrelated [[space-13](#space-13)]:

- Cancel keeps the choices made;
- a sync whose Compare finds conflicts that no longer match the choices — the host moved — ends again in choices needed with the new set [[space-14](#space-14)].

#### space-19

When a sync's Apply step runs, the core shall build the candidate as `select` does [[storage-21](storage.md#storage-21)] — the Save commit's tree with each unit taken whole from its selected side — validate it complete in a private copy before any file is written [[storage-12](storage.md#storage-12)], write each unit whose selected bytes differ from the Save commit's by a versioned replacement naming the Save commit's bytes [[storage-14](storage.md#storage-14)], and, with no Git merge pending, record the candidate's tree as the merge commit with `spex` and the host's `spex` as parents, or move `spex` to the host's commit where that tree equals its tree:

- a unit is every file of it on disk — manifest, records and assets, one added since Save among them — each read as Git reads its path, filters applied, and its write is one versioned write at its instant [[storage-14](storage.md#storage-14)], made only while the clone's folder and its `.git` are the ones the apply began in, every file of the unit holds the Save commit's bytes or the selected ones, a session's management lease is taken, and no turn this core runs for an authoring session instance [[core-service-96](core-service.md#core-service-96)] owns an authoring unit's current recorded instance, a turn its transcript records unfinished refusing nothing, and otherwise refused with no folder made; a file already holding the selected bytes is left as it is;
- a unit whose selected bytes equal the Save commit's is neither written nor leased, so a session held elsewhere stops no write but its own;
- sessions are written before the other units, so an intent naming a session's newer turn is never written ahead of a session refused at its write;
- each written unit's files are replaced replay before manifest, they and its attachment folder owner-only whatever the process umask or the hand that made the folder, its session's hints and viewed marker cleared [[storage-5](storage.md#storage-5)]; once every unit holds its selection, so are those of every session the selection changed, one written before an interruption among them;
- the index is set to the candidate's tree and the commit records that tree, never the working tree, so what another process writes beside the apply stays a local change;
- the working tree never holds Git's own merge output — no conflict marker, no `MERGE_HEAD`;
- a refused write records no merge commit, the Save commit standing: a held lease or a running authoring turn stops the sync naming the session with the repair marker kept, so units naming one another are finished together by the next admission's repair [[space-67](#space-67)]; a changed unit removes the marker, leaves the units already written as local changes equal to the host's side, and restarts the sync once from Save, stopping on the second time — where such a change leaves a written unit naming one not written, the restart's Save refuses it, naming the file for the reader to repair [[space-15](#space-15)]; a moved clone stops it with the marker where the clone now lies [[space-15](#space-15)];
- an apply interrupted before its commit lands is repaired from its recorded selection [[space-67](#space-67)].

#### space-20

When a sync's Apply step has changed the working tree — by merge or fast-forward, by the units it wrote before a changed unit refused its write [[space-19](#space-19)], or by a repair [[space-67](#space-67)] — the core shall re-validate [[storage-12](storage.md#storage-12)] and re-index the clone before the sync pushes, restarts or stops, so every view reflects the working tree without a restart:

- a session whose bundle changed is announced with its history replaced [[core-service-87](core-service.md#core-service-87)], a new one served and a deleted one forgotten as the shared store's arrivals and departures are [[core-service-60](core-service.md#core-service-60)] [[core-service-76](core-service.md#core-service-76)], and the project's ledger is announced changed [[core-service-51](core-service.md#core-service-51)];
- the intents, a group's own environment and the preferences are re-read, and the configuration reloads through its ordinary reload [[core-service-2](core-service.md#core-service-2)], that environment's exports refreshed [[environments-8](environments.md#environments-8)];
- a diagnostic found here is reported under issues and undoes nothing; it refuses no later sync, whose Save validates the staged files and names any still invalid [[space-15](#space-15)], and a Save whose staged files validate clears it.

#### space-21

While a sync, check, join or move of a spex repository is running, the core shall refuse no command and no operation because it runs ([DR-111](../decisions/111-the-core-coordinates-as-git-does.md)):

- every write beneath the clone lands or is refused at its own instant — a file changed since its writer read it as "changed meanwhile; retry", a session's lease as that session's refusal — and the runtime's own admission of messages stays;
- each of the core's own writes beneath the clone resolves the clone's address at that write, never at an earlier read, so no write lands where a moved or removed clone stood and no folder is made there again;
- the clone's own operations run one at a time on its machine [[space-31](#space-31)]: a second Sync asked while a sync runs, or a Check asked while a sync or a check runs, joins that operation, and a Sync asked while a check runs follows it, making no Save until that check has ended; no other command waits for either;
- a remote or recorded host id the core writes is written only while the clone's remote still reads what the core read before awaiting the host, and refused as changed meanwhile otherwise;
- an operation's progress is its own, ended by it alone, and what it shows is no reason to wait.

#### space-67

While a clone holds the repair marker an interrupted Apply left [[space-31](#space-31)], the core shall finish the marker's recorded selection before it reopens that clone at its start, and at each sync's admission as the first work of that sync's operation, before its Save, so a second admission joins that work and no two repairs of one marker run at once [[space-21](#space-21)]:

| The repair finds | Outcome |
| --- | --- |
| `spex` on the recorded Save commit | each unit written as Apply writes it [[space-19](#space-19)], a file already holding the selected bytes accepted, then the same tree recorded with the same parents and the marker removed |
| a file holding neither the recorded Save's bytes nor the selected ones | that file left as it stands, the marker removed, no merge commit; the sync goes on from Save and replans |
| `spex` moved off the recorded Save commit — the merge landed, or a terminal commit moved it on | the marker removed with nothing written |
| a write refused for a held session lease or a running authoring turn [[space-19](#space-19)], or any other failure | the marker standing as a blocking issue, and the sync admitted stopped naming the session or the cause; the next admission repairs again |

- a sync's repair reads as its Apply step while it runs [[space-12](#space-12)];
- the sync's blocking issues — those of its own clone's files that its admission set aside while the marker stood among them [[space-11](#space-11)] — are read again once its repair has ended, one standing then stopping the sync before Save with the file and reason.

#### space-22

When a sync completes through Push, or through Refresh for a read-only repository, the core shall record its time and its counts of units sent and received in the preference store [[storage-5](storage.md#storage-5)] under `sync:<repository>:last`, never in a tracked file.

### Explorer and Privacy

#### space-23

While a spex repository's Explore tab is shown, the Groups surface shall present its clone as a read-only tree with a preview pane beside it, every entry annotated from the catalog [[storage-1](storage.md#storage-1)]:

| Annotation | Content |
| --- | --- |
| what it is | the catalog family's description — session manifest, session records, provider hints, intent, intent attachments, authoring session, spec package requests, spec package lock, settings, code remote, installed spec packages, exported skills, sync rules, lease, Git data — or "Not a Spex file" |
| sharing | "Shared" (tracked and committed), "Not yet shared" (a tracked kind, uncommitted), "Stays here" (ignored), "Git data" |
| size | the file size, or a directory's entry count |
| owner | the session's title, or the intent's title, where the family belongs to one |

- `.git` is one closed entry that never opens; a session's files group under one node titled by the session, which offers Open session [[run-view-68](run-view.md#run-view-68)];
- the tree offers no rename, edit, move or delete;
- the tree is one ARIA tree with a single focus stop, arrow keys moving and disclosing ([DR-010](../decisions/010-interface-craft.md) §6).

#### space-24

When an entry is selected in the tree, the preview pane shall show it by type:

| Type | Preview |
| --- | --- |
| JSON, YAML | the text, JSON pretty-printed, in a monospace box scrolling inside itself |
| Markdown | rendered as the transcript renders Markdown, horizontal overflow contained |
| JSONL | one record per line with the record count; a session's records add "reads better as a conversation" with Open session |
| provider hints | withheld: "May hold provider tokens — not shown" |
| other text over 256 KB | the first 2,000 lines, saying so |
| binary | "binary file" with its size |
| directory | its annotation and counts |

#### space-25

While the Explore tab is shown, the Groups surface shall present a "Stays on this device" panel listing every ignored family of the catalog [[storage-1](storage.md#storage-1)] with one plain reason each:

| Family | Reason |
| --- | --- |
| provider hints | resume tokens for this machine's agent conversations; they work nowhere else |
| leases and locks | which process is writing right now |
| installed spec packages and exported skills | copies installed from the lock; every device installs its own |
| where projects live | where your working folders are on this machine, in the home file |
| preferences | where you last stopped reading in each session |
| credentials | this device's sign-in to the Git host |
| migration receipts and inputs | original files kept from an upgrade |
| temporary files | copies made while writing |

- the panel collapses and remembers its state as chrome preference ([DR-030](../decisions/030-workspace-chrome.md)).

#### space-26

When the user activates a reveal control — beside a spex repository's row, or in the preview pane for its entry — the surface shall reveal that path in the OS file manager through the native bridge where it exists [[app-shell-28](app-shell.md#app-shell-28)], and where the bridge is absent shall offer Copy path instead, acknowledging the copy in words ([DR-010](../decisions/010-interface-craft.md) §3):

- the reveal control reads "Show in Finder" on macOS and "Show in folder" elsewhere;
- where the page has no clipboard access, Copy path falls back to a selectable read-only field holding the path.

### Copy and Fit

#### space-27

User-facing copy on the surface shall say "mine" and "the host's", or "this device" and "<host's display name>", for a sync's sides and plain step names, never `ours`, `theirs`, `HEAD`, `origin/spex`, `MERGE_HEAD` or a Git command as primary copy — the raw term surviving in a tooltip ([DR-010](../decisions/010-interface-craft.md) §2) — and shall say "spex repository" and "group" for the host's things and never "namespace", "remote" or "space".

#### space-28

The Groups surface shall fit its pane at every width down to the 320-pixel floor ([DR-041](../decisions/041-chrome-that-fits.md)):

- below 42rem the header's at-a-glance words yield — the read time, then the account's host name — and below 20rem the header's fields stack with the primary control last and full-width;
- in each repository row and change row the label owns the slack and truncates with its title, the code remote and detail hiding below 28rem, the row's control keeping its accessible name;
- the tree and preview stand side by side from 42rem and stack below it, the preview under the tree; the preview's box scrolls inside itself and the diff box scrolls sideways as a canvas;
- every control reads at most 14 characters, its busy form included: Sign in, Sign in again, Signing in…, Sign out, Signing out…, Sync, Syncing…, Check host, Checking…, Stop, Join, Joining…, Pick a group, Members, Retry, Retrying…, Apply, Applying…, Cancel, Continue, Save, Saving…, Add project, Adding…, Choose folder…, Don't add, Open folder…, Open project, View diff, Hide diff, Keep mine, Take host's, All mine, All host's, Open session, Show in Finder, Show in folder, Copy path, Refresh, Dismiss, New group, New subgroup, Share, Create, Creating…, Add, Rename, Delete, Deleting…, Keep, Move…, Moving…, "Move…" bearing "Move to another group" as its title and accessible name;
- the surface scrolls inside its own box and the page never scrolls.

## Internal Behavior

### Protocol

#### space-29

The core shall expose Groups through these commands and one message, each reply validated against the command schema, `repository` naming a spex repository by its key:

| Command | Input | Result | Errors |
| --- | --- | --- | --- |
| `space.get` | — | `GroupsState` [[space-30](#space-30)] | — |
| `space.refresh` | — | `{ accepted: true }` | `invalid_request` (signed out) |
| `space.signin.start` | — | `{ flow: "browser", url } \| { flow: "device", userCode, verificationUri, expiresAt }` | `busy` (a sign-in in flight) |
| `space.signin.cancel` | — | `{ stopped: boolean }` | — |
| `space.signout` | — | `GroupsState` | `conflict` (the stored sign-in changed meanwhile [[git-host-10](git-host.md#git-host-10)]) |
| `space.pick` | `{ repository, choice: { kind: "join", hostId } \| { kind: "create", groupId: string \| null, name }, noticed?: boolean }` — `name` without its `-spex` suffix, which the core appends; `groupId` a group's host id, null for your own group | `{ accepted: true }` after the creation or the join is accepted at the host, the push following as state | `invalid_request` (not local only; malformed name; the name taken at the host; a group, or a repository in a group, held as colliding [[space-61](#space-61)], with that cause; the notice not seen for a join into a repository with other members [[space-57](#space-57)]), `not_found` (a spex repository, or a group of the instance, the view does not list — your own group's id among them [[git-host-6](git-host.md#git-host-6)]), `conflict` (a remote set meanwhile [[space-21](#space-21)]) |
| `space.join` | `{ hostId, folder?: string }` | `{ accepted: true }` | `invalid_request` (already here) |
| `space.members` | `{ group?: string, repository?: string }` — exactly one of `group`, a host id, and `repository`, a key | `{ members: Member[] }` | `invalid_request` (local only; signed out; neither or both targets), `not_found` (a group or spex repository the view does not list) |
| `space.group.create` | `{ name, path, parent: string \| null }` — `path` the group's own path segment, `parent` a group's host id | `{ group: { id, fullPath, name } }` after the host answered and the state listing the group was broadcast [[git-host-15](git-host.md#git-host-15)] | `invalid_request` (signed out; a blank name or path; the name taken there; the host refused, with its words), `not_found` (a parent the view does not list) |
| `space.group.rename` | `{ group, name?, path? }` — `group` a group's host id, `path` its own path segment | `{ group: { id, fullPath, name } }` after the host answered and the state holding the group renamed was broadcast [[git-host-18](git-host.md#git-host-18)] | `invalid_request` (signed out; neither a name nor a path; a blank name or path; the path taken there; the host refused, with its words; the host could not be reached), `not_found` (a group of the instance the view does not list; the host found none, with its words) |
| `space.group.delete` | `{ group }` — a group's host id | `{ deleted: true }` after the host answered and the state without the group was broadcast [[git-host-19](git-host.md#git-host-19)] | `invalid_request` (signed out; a spex repository or a group the view lists under it; the host refused, with its words; the host could not be reached), `not_found` (a group of the instance the view does not list; the host found none, with its words) |
| `space.repository.move` | `{ repository, groupId: string \| null }` — `groupId` a group's host id, null for your own group | `{ repository: { id, fullPath } }`, `fullPath` its path in the instance after the move, after the host answered and the state holding it in its new group was broadcast [[git-host-20](git-host.md#git-host-20)] | `invalid_request` (signed out; local only; a group held as colliding [[space-61](#space-61)], with that cause; the name taken in that group; the host refused, with its words; the host could not be reached), `not_found` (a spex repository or a group the view does not list; the host found none, with its words) |
| `space.share` | `{ group?: string, repository?: string, login, role }` — exactly one of `group`, a host id, and `repository`, a key | `{ members: Member[] }` as the host lists them after the addition [[git-host-16](git-host.md#git-host-16)] | `invalid_request` (signed out; neither or both targets; a blank login; a role not among the view's; the host refused, with its words), `not_found` (no account under the login, with the host's words; a group or spex repository the view does not list) |
| `space.unshare` | `{ group?: string, repository?: string, login }` — exactly one of `group` and `repository` | `{ members: Member[] }` as the host lists them after the removal [[git-host-17](git-host.md#git-host-17)] | `invalid_request` (signed out; neither or both targets; a blank login; the host refused, with its words), `not_found` (no account or no membership of its own under the login, with the host's words; a group or spex repository the view does not list) |
| `space.remote.set` | `{ repository, url: string \| null }` | `GroupsState` | `invalid_request` (no Git; not initialized; a malformed, credential-bearing or host-origin URL [[space-5](#space-5)]), `conflict` (the clone's remote changed meanwhile [[space-21](#space-21)]) |
| `space.fetch` | `{ repository }` | `{ accepted: true }` | `invalid_request` (local only) |
| `space.sync` | `{ repository, choices?: Record<unit, "mine" \| "remote">, join?: boolean, noticed?: boolean }` | `{ accepted: true }` | `invalid_request` (local only, merge pending, blocking diagnostic [[space-11](#space-11)]; unknown unit; a choice for a unit that is not a conflict; the notice not seen [[space-57](#space-57)]) |
| `space.cancel` | `{ repository }` | `{ stopped: boolean }` | — |
| `space.diff` | `{ repository, unit, path, side: "mine" \| "remote" }` | `{ patch: string, truncated: boolean }` | `invalid_request` (a session, intent or authoring unit; unknown unit or path; no check yet for a remote side) |
| `space.tree` | `{ repository, path?: string }` | `{ path: string, entries: SpaceEntry[] }` | `invalid_request` (path escaping the clone), `not_found` |
| `space.read` | `{ repository, path: string }` | `{ kind: "text", text, lines, truncated } \| { kind: "withheld", reason } \| { kind: "binary", size }` | `invalid_request` (outside the clone, a symlink, `.git`, not a file), `not_found` |
| `space.repair.decline` | `{ repair: string, declined: boolean }` | `GroupsState` | `invalid_request` (no repair of that name stands) |

- the device flow's `verificationUri` is the verification URL the host completed with the user code where it gave one [[git-host-3](git-host.md#git-host-3)], and `userCode` is carried for clients and tests, never shown by the surface [[space-3](#space-3)];
- `space.state { state: GroupsState }` is broadcast to every client on each transition of any repository's machine [[space-31](#space-31)], on a sign-in's start and end, and after a host read; long commands reply `accepted` at once and their outcome is state, never a hung reply ([DR-010](../decisions/010-interface-craft.md) §5);
- the interface re-pulls `space.get` when the surface mounts, on window focus, and — debounced — on `session.state`, `session.removed`, `intents.changed` and `config.state` while the surface is shown.

#### space-30

The core shall shape `GroupsState` as:

```ts
interface GroupsState {
  home: string;
  git: { ok: true; version: string } | { ok: false; guidance: string };
  host: { url: string; displayName: string | null };
  account: { id: string; login: string; displayName: string | null; canCreateGroup: boolean } | null;   // canCreateGroup: as the host's last read said, false until one is held
  signIn: { phase: "idle"; signedOut?: { by: "host"; login: string } }   // signedOut: the host signed this device out, for the core's run
    | { phase: "running"; flow: "browser" | "device"; userCode?: string; verificationUri?: string; since: number }
    | { phase: "failed"; cause: "denied" | "expired" | "refused" | "unreachable"; message: string };
  readAt: number | null;
  groups: { id: string | null; fullPath: string; name: string; own: boolean;   // id: the host's, null for another account's login and a key's group no read lists; fullPath: the path in the instance, your own group's folder name, or that login
            can: { createSubgroup: boolean; manageMembers: boolean; rename: boolean; delete: boolean };   // what the host's last read said the person may do there; all false until one is held
            repositories: RepositoryState[] }[];   // one entry per group by its id, your own once, one per other account's login (space-1)
  roles: { id: string; name: string; mayPush: boolean }[];   // the host's own roles in its order, empty until a read is held
  diagnostics: { file: string; reason: string; blocking: boolean; repair?: Repair }[];
  issues: number;
  // Repair: { kind: "repository" | "folder"; repository?: string; name?: string; group?: string;
  //   directories: string[]; sessions: number; key: string; declined?: number;
  //   checked?: { path, here, repo, claimedBy?, unknown? }[];
  //   proposal?: { path: string; from: "recorded" | "beside-projects" } }
}
interface RepositoryState {
  key: string;                           // the clone's path under workspace/; for a row the host lists in a group held as colliding, `<path>@<id>`, naming no clone (space-61)
  name: string; id: string | null; own: boolean; code: string | null; folder: string | null;
  remote: string | null;                 // the clone's origin URL, one under the host's Git origin as the repository's path in the instance (space-15); null while local only
  state: "local-only" | "reachable" | "read-only" | "unreachable" | "absent";
  reason: string | null;                 // the host's words for read-only or unreachable
  waiting: { step: "create" | "branch"; group: string; message: string } | null;
  members: number | null; visibility: string | null;
  can: { manageMembers: boolean; transfer: boolean };   // what the host's last read said the person may do on it — manage its members, move it to another group; both false until one is held
  branch: { ahead: number | null; behind: number | null; checkedAt: number | null;
            hostEmpty: boolean; unrelated: boolean; mergePending: boolean;
            agreed: { at: number; current: boolean } | null } | null;   // null where no clone is here; agreed: the commit `spex` last shared with the host's `spex` as the clone last fetched or pushed it — its commit time, and whether `spex` is that commit; null where the clone holds none (space-61)
  local: SpaceUnit[]; incoming: SpaceUnit[]; conflicts: SpaceConflict[];
  lastSync: { at: number; sent: number; received: number } | null;
  noticed: boolean;
  sync:
    | { phase: "idle" }
    | { phase: "running"; op: "sync" | "check" | "join" | "move"; step: SyncStep; since: number; cancelable: boolean }
    | { phase: "choices"; savedCommit: string | null }
    | { phase: "unrelated" }
    | { phase: "stopped"; op: "sync" | "check" | "join" | "move"; step: SyncStep; cause: SyncCause; message: string; guidance: string; retry: boolean }
    | { phase: "done"; at: number; sent: number; received: number; pushed: boolean };
}
type SyncStep = "save" | "check" | "compare" | "apply" | "refresh" | "push" | "code";   // code: a join's code clone
type SyncCause = "unreachable" | "reauth" | "refused" | "gone" | "timeout" | "stopped" | "rejected"
  | "validation" | "lease" | "writer" | "unrelated" | "git";
interface SpaceUnit {
  unit: string;   // "sessions/<id>" | "intents/<id>" | "authoring/<id>" | "environment" | "config/playbook.config.yaml" | "project.json" | ".gitignore" | path
  kind: "session" | "intent" | "authoring" | "environment" | "settings" | "code" | "rules" | "other";
  label: string; detail?: string; change: "new" | "updated" | "deleted";
  sessionId?: string; intentId?: string; paths: string[]; diff: boolean;
}
interface SpaceConflict { unit: SpaceUnit; mine: SpaceSide; remote: SpaceSide }
interface SpaceSide { change: "new" | "updated" | "deleted"; at?: number; detail?: string; diff: boolean }
interface SpaceEntry {
  name: string; path: string; kind: "file" | "dir" | "git"; family: string;
  sync: "shared" | "pending" | "local" | "git"; size?: number; count?: number; mtime?: number;
  owner?: { sessionId?: string; intentId?: string; title?: string };
  preview: "text" | "withheld" | "binary" | "none";
}
interface Member { id: string; login: string; displayName: string | null; role: string; direct: boolean; via: string | null }   // via: the path in the instance of the group the membership comes through, null where direct
```

### Sync Machine

#### space-31

The core shall run every operation of one spex repository on one state machine per clone, one operation per clone at a time — a second joining or following it [[space-21](#space-21)] — and any number of clones at once:

```text
idle ─sync/join→ save ─→ check ─→ compare ─→ apply ─→ refresh ─→ push ─→ done ─→ idle
idle ─sync/join, repair marker standing→ repair ─→ save;  repair: lease | authoring turn | failure | blocking issue → stopped
idle ─fetch→ check ─→ idle
save: ignored path staged | validation | commit error → stopped
check: host refused | reauth | gone | transport | timeout | Stop → stopped;  move: destination taken | lease | changed meanwhile → stopped;  host empty → push
compare: conflict without choice → choices;  no ancestor and not a join → unrelated;  nothing incoming → push
apply: a written unit changed since Save (first) → save;  validation | lease | authoring turn | moved | changed twice → stopped
push: rejected (first) → check;  rejected twice | refused | transport | timeout | Stop → stopped;  read-only → done
choices ─sync with choices→ save;  unrelated ─sync with join→ save;  stopped ─Dismiss or next→ idle
```

- one full rescan of the clone runs as `refresh`;
- `check` makes a host rename's move [[space-60](#space-60)]; `apply` handles its unit-write refusals [[space-19](#space-19)];
- before the first file is replaced, `apply` records the plan's revisions, ancestor and choices in an ignored `<clone>/.spex-apply.json` and removes it after the ref update lands or a changed unit refuses its write [[space-19](#space-19)]; a marker left standing is finished by the repair [[space-67](#space-67)];
- `sync:<repository>:last` persists in the preferences [[storage-5](storage.md#storage-5)]; the sync's transient state persists nowhere;
- a row read while an operation runs reads the clone at that instant, keeping that operation's own lists.

#### space-32

The core shall invoke Git as a child process per step, never through a shell, from the clone, with this environment and these commands:

- environment: the core's captured environment plus `GIT_TERMINAL_PROMPT=0`, `LC_ALL=C`, `LANG=C`, and `GIT_SSH_COMMAND=ssh -oBatchMode=yes` only where none is set; for a transport to the Git host's origin, `-c credential.helper=` naming the app's own helper and the brokered credential it reads [[git-host-9](git-host.md#git-host-9)], and for any other origin the device's own credential helpers; `process.umask(0o077)` around a new clone's `init` and its commits, which run synchronously, restored after; a join's `clone` and `checkout` children each spawned under `0o077`, the core's own umask restored before it awaits them; a 120-second limit on `ls-remote`, `fetch`, `clone` and `push` after which the child receives `SIGTERM`, then `SIGKILL` after five seconds;
- commit-writing commands carry `-c commit.gpgsign=false -c core.hooksPath=/dev/null`, and `-c user.name=<display name or login> -c user.email=<login>@users.noreply.<host>` where signed in, else `-c user.name=Spex -c user.email=spex@<hostname>` only where `git var GIT_COMMITTER_IDENT` fails;
- state: `--version`, `rev-parse --show-toplevel`, `rev-parse --git-dir`, `symbolic-ref -q --short HEAD`, `rev-parse -q --verify HEAD^{commit}`, `rev-parse -q --verify MERGE_HEAD`, `remote get-url origin`, `config --get spex.repositoryId`, `config --get branch.spex.remote`, `rev-parse -q --verify refs/remotes/origin/spex^{commit}`, `rev-list --left-right --count HEAD...refs/remotes/origin/spex`, `rev-list --count HEAD` where the host holds no `spex`, `status --porcelain=v1 -z -uall`, for the last sync a clone holds `merge-base <spex> <origin/spex>` and `log -1 --no-show-signature --format=%ct <commit>` [[space-61](#space-61)], and for a sign-in's join `log --no-show-signature -n <saves+2> --format=%H %s HEAD` to tell a clone holding nothing of its own [[space-59](#space-59)];
- initialize and the remote: `init -q -b spex`, falling back to `init -q` then `symbolic-ref HEAD refs/heads/spex`; `clone -q --branch spex --single-branch <url> <clone>` for a join, falling back to a clone of the default branch followed by `checkout -q -b spex` where the host holds no `spex` yet; `remote add origin <url>`, `remote set-url origin <url>`, `config spex.repositoryId <id>`, `config spex.created <id>` for a repository the core created [[git-host-7](git-host.md#git-host-7)], `config --remove-section remote.origin` to take the remote away, and for another repository's remote [[space-5](#space-5)] `config --unset spex.repositoryId` where the reader names it, `update-ref -d refs/remotes/origin/spex` and `config --unset branch.spex.remote`;
- save: the managed-rules writer, `add -A -- .`, `diff --cached --name-only -z`, `write-tree` and `rev-parse HEAD` before validation, `read-tree <tree>` and `checkout-index -a -f --prefix=<private copy>/` under a temporary `GIT_INDEX_FILE`, `rev-parse <that HEAD>^{tree}`, `commit-tree <tree> -p <that HEAD> -m <message>`, `update-ref refs/heads/spex <commit> <that HEAD>`, `reset -q` on refusal; and for every version check, `hash-object --stdin-paths` over a unit's files;
- check: `ls-remote --exit-code --heads origin refs/heads/spex` (exit 2 means no `spex`), `fetch -q --no-tags origin +refs/heads/spex:refs/remotes/origin/spex`, `merge-base HEAD origin/spex`; `config --get spex.created`, and `config --unset spex.created` where the clone records a creation [[git-host-7](git-host.md#git-host-7)]; for a default branch the core pushes itself [[git-host-7](git-host.md#git-host-7)], `hash-object -w --stdin` on the README, `mktree`, `commit-tree <tree> -m "Initial commit"` and `push -q origin <commit>:refs/heads/main`;
- plan: `ls-tree -rz --full-tree <rev>` per revision, and for the working tree `add -A -- .` then `write-tree` under a temporary `GIT_INDEX_FILE`;
- labels and diffs: `cat-file blob <oid>` per described file, `log -1 --format=%ct <rev> -- <paths>` for a side's change time, `diff --no-color <ancestor> <side> -- <path>` for `space.diff`;
- apply: under a temporary `GIT_INDEX_FILE`, `read-tree HEAD`, `update-index -z --index-info` setting or removing each path of a unit taken from the host and `write-tree`, then that tree checked out into a private copy as at Save; `cat-file blob <oid>` per file of a unit written; `read-tree <tree>` and `update-index -q --refresh` on the clone's index; `merge-base --is-ancestor HEAD origin/spex` with `rev-parse origin/spex^{tree}`, `commit-tree <tree> -p HEAD -p origin/spex -m <message>` or none on a fast-forward, `update-ref refs/heads/spex <commit> <old HEAD>`;
- push: `push -q origin spex`, `push -q -u origin spex` where no upstream is set;
- stderr classification under `LC_ALL=C`: "Could not resolve host", "Connection refused", "Network is unreachable" → unreachable; "Authentication failed", "could not read Username", "terminal prompts disabled", "Host key verification failed" → reauth; "Permission denied", "protected branch", "pre-receive hook declined", "You are not allowed" → refused; "Repository not found", "does not appear to be a git repository" → gone; "[rejected]" with "fetch first" or "non-fast-forward" → rejected; a killed child → timeout or stopped; anything else → `git` with the last lines, or, where Git printed an HTTP status on a transport to the host's origin, the host's error with that status [[space-15](#space-15)]; the last lines and the host's `remote:` words read per space-15's rule for URLs under the host's Git origin before any report carries them.

#### space-33

The core shall compute one three-way plan per read or sync of a clone — this device's tree, the host's `spex`, and their common ancestor — over every tracked path, grouping paths into units and classifying each unit by complete bytes and existence under the selection rule [[storage-11](storage.md#storage-11)]:

| Side | Tree |
| --- | --- |
| mine | the working tree for the lists of [[space-7](#space-7)] and [[space-8](#space-8)]; `HEAD` inside a sync |
| remote | `origin/spex`; `HEAD` itself before any check, and the empty tree where the host holds no `spex` |
| ancestor | `merge-base(HEAD, origin/spex)`; `HEAD` before any check; the empty tree for a join; the plan withheld for unrelated histories without one |

- units: `sessions/<uuid>.json` with `sessions/<uuid>.records.jsonl` and `sessions/<uuid>.assets/`, `intents/<uuid>.json` with `intents/<uuid>.assets/`, `authoring/<uuid>.json` with its records and assets, `spex.yaml` with `spex.lock` wherever a clone holds them [[storage-1](storage.md#storage-1)], and each other tracked path alone; a bundle unit taken from a side needs every file of it on that side or none;
- a unit is local where mine differs from the ancestor and remote does not, incoming where remote differs and mine does not, a conflict where both differ from the ancestor and from each other, and agreed otherwise;
- unknown units, duplicate choices, and choices contrary to a decided unit are refused before any write; the command-line tool keeps its contract [[storage-10](storage.md#storage-10)], sharing this plan, the validator and the application code behind a seam that takes a caller-supplied ancestor and whether the working tree holds the Save commit or Git's merge output.

#### space-34

The core shall derive a unit's label and side summaries from the bytes of the side described, never from the live index alone:

- a session's title is the first `turn_started` prompt of that side's replay, read through the stream fold until it is found; its turn count and last activity come from that side's records;
- an intent's title is its text's trimmed first line, or its attachment names where the text is blank;
- an authoring session's title is its first queued entry's text;
- the environment unit lists which of its two files changed; Settings, Code, Sync rules and Other carry no detail beyond the change and time.

### Explorer

#### space-35

The core shall build each `space.tree` level by reading one directory of the clone without following symlinks, confined to the clone's real path, reporting `.git` as one closed entry never read, mapping each path to its family and sharing mark by `ls-files`, `check-ignore` and `status`:

| Path | Family |
| --- | --- |
| `sessions/<uuid>.json` / `.records.jsonl` / `.hints.json` / `.assets/` | session manifest / session records / provider hints / session attachments |
| `.lock*`, `sessions/.<uuid>.lock*`, `.spex-apply.json` | lease; sync repair marker |
| `intents/<uuid>.json`, `intents/<uuid>.assets/` | intent; intent attachments |
| `authoring/<uuid>.json` / `.records.jsonl` / `.assets/` | authoring session; its records; its attachments |
| `spex.yaml`, `spex.lock`, `packages/`, `skills/` | spec package requests; spec package lock; installed spec packages; exported skills |
| `config/playbook.config.yaml`; `*.bak*`, `*.backup*` | Settings; config backup |
| `project.json` | code remote |
| `.gitignore`, `.gitattributes` | sync rules |
| `*.tmp` | temporary write |
| other | Not a Spex file |

- a path in an ignored family of the catalog is marked ignored whatever Git reports [[storage-1](storage.md#storage-1)];
- `space.read` refuses a path resolving outside the clone or through a symlink, withholds provider hints, and caps text at 256 KB or 2,000 lines on complete lines.

## Verification

### Core Coverage

#### space-37

When an integration suite starts a real core with substitute agents on a scratch home against the stand-in Git host with an isolated Git configuration, it shall drive sign-in, the first push and the account's set-up over the protocol and assert:

- `space.get` reads not signed in with your own group alone under this device's user name, and reads the `git` guidance on a `PATH` without `git` [[space-1](#space-1)] [[space-3](#space-3)];
- a working folder added while signed out pairs with a local-only spex repository under your own group [[space-61](#space-61)];
- `space.signin.start` in the browser flow returns a loopback URL the suite completes against the stand-in, after which the state carries the account, your own group's folder and clone bear the login, every pair naming it is rewritten, and your own group's spex repository stands on the stand-in with its clone pushed [[space-4](#space-4)] [[space-59](#space-59)] [[space-65](#space-65)], no state from the sign-in to that push reading it unreachable [[space-61](#space-61)];
- `space.signin.start` in the device flow returns a verification URL carrying the user code, which the suite approves at the stand-in, with the same outcome; a denied code ends the sign-in `failed` with `denied` [[space-3](#space-3)] [[space-29](#space-29)];
- `space.pick` with a group creates `<name>-spex` there, pushes `spex`, and the row turns reachable with its last sync, no state from the pick to that push reading it unreachable [[space-61](#space-61)]; one naming your own group's id is refused `not_found` [[space-29](#space-29)]; a taken name is refused in place; a stand-in refusal leaves the repository local only with its waiting phrase, and a later Refresh after the stand-in grants finds it created [[space-58](#space-58)] [[space-64](#space-64)];
- the first `space.sync` into a repository the stand-in lists with other members is refused until `noticed`, then pushes and records `sync:<repository>:last` and the notice [[space-57](#space-57)] [[space-12](#space-12)] [[space-22](#space-22)];
- with the stand-in failing every members route, a pick joining a repository whose only member is the account, and the first `space.sync` into another, are each refused until `noticed` [[space-57](#space-57)];
- `space.join` with a folder, while the suite holds the code's clone, reads the row not on this device with the join running at its Code step and no Stop and the folder without the code, then, the clone released, reachable with the code in the folder and the folder paired, no reading before it reachable [[space-63](#space-63)] [[space-61](#space-61)];
- a core restarted on that home reads the same account, no read time but the same last sync, and that `space.get` begins a read whose state lands with a read time [[space-1](#space-1)];
- a core restarted on a signed-in home whose own group's clone holds its pushed `spex` with no `sync:<repository>:last` recorded reads that row with no last sync but its `branch.agreed` current at `spex`'s commit time, then, after a commit on `spex` alone, not current at the same time, while a project's clone the host's `spex` never reached carries none [[space-61](#space-61)] [[space-30](#space-30)];
- every long command replies `accepted` before its outcome lands as `space.state`, and each reply and broadcast carries the `GroupsState` fields and phases [[space-29](#space-29)] [[space-30](#space-30)];
- a running compile and a session under a management lease taken out of band each leave the spex repository's `space.sync` to complete [[space-11](#space-11)] [[space-21](#space-21)];
- while a check runs against a transport that sleeps, a turn, a viewed marker, an intent, a pairing and a settings edit beneath that clone all land, a second `space.sync` and a `space.fetch` reply `accepted`, joining it, `space.cancel` returns the machine to `stopped` with the Save commit kept, and the sleeping child is gone [[space-21](#space-21)] [[space-47](#space-47)] [[space-16](#space-16)] [[space-32](#space-32)];
- a `space.sync` asked while a check stands held inside Git replies `accepted` and makes no Save commit until that check ends, then saves and completes [[space-21](#space-21)];
- a sync of a repository the stand-in renamed stops at Check naming the session, the clone, its pair and its sessions where they were, while a session beneath the clone stands under a lease taken out of band — one with its records and one standing only as its lease file — or under a lease naming another machine, and moves the clone once that lease is released, while a lease left by a dead process of this machine moves with it [[space-60](#space-60)] [[space-15](#space-15)];
- a sign-in on a second scratch home whose own group's clone holds only the set-up commits, while the stand-in already holds `<login>-spex` with another environment and configuration, ends with the host's environment and configuration in the clone and no choice asked, while one whose clone holds a session of its own ends in choices needed [[space-59](#space-59)] [[space-13](#space-13)];
- a sign-in while a session beneath a clone of your own group stands under a lease taken out of band moves none of that group's clones, every pair and session where it was, and a Refresh after the release moves them all [[space-59](#space-59)] [[space-4](#space-4)];
- a stand-in rename onto a folder already standing stops the sync at Check naming that folder, the clone and the folder unchanged; a sign-in whose destination for a clone of your own group is taken moves no clone, and a Refresh once that folder is gone moves them all [[space-60](#space-60)] [[space-59](#space-59)];
- where the scratch filesystem folds case, a stand-in rename changing only the repository name's case completes with the clone listed under the new spelling and its pair re-keyed, and one changing only its group's case stops the sync with the clone, `home.yaml`, the project list and the session list unchanged [[space-60](#space-60)]; one changing its group's case and its name, and one moving it into a nested group whose folder stands under another case spelling, each stop the same way with nothing landed under the disk's spelling [[space-60](#space-60)]; a sign-in while an unrelated folder stands under another case spelling of the login moves no clone, every pair and session where it was [[space-59](#space-59)];
- a remote set from a terminal while `space.remote.set`, a pick or a Check step awaited its own read leaves the terminal's remote alone in the clone's configuration, the command refused `conflict` or the step stopped as changed meanwhile [[space-21](#space-21)] [[space-60](#space-60)];
- a remote set through `space.remote.set` while a sync's Check step awaits the stand-in's read of a repository it renamed stops that sync as changed meanwhile, the clone not moved and the new remote standing [[space-60](#space-60)];
- a sign-in moves your own group's folder while a read of it stands held, an intent naming the old key is refused without recreating the former folder, and the held read ends recreating nothing [[space-59](#space-59)];
- a Save held after its own read of `HEAD` resumes, once its clone was removed, recreating nothing, and once a sign-in moved its clone under your own group's folder, saving and syncing the clone where it lies with the former folder not made again [[space-21](#space-21)] [[space-12](#space-12)];
- a second join of one repository, admitted while the first's clone stands held, publishes its clone; the first, released, finds the place taken and leaves that clone and every file written into it as they stand, and no private folder of either remains [[space-63](#space-63)];
- a join whose clone child stands held runs that child under umask `0077` while the core's own umask stays `022`, before and after the child is released, and the folders and pack that child wrote keep no group or other permission once published [[space-32](#space-32)];
- `space.signout` revokes the device at the stand-in, every repository turns local only or unreachable with nothing deleted, and a later sign-in finds them reachable again [[space-6](#space-6)] [[space-61](#space-61)];
- with a bare remote holding another clone's rewrite of an authoring session's transcript, a sync whose host side is chosen for that session while this core's turn appends to it stops naming the session, the transcript left as it was and the turn's records landing in one unbroken sequence, and a Retry while that turn still runs stops again with the repair marker standing and the transcript unchanged [[space-67](#space-67)]; once the turn has ended and the transcript records an unfinished turn of this device, a fresh comparison asks the choice again and the host's side then chosen applies whole [[space-19](#space-19)];
- a `MERGE_HEAD` planted in a clone reads as a pending merge and refuses its sync [[space-11](#space-11)];
- a damaged session file standing as a blocking diagnostic in one clone refuses that clone's sync naming the file and admits another clone's whose path is a string prefix of the first's [[space-11](#space-11)].

#### space-38

When an integration suite runs two real cores on two scratch homes sharing one stand-in Git host, both signed in as members of one group, it shall assert the sync loop of one spex repository:

- the second home's Join of the project clones the spex repository and the code, pairs them, and lists the first home's session with its history served and the ledger announced [[space-63](#space-63)] [[space-20](#space-20)];
- a project intent added on each home lists on the other after a sync with no choice asked, the newer queue reading the older first [[space-12](#space-12)] [[space-33](#space-33)];
- both homes editing the same intent, and both changing the same session, each yield one conflict whose host choice replaces the unit whole, clears the planted hints file and the `viewed:` marker, and publishes history-replaced before the summary; a delete-versus-modify row deletes the unit when the deleting side is chosen [[space-17](#space-17)] [[space-19](#space-19)] [[space-20](#space-20)];
- the configuration changed differently on both sides is one Settings conflict and no conflict marker or `MERGE_HEAD` ever appears in either clone [[space-19](#space-19)] [[space-33](#space-33)];
- a chosen unit that fails validation stops at Apply naming the file with every clone file byte-identical to before [[space-15](#space-15)];
- an incoming intent changed on this device after Save is refused at its write with the change kept and no merge commit, the sync restarting once from Save into a choice for it; with the host's side chosen and the intent changed again before each of two writes the sync stops, and Retry with that choice takes the host's unit whole [[space-19](#space-19)] [[space-15](#space-15)] [[space-31](#space-31)];
- a push rejected because the peer advanced after the check re-checks once and succeeds; advanced again, it stops "changed again" with the merge kept and `ahead` reported [[space-15](#space-15)];
- a fast-forward sync leaves `spex` equal to the host's with no merge commit, clears the hints of its changed session, and, under process umask `022`, leaves no `sessions/` entry wider than `0600` [[space-19](#space-19)] [[space-20](#space-20)];
- a marker planted with a half-written selection is repaired at startup into the recorded commit before `space.get` answers, a marker left standing after its merge landed is cleared with nothing re-applied, a marker whose file was changed since by another hand is removed with that change kept and no merge commit, the next sync saving the change and asking a choice for it, and a marker whose merge never landed under a `spex` a terminal commit moved on is removed with nothing written; a session the interrupted apply had already written whole loses its hint and viewed marker [[space-67](#space-67)] [[space-19](#space-19)];
- a terminal commit landing while Save validates refuses the Save with that commit and the changed file kept, and a file rewritten after validation stays a local change while the validated bytes are committed [[space-12](#space-12)] [[space-15](#space-15)]; a file another process leaves invalid during an Apply stands as the refresh's finding, admits the next sync whose Save names it, and once the reader repairs it the sync after goes through with the core still running and the finding cleared [[space-20](#space-20)] [[space-11](#space-11)];
- a session another process holds through an Apply that writes only an incoming intent stops nothing; held while the Apply would write it, beside an incoming intent dispatched to that session's newer turn, it stops the sync naming it with no merge commit, the marker kept and the intent not yet written; still held across a restart, the startup repair stands as a blocking issue and a Retry stops naming the session with the marker kept, and after its release the next Retry finishes both units into the recorded merge, which the ledger then lists [[space-19](#space-19)] [[space-15](#space-15)] [[space-67](#space-67)] [[space-20](#space-20)];
- a selection half applied — the host's replay of a session both sides changed landed, its manifest not — whose startup repair a session lease held elsewhere refused, standing as a blocking diagnostic of that session's file, admits the Sync asked once the lease is released, which finishes the recorded merge with the host's manifest and replay and leaves no issue [[space-11](#space-11)] [[space-67](#space-67)];
- two Syncs sent together over a marker a released lease left are both accepted as one operation, with one merge of the recorded sides on the Save commit, the marker gone, and no state broadcast from the first send to that sync's end naming the marker as an issue [[space-67](#space-67)] [[space-21](#space-21)];
- the stand-in renaming the repository moves the clone on the next sync, every pair rewritten and its key changed in the state [[space-60](#space-60)];
- the stand-in archiving the repository turns it read-only with the host's reason, a sync bringing the peer's new session without pushing and the core's new session kept with its mark; the stand-in removing the account's membership turns it unreachable on the next read with the clone intact [[space-61](#space-61)] [[space-15](#space-15)] [[space-50](#space-50)];
- a stand-in whose Git transport answers 401 stops "reauth" and a sleeping one stops "timeout" within a test-shortened limit, each carrying its guidance [[space-15](#space-15)] [[space-32](#space-32)].

#### space-39

When an integration suite writes local changes of every unit kind into a clone, it shall assert the listings and the explorer:

- the local list carries a titled session as new, an intent by its title, an authoring session, "Settings changed" with a diff, "Code remote changed" and "Sync rules updated", in the kinds' order, and in a clone holding `spex.yaml` with `spex.lock` "Spec packages changed" with a diff in its place [[space-7](#space-7)] [[space-34](#space-34)];
- after a peer pushes, `space.fetch` lists the incoming units the same way with conflicts marked and ahead and behind counted, a host without `spex` reads empty, and `space.diff` returns a patch for Settings on each side and refuses a session and an intent unit [[space-8](#space-8)] [[space-10](#space-10)];
- `space.tree` maps every catalog path to its family and sharing mark with session and intent owners, reads an empty directory of a tracked kind as not yet shared, reports `.git` closed, `packages/` as staying here and a stray file as not a Spex file, and neither follows nor lists through a planted symlink; `space.read` pretty-prints JSON, returns YAML, Markdown and JSONL text, cuts a long log on a line, withholds a hints file, and refuses `../` [[space-23](#space-23)] [[space-24](#space-24)] [[space-35](#space-35)].

#### space-51

When an integration suite reports diagnostics on a home holding a clone no pair names and sessions recorded under a directory, it shall assert the repair contract:

- the diagnostics fold to one repair naming the spex repository by its name and group, carrying the recorded directory and the count of sessions there [[space-46](#space-46)];
- a session working directory that is missing or invalid folds into no repair and keeps its own row [[space-46](#space-46)];
- a rebind to a chosen folder, carrying the repair's recorded directories as aliases, pairs the spex repository and lets every session recorded under them continue [[space-47](#space-47)];
- a rebind refused because the folder is inside another working folder, because the folder is another spex repository's, or because that repository's turn is running leaves the repair standing with its reason [[space-47](#space-47)];
- a repair the core reports still counts while it stands drawn, only the reader's act settling it, and declining writes to this device's preferences and to no tracked file [[space-49](#space-49)] [[space-54](#space-54)];
- answering a repair the core does not report is refused [[space-54](#space-54)];
- a recorded directory that is here and a work tree root no pair names is proposed, one that is absent is reported absent and proposed not at all, and no directory outside those the repair names and the shared-parent candidate is examined [[space-53](#space-53)].

#### space-52

When an integration suite reads a working folder's remote carrying a credential, and syncs against a stand-in answering a refusal with words, it shall assert the report:

- a URL carrying a credential in any form is refused before it is written to `project.json` [[space-5](#space-5)];
- the refused sync names only the host's words and Share, claims no role, and offers no act the host did not name [[space-15](#space-15)] [[space-50](#space-50)].

#### space-73

When an integration suite signs a real core in at the stand-in Git host, syncs a project's spex repository created in your own group there, and has the stand-in move that repository into `acme` with its id, it shall assert what each remote change keeps of the clone's sync:

- the remote taken away, the row reads local only with the same id, the clone still holding the pushed `origin/spex` and this device the same recorded last sync [[space-5](#space-5)];
- `space.pick` joining it in `acme` by that id reads, while that pick's sync awaits the stand-in's read, reachable at the new URL [[space-61](#space-61)] with the same id, the same recorded last sync and `branch.agreed` current at the pushed commit, the clone's upstream standing [[space-5](#space-5)], and that sync then moves the clone to `acme/`, still current [[space-60](#space-60)];
- the remote taken away again and a group picked to create another repository, the row reads no last sync and no `branch.agreed`, the record and `origin/spex` gone [[space-5](#space-5)];
- a remote the reader then names clears the last sync, `branch.agreed`, the last check and the id [[space-5](#space-5)].

#### space-74

When an integration suite signs a real core in at the stand-in Git host, whose remote URLs lie under its Git origin, with spex repositories in `acme` and one under another account's login `bob`, it shall assert that the instance alone is named and where each group's rows stand:

- no `space.get` reply, `space.state` broadcast or `space.members` reply holds a string under the stand-in's URL but that URL itself — no Git URL and no page — or one naming `gitlab`, a clone's remote at the stand-in reading as its key [[space-30](#space-30)] [[space-1](#space-1)] [[space-62](#space-62)];
- `bob`'s repository stands under an entry headed `bob` with no id and no abilities; Join clones it under `workspace/bob/`, and once the stand-in stops listing it, it reads "No longer shared with you" with its clone's files untouched [[space-1](#space-1)] [[space-58](#space-58)] [[space-61](#space-61)] [[space-63](#space-63)];
- a group `ada` the stand-in admits at its root beside the login `ada` stands as an entry of its own after your own group, whose rows and clones stay where they were; its repository reads "Unreachable: a group named like your login" with no clone made, and `space.join` of it, a pick creating in that group and a pick joining it are each refused with that cause [[space-1](#space-1)] [[space-61](#space-61)] [[space-29](#space-29)];
- `space.group.create` at the root under a path the stand-in holds an account for is refused as taken [[space-68](#space-68)];
- a repository the stand-in transfers into `acme/research` lists, at a Refresh before any sync, under `acme/research` with its key unchanged, and its next sync moves the clone under that group's folder [[space-1](#space-1)] [[space-60](#space-60)];
- a check, a push and a join against a stand-in transport answering 500 each stop "<display name> answered with an error" with the status and Retry, no part of the Git origin in message or guidance [[space-15](#space-15)] [[space-32](#space-32)];
- a push the stand-in refuses with a `remote:` line carrying the clone's own URL, without `.git` and with a trailing `/`, and another URL under its Git origin reports the first as the repository's path in the instance and the second as the stand-in's display name, and turns the repository read-only with the same words [[space-15](#space-15)] [[space-32](#space-32)] [[space-61](#space-61)].

#### space-79

When an integration suite signs a real core in at the stand-in Git host, whose remote URLs lie under its Git origin, with a project's spex repository synced in `acme`, it shall assert the undo acts over the protocol ([DR-120](../decisions/120-the-instance-is-the-space.md)):

- the state carries what the stand-in lets the person do: rename and delete on each group of the instance and neither on your own group, transfer on a spex repository the person owns and not on one they may only push to [[space-30](#space-30)];
- `space.group.rename` of `acme/research` to a new name and path replies its new path, a state broadcast before the reply listing it so, and a path taken there is refused naming it [[space-29](#space-29)] [[space-1](#space-1)];
- `space.group.delete` of `acme`, which holds the project and a group, is refused with no request reaching the stand-in, and of an empty group created at the root replies, the state no longer listing it [[space-29](#space-29)];
- `space.repository.move` of the project into the renamed group replies its new path, a state broadcast before the reply listing the row under that group with its key unchanged and its clone where it was, and its next sync moves the clone under that group's folder, reachable; a move with no group named does the same into your own group [[space-1](#space-1)] [[space-60](#space-60)] [[space-29](#space-29)];
- a rename, a deletion and a move the stand-in refuses each reply `invalid_request` with the stand-in's words, and one the stand-in answers `provider_unavailable` that it could not be reached, the state unchanged [[space-29](#space-29)];
- no reply or broadcast holds a string under the stand-in's URL but that URL itself, or one naming `gitlab` [[space-30](#space-30)] [[space-1](#space-1)].

### Surface Coverage

#### space-56

Where the Groups surface renders over a home whose issues list holds three unanswered repairs, each proposing its recorded folder, when the reader declines the first, adds the third, lets the core deliver a re-read, activates Refresh, adds the second and then the declined first, the core reporting after each act what then remains, the test suite shall assert through the surface:

- the declined row keeps the first place, reading "not added", and the header's count falls to two issues [[space-55](#space-55)] [[space-49](#space-49)];
- the third row gives way in its own place to an outcome naming the project, the folder it is now a project at and the sessions listed, the header's count reading one issue and the live region "1 issue left." [[space-48](#space-48)];
- focus rests on the second repair's Add project, wrapping past the declined row [[space-48](#space-48)];
- the core's re-read leaves the three rows in their places [[space-48](#space-48)] [[space-55](#space-55)];
- after Refresh the outcome is gone and the declined row stands after the second [[space-48](#space-48)] [[space-55](#space-55)];
- the second's add leaves the live region reading "All issues resolved." and focus on its outcome's Open project, which opens that project [[space-48](#space-48)];
- the declined repair's add leaves both outcomes in their places with the core reporting no diagnostic, focus on the new outcome's Open project, until Refresh closes the list [[space-48](#space-48)].

#### space-70

Where the Groups surface renders over a signed-in home whose host read says the person may create a group, may create a subgroup in a group `acme`, add members to it, rename it and delete it, may do none of these in a group `other` named "Other team", may rename and delete an empty group `empty`, and may add members to the repository `a-spex` and move it but do neither on `b-spex`, with the host's five roles of which Developer upward may push, the test suite shall assert through the surface:

- "New group" stands at the list's head, `acme`'s heading carries "New subgroup" and "Share", `other`'s and your own group's carry neither, and `a-spex`'s members panel carries Share while `b-spex`'s does not [[space-1](#space-1)] [[space-62](#space-62)];
- rendered again over a read that says the person may not create a group, the list's head holds no "New group" but the phrase "Groups are made by the people who run <display name>", in English and in Chinese, with no link and no control, and neither before a read is held [[space-1](#space-1)];
- "New subgroup" opens the inline editor with the fields "Group name" and "Path", the path following the name as "lumen-labs" follows "Lumen Labs" and staying empty for "华芯智造", Create disabled until both hold text, Escape closing it; Create sends `space.group.create` with the name, the path and `acme` as the parent and reads "Creating…" until the reply, a refusal "taken" standing in the editor with the name kept, and a success closing it, the group the core's state carries standing after `acme` with its full path [[space-68](#space-68)];
- Share on `acme` opens the editor with "Login at <host name>", the five roles in the host's order with Developer preselected, Add disabled until a login is typed; Add sends `space.share` naming the group, the login and the role and reads "Adding…", a `not_found` reply standing in the editor with the login kept, and a success closing it and saying "@<login> added as Maintainer" [[space-69](#space-69)];
- Share in `a-spex`'s members panel sends `space.share` naming the repository and lists the members the reply carries [[space-69](#space-69)] [[space-62](#space-62)];
- `acme`'s heading carries "Rename" and no "Delete", `a-spex` standing under it, `empty`'s carries both, `other`'s and your own group's neither, and `a-spex`'s row carries "Move…" named "Move to another group" while `b-spex`'s carries none, nor does your own group's own spex repository's, which the host lets the person move [[space-1](#space-1)];
- "Rename" on `acme` opens the editor holding "acme" and its path, Save disabled until either changes and the path not following the name; Save sends `space.group.rename` naming `acme` with only what changed and reads "Saving…" until the reply, a refusal standing in the editor with the name kept, and a success closing it [[space-76](#space-76)];
- "Delete" on `empty` asks "Delete empty?" with Keep focused, Escape keeping and sending nothing; Delete sends `space.group.delete` naming `empty` and reads "Deleting…" until the reply, a refusal standing beneath the heading with the group kept [[space-77](#space-77)];
- "Move…" on `a-spex` opens the picker with "Your own group · <its full path>" first and then every group but `acme`, `other` as "Other team · other" and `empty` by its name once, an option's accessible name holding the name before the path, Escape closing it; a pick sends `space.repository.move` naming `a-spex` and that group, or none for your own, the control reading "Moving…" until the reply, a refusal standing in the picker, and a success closing it [[space-78](#space-78)];
- every new control reads at most 14 characters at the 320-pixel floor [[space-28](#space-28)].

#### space-66

Where the Groups surface renders over a signed-out home, when the reader signs in through each flow, the test suite shall assert through the surface:

- signed out, the header is the "Not signed in" card with its two sentences and Sign in, showing no home path, Copy path, read time or Refresh, and your own group is headed "Your own group · named after your login at sign-in" with no path, its row reading "On this device only — shared once you sign in" with no control [[space-3](#space-3)] [[space-1](#space-1)];
- in the device flow, the card reads "Continue in your browser:", the link "Open <host name> to sign in" whose href is the verification URL opening a new tab, and "Sign in there and approve; you return here signed in.", with no code shown; Sign in reads "Signing in…" disabled beside Cancel and no row carries a sign-in control [[space-3](#space-3)];
- in the browser flow opened through the bridge, the card reads that the browser is open at the host name with "Open it again" linking to the sign-in URL; where the bridge refused, it reads as the device flow's [[space-3](#space-3)];
- Cancel brings back the two sentences and Sign in; a denial reads the core's cause as one sentence with "Sign in again" [[space-3](#space-3)];
- where the core reports that the host signed this device out, the card reads "<host name> signed this device out. Sign in again to continue as @<login>." before "Until you do, everything stays on this device and nothing is contacted.", with "Sign in again" as its control, in English and in Chinese [[space-3](#space-3)];
- signed in, the header reads "Signed in as @<login> at <host>" with Sign out, the read time with Refresh, and the surface ends in "Spex keeps this device's files in <home>" with the full path in its title and no control [[space-1](#space-1)];
- signed in, your own group is headed "Your own group · <its full path>", a group whose name differs from its full path "<name> · <full path>", and one whose name is its full path by its name once [[space-1](#space-1)];
- signed in, "Pick a group" on a local-only row offers your own group as "Your own group · <its full path>", a group whose name differs from its full path as "<name> · <full path>", and one whose name is its full path by its name once, each option's accessible name holding the name before the path, and a listed spex repository's group reads the same way [[space-58](#space-58)];
- a group's own repository reads "Group records", a project's with no code remote "Code not on a remote", and a local-only one "On this device only" [[space-1](#space-1)] [[space-61](#space-61)];
- a reachable row reads "Synced <age>" from its recorded sync, and with none recorded, from its clone: "Synced <age>" where the clone's `spex` is the host's, "Not synced since <moment>" where it is not, and "Never synced" where the clone holds no host's `spex` [[space-61](#space-61)].

### Browser Journeys

#### space-40

Where the browser journey harness ([DR-039](../decisions/039-browser-acceptance-journeys.md)) boots the served shell on an empty home against a stand-in Git host whose device-flow approvals the harness scripts, the test suite shall assert the first start and the first sign-in through the page alone:

- Groups reads the "Not signed in" card with its two sentences and Sign in as its one primary control, no home path, read time or Refresh, and your own group alone beneath it headed "Your own group · named after your login at sign-in", its row reading "On this device only — shared once you sign in" with no control [[space-1](#space-1)] [[space-3](#space-3)];
- a project added from the palette lists under your own group as "On this device only" with no control [[space-61](#space-61)];
- Sign in shows "Open <host name> to sign in" linking to the verification URL that carries the code, and no code, the control reading "Signing in…" disabled until the harness approves the code the link carries; the header then reads the account and Refresh, your own group bears its login, and the surface ends in the line naming where this device's files are kept [[space-3](#space-3)] [[space-4](#space-4)] [[space-1](#space-1)];
- Pick a group on the project's row offers the stand-in's groups, and picking one turns the row reachable with a sync time, the stand-in holding `<name>-spex` on its `spex` branch [[space-58](#space-58)] [[space-12](#space-12)];
- a session then run from the Captain home appears under the repository's local changes by its title, its Open session control opens its tab, and Sync sends it [[space-7](#space-7)] [[space-12](#space-12)];
- an intent queued while Groups is shown lists under local changes with Refresh never activated, and Refresh's caption reads the time of the read [[space-2](#space-2)].

#### space-41

Where the harness boots the served shell signed in on a home whose spex repository a peer home has pushed to — the peer holding a differing configuration and the same session changed — the test suite shall assert the daily sync with conflicts through the page:

- Check host lists the peer's session and Settings as incoming with the conflict marked and the row reading behind [[space-8](#space-8)];
- Sync ends "Needs your choice" with Apply disabled reading "0 of 2 chosen"; "Take host's" for the session and "Keep mine" for Settings by keyboard enable Apply; Apply's confirm names one replaced unit with Cancel focused, Escape keeps the choices, and confirming ends synced [[space-9](#space-9)] [[space-14](#space-14)] [[space-17](#space-17)] [[space-18](#space-18)];
- the session's tab shows the host's turns and Settings shows this device's configuration [[space-20](#space-20)];
- with the peer's `spex` moved after the check, Sync ends "changed again" with the ahead count on the row, and a second Sync pushes [[space-15](#space-15)];
- Stop during a check against a sleeping transport ends the check with its stopped state and Retry [[space-16](#space-16)];
- Members lists the stand-in's members with their role names and no link [[space-62](#space-62)];
- no visible text on the surface contains `ours`, `theirs`, `HEAD`, `origin/spex`, `namespace` or `space` [[space-27](#space-27)].

#### space-42

Where the harness boots the served shell with the demo project registered and a finished session, the test suite shall assert the exploring journey through the page:

- the Explore tab lists the session's node titled by its first turn with its manifest "Shared", its hints file "Stays here" and its records offering Open session; selecting the manifest previews pretty-printed JSON and selecting the hints file reads withheld [[space-23](#space-23)] [[space-24](#space-24)];
- an empty directory of a tracked kind — `intents/` before any queued intent — reads "Not yet shared", never "Stays here" [[space-23](#space-23)];
- "Stays on this device" names the eight families with their reasons [[space-25](#space-25)];
- the served page offers Copy path beside the repository and no reveal control, and acknowledges the copy [[space-26](#space-26)].

#### space-81

Where the harness boots the served shell signed in at the stand-in host holding in `acme` a project's spex repository a peer pushed with `bob` as its other member, when a folder holding the same code is added and Groups picks that repository on the folder's row, once with the stand-in counting the members and once with it failing every members route, the test suite shall assert through the page in each case:

- the picker lists the repository with its group read as "Acme · acme", and with "2 members" only where the stand-in counted them [[space-58](#space-58)];
- picking it says the notice in the picker beneath it with Cancel focused, and Escape closes the notice alone, the repository still local only and focus back on it [[space-57](#space-57)];
- Continue closes the picker, and the row stands reachable in `acme` with a sync time, its notice recorded, its clone holding the peer's session and agreeing with the stand-in's `spex` [[space-57](#space-57)] [[space-58](#space-58)] [[space-13](#space-13)].

#### space-71

Where the harness boots the served shell signed in at the stand-in host, which by default lets the person create groups, and subgroups in `acme`, and add and remove members there, the test suite shall assert the organizer's journey through the page: a group created at the head and a subgroup under `acme`, each listed with its full path as Create closes its editor [[space-68](#space-68)] [[space-1](#space-1)]; a project added from the palette offered your own group and then every group, each by its name with its path after it where the two differ, and picked into the new subgroup, the stand-in then holding `<name>-spex` there on its `spex` branch [[space-58](#space-58)]; a member added to the subgroup by login at Maintainer, the line "@<login> added as Maintainer" shown and the stand-in's members then listing them [[space-69](#space-69)]; a second addition of the same login refused in place with the stand-in's words, and a login the stand-in knows no account for refused naming it [[space-69](#space-69)]; the new controls fitting at the 320-pixel floor [[space-28](#space-28)]; and the member removed after the confirm, the stand-in's members then not listing them [[space-72](#space-72)].

#### space-75

Where the harness boots the served shell signed in at the stand-in host, whose remote URLs lie under its Git origin, with a project's spex repository synced in `acme` and another account's spex repository listed under `bob`, when the journey shows Groups with that project's members panel open, first in English and then in Chinese, the test suite shall assert that the Groups surface holds no link, and no text, title or accessible name holding a URL under the stand-in's URL or naming `gitlab`, while `bob`'s heading carries no control [[space-1](#space-1)] [[space-62](#space-62)].

#### space-80

Where the harness boots the served shell signed in at the stand-in host, whose remote URLs lie under its Git origin, with a project's spex repository synced in `acme`, the test suite shall assert the undo through the page ([DR-120](../decisions/120-the-instance-is-the-space.md)):

- a group created at the list's head and renamed through its heading's "Rename" stands under its new name and path, and a rename the stand-in refuses stands in the editor with its words and the name kept [[space-76](#space-76)];
- `acme`, holding the project, carries no "Delete", while the new group's "Delete" asks with Keep focused, a deletion the stand-in refuses stands beneath the heading with its words, and a second "Delete" leaves the list and the stand-in without the group [[space-1](#space-1)] [[space-77](#space-77)];
- the project's "Move…" offers "Your own group · <login>" and every group but `acme`, each by its name with its path after it where the two differ; a move the stand-in refuses stands in the picker with its words, and a move into `acme/research` lists the row under it at once with its key unchanged, the row's Sync then moving the clone under `workspace/acme/research/` [[space-78](#space-78)];
- with the editor, the confirm and the picker each open, and in Chinese with the picker open, the surface holds no link and no text, title or accessible name holding a URL under the stand-in's URL or naming `gitlab` [[space-1](#space-1)];
- the new controls fit at the 320-pixel floor [[space-28](#space-28)].

#### space-43

Where the harness boots the served shell signed in with a spex repository carrying local changes of every kind and a check ended in choices, when the journey shows Groups with its Sync tab and Explore tab at the widths 320, 480, 640, 800, 1024 and 1280 pixels, each at 800 and 400 pixels tall, with the sidebar collapsed and, from 480 pixels, open ([DR-041](../decisions/041-chrome-that-fits.md)), the test suite shall assert fit through the page, naming every offending element: the page scrolls in neither direction, no element outside the diff canvas is wider than its box, within every header, group row, repository row, list row and picker row no two visible siblings overlap and every child lies inside its parent, and every control keeps its accessible name at every width [[space-28](#space-28)].

#### space-44

Where the harness boots the served shell signed in with a spex repository whose check ended in choices, when the Groups surface is scanned by axe-core at WCAG 2.1 AA in the light and the dark theme, the test suite shall assert no serious or critical violation, with the picker's radio groups, the tree, the groups list and the tabs named for assistive technology [[space-17](#space-17)] [[space-23](#space-23)] [[space-1](#space-1)].

#### space-36

Where the harness boots the served shell on an empty home against a stand-in holding a group with a project's spex repository a peer pushed — the peer holding a configuration, a titled session and one queued intent — the test suite shall assert the second device's set-up through the page:

- after sign-in the group's row lists the project as "Not on this device" with Join [[space-61](#space-61)];
- Join clones the spex repository and, the code remote being a path the harness serves, the code into the folder the page names, the row reading reachable once the code is in that folder and the project listed in the sidebar with the peer's session and intent [[space-63](#space-63)] [[space-61](#space-61)] [[space-20](#space-20)];
- a session run here and synced lands on the stand-in's `spex` branch beside the peer's [[space-12](#space-12)].
