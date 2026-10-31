<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# space: The Space Surface

## Intent

This package defines the Space surface under [DR-103](../decisions/103-the-home-and-its-groups.md), named Space by [DR-150](../decisions/150-spex-space-product-and-destination.md), with the placements of [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md): where the reader signs in to each instance, sees their groups at each with the spex repositories in each and where their code lives, syncs each spex repository's `spex` branch with every instance it is placed at between Boss turns, places it at another instance or removes it from one, reads each placement's members, repairs a project whose folder is missing on this device, and reads a clone as an annotated tree.
An **instance** is a Git host the home has signed in to, listed in `home.yaml` by its origin with its account, its display name and its sign-out mark, the first it lists, or the origin the home was created with while it lists none, being the home's **default instance** [[storage-2](storage.md#storage-2)] ([DR-127](../decisions/127-a-home-signed-in-to-several-instances.md)); your **namespace** at an instance is where it lists spex repositories under your login there, and another account's where it lists them under theirs.
A **spex repository** holds one project's or one group's records on its `spex` branch and is known by its key, the clone's path under `workspace/` [[storage-1](storage.md#storage-1)], `@<host>/<its path in the instance>` at an instance and `<own>/<name>-spex` in your own group's folder, and its **instance** is the one whose folder its key lies in, else the one the instances migration's receipt names for it, else the one its first placement's remote names [[storage-31](storage.md#storage-31)]; a **placement** of it is a host repository holding it at one instance, or the one remote the reader names, which has no instance, its clone holding each as a remote in the order added [[storage-34](storage.md#storage-34)], the first with an instance being its **key placement**, or **first placement**; the **host** of a placement, a group or a namespace is its instance, and of a sign-in or a command the instance it names; a **unit** is one whole-unit selection subject — a session bundle, an intent with its attachments, an authoring session, a group's own environment's two files, the configuration, `project.json`, or one other tracked file [[storage-11](storage.md#storage-11)]; a **choice** takes a unit whole from this device or from a placement's host; a **local** unit is one this device changed and an **incoming** unit one a placement's copy changed, each against their common ancestor with that placement.
The core performs every Git operation and every call to an instance; the surface renders the core's state and runs neither itself.

## External Behavior

### At a Glance

#### space-1

While the app is connected, the Space surface — reached from the sidebar's Space entry [[run-view-67](run-view.md#run-view-67)] — shall present the home in one header and one groups list holding a heading for each instance the home lists [[storage-2](storage.md#storage-2)] ([DR-127](../decisions/127-a-home-signed-in-to-several-instances.md)):

| Field | Content |
| --- | --- |
| sign-in | while the home lists no instance, the sign-in card [[space-3](#space-3)] |
| refresh | while any instance is signed in, Refresh, which reads every signed-in instance [[git-host-5](git-host.md#git-host-5)] |
| issues | present while any repair or diagnostic stands, reading the count the core carries — the repairs this device's reader has not answered [[space-49](#space-49)] and every diagnostic no repair folds [[core-service-86](core-service.md#core-service-86)] — without a number where that count is none, and opening the issues list in place |
| Git | "Git is not installed" with install guidance, replacing every other field, where no `git` runs |

| An instance's heading, while it is | Carries |
| --- | --- |
| signed in | its display name, its host name until one is read; "Signed in as @<login>", <login> being the account's there, with Sign out [[space-6](#space-6)]; "New group" where its read says the person may create a group there [[space-68](#space-68)], and where it says not, the phrase "Groups are made by the people who run <display name>", with no link and no control, neither before a read is held ([DR-120](../decisions/120-the-instance-is-the-space.md)); the time its last read was held, "Not read yet" until a read since the core started is held — on a signed-in start, the one the first `space.get` begins [[git-host-5](git-host.md#git-host-5)] |
| signed out | its display name as last read, its host name where none was; "Sign in again" [[space-3](#space-3)] and Forget [[space-82](#space-82)] |

- while a full read of any instance, or the surrounding account setup accepted by Refresh, is running, Refresh reads "Reading…" and stays disabled until every such read's actual outcome; a failed read shows the core's sanitized message on its instance's heading, Refresh offering the same ordinary retry even when only local-only rows exist; neither state replaces that instance's last complete view or its time, and one instance's failure leaves every other's view [[git-host-5](git-host.md#git-host-5)];
- the groups list stands beneath the header: your own group first, headed "Only you" beside "named after your login at sign-in" while the home lists no instance and its folder still bears this device's user name [[storage-2](storage.md#storage-2)], as `own.named` says [[space-30](#space-30)], and beside "@<login>", your login at its instance, otherwise; then each instance's heading in the order the home lists them [[storage-2](storage.md#storage-2)], followed by every group that instance lists as a tree in the order of their paths — a subgroup within its group, each headed by its name beside its member count where the last read holds one [[git-host-5](git-host.md#git-host-5)] — then by your namespace there, headed "Only you" and standing only while it lists a spex repository other than your own group's, and by every other account's login under which it lists a spex repository, headed "Shared by @<login>"; under each, one row per spex repository [[space-61](#space-61)], the group's own repository first; while the home lists no instance the list holds your own group alone with its repositories, and while it lists any, "Add instance…", bearing "Another instance" as its title and accessible name, stands at the list's foot, opening the sign-in card in its place [[space-3](#space-3)] ([DR-120](../decisions/120-the-instance-is-the-space.md), [DR-159](../decisions/159-projects-in-groups-opened-where-you-work.md));
- a row stands under the group that the instance governing its key placement [[git-host-5](git-host.md#git-host-5)] last named for it, and under its key's group only where that instance lists nothing for it, so a clone the host moved stands under its new heading, and one whose instance is signed out under the instance its next sync follows, its key unchanged until that sync moves it [[space-60](#space-60)]; every other group whose listing holds a placement of it, or a host repository a placement file of its clone names [[storage-36](storage.md#storage-36)], shows one line naming the row and the group it stands under, with no control ([DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)); a host repository several signed-in instances list is one row, which, with no clone here, stands under the earliest of them in the home's list; your own group's own repository stands under your own group alone, and no group or namespace an instance lists displaces your own group or takes its rows;
- a row's members panel [[space-62](#space-62)] and its Sync's refusal before the first step [[space-11](#space-11)] read the instance governing its spex repository as `governing` names it [[space-30](#space-30)]: the panel that instance's roles and host name, offered only while one governs, and the refusal, while none does, "Sign in to <display name> first" with its own instance's;
- what stands beside a heading's name follows the separator " · " in the surface's secondary tone;
- the heading of a group an instance lists carries one overflow control, "More", holding Members, opening its members panel [[space-62](#space-62)], and "New subgroup", "Rename" and "Delete" where its instance's view says the person may create a subgroup in it, rename it and delete it [[git-host-5](git-host.md#git-host-5)] [[space-68](#space-68)] [[space-76](#space-76)] [[space-77](#space-77)], "Delete" only while the list holds no spex repository or placement under that group and no group inside it ([DR-120](../decisions/120-the-instance-is-the-space.md), [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)) — Share standing in the members panel alone, where the view says the person may add a member [[space-69](#space-69)], nothing else shown for an act the host does not let this person take, and the headings of your own group, of your namespace and of another account's login carrying none of them ([DR-114](../decisions/114-groups-and-sharing-from-spex.md)); beneath a group's heading, before its rows, one line per team server of that group the instance lists, the server's name beside "Connected" while a seat is open there [[run-view-170](run-view.md#run-view-170)] ([DR-159](../decisions/159-projects-in-groups-opened-where-you-work.md));
- a spex repository's row carries its name — the repository's with its `-spex` dropped, a group's own reading "Group sessions" and your own group's own "Your sessions" — where its code lives — a project's code remote as read below, "Code not on a remote" for a project's whose `project.json` names none, nothing for a group's own — "Here" while it is open at this place and "On <server>" for each seat it is open at [[run-view-168](run-view.md#run-view-168)], one phrase for its records' standing [[space-61](#space-61)], its local-changes count [[space-7](#space-7)] where any, its primary control — Open, offering a place per entry [[space-111](#space-111)], or the control its state offers [[space-61](#space-61)] — and one overflow control, "More", holding "Sync now", titled as sending what is here and bringing back anything new, Members [[space-62](#space-62)], "Explore records", and, on a project's, "Move…" [[space-78](#space-78)], "Place at…" [[space-88](#space-88)], while its clone holds a placement with an instance, "Leave…" [[space-89](#space-89)], and Attach for each placement not on this device [[space-90](#space-90)] — a group's own staying in its group ([DR-103](../decisions/103-the-home-and-its-groups.md), [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md), [DR-159](../decisions/159-projects-in-groups-opened-where-you-work.md));
- a remote a project's `project.json` names reads "Code on a remote" until the default instance and every instance the home lists have reported their Git origin [[git-host-5](git-host.md#git-host-5)], then "Code on this instance" where it lies under the Git origin of the row's instance — the default instance's for a local-only row — "Code on a remote" where it lies under another listed instance's, and the remote as the reader set it only where it lies under none of them ([DR-120](../decisions/120-the-instance-is-the-space.md), [DR-127](../decisions/127-a-home-signed-in-to-several-instances.md));
- activating a row's name opens that spex repository's Sync and Explore tabs beneath the list, as "Explore records" opens its Explore tab, the Sync tab carrying its placements' lines [[space-87](#space-87)];
- while any instance is signed in, the surface ends in one quiet line, "Spex keeps this device's files in <home>", the home's absolute path `~`-shortened under the user's home directory, selectable, with the full path in its title and no control;
- the surface links no page but the sign-in's [[space-3](#space-3)] and prints no URL but an instance's origin, and a code remote or the path placement's remote outside the default instance's and every listed instance's reported Git origin, the code remote as the reader set it and the path placement's as a report reads it [[space-15](#space-15)] ([DR-120](../decisions/120-the-instance-is-the-space.md), [DR-127](../decisions/127-a-home-signed-in-to-several-instances.md), [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)).

#### space-87

While a spex repository's clone holds a placement, a placement file of it names a host repository a signed-in instance lists [[storage-36](storage.md#storage-36)], or a creation for it waits at an instance [[space-64](#space-64)], its Sync tab shall carry one line per placement — those its clone holds in the order added [[storage-34](storage.md#storage-34)], then each a file names that a signed-in instance lists and no remote here holds, then each instance a creation waits at — naming its instance's display name and its path there, or the path placement's remote as a report reads it [[space-15](#space-15)], with its own state [[space-61](#space-61)] and these, the row's one phrase reading the first line's in this table's order that any placement holds ([DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md), [DR-159](../decisions/159-projects-in-groups-opened-where-you-work.md)):

| The line carries | While |
| --- | --- |
| the step in flight [[space-12](#space-12)] | a sync runs its turn |
| the outcome the last sync left there [[space-12](#space-12)] — "Changed here and at <display name>" with Resolve [[space-14](#space-14)], "Unrelated history" with "Merge histories…" [[space-13](#space-13)], "Waiting for you to continue" with Continue [[space-57](#space-57)], or the stopped step's cause with Retry [[space-15](#space-15)] | until the next operation or Dismiss |
| "Not on this device" with Attach [[space-90](#space-90)] | a placement file names it and no remote here holds it |
| its last sync [[space-61](#space-61)] | it is reachable or read-only |
| Members [[space-62](#space-62)] | it is reachable and has an instance |
| "Move…", bearing "Move to another group" [[space-78](#space-78)] | the view says the person may move it to another group, on a project's |

- a host repository a placement file of a clone here names stands as a line of that clone's row and as no row of its own, offering no Open, so an Open of one placement leaves each other one its files name offered as Attach, and one a remote here holds under another instance's name is followed to the file's instance instead [[space-60](#space-60)] [[space-91](#space-91)];
- a group's own spex repository stays in its group at one instance, so a placement file of it naming a host repository its clone does not hold names no line and no placement not on this device, the host repository it names standing as any its instance lists [[space-61](#space-61)] ([DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md));
- a waiting creation or branch preparation at a placement [[space-64](#space-64)] shows its phrase on that line in place of the state's.

#### space-2

The Space surface shall re-read the core's state only on an event, never on a timer: when the surface opens, when the window regains focus, when the core announces a sync's end, a sign-in's end, a host read, a project added or removed, or a session, intent or configuration change, and when the reader activates Refresh, which also makes the core read every signed-in instance [[git-host-5](git-host.md#git-host-5)].

#### space-106

When a reply carrying Space state arrives, the UI shall apply it only if no newer state request or `space.state` broadcast has superseded its request, including replies to Sign out, Forget and declining a repair.

### Signing In

#### space-3

The Space surface shall offer the sign-in at an instance in one card holding a field captioned "Instance", which holds the default instance's origin [[storage-2](storage.md#storage-2)] until the reader edits it, and Sign in as its one primary control, starting the sign-in at the origin the field holds — the card standing as the header while the home lists no instance, titled "Not signed in" and reading "Sign in to see your groups and share each project's records with the people in them." and "Until you sign in to this Space, your records stay on this device.", and in place of "Add instance…" once the reader activates it [[space-1](#space-1)], with Cancel beside Sign in and Escape cancelling ([DR-103](../decisions/103-the-home-and-its-groups.md), [DR-127](../decisions/127-a-home-signed-in-to-several-instances.md)):

- "Sign in again" on a signed-out instance's heading starts the sign-in at that instance's origin, its flow reading on that heading as on the card;
- the card opened from "Add instance…" also reads "Your own group's records will be kept there too." ([DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md));
- on the desktop, Sign in starts the browser flow [[git-host-2](git-host.md#git-host-2)], and the card reads "Your browser is open at <host name>: sign in there and approve; you return here signed in." with the link "Open it again" to the sign-in URL; where the shell did not open the browser, the card reads as the device flow's with the sign-in URL as its link;
- in a browser client of the server shell, Sign in starts the device flow [[git-host-3](git-host.md#git-host-3)], and the card reads "Continue in your browser:", the link "Open <host name> to sign in" to the verification URL in a new tab, and "Sign in there and approve; you return here signed in.", showing no code;
- <host name> is the host name of the origin being signed in to: the page the person opens says how to sign in there, and the surface names no account elsewhere;
- while a flow runs, Sign in reads "Signing in…", disabled, beside Cancel, and no row or heading offers a sign-in control, "Add instance…" disabled;
- a URL the core refuses by the origin rule [[git-host-2](git-host.md#git-host-2)] starts no flow, the card reading the core's cause as one sentence with the field kept;
- a denial, an expiry or a refusal — a sign-in at a listed instance as another account among them [[git-host-2](git-host.md#git-host-2)] — ends the flow, the card reading the core's cause as one sentence and the control "Sign in again";
- while no flow runs or stands failed and the core reports that an instance signed this device out [[git-host-4](git-host.md#git-host-4)], that instance's heading reads "<host name> signed this device out. Sign in again to continue as @<login>.", <login> being the account's there, beside its "Sign in again";
- while the home lists no instance, your own group's own spex repository reads "On this computer only — synced once you sign in" with no control and the others are local only [[space-61](#space-61)]; a placement at a signed-out instance is unreachable with "Sign in again" unless a signed-in instance lists its host repository [[space-61](#space-61)], and the surface never contacts an instance that is not signed in.

#### space-4

When a sign-in completes [[git-host-2](git-host.md#git-host-2)] [[git-host-3](git-host.md#git-host-3)], the core shall set the home up for the account at that instance in this order, announcing the end ([DR-127](../decisions/127-a-home-signed-in-to-several-instances.md), [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

1. rename your own group's folder and its spex repository after the account's login there where the folder still bears this device's user name [[space-59](#space-59)];
2. read that instance [[git-host-5](git-host.md#git-host-5)];
3. where your own group's own repository holds no placement at that instance and none whose host repository that instance lists [[git-host-5](git-host.md#git-host-5)] — your own group being placed at every instance the home signs in to — create `<login>-spex` in your namespace there where it lists none — a group named like your login never counting as it [[git-host-5](git-host.md#git-host-5)] — and push it [[space-65](#space-65)], and where one exists, join it as a placement as any two histories join [[space-13](#space-13)], the first push there following the sharing notice [[space-57](#space-57)]; where it holds one, create and join nothing for it;
4. list every local-only spex repository of a project with its "Add to a group…" control [[space-58](#space-58)], creating nothing for them unasked.

- a session lease standing beneath a clone the rename would move refuses the whole rename [[space-59](#space-59)], the sign-in standing complete with the rename retried on the next read;
- a step the host refuses leaves the later steps for the next read and shows the refusal with the host's words [[space-64](#space-64)].

#### space-5

When a working folder's remote is read for `project.json` [[storage-3](storage.md#storage-3)], or the reader names a remote for a spex repository's code, the core shall write the URL without any transport and never a credential:

| URL | Outcome |
| --- | --- |
| `ssh://…`, `git@host:path`, `https://…`, `http://…`, an absolute local path | written as the remote, an SSH form's user being the transport's own and no credential |
| blank, or containing whitespace or control characters | refused as malformed |
| carrying anything before the host on `http://` or `https://`, with or without a colon (`https://user:secret@host`, `https://token@host`) | refused naming the rule that the app stores no credential, pointing to SSH keys or the machine's credential helper |

- an instance's own remote URLs are those it hands over, used as given and never edited by the reader, each written as a placement's remote named by that instance's folder, `@<host>`, with the host's id beside it [[storage-34](storage.md#storage-34)], and a remote the reader names being the clone's one path placement, `origin`, beside them ([DR-103](../decisions/103-the-home-and-its-groups.md), [DR-127](../decisions/127-a-home-signed-in-to-several-instances.md), [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md));
- a placement's last check, the `spex` the clone holds of it and this device's recorded last sync with it [[space-22](#space-22)] are of the host repository its remote records by the host's id, which survives renames, transfers and a follow to another instance listing it [[space-60](#space-60)] ([DR-103](../decisions/103-the-home-and-its-groups.md), [DR-127](../decisions/127-a-home-signed-in-to-several-instances.md), [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)): the remote an instance hands over for that id keeps all three, renamed in a follow or not; a placement dropped [[space-98](#space-98)] [[space-91](#space-91)] takes all three, and its notice record [[storage-5](storage.md#storage-5)], with its remote and id; and naming another path placement clears the former one's, what the old remote held saying nothing of the new one.

#### space-6

When the reader activates Sign out on a signed-in instance's heading, the core shall revoke this device at that instance and forget its credential [[git-host-10](git-host.md#git-host-10)], and the surface shall keep that instance's heading, signed out [[space-1](#space-1)], every placement at it turning unreachable with "Sign in again" unless a signed-in instance lists its host repository, a spex repository reading unreachable only where every placement it holds does [[space-61](#space-61)], their records and clones kept ([DR-103](../decisions/103-the-home-and-its-groups.md), [DR-127](../decisions/127-a-home-signed-in-to-several-instances.md), [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)).

#### space-82

When the reader activates Forget on a signed-out instance's heading, the core shall remove that instance from the home in this order ([DR-127](../decisions/127-a-home-signed-in-to-several-instances.md), [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

1. make each placement at that instance follow a signed-in instance listing its host repository [[git-host-5](git-host.md#git-host-5)], as a sync's follow makes it follow [[space-60](#space-60)], rewriting its placement file [[storage-36](storage.md#storage-36)];
2. where a clone other than your own group's own repository still has it as its instance [[storage-31](storage.md#storage-31)], or a placement of one is still at it — listed by no signed-in instance, or its follow refused by a session lease — refuse, naming beneath the heading each such spex repository or that session, the instance kept with every follow already made;
3. rename your own group's own repository's remote there to the folder of a signed-in instance listing the same host repository [[git-host-5](git-host.md#git-host-5)], rewriting its placement file [[storage-36](storage.md#storage-36)], else drop that remote [[space-5](#space-5)], leaving its file;
4. remove the instance's entry from `home.yaml` [[storage-2](storage.md#storage-2)].

- a Forget leaving the home with no instance leaves it as before any sign-in [[space-1](#space-1)], your own group's own repository local only until a sign-in creates or joins it [[space-4](#space-4)].

### Groups and Spex Repositories

#### space-57

While a placement's host repository has other members, or the placement is your own group's own repository's at an instance other than its first placement's [[space-4](#space-4)], and it has never been pushed from this device, when a sync reaching that placement, or a pick [[space-58](#space-58)] or a Place [[space-88](#space-88)] joining it, is admitted, the surface shall first say once for that placement that every session goes there whole — hidden parts and attachments included — that nothing recalls what others downloaded, and, where the repository is public, that its records are public, with Continue and Cancel, Cancel focused and Escape cancelling ([DR-010](../decisions/010-interface-craft.md) §4) ([DR-103](../decisions/103-the-home-and-its-groups.md), [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

- a sync reads afresh, for admission, only the placements whose notice may be owed, and rechecks the notice at each one's Check before branch or transport effects [[git-host-22](git-host.md#git-host-22)], a failed read stopping that placement alone, as unreachable, and refusing the sync only where no placement could run; a placement whose notice is owed reads "Waiting for you to continue" with Continue on its line while the others sync [[space-87](#space-87)], a pick's notice standing in the picker beneath the spex repository picked [[space-58](#space-58)] and a Place's in its picker [[space-88](#space-88)];
- Continue records that this device's reader has seen it for that placement [[storage-5](storage.md#storage-5)] and starts the sync, the pick or the Place with `noticed`; Cancel starts nothing, focus returning to the control that asked;
- the members of the clone's other placements are not asked;
- the path placement [[space-5](#space-5)] owes no notice;
- a placement whose only member is the account says nothing, your own group's at a later instance excepted, and one whose members' count the host's last read lacks [[git-host-5](git-host.md#git-host-5)] is taken to have other members.

#### space-58

When a working folder is added while any instance is signed in [[storage-6](storage.md#storage-6)], or the reader activates "Add to a group…" on a spex repository whose clone holds no placement with an instance [[space-61](#space-61)], the surface shall offer, in one picker, under each signed-in instance's display name — its clone's instance alone where its key lies under one [[storage-31](storage.md#storage-31)] — the spex repositories that instance lists whose `project.json` names the folder's remote, each with its group, read as the list reads it [[space-1](#space-1)], and its members' count where known, omitted where the full read leaves it unknown [[git-host-5](git-host.md#git-host-5)], and, below them, your namespace there, reading "Only you", and each group it lists, since only the host knows where the account may create, the folder's name as the new repository's name in an editable field followed by `-spex` ([DR-103](../decisions/103-the-home-and-its-groups.md), [DR-127](../decisions/127-a-home-signed-in-to-several-instances.md), [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md), [DR-159](../decisions/159-projects-in-groups-opened-where-you-work.md)):

- picking a listed spex repository clones it and pairs it with the folder — on a seat, the folder the core allocates [[space-103](#space-103)] — or, for a local-only one, joins its history with the clone's as any two [[space-13](#space-13)], once the sharing notice is seen where that repository may have other members [[space-57](#space-57)];
- picking a group or your namespace creates `<name>-spex` there, at that instance [[git-host-6](git-host.md#git-host-6)], the pick naming a group by its host id and your namespace by none, and pushes the local branch; a name the host reports taken is refused in place and the field asks for another;
- a pick of a clone under your own group's folder moves it under that instance's folder at the repository's path there as the creation or the join lands [[storage-35](storage.md#storage-35)];
- a creation the host refuses for the account's rights leaves the repository local only, where its clone lies, with "Waiting for a member who can create it in <group>" on that instance's line [[space-64](#space-64)];
- Cancel leaves the repository local only, where its clone lies, with "Add to a group…" offered again;
- under each instance, your namespace reads "Only you" and each group by its name with its path in the instance after it where the path differs, as the list reads them [[space-1](#space-1)], never another account's login.

#### space-59

While your own group's folder bears this device's user name, as it does until the home's first sign-in [[storage-2](storage.md#storage-2)], when a sign-in sets the home up [[space-4](#space-4)] for a login at that instance other than that name, the core shall rename the folder under `workspace/` and its spex repository `<login>-spex`, rewriting every pair that names it [[storage-2](storage.md#storage-2)] in the same step, and where that instance already holds `<login>-spex` in your namespace pushed from another device, shall join the two histories, every unit on both sides being one choice [[space-13](#space-13)] ([DR-103](../decisions/103-the-home-and-its-groups.md), [DR-127](../decisions/127-a-home-signed-in-to-several-instances.md)):

- the rename is one step at its instant — every clone beneath moved by one rename and every pair rewritten, with nothing awaited between — refusing nothing beneath the folder [[space-21](#space-21)];
- where the clone of your own group on this device provably holds only its unchanged generated bootstrap — no session, intent or authoring session, its exact tree, beside the placement files the core writes [[storage-36](storage.md#storage-36)], still the bootstrap the core recorded when it generated the starter configuration and environment in an empty clone, and no history beyond that bootstrap and this join's Saves — the join takes the host's side for every unit without asking, so a second device starts from what the first pushed; authored changes carried by a Save, preexisting or relocated files, migration and missing bootstrap proof use the ordinary comparison and choices for differing shared units [[space-13](#space-13)], the proof retained across a restart and rename ([DR-114](../decisions/114-groups-and-sharing-from-spex.md));
- the rename moves nothing, leaving every clone, pair and session where it was for the next set-up to ask again, where any clone's destination is already taken — by another folder, by the clone itself under another spelling of its group, or by a folder on its path below `workspace/` that stands spelled otherwise — or where any clone beneath holds a session lease `sessions/.<id>.lock` other than a Playbook session-lease record whose `hostname` and `pid` read as a dead owner of this machine by steps 3 and 4 of the root lease's rule [[storage-26](storage.md#storage-26)], such a lease moving with the clone ([DR-108](../decisions/108-the-root-lease-names-the-machine.md)).

#### space-60

When a sync of a spex repository reaches a placement's Check step [[space-12](#space-12)] while a host read [[git-host-5](git-host.md#git-host-5)], a placement file under another instance signed in on this device that lists its host repository [[storage-36](storage.md#storage-36)] or the instances migration's receipt [[storage-30](storage.md#storage-30)] places that placement elsewhere than it stands — at another instance than its remote names, or, for the key placement, at another path than the clone's key [[storage-1](storage.md#storage-1)], as a host's rename or move, a pick or an Attach from your own group's folder [[storage-35](storage.md#storage-35)] and a move the migration deferred leave it — the core shall, before any fetch or push there, rename that placement's remote to the folder of the instance it follows, rewriting its placement file to that instance and deleting the former instance's file [[storage-36](storage.md#storage-36)], and, for the key placement, move the clone to its path at the instance a host read reports it at, else to the destination that receipt names, rewriting every pair that names it, its session locations, its sync preferences [[storage-5](storage.md#storage-5)] and the exports beneath it, all in the same step, so that its key and name follow its key placement ([DR-103](../decisions/103-the-home-and-its-groups.md), [DR-127](../decisions/127-a-home-signed-in-to-several-instances.md), [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

- the move is one rename within the sync at its instant, made only while the clone still reads the remote its check read before asking the host and lies where the home says, and, where a host read placed it, records the host's id [[space-21](#space-21)];
- a placement following another instance has its remote renamed, and its sync preferences [[storage-5](storage.md#storage-5)] re-keyed, in the same step [[space-5](#space-5)] and proceeds with that instance — its catalog, its credential and, for the key placement, the commit identity [[space-32](#space-32)] — and a follow onto an instance at which the clone holds another placement is not made, the placement reading unreachable;
- a rename or move of another placement's host repository at its instance changes that placement's path alone, moving no clone [[space-87](#space-87)];
- your own group's own repository keeps its folder wherever its placements stand, following another instance by its remote's rename and its file's rewrite alone;
- the move stops that placement, the clone, its pairs and its sessions left where they were, where the destination is taken by anything but the clone itself under the same group folder — which a rename changing only the case of the repository's own name moves onto — or a folder on its path below `workspace/` stands spelled otherwise, or where the clone holds a session lease that refuses a sign-in's rename [[space-59](#space-59)], naming that session with Retry [[space-15](#space-15)];
- a group the host renamed still holds its spex repositories under their own names, since the host renames no repository with its group.

#### space-61

The Space surface shall show each spex repository, and each of its placements, in exactly one of these states, a placement's read from the last answer of the instance governing it [[git-host-5](git-host.md#git-host-5)] and this device's files, and a clone holding a placement reading reachable where any placement it holds does, read-only where none does and one is read-only, and unreachable where every one it holds is ([DR-103](../decisions/103-the-home-and-its-groups.md), [DR-127](../decisions/127-a-home-signed-in-to-several-instances.md), [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

| State | Holds while | Row reads | Control |
| --- | --- | --- | --- |
| local only | the clone holds no placement [[storage-34](storage.md#storage-34)] | "On this computer only", your own group's own repository reading "On this computer only — synced once you sign in" [[space-4](#space-4)] | "Add to a group…" [[space-58](#space-58)] while an instance it would offer is signed in, none on your own group's own repository |
| reachable | the latest full or selected-target read of the instance governing it lists it [[git-host-5](git-host.md#git-host-5)] [[git-host-22](git-host.md#git-host-22)] and the clone is here, no join of it running [[space-63](#space-63)], or it is the path placement this device can reach | its last sync, or the outcome a placement's line holds [[space-87](#space-87)] | Open [[space-111](#space-111)], "Sync now" in its overflow, and "Add to a group…" [[space-58](#space-58)] while the clone holds no placement with an instance and an instance it would offer is signed in |
| read-only | the host listed it archived, or with the account below the role that may push, or refused the push other than for an explicit content-size limit [[space-15](#space-15)] | "Read-only: <the host's reason>"; new sessions reach only the placements that take pushes, said so | Open [[space-111](#space-111)], "Sync now" in its overflow bringing only |
| unreachable | the host stopped listing it, refused the read, the device is offline, or its instance is signed out while no signed-in instance lists its host repository | "Unreachable: <cause>" | Retry, none while its instance is signed out |
| not on this device | an instance listed it and no clone is here, or its join still runs [[space-63](#space-63)], or a placement file of a clone here names it | nothing, the row carrying no "Here" [[space-1](#space-1)]; "Opening…" while its join runs | Open [[space-111](#space-111)], or Attach in its clone's row's overflow [[space-90](#space-90)] |

- a reachable placement's last sync is read from this device's last completed sync with it [[space-22](#space-22)] as "Synced <age>", or, where none is recorded, from the last one its clone holds ([DR-111](../decisions/111-the-core-coordinates-as-git-does.md)): "Synced <age>" at `spex`'s commit time where `spex` equals that placement's `spex` as the clone last fetched or pushed it, "Not synced since <moment>" at their common ancestor's commit time where the two differ, and "Never synced" where the clone holds no `spex` of it sharing its history;
- nothing on this device is deleted because the host refused or stopped listing;
- a spex repository an instance lists in a group it holds as colliding [[git-host-5](git-host.md#git-host-5)] reads "Unreachable: a group named like your login" whether or not a clone is here, offering no Open and no Sync, and no clone is made or moved for it ([DR-120](../decisions/120-the-instance-is-the-space.md));
- a waiting creation or branch preparation [[space-64](#space-64)] shows on its placement's line [[space-87](#space-87)]; the wait is held for the app's run alone, so after a restart the row offers its control again and the next attempt finds what a member did meanwhile.

#### space-62

When the reader activates Members on the heading of a group an instance lists or on a reachable placement's line [[space-87](#space-87)], another account's login's among them, the surface shall list the members of that group or placement as its instance reports them [[git-host-8](git-host.md#git-host-8)] — login as the personal name, the host's own role name and, on a membership held through another group, "via <group>" — with Share where the view says the person may add a member to it [[git-host-5](git-host.md#git-host-5)] [[space-69](#space-69)] and Remove on each member held directly where the view says the person may manage its members [[space-72](#space-72)], never on one held through another group ([DR-103](../decisions/103-the-home-and-its-groups.md), [DR-114](../decisions/114-groups-and-sharing-from-spex.md), [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

- the list is read on activation, on Refresh and after a share, never cached across reads; a personal display name received from the instance is not shown ([DR-171](../decisions/171-personal-names-are-space-logins.md));
- a placement's panel reads "These records are also placed at <display names>", naming the instance of every other placement its clone's placement files name [[storage-36](storage.md#storage-36)], each by its display name as the home last read it [[storage-2](storage.md#storage-2)], else its origin's host name;
- the panel links no page of the host ([DR-120](../decisions/120-the-instance-is-the-space.md)).

#### space-68

When the reader activates "New group" on an instance's heading, or "New subgroup" on a group's heading, the surface shall open an inline editor in that place with a field captioned "Group name", a field captioned "Path" that follows the name as the host derives it — lower-cased, each run outside letters, digits, `.`, `_` and `-` one `-`, leading and trailing `-` and `.` dropped — until the reader edits it, Create and Cancel, Escape cancelling ([DR-010](../decisions/010-interface-craft.md) §6), and on Create shall send `space.group.create` with that instance, or the group's, the name, the path and, from a group, that group as the parent, a group from an instance's heading being made at that instance's root [[git-host-15](git-host.md#git-host-15)] ([DR-114](../decisions/114-groups-and-sharing-from-spex.md), [DR-127](../decisions/127-a-home-signed-in-to-several-instances.md)):

- Create reads "Creating…" and the editor refuses a second submission while the command runs;
- a name that derives no path — one in Chinese, say — leaves the path field empty for the reader to fill, and an empty path disables Create;
- a success closes the editor, the group already standing in the list with its full path, after its parent where it has one, as the core holds it [[git-host-15](git-host.md#git-host-15)] until a read begun after the creation is held [[git-host-5](git-host.md#git-host-5)];
- a refusal — the name taken there, the host's words, or that the host could not be reached [[git-host-11](git-host.md#git-host-11)] — shows in the editor with the name kept;
- an empty name disables Create.

#### space-69

When the reader activates Share — on a group of the host, or in a placement's members panel [[space-62](#space-62)] — the surface shall open an inline editor there with a field captioned "Login at <host name>", a listbox of the host's roles in its order preselecting the least that may push [[git-host-16](git-host.md#git-host-16)], Add and Cancel, Escape cancelling ([DR-010](../decisions/010-interface-craft.md) §6), and on Add shall send `space.share` naming that group, or that spex repository with the placement's instance, the login and the role ([DR-114](../decisions/114-groups-and-sharing-from-spex.md), [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

- Add reads "Adding…" and the editor refuses a second submission while the command runs;
- a success closes the editor and says in one line "@<login> added as <role>", a members panel standing open listing the members the reply carries;
- a refusal — no account under that login, the account already a member, or the host's words — shows in the editor with the login kept;
- an empty login disables Add.

#### space-72

When the reader activates Remove on a member in a members panel [[space-62](#space-62)], the surface shall ask with the inline confirm — "Remove" and "Keep", Keep focused, Escape keeping ([DR-010](../decisions/010-interface-craft.md) §4) — and on Remove shall send `space.unshare` naming that group, or that spex repository with the placement's instance, and the member's login [[git-host-17](git-host.md#git-host-17)] ([DR-114](../decisions/114-groups-and-sharing-from-spex.md), [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

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

When the reader activates "Move to another group" on a placement's line of a project's spex repository [[space-87](#space-87)], the surface shall open beneath the line a picker of groups as in [[space-58](#space-58)] — of that placement's instance alone, your namespace there first, read by your login there, then each group it lists, each read by its name with its path in the instance after it where the path differs, as the list reads it [[space-1](#space-1)], never another account's login, the group that placement stands in left out — with Cancel, Escape cancelling, and on a pick shall send `space.repository.move` naming the spex repository, the placement's instance and that group, or none for your namespace [[git-host-20](git-host.md#git-host-20)] ([DR-120](../decisions/120-the-instance-is-the-space.md), [DR-127](../decisions/127-a-home-signed-in-to-several-instances.md), [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

- the line's control reads "Moving…" and the picker refuses a second pick while the command runs;
- a success closes the picker, the placement standing in its new group at once — the row under it where it is the key placement — with the key unchanged, as the core holds it [[git-host-20](git-host.md#git-host-20)], the clone moving on its next sync only for the key placement [[space-60](#space-60)];
- a refusal — the name taken in that group, a group named like your login, the host's words, or that the host could not be reached [[git-host-11](git-host.md#git-host-11)] — shows in the picker with the placement kept where it stood.

#### space-63

When the reader opens, at this place [[space-111](#space-111)], a spex repository an instance lists and this device lacks, the core shall clone it under the folder of the instance its row stands under [[space-1](#space-1)], at its path there [[storage-1](storage.md#storage-1)], its remote named by that folder [[space-5](#space-5)], then, where its `project.json` names a remote, clone the code from that remote with this device's own Git into a folder the reader picks — the picker opened by the act itself; on a seat, the folder the core allocates [[space-103](#space-103)] — with the credential a signed-in instance of one of its placements brokers at that instance's Git origin, and none of the app's at any other [[projects-37](projects.md#projects-37)] — or take a working folder the reader already has, and pair the two [[storage-6](storage.md#storage-6)] ([DR-103](../decisions/103-the-home-and-its-groups.md), [DR-127](../decisions/127-a-home-signed-in-to-several-instances.md), [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md), [DR-159](../decisions/159-projects-in-groups-opened-where-you-work.md)):

- a group's own spex repository, holding no `project.json`, asks for the working folder its sessions run in on this device; the folder is paired through the same command a repair uses [[space-47](#space-47)];
- a host id the instance's last read lacks is looked up in a fresh read of that instance before the open is refused `not_found`, so a project shared since that read opens without a Refresh ([DR-159](../decisions/159-projects-in-groups-opened-where-you-work.md));
- the join runs at its Check step while the spex repository clones and at its Code step, its line reading "Cloning code…", while the code clones, offering Stop at neither, and ends only once the code is cloned and paired or its clone has failed [[space-61](#space-61)];
- the spex repository clones into a private folder beside its place and moves there only where nothing stands at that instant; a join finding its place taken — another join's clone — stops, leaving that clone as it stands, and every join removes its own private folder alone;
- a code clone that fails stops the join at its Code step with the host's failure classified at the Git origin of the instance that brokered it and Git's words at any other, no URL under any listed instance's reported Git origin shown [[space-15](#space-15)], leaving the spex repository cloned and the row offering "Choose folder…" to pair it later, or, on a seat, "Try again" [[space-103](#space-103)].

#### space-64

When a step at the host — creating a spex repository [[git-host-6](git-host.md#git-host-6)] or preparing its `spex` branch [[git-host-7](git-host.md#git-host-7)] — is refused for the account's rights, the surface shall show the step as waiting on that placement's line [[space-87](#space-87)], with the host's words in its title, and the core shall ask again at the next read, finding the result when a member with the rights has done it from their own Spex ([DR-103](../decisions/103-the-home-and-its-groups.md), [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

- nobody is sent to edit the host's settings: the row names the step and the group, never a host page to change.

#### space-65

When the first session of a group starts in the working folder paired with that group [[storage-6](storage.md#storage-6)], or a sign-in finds your own group's own repository with no placement at that instance and none in your namespace there [[space-4](#space-4)], the core shall create `<group>-spex` in that group at its instance, or, for your own group, `<login>-spex` in your namespace at that sign-in's instance [[git-host-6](git-host.md#git-host-6)], prepare its branch [[git-host-7](git-host.md#git-host-7)] and push the local clone, following the sharing notice [[space-57](#space-57)], its remote named by that instance's folder [[space-5](#space-5)] ([DR-103](../decisions/103-the-home-and-its-groups.md), [DR-127](../decisions/127-a-home-signed-in-to-several-instances.md), [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

- a refused creation leaves the clone without that placement — local only where it holds none — and the session running [[space-64](#space-64)].

#### space-88

While a project's spex repository holds a placement with an instance, its clone holds none at some signed-in instance, and the view says the person may manage the members of every placement it holds with an instance [[git-host-5](git-host.md#git-host-5)], its row shall offer "Place at…" — titled and named "Also place at <display name>" where one instance is offered, and otherwise opening the choice of them, each so named — whose instance chosen opens the picker of [[space-58](#space-58)] for that instance alone, listing the spex repositories there whose `project.json` names the folder's remote and whose members the view says the person may manage, then your namespace and each group there, and on a pick shall send `space.place` naming it [[space-97](#space-97)] ([DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

- the sharing notice is seen first, in the picker, where that repository may have other members [[space-57](#space-57)];
- a name taken is refused in the picker, and Cancel changes nothing;
- a group's own spex repository, which stays at its group's instance, and your own group's own, which each sign-in places [[space-4](#space-4)], offer none, and one whose clone holds no placement with an instance offers "Add to a group…" instead [[space-61](#space-61)].

#### space-97

When a client sends `space.place` [[space-29](#space-29)], the core shall, as an operation of the clone's machine [[space-31](#space-31)], join the listed spex repository it names as a placement, its history joined with the clone's as any two [[space-13](#space-13)], or create `<name>-spex` in the group or the namespace it names [[git-host-6](git-host.md#git-host-6)], then sync the clone, that placement among its placements [[space-12](#space-12)] ([DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

- a creation the host leaves pending adds no placement, its wait standing on that instance's line [[space-64](#space-64)] while the clone syncs its other placements.

#### space-89

While a project's clone holds a placement with an instance, when the reader activates "Leave…" on its row — titled and named "Remove from <display name>" where its clone holds one placement with an instance, and otherwise opening the choice of them, each so named — the surface shall ask with the inline confirm, "Remove" and "Keep", Keep focused, Escape keeping ([DR-010](../decisions/010-interface-craft.md) §4), and on Remove shall send `space.leave` naming that placement's instance [[space-98](#space-98)] ([DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

- a leave stopped for records no remaining placement received asks the confirm again, naming the count, and one stopped for a placement it could not read says that records pushed to <display name> since the last sync may be left behind, each sending `space.leave` with `confirmed` on that second Remove;
- the rows of your own group's own repository and of a group's own offer no "Leave…".

#### space-98

When a client sends `space.leave` [[space-29](#space-29)], the core shall, as an operation of the clone's machine [[space-31](#space-31)], fetch that placement, then drop its remote and delete its placement file, changing nothing at the host ([DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

| Case | Outcome |
| --- | --- |
| its instance signed out, another signed-in instance listing its host repository [[git-host-5](git-host.md#git-host-5)], and the clone holding no placement at that instance | nothing fetched or dropped: its remote renamed to the folder of the instance it follows [[space-60](#space-60)] and its file rewritten to that instance [[storage-36](storage.md#storage-36)] |
| a unit that placement's `spex` or the clone holds is held by no remaining placement's `spex`, as the clone last fetched or pushed it or at their last shared commit — a placement whose last check found its host holding no `spex` holding none; every unit, where none remains — and the leave is not `confirmed` | nothing dropped; the leave stopped `unreceived`, naming the count |
| the placement cannot be read, and the leave is not `confirmed` | nothing dropped; the leave stopped, saying that records pushed there since the last sync may be left behind |
| it is the first placement | the clone moved with the drop [[storage-38](storage.md#storage-38)], a refusal of that move refusing the leave whole, naming the session or the instance, with Retry |

- the file's deletion is a local change the clone's next sync carries to its remaining placements [[space-7](#space-7)].

#### space-90

When the reader activates Attach, in the row's overflow [[space-1](#space-1)] or on a line naming a placement not yet on this device [[space-87](#space-87)] — a host repository a placement file of the clone names [[storage-36](storage.md#storage-36)] that the signed-in instance it names lists [[git-host-5](git-host.md#git-host-5)] — the surface shall show the sharing notice [[space-57](#space-57)] for that placement on its line, naming its instance's display name and its path there whatever its members, and on Continue shall send `space.attach` with `noticed` [[space-99](#space-99)] ([DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md), [DR-159](../decisions/159-projects-in-groups-opened-where-you-work.md)):

- Continue records that this device's reader has seen it for that placement [[storage-5](storage.md#storage-5)];
- Cancel attaches nothing, the line offering Attach again;
- a file whoever can push wrote is offered alike, whether or not its writer may manage members, and no device carries records to a placement before its reader continues;
- a group's own spex repository, which stays in its group at one instance, carries no such line and offers no Attach [[space-87](#space-87)].

#### space-99

When a client sends `space.attach` with `noticed` [[space-29](#space-29)], the core shall, as an operation of the clone's machine [[space-31](#space-31)], add that placement's remote, named by its instance's folder with the host's id beside it [[storage-34](storage.md#storage-34)], and sync the clone, that placement among its placements [[space-12](#space-12)] ([DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

- a local-only clone under your own group's folder attaching its first placement moves as a pick's does [[storage-35](storage.md#storage-35)].

#### space-111

When the reader activates Open on a spex repository's row — or "Open here" where this computer is the only place — and picks a place [[run-view-168](run-view.md#run-view-168)], the surface shall open that spex repository at that place ([DR-133](../decisions/133-one-desktop-over-several-cores.md), [DR-159](../decisions/159-projects-in-groups-opened-where-you-work.md)):

| The entry | Reads | On activation |
| --- | --- | --- |
| this computer, the spex repository not on this device | "Open here" | sends `space.join` for it with the folder the picker opened by the act takes [[space-63](#space-63)], a group's own repository asking for the folder its sessions run in [[space-63](#space-63)] |
| this computer, the spex repository open here | "Show" | shows the project on the Projects surface |
| a server of the instance the member may open [[core-service-128](core-service.md#core-service-128)], the spex repository not open there | "Open on <server>" | opens a seat there where none is open [[run-view-170](run-view.md#run-view-170)], then, once that seat is signed in at the instance, sends that seat's core `space.join` for it with no folder [[space-103](#space-103)], the row reading "Opening on <server>…" meanwhile |
| a server the spex repository is open at | "Show on <server>" | shows the project at that place on the Projects surface |

- a seat whose sign-in fails, or whose open is refused, leaves the open undone, the cause read on the server's line [[run-view-170](run-view.md#run-view-170)];
- a spex repository held as colliding [[space-61](#space-61)], or read-only at every placement with no clone here, offers no Open.

#### space-112

Where the surface shows a seat's place [[run-view-168](run-view.md#run-view-168)], every phrase of this package naming this device or this computer shall name the server instead — "Not on <server>", "Keep what's on <server>", "Spex keeps <server>'s files in <home>" among them — so that a member reading a seat's Space is never told that the server is their own device ([DR-133](../decisions/133-one-desktop-over-several-cores.md), [DR-159](../decisions/159-projects-in-groups-opened-where-you-work.md)):

- the sign-in card on a seat reads "Sign in to see your groups and open their projects on <server>." and "Package registry access is separate from this Space sign-in." [[hub-12](hub.md#hub-12)]; the "Add instance…" card there says nothing of your own group's records, which a seat places at no instance [[space-102](#space-102)].

### Repairs

#### space-46

When the core reports the home's diagnostics, it shall fold every diagnostic a folder on this device would repair into one repair each, carrying the facts the repair needs, and leave every other diagnostic unfolded [[core-service-86](core-service.md#core-service-86)] ([DR-063](../decisions/063-space-setup-and-repair.md)):

| Repair | Raised by | Named by |
| --- | --- | --- |
| a spex repository with no working folder here | a clone under `workspace/` that no pair names [[storage-2](storage.md#storage-2)] | the project — the spex repository's name with its `-spex` dropped — with its group, "<project> in <group>: its folder on this computer is missing", the folder it last ran in secondary ([DR-159](../decisions/159-projects-in-groups-opened-where-you-work.md)) |
| a working folder whose clone is missing | a pair naming a clone that is not under `workspace/` | the folder's path |

- one spex repository's repair resolves every session it holds, however many sessions ran there;
- a fault no folder repairs — a session working directory missing or invalid, a blocking diagnostic, a pending merge — folds into no repair and keeps its own row;
- repairs stand before unfolded diagnostics, blocking ones first, then unanswered repairs before declined ones [[space-54](#space-54)], then by session count descending, then by name, then by path, and no row reorders while an editor is open.

#### space-47

When the user pairs a repair's spex repository with the folder proposed [[space-53](#space-53)] or with one he names, or declines to, the Space surface shall settle that repair in place ([DR-065](../decisions/065-repairs-the-reader-answers.md)):

- pairing a folder the home already pairs with that spex repository sets that pair's folder, carrying the repair's recorded directories as aliases so every session recorded under them may continue [[storage-6](storage.md#storage-6)];
- pairing a folder the home pairs with nothing writes the pair [[storage-6](storage.md#storage-6)], and where that folder is not one the repair records, attaches those recorded directories to it as aliases;
- naming a different folder opens the row as an in-place editor over the proposed or recorded path, with Add project, Cancel, Escape cancelling, and an Open folder… control where the running deployment offers a directory picker;
- the editor says that where a project lives is recorded on this device alone and never syncs [[storage-1](storage.md#storage-1)];
- a refusal shows in the row with the path kept and the control offered again: a folder inside another working folder, a folder already another spex repository's, and a spex repository whose turn is still running;
- a sync of that spex repository running meanwhile disables no repair control and refuses no rebind [[space-21](#space-21)].
- at a remote place [[run-view-169](run-view.md#run-view-169)] a repair offers neither a folder nor its proposal's "Add project": a seat's core allocates every folder itself [[space-103](#space-103)].

#### space-48

When pairing a repair's spex repository succeeds with every recorded folder attached [[space-47](#space-47)], the Space surface shall replace that row with its outcome in the row's own place, keeping the reader on the surface ([DR-009](../decisions/009-at-hand-interaction.md)) ([DR-063](../decisions/063-space-setup-and-repair.md)):

- the outcome names the project and the folder it is now a project at, with the count of sessions listed where any ran there, and offers Open project, which is the only control here that leaves the surface;
- the core no longer reports the repair, so the issues count leaves it out [[space-1](#space-1)], and the live region says how many issues are left as that count reads — declined repairs not among them [[space-49](#space-49)] — or that every issue is resolved where none is;
- focus moves to the first control of the next unanswered repair below it, wrapping to the list's top — its Add project where it proposes a folder, else its Choose folder… — or, where no unanswered repair remains, to the outcome's Open project;
- the outcome holds that place, the issues list standing with it though the core reports no diagnostic, until the reader's own Refresh [[space-2](#space-2)] or his leaving the Sync tab, when it leaves the list.

#### space-49

While a repair stands unanswered, the Space surface shall count it as an issue [[space-1](#space-1)], only this device's reader's own act settling it ([DR-065](../decisions/065-repairs-the-reader-answers.md)):

- drawing a row, opening the list and re-reading the state settle nothing;
- declining, with "Not on this computer", says this is not a project on this device: the row stands in the list, counts no more, and keeps the controls it had, so changing that answer is pairing the project rather than undoing anything ([DR-159](../decisions/159-projects-in-groups-opened-where-you-work.md));
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

While the issues list stands, the Space surface shall tell a repair's three conditions apart by mark, by word and by weight, each named in the row's accessible description ([DR-065](../decisions/065-repairs-the-reader-answers.md)) ([DR-010](../decisions/010-interface-craft.md) §8):

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

While a spex repository's Sync tab is shown, it shall list the local units — those whose working-tree bytes differ from their common ancestor with some placement's `spex` branch while that placement's do not, or from the last commit where no placement has been checked [[space-33](#space-33)] — grouped by kind in this order with these labels, never a raw diff of a session ([DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

| Kind | Unit | Label | Detail |
| --- | --- | --- | --- |
| Sessions | `sessions/<id>` bundle | the session's title, or "untitled session" | new, updated or deleted; turn count |
| Intents | `intents/<id>.json` with its assets | the intent's title | new, updated or deleted |
| Authoring | `authoring/<id>` | the session's title, or "untitled authoring session" | new, updated or deleted |
| Environment | `spex.yaml` with `spex.lock`, wherever a clone holds them — a group's own, or a project's until the migration moves them [[storage-1](storage.md#storage-1)] | "Spec packages changed" | a View diff control [[space-10](#space-10)] |
| Settings | `config/playbook.config.yaml` | "Settings changed" | a View diff control [[space-10](#space-10)] |
| Code | `project.json` | "Code remote changed" | a View diff control [[space-10](#space-10)] |
| Sync rules | `.gitignore`, `.gitattributes` | "Sync rules updated" | a View diff control [[space-10](#space-10)] |
| Other | a spec package's folder with every file under it [[storage-11](storage.md#storage-11)], or any other tracked path | the folder, ending `/`, or the path | new, updated or deleted |

- a session row carries Open session, which opens the session as a tab [[run-view-68](run-view.md#run-view-68)];
- with no local unit the list reads "Nothing to send from this device".

#### space-8

When the user activates Check host on a spex repository, the core shall fetch each placement's `spex` branch in the order added without merging, and the Sync tab shall list each placement's incoming units [[space-33](#space-33)] under its instance's display name, with the labels of [[space-7](#space-7)], each marked new, updated or deleted against the common ancestor with that placement and marked as a choice to make where this device changed it too ([DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

- the control reads "Checking…" in flight and offers Stop [[space-16](#space-16)];
- ahead, behind and the check time update on the placement's line in the Sync tab [[space-87](#space-87)], the row's one phrase following it ([DR-159](../decisions/159-projects-in-groups-opened-where-you-work.md));
- a placement holding no `spex` branch reads "The host holds no records yet; Sync will send these";
- a placement of unrelated history reads "Unrelated history" with "Merge histories…" on its line [[space-13](#space-13)] and lists nothing;
- a failed transport reports per [[space-15](#space-15)].
- Where the fetched tree uses LFS, Check also fetches that tree's LFS objects with the placement's credential [[git-host-9](git-host.md#git-host-9)], within the same stoppable transport step [[space-16](#space-16)], without path exclusions or fetching unrelated recent refs; a tree using no LFS requires no LFS executable.

#### space-9

While a sync has ended in choices needed at a placement, the Sync tab shall show the incoming list of the first placement in order so ended above the conflict picker [[space-17](#space-17)], with the step line reading "Needs your choice" and the caption "Your changes are saved; nothing is pushed to <display name> yet", <display name> being that placement's instance's ([DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)).

#### space-10

When the user activates View diff on an Environment, Settings, Code, Sync rules or Other row, the surface shall show that unit's line diff in place — this device's version against the common ancestor for a local row, the host's version against it for an incoming row, either side on a conflict row — additions and removals marked in text as well as color, and Hide diff removing it; a session, intent or authoring row offers no diff.

### Syncing

#### space-11

When the user activates Sync on a spex repository, the core shall admit it only while every condition below holds, otherwise refusing before the first step with the surface showing the reason beside the disabled control:

| Condition | Refusal shown |
| --- | --- |
| some placement can run: its instance signed in, or a signed-in instance listing its host repository — the sync then following it [[space-60](#space-60)] — or the path placement, which this device can reach | "Sign in to <display name> first", <display name> the first placement's instance's as last read, else its host name, and "Add to a group first" for a clone with no placement ([DR-127](../decisions/127-a-home-signed-in-to-several-instances.md), [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md), [DR-159](../decisions/159-projects-in-groups-opened-where-you-work.md)) |
| the spex repository is reachable or read-only [[space-61](#space-61)] | the state's phrase |
| no Git merge is pending from a terminal in the clone | "Finish or abort the merge in your terminal" |
| no blocking storage diagnostic stands for a file inside its clone or for a home file outside `workspace/` [[core-service-86](core-service.md#core-service-86)], a refresh's finding aside [[space-20](#space-20)] and, while its repair marker stands, every diagnostic of a file inside its clone, the repair's own finding among them [[space-67](#space-67)] | the file and reason |
| `git` runs | the install guidance |

- a placement that cannot run stops at its turn [[space-15](#space-15)];
- no turn, session, compile, upload or environment change, and no operation of another spex repository, refuses or delays the sync; an operation of its own clone runs first, the sync joining or following it [[space-21](#space-21)].

#### space-12

When a sync is admitted, the core shall save, then run the other steps for each placement the clone still holds, in the order added [[storage-34](storage.md#storage-34)], the path placement last, and then catch up, the Sync control reading "Syncing…" and each placement's line naming its step in flight [[space-87](#space-87)], each placement ending in one of the outcomes below ([DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

| Step | The core | The line reads |
| --- | --- | --- |
| 1 Save | refresh the managed rules [[storage-17](storage.md#storage-17)], stage the catalog files, refuse a staged ignored-family path, validate the staged tree in a private copy [[storage-12](storage.md#storage-12)], commit that tree, where it differs from `HEAD`'s, on the `HEAD` it was staged against by a conditional ref update | "Saving changes…" |
| 2 Check | read the fresh catalog of the placement's instance and its repository alone [[git-host-22](git-host.md#git-host-22)], prepare its branch where the first push is ahead [[git-host-7](git-host.md#git-host-7)], and fetch its `spex` branch with that instance's brokered credential [[git-host-9](git-host.md#git-host-9)], the path placement fetched with no read | "Checking host…" |
| 3 Compare | plan every unit against the common ancestor of `spex` and that placement's [[storage-11](storage.md#storage-11)] [[space-33](#space-33)]; nothing incoming skips to Push | "Comparing…" |
| 4 Apply | write the selection and one merge commit, or fast-forward [[space-19](#space-19)], then reconcile the clone's placements with their files [[space-91](#space-91)] | "Applying…" |
| 5 Refresh | re-validate and re-index [[space-20](#space-20)] | "Refreshing…" |
| 6 Push | push `spex` to that placement, setting the upstream once at the first placement; skipped for a read-only placement | "Pushing…" |
| 7 Catch up | push `spex` once more, a fast-forward, to each placement a later merge left behind; one rejected runs that placement once more from Check | "Pushing…" |

| Outcome, per placement | State afterwards |
| --- | --- |
| synced | its `spex` equals the clone's; its line reads "Synced just now · N sent · M received", or "Everything is in sync" when nothing moved; a read-only placement's reads "Brought M; nothing sent" |
| behind | the sync leaves its `spex` behind the clone's; its line reads "Behind — Sync again" |
| choices needed | its merge not made, every merge and push before it standing, no operation running once the sync ends [[space-14](#space-14)] |
| stopped | the step, cause and way forward on its line [[space-15](#space-15)] |

- where the repair marker an interrupted Apply left stands, the sync first runs its repair, before Save [[space-67](#space-67)];
- a placement's instance is the one its remote is named by, or the one a follow makes it follow [[space-60](#space-60)] ([DR-127](../decisions/127-a-home-signed-in-to-several-instances.md)).

#### space-91

When a placement's merge in a sync changes the clone's placement files [[storage-36](storage.md#storage-36)], the core shall, before the next placement's turn, reconcile the clone's placements with them ([DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

| The merge left | The core |
| --- | --- |
| a placement's file removed while another file names its host repository at an instance signed in on this device that lists it [[git-host-5](git-host.md#git-host-5)] | renames that placement's remote to that instance's folder as a follow does [[space-60](#space-60)], dropping nothing |
| a placement's file removed otherwise, or changed to name another host repository | drops that placement's remote, the clone's records kept, moving the clone where it is the first placement [[storage-38](storage.md#storage-38)], and offers Attach for the host repository a changed file names [[space-90](#space-90)] |
| two files naming one host repository, by the Git origins and ids the core read [[git-host-5](git-host.md#git-host-5)] | deletes every such file but that of the instance the clone holds it under after any such rename, or, where it holds it under none, of the instance governing it [[git-host-5](git-host.md#git-host-5)], a local change the next sync carries |
| a placement with no file, the path placement among them | drops nothing |
| a file that does not read as its encoding | drops and offers nothing |

- a placement's file removed on this device, or changed there to name another host repository, fares as the first two rows say — the file being the proposal — at the next sync, its Save committing that change and the reconcile coming before that placement's turn;
- a drop the clone's move refuses [[storage-38](storage.md#storage-38)] waits for the next sync, which retries it before that placement's turn and syncs nothing with that placement while it waits;
- two devices placing the clone at one instance meet as one choice of that file [[space-17](#space-17)], the side not chosen dropping its remote at its next sync and leaving its host repository to its owner.

#### space-13

Where the clone's `spex` and a placement's `spex` share no common ancestor, when a sync compares at that placement, the core shall stop that placement with "Unrelated history" unless the sync was started as a join of it, whereupon it shall compare against the empty tree [[storage-11](storage.md#storage-11)] — a unit present on one side only taken, a unit present on both sides with different bytes a choice [[space-17](#space-17)] except at a sign-in's join of a clone holding nothing of its own, where the host's side is taken [[space-59](#space-59)] ([DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

- "Merge histories…" confirms inline, naming that both histories become one and that a unit present on both sides differently will ask for a choice ([DR-010](../decisions/010-interface-craft.md) §4, [DR-159](../decisions/159-projects-in-groups-opened-where-you-work.md));
- a join a sign-in [[space-59](#space-59)], a pick [[space-58](#space-58)], a Place [[space-88](#space-88)] or an Attach [[space-90](#space-90)] starts needs no second confirmation, those acts having said so.

#### space-14

When the Compare step at a placement finds a unit changed differently on both sides without a choice for it [[storage-11](storage.md#storage-11)], that placement shall end in choices needed — its merge not made, the Save commit and every earlier placement's merge and push standing, no lease held — the next placement running and the row reading "Changed here and at <display name>" with Resolve, which shows the picker beneath the row for the first placement in order so ended [[space-9](#space-9)] [[space-17](#space-17)] ([DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md), [DR-159](../decisions/159-projects-in-groups-opened-where-you-work.md)).

#### space-15

When a sync or check step fails, the core shall stop — the placement alone for a Check, Compare or Push cause other than Stop and Git's own error, the next placement running, a Refresh diagnostic stopping nothing [[space-20](#space-20)], and the whole sync, no later placement running, for a Save's or an Apply's stop, any other Refresh failure, Git's own error and Stop — leaving the clone in the state below, and the surface shall show the step, the cause in plain words and its guidance on that placement's line, offering Retry where retrying can help ([DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

| Step | Cause | State left | Surface |
| --- | --- | --- | --- |
| Save | a staged path of an ignored family, or validation refusing a file | index reset, no commit, files untouched | the path or file and reason; "Nothing was saved" |
| Save | `spex` moved while the Save validated — a commit from a terminal | no commit; that commit and every file stand | Git's cause-preserving summary; Retry |
| Check, Push | the host unreachable, or the device offline | commits stand | "Could not reach <host>"; check the network; Retry |
| Check, Push | the host asking to wait — its rate limit [[git-host-11](git-host.md#git-host-11)] | commits stand | "<host> asks to wait N seconds" (or "a moment"); "Retry waits, then runs the step."; Retry, which waits the time out before the step [[git-host-21](git-host.md#git-host-21)] |
| Check, Push | Stop while a call of the step waits out the host's rate limit [[git-host-21](git-host.md#git-host-21)] | commits stand | "Stopped while waiting for <host>"; "Retry waits, then runs the step."; Retry |
| Check, Push | the host answering that this device must sign in again [[git-host-4](git-host.md#git-host-4)] | commits stand | "Sign in again"; that instance's heading's "Sign in again" [[space-3](#space-3)]; Retry after |
| Push | the host explicitly rejecting content above a size limit | commits and the existing access state stand | cause `size_limit`; "<host> refused content above its size limit", carrying the reported limit where unambiguously readable; saved commits remain on this device; address the content limit, then Retry, with no automatic retry ([DR-129](../decisions/129-content-size-is-not-permission.md)) |
| Check, Push | the host refusing with its words — the repository read-only, the push rejected by a rule other than explicit content-size rejection, the account's role too low | commits stand | "<host> refused: <the host's words>" [[space-50](#space-50)]; the placement turns read-only |
| Check, Push | the host no longer listing the repository | commits stand | "No longer shared with you"; the placement turns unreachable; nothing deleted |
| Check, Push | no answer within the transport limit, or Stop | commits stand | "No answer from <host>"; Retry |
| Check, Push | the host answering its transport with an HTTP status no row above reads | commits stand | "<host> answered with an error (HTTP <status>)"; Retry |
| Compare | unrelated history | unchanged | "Merge histories…" [[space-13](#space-13)] |
| Apply | a chosen unit refused by validation | nothing written; its base stands [[space-19](#space-19)] | the unit and reason; the picker stays with the unit marked; Retry |
| Check | a session lease beneath a clone its move would move, a deferred migration move among them [[space-60](#space-60)] | commits stand; the clone where it was, nothing fetched | the session and reason; Retry |
| Apply | a written session's lease held elsewhere, or a written authoring session's turn running [[space-19](#space-19)] | no merge commit; its base stands, the units written before it kept with the repair marker | the session and reason; Retry, whose repair finishes the selection [[space-67](#space-67)] |
| Apply | a written unit changed since its base on the second cycle [[space-19](#space-19)] | no merge commit; its base stands, the units written before it left as local changes | "The space changed twice while syncing"; Retry |
| Refresh | a diagnostic | the merge stands committed | the file and reason under issues |
| Push | rejected as not fast-forward | merge committed, ahead shown | one automatic cycle from Check; a second rejection reads "The host changed again"; Retry |
| any | Git's own error, or a failing system call such as a clone removed meanwhile, otherwise | that step's row | its cause-preserving summary; Retry |

- a generic Git failure summary keeps at most three nonempty lines: the first line containing `fatal:` or `error:` (case-insensitive), else the first line, followed by the final two other distinct lines in their original order; wrapping an already summarized failure preserves that cause and advice;
- a report naming the host prints the display name of the placement's instance [[space-12](#space-12)], and a remote URL never with a credential ([DR-127](../decisions/127-a-home-signed-in-to-several-instances.md));
- no line a report carries — Git's summary and the host's `remote:` words alike — holds a URL under any listed instance's reported Git origin: every placement's remote, with or without `.git` and a trailing `/`, reads as its path in its instance, and any other URL under such an origin as the display name of the instance reporting that origin, the placement's where several do, the path placement's remote reading as itself with any embedded user removed, a code clone's lines naming the code's remote as the reader set it only outside all of them [[space-63](#space-63)] ([DR-120](../decisions/120-the-instance-is-the-space.md), [DR-127](../decisions/127-a-home-signed-in-to-several-instances.md));
- an explicit content-size rejection carries only the instance, the size cause and a reported limit where readable, never its raw transport words, backing-system names or links ([DR-129](../decisions/129-content-size-is-not-permission.md));
- the report stands until the next operation or Dismiss.

#### space-16

While a sync or check runs a transport step — Check or Push — the surface shall offer Stop, which ends the Git child, or the wait of the step's call to the host [[git-host-21](git-host.md#git-host-21)], and leaves that step's stopped state [[space-15](#space-15)]; Save, Compare, Apply and Refresh are bounded local steps and offer no Stop, and the Check step offers it only once its Git child runs or a call of it waits out the host's rate limit, the host read before it otherwise being bounded by the client's own timeout.

#### space-50

Where a failure could turn on what the host let this account do — the host refusing a push or a read [[space-15](#space-15)] — the core shall name in that failure's guidance only what the host said, with the host's own words, and, where membership decides, Share or a member who may share it, in Spex ([DR-064](../decisions/064-honest-remote-failure.md)) ([DR-103](../decisions/103-the-home-and-its-groups.md)) ([DR-120](../decisions/120-the-instance-is-the-space.md)):

- no role name or cached list is read for the guidance: the refusal is the answer;
- an explicit content-size rejection [[space-15](#space-15)] gives no membership or sign-in guidance and keeps its raw transport text private ([DR-129](../decisions/129-content-size-is-not-permission.md));
- a path placement whose remote is a local path, used without the host, names the folder's permissions rather than an account.

### Choices

#### space-17

While conflicting units stand, the picker shall present each as one row — its label [[space-7](#space-7)] and two exclusive choices, "Keep what's here" and "Take <display name>'s", each carrying its side's summary, the host's naming the instance of the placement the choices are for [[space-9](#space-9)] — with nothing preselected and Apply disabled with "N of M chosen" until every row has a choice ([DR-159](../decisions/159-projects-in-groups-opened-where-you-work.md)):

| Unit | Side summary |
| --- | --- |
| session, authoring | updated or deleted; last activity; turn count |
| intent | updated or deleted; its title |
| Environment, Settings, Code, Sync rules, Other | changed at; a View diff control per side [[space-10](#space-10)] |

- "All here" and "All <display name>'s" fill every row at once;
- a deletion on one side against a change on the other reads "deleted" on the deleting side; taking it deletes the whole unit;
- each row is a radio group named by the unit's label, arrow keys moving within it ([DR-010](../decisions/010-interface-craft.md) §6).

#### space-18

When every conflict has a choice and the user activates Apply, the surface shall ask one inline confirm — naming how many units the host's version replaces, that the other version stays in Git history [[storage-11](storage.md#storage-11)], and that a replaced session loses its local resume hints and viewed position — with Cancel focused and Escape cancelling ([DR-010](../decisions/010-interface-craft.md) §4), and on confirmation shall start a sync carrying the choices for that placement [[space-12](#space-12)], and its join while its history is still unrelated [[space-13](#space-13)] ([DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

- Cancel keeps the choices made;
- the sync runs from Save, planning every placement afresh, one already equal to the clone passing as a fast-forward;
- a sync whose Compare finds conflicts that no longer match the choices — the host moved — ends again in choices needed with the new set [[space-14](#space-14)].

#### space-19

When a sync's Apply step runs at a placement, the core shall build the candidate as `select` does [[storage-21](storage.md#storage-21)] — the tree of its base, `spex` as it stands when that placement's Apply begins, with each unit taken whole from its selected side — validate it complete in a private copy before any file is written [[storage-12](storage.md#storage-12)], write each unit whose selected bytes differ from the base's by a versioned replacement naming the base's bytes [[storage-14](storage.md#storage-14)], and, with no Git merge pending, record the candidate's tree as the merge commit with `spex` and that placement's `spex` as parents, or move `spex` to that placement's commit where that tree equals its tree ([DR-111](../decisions/111-the-core-coordinates-as-git-does.md), [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

- The selected files are the filtered bytes validated in the private copy; LFS uses local objects fetched by Check [[space-8](#space-8)], a missing object refusing before live writes, with no download during Apply or its repair [[space-16](#space-16)].
- a unit is every file of it on disk — root, replay descriptor or legacy records, chunks and assets, one added since its base among them — each read as Git reads its path, filters applied, and its write is one versioned write at its instant [[storage-14](storage.md#storage-14)], made only while the clone's folder and its `.git` are the ones the apply began in, every file of the unit holds the base's bytes or the selected ones, a session's management lease is taken, and no turn this core runs for an authoring session instance [[core-service-96](core-service.md#core-service-96)] owns an authoring unit's current recorded instance, a turn its transcript records unfinished refusing nothing, and otherwise refused with no folder made; a file already holding the selected bytes is left as it is;
- live unit reads, replacements, deletions and hint cleanup obey selection's destination-parent checks [[storage-21](storage.md#storage-21)];
- a unit whose selected bytes equal the base's is neither written nor leased, so a session held elsewhere stops no write but its own;
- sessions are written before the other units, so an intent naming a session's newer turn is never written ahead of a session refused at its write;
- each written unit's files are replaced chunks and assets before replay descriptor or legacy replay, the root after those dependencies and, for a replacement root, obsolete dependencies removed afterward, they and its attachment folder owner-only whatever the process umask or the hand that made the folder, its session's hints and viewed marker cleared [[storage-5](storage.md#storage-5)]; once every unit holds its selection, so are those of every session the selection changed, one written before an interruption among them;
- the index is set to the candidate's tree and the commit records that tree, never the working tree, so what another process writes beside the apply stays a local change;
- the working tree never holds Git's own merge output — no conflict marker, no `MERGE_HEAD`;
- a refused write records no merge commit, its base standing: a held lease or a running authoring turn stops the sync naming the session with the repair marker kept, so units naming one another are finished together by the next admission's repair [[space-67](#space-67)]; a changed unit removes the marker, leaves the units already written as local changes equal to that placement's side, and restarts the sync once from Save, stopping on the second time — where such a change leaves a written unit naming one not written, the restart's Save refuses it, naming the file for the reader to repair [[space-15](#space-15)]; a moved clone stops it with the marker where the clone now lies [[space-15](#space-15)];
- an unsafe destination stops Apply with its repair marker and already-written units retained, deferring live refresh until the folder is restored and Retry repairs the selection [[space-20](#space-20)];
- an apply interrupted before its commit lands is repaired from its recorded selection [[space-67](#space-67)].

#### space-20

When a sync's Apply step has changed the working tree — by merge or fast-forward, by the units it wrote before a changed unit refused its write [[space-19](#space-19)], or by a repair [[space-67](#space-67)] — the core shall re-validate [[storage-12](storage.md#storage-12)] and re-index the clone before the sync pushes, restarts or stops, so every view reflects the working tree without a restart:

- a session whose bundle changed is announced with its history replaced [[core-service-87](core-service.md#core-service-87)], a new one served and a deleted one forgotten as the shared store's arrivals and departures are [[core-service-60](core-service.md#core-service-60)] [[core-service-76](core-service.md#core-service-76)], and the project's ledger is announced changed [[core-service-51](core-service.md#core-service-51)];
- the intents, a group's own environment and the preferences are re-read, and the configuration reloads through its ordinary reload [[core-service-2](core-service.md#core-service-2)], that environment's exports refreshed [[environments-8](environments.md#environments-8)];
- before partial-write refresh, inspect the live record and settings families without following links; an unsafe parent defers validation and re-indexing, reports the path with instructions to restore the folder then Retry, and preserves the repair marker and written bytes [[space-19](#space-19)];
- a diagnostic found here is reported under issues and undoes nothing; it refuses no later sync, whose Save validates the staged files and names any still invalid [[space-15](#space-15)], and a Save whose staged files validate clears it.

#### space-21

While a sync, check, join, move, Place, Leave or Attach of a spex repository is running, the core shall refuse no command and no operation because it runs ([DR-111](../decisions/111-the-core-coordinates-as-git-does.md), [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

- every write beneath the clone lands or is refused at its own instant — a file changed since its writer read it as "changed meanwhile; retry", a session's lease as that session's refusal — and the runtime's own admission of messages stays;
- each of the core's own writes beneath the clone resolves the clone's address at that write, never at an earlier read, so no write lands where a moved or removed clone stood and no folder is made there again;
- the clone's own operations run one at a time on its machine [[space-31](#space-31)]: a second Sync asked while a sync runs, or a Check asked while a sync or a check runs, joins that operation, a Sync asked while a check runs follows it, making no Save until that check has ended, and a Place, a Leave or an Attach asked while a sync runs follows it as a Sync follows a check; no other command waits for any of them;
- a remote or recorded host id the core writes is written only while the clone's remotes still read what the core read before awaiting the host, and refused as changed meanwhile otherwise;
- an operation's progress is its own, ended by it alone, and what it shows is no reason to wait.

#### space-67

While a clone holds the repair marker an interrupted Apply left [[space-31](#space-31)], the core shall finish the marker's recorded selection before it reopens that clone at its start, and at each sync's admission as the first work of that sync's operation, before its Save, so a second admission joins that work and no two repairs of one marker run at once [[space-21](#space-21)]:

| The repair finds | Outcome |
| --- | --- |
| `spex` on the recorded base | each unit written as Apply writes it [[space-19](#space-19)], a file already holding the selected bytes accepted, then the same tree recorded with the same parents and the marker removed |
| a file holding neither the recorded base's bytes nor the selected ones | that file left as it stands, the marker removed, no merge commit; the sync goes on from Save and replans |
| `spex` moved off the recorded base — the merge landed, or a terminal commit moved it on | the marker removed with nothing written |
| a write refused for a held session lease or a running authoring turn [[space-19](#space-19)], or any other failure | the marker standing as a blocking issue, and the sync admitted stopped naming the session or the cause; the next admission repairs again |

- a sync's repair reads as its Apply step while it runs [[space-12](#space-12)];
- the sync's blocking issues — those of its own clone's files that its admission set aside while the marker stood among them [[space-11](#space-11)] — are read again once its repair has ended, one standing then stopping the sync before Save with the file and reason.

#### space-22

When a sync completes a placement's turn through its Push, or through Refresh for a read-only placement, the core shall record its time and its counts of units sent to and received from that placement in the preference store [[storage-5](storage.md#storage-5)] under `sync:<repository>:<placement>:last`, never in a tracked file ([DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)).

### Explorer and Privacy

#### space-23

While a spex repository's Explore tab is shown, the Space surface shall present its clone as a read-only tree with a preview pane beside it, every entry annotated from the catalog [[storage-1](storage.md#storage-1)]:

| Annotation | Content |
| --- | --- |
| what it is | the catalog family's description — session manifest, session records, session chunks, provider hints, intent, intent attachments, authoring session, spec package requests, spec package lock, spec package, settings, code remote, placement, installed spec packages, exported skills, sync rules, lease, Git data — or "Not a Spex file" |
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

While the Explore tab is shown, the Space surface shall present a "Stays on this device" panel listing every ignored family of the catalog [[storage-1](storage.md#storage-1)] with one plain reason each:

| Family | Reason |
| --- | --- |
| provider hints | resume tokens for this machine's agent conversations; they work nowhere else |
| leases and locks | which process is writing right now |
| installed spec packages and exported skills | copies installed from the lock; every device installs its own |
| where projects live | where your working folders are on this machine, in the home file |
| preferences | where you last stopped reading in each session |
| credentials | this device's sign-in to each instance |
| migration receipts and inputs | original files kept from an upgrade |
| temporary files | copies made while writing |

- the panel collapses and remembers its state as chrome preference ([DR-030](../decisions/030-workspace-chrome.md)).

#### space-26

When the user activates a reveal control — beside a spex repository's row, or in the preview pane for its entry — the surface shall reveal that path in the OS file manager through the native bridge where it exists [[app-shell-28](app-shell.md#app-shell-28)], and where the bridge is absent shall offer Copy path instead, acknowledging the copy in words ([DR-010](../decisions/010-interface-craft.md) §3):

- the reveal control reads "Show in Finder" on macOS and "Show in folder" elsewhere;
- where the page has no clipboard access, Copy path falls back to a selectable read-only field holding the path.

### Copy and Fit

#### space-27

User-facing copy on the surface shall say "mine" and "the host's", or "this device" and the display name of the placement's instance [[space-12](#space-12)], for a sync's sides and plain step names, never `ours`, `theirs`, `HEAD`, a remote-tracking branch such as `origin/spex` or `@<host>/spex`, `MERGE_HEAD` or a Git command as primary copy — the raw term surviving in a tooltip ([DR-010](../decisions/010-interface-craft.md) §2) — and shall say "instance" for an instance, "spex repository" and "group" for its things, and never "namespace", "remote" or "space" for those objects — Space naming this IDE destination and Spex Space the hosted product ([DR-150](../decisions/150-spex-space-product-and-destination.md)) ([DR-127](../decisions/127-a-home-signed-in-to-several-instances.md), [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)).

#### space-28

The Space surface shall fit its pane at every width down to the 320-pixel floor ([DR-041](../decisions/041-chrome-that-fits.md)):

- while an instance is listed and Git runs, the existing Refresh and issues controls share the surface title row, wrapping within its width; the first sign-in and missing-Git cards keep their full row;
- below 28rem a group heading keeps its own row above its actions, so the actions never squeeze the group name between them;
- below 42rem an instance heading's at-a-glance read time yields, and below 20rem the header's fields and an instance heading's stack with the primary control last and full-width;
- in each repository row and change row the label owns the slack and truncates with its title, the code remote and detail hiding below 28rem, the row's control keeping its accessible name;
- the tree and preview stand side by side from 42rem and stack below it, the preview under the tree; the preview's box scrolls inside itself and the diff box scrolls sideways as a canvas;
- every control reads at most 14 characters, its busy form included: Sign in, Sign in again, Signing in…, Sign out, Signing out…, Sync now, Syncing…, Check host, Checking…, Stop, Open here, Opening…, Show, More, Connect, Disconnect, Resolve, Members, Retry, Retrying…, Apply, Applying…, Cancel, Continue, Save, Saving…, Add project, Adding…, Choose folder…, Open folder…, Open project, View diff, Hide diff, All here, Open session, Show in Finder, Show in folder, Copy path, Refresh, Dismiss, New group, New subgroup, Share, Create, Creating…, Add, Rename, Delete, Deleting…, Keep, Move…, Moving…, Forget, Add instance…, Place at…, Placing…, Leave…, Leaving…, Attach, Attaching…, "Move…" bearing "Move to another group", "Add instance…" bearing "Another instance", and "Place at…" bearing "Also place at <display name>" and "Leave…" bearing "Remove from <display name>" where one instance is offered, each as its title and accessible name; a menu's entries and the acts a decision fixes as whole phrases — "Add to a group…", "Merge histories…", "Not on this computer", "Open on <server>", "Show on <server>", "Keep what's here", "Take <display name>'s", "All <display name>'s" — stand outside the budget and wrap within their row ([DR-159](../decisions/159-projects-in-groups-opened-where-you-work.md));
- the surface scrolls inside its own box and the page never scrolls.

### On a Seat

#### space-102

Where the core runs as a seat [[core-service-125](core-service.md#core-service-125)], when a sign-in completes [[space-4](#space-4)], the core shall skip your own group's placement — creating and joining nothing for it at the instance, its clone staying local with the seat's settings — and offer "Add to a group…" on it nowhere, so that the member's own records never land on the server ([DR-132](../decisions/132-team-servers.md)).

#### space-103

Where the core runs as a seat [[core-service-125](core-service.md#core-service-125)], when the reader opens a spex repository at the seat [[space-63](#space-63)] [[space-111](#space-111)] or picks one for a project [[space-58](#space-58)], the core shall allocate the working folder itself at `projects/@<host>/<group path>/<repository>/` under the Spex home [[storage-1](storage.md#storage-1)], `<repository>` the repository's own path name with its `-spex` kept, so that no project's folder lies inside another's, clone the records there and the code into that folder [[projects-37](projects.md#projects-37)], and pair the two ([DR-132](../decisions/132-team-servers.md)):

- a code clone that fails leaves the records cloned and their sessions and intents readable, the row showing the failure, and, where the remote is an `https` remote whose host has no token of the member's [[storage-44](storage.md#storage-44)] and is at no signed-in instance's Git origin, "Code not cloned: <host> needs a credential of yours. Add one under Settings." with the host in the row's `credential`, so a client opens the Credentials section [[settings-48](settings.md#settings-48)]; where the member's token for that host cannot be read [[storage-44](storage.md#storage-44)], "Code not cloned: your credential for <host> cannot be read" with the host in `credential` likewise; any other failure shows as it is;
- a retry — a join of the same repository again — after the credential is placed runs the code clone alone, into the same folder;
- a folder already allocated for that repository is reused, never a second one made.

#### space-108

When `space.signin.start` requests `reportCompletion: true`, the core shall report that attempt's terminal outcome to its initiating connection as `space.signin.completed` with the start request's `id` and instance, independently of aggregate Space state:

- The ordinary start reply precedes completion, including an immediately settling attempt [[git-host-3](git-host.md#git-host-3)].
- Success is `{ ok: true, account: { id, login, displayName } }` only after token acceptance and the home account update [[git-host-2](git-host.md#git-host-2)]; it claims no later catalog/setup or Sync outcome.
- Failure is `{ ok: false, error: { code, message, details? } }` using the existing error codes and safe explanations; an accepted stop is `aborted`.
- Disconnect neither replays the start nor cancels or revokes sign-in; completion references are released after settlement with no persistent operation store.
- Starts without `reportCompletion` retain their existing replies, state and setup behavior.

#### space-109

When `space.signin.cancel` names a `startId`, the core shall stop only the still-running sign-in begun by that request on the same connection, retaining the existing sign-in commit and cancellation boundaries [[git-host-2](git-host.md#git-host-2)] [[git-host-3](git-host.md#git-host-3)]:

- A mismatch, foreign connection or committed/replaced attempt returns `{ stopped: false }` and changes nothing.
- A matched stop returns `{ stopped: true }` and a reported attempt completes with `aborted` [[space-108](#space-108)].
- Omitting `startId` retains the existing current-flow cancellation behavior.

## Internal Behavior

### Protocol

#### space-29

The core shall expose the Space surface through these commands and messages, each reply validated against the command schema, `repository` naming a spex repository by its key, `instance` an instance by its origin, and `group` a group by its host id at that instance ([DR-127](../decisions/127-a-home-signed-in-to-several-instances.md)):

| Command | Input | Result | Errors |
| --- | --- | --- | --- |
| `space.get` | — | `GroupsState` [[space-30](#space-30)] | — |
| `space.refresh` | — | `{ accepted: true }` | `invalid_request` (no instance signed in) |
| `space.signin.start` | `{ url, reportCompletion?, ticket? }` — the instance's URL as the reader gave it, held by its origin [[storage-2](storage.md#storage-2)]; `ticket` the admission's ticket a seat's device request carries [[git-host-27](git-host.md#git-host-27)] | `{ flow: "browser", url } \| { flow: "device", userCode, verificationUri, expiresAt, interval }` | `busy` (a sign-in in flight at any instance), `invalid_request` (a URL the origin rule refuses, naming the rule [[git-host-2](git-host.md#git-host-2)], or a `ticket` off a seat [[git-host-27](git-host.md#git-host-27)]) |
| `space.signin.cancel` | `{ startId? }`, matched as [[space-109](#space-109)] states | `{ stopped: boolean }` | — |
| `space.signout` | `{ instance }` | `GroupsState` | `invalid_request` (signed out), `conflict` (the stored sign-in changed meanwhile [[git-host-10](git-host.md#git-host-10)]) |
| `space.forget` | `{ instance }` | `GroupsState` | `invalid_request` (signed in; a clone still of that instance or a placement still at it, naming each such spex repository or the session refusing its follow [[space-82](#space-82)]) |
| `space.pick` | `{ repository, choice: { kind: "join", instance, hostId } \| { kind: "create", instance, groupId: string \| null, name }, noticed?: boolean }` — `instance` the one the choice is at; `name` without its `-spex` suffix, which the core appends; `groupId` a group's host id there, null for your namespace there | `{ accepted: true }` after the creation or the join is accepted at the host, the push following as state | `invalid_request` (not local only; an instance other than the clone's where its key lies under one [[space-58](#space-58)]; malformed name; the name taken at the host; a repository another clone here holds; a group, or a repository in a group, held as colliding [[space-61](#space-61)], with that cause; the notice not seen for a join into a repository with other members [[space-57](#space-57)]), `not_found` (a spex repository, or a group of the instance, the view does not list — your namespace's id among them [[git-host-6](git-host.md#git-host-6)]), `conflict` (a remote set meanwhile [[space-21](#space-21)]) |
| `space.join` | `{ instance, hostId, folder?: string }` — `instance` the one its row stands under [[space-1](#space-1)] | `{ accepted: true }` | `invalid_request` (already here, or named by a placement file of a clone here [[space-87](#space-87)]) |
| `space.place` | `{ repository, choice: { kind: "join", instance, hostId } \| { kind: "create", instance, groupId: string \| null, name }, noticed?: boolean }` — as `space.pick`'s, at an instance the clone holds no placement at [[space-97](#space-97)] | `{ accepted: true }` after the creation or the join is accepted at the host, the sync following as state | `invalid_request` (local only; a group's or your own group's own spex repository; an instance it holds a placement at; the view not saying the person may manage the members of every placement it holds; malformed name; the name taken at the host; a repository another clone here holds; a group, or a repository in a group, held as colliding [[space-61](#space-61)], with that cause; the notice not seen for a join into a repository with other members [[space-57](#space-57)]), `not_found` (as `space.pick`'s), `conflict` (a remote set meanwhile [[space-21](#space-21)]) |
| `space.leave` | `{ repository, instance, confirmed?: boolean }` — `instance` the placement's [[space-98](#space-98)] | `{ accepted: true }`, its outcome as state | `invalid_request` (a group's or your own group's own spex repository; no placement at that instance), `not_found` |
| `space.attach` | `{ repository, instance, noticed: boolean }` — `instance` the one a placement file names [[space-99](#space-99)] | `{ accepted: true }` | `invalid_request` (a group's own spex repository, which stays in its group at one instance [[space-87](#space-87)]; signed out; no file naming a host repository that instance lists; one already attached, or held by another clone here; a repository in a group held as colliding [[space-61](#space-61)], with that cause; the notice not seen), `conflict` (a remote set meanwhile) |
| `space.members` | `{ instance?: string, group?: string, repository?: string }` — exactly one of `group` and `repository`, `instance` naming the group's instance or the repository's placement, its first where a repository's is omitted | `{ members: Member[] }` | `invalid_request` (local only; signed out; neither or both targets; no placement at that instance), `not_found` (a group or spex repository the view does not list) |
| `space.group.create` | `{ instance, name, path, parent: string \| null }` — `path` the group's own path segment, `parent` a group's host id there, null for the instance's root | `{ group: { id, fullPath, name } }` after the host answered and the state listing the group was broadcast [[git-host-15](git-host.md#git-host-15)] | `invalid_request` (signed out; a blank name or path; the name taken there; the host refused, with its words), `not_found` (a parent the view does not list) |
| `space.group.rename` | `{ instance, group, name?, path? }` — `path` its own path segment | `{ group: { id, fullPath, name } }` after the host answered and the state holding the group renamed was broadcast [[git-host-18](git-host.md#git-host-18)] | `invalid_request` (signed out; neither a name nor a path; a blank name or path; the path taken there; the host refused, with its words; the host could not be reached), `not_found` (a group of the instance the view does not list; the host found none, with its words) |
| `space.group.delete` | `{ instance, group }` | `{ deleted: true }` after the host answered and the state without the group was broadcast [[git-host-19](git-host.md#git-host-19)] | `invalid_request` (signed out; a spex repository or a group the view lists under it; the host refused, with its words; the host could not be reached), `not_found` (a group of the instance the view does not list; the host found none, with its words) |
| `space.repository.move` | `{ repository, instance?: string, groupId: string \| null }` — `instance` the placement's, its first where omitted; `groupId` a group's host id there, null for your namespace there | `{ repository: { id, fullPath } }`, `fullPath` its path in the instance after the move, after the host answered and the state holding it in its new group was broadcast [[git-host-20](git-host.md#git-host-20)] | `invalid_request` (signed out; local only; no placement at that instance; a group held as colliding [[space-61](#space-61)], with that cause; the name taken in that group; the host refused, with its words; the host could not be reached), `not_found` (a spex repository or a group the view does not list; the host found none, with its words) |
| `space.share` | `{ instance?: string, group?: string, repository?: string, login, role }` — exactly one of `group` and `repository`, `instance` naming the group's instance or the repository's placement, its first where a repository's is omitted | `{ members: Member[] }` as the host lists them after the addition [[git-host-16](git-host.md#git-host-16)] | `invalid_request` (signed out; neither or both targets; no placement at that instance; a blank login; a role not among the view's; the host refused, with its words), `not_found` (no account under the login, with the host's words; a group or spex repository the view does not list) |
| `space.unshare` | `{ instance?: string, group?: string, repository?: string, login }` — exactly one of `group` and `repository`, `instance` naming the group's instance or the repository's placement, its first where a repository's is omitted | `{ members: Member[] }` as the host lists them after the removal [[git-host-17](git-host.md#git-host-17)] | `invalid_request` (signed out; neither or both targets; no placement at that instance; a blank login; the host refused, with its words), `not_found` (no account or no membership of its own under the login, with the host's words; a group or spex repository the view does not list) |
| `space.remote.set` | `{ repository, url: string \| null }` — the clone's path placement, `origin`, set or removed alone, its instance placements untouched [[space-5](#space-5)] | `GroupsState` | `invalid_request` (no Git; not initialized; a malformed or credential-bearing URL, or one under an instance's Git origin [[space-5](#space-5)]), `conflict` (the clone's remote changed meanwhile [[space-21](#space-21)]) |
| `space.fetch` | `{ repository }` | `{ accepted: true }` | `invalid_request` (local only) |
| `space.sync` | `{ repository, placement?: string \| null, choices?: Record<unit, "mine" \| "remote">, join?: boolean, noticed?: boolean }` — `placement` the one `choices`, `join` and `noticed` are for — its instance's origin, or null for the path placement — required with any of them | `{ accepted: true }` | `invalid_request` (local only, merge pending, blocking diagnostic [[space-11](#space-11)]; a placement the clone does not hold; unknown unit; a choice for a unit that is not a conflict; the notice not seen where no other placement could run [[space-57](#space-57)]) |
| `space.cancel` | `{ repository }` | `{ stopped: boolean }` | — |
| `space.diff` | `{ repository, unit, path, side: "mine" \| "remote", placement?: string \| null }` — `placement` the one the `remote` side is of, its first where omitted | `{ patch: string, truncated: boolean }` | `invalid_request` (a session, intent or authoring unit; unknown unit or path; no check yet for a remote side) |
| `space.tree` | `{ repository, path?: string }` | `{ path: string, entries: SpaceEntry[] }` | `invalid_request` (path escaping the clone), `not_found` |
| `space.read` | `{ repository, path: string }` | `{ kind: "text", text, lines, truncated } \| { kind: "withheld", reason } \| { kind: "binary", size }` | `invalid_request` (outside the clone, a symlink, `.git`, not a file), `not_found` |
| `space.repair.decline` | `{ repair: string, declined: boolean }` | `GroupsState` | `invalid_request` (no repair of that name stands) |

- "signed out" in an error means that the instance the command acts at is not signed in, and an `instance` the home does not list is refused `not_found`;
- the device flow's `verificationUri` is the verification URL the host completed with the user code where it gave one [[git-host-3](git-host.md#git-host-3)], and `userCode` is carried for clients and tests, never shown by the surface [[space-3](#space-3)];
- `space.state { state: GroupsState }` is broadcast to every client on each transition of any repository's machine [[space-31](#space-31)], on a sign-in's start and end, and when a full read of any instance starts or settles; long commands reply `accepted` at once and their outcome is state, never a hung reply ([DR-010](../decisions/010-interface-craft.md) §5);
- each repository in a reply or broadcast carries its phase, placement lists and local units from one coherent reading: a read crossing an operation's progress or completion cannot pair an ending phase with earlier lists, and an older read cannot replace a newer completed plan [[space-8](#space-8)] [[space-33](#space-33)];
- the interface re-pulls `space.get` when the surface mounts, on window focus, and — debounced — on `session.state`, `session.removed`, `intents.changed` and `config.state` while the surface is shown.

#### space-30

The core shall shape `GroupsState` as:

```ts
interface GroupsState {
  home: string;
  git: { ok: true; version: string } | { ok: false; guidance: string };
  defaultInstance: string;   // the default instance's origin, which the sign-in card holds (space-3)
  signIn: { phase: "idle" }
    | { phase: "running"; instance: string; flow: "browser" | "device"; userCode?: string; verificationUri?: string; since: number }   // instance: the origin being signed in to
    | { phase: "failed"; instance: string; cause: "denied" | "expired" | "refused" | "unreachable"; message: string };
  own: { name: string; named: boolean; repositories: RepositoryState[] };   // your own group, keyed `own`: its folder name, whether that folder still bears this device's user name, and its rows (space-1)
  instances: {
    origin: string;                      // the instance's origin, naming it in every command
    host: string;                        // its host name
    displayName: string | null;          // as last read, null until one is
    account: { id: string; login: string; displayName: string | null; canCreateGroup: boolean };   // the account there; canCreateGroup: as its last read said, false until one is held
    signedIn: boolean;
    hostSignedOut: boolean;              // it signed this device out, held for the core's run (space-3)
    read: { phase: "idle" } | { phase: "running" } | { phase: "failed"; message: string }; // its full read and accepted Refresh setup; idle while signed out
    readAt: number | null;               // its last complete view, retained while reading or after failure
    roles: { id: string; name: string; mayPush: boolean }[];   // its own roles in its order, empty until a read is held
    groups: { id: string | null; login: string | null; mine: boolean; fullPath: string; name: string;   // keyed with the instance by id, a namespace by login; id null for a namespace and a key's group no read lists; login: your login there, mine, or another account's; fullPath: the path in the instance
              can: { createSubgroup: boolean; manageMembers: boolean; rename: boolean; delete: boolean };   // what its last read said the person may do there; all false until one is held
              placed: { key: string; name: string }[];   // the rows standing elsewhere one of whose placements this group or namespace holds, each shown as one line (space-1)
              repositories: RepositoryState[] }[];   // its groups, your namespace there and each other account's login under which it lists a spex repository (space-1)
  }[];   // every instance the home lists, in its order (space-1)
  diagnostics: { file: string; reason: string; blocking: boolean; repair?: Repair }[];
  issues: number;
  // Repair: { kind: "repository" | "folder"; repository?: string; name?: string; group?: string;
  //   directories: string[]; sessions: number; key: string; declined?: number;
  //   checked?: { path, here, repo, claimedBy?, unknown? }[];
  //   proposal?: { path: string; from: "recorded" | "beside-projects" } }
}
interface RepositoryState {
  key: string;                           // the clone's path under workspace/, or, with no clone here, the one a Join would make; for a row an instance lists in a group it holds as colliding, `@<host>/<path>@<id>`, naming that instance and no clone (space-61)
  instance: string | null;               // its instance's origin (storage-31), null for a clone with none
  governing: string | null;              // the origin of the instance governing it (space-61), null while none does
  name: string; id: string | null; own: boolean; code: string | null; folder: string | null;   // id: its first placement's host id, or the listed repository's with no clone here
  state: "local-only" | "reachable" | "read-only" | "unreachable" | "absent";   // the row's state (space-61)
  reason: string | null;                 // the host's words for read-only or unreachable
  mergePending: boolean;                 // a Git merge pending from a terminal in the clone (space-11); false where no clone is here
  placements: PlacementState[];          // in the order added, the path placement last, then each a placement file names that a signed-in instance lists and no remote here holds, then each instance a creation waits at (space-87); while local only, only the lines its placement files name and a creation waiting; for a row with no clone, its one listed placement with `attached` false and `state` "absent"
  placedAt: string[];                   // the origin of each instance a placement file of the clone names, held here or not (space-62)
  local: SpaceUnit[]; conflicts: SpaceConflict[];   // conflicts: every placement's, in the placements' order
  sync:
    | { phase: "idle" }
    | { phase: "running"; op: "sync" | "check" | "join" | "move" | "place" | "leave" | "attach"; placement?: string | null; step: SyncStep; since: number; cancelable: boolean }   // placement: the one in flight, its instance's origin or null for the path placement
    | { phase: "choices"; placement: string | null; savedCommit: string | null }
    | { phase: "unrelated"; placement: string | null }
    | { phase: "stopped"; op: "sync" | "check" | "join" | "move" | "place" | "leave" | "attach"; step: SyncStep; cause: SyncCause; message: string; guidance: string; retry: boolean; count?: number; credential?: string }   // count: a leave's units no remaining placement received (space-98); credential: on a seat, the code host a join's failed code clone needs a credential of the member's for (space-103)
    | { phase: "done"; at: number; sent: number; received: number; pushed: boolean };
}
interface PlacementState {
  instance: string | null;              // its instance's origin; null for the path placement
  path: string;                         // its path in the instance, or the path placement's remote as a report reads it (space-15)
  id: string | null;                    // the host's id there
  attached: boolean;                    // false for one a placement file names, or a creation waits at, and no remote here holds (space-87)
  state: "reachable" | "read-only" | "unreachable" | "absent";
  reason: string | null;                // the host's words for read-only or unreachable
  waiting: { step: "create" | "branch"; group: string; message: string } | null;   // a creation or branch preparation waiting at the host (space-64)
  members: number | null; visibility: string | null;
  can: { manageMembers: boolean; transfer: boolean };   // what its instance's last read said the person may do on it — manage its members, move it to another group; both false until one is held
  branch: { ahead: number | null; behind: number | null; checkedAt: number | null; hostEmpty: boolean; unrelated: boolean;
            agreed: { at: number; current: boolean } | null } | null;   // against this placement's `spex`; agreed: the commit `spex` last shared with it as the clone last fetched or pushed it — its commit time, and whether `spex` is that commit; null where the clone holds none (space-61)
  incoming: SpaceUnit[]; conflicts: SpaceConflict[];   // conflicts: its incoming units this device changed too, each a choice to make (space-8)
  lastSync: { at: number; sent: number; received: number } | null;
  noticed: boolean;
  outcome: null
    | { kind: "synced" | "behind" | "choices" | "unrelated" | "waiting"; sent: number; received: number }
    | { kind: "stopped"; step: SyncStep; cause: SyncCause; message: string; guidance: string; retry: boolean };   // what the last sync left on its line (space-87)
}
type SyncStep = "save" | "check" | "compare" | "apply" | "refresh" | "push" | "code";   // code: a join's code clone
type SyncCause = "unreachable" | "throttled" | "reauth" | "refused" | "size_limit" | "gone" | "timeout" | "stopped" | "rejected"
  | "validation" | "lease" | "writer" | "unrelated" | "git" | "unreceived";   // throttled: the host asked to wait (space-15); size_limit: content above the host's size limit (space-15); unreceived: a leave's units no remaining placement received (space-98)
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
idle ─sync/join→ save ─→ [each placement in order: check ─→ compare ─→ apply ─→ refresh ─→ push] ─→ catch-up ─→ done ─→ idle
idle ─sync/join, repair marker standing→ repair ─→ save;  repair: lease | authoring turn | failure | blocking issue → stopped
idle ─fetch→ [each placement in order: check] ─→ idle
idle ─place→ (create or join at the host) ─→ save ─→ … as a sync;  idle ─attach→ (remote added) ─→ save ─→ … as a sync
idle ─leave→ (follow, or check of that placement ─→ drop, with the move for the first) ─→ idle;  leave: unreceived or unread and unconfirmed | lease | destination taken | next placement unread → stopped
save: ignored path staged | validation | commit error → stopped
check: host refused | reauth | gone | throttled | transport | timeout | notice owed | move: destination taken | lease | changed meanwhile → next placement;  host empty → push;  Stop → stopped
compare: conflict without choice → next placement (choices);  no ancestor and not a join → next placement (unrelated);  nothing incoming → push
apply: a written unit changed since its base (first) → save;  validation | lease | authoring turn | moved | changed twice → stopped
refresh: diagnostic → push;  unsafe parent → stopped
push: rejected (first) → check;  rejected twice | refused | throttled | transport | timeout → next placement;  Stop → stopped;  read-only → next placement
catch-up: rejected (first) → that placement's check;  rejected again → that placement behind
any step: Git's own error → stopped
done: a placement in choices → choices;  choices ─sync with choices→ save;  unrelated ─sync with join→ save;  stopped ─Dismiss or next→ idle
```

- one full rescan of the clone runs as `refresh`;
- `check` makes a placement's follow and, for the key placement, the clone's move, a deferred migration move among them, before any fetch or push there [[space-60](#space-60)]; `apply` handles its unit-write refusals [[space-19](#space-19)] and reconciles the placements with their files [[space-91](#space-91)];
- before the first file is replaced, `apply` records the placement, its base, the plan's revisions, ancestor and choices in an ignored `<clone>/.spex-apply.json` and removes it after the ref update lands or a changed unit refuses its write [[space-19](#space-19)]; a marker left standing is finished by the repair [[space-67](#space-67)];
- `sync:<repository>:<placement>:last` persists in the preferences [[storage-5](storage.md#storage-5)]; the sync's transient state persists nowhere;
- a row read while an operation runs reads the clone at that instant, keeping that operation's own lists.

#### space-32

The core shall invoke Git as a child process per step, never through a shell, from the clone, with this environment and these commands, `<remote>` being the name of the remote of the placement a step runs on — its instance's folder, `@<host>` [[storage-34](storage.md#storage-34)], or `origin` for the remote the reader named [[space-5](#space-5)] ([DR-127](../decisions/127-a-home-signed-in-to-several-instances.md), [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

- environment: the core's captured environment plus `GIT_TERMINAL_PROMPT=0`, `LC_ALL=C`, `LANG=C`, and `GIT_SSH_COMMAND=ssh -oBatchMode=yes` only where none is set; for a transport to a placement's instance's Git origin, `-c credential.helper=` naming the app's own helper and the credential that instance brokers [[git-host-9](git-host.md#git-host-9)], and for any other origin the device's own credential helpers; `process.umask(0o077)` around a new clone's `init` and its commits, which run synchronously, restored after; a join's `clone` and `checkout` children each spawned under `0o077`, the core's own umask restored before it awaits them; a 120-second limit on `ls-remote`, `fetch`, `clone` and `push` after which the child receives `SIGTERM`, then `SIGKILL` after five seconds;
- commit-writing commands carry `-c commit.gpgsign=false -c core.hooksPath=/dev/null`, and `-c user.name=<login> -c user.email=<login>@users.noreply.<host>` where the clone's instance [[storage-31](storage.md#storage-31)], its key placement's, is signed in, the account's there and that instance's host name, else `-c user.name=Spex -c user.email=spex@<hostname>` only where `git var GIT_COMMITTER_IDENT` fails;
- state: `--version`, `rev-parse --show-toplevel`, `rev-parse --git-dir`, `symbolic-ref -q --short HEAD`, `rev-parse -q --verify HEAD^{commit}`, `rev-parse -q --verify MERGE_HEAD`, `config --local --get-regexp ^remote\..+\.url$` for the placements in the order added, `remote get-url <remote>`, `config --get remote.<remote>.spexId`, `config --get branch.spex.remote`, `rev-parse -q --verify refs/remotes/<remote>/spex^{commit}`, `rev-list --left-right --count HEAD...refs/remotes/<remote>/spex`, `rev-list --count HEAD` where the host holds no `spex`, `status --porcelain=v1 -z -uall`, for the last sync a clone holds `merge-base <spex> <remote>/spex` and `log -1 --no-show-signature --format=%ct <commit>` [[space-61](#space-61)], and for a sign-in's join `config --local --get spex.bootstrap`, `log --no-show-signature -n <saves+2> --format=%H <saved HEAD>` and `rev-parse <saved HEAD>^{tree} <bootstrap>^{tree}` to prove an unchanged generated bootstrap [[space-59](#space-59)];
- initialize and the remote: `init -q -b spex`, falling back to `init -q` then `symbolic-ref HEAD refs/heads/spex`, and `config --local spex.bootstrap <initial commit>` only for a completely generated own-group bootstrap [[space-59](#space-59)]; `clone -q --origin <remote> --branch spex --single-branch <url> <clone>` for a join, falling back to a clone of the default branch followed by `checkout -q -b spex` where the host holds no `spex` yet; `remote add <remote> <url>` then `config remote.<remote>.spexId <id>`, and for a repository the core created [[git-host-7](git-host.md#git-host-7)] `config remote.<remote>.spexCreated <id>` first, then `config remote.<remote>.url <url>`, `config remote.<remote>.fetch +refs/heads/*:refs/remotes/<remote>/*` and `config remote.<remote>.spexId <id>` in place of `remote add`, so its remote never stands without the flag; `remote set-url <remote> <url>`, `remote rename <remote> <new>` for a follow [[space-60](#space-60)] [[space-82](#space-82)] [[space-91](#space-91)] [[space-98](#space-98)], `config --remove-section remote.<remote>` with `update-ref -d refs/remotes/<remote>/spex` to drop a placement, `update-ref -d refs/remotes/origin/spex` for the former path placement where the reader names another [[space-5](#space-5)], and `config --unset branch.spex.remote` where the remote dropped or replaced was the upstream;
- save: the managed-rules writer, `add -A -- .`, `diff --cached --name-only -z`, `write-tree` and `rev-parse HEAD` before validation, `read-tree <tree>` and `checkout-index -a -f --prefix=<private copy>/` under a temporary `GIT_INDEX_FILE`, `rev-parse <that HEAD>^{tree}`, `commit-tree <tree> -p <that HEAD> -m <message>`, `update-ref refs/heads/spex <commit> <that HEAD>`, `reset -q` on refusal; and for every version check, `hash-object --stdin-paths` over a unit's files;
- check: `ls-remote --exit-code --heads <remote> refs/heads/spex` (exit 2 means no `spex`), `fetch -q --no-tags <remote> +refs/heads/spex:refs/remotes/<remote>/spex`, `merge-base HEAD <remote>/spex`; `config --get remote.<remote>.spexCreated`, and `config --unset remote.<remote>.spexCreated` where the clone records a creation there [[git-host-7](git-host.md#git-host-7)]; for a default branch the core pushes itself [[git-host-7](git-host.md#git-host-7)], `hash-object -w --stdin` on the README, `mktree`, `commit-tree <tree> -m "Initial commit"` and `push -q <remote> <commit>:refs/heads/main`;
- plan: `ls-tree -rz --full-tree <rev>` per revision, and for the working tree `add -A -- .` then `write-tree` under a temporary `GIT_INDEX_FILE`;
- labels and diffs: `cat-file blob <oid>` per described file, `log -1 --format=%ct <rev> -- <paths>` for a side's change time, `diff --no-color <ancestor> <side> -- <path>` for `space.diff`;
- apply: under a temporary `GIT_INDEX_FILE`, `read-tree HEAD`, `update-index -z --index-info` setting or removing each path of a unit taken from the host and `write-tree`, then that tree checked out into a private copy as at Save; `cat-file blob <oid>` per file of a unit written; `read-tree <tree>` and `update-index -q --refresh` on the clone's index; `merge-base --is-ancestor HEAD <remote>/spex` with `rev-parse <remote>/spex^{tree}`, `commit-tree <tree> -p HEAD -p <remote>/spex -m <message>` or none on a fast-forward, `update-ref refs/heads/spex <commit> <old HEAD>`;
- push: `push -q <remote> spex`, `push -q -u <remote> spex` where no upstream is set, at the first placement;
- stderr classification under `LC_ALL=C`: explicit content-size rejection wording from the instance → `size_limit` before a generic hook decline, a hook decline alone establishing no size cause ([DR-129](../decisions/129-content-size-is-not-permission.md)); "Could not resolve host", "Connection refused", "Network is unreachable" → unreachable; "Authentication failed", "could not read Username", "terminal prompts disabled", "Host key verification failed" → reauth; "Permission denied", "protected branch", "pre-receive hook declined", "You are not allowed" → refused; "Repository not found", "does not appear to be a git repository" → gone; "[rejected]" with "fetch first" or "non-fast-forward" → rejected; a killed child → timeout or stopped; anything else → `git` with the cause-preserving summary, or, where Git printed an HTTP status on a transport to its instance's Git origin, the host's error with that status [[space-15](#space-15)]; public lines follow space-15's instance-only and URL rules.
- the instance's size rule follows transport, authentication, missing-repository and explicit access refusals (`403`, "Permission denied", "protected branch", "You are not allowed"), but precedes a bare hook decline; it recognizes a whole `remote:` sentence, case-insensitively: "You are attempting to check in one or more blobs which exceed the <limit> limit", with an optional single ASCII identifier and colon before it, and an optional final period or colon; `<limit>` is either a nonnegative quantity of at most twelve digits with an optional decimal of at most six digits followed by `byte`, `bytes`, `KB`, `KiB`, `MB`, `MiB`, `GB`, `GiB`, `TB` or `TiB`, allowing whitespace before the unit, or the words "size" or "file size"; a numeric limit is public only when every recognized sentence carries the same captured quantity and unit, absent or conflicting limits retaining the size cause without a numeric claim; quoted sentences, filenames and URLs alone establish no size rejection.

#### space-33

The core shall compute one three-way plan per placement of each read or sync of a clone — this device's tree, that placement's `spex`, and their common ancestor — over every tracked path, grouping paths into units and classifying each unit by complete bytes and existence under the selection rule [[storage-11](storage.md#storage-11)] ([DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

| Side | Tree |
| --- | --- |
| mine | the working tree for the lists of [[space-7](#space-7)] and [[space-8](#space-8)]; `HEAD` inside a sync, as the previous placement's merge left it |
| remote | `<remote>/spex`, `<remote>` that placement's remote's name [[space-32](#space-32)]; `HEAD` itself before any check, and the empty tree where the host holds no `spex` |
| ancestor | `merge-base(HEAD, <remote>/spex)`; `HEAD` before any check; the empty tree for a join; the plan withheld for unrelated histories without one |

- a working-tree reading's plan and branch counts use the same captured commit identities for `HEAD` and each placement's `spex`, rather than resolving those names again after awaited work;
- session choice titles, turn counts and activity read the selected revision through Playbook's shared history reader, with its chunk dependencies from that revision and no changes to the live session [[storage-11](storage.md#storage-11)];
- units: `sessions/<uuid>.json` with `sessions/<uuid>.replay.json`, every file of `sessions/<uuid>.chunks/`, legacy `sessions/<uuid>.records.jsonl` where present and `sessions/<uuid>.assets/`, `intents/<uuid>.json` with `intents/<uuid>.assets/`, `authoring/<uuid>.json` with its records and assets, `spex.yaml` with `spex.lock` wherever a clone holds them [[storage-1](storage.md#storage-1)], a folder holding `meta.yaml` on any side with every file under it [[storage-11](storage.md#storage-11)], and each other tracked path alone; a bundle unit taken from a side needs every file of it on that side or none;
- a unit is local where mine differs from the ancestor and remote does not, incoming where remote differs and mine does not, a conflict where both differ from the ancestor and from each other, and agreed otherwise;
- unknown units, duplicate choices, and choices contrary to a decided unit are refused before any write; the command-line tool keeps its contract [[storage-10](storage.md#storage-10)], sharing this plan, the validator and the application code behind a seam that takes a caller-supplied ancestor and whether the working tree holds the apply's base [[space-19](#space-19)] or Git's merge output.

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
| `sessions/<uuid>.json` / `.replay.json` / `.records.jsonl` / `.chunks/` / `.hints.json` / `.assets/` | session manifest / session records / legacy session records / session chunks / provider hints / session attachments |
| `.lock*`, `sessions/.<uuid>.lock*`, `.spex-apply.json` | lease; sync repair marker |
| `intents/<uuid>.json`, `intents/<uuid>.assets/` | intent; intent attachments |
| `authoring/<uuid>.json` / `.records.jsonl` / `.assets/` | authoring session; its records; its attachments |
| `spex.yaml`, `spex.lock`, `.spex/` | spec package requests; spec package lock; installed spec packages with their exported skills |
| `config/playbook.config.yaml`; `*.bak*`, `*.backup*` | Settings; config backup |
| `project.json` | code remote |
| `placements/<folder>.yaml` | placement |
| `.gitignore`, `.gitattributes` | sync rules |
| `*.tmp` | temporary write |
| a folder outside `config/`, `sessions/`, `intents/`, `authoring/`, `placements/`, `.spex/`, `local/` and `.spex-uploads/` holding `meta.yaml`, the outermost where two nest, and every path under it no row above names | spec package |
| other | Not a Spex file |

- a path in an ignored family of the catalog is marked ignored whatever Git reports [[storage-1](storage.md#storage-1)];
- `space.read` refuses a path resolving outside the clone or through a symlink, withholds provider hints, and caps text at 256 KB or 2,000 lines on complete lines.

#### space-115

When the reader opens a Space sign-in card, the surface shall offer the public registry's directory of Spaces by display name, origin and sign-in kinds [[environments-39](environments.md#environments-39)] beside the editable custom URL, with directory failure leaving custom sign-in available and no discovery entry establishing credential trust ([DR-168](../decisions/168-independent-package-registry.md)).

#### space-117

When a project's placement selects a Space, the core shall name that Space as the environment's collaboration and Git-broker preference while preserving its explicit registry selection [[environments-38](environments.md#environments-38)] and all existing locked package pins and source provenance, advancing only a lock digest that matched the manifest before this Space-only edit and leaving an already-stale, malformed or unreadable lock unchanged ([DR-168](../decisions/168-independent-package-registry.md)).

## Verification

#### space-118

When a real-core integration suite places a fresh project at a second signed-in Space, the suite shall assert the environment reports and records that Space for brokerage while retaining its public registry origin and every package pin, a previously current lock changing only its requests digest without a stale hint, and a previously stale lock remaining byte-identical and stale, and a malformed lock remaining byte-identical without blocking the Space binding [[space-117](#space-117)].


#### space-116

When a browser journey opens Add instance, it shall verify directory choices fill the ordinary sign-in URL, custom URLs remain editable, and a failed directory read still permits custom sign-in without any backend locator on the page [[space-115](#space-115)].


### Core Coverage

#### space-37

When an integration suite starts a real core with substitute agents on a scratch home against the stand-in Git host with an isolated Git configuration, it shall drive sign-in, the first push and the account's set-up over the protocol and assert:

- an incoming LFS file absent from the local cache is fetched with the brokered credential during Check despite configured path exclusions, then Apply writes the exact payload and makes no transport request; Stop during a held LFS download ends at Check without Apply or incoming file writes [[space-8](#space-8)] [[space-16](#space-16)] [[space-19](#space-19)];
- `space.get` reads no instance, the default instance the stand-in's origin, and your own group alone under this device's user name, and reads the `git` guidance on a `PATH` without `git` [[space-1](#space-1)] [[space-3](#space-3)] [[space-30](#space-30)];
- a full read held after Refresh replies accepted broadcasts the instance's `read.phase: running`, preserving the last complete view and time; its failure broadcasts `failed` with the existing sanitized host message, including on a signed-in startup with only local-only rows; retry success clears the failure, sign-out reads idle, and a new sign-in accepted during a held older Refresh or direct read stays running until its own fresh read settles [[space-1](#space-1)] [[space-29](#space-29)] [[space-30](#space-30)];
- a working folder added before any sign-in pairs with a local-only spex repository under your own group [[space-61](#space-61)];
- `space.signin.start` naming the stand-in's origin in the browser flow returns a loopback URL the suite completes against the stand-in, after which the state lists that instance with its account, your own group's folder and clone bear the login, every pair naming it is rewritten, and your own group's spex repository stands in your namespace at the stand-in with its clone pushed through a remote named by the instance's folder [[space-4](#space-4)] [[space-59](#space-59)] [[space-65](#space-65)] [[space-5](#space-5)], no state from the sign-in to that push reading it unreachable [[space-61](#space-61)];
- `space.signin.start` in the device flow returns a verification URL carrying the user code, which the suite approves at the stand-in, with the same outcome; a denied code ends the sign-in `failed` with `denied` [[space-3](#space-3)] [[space-29](#space-29)];
- `space.pick` with a group creates `<name>-spex` there, pushes `spex`, and the row turns reachable, its placement's line reading its last sync, no state from the pick to that push reading it unreachable [[space-61](#space-61)] [[space-87](#space-87)]; one naming your namespace's id is refused `not_found` [[space-29](#space-29)]; a taken name is refused in place; a stand-in refusal leaves the repository local only with its waiting phrase, and a later Refresh after the stand-in grants finds it created [[space-58](#space-58)] [[space-64](#space-64)];
- the first `space.sync` into a repository the stand-in lists with other members is refused until `noticed`, then pushes and records `sync:<repository>:<placement>:last` and the notice [[space-57](#space-57)] [[space-12](#space-12)] [[space-22](#space-22)];
- with the stand-in failing every members route, a pick joining a repository whose only member is the account, and the first `space.sync` into another, are each refused until `noticed` [[space-57](#space-57)];
- `space.join` with a folder, while the suite holds the code's clone, reads the row not on this device with the join running at its Code step and no Stop and the folder without the code, then, the clone released, reachable with the code in the folder and the folder paired, no reading before it reachable [[space-63](#space-63)] [[space-61](#space-61)]; a join naming a host id the last read lacks, the stand-in having listed it since, reads the instance afresh and runs, and one the fresh read lacks too is refused `not_found` [[space-63](#space-63)];
- a join clones private code served by the stand-in's real HTTP Git transport at its reported Git origin, keeping the remote unchanged while its listed and joined rows read "Code on this instance" in each offered language, and after a restart no initial state carries that remote before the host's read [[space-1](#space-1)], and code at another origin through that device's own credentials; a code transport refused, a brokered credential refused, and a nonempty destination each stop at Code with no Git-origin URL shown, the spex clone kept, no folder paired and existing files unchanged [[space-63](#space-63)];
- a core restarted on that home reads the same instance and account, no read time but the same last sync, and that `space.get` begins a read whose state lands with a read time [[space-1](#space-1)];
- a core restarted on a signed-in home whose own group's clone holds its pushed `spex` with no `sync:<repository>:<placement>:last` recorded reads that row's placement line with no last sync but its `branch.agreed` current at `spex`'s commit time, then, after a commit on `spex` alone, not current at the same time, while a project's clone the host's `spex` never reached carries none [[space-61](#space-61)] [[space-30](#space-30)];
- every long command replies `accepted` before its outcome lands as `space.state`, and each reply and broadcast carries the `GroupsState` fields and phases [[space-29](#space-29)] [[space-30](#space-30)];
- a running compile and a session under a management lease taken out of band each leave the spex repository's `space.sync` to complete [[space-11](#space-11)] [[space-21](#space-21)];
- while a check runs against a transport that sleeps, a turn, a viewed marker, an intent, a pairing and a settings edit beneath that clone all land, a second `space.sync` and a `space.fetch` reply `accepted`, joining it, `space.cancel` returns the machine to `stopped` with the Save commit kept, and the sleeping child is gone [[space-21](#space-21)] [[space-47](#space-47)] [[space-16](#space-16)] [[space-32](#space-32)];
- a `space.sync` asked while a check stands held inside Git replies `accepted` and makes no Save commit until that check ends, then saves and completes [[space-21](#space-21)];
- a sync of a repository the stand-in renamed stops at Check naming the session, the clone, its pair and its sessions where they were, while a session beneath the clone stands under a lease taken out of band — one with its records and one standing only as its lease file — or under a lease naming another machine, and moves the clone once that lease is released, while a lease left by a dead process of this machine moves with it [[space-60](#space-60)] [[space-15](#space-15)];
- a sign-in on a second scratch home whose own group's clone provably holds its unchanged generated bootstrap, also after a restart, while the stand-in already holds `<login>-spex` with another environment and configuration, ends with the host's environment and configuration in the clone and no choice asked; actual settings or environment edits before sign-in, including edits followed by a restart and no manual commit, and a preexisting configuration initialized under a set-up commit subject, end in choices with local bytes and the host's branch unchanged, as does a clone holding a session of its own [[space-59](#space-59)] [[space-13](#space-13)];
- a sign-in while a session beneath a clone of your own group stands under a lease taken out of band moves none of that group's clones, every pair and session where it was, and a Refresh after the release moves them all [[space-59](#space-59)] [[space-4](#space-4)];
- a stand-in rename onto a folder already standing stops the sync at Check naming that folder, the clone and the folder unchanged; a sign-in whose destination for a clone of your own group is taken moves no clone, and a Refresh once that folder is gone moves them all [[space-60](#space-60)] [[space-59](#space-59)];
- where the scratch filesystem folds case, a stand-in rename changing only the repository name's case completes with the clone listed under the new spelling and its pair re-keyed, and one changing only its group's case stops the sync with the clone, `home.yaml`, the project list and the session list unchanged [[space-60](#space-60)]; one changing its group's case and its name, and one moving it into a nested group whose folder stands under another case spelling, each stop the same way with nothing landed under the disk's spelling [[space-60](#space-60)]; a sign-in while an unrelated folder stands under another case spelling of the login moves no clone, every pair and session where it was [[space-59](#space-59)];
- a remote set from a terminal while `space.remote.set`, a pick or a Check step awaited its own read leaves the terminal's remote alone in the clone's configuration, the command refused `conflict` or the step stopped as changed meanwhile [[space-21](#space-21)] [[space-60](#space-60)];
- a remote set through `space.remote.set` while a sync's Check step awaits the stand-in's read of a repository it renamed stops that sync as changed meanwhile, the clone not moved and the new remote standing [[space-60](#space-60)];
- a sign-in moves your own group's folder while a read of it stands held, an intent naming the old key is refused without recreating the former folder, and the held read ends recreating nothing [[space-59](#space-59)];
- a Save held after its own read of `HEAD` resumes, once its clone was removed, recreating nothing, and once a sign-in moved its clone under your own group's folder, saving and syncing the clone where it lies with the former folder not made again [[space-21](#space-21)] [[space-12](#space-12)];
- a second join of one repository, admitted while the first's clone stands held, publishes its clone; the first, released, finds the place taken and leaves that clone and every file written into it as they stand, and no private folder of either remains [[space-63](#space-63)];
- a join whose clone child stands held runs that child under umask `0077` while the core's own umask stays `022`, before and after the child is released, and the folders and pack that child wrote keep no group or other permission once published [[space-32](#space-32)];
- `space.signout` naming the instance revokes the device at the stand-in, the instance listed signed out and every repository turning local only or unreachable with nothing deleted, and a later sign-in finds them reachable again [[space-6](#space-6)] [[space-61](#space-61)];
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
- an incoming file whose parent is replaced with a symbolic link after Save stops at Apply without reading or changing the linked destination, committing a merge or changing the index [[space-19](#space-19)] [[space-15](#space-15)];
- a push rejected because the peer advanced after the check re-checks once and succeeds; advanced again, it stops "changed again" with the merge kept and `ahead` reported [[space-15](#space-15)];
- a fast-forward sync leaves `spex` equal to the host's with no merge commit, clears the hints of its changed session, and, under process umask `022`, leaves no `sessions/` entry wider than `0600` [[space-19](#space-19)] [[space-20](#space-20)];
- a marker planted with a half-written selection is repaired at startup into the recorded commit before `space.get` answers, a marker left standing after its merge landed is cleared with nothing re-applied, a marker whose file was changed since by another hand is removed with that change kept and no merge commit, the next sync saving the change and asking a choice for it, and a marker whose merge never landed under a `spex` a terminal commit moved on is removed with nothing written; a session the interrupted apply had already written whole loses its hint and viewed marker [[space-67](#space-67)] [[space-19](#space-19)];
- a terminal commit landing while Save validates refuses the Save with that commit and the changed file kept, and a file rewritten after validation stays a local change while the validated bytes are committed [[space-12](#space-12)] [[space-15](#space-15)]; a file another process leaves invalid during an Apply stands as the refresh's finding, admits the next sync whose Save names it, and once the reader repairs it the sync after goes through with the core still running and the finding cleared [[space-20](#space-20)] [[space-11](#space-11)];
- a session another process holds through an Apply that writes only an incoming intent stops nothing; held while the Apply would write it, beside an incoming intent dispatched to that session's newer turn, it stops the sync naming it with no merge commit, the marker kept and the intent not yet written; still held across a restart, the startup repair stands as a blocking issue and a Retry stops naming the session with the marker kept, and after its release the next Retry finishes both units into the recorded merge, which the ledger then lists [[space-19](#space-19)] [[space-15](#space-15)] [[space-67](#space-67)] [[space-20](#space-20)];
- a selection half applied — the host's replay of a session both sides changed landed, its manifest not — whose startup repair a session lease held elsewhere refused, standing as a blocking diagnostic of that session's file, admits the Sync asked once the lease is released, which finishes the recorded merge with the host's manifest and replay and leaves no issue [[space-11](#space-11)] [[space-67](#space-67)];
- two Syncs sent together over a marker a released lease left are both accepted as one operation, with one merge of the recorded sides on the Save commit, the marker gone, and no state broadcast from the first send to that sync's end naming the marker as an issue [[space-67](#space-67)] [[space-21](#space-21)];
- the stand-in renaming the repository moves the clone on the next sync, every pair rewritten and its key changed in the state [[space-60](#space-60)];
- the stand-in archiving the repository turns it read-only with the host's reason, a sync bringing the peer's new session without pushing and the core's new session kept with its mark; the stand-in removing the account's membership turns it unreachable on the next read with the clone intact [[space-61](#space-61)] [[space-15](#space-15)] [[space-50](#space-50)];
- a stand-in whose Git transport answers 401 stops "reauth" and a sleeping one stops "timeout" within a test-shortened limit, each carrying its guidance [[space-15](#space-15)] [[space-32](#space-32)];
- an unsafe parent introduced while a later session lease is awaited leaves the first session written, stops with the repair marker and deferred-refresh diagnostic, reads no linked intent body during the stop broadcast, and finishes repair and refresh on Retry after the parent is restored [[space-19](#space-19)] [[space-20](#space-20)] [[space-67](#space-67)];
- a check the stand-in answers 429 stops `throttled` with "Retry waits, then runs the step.", reading "<display name> asks to wait 2 seconds" for `Retry-After: 2`, "3 seconds" for an HTTP date 3 s ahead and "a moment" for none [[space-15](#space-15)]; a Retry at once after the 2 s reads running at Check and completes, its first request reaching the stand-in no sooner than 2 s after the 429, and one after "a moment" reaches it at once [[space-15](#space-15)]; under `Retry-After: 5`, a Retry offers Stop while it waits, which stops it at once reading "Stopped while waiting for <display name>", nothing having reached the stand-in, and the next Retry waits out the rest before its step [[space-16](#space-16)] [[space-15](#space-15)].

#### space-39

When an integration suite writes local changes of every unit kind into a clone, it shall assert the listings and the explorer:

- the local list carries a titled session as new, an intent by its title, an authoring session, "Settings changed" with a diff, "Code remote changed" and "Sync rules updated", in the kinds' order, and in a clone holding `spex.yaml` with `spex.lock` "Spec packages changed" with a diff in its place [[space-7](#space-7)] [[space-34](#space-34)]; a spec package's folder reads as one row of its own, labelled with the folder ending `/`, its every file among its paths [[space-7](#space-7)] [[space-33](#space-33)];
- after a peer pushes, `space.fetch` lists the incoming units the same way with conflicts marked and ahead and behind counted, a host without `spex` reads empty, and `space.diff` returns a patch for Settings on each side and refuses a session and an intent unit [[space-8](#space-8)] [[space-10](#space-10)];
- `space.tree` maps every catalog path to its family and sharing mark with session and intent owners, reads an empty directory of a tracked kind as not yet shared, reports `.git` closed, `.spex/` as staying here, a spec package's folder and a file under it as spec package and a stray file as not a Spex file, and neither follows nor lists through a planted symlink; `space.read` pretty-prints JSON, returns YAML, Markdown and JSONL text, cuts a long log on a line, withholds a hints file, and refuses `../` [[space-23](#space-23)] [[space-24](#space-24)] [[space-35](#space-35)].

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

When an integration suite signs a real core in at the stand-in Git host, syncs a project's spex repository created in your namespace there, and has the stand-in move that repository into `acme` with its id, it shall assert what each remote change keeps of a placement's sync:

- a path remote named through `space.remote.set` stands in the clone's Git configuration as `origin` beside the placement's remote, which keeps its id, the `@<host>/spex` the clone holds and this device's recorded last sync, and removing it removes `origin` alone [[space-5](#space-5)] [[space-29](#space-29)];
- the next Sync, while it awaits the stand-in's read, reads the placement reachable at its new path with the same id, the same recorded last sync and `branch.agreed` current at the pushed commit, the clone's upstream standing, then moves the clone to `@<host>/acme/`, still current [[space-5](#space-5)] [[space-61](#space-61)] [[space-60](#space-60)];
- `space.leave` of that placement takes its remote, id, `@<host>/spex`, recorded last sync and notice record with it, the clone moved under your own group's folder reading local only with no last sync and no `branch.agreed` [[space-5](#space-5)] [[space-98](#space-98)];
- a local bare repository then named through `space.remote.set` makes that clone read reachable, its Sync pushing there with no catalog read, and removing it leaves the clone local only again [[space-61](#space-61)] [[space-11](#space-11)] [[space-12](#space-12)];
- a group then picked to create another repository reads no last sync until its first sync [[space-5](#space-5)].

#### space-74

When an integration suite signs a real core in at the stand-in Git host, whose remote URLs lie under its Git origin, with spex repositories in `acme` and one under another account's login `bob`, it shall assert that the instance alone is named and where each group's rows stand:

- no `space.get` reply, `space.state` broadcast or `space.members` reply holds a string under the stand-in's URL but that URL itself — no Git URL and no page — or one naming `gitlab`, a clone's remote at the stand-in reading as its key [[space-30](#space-30)] [[space-1](#space-1)] [[space-62](#space-62)];
- `bob`'s repository stands under an entry headed `bob` with no id and no abilities; Join clones it under `workspace/@<host>/bob/`, and once the stand-in stops listing it, it reads "No longer shared with you" with its clone's files untouched [[space-1](#space-1)] [[space-58](#space-58)] [[space-61](#space-61)] [[space-63](#space-63)];
- a group `ada` the stand-in admits at its root beside the login `ada` stands as an entry of its own under the instance's heading, your own group's rows and clones staying where they were; its repository reads "Unreachable: a group named like your login" with no clone made, and `space.join` of it, a pick creating in that group and a pick joining it are each refused with that cause [[space-1](#space-1)] [[space-61](#space-61)] [[space-29](#space-29)];
- `space.group.create` at the root under a path the stand-in holds an account for is refused as taken [[space-68](#space-68)];
- a repository the stand-in transfers into `acme/research` lists, at a Refresh before any sync, under `acme/research` with its key unchanged, and its next sync moves the clone under that group's folder [[space-1](#space-1)] [[space-60](#space-60)];
- a check, a push and a join against a stand-in transport answering 500 each stop "<display name> answered with an error" with the status and Retry, no part of the Git origin in message or guidance [[space-15](#space-15)] [[space-32](#space-32)];
- a push the stand-in refuses with a `remote:` line carrying the clone's own URL, without `.git` and with a trailing `/`, and another URL under its Git origin reports the first as the repository's path in the instance and the second as the stand-in's display name, and turns the repository read-only with the same words [[space-15](#space-15)] [[space-32](#space-32)] [[space-61](#space-61)].

#### space-86

Where a real core is signed in at the stand-in instance with a writable spex repository, when ordinary Sync reaches a receive hook, the integration suite shall assert the rejection distinction ([DR-129](../decisions/129-content-size-is-not-permission.md)):

- explicit content-size rejection, alongside a generic hook-decline marker, stops Push as `size_limit`, keeps the Save and existing access state, and reports the instance and reported limit without raw branding, quoted transport links, Share or sign-in guidance [[space-15](#space-15)] [[space-32](#space-32)] [[space-50](#space-50)] [[space-61](#space-61)];
- an explicit size rejection carrying no parseable numeric limit states the size cause without inventing a limit [[space-15](#space-15)];
- two recognized size sentences reporting incompatible numeric limits retain the size cause without selecting one limit [[space-15](#space-15)] [[space-32](#space-32)];
- a permission refusal retains its read-only state and membership guidance even beside size wording, while a hook decline without explicit size wording retains its existing refusal classification [[space-15](#space-15)] [[space-32](#space-32)] [[space-50](#space-50)] [[space-61](#space-61)];
- no automatic retry runs, and once the stand-in lifts the content condition an explicit Sync sends the retained Save [[space-15](#space-15)].

#### space-79

When an integration suite signs a real core in at the stand-in Git host, whose remote URLs lie under its Git origin, with a project's spex repository synced in `acme`, it shall assert the undo acts over the protocol ([DR-120](../decisions/120-the-instance-is-the-space.md)):

- the state carries what the stand-in lets the person do: rename and delete on each group of the instance and neither on your namespace, transfer on a spex repository the person owns and not on one they may only push to [[space-30](#space-30)];
- `space.group.rename` of `acme/research` to a new name and path replies its new path, a state broadcast before the reply listing it so, and a path taken there is refused naming it [[space-29](#space-29)] [[space-1](#space-1)];
- `space.group.delete` of `acme`, which holds the project and a group, is refused with no request reaching the stand-in, and of an empty group created at the root replies, the state no longer listing it [[space-29](#space-29)];
- `space.repository.move` of the project into the renamed group replies its new path, a state broadcast before the reply listing the row under that group with its key unchanged and its clone where it was, and its next sync moves the clone under that group's folder, reachable; a move with no group named does the same into your namespace there [[space-1](#space-1)] [[space-60](#space-60)] [[space-29](#space-29)];
- a rename, a deletion and a move the stand-in refuses each reply `invalid_request` with the stand-in's words, and one the stand-in answers `provider_unavailable` that it could not be reached, the state unchanged [[space-29](#space-29)];
- no reply or broadcast holds a string under the stand-in's URL but that URL itself, or one naming `gitlab` [[space-30](#space-30)] [[space-1](#space-1)].

#### space-83

When an integration suite starts a real core on a scratch home against two stand-in Git hosts run as two instances on separate Git backends, each holding a group `acme` with a project's spex repository, the first's `acme` also holding `c-spex`, whose `project.json` names code at the second's Git origin, the person signed in as `ada` at the first and `bob` at the second, it shall drive both over the protocol and assert ([DR-127](../decisions/127-a-home-signed-in-to-several-instances.md)):

- a sign-in at the first, then one through `space.signin.start` naming the second's origin, lists both instances in that order, each with its account, display name, read state and groups, your own group's folder bearing `ada` and its own repository created as `ada-spex` in the first's namespace with its remote named by the first's folder, the second's sign-in renaming nothing and placing it as `bob-spex` in the second's namespace, its push there waiting for Continue [[space-30](#space-30)] [[space-4](#space-4)] [[space-59](#space-59)] [[space-65](#space-65)] [[space-5](#space-5)] [[space-57](#space-57)];
- Join of each `acme` project's repository but `c-spex` clones it under its own instance's folder at `acme/`, the two under distinct keys, each row standing under its own instance's `acme` [[space-63](#space-63)] [[space-1](#space-1)];
- `c-spex` reads "Code on a remote" on its row, listed and joined, and its Join's code clone, presenting no credential of the app's and refused by the second's transport, stops at Code with no URL under either instance's Git origin shown [[space-1](#space-1)] [[space-63](#space-63)] [[space-15](#space-15)];
- a local-only project picked into the second's `acme` is created at the second alone, its clone moved under the second's folder with its pair and sync preferences re-keyed, pushed with the second's credential, its Save commit bearing the second's login despite a stored personal display name [[space-58](#space-58)] [[space-32](#space-32)]; a pick of a clone keyed under the first naming the second is refused [[space-29](#space-29)];
- a pick while a session beneath the clone stands under a lease taken out of band leaves the clone under your own group's folder with its remote at the second, and, the lease released, its next sync moves it under the second's folder and pushes [[space-58](#space-58)] [[space-60](#space-60)];
- a group `ada` at each instance's root collides at the first alone, its repository there reading "Unreachable: a group named like your login" under a key naming the first's folder, while the second's `ada` lists its repository with Join [[space-61](#space-61)] [[space-30](#space-30)];
- a core restarted on that home with the second answering 503 reads the first's view with a read time and the second's read failed with its last view kept [[space-1](#space-1)];
- `space.signout` of the first lists it signed out, its rows unreachable and a Sync of one refused "Sign in to <display name> first" with the first's display name, while the second's stay reachable and sync [[space-6](#space-6)] [[space-61](#space-61)] [[space-11](#space-11)];
- `space.forget` of the first is refused naming each of its `acme` repositories, whose clones stay keyed under it, and of the second, still signed in, is refused [[space-82](#space-82)] [[space-29](#space-29)];
- on another scratch home signed in at the first alone and holding no other clone, `space.forget` after its sign-out drops your own group's own repository's remote, the state listing no instance and that row reading "On this device only — shared once you sign in", and a sign-in then at the second creates `bob-spex` in the second's namespace for it and pushes it, its folder keeping `ada` [[space-82](#space-82)] [[space-61](#space-61)] [[space-4](#space-4)] [[space-59](#space-59)];
- on another scratch home, `own.named` reads true before any sign-in, false once a sign-in at the first named the folder after `ada`, and false still after its sign-out and Forget, and on one whose account at its stand-in is this device's user name, which names nothing, true still after its sign-out and Forget [[space-30](#space-30)] [[space-1](#space-1)];
- on another scratch home of the former format with one instance, migrated at the core's start while a session beneath one clone stands under a lease taken out of band, that clone lists under its instance's heading by its old key, and its Sync stops at Check naming the session with nothing fetched, then, the lease released, moves it at Check, before any fetch or push, under the instance's folder and syncs [[space-60](#space-60)] [[space-15](#space-15)] [[space-1](#space-1)];
- no reply or broadcast holds a string under either stand-in's URL but that URL itself, or one naming `gitlab` [[space-30](#space-30)] [[space-1](#space-1)].

#### space-84

When an integration suite starts a real core on a scratch home against two stand-in instances over one Git backend, sharing its Git origin and each listing the person's namespace there with two projects' spex repositories, `a-spex` and `b-spex`, in it, it shall assert one host repository through both ([DR-127](../decisions/127-a-home-signed-in-to-several-instances.md)):

- signed in at both, each repository reads as one row, not on this device, under the instance listed first, and Join keys it under that instance's folder with its remote named by it [[space-1](#space-1)] [[space-61](#space-61)] [[space-63](#space-63)];
- joined, each stays one row under the first, the second's listing withholding Join alone [[space-61](#space-61)];
- the first signed out, both rows stand reachable under the second, and `a-spex`'s Sync re-keys its clone under the second's folder with its remote renamed, its pair and sync preferences re-keyed and its recorded last sync kept, then syncs with the second [[space-60](#space-60)] [[space-61](#space-61)] [[space-5](#space-5)] [[space-11](#space-11)];
- with a session beneath `b-spex`'s clone, still keyed under the first, standing under a lease taken out of band, `space.forget` of the first is refused naming that session, the instance and that clone kept as they were [[space-82](#space-82)] [[space-29](#space-29)];
- the lease released, `space.forget` of the first re-keys `b-spex`'s clone under the second's folder with its remote renamed and its pair re-keyed, then removes the instance from the state, your own group's own repository, created at the first, keeping its folder and syncing with the second through its remote renamed to the second's folder, its placement file rewritten to the second's [[space-82](#space-82)] [[space-60](#space-60)];
- on another scratch home signed in at the first, then at a third instance on a Git backend of its own, then at the second, `a-spex` joined through the first and a repository the first lists alone read the first as `governing`, and, the first signed out, `a-spex` reads the second, the earliest signed-in instance listing it, and the other none [[space-30](#space-30)] [[space-1](#space-1)];
- no reply or broadcast holds a URL under the shared Git origin, or a string under either stand-in's URL but that URL itself [[space-30](#space-30)] [[space-1](#space-1)].

#### space-92

When an integration suite runs a real core on a scratch home signed in to two stand-in instances on separate Git backends, holding a project's spex repository in the first's `acme` beside a group `workshop` at the second with another member, it shall drive the placement and its sync over the protocol and assert ([DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

- `space.place` creating in the second's `workshop`, with a peer's change standing at the first, adds the second's line reading "Waiting for you to continue" while that same sync merges and pushes the first's, its line reading synced, then, on `space.sync` with `noticed` for the second, pushes there, the row standing once under the first's `acme`, naming both placements by display name and path, and `workshop` showing one line naming the row with no control [[space-97](#space-97)] [[space-57](#space-57)] [[space-87](#space-87)] [[space-1](#space-1)] [[space-29](#space-29)] [[space-30](#space-30)];
- `space.fetch` lists each placement's incoming units under its instance, and the local list names a unit the second lacks [[space-8](#space-8)] [[space-7](#space-7)];
- with both stand-ins' `spex` advanced by peers, one Sync merges the first's, then the second's against the first's merge, then pushes the first once more as a fast-forward, each line reading synced, a unit the first's merge rewrote taken from the second's side with no restart, and each placement's last sync recorded apart [[space-12](#space-12)] [[space-19](#space-19)] [[space-33](#space-33)] [[space-31](#space-31)] [[space-22](#space-22)];
- a catch-up push the first rejects runs it once more from Check, and rejected again leaves its line reading "Behind — Sync again" [[space-12](#space-12)];
- a conflict at the second ends that placement in choices with the first's merge and push standing, the caption naming the second's display name, and the sync sent with those choices passes the first as a fast-forward [[space-14](#space-14)] [[space-9](#space-9)] [[space-17](#space-17)] [[space-18](#space-18)];
- a path placement set by `space.remote.set` syncs last with no catalog read and no notice, and no merge drops it [[space-12](#space-12)] [[space-5](#space-5)] [[space-57](#space-57)] [[space-91](#space-91)];
- a repository the first lists with no clone here reads as a row carrying its one listed placement, `attached` false and `absent`, with its unknown members' count [[space-30](#space-30)];
- the commit identity is the first's account, each remote holds its id in its own section, and `space.tree` reads `placements/<folder>.yaml` as a placement, shared [[space-32](#space-32)] [[space-23](#space-23)] [[space-35](#space-35)];
- `space.leave` of the second, not confirmed, stops `unreceived` counting a unit changed here that no remaining placement holds and not one this device holds unchanged since its last shared commit with the first while a peer rewrote it there; of the first, once a Check found the second's host holding no `spex`, it counts every record unit whatever the second's tracking ref still names; each keeps the placement, and the second sent `confirmed` drops the first, moving the clone to its path at the second [[space-98](#space-98)] [[space-12](#space-12)];
- no reply or broadcast holds a string under either stand-in's URL but that URL itself [[space-30](#space-30)] [[space-1](#space-1)].

#### space-100

When an integration suite runs a real core on a scratch home signed in to two stand-in instances on separate Git backends, holding two projects' spex repositories in the first's `acme`, the first project placed in the second's `workshop`, it shall drive a placement's failures over the protocol and assert ([DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

- the first answering 503 at Check reads its line unreachable while the second syncs, the row reachable; the first signed out reads its line unreachable with "Sign in again", and both signed out refuse the Sync naming the first's display name [[space-15](#space-15)] [[space-61](#space-61)] [[space-6](#space-6)] [[space-11](#space-11)];
- `space.place` of the second project creating in a group of the second that refuses it for the account's rights shows its waiting phrase on the second's line while the first syncs, its state carrying the wait on that placement [[space-97](#space-97)] [[space-64](#space-64)] [[space-87](#space-87)] [[space-30](#space-30)]; one naming a name taken there, and one naming the first, at which the clone holds a placement, are each refused [[space-29](#space-29)];
- Stop during the first's Check ends the sync with the second not run [[space-15](#space-15)] [[space-16](#space-16)];
- a chosen unit refused by validation at the first's Apply, and a stale lock on the first's remote-tracking ref failing its fetch with Git's own error, each end the sync with the second not run, the lock diagnostic naming the affected ref or file and its file-exists cause before recovery after removing the lock [[space-15](#space-15)] [[space-31](#space-31)];
- a real Git failure nested through its command wrapper retains its primary cause and final advice within three nonempty lines, with the synthetic credential and instance's Git URL in the command context removed from the public summary [[space-15](#space-15)];
- a file another process leaves invalid during the first's Apply stands as the refresh's finding while the first pushes and the second syncs [[space-15](#space-15)] [[space-20](#space-20)] [[space-31](#space-31)];
- a repair marker planted with a half-written selection at the second, on the first's merge commit as its base, is finished by the next admission into the recorded merge [[space-67](#space-67)] [[space-19](#space-19)];
- a placement whose `spex` shares no ancestor stops "Unrelated history" alone, and `space.sync` with `join` for it joins from the empty tree with every unit on both sides a choice [[space-13](#space-13)];
- no reply or broadcast holds a string under either stand-in's URL but that URL itself [[space-30](#space-30)] [[space-1](#space-1)].

#### space-93

When an integration suite runs real cores on three scratch homes against two stand-in instances on separate Git backends — the first home signed in to both with a project placed at each, the second signed in at the second alone as another member there, the third signed in to both as a member at each — it shall assert that a project placed at two instances syncs through a device holding both and that a second device attaches from the placement's file ([DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

- the second home's Join at the second writes nothing new to the placement files, its row naming no placement it cannot reach and its members panel saying the records are also placed at the first's host name, an instance that home does not list [[space-63](#space-63)] [[space-87](#space-87)] [[space-62](#space-62)];
- a session the second home syncs to the second reaches the first's `spex` once the first home syncs, and an intent the first home queues reaches the second home [[space-12](#space-12)];
- the third home's Join at the first lists the second's placement from its file as "Not on this device" with Attach and no row of its own, `space.join` of it refused; `space.attach` without `noticed` is refused, and with it attaches and syncs that placement, its line synced [[space-87](#space-87)] [[space-29](#space-29)] [[space-99](#space-99)] [[space-61](#space-61)];
- a placement file a member who may not manage members pushes stays unattached on every home until a reader continues [[space-90](#space-90)];
- the first home's `space.leave` of the second deletes the file, and the third home's next Sync drops its remote there with the clone's records kept; a Leave asked while that sync runs follows it [[space-98](#space-98)] [[space-91](#space-91)] [[space-21](#space-21)];
- the first and third homes each placing at the second at once meet as one choice of the file, the home whose side is not chosen dropping its remote at its next sync, the unchosen repository left at the stand-in, and offered Attach for the chosen one [[space-91](#space-91)] [[space-90](#space-90)];
- `space.members`, `space.share`, `space.unshare` and `space.repository.move` naming the second placement act at the second alone, the move leaving the clone's key, while a move of the first moves the clone at its next sync [[space-62](#space-62)] [[space-69](#space-69)] [[space-72](#space-72)] [[space-78](#space-78)] [[space-60](#space-60)] [[space-29](#space-29)].

#### space-94

When an integration suite runs a real core on a scratch home against three stand-in instances, the first two over one Git backend and the third on another, it shall assert your own group's placements and one host repository listed through two instances ([DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

- a sign-in at the first creates your own group's own repository there; one at the third creates `<login there>-spex` as its second placement, its first push waiting for Continue; one at the second, which lists the first's repository, adds no placement [[space-4](#space-4)] [[space-65](#space-65)] [[space-57](#space-57)];
- `space.place` and `space.leave` naming your own group's own repository are each refused [[space-29](#space-29)];
- for a project placed at the first, a peer's commit adding a file for the second naming the same host repository leaves only the first's file after the next Sync's merge, the Sync after pushing that deletion [[space-91](#space-91)]; a peer's commit then replacing the first's file by the second's renames the clone's remote to the second's folder at that merge, dropping nothing and keeping its last sync [[space-91](#space-91)] [[space-60](#space-60)] [[space-5](#space-5)];
- the first signed out and forgotten, your own group's placement follows the second, its remote renamed with its last sync kept and its file rewritten to the second's with the first's deleted, and the third receives that change at the next sync [[space-82](#space-82)] [[space-60](#space-60)] [[space-5](#space-5)].

#### space-101

When an integration suite runs a real core on a scratch home signed in to three stand-in instances, the first two over one Git backend and the third on another, it shall drive "Leave…" over the protocol and assert ([DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

- for a project placed at the first and the third, the first lacking records the third holds: `space.leave` of the third stops `unreceived` naming the count, the placement kept; of the first, while a lease taken out of band stands beneath, is refused whole naming the session, and once it is released moves the clone under the third's folder with its pair re-keyed; and of the third, the last, sent `confirmed` after it stops naming every unit, moves the clone under your own group's folder, local only [[space-98](#space-98)] [[space-15](#space-15)];
- for a project placed at the first and the third, a peer's commit at the third deleting the first's placement file drops nothing at the next Sync while a lease taken out of band stands beneath the clone, syncing nothing with the first, and the Sync after the release drops it and moves the clone under the third's folder [[space-91](#space-91)];
- with the first signed out, `space.leave` of the first for a project placed there alone, whose repository the second lists, renames its remote to the second's folder and rewrites its file, dropping nothing; a project placed at the first and at the second reads its first placement unreachable, its Sync's Check following nothing, and its `space.leave` of the first, sent `confirmed` after it stops for the placement it could not read, drops it [[space-98](#space-98)] [[space-60](#space-60)] [[space-61](#space-61)];
- with the third signed out, `space.forget` of it is refused naming a project placed there, and naming a group's spex repository keyed under it whose creation the third left pending [[space-82](#space-82)] [[space-29](#space-29)].

### Surface Coverage

#### space-107

Where the Space surface uses the production store over a controlled command connection, when Sign out, Forget or declining a repair returns an older running-state reply after a completed-state broadcast, the test suite shall assert that the displayed completion is retained and an unsuperseded reply to each action still applies (verifying [[space-106](#space-106)]).

#### space-56

Where the Space surface renders over a home whose issues list holds three unanswered repairs, each proposing its recorded folder, when the reader declines the first, adds the third, lets the core deliver a re-read, activates Refresh, adds the second and then the declined first, the core reporting after each act what then remains, the test suite shall assert through the surface:

- the declined row keeps the first place, reading "not added", and the header's count falls to two issues [[space-55](#space-55)] [[space-49](#space-49)];
- the third row gives way in its own place to an outcome naming the project, the folder it is now a project at and the sessions listed, the header's count reading one issue and the live region "1 issue left." [[space-48](#space-48)];
- focus rests on the second repair's Add project, wrapping past the declined row [[space-48](#space-48)];
- the core's re-read leaves the three rows in their places [[space-48](#space-48)] [[space-55](#space-55)];
- after Refresh the outcome is gone and the declined row stands after the second [[space-48](#space-48)] [[space-55](#space-55)];
- the second's add leaves the live region reading "All issues resolved." and focus on its outcome's Open project, which opens that project [[space-48](#space-48)];
- the declined repair's add leaves both outcomes in their places with the core reporting no diagnostic, focus on the new outcome's Open project, until Refresh closes the list [[space-48](#space-48)].

#### space-70

Where the Space surface renders over a signed-in home whose host read says the person may create a group, may create a subgroup in a group `acme`, add members to it, rename it and delete it, may do none of these in a group `other` named "Other team", may rename and delete an empty group `empty`, and may add members to the repository `a-spex` and move it but do neither on `b-spex`, with the host's five roles of which Developer upward may push, the test suite shall assert through the surface:

- "New group" stands on the instance's heading, `acme`'s heading's "More" holds Members and "New subgroup", `other`'s Members alone, your own group's and your namespace's neither, and no heading carries Share; `acme`'s members panel, read on activation, carries Share and Remove on each of its own members and links no page, `other`'s lists its members with neither; `a-spex`'s members panel carries Share and Remove on its own members, a member held through `acme` reading "via acme" with no Remove, each member labelled by login alone despite a received personal display name, while `b-spex`'s carries neither [[space-1](#space-1)] [[space-62](#space-62)] [[space-72](#space-72)];
- rendered again over a read that says the person may not create a group, the instance's heading holds no "New group" but the phrase "Groups are made by the people who run <display name>", in English and in Chinese, with no link and no control, and neither before a read is held [[space-1](#space-1)];
- "New subgroup" opens the inline editor with the fields "Group name" and "Path", the path following the name as "lumen-labs" follows "Lumen Labs" and staying empty for "华芯智造", Create disabled until both hold text, Escape closing it; Create sends `space.group.create` with the name, the path and `acme` as the parent and reads "Creating…" until the reply, a refusal "taken" standing in the editor with the name kept, and a success closing it, the group the core's state carries standing after `acme` with its full path [[space-68](#space-68)];
- Share on `acme` opens the editor with "Login at <host name>", the five roles in the host's order with Developer preselected, Add disabled until a login is typed; Add sends `space.share` naming the group, the login and the role and reads "Adding…", a `not_found` reply standing in the editor with the login kept, and a success closing it and saying "@<login> added as Maintainer" [[space-69](#space-69)];
- Share in `a-spex`'s members panel sends `space.share` naming the repository and lists the members the reply carries [[space-69](#space-69)] [[space-62](#space-62)];
- `acme`'s "More" holds "Rename" and no "Delete", `a-spex` standing under it, `empty`'s holds both, `other`'s, your own group's and your namespace's neither, and `a-spex`'s overflow carries "Move…" named "Move to another group" while `b-spex`'s carries none, nor does your own group's own spex repository's, which the host lets the person move [[space-1](#space-1)] [[space-87](#space-87)];
- "Rename" on `acme` opens the editor holding "acme" and its path, Save disabled until either changes and the path not following the name; Save sends `space.group.rename` naming `acme` with only what changed and reads "Saving…" until the reply, a refusal standing in the editor with the name kept, and a success closing it [[space-76](#space-76)];
- "Delete" on `empty` asks "Delete empty?" with Keep focused, Escape keeping and sending nothing; Delete sends `space.group.delete` naming `empty` and reads "Deleting…" until the reply, a refusal standing beneath the heading with the group kept [[space-77](#space-77)];
- "Move…" on `a-spex` opens the picker with your login first and then every group but `acme`, `other` as "Other team · other" and `empty` by its name once, an option's accessible name holding the name before the path, Escape closing it; a pick sends `space.repository.move` naming `a-spex` and that group, or none for your own, the control reading "Moving…" until the reply, a refusal standing in the picker, and a success closing it [[space-78](#space-78)];
- every new control reads at most 14 characters at the 320-pixel floor [[space-28](#space-28)].

#### space-66

Where the Space surface renders over a signed-out home, when the reader signs in through each flow, the test suite shall assert through the surface:

- signed out, the header is the "Not signed in" card with its two sentences, its "Instance" field holding the default instance's origin, and Sign in, showing no home path, Copy path, read time or Refresh, and your own group is headed "Only you · named after your login at sign-in" with no path, its row reading "On this computer only — synced once you sign in" with no control [[space-3](#space-3)] [[space-1](#space-1)];
- in the device flow, the card reads "Continue in your browser:", the link "Open <host name> to sign in" whose href is the verification URL opening a new tab, and "Sign in there and approve; you return here signed in.", with no code shown; Sign in reads "Signing in…" disabled beside Cancel and no row carries a sign-in control [[space-3](#space-3)];
- in the browser flow opened through the bridge, the card reads that the browser is open at the host name with "Open it again" linking to the sign-in URL; where the bridge refused, it reads as the device flow's [[space-3](#space-3)];
- Cancel brings back the two sentences and Sign in; a denial reads the core's cause as one sentence with "Sign in again" [[space-3](#space-3)];
- where the core reports that an instance signed this device out, its heading reads "<host name> signed this device out. Sign in again to continue as @<login>." beside "Sign in again" and Forget, in English and in Chinese, while a heading signed out by the reader carries the two controls alone [[space-3](#space-3)] [[space-1](#space-1)];
- signed in, the instance's heading reads its host name until a read names its display name, and then its display name, "Signed in as @<login>" with Sign out and its read time, the header holds Refresh, "Add instance…" stands at the list's foot named "Another instance", and the surface ends in "Spex keeps this device's files in <home>" with the full path in its title and no control [[space-1](#space-1)];
- signed in, your own group is headed "Only you · @<login>", a group whose name differs from its full path "<name> · <full path>", and one whose name is its full path by its name once [[space-1](#space-1)];
- signed in, "Add to a group…" on a local-only row offers, under the instance's display name, your namespace as "Only you", a group whose name differs from its full path as "<name> · <full path>", and one whose name is its full path by its name once, each option's accessible name holding the name before the path, and a listed spex repository's group reads the same way [[space-58](#space-58)];
- a group's own repository reads "Group sessions" and your own group's own "Your sessions", a project's with no code remote "Code not on a remote", and a local-only one "On this computer only" [[space-1](#space-1)] [[space-61](#space-61)];
- a reachable row's phrase, and its placement's line in the Sync tab [[space-87](#space-87)], read "Synced <age>" from its recorded sync, and with none recorded, from its clone: "Synced <age>" where the clone's `spex` is the host's, "Not synced since <moment>" where it is not, and "Never synced" where the clone holds no host's `spex` [[space-61](#space-61)].

#### space-95

Where the Space surface renders over a home signed in to two instances, with a project placed at each, a project at the first alone whose placement file names a repository the second lists, a local-only project, and your own group placed at both, the test suite shall assert through the surface ([DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

- each row lists one line per placement with its instance's display name, its path, its state and its last sync, the named one reading "Not on this device" with Attach, and Members and "Move…" on the lines the view allows [[space-87](#space-87)];
- "Place at…" stands in the overflow of the project at one instance titled "Also place at <display name>", and in neither your own group's, a group's own nor the local-only project's, which offers "Add to a group…"; "Leave…" is titled "Remove from <display name>" on that project, opens a choice on the placed project, and stands on neither your own group's nor the local-only project's [[space-88](#space-88)] [[space-89](#space-89)];
- Remove sends `space.leave` naming that placement's instance, and a leave stopped for unreceived records asks the confirm again naming the count, its Remove sending `confirmed` [[space-89](#space-89)];
- Attach shows the notice on its line naming the second's display name and path, Cancel attaching nothing and Continue sending `space.attach` with `noticed` [[space-90](#space-90)];
- a placement owing its notice reads "Waiting for you to continue" with Continue on its line [[space-57](#space-57)];
- the second's group holding a placement shows one line naming the row with no control, and no "Delete" [[space-1](#space-1)];
- each placement's members panel says the records are also placed at the other's display name [[space-62](#space-62)];
- the card opened from "Add instance…" reads "Your own group's records will be kept there too." [[space-3](#space-3)];
- every new control reads at most 14 characters at the 320-pixel floor [[space-28](#space-28)].

### Browser Journeys

#### space-40

Where the browser journey harness ([DR-039](../decisions/039-browser-acceptance-journeys.md)) boots the served shell on an empty home against a stand-in Git host whose device-flow approvals the harness scripts, the test suite shall assert the first start and the first sign-in through the page alone:

- Space reads the "Not signed in" card with its two sentences, its "Instance" field holding the stand-in's origin, and Sign in as its one primary control, no home path, read time or Refresh, and your own group alone beneath it headed "Only you · named after your login at sign-in", its row reading "On this computer only — synced once you sign in" with no control [[space-1](#space-1)] [[space-3](#space-3)];
- a project added from the palette lists under "Only you" as "On this computer only" with no control [[space-61](#space-61)];
- Sign in shows "Open <host name> to sign in" linking to the verification URL that carries the code, and no code, the control reading "Signing in…" disabled until the harness approves the code the link carries; the instance's heading then reads the account and the header Refresh, your own group bears its login, and the surface ends in the line naming where this device's files are kept [[space-3](#space-3)] [[space-4](#space-4)] [[space-1](#space-1)];
- "Add to a group…" on the project's row offers the stand-in's groups, and picking one turns the row reachable with a sync time, the stand-in holding `<name>-spex` on its `spex` branch [[space-58](#space-58)] [[space-12](#space-12)];
- a session then run from the Captain home appears under the repository's local changes by its title, its Open session control opens its tab, and Sync sends it [[space-7](#space-7)] [[space-12](#space-12)];
- an intent queued while Space is shown lists under local changes with Refresh never activated, and the instance's heading reads the time of the read [[space-2](#space-2)] [[space-1](#space-1)].

#### space-41

Where the harness boots the served shell signed in on a home whose spex repository a peer home has pushed to — the peer holding a differing configuration and the same session changed — the test suite shall assert the daily sync with conflicts through the page:

- Check host lists the peer's session and Settings as incoming with the conflict marked and the row reading behind [[space-8](#space-8)];
- Sync ends "Needs your choice" with Apply disabled reading "0 of 2 chosen"; "Take host's" for the session and "Keep mine" for Settings by keyboard enable Apply; Apply's confirm names one replaced unit with Cancel focused, Escape keeps the choices, and confirming ends synced [[space-9](#space-9)] [[space-14](#space-14)] [[space-17](#space-17)] [[space-18](#space-18)];
- the session's tab shows the host's turns and Settings shows this device's configuration [[space-20](#space-20)];
- with the peer's `spex` moved after the check, Sync ends "changed again" with the ahead count on the row, and a second Sync pushes [[space-15](#space-15)];
- Stop during a check against a sleeping transport ends the check with its stopped state and Retry [[space-16](#space-16)];
- Members lists the stand-in's members with their role names and no link [[space-62](#space-62)];
- no visible text on the surface contains `ours`, `theirs`, `HEAD`, `origin/spex`, `@<host>/spex`, `namespace`, with Space reserved for the destination or hosted product [[space-27](#space-27)].

#### space-42

Where the harness boots the served shell with the demo project registered and a finished session, the test suite shall assert the exploring journey through the page:

- the Explore tab lists the session's node titled by its first turn with its manifest "Shared", its hints file "Stays here" and its records offering Open session; selecting the manifest previews pretty-printed JSON and selecting the hints file reads withheld [[space-23](#space-23)] [[space-24](#space-24)];
- an empty directory of a tracked kind — `intents/` before any queued intent — reads "Not yet shared", never "Stays here" [[space-23](#space-23)];
- "Stays on this device" names the eight families with their reasons [[space-25](#space-25)];
- the served page offers Copy path beside the repository and no reveal control, and acknowledges the copy [[space-26](#space-26)].

#### space-81

Where the harness boots the served shell signed in at the stand-in host holding in `acme` a project's spex repository a peer pushed with `bob` as its other member, when a folder holding the same code is added and Space picks that repository on the folder's row, once with the stand-in able to read members and once with it failing every members route, the test suite shall assert through the page in each case:

- the picker lists the repository with its group read as "Acme · acme", and with no member count after the full read [[space-58](#space-58)];
- picking it says the notice in the picker beneath it with Cancel focused, and Escape closes the notice alone, the repository still local only and focus back on it [[space-57](#space-57)];
- Continue closes the picker, and the row stands reachable in `acme` with a sync time, its notice recorded, its clone holding the peer's session and agreeing with the stand-in's `spex` [[space-57](#space-57)] [[space-58](#space-58)] [[space-13](#space-13)].

#### space-71

Where the harness boots the served shell signed in at the stand-in host, which by default lets the person create groups, and subgroups in `acme`, and add and remove members there, the test suite shall assert the organizer's journey through the page: a group created from the instance's heading and a subgroup under `acme`, each listed with its full path as Create closes its editor [[space-68](#space-68)] [[space-1](#space-1)]; a project added from the palette offered your login and then every group, each by its name with its path after it where the two differ, and picked into the new subgroup, the stand-in then holding `<name>-spex` there on its `spex` branch [[space-58](#space-58)]; a member added to the subgroup by login at Maintainer, the line "@<login> added as Maintainer" shown and the stand-in's members then listing them [[space-69](#space-69)]; a second addition of the same login refused in place with the stand-in's words, and a login the stand-in knows no account for refused naming it [[space-69](#space-69)]; the new controls fitting at the 320-pixel floor [[space-28](#space-28)]; and the member removed after the confirm, the stand-in's members then not listing them [[space-72](#space-72)].

#### space-75

Where the harness boots the served shell signed in at the stand-in host, whose remote URLs lie under its Git origin, with a project's spex repository synced in `acme` and another account's spex repository listed under `bob`, when the journey shows Space with that project's members panel open, first in English and then in Chinese, the test suite shall assert that the Space surface holds no link, and no text, title or accessible name holding a URL under the stand-in's URL or naming `gitlab`, while `bob`'s heading carries no control [[space-1](#space-1)] [[space-62](#space-62)].

#### space-80

Where the harness boots the served shell signed in at the stand-in host, whose remote URLs lie under its Git origin, with a project's spex repository synced in `acme`, the test suite shall assert the undo through the page ([DR-120](../decisions/120-the-instance-is-the-space.md)):

- a group created from the instance's heading and renamed through its heading's "Rename" stands under its new name and path, and a rename the stand-in refuses stands in the editor with its words and the name kept [[space-76](#space-76)];
- `acme`, holding the project, carries no "Delete", while the new group's "Delete" asks with Keep focused, a deletion the stand-in refuses stands beneath the heading with its words, and a second "Delete" leaves the list and the stand-in without the group [[space-1](#space-1)] [[space-77](#space-77)];
- the project's "Move…" offers your login and every group but `acme`, each by its name with its path after it where the two differ; a move the stand-in refuses stands in the picker with its words, and a move into `acme/research` lists the row under it at once with its key unchanged, the row's Sync then moving the clone under `workspace/@<host>/acme/research/` [[space-78](#space-78)];
- with the editor, the confirm and the picker each open, and in Chinese with the picker open, the surface holds no link and no text, title or accessible name holding a URL under the stand-in's URL or naming `gitlab` [[space-1](#space-1)];
- the new controls fit at the 320-pixel floor [[space-28](#space-28)].

#### space-85

Where the harness boots the served shell signed in at one stand-in instance with a project's spex repository synced in `acme`, beside a second stand-in instance on another Git backend that holds a group `acme` and whose read says the person may not create a group, and with a local-only project registered, the test suite shall assert the second instance's journey through the page ([DR-127](../decisions/127-a-home-signed-in-to-several-instances.md)):

- "Add instance…" at the list's foot, named "Another instance", opens the card in its place with "Instance" holding the first's origin, and Escape closes the card, "Add instance…" standing again; an origin with a path is refused in the card with the field kept, and the second's origin signs in through the device flow the harness approves [[space-3](#space-3)] [[space-1](#space-1)];
- each instance stands under a heading of its display name with "Signed in as @<login>", Sign out and its read time, the first's carrying "New group" and the second's "Groups are made by the people who run <display name>", each `acme` beneath its own instance [[space-1](#space-1)];
- "Pick a group" on the local-only row offers each instance's namespace and groups under its display name, and picking the second's `acme` turns the row reachable under it, the second holding `<name>-spex` there on its `spex` branch, and the row's Sync then pushes to the second [[space-58](#space-58)] [[space-12](#space-12)];
- "Move…" on that row's placement line offers the second's groups alone [[space-78](#space-78)];
- Sign out on the first's heading leaves it with "Sign in again" and Forget, its project reading unreachable and the second's reachable, and Forget is refused naming the first's project, the heading kept, while its "Sign in again" signs it in through the device flow, "Add instance…" disabled until that flow ends, its project reachable again [[space-6](#space-6)] [[space-82](#space-82)] [[space-61](#space-61)] [[space-3](#space-3)];
- in English and in Chinese, the surface holds no link and no text, title or accessible name holding a URL under either stand-in's URL but its origin, or naming `gitlab` [[space-1](#space-1)];
- the new controls fit at the 320-pixel floor [[space-28](#space-28)].

#### space-96

Where the harness boots the served shell for two homes against two stand-in instances on separate Git backends, each home signed in to both through device flows the harness approves, the first holding a project synced in the first's `acme`, the test suite shall assert through the pages alone that a project placed at two stand-in instances syncs through a device holding both and that a second device attaches from the placement's file ([DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

- on the first page, "Place at…" on the project's row places it in the second's `workshop`, Continue on the notice pushing there, the row naming both placements [[space-88](#space-88)] [[space-57](#space-57)] [[space-87](#space-87)];
- a session run on the first page and synced lands on both stand-ins' `spex` branches [[space-12](#space-12)];
- on the second page, the project joined from the first's `acme` names the second's placement with Attach; Attach shows the notice naming the second's display name and path, and Continue attaches it, its line reading synced [[space-90](#space-90)] [[space-87](#space-87)];
- a session run on the second page and synced reaches both stand-ins, and the first page's Sync brings it [[space-12](#space-12)];
- no visible text contains `@<host>/spex`, `remote` or `namespace`, and the new controls fit at the 320-pixel floor [[space-27](#space-27)] [[space-28](#space-28)].

#### space-43

Where the harness boots the served shell signed in with a spex repository carrying local changes of every kind and a check ended in choices, when the journey shows Space with its Sync tab and Explore tab at the widths 320, 480, 640, 800, 1024 and 1280 pixels, each at 800 and 400 pixels tall, with the sidebar collapsed and, from 480 pixels, open ([DR-041](../decisions/041-chrome-that-fits.md)), the test suite shall assert fit through the page, naming every offending element: the page scrolls in neither direction, no element outside the diff canvas is wider than its box, within every header, instance heading, group row, repository row, list row and picker row no two visible siblings overlap and every child lies inside its parent, and every control keeps its accessible name at every width [[space-28](#space-28)].

#### space-44

Where the harness boots the served shell signed in with a spex repository whose check ended in choices, when the Space surface is scanned by axe-core at WCAG 2.1 AA in the light and the dark theme, the test suite shall assert no serious or critical violation, with the picker's radio groups, the tree, the groups list and the tabs named for assistive technology [[space-17](#space-17)] [[space-23](#space-23)] [[space-1](#space-1)].

#### space-36

Where the harness boots the served shell on an empty home against a stand-in holding a group with a project's spex repository a peer pushed — the peer holding a configuration, a titled session and one queued intent — the test suite shall assert the second device's set-up through the page:

- after sign-in the group's row lists the project with no "Here" mark and "Open here" [[space-61](#space-61)] [[space-111](#space-111)];
- "Open here" clones the spex repository and, the code remote being a path the harness serves, the code into the folder the page names, the row reading reachable once the code is in that folder and the project listed in the sidebar with the peer's session and intent [[space-63](#space-63)] [[space-61](#space-61)] [[space-20](#space-20)];
- a session run here and synced lands on the stand-in's `spex` branch beside the peer's [[space-12](#space-12)].

#### space-104

Where the core runs as a seat against the stand-in instance and the Git HTTP host, the test suite shall assert that a sign-in places your own group nowhere and offers no pick on it [[space-102](#space-102)], that a join allocates the folder at its path and pairs it, that a code clone failing for want of a credential leaves the records readable with the phrase and the host in the reply, and that a retry after `credential.set` clones into the same folder [[space-103](#space-103)].

#### space-105

Where a real core holds a repository at two stand-in instances, the test suite shall assert coherent repository readings across controlled Git and Check barriers:

- a read held between its placement lines while Check finishes never pairs the ending phase with the first placement's earlier incoming list [[space-29](#space-29)] [[space-8](#space-8)];
- a read begun before Check cannot replace its completed placement plan when that read resumes, with the retained remote diff still naming the incoming unit [[space-29](#space-29)] [[space-10](#space-10)];
- an idle read held after capturing a tracking ref cannot replace the plan a later idle read completed after that ref advanced, with the retained remote diff still naming the incoming unit [[space-29](#space-29)] [[space-10](#space-10)];
- a read whose captured branch names move while it waits computes its branch counts and three-way lists from the captured commits consistently [[space-33](#space-33)].

#### space-110

When real protocol clients exercise reported sign-in completion against a controlled instance, the integration suite shall assert start-before-completion ordering, committed success independent of a later setup failure, denial/expiry/stop, cancellation during the initial awaited start, legacy start behavior and stale or foreign-connection cancellation leaving a replacement attempt untouched [[space-108](#space-108)] [[space-109](#space-109)].

#### space-113

Where the Space surface renders over a signed-in home whose instance lists a group `acme` holding a subgroup `acme/research`, a project repository `alpha-spex` cloned here, one `beta-spex` not on this device, `acme-spex` as the group's own, one server `lab-1` of `acme`, a repository under another login `bob`, and your namespace holding your own group's repository alone, with one seat open at `lab-1` holding `beta-spex`, the test suite shall assert through the surface, in English and in Chinese:

- the list heads your own group "Only you · @ada", `acme` by its name beside its member count with "Research" nested within it, no heading for your namespace, and "Shared by @bob" for the other login's rows [[space-1](#space-1)];
- `acme`'s heading carries one "More" control holding Members, "New subgroup", "Rename" and no "Delete", and beneath it one line "lab-1 · Connected" with Disconnect in its overflow, reading "lab-1" with Connect once the seat is closed [[space-1](#space-1)];
- the rows read "alpha", "beta" and "Group sessions", never `-spex`, `alpha`'s carrying "Here" and `beta`'s "On lab-1", `alpha`'s one phrase its last sync and its "More" holding "Sync now", Members, "Explore records", "Move…", "Place at…" and "Leave…", no line of a placement on the row and its lines in the Sync tab the row's name opens [[space-1](#space-1)] [[space-87](#space-87)];
- `alpha`'s Open offers "Show" for this computer and "Open on lab-1", `beta`'s "Open here" and "Show on lab-1", and `acme-spex`'s "Open here" asking for the folder its sessions run in; "Open here" on `beta` sends `space.join` with the folder the picker returns, "Open on lab-1" on `alpha` sends that seat's client `space.join` with no folder once the seat's `signIn` reads `signedIn`, the row reading "Opening on lab-1…" meanwhile, and nothing while it reads `running` [[space-111](#space-111)] [[space-63](#space-63)];
- a local-only project under "Only you" reads "On this computer only" with "Add to a group…", whose picker lists "Only you" first and then `acme` and "Research" [[space-61](#space-61)] [[space-58](#space-58)];
- a placement ended in choices needed reads "Changed here and at <display name>" with Resolve on `alpha`'s row, Resolve showing the picker beneath the row with "Keep what's here", "Take <display name>'s", "All here" and "All <display name>'s", and the unrelated-history outcome "Merge histories…" with its confirmation [[space-14](#space-14)] [[space-17](#space-17)] [[space-13](#space-13)];
- a repair row reads "<project> in acme: its folder on this computer is missing" with the folder beneath it, "Choose folder…" and "Not on this computer", declining sending `space.repair.decline` [[space-46](#space-46)] [[space-49](#space-49)];
- shown at the seat's place, the same surface reads "Not on lab-1", "Keep what's on lab-1", "Spex keeps lab-1's files in <home>" and the seat's sign-in card's two sentences naming lab-1, its "Add instance…" card saying nothing of your own group's records [[space-112](#space-112)];
- every new control reads at most 14 characters at the 320-pixel floor [[space-28](#space-28)].

#### space-114

Where the browser journey harness ([DR-039](../decisions/039-browser-acceptance-journeys.md)) boots the served shell beside a stand-in instance listing one server of the member's group, a stand-in hub relaying to a further core standing for its seat, signed in at the same instance and holding no project, when the journey activates "Open on <server>" on a group project's row of this computer's Space, the test suite shall assert through the page: the contract shown once and "I understand" sending `server.open`, the server's line reading "Connecting to <server>…" then "Connected", the row reading "Opening on <server>…" and then "On <server>", that seat's core having received `space.join` with no folder, the project standing under the server's heading in the sidebar, and a second "Open on <server>" of another project sending its join at once with no contract [[space-111](#space-111)] [[space-1](#space-1)] [[space-63](#space-63)].
