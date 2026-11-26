<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# space: The Space Surface

## Intent

This package defines the Space surface and personal project record synchronization ([DR-246](../decisions/246-remove-groups-and-team-servers-from-the-clients.md)).
A Space **instance** is a Spex Space service the home has signed in to, listed in `home.yaml` by its origin with its account, its display name and its sign-out mark, the first it lists, or the origin the home was created with while it lists none, being the home's **default instance** [[storage-2](storage.md#storage-2)] ([DR-127](../decisions/127-a-home-signed-in-to-several-instances.md)); your **namespace** at an instance is where it lists spex repositories under your login there.
A **spex repository** holds global or project records on its `spex` branch and is identified locally by its clone’s path under `workspace/` [[storage-1](storage.md#storage-1)].
The core performs every Git operation and every call to an instance; the surface renders the core's state and runs neither itself.

## External Behavior

### At a Glance

#### space-1

While the IDE is connected, Space shall show local projects and one flat list of personal projects for each account listed by the home [[storage-2](storage.md#storage-2)] ([DR-246](../decisions/246-remove-groups-and-team-servers-from-the-clients.md)):

- each project appears under its own Space, including while that Space is signed out [[space-6](#space-6)]; for a clone, the store determines its instance [[storage-31](storage.md#storage-31)], and clones with no instance appear under “This computer”;
- each Space uses its display name with its signed-in login, sign-in state, and its latest Refresh activity;
- an unsigned Space offers Sign in and a signed-in Space offers Sign out; a signed-out entry also offers Remove from this list;
- each row offers its local opening action [[space-111](#space-111)] and a row under a Space identifies its configured code location by the corresponding Space or the code’s own remote once the home knows every listed and default Space’s Git address;
- the project name opens its attached Sync and Explore tabs directly below the row [[space-125](#space-125)], one panel at a time, exposing its expanded state and its panel's identity;
- local records remain available when Space is signed out, including through Files & history [[space-55](#space-55)].

#### space-87

While a spex repository's clone holds a placement, a placement file of it names a host repository a signed-in instance lists [[storage-36](storage.md#storage-36)], or a creation for it waits at an instance [[space-64](#space-64)], its Sync tab shall carry one line per placement — those its clone holds in the order added [[storage-34](storage.md#storage-34)], then each a file names that a signed-in instance lists and no remote here holds, then each instance a creation waits at — naming the Space’s display name, or the path placement's remote as a report reads it [[space-15](#space-15)], with its own state [[space-61](#space-61)] and these ([DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md), [DR-172](../decisions/172-surfaces-a-fresh-user-reads.md)):

| The line carries | While |
| --- | --- |
| the step in flight [[space-12](#space-12)] | a sync runs its turn |
| the outcome the last sync left there [[space-12](#space-12)] — "Changed here and at <display name>" with Resolve [[space-14](#space-14)], "Started separately at <display name>" with "Combine…" [[space-13](#space-13)], the stopped step's cause with Retry [[space-15](#space-15)] | until the next operation or Dismiss |
| "Not on this computer" | a placement file names it and no remote here holds it |
| its last sync [[space-61](#space-61)] | it is reachable or read-only |

- a host repository a placement file of a clone here names stands as a line of that clone's row and as no row of its own, offering no Open, and one a remote here holds under another instance's name is followed to the file's instance instead [[space-60](#space-60)] [[space-91](#space-91)];
- a waiting creation or branch preparation at a placement [[space-64](#space-64)] shows its phrase on that line in place of the state's.

#### space-120

The Space surface shall give each spex repository's row the first standing phrase below that its state [[space-61](#space-61)] and its placements' lines [[space-87](#space-87)] hold, with a local-only or not-on-this-device row reading none while no step is in flight ([DR-172](../decisions/172-surfaces-a-fresh-user-reads.md)):

1. the step in flight [[space-12](#space-12)], or "Opening…" while its join runs [[space-63](#space-63)];
2. "1 record to sync" or "<n> records to sync", <n> being the count of its local units [[space-7](#space-7)], whose kinds stand in its title;
3. "Changed here and at <display name>" with Resolve [[space-14](#space-14)];
4. "Started separately at <display name>" with "Combine…" [[space-13](#space-13)];
5. a stopped step's cause with Retry [[space-15](#space-15)];
6. "Read-only: <the host's reason>";
7. "Unreachable: <cause>";
8. "Signed out of <display name>";
9. its last sync — "Synced <age>", "Not synced since <moment>" or "Never synced".

- <display name> is that of the instance of the first placement, in the lines' order, holding the phrase.

#### space-2

The Space surface shall re-read the core's state only on an event, never on a timer: when the surface opens, when the window regains focus, when the core announces a sync's end, a sign-in's end, a host read, a project added or removed, a configuration change, a session added or removed, a turn starting or settling, or an intent change while no turn of that intent's project runs, when the core accepts an intent change this page sent, and when the reader activates Refresh, which also makes the core read every signed-in instance [[git-host-5](git-host.md#git-host-5)]:

- a record stored while a turn runs prompts no re-read, the re-read at that turn's settle showing it;
- an intent changed from another client while a turn of its project runs shows at that turn's settle, on window focus or on Refresh.

#### space-106

When a reply carrying Space state arrives, the UI shall apply it only if no newer state request or `space.state` broadcast has superseded its request, including replies to Sign out, "Remove from this list" and declining a repair.

### Signing In

#### space-3

The Space surface shall offer the sign-in at an instance in one card titled "Sign in to a Space", holding the chooser of Spaces [[space-115](#space-115)] and Sign in as its one primary control, starting the sign-in at the origin chosen, and no sentence — the card standing as the header while the home lists no instance, and in place of "Add a Space…" once the reader activates it [[space-1](#space-1)], with Cancel beside Sign in and Escape cancelling ([DR-103](../decisions/103-the-home-and-its-groups.md), [DR-127](../decisions/127-a-home-signed-in-to-several-instances.md), [DR-172](../decisions/172-surfaces-a-fresh-user-reads.md)):

- "Sign in again" on a signed-out instance's heading starts the sign-in at that instance's origin, its flow reading on that heading as on the card;
- Sign in starts the browser flow on the desktop [[git-host-2](git-host.md#git-host-2)] and the device flow in a browser client of the server shell [[git-host-3](git-host.md#git-host-3)], the browser flow attempting automatic opening through the native bridge [[app-shell-37](app-shell.md#app-shell-37)] where available, and the card reading in either "Continue in your browser" with the ordinary external link "Open <Space>" [[app-shell-21](app-shell.md#app-shell-21)] — to the complete sign-in URL regardless of the automatic opener's result, or to the verification URL in a new tab — and showing no code;
- <Space> is the display name the directory or the home gives the origin being signed in to, else its host name: the page the person opens says how to sign in there, and the surface names no account elsewhere;
- while a flow runs, Sign in reads "Signing in…", disabled, beside Cancel, and no row or heading offers a sign-in control, "Add a Space…" disabled;
- a URL the core refuses by the origin rule [[git-host-2](git-host.md#git-host-2)] starts no flow, the card reading the core's cause with the field kept;
- a denial, an expiry or a refusal — a sign-in at a listed instance as another account among them [[git-host-2](git-host.md#git-host-2)] — ends the flow, the card reading the core's cause and the control "Sign in again";
- while no flow runs or stands failed and the core reports that an instance signed this device out [[git-host-4](git-host.md#git-host-4)], that instance's heading reads "<display name> · signed out · @<login>", <login> being the account's there, beside its "Sign in again";
- a placement at a signed-out instance reads "Signed out of <display name>" unless a signed-in instance lists its host repository [[space-61](#space-61)], and the surface never contacts an instance that is not signed in.

#### space-115

When the reader opens the sign-in card [[space-3](#space-3)], the surface shall offer one chooser listing each Space of the public registry's directory [[environments-39](environments.md#environments-39)] by its display name, its sign-in providers as icons, each titled "Accepts ⟨provider⟩ accounts" and none a control, then a last entry "Other Space…" revealing in its place a field captioned "Space address", preselecting the default instance's entry [[storage-2](storage.md#storage-2)], or "Other Space…" with the field holding that instance's origin where the directory lists none such, and standing as the field alone, holding that origin, where the directory cannot be read, no directory entry establishing credential trust ([DR-168](../decisions/168-independent-package-registry.md), [DR-172](../decisions/172-surfaces-a-fresh-user-reads.md)):

- the reader's own pick of "Other Space…" shows the field empty with the placeholder `https://…`.

#### space-4

When sign-in completes [[git-host-2](git-host.md#git-host-2)] [[git-host-3](git-host.md#git-host-3)], the core shall set up the signed-in account’s personal records [[space-59](#space-59)] [[space-65](#space-65)] and refresh its personal project list [[git-host-5](git-host.md#git-host-5)] without placing any local project automatically.

#### space-5

When a working folder's remote is read for `project.json` [[storage-3](storage.md#storage-3)], or the reader names a remote for a spex repository's code, the core shall write the URL without any transport and never a credential:

| URL | Outcome |
| --- | --- |
| `ssh://…`, `git@host:path`, `https://…`, `http://…`, an absolute local path | written as the code's canonical identity for `project.json` [[storage-3](storage.md#storage-3)], otherwise as given, an SSH form's user being the transport's own and no credential |
| blank, or containing whitespace or control characters | refused as malformed |
| carrying anything before the host on `http://` or `https://`, with or without a colon (`https://user:secret@host`, `https://token@host`) | refused naming the rule that the app stores no credential, pointing to SSH keys or the machine's credential helper |

#### space-136

When classifying a records URL, the core shall match it against each listed or default Space’s last reported Git address [[storage-2](storage.md#storage-2)], using the service origin until its Git address is known and treating an unmatched address as external:

- match HTTP(S) by normalized origin and path segments;
- match `ssh://` and Git’s SCP-style SSH addresses by normalized hostname and path segments, regardless of SSH username and port.

#### space-140

When preparing a records transfer, the core shall apply the transport rules of the placement’s destination [[space-136](#space-136)]:

- a Space supplies its current repository address [[git-host-22](git-host.md#git-host-22)] and brokers its credential [[git-host-9](git-host.md#git-host-9)]. Git must resolve to the approved address with HTTP redirects disabled;
- when the clone holds no Space placement, route its existing `origin` [[storage-34](storage.md#storage-34)] whose own HTTP(S) address belongs to a known Space through that Space as a candidate for adoption, proceeding only when the Space freshly confirms the matching personal repository [[git-host-22](git-host.md#git-host-22)];
- for any other path placement whose own address belongs to a known Space, including either SSH form and an HTTP(S) `origin` beside a Space placement, stop before a Space read for that placement or a Git transfer, with the destination guidance and Retry [[space-15](#space-15)];
- an external remote uses the computer’s Git credentials, redirect settings and native LFS authentication, independently of Space availability;
- check the effective fetch and push URLs, the selected LFS download endpoint and its SSH address when reported, and any override for an active LFS upload, including the default-branch push during Check. A Space’s LFS endpoint may use an external origin without its brokered credential. At a known Space, LFS must use the approved repository’s HTTP(S) endpoint. If Git settings change the Space-approved Git address, select an unapproved LFS endpoint at a known Space or send an external placement to a known Space, stop before that transfer with the configuration guidance and Retry [[space-15](#space-15)].

#### space-6

When the reader activates Sign out on a signed-in instance's heading, the core shall revoke this device at that instance and forget its credential [[git-host-10](git-host.md#git-host-10)], and the surface shall keep that instance's heading, signed out [[space-1](#space-1)], every placement at it turning unreachable with "Signed out of <display name>" unless a signed-in instance lists its host repository, a spex repository reading unreachable only where every placement it holds does [[space-61](#space-61)], their records and clones kept ([DR-103](../decisions/103-the-home-and-its-groups.md), [DR-127](../decisions/127-a-home-signed-in-to-several-instances.md), [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md), [DR-172](../decisions/172-surfaces-a-fresh-user-reads.md)).

#### space-82

When the reader selects Remove from this list for a signed-out Space, the core shall remove its entry from the home [[storage-2](storage.md#storage-2)] after following placements another signed-in Space still identifies as personal [[space-60](#space-60)], refusing while a clone or placement still depends on that Space:

- a failed ownership read at the Space a placement would follow refuses Forget with that Space’s reported failure and keeps the failed placement;
- the global records repository keeps its local folder; the core follows another signed-in Space listing the same personal repository, or drops only the forgotten Space’s global records remote.

### Personal Projects and Records

#### space-125

The project's records panel shall share the project's row background and thin interaction-colour left rule, with its own Sync and Explore tabs and a close control in the attached panel ([DR-225](../decisions/225-bounded-surfaces-and-attached-records.md)).

#### space-59

While the home’s personal records folder bears this device's user name, as it does until the home's first sign-in [[storage-2](storage.md#storage-2)], when a sign-in sets the home up [[space-4](#space-4)] for a login at that instance whose folder name — the login in lowercase kebab-case, every run of characters other than `a`–`z` and `0`–`9` one hyphen and none leading or trailing, without any trailing `-spex`, or `me` where nothing remains — is other than that name, the core shall rename the folder under `workspace/` to that folder name and its spex repository `<folder name>-spex`, rewriting every pair that names it [[storage-2](storage.md#storage-2)] in the same step, and where that instance already holds `<folder name>-spex` in your namespace pushed from another device, shall join the two histories, every unit on both sides being one choice [[space-13](#space-13)] ([DR-103](../decisions/103-the-home-and-its-groups.md), [DR-127](../decisions/127-a-home-signed-in-to-several-instances.md), [DR-221](../decisions/221-your-own-groups-folder-is-a-lowercase-name-checked-before-it-moves.md)):

- the rename is one step at its instant — every clone beneath moved by one rename and every pair rewritten, with nothing awaited between — refusing nothing beneath the folder [[space-21](#space-21)];
- what the core holds open within the clones — its reading of their sessions [[core-service-60](core-service.md#core-service-60)] and config [[core-service-2](core-service.md#core-service-2)], and the attachments it reads there [[media-22](media.md#media-22)] — is let go of across the step on every platform and taken up again where each clone then lies, what that reading would have reported meanwhile read once; where something else holds a file or folder of a clone open, as Windows then refuses its rename, the step is tried again, whole — the clones beneath read again, one that came meanwhile let go of too, and a sign-in signed out or replaced meanwhile moving nothing — up to twenty times 50 ms apart, and still held moves nothing, the next set-up asking again;
- where the clone of personal records on this device provably holds only its unchanged generated bootstrap — no session, intent or authoring session, its exact tree, beside the placement files the core writes [[storage-36](storage.md#storage-36)], still the bootstrap the core recorded when it generated the starter configuration and environment in an empty clone, and no history beyond that bootstrap and this join's Saves — the join takes the host's side for every unit without asking, so a second device starts from what the first pushed; authored changes carried by a Save, preexisting or relocated files, migration and missing bootstrap proof use the ordinary comparison and choices for differing shared units [[space-13](#space-13)], the proof retained across a restart and rename ([DR-103](../decisions/103-the-home-and-its-groups.md));
- the rename moves nothing, leaving every clone, pair and session where it was for the next set-up to ask again, where any clone's destination is already taken — by another folder, by the clone itself under another spelling of its folder, or by a folder on its path below `workspace/` that stands spelled otherwise — or where any clone beneath holds a session lease `sessions/.<id>.lock` other than a Playbook session-lease record whose `hostname` and `pid` read as a dead owner of this machine by steps 3 and 4 of the root lease's rule [[storage-26](storage.md#storage-26)], such a lease moving with the clone ([DR-108](../decisions/108-the-root-lease-names-the-machine.md));
- the rename moves nothing, likewise, where `home.yaml` does not read [[storage-2](storage.md#storage-2)] or would not stand with every pair rewritten and the new folder name written, checked before any clone moves;
- where a clone's move fails after others moved, or the write of `home.yaml` fails after the last, the clones already moved go back, last first, each only onto a path that stands empty, and `home.yaml` stands as it was, the next set-up asking again ([DR-221](../decisions/221-your-own-groups-folder-is-a-lowercase-name-checked-before-it-moves.md)).

#### space-60

When a sync of a spex repository reaches a placement's Check step [[space-12](#space-12)] while a host read [[git-host-5](git-host.md#git-host-5)], a placement file under another instance signed in on this device that lists its host repository [[storage-36](storage.md#storage-36)] or the instances migration's receipt [[storage-30](storage.md#storage-30)] places that placement elsewhere than it stands — at another instance than its remote names, or, for the key placement, at another path than the clone's key [[storage-1](storage.md#storage-1)], as a Space rename or move, a first placement or an Attach from the personal records folder [[storage-35](storage.md#storage-35)] and a move the migration deferred leave it — the core shall, before any fetch or push there, rename that placement's remote to the folder of the instance it follows, rewriting its placement file to that instance and deleting the former instance's file [[storage-36](storage.md#storage-36)], and, for the key placement, move the clone to its path at the instance a host read reports it at, else to the destination that receipt names, rewriting every pair that names it, its session locations, its sync preferences [[storage-5](storage.md#storage-5)] and the skills placed for your agents beneath it, all in the same step, so that its key and name follow its key placement ([DR-103](../decisions/103-the-home-and-its-groups.md), [DR-127](../decisions/127-a-home-signed-in-to-several-instances.md), [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

- the move is one rename within the sync at its instant, made only while the clone still reads the remote its check read before asking the host and lies where the home says, and, where a host read placed it, records the host's id [[space-21](#space-21)];
- a placement following another instance has its remote renamed, and its sync preferences [[storage-5](storage.md#storage-5)] re-keyed, in the same step [[space-141](#space-141)] and proceeds with that instance — its catalog, its credential and, for the key placement, the commit identity [[space-32](#space-32)] — and a follow onto an instance at which the clone holds another placement is not made, the placement reading unreachable;
- a rename or move of another placement's host repository at its instance changes that placement's path alone, moving no clone [[space-87](#space-87)];
- the global records repository keeps its location as its placements follow, each changing only its remote and placement file;
- what the core holds open within the clone is let go of across the move and taken up again where the clone then lies, before resuming work; where something else holds a file or folder of the clone open, as Windows then refuses its rename, the move is tried again, whole, up to twenty times 50 ms apart, and still held stops that placement with nothing moved, naming the project as in use, with Retry [[space-15](#space-15)];
- the move stops that placement, the clone, its pairs and its sessions left where they were, where the destination is taken by anything but the clone itself under the same namespace folder — which a rename changing only the case of the repository's own name moves onto — or a folder on its path below `workspace/` stands spelled otherwise, or where the clone holds a session lease under it, naming that session with Retry [[space-15](#space-15)];
- the move, and a pick's [[storage-35](storage.md#storage-35)], is checked against `home.yaml` before the clone moves, and moves nothing where `home.yaml` does not read [[storage-2](storage.md#storage-2)] or would not stand with its pairs rewritten, and a write of `home.yaml` that fails after the clone moved moves it back where that path stands empty or, after a case-only rename where the filesystem folds case, names the clone itself ([DR-221](../decisions/221-your-own-groups-folder-is-a-lowercase-name-checked-before-it-moves.md)).

#### space-61

The Space surface shall show each spex repository, and each of its placements, in exactly one of these states, a placement's read from the last answer of the instance governing it [[git-host-5](git-host.md#git-host-5)] and this device's files, and a clone holding a placement reading reachable where any placement it holds does, read-only where none does and one is read-only, and unreachable where every one it holds is ([DR-103](../decisions/103-the-home-and-its-groups.md), [DR-127](../decisions/127-a-home-signed-in-to-several-instances.md), [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md), [DR-172](../decisions/172-surfaces-a-fresh-user-reads.md)):

| State | Holds while | Row reads | Control |
| --- | --- | --- | --- |
| local only | the clone holds no placement [[storage-34](storage.md#storage-34)] | nothing [[space-120](#space-120)] | Open project and “Sync to a Space…” to choose a signed-in account [[space-97](#space-97)] |
| reachable | the latest full or selected-target read of the instance governing it lists it [[git-host-5](git-host.md#git-host-5)] [[git-host-22](git-host.md#git-host-22)] and the clone is here, no join of it running [[space-63](#space-63)], or it is the path placement this device can reach | its standing phrase [[space-120](#space-120)] | Open [[space-111](#space-111)], with "Sync records" in its overflow |
| read-only | the host listed it archived, or with the account below the role that may push, or refused the push other than for an explicit content-size limit [[space-15](#space-15)] | "Read-only: <the host's reason>"; new sessions reach only the placements that take pushes, said so | Open [[space-111](#space-111)], "Sync records" in its overflow bringing only |
| unreachable | the host stopped listing it, refused the read, the device is offline, or its instance is signed out while no signed-in instance lists its host repository | "Unreachable: <cause>", or "Signed out of <display name>" while its instance is signed out | Retry acts as Refresh [[space-2](#space-2)]; no Retry while its instance is signed out |
| not on this device | an instance listed it and no clone is here, or its join still runs [[space-63](#space-63)], or a placement file of a clone here names it | nothing, the row carrying no local-location text [[space-1](#space-1)]; "Opening…" while its join runs | Open [[space-111](#space-111)] |

- a local project holding only a path placement can also choose its first Space [[space-137](#space-137)] [[space-97](#space-97)], including when the path placement is refused because of its own address [[space-140](#space-140)]. Once a Space destination is attached, the row offers the controls for its current state;
- a reachable placement's last sync is read from this device's last completed sync with it [[space-22](#space-22)] as "Synced <age>", or, where none is recorded, from the last one its clone holds ([DR-111](../decisions/111-the-core-coordinates-as-git-does.md)): "Synced <age>" at `spex`'s commit time where `spex` equals that placement's `spex` as the clone last fetched or pushed it, "Not synced since <moment>" at their common ancestor's commit time where the two differ, and "Never synced" where the clone holds no `spex` of it sharing its history;
- nothing on this device is deleted because the host refused or stopped listing;
- a waiting creation or branch preparation [[space-64](#space-64)] shows on its placement's line [[space-87](#space-87)]; the wait is held for the app's run alone, so after a restart the row offers its control again and the next attempt finds whether it is available.

#### space-137

When the reader chooses “Sync to a Space…” for a project with no Space placement, the Space surface shall open a panel at that row for selecting its first destination [[space-97](#space-97)]:

- focus the Space selector and preselect its first signed-in Space. Changing the Space resets the project records choice;
- default to creating a new copy. Where the Space lists unpaired personal records matching the project name and code, offer those copies as alternatives;
- only “Sync records” submits the choice. While it is pending, hold the controls and dismissal. On success close the panel, and on refusal keep the choice and show the cause.

#### space-63

When the reader opens a repository [[space-111](#space-111)] that this device lacks and a fresh check confirms it belongs to the signed-in account’s own namespace [[git-host-22](git-host.md#git-host-22)], the core shall clone it under the folder of the instance its row stands under [[space-1](#space-1)], at its path there [[storage-1](storage.md#storage-1)], its remote named by that folder [[storage-34](storage.md#storage-34)], then, where its `project.json` names a remote, clone the code using that remote's canonical URL, including an older GitHub SSH URL's HTTPS equivalent [[projects-44](projects.md#projects-44)], with this device's own Git into a folder the reader picks — the picker opened by the act itself — with the credential a signed-in instance of one of its placements brokers at that instance's Git origin, and none of the app's at any other [[projects-37](projects.md#projects-37)] — or take a working folder the reader already has, and pair the two [[storage-6](storage.md#storage-6)] ([DR-103](../decisions/103-the-home-and-its-groups.md), [DR-127](../decisions/127-a-home-signed-in-to-several-instances.md), [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md), [DR-172](../decisions/172-surfaces-a-fresh-user-reads.md)):

- a host id the instance's last read lacks is looked up in a fresh read of that instance before the open is refused `not_found`, so a personal project created since that read opens without a Refresh ([DR-172](../decisions/172-surfaces-a-fresh-user-reads.md));
- the join runs at its Check step while the spex repository clones and at its Code step, its line reading "Downloading code…", while the code clones, offering Stop at neither, and ends only once the code is cloned and paired or its clone has failed [[space-61](#space-61)];
- the spex repository clones into a private folder beside its place, named apart from the repository's name so that one of the longest name a folder takes still joins, and moves there only where nothing stands at that instant; a join finding its place taken — another join's clone — stops, leaving that clone as it stands, and every join removes its own private folder alone, on every platform, Windows included, Git's read-only objects among its files, a removal failing recording a diagnostic naming that folder and its cause, the join's own outcome reported;
- a code clone that fails stops the join at its Code step with the host's failure classified at the Git origin of the instance that brokered it and Git's words at any other, no URL under any listed instance's reported Git origin shown [[space-15](#space-15)], leaving the spex repository cloned and the row offering "Choose folder…" to pair it later.

#### space-64

When a step at the host — creating a spex repository [[git-host-6](git-host.md#git-host-6)] or preparing its `spex` branch [[git-host-7](git-host.md#git-host-7)] — is refused for the account's rights, the surface shall show the step as waiting on that placement's line [[space-87](#space-87)], with the host's words in its title, and the core shall ask again at the next read, finding the result if it has become available ([DR-103](../decisions/103-the-home-and-its-groups.md), [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

- nobody is sent to edit the host's settings: the row names the step and the Space, never a host page to change.

#### space-65

When a sign-in finds no global records placement at that Space [[space-4](#space-4)], the core shall join the signed-in account’s existing global records repository there or create `<own name>-spex` in that account’s own namespace [[git-host-6](git-host.md#git-host-6)] and prepare its branch [[git-host-7](git-host.md#git-host-7)]:

- the local repository keeps its home folder [[space-59](#space-59)] and adds that Space’s placement;
- the existing sync machine combines its records [[space-12](#space-12)] [[space-13](#space-13)], taking the Space’s contents when the local tree proves it holds only its unchanged bootstrap [[space-59](#space-59)];
- a refusal leaves the local records intact and reports the waiting step [[space-64](#space-64)].

#### space-97

When a client selects a Space destination through `space.pick` or `space.place` [[space-29](#space-29)], the core shall, as an operation of the clone's machine [[space-31](#space-31)], join the named personal repository only after the Space confirms the current account and repository in its namespace [[git-host-22](git-host.md#git-host-22)], its history joined with the clone's as any two [[space-13](#space-13)], or create `<name>-spex` in the signed-in account’s own namespace [[git-host-6](git-host.md#git-host-6)], then sync the clone, that placement among its placements [[space-12](#space-12)] ([DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

- a creation the host leaves pending adds no placement, its wait standing on that instance's line [[space-64](#space-64)] while the clone syncs its other placements;
- if the account cannot be verified before either command’s repository creation, that creation is refused and reports the Space’s failure [[git-host-11](git-host.md#git-host-11)].

#### space-98

When a client sends `space.leave` [[space-29](#space-29)], the core shall, as an operation of the clone's machine [[space-31](#space-31)], fetch that placement, then drop its remote and delete its placement file, changing nothing at the host ([DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

| Case | Outcome |
| --- | --- |
| its instance signed out, another signed-in instance listing its host repository [[git-host-5](git-host.md#git-host-5)], and the clone holding no placement at that instance | nothing fetched or dropped: its remote renamed to the folder of the instance it follows [[space-60](#space-60)] and its file rewritten to that instance [[storage-36](storage.md#storage-36)]; where at a try of the clone's move that instance no longer reads as signed in and listing it, or the clone holds a placement there, nothing changed, the leave stopped as changed meanwhile, with Retry |
| the ownership read at the Space a placement would follow fails | nothing dropped; the leave stops with the Space’s reported failure and Retry |
| a unit that placement's `spex` or the clone holds is held by no remaining placement's `spex`, as the clone last fetched or pushed it or at their last shared commit — a placement whose last check found its host holding no `spex` holding none; every unit, where none remains — and the leave is not `confirmed` | nothing dropped; the leave stopped `unreceived`, naming the count |
| the placement cannot be read, and the leave is not `confirmed` | nothing dropped; the leave stopped, saying that records pushed there since the last sync may be left behind |
| it is the first placement | the clone moved with the drop [[storage-38](storage.md#storage-38)], a refusal of that move refusing the leave whole, naming the session or the instance, with Retry |

- the file's deletion is a local change the clone's next sync carries to its remaining placements [[space-7](#space-7)].

#### space-99

When a client sends `space.attach` [[space-29](#space-29)], the core shall, as an operation of the clone's machine [[space-31](#space-31)], verify the placement file’s repository id and personal namespace against the Space’s current account and repository details [[git-host-22](git-host.md#git-host-22)], then add its remote, named by its instance's folder with the host's id beside it [[storage-34](storage.md#storage-34)], and sync the clone, that placement among its placements [[space-12](#space-12)] ([DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

- a local-only clone in the personal records folder attaching its first placement moves as a pick's does [[storage-35](storage.md#storage-35)].

#### space-111

When the reader activates the opening action on a project row [[space-1](#space-1)], the surface shall open the working project when already paired, join its records and ask for its working folder when available at the Space [[space-63](#space-63)], or offer to choose a working folder for its local records [[space-47](#space-47)].

### Repairs

#### space-46

When the core reports the home's diagnostics, it shall fold every diagnostic a folder on this device would repair into one task, carrying the facts that task needs, and leave every unrelated diagnostic unfolded [[core-service-86](core-service.md#core-service-86)] ([DR-065](../decisions/065-repairs-the-reader-answers.md), [DR-194](../decisions/194-saved-work-is-a-choice-not-setup-debt.md), [DR-195](../decisions/195-read-saved-conversations-before-locating-files.md)):

| Repair | Raised by | Presented as |
| --- | --- | --- |
| a spex repository with no working folder here | a clone under `workspace/` that no pair names [[storage-2](storage.md#storage-2)] | a separate group headed by the project name from valid metadata with a folder icon, otherwise Earlier conversations, with its saved-conversation count; no storage-derived name or project/group composite |
| a working folder whose clone is missing | a pair naming a clone that is not under `workspace/` | the named folder whose saved records are unavailable |

- blocking and unrelated diagnostics stay separate from a folder task;
- a task's conversation previews form a semantic list of up to three recent title excerpts with decorative chat-bubble icons and known saved dates, with date or untitled fallbacks and the count of further conversations, never a raw identifier;
- a preview carrying a session identity opens that conversation's stored history directly in its reader [[run-view-33](run-view.md#run-view-33)], without choosing a project folder or starting a turn; an older preview without an identity remains text, and a preview whose session is no longer listed keeps the reader on Space with a Refresh instruction;
- different saved-record groups remain separate even when their project names match, and opening or locating a folder for one affects none of the others;
- one chosen folder applies to every conversation held by that repository, with every previously used directory labelled explicitly rather than implied to be missing;
- repairs stand before unfolded diagnostics, blocking ones first, then by session count descending, name and path, with no reordering while an editor is open; dismissed items stand in their own section [[space-124](#space-124)].

#### space-47

When the user locates a repair's existing project folder or dismisses the reminder, the Space surface shall settle that choice in place ([DR-195](../decisions/195-read-saved-conversations-before-locating-files.md)):

- the shared introduction explains the folder task's purpose [[space-55](#space-55)] without promising continuation after relocation [[core-service-73](core-service.md#core-service-73)]; "Locate folder…" opens the editor, "Use <folder>" may directly accept a checked proposal [[space-53](#space-53)], and Dismiss sets the reminder aside [[space-49](#space-49)];
- the editor asks where the files for that project or saved work are, labels its field "Project folder on this computer", starts with only the checked proposal or an empty value, offers Browse… where a directory picker exists, and states that the existing-folder selection creates or downloads no project and applies to all conversations in that group alone;
- Use this folder confirms the candidate, Cancel and Escape cancel without changing it, and a refusal stays beside the field with its value kept;
- confirmation applies the existing-identity folder choice [[core-service-85](core-service.md#core-service-85)], recording the previous directories as aliases so those conversations remain readable with the chosen folder [[storage-6](storage.md#storage-6)];
- a different folder already paired elsewhere, a nested working folder and a running turn remain refusals [[core-service-85](core-service.md#core-service-85)];
- sync does not disable the choice [[space-21](#space-21)].

#### space-48

When a repair's folder is saved with its recorded directories attached [[space-47](#space-47)], the Space surface shall replace that task in place with an outcome confirming the saved folder, without claiming that every older conversation could be opened ([DR-194](../decisions/194-saved-work-is-a-choice-not-setup-debt.md)):

- Open project alone leaves the review; any import still refused keeps its own diagnostic [[core-service-85](core-service.md#core-service-85)];
- the live region confirms the saved-folder outcome;
- focus moves to the next unanswered task's first action, wrapping to the top, or to the outcome's Open project when none remains;
- the outcome holds its place through background reads until the reader's Refresh [[space-2](#space-2)] or leaving the surface.

#### space-49

While a task stands unanswered, the core shall count it as an unresolved task, only this device's reader's act settling it ([DR-065](../decisions/065-repairs-the-reader-answers.md), [DR-194](../decisions/194-saved-work-is-a-choice-not-setup-debt.md)):

- drawing the task, opening review or re-reading state settles nothing;
- Dismiss keeps saved conversations and reduces the header count by that task alone, leaving unrelated active notices counted and moving the task to Dismissed [[space-124](#space-124)], without claiming the project is absent from this computer ([DR-197](../decisions/197-dismiss-reminders-without-losing-history.md));
- the dismissed task remains reachable with its folder choice and Show again still available [[space-124](#space-124)];
- resolving removes the repair, and postponement lapses only when its recorded facts change, not when a folder appears or disappears.

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
- the surface keeps checks beside their explicitly named previously used folders inside Technical details, with an unknown check claiming neither absence nor an invalid project; a failed candidate submission names that candidate and the existing-project requirement [[core-service-85](core-service.md#core-service-85)] ([DR-194](../decisions/194-saved-work-is-a-choice-not-setup-debt.md)).

#### space-54

While this device's reader has postponed a repair's folder choice, the core shall hold that answer in this device's preferences alone, keyed by the facts the repair names [[storage-5](storage.md#storage-5)] ([DR-065](../decisions/065-repairs-the-reader-answers.md)):

- the record is written only when he declines, and removed when the repair is answered otherwise, never by a read or a render;
- a repair whose recorded facts change is another repair, so it carries no record and counts afresh;
- an answer naming no repair the core still reports is discarded, except where the fold carries a blocking diagnostic;
- answering a repair the core does not report is refused.

#### space-55

While saved-work diagnostics exist, the Space surface shall offer a review that distinguishes optional recovery from work requiring attention ([DR-194](../decisions/194-saved-work-is-a-choice-not-setup-debt.md)):

- nonblocking review stays initially closed and neutral, opened by Files & history [[space-1](#space-1)] or a saved conversation's Back to Space action [[run-view-33](run-view.md#run-view-33)], with active folder tasks and their explanation under Locate project files, standalone active diagnostics under a separate Review notices heading, and dismissed items in their own section [[space-124](#space-124)];
- one introduction above repository folder tasks says the conversation history is saved on this computer, that identified conversations can be read now and further project work needs the files; where no task contains conversations, it explains only the required files; where no preview can open history, it makes no read-now promise, and no version claims the project files are absent or repeats the explanation under each project [DR-214](../decisions/214-project-navigation-and-contextual-recovery.md);
- a newly appearing blocking diagnostic opens review automatically and gives the panel the Needs attention heading and attention styling, without turning unrelated optional tasks into blockers; closing review keeps that blocker closed through a refresh while no new blocker arrives ([DR-211](../decisions/211-a-panel-carries-its-own-way-out.md));
- review has a borderless Close cross at its first card's trailing header edge, or inside the Dismissed card outside its summary control for a dismissed-only review ([DR-212](../decisions/212-panel-dismissal-as-quiet-chrome.md)); Close and the nearest Escape close the view and return focus to its opener without dismissing a task or changing the unresolved count and warning [[space-1](#space-1)]; a pending repair or notice mutation keeps review visible and disables its Close and Files & history controls until response;
- each task has one recognizable heading and its controls, separated by spacing or dividers rather than one large warning field;
- dismissed folder tasks retain Locate folder and remain reachable at Space → Files & history → Dismissed after a zero count, reload or later visit [[space-54](#space-54)] [[space-124](#space-124)]; resolved tasks show the saved-folder outcome [[space-48](#space-48)] ([DR-214](../decisions/214-project-navigation-and-contextual-recovery.md)).

#### space-121

While an unfolded storage diagnostic other than a pending merge stands, the Space surface shall describe what saved work is unavailable, using the core's optional code rather than matching its reason [[core-service-86](core-service.md#core-service-86)], with original file and reason inside collapsed Technical details ([DR-194](../decisions/194-saved-work-is-a-choice-not-setup-debt.md)):

| Case | Meaning shown |
| --- | --- |
| `session-upgrade` | an older conversation cannot be opened; Spex could not read it and the original file is preserved |
| absent or unknown code | saved data cannot be used, with technical details available without inventing a cause or recovery |

- no instruction asks the person to share details through an unspecified support route, and nonblocking impact is not repeated on every row;
- technical paths and reasons wrap without widening the surface.

#### space-124

When the reader changes an optional item's dismissal, the Space surface shall move that item between active review and one collapsed Dismissed section only after the core confirms the change ([DR-197](../decisions/197-dismiss-reminders-without-losing-history.md)):

- folder reminders offer Dismiss through their existing local acknowledgement [[space-54](#space-54)], and nonblocking standalone older-conversation notices offer Dismiss only where the core supplies the matching capability [[core-service-148](core-service.md#core-service-148)];
- Dismissed shows its own item count, grouping folder reminders and notices outside the active sections and warning count; each item offers Show again, which restores its active count, while folder reminders retain their conversation and folder actions;
- an ordinary Files & history visit starts with Dismissed collapsed, the control remaining available when its contents alone stand at zero pending notices [[space-1](#space-1)]; a saved-conversation reader's Back to Space action [[run-view-33](run-view.md#run-view-33)] reveals dismissed folder items;
- a successful dismissal confirms that the original saved work is kept, visibly and through the live region, with a dismissed folder task naming Dismissed within Space → Files & history as its return path ([DR-214](../decisions/214-project-navigation-and-contextual-recovery.md)); a refusal keeps the item, its count and an adjacent error, and pending commands disable repeated actions;
- keyboard focus remains on a useful review control after the acted-on item moves, and technical details remain available inside either list [[space-121](#space-121)].

### Changes

#### space-7

While a spex repository's Sync tab is shown, it shall list the local units — those whose working-tree bytes differ from their common ancestor with some placement's `spex` branch while that placement's do not, or from the last commit where no placement has been checked [[space-33](#space-33)] — grouped by kind in this order with these labels under the heading "To send (<n>)", <n> being their count, never a raw diff of a session ([DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md), [DR-172](../decisions/172-surfaces-a-fresh-user-reads.md)):

| Kind | Unit | Label | Detail |
| --- | --- | --- | --- |
| Sessions | `sessions/<id>` bundle | the session's title, or "untitled session" | new, updated or deleted; turn count |
| Intents | `intents/<id>.json` with its assets | the intent's title | new, updated or deleted |
| Authoring | `authoring/<id>` | the session's title, or "untitled authoring session" | new, updated or deleted |
| Environment | `spex.yaml` with `spex.lock`, wherever a clone holds them — global records, or a project's until the migration moves them [[storage-1](storage.md#storage-1)] | "Spec packages changed" | a View diff control [[space-10](#space-10)] |
| Settings | `config/playbook.config.yaml` | "Settings changed" | a View diff control [[space-10](#space-10)] |
| Code | `project.json` | "Code remote changed" | a View diff control [[space-10](#space-10)] |
| Sync rules | `.gitignore`, `.gitattributes` | "Sync rules updated" | a View diff control [[space-10](#space-10)] |
| Other | a spec package's folder with every file under it [[storage-11](storage.md#storage-11)], or any other tracked path | the folder, ending `/`, or the path | new, updated or deleted |

- a session row carries Open session, which opens the session as a tab [[run-view-68](run-view.md#run-view-68)];
- with no local unit the list reads "Nothing to send from this computer".

#### space-8

When the user activates Check on a spex repository, the core shall fetch each placement's `spex` branch in the order added without merging, and the Sync tab shall list each placement's incoming units [[space-33](#space-33)] under the heading "From <display name> (<n>)", <display name> being its instance's and <n> the count of its incoming units, with the labels of [[space-7](#space-7)], each marked new, updated or deleted against the common ancestor with that placement and marked as a choice to make where this device changed it too ([DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md), [DR-172](../decisions/172-surfaces-a-fresh-user-reads.md)):

- the control reads "Checking…" in flight and offers Stop [[space-16](#space-16)];
- ahead, behind and the check time update on the placement's line in the Sync tab [[space-87](#space-87)], the row's one phrase following it ([DR-172](../decisions/172-surfaces-a-fresh-user-reads.md));
- a placement holding no `spex` branch reads "<display name> holds no records yet; Sync will send these";
- a placement of unrelated history reads "Started separately at <display name>" with "Combine…" on its line [[space-13](#space-13)] and lists nothing;
- each destination follows the records transport rules [[space-140](#space-140)], and a failed transport reports per [[space-15](#space-15)];
- where the fetched tree uses LFS, Check also fetches that tree's LFS objects with the placement's credential [[git-host-9](git-host.md#git-host-9)], within the same stoppable transport step [[space-16](#space-16)], without path exclusions or fetching unrelated recent refs; a tree using no LFS requires no LFS executable.

#### space-9

While a sync has ended in choices needed at a placement, the Sync tab shall show the incoming list of the first placement in order so ended above the conflict picker [[space-17](#space-17)], with the step line reading "Needs your choice" and the caption "Your changes are saved; nothing is sent to <display name> yet", <display name> being that placement's instance's ([DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md), [DR-172](../decisions/172-surfaces-a-fresh-user-reads.md)).

#### space-10

When the user activates View diff on an Environment, Settings, Code, Sync rules or Other row, the surface shall show that unit's line diff in place — this device's version against the common ancestor for a local row, headed "Changes on this computer", the placement's version against it for an incoming row, headed "Changes at <display name>", either side under its heading on a conflict row — additions and removals marked in text as well as color, and Hide diff removing it; a session, intent or authoring row offers no diff ([DR-172](../decisions/172-surfaces-a-fresh-user-reads.md)).

### Syncing

#### space-11

When the user activates Sync on a spex repository, the core shall admit it only while every condition below holds, otherwise refusing before the first step with the surface showing the reason beside the disabled control:

| Condition | Refusal shown |
| --- | --- |
| some placement can run: its instance signed in, or a signed-in instance listing its host repository — the sync then following it [[space-60](#space-60)] — or the path placement, which this device can reach | "Sign in to <display name> first", <display name> the first placement's instance's as last read, else its host name, and "Choose a Space to sync first" for a clone with no placement ([DR-127](../decisions/127-a-home-signed-in-to-several-instances.md), [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md), [DR-172](../decisions/172-surfaces-a-fresh-user-reads.md)) |
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
| 1 Save | refresh the managed rules [[storage-17](storage.md#storage-17)] and the project file’s code remote [[storage-3](storage.md#storage-3)] from the paired working folder’s `origin`, stage the catalog files, refuse a staged ignored-family path, validate the staged tree in a private copy [[storage-12](storage.md#storage-12)], commit that tree, where it differs from `HEAD`'s, on the `HEAD` it was staged against by a conditional ref update | "Saving…" |
| 2 Check | apply the placement's routing rule [[space-140](#space-140)] before fetch. For a remote routed through a Space, including an adoption candidate, read that Space's fresh catalog and target repository alone [[git-host-22](git-host.md#git-host-22)] and stop if confirmation fails. After confirmation, prepare its branch where the first push is ahead [[git-host-7](git-host.md#git-host-7)] and fetch its `spex` branch with the Space's brokered credential [[git-host-9](git-host.md#git-host-9)]. For a remote routed as a path placement, make no Space read | "Checking <display name>…" |
| 3 Compare | plan every unit against the common ancestor of `spex` and that placement's [[storage-11](storage.md#storage-11)] [[space-33](#space-33)]; nothing incoming skips to Push | "Comparing…" |
| 4 Apply | write the selection and one merge commit, or fast-forward [[space-19](#space-19)], then reconcile the clone's placements with their files [[space-91](#space-91)] | "Merging…" |
| 5 Refresh | re-validate and re-index [[space-20](#space-20)] | "Reloading…" |
| 6 Push | push `spex` to that placement, setting the upstream once at the first placement; skipped for a read-only placement | "Sending…" |
| 7 Catch up | push `spex` once more, a fast-forward, to each placement a later merge left behind; one rejected runs that placement once more from Check | "Sending…" |

| Outcome, per placement | State afterwards |
| --- | --- |
| synced | its `spex` equals the clone's; its line reads "Synced just now · N sent · M received", or "Everything is in sync" when nothing moved; a read-only placement's reads "M received; nothing sent" |
| behind | the sync leaves its `spex` behind the clone's; its line reads "Behind — Sync again" |
| choices needed | its merge not made, every merge and push before it standing, no operation running once the sync ends [[space-14](#space-14)] |
| stopped | the step, cause and way forward on its line [[space-15](#space-15)] |

- where the repair marker an interrupted Apply left stands, the sync first runs its repair, before Save [[space-67](#space-67)];
- a placement's instance is the one its remote is named by, or the one a follow makes it follow [[space-60](#space-60)] ([DR-127](../decisions/127-a-home-signed-in-to-several-instances.md));
- <display name> in a line is that of the placement's instance, or the path placement's remote as a report reads it [[space-15](#space-15)] ([DR-172](../decisions/172-surfaces-a-fresh-user-reads.md));
- the code remote refresh changes only `remote`, atomically and only when different, preserving the project’s name and format; it writes no credential [[space-5](#space-5)];
- only a paired existing working folder that is its Git work-tree root supplies the remote; absent or non-root folders and records without a project file leave it unchanged;
- an absent `origin` writes `null`, while a failed Git read or invalid remote stops Save without replacing the project file; reads and checks alone never refresh it.

#### space-133

When a sync is about to push records to a Space placement, the core shall check the Space’s current account and destination details again [[git-host-22](git-host.md#git-host-22)] and stop before Git transfer if the repository has changed identity, remote URL, personal namespace or write access ([DR-246](../decisions/246-remove-groups-and-team-servers-from-the-clients.md)).

#### space-91

When a placement's merge in a sync changes the clone's placement files [[storage-36](storage.md#storage-36)], the core shall, before the next placement's turn, reconcile the clone's placements with them ([DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

| The merge left | The core |
| --- | --- |
| a placement's file removed while another file names its host repository at an instance signed in on this device that lists it [[git-host-5](git-host.md#git-host-5)] | renames that placement's remote to that instance's folder as a follow does [[space-60](#space-60)], dropping nothing |
| a placement's file removed otherwise, or changed to name another host repository | drops that placement's remote, the clone's records kept, moving the clone where it is the first placement [[storage-38](storage.md#storage-38)], and lists the host repository a changed file names as a placement not on this device [[space-87](#space-87)] |
| two files naming one host repository, by the Git origins and ids the core read [[git-host-5](git-host.md#git-host-5)] | deletes every such file but that of the instance the clone holds it under after any such rename, or, where it holds it under none, of the instance governing it [[git-host-5](git-host.md#git-host-5)], a local change the next sync carries |
| a placement with no file, the path placement among them | drops nothing |
| a file that does not read as its encoding | drops and offers nothing |

- a placement's file removed on this device, or changed there to name another host repository, fares as the first two rows say — the file being the proposal — at the next sync, its Save committing that change and the reconcile coming before that placement's turn;
- a drop the clone's move refuses [[storage-38](storage.md#storage-38)] waits for the next sync, which retries it before that placement's turn and syncs nothing with that placement while it waits;
- a follow or a drop that moves the clone reads the files again at each try of its move [[space-60](#space-60)], one finding them changed so that the row it took no longer holds moving and dropping nothing, the placement as it stands until its next turn;
- two devices placing the clone at one instance meet as one choice of that file [[space-17](#space-17)], the side not chosen dropping its remote at its next sync and leaving its host repository to its owner.

#### space-13

Where the clone's `spex` and a placement's `spex` share no common ancestor, when a sync compares at that placement, the core shall stop that placement with "Started separately at <display name>", <display name> being its instance's, unless the sync was started as a join of it, whereupon it shall compare against the empty tree [[storage-11](storage.md#storage-11)] — a unit present on one side only taken, a unit present on both sides with different bytes a choice [[space-17](#space-17)], except that signing in takes the Space copy when the global records clone still contains only its untouched bootstrap [[space-59](#space-59)] [[space-65](#space-65)] ([DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md), [DR-172](../decisions/172-surfaces-a-fresh-user-reads.md)):

- "Combine…" confirms inline, naming that both sets of records become one and that a unit present on both sides differently will ask for a choice ([DR-010](../decisions/010-interface-craft.md) §4, [DR-172](../decisions/172-surfaces-a-fresh-user-reads.md));
- Sign-in, a destination selection [[space-97](#space-97)] and Attach [[space-99](#space-99)] authorize their join without a second confirmation.

#### space-14

When the Compare step at a placement finds a unit changed differently on both sides without a choice for it [[storage-11](storage.md#storage-11)], that placement shall end in choices needed — its merge not made, the Save commit and every earlier placement's merge and push standing, no lease held — the next placement running and the row reading "Changed here and at <display name>" with Resolve, which shows the picker beneath the row for the first placement in order so ended [[space-9](#space-9)] [[space-17](#space-17)] ([DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md), [DR-172](../decisions/172-surfaces-a-fresh-user-reads.md)).

#### space-15

When a sync or check step fails, the core shall limit the stop to the affected placement during Check, Compare and Push, including a destination refused by the core [[space-140](#space-140)], and stop the whole sync on Stop, Git’s own error, a Save or Apply failure or a Refresh failure other than a diagnostic [[space-20](#space-20)], leaving the state and showing the cause, guidance and Retry on the placement’s line as follows ([DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

| Step | Cause | State left | Surface |
| --- | --- | --- | --- |
| Save | a staged path of an ignored family, or validation refusing a file | index reset, no commit, files untouched | the path or file and reason; "Nothing was saved" |
| Save | `spex` moved while the Save validated — a commit from a terminal | no commit; that commit and every file stand | Git's cause-preserving summary; Retry |
| Check, Push | the host unreachable, or the device offline | commits stand | "Could not reach <display name>"; check the network; Retry |
| Check, Push | the host asking to wait — its rate limit [[git-host-11](git-host.md#git-host-11)] | commits stand | "<display name> asks to wait N seconds" (or "a moment"); "Retry waits, then runs the step."; Retry, which waits the time out before the step [[git-host-21](git-host.md#git-host-21)] |
| Check, Push | Stop while a call of the step waits out the host's rate limit [[git-host-21](git-host.md#git-host-21)] | commits stand | "Stopped while waiting for <display name>"; "Retry waits, then runs the step."; Retry |
| Check, Push | the host answering that this device must sign in again [[git-host-4](git-host.md#git-host-4)] | commits stand | "Sign in again"; that instance's heading's "Sign in again" [[space-3](#space-3)]; Retry after |
| Push | the host explicitly rejecting content above a size limit | commits and the existing access state stand | cause `size_limit`; "<display name> refused content above its size limit", carrying the reported limit where unambiguously readable; saved commits remain on this computer; address the content limit, then Retry, with no automatic retry ([DR-129](../decisions/129-content-size-is-not-permission.md)) |
| Check, Push | the host refusing with its words — the repository read-only, the push rejected by a rule other than explicit content-size rejection, the account's role too low | commits stand | "<display name> refused: <the host's words>" [[space-50](#space-50)]; the placement turns read-only |
| Check, Push | the host no longer listing the repository | commits stand | the Space-account unavailable message [[git-host-11](git-host.md#git-host-11)]; the placement turns unreachable; nothing deleted |
| Check, Push | no answer within the transport limit, or Stop | commits stand | "No answer from <display name>"; Retry |
| Check, Push | the host answering its transport with an HTTP status no row above reads | commits stand | "<display name> answered with an error (HTTP <status>)"; Retry |
| Check, Push | Git settings change a Space-approved destination [[space-140](#space-140)] | only that placement stops before transfer | “Git settings prevent using the records address from this Space. Check the URL rewrite rules and Git LFS settings, then retry.”; Retry |
| Check, Push | the remote is routed as a path placement and its own address belongs to a known Space [[space-140](#space-140)] | only that placement stops before transfer, with local access retained [[space-61](#space-61)] | cause `git`; “Choose that Space as a sync destination”; “Change or remove this project's records remote in Git, then retry.”; Retry |
| Check, Push | Git settings send an external transfer to a known Space [[space-140](#space-140)] | only that placement stops before transfer | “Git settings direct this external records transfer to a Space. Check the URL rewrite rules, push URL, and Git LFS settings, then retry.”; Retry |
| Compare | unrelated history | unchanged | "Combine…" [[space-13](#space-13)] |
| Apply | a chosen unit refused by validation | nothing written; its base stands [[space-19](#space-19)] | the unit and reason; the picker stays with the unit marked; Retry |
| Check | a session lease beneath a clone its move would move, a deferred migration move among them [[space-60](#space-60)] | commits stand; the clone where it was, nothing fetched | the session and reason; Retry |
| Apply | a written session's lease held elsewhere, or a written authoring session's turn running [[space-19](#space-19)] | no merge commit; its base stands, the units written before it kept with the repair marker | the session and reason; Retry, whose repair finishes the selection [[space-67](#space-67)] |
| Apply | a written unit changed since its base on the second cycle [[space-19](#space-19)] | no merge commit; its base stands, the units written before it left as local changes | "Records changed twice while syncing"; Retry |
| Refresh | a diagnostic | the merge stands committed | the file and reason under issues |
| Push | rejected as not fast-forward | merge committed, ahead shown | one automatic cycle from Check; a second rejection reads "<display name> changed again"; Retry |
| any | Git's own error, or a failing system call such as a clone removed meanwhile, otherwise | that step's row | its cause-preserving summary; Retry |

- a generic Git failure summary keeps at most three nonempty lines: the first line containing `fatal:` or `error:` (case-insensitive), else the first line, followed by the final two other distinct lines in their original order; wrapping an already summarized failure preserves that cause and advice;
- <display name> in a report is that of the placement's instance [[space-12](#space-12)], and a remote URL is never printed with a credential ([DR-127](../decisions/127-a-home-signed-in-to-several-instances.md), [DR-172](../decisions/172-surfaces-a-fresh-user-reads.md));
- no line a report carries — Git's summary and the host's `remote:` words alike — holds a URL under any listed instance's reported Git origin. A records remote routed through a Space, including an adoption candidate [[space-140](#space-140)], reads as its repository path in that Space, with or without `.git` and a trailing `/` on the URL. If the first placement is routed through a Space and has no matching listing, use the clone's local key without its Space folder prefix, if present [[storage-1](storage.md#storage-1)]. A records remote routed as a path placement [[space-140](#space-140)] reads as the matched Space's display name [[space-136](#space-136)] in every line position, otherwise as itself with any embedded user removed. Any other URL under a Space's reported Git origin reads as that Space's display name, the placement's Space where several report that origin. A code clone's lines name the code's remote as the reader set it only outside all of them [[space-63](#space-63)] ([DR-120](../decisions/120-the-instance-is-the-space.md), [DR-127](../decisions/127-a-home-signed-in-to-several-instances.md));
- an explicit content-size rejection carries only the instance, the size cause and a reported limit where readable, never its raw transport words, backing-system names or links ([DR-129](../decisions/129-content-size-is-not-permission.md));
- the report stands until the next operation or Dismiss.

#### space-16

While a sync or check runs a transport step — Check or Push — the surface shall offer Stop, which ends the Git child, or the wait of the step's call to the host [[git-host-21](git-host.md#git-host-21)], and leaves that step's stopped state [[space-15](#space-15)]; Save, Compare, Apply and Refresh are bounded local steps and offer no Stop, and the Check step offers it only once its Git child runs or a call of it waits out the host's rate limit, the host read before it otherwise being bounded by the client's own timeout.

#### space-50

Where a Space refuses a read or push [[space-15](#space-15)], the core shall report that Space’s sanitized refusal and the next action its cause supports ([DR-064](../decisions/064-honest-remote-failure.md)):

- no role name or cached list is read for the guidance: the refusal is the answer;
- an explicit content-size rejection [[space-15](#space-15)] gives no access or sign-in guidance and keeps its raw transport text private ([DR-129](../decisions/129-content-size-is-not-permission.md));
- a path placement whose remote is a local path, used without the host, names the folder's permissions rather than an account.

### Choices

#### space-17

While conflicting units stand, the picker shall present each as one row — its label [[space-7](#space-7)] and two exclusive choices, "Keep this computer's" and "Take <display name>'s", each carrying its side's summary, the host's naming the instance of the placement the choices are for [[space-9](#space-9)] — with nothing preselected and Apply disabled with "N of M chosen" until every row has a choice ([DR-172](../decisions/172-surfaces-a-fresh-user-reads.md)):

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
- a unit is every file of it on disk — a session's root and the files under its replay, blob and asset folders, one added since its base among them — each read as Git reads its path, filters applied, and its write is one versioned write at its instant [[storage-14](storage.md#storage-14)], made only while the clone's folder and its `.git` are the ones the apply began in, every file of the unit holds the base's bytes or the selected ones, a session's management lease is taken, and no turn this core runs for an authoring session instance [[core-service-96](core-service.md#core-service-96)] owns an authoring unit's current recorded instance, a turn its transcript records unfinished refusing nothing, and otherwise refused with no folder made; a file already holding the selected bytes is left as it is;
- live unit reads, replacements, deletions and hint cleanup obey selection's destination-parent checks [[storage-21](storage.md#storage-21)];
- a unit whose selected bytes equal the base's is neither written nor leased, so a session held elsewhere stops no write but its own;
- sessions are written before the other units, so an intent naming a session's newer turn is never written ahead of a session refused at its write;
- each written unit's files are replaced with a session's other files before its root and, for a replacement root, obsolete files removed afterward, each of its folders the write emptied removed, they and its attachment folder owner-only whatever the process umask or the hand that made the folder, its session's hints and viewed marker cleared [[storage-5](storage.md#storage-5)]; once every unit holds its selection, so are those of every session the selection changed, one written before an interruption among them;
- the index is set to the candidate's tree and the commit records that tree, never the working tree, so what another process writes beside the apply stays a local change;
- the working tree never holds Git's own merge output — no conflict marker, no `MERGE_HEAD`;
- a refused write records no merge commit, its base standing: a held lease or a running authoring turn stops the sync naming the session with the repair marker kept, so units naming one another are finished together by the next admission's repair [[space-67](#space-67)]; a changed unit removes the marker, leaves the units already written as local changes equal to that placement's side, and restarts the sync once from Save, stopping on the second time — where such a change leaves a written unit naming one not written, the restart's Save refuses it, naming the file for the reader to repair [[space-15](#space-15)]; a moved clone stops it with the marker where the clone now lies [[space-15](#space-15)];
- an unsafe destination stops Apply with its repair marker and already-written units retained, deferring live refresh until the folder is restored and Retry repairs the selection [[space-20](#space-20)];
- an apply interrupted before its commit lands is repaired from its recorded selection [[space-67](#space-67)].

#### space-20

When a sync's Apply step has changed the working tree — by merge or fast-forward, by the units it wrote before a changed unit refused its write [[space-19](#space-19)], or by a repair [[space-67](#space-67)] — the core shall re-validate [[storage-12](storage.md#storage-12)] and re-index the clone before the sync pushes, restarts or stops, so every view reflects the working tree without a restart:

- a session whose bundle changed is announced with its history replaced [[core-service-87](core-service.md#core-service-87)], a new one served and a deleted one forgotten as the shared store's arrivals and departures are [[core-service-60](core-service.md#core-service-60)] [[core-service-76](core-service.md#core-service-76)], and the project's ledger is announced changed [[core-service-51](core-service.md#core-service-51)];
- the intents, the global environment and the preferences are re-read, and the configuration reloads through its ordinary reload [[core-service-2](core-service.md#core-service-2)], that environment's placements refreshed [[environments-8](environments.md#environments-8)];
- before partial-write refresh, inspect the live record and settings families without following links; an unsafe parent defers validation and re-indexing, reports the path with instructions to restore the folder then Retry, and preserves the repair marker and written bytes [[space-19](#space-19)];
- a diagnostic found here is reported under issues and undoes nothing; it refuses no later sync, whose Save validates the staged files and names any still invalid [[space-15](#space-15)], and a Save whose staged files validate clears it.

#### space-21

While a sync, check, join, move, place, leave or attach of a spex repository is running, the core shall refuse no command and no operation because it runs ([DR-111](../decisions/111-the-core-coordinates-as-git-does.md), [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

- every write beneath the clone lands or is refused at its own instant — a file changed since its writer read it as "changed meanwhile; retry", a session's lease as that session's refusal — and the runtime's own admission of messages stays;
- each of the core's own writes beneath the clone resolves the clone's address at that write, never at an earlier read, so no write lands where a moved or removed clone stood and no folder is made there again;
- the clone's own operations run one at a time on its machine [[space-31](#space-31)]: a second Sync asked while a sync runs, or a Check asked while a sync or a check runs, joins that operation, a Sync asked while a check runs follows it, making no Save until that check has ended, and a place, a leave or an attach asked while a sync runs follows it as a Sync follows a check; no other command waits for any of them;
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

#### space-141

When a placement changes, the core shall retain or discard its tracking ref and last check according to the repository they describe, with the last-sync receipt [[space-22](#space-22)] following its remote [[storage-5](storage.md#storage-5)]:

- a rename or follow of the same Space repository id preserves the ref and check [[space-60](#space-60)];
- dropping the placement clears the ref and check [[space-98](#space-98)] [[space-91](#space-91)], as does replacing a user-configured records remote, whose former receipt is cleared as well [[space-29](#space-29)].

### Explorer and Privacy

#### space-23

While a spex repository's Explore tab is shown, the Space surface shall present its clone as a read-only tree with a preview pane beside it, every entry annotated from the catalog [[storage-1](storage.md#storage-1)]:

| Annotation | Content |
| --- | --- |
| what it is | the surface's word for the catalog family, a file the reader may touch named by its file name — session file, session transcript, session history, provider hints, intent, intent attachments, authoring session, `spex.yaml`, `spex.lock`, package, Settings, where the code is, where the records sync, installed packages, skills for agents, sync rules, in-use file, Git data — or "Not a Spex file" ([DR-172](../decisions/172-surfaces-a-fresh-user-reads.md)) |
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

While the Explore tab is shown, the Space surface shall present a "Stays on this computer" panel listing every ignored family of the catalog [[storage-1](storage.md#storage-1)] with one plain reason each ([DR-172](../decisions/172-surfaces-a-fresh-user-reads.md)):

| Family | Reason |
| --- | --- |
| provider hints | resume tokens for this computer's agent conversations; they work nowhere else |
| leases and locks | which process is writing right now |
| installed spec packages and placed skills | copies installed from spex.lock; every computer installs its own |
| where projects live | where your project folders are on this computer, in the home file |
| preferences | where you last stopped reading in each session |
| credentials | this computer's sign-in to each Space |
| migration receipts and inputs | original files kept from an upgrade |
| temporary files | copies made while writing |

- the panel collapses and remembers its state as chrome preference ([DR-030](../decisions/030-workspace-chrome.md)).

#### space-26

When the user activates a reveal control — beside a spex repository's row, or in the preview pane for its entry — the surface shall reveal that path in the OS file manager through the native bridge where it exists [[app-shell-28](app-shell.md#app-shell-28)], and where the bridge is absent shall offer Copy path instead, acknowledging the copy in words ([DR-010](../decisions/010-interface-craft.md) §3):

- the reveal control reads "Show in Finder" on macOS and "Show in folder" elsewhere;
- where the page has no clipboard access, Copy path falls back to a selectable read-only field holding the path.

### Copy and Fit

#### space-27

User-facing copy on the surface shall name a sync's sides "this computer" and the display name of the placement's instance [[space-12](#space-12)], never `ours`, `theirs`, `HEAD`, a remote-tracking branch such as `origin/spex` or `@<host>/spex`, `MERGE_HEAD` or a Git command as primary copy — the raw term surviving in a tooltip ([DR-010](../decisions/010-interface-craft.md) §2) — and shall name an instance by its display name, its things "project" and "records", and this device "this computer", never "instance", "host", "site", "origin", "subgroup", "namespace", "spex repository", "clone", `-spex`, "unit", "placement", "device", "machine", "seat" or "ticket" for those objects — "Space" naming this surface and an instance not yet named, and "Spex Space" the hosted product ([DR-150](../decisions/150-spex-space-product-and-destination.md)) ([DR-172](../decisions/172-surfaces-a-fresh-user-reads.md)).

#### space-28

The Space surface shall fit its pane at every width down to the 320-pixel floor ([DR-041](../decisions/041-chrome-that-fits.md)):

- its content stands in a centered column capped at 48rem, with a positioned, height-constrained outer surface spanning the available width and owning vertical scrolling over the content and both empty side gutters ([DR-225](../decisions/225-bounded-surfaces-and-attached-records.md));
- each repository row aligns its name and action group within matching 28-pixel leading frames while they share a line, with metadata beneath the name at the same leading edge and the actions wrapping at narrow widths ([DR-226](../decisions/226-project-names-align-with-their-actions.md));
- while an instance is listed and Git runs, the existing Refresh and issues controls share the surface title row, wrapping within its width; the first sign-in and missing-Git cards keep their full row;
- below 20rem the header's fields stack with the primary control last and full-width, and an instance heading's stack with its primary control full-width and its overflow after it, as in every width ([DR-172](../decisions/172-surfaces-a-fresh-user-reads.md));
- in each repository row and change row the label owns the slack and truncates with its title, the code-location caption and optional detail hiding below 28rem, the missing-code-remote control remaining visible, and every row control keeping its accessible name;
- Explore's viewing area for its tree and preview stays in the surface flow at 60vh bounded between 24rem and 36rem; the tree and preview stand side by side from 42rem and stack below it, the preview under the tree; the tree and preview's boxes scroll inside themselves and the diff box scrolls sideways as a canvas ([DR-225](../decisions/225-bounded-surfaces-and-attached-records.md));
- every control reads at most 14 characters, its busy form included; a standing-phrase control [[space-120](#space-120)], a code-status control [[space-1](#space-1)], a menu's entries and conversation-title controls [[space-46](#space-46)] and the acts a decision fixes as whole phrases — "Files & history" and its count-bearing form ([DR-214](../decisions/214-project-navigation-and-contextual-recovery.md)), "Needs attention", "Technical details", "Remove from this list", "Not on this computer", "Use <folder>", "Use this folder", "Keep this computer's", "Take <display name>'s", "All <display name>'s" — stand outside the budget and wrap within their row ([DR-172](../decisions/172-surfaces-a-fresh-user-reads.md));
- the surface scrolls inside its own box and the page never scrolls.

### Sign-In Completion

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

The core shall expose the Space surface through these commands and messages, each reply validated against the command schema, `repository` naming a spex repository by its key, `instance` an instance by its origin ([DR-127](../decisions/127-a-home-signed-in-to-several-instances.md)):

| Command | Input | Result | Errors |
| --- | --- | --- | --- |
| `space.get` | — | `SpaceState` [[space-30](#space-30)] | — |
| `space.refresh` | — | `{ accepted: true }` | `invalid_request` (no instance signed in) |
| `space.signin.start` | `{ url, reportCompletion? }` — the instance's URL as the reader gave it, held by its origin [[storage-2](storage.md#storage-2)] | `{ flow: "browser", url } \| { flow: "device", userCode, verificationUri, expiresAt, interval }` | `busy` (a sign-in in flight at any instance), `invalid_request` (a URL the origin rule refuses, naming the rule [[git-host-2](git-host.md#git-host-2)]) |
| `space.signin.cancel` | `{ startId? }`, matched as [[space-109](#space-109)] states | `{ stopped: boolean }` | — |
| `space.signout` | `{ instance }` | `SpaceState` | `invalid_request` (signed out), `conflict` (the stored sign-in changed meanwhile [[git-host-10](git-host.md#git-host-10)]) |
| `space.forget` | `{ instance }` | `SpaceState` | `invalid_request` (signed in; a clone still of that instance or a placement still at it, naming each such spex repository or the session refusing its follow [[space-82](#space-82)]) |
| `space.pick` | `{ repository, choice: { kind: "join", instance, hostId } \| { kind: "create", instance, name } }` — `instance` the one the choice is at; `name` without its `-spex` suffix, which the core appends | `{ accepted: true }` after the Space confirms the personal destination [[space-97](#space-97)], the push following as state | `invalid_request` (already has a Space placement; malformed name; the name taken at the host; a repository another clone here holds; a target outside the personal namespace), `not_found` (a personal project the Space does not list), `conflict` (a remote set meanwhile [[space-21](#space-21)]) |
| `space.join` | `{ instance, hostId, folder?: string }` — `instance` the one its row stands under [[space-1](#space-1)] | `{ accepted: true }` | `invalid_request` (already here, or named by a placement file of a clone here [[space-87](#space-87)]) |
| `space.place` | `{ repository, choice: { kind: "join", instance, hostId } \| { kind: "create", instance, name } }` — as `space.pick`'s, at an instance the clone holds no placement at [[space-97](#space-97)] | `{ accepted: true }` after the Space confirms the personal destination [[space-97](#space-97)], the sync following as state | `invalid_request` (local only; an instance it holds a placement at; malformed name; the name taken at the host; a repository another clone here holds; a target outside the personal namespace), `not_found` (as `space.pick`'s), `conflict` (a remote set meanwhile [[space-21](#space-21)]) |
| `space.leave` | `{ repository, instance, confirmed?: boolean }` — `instance` the placement's [[space-98](#space-98)] | `{ accepted: true }`, its outcome as state | `invalid_request` (no placement at that instance), `not_found` |
| `space.attach` | `{ repository, instance }` — `instance` the one a placement file names [[space-99](#space-99)] | `{ accepted: true }` | `invalid_request` (signed out; no file naming a host repository that instance lists; one already attached, or held by another clone here), `not_found` (a repository whose current details no longer place it in the personal namespace), `conflict` (a remote set meanwhile) |
| `space.remote.set` | `{ repository, url: string \| null }` — the clone's path placement, `origin`, set or removed alone, its instance placements untouched [[storage-34](storage.md#storage-34)] | `SpaceState` | `invalid_request` (no Git; not initialized; a malformed or credential-bearing URL; a known Space address [[space-136](#space-136)] with the destination message [[space-15](#space-15)]), `conflict` (the clone's remote changed meanwhile [[space-21](#space-21)]) |
| `space.fetch` | `{ repository }` | `{ accepted: true }` | `invalid_request` (local only) |
| `space.sync` | `{ repository, placement?: string \| null, choices?: Record<unit, "mine" \| "remote">, join?: boolean }` — `placement` the one `choices` and `join` are for — its instance's origin, or null for the path placement — required with choices or join | `{ accepted: true }` | `invalid_request` (local only, merge pending, blocking diagnostic [[space-11](#space-11)]; a placement the clone does not hold; unknown unit; a choice for a unit that is not a conflict) |
| `space.cancel` | `{ repository }` | `{ stopped: boolean }` | — |
| `space.diff` | `{ repository, unit, path, side: "mine" \| "remote", placement?: string \| null }` — `placement` the one the `remote` side is of, its first where omitted | `{ patch: string, truncated: boolean }` | `invalid_request` (a session, intent or authoring unit; unknown unit or path; no check yet for a remote side) |
| `space.tree` | `{ repository, path?: string }` | `{ path: string, entries: SpaceEntry[] }` | `invalid_request` (path escaping the clone), `not_found` |
| `space.read` | `{ repository, path: string }` | `{ kind: "text", text, lines, truncated } \| { kind: "withheld", reason } \| { kind: "binary", size }` | `invalid_request` (outside the clone, a symlink, `.git`, not a file), `not_found` |
| `space.repair.decline` | `{ repair: string, declined: boolean }` | `SpaceState` | `invalid_request` (no repair of that name stands) |

- "signed out" in an error means that the instance the command acts at is not signed in, and an `instance` the home does not list is refused `not_found`;
- the device flow's `verificationUri` is the verification URL the host completed with the user code where it gave one [[git-host-3](git-host.md#git-host-3)], and `userCode` is carried for clients and tests, never shown by the surface [[space-3](#space-3)];
- `space.state { state: SpaceState }` is broadcast to every client on each transition of any repository's machine [[space-31](#space-31)], on a sign-in's start and end, and when a full read of any instance starts or settles; long commands reply `accepted` at once and their outcome is state, never a hung reply ([DR-010](../decisions/010-interface-craft.md) §5);
- each repository in a reply or broadcast carries its phase, placement lists and local units from one coherent reading: a read crossing an operation's progress or completion cannot pair an ending phase with earlier lists, and an older read cannot replace a newer completed plan [[space-8](#space-8)] [[space-33](#space-33)];
- the interface re-pulls `space.get` when the surface mounts, on window focus, and — debounced — while the surface is shown, on `config.state` and `session.removed`, on a `session.state` for a session it held no entry for or whose `live`, `turnActive`, `title` or `turns` differ from its entry's, on an `intents.changed` naming a project with no held session whose `live` or `turnActive` is true, and on this client's accepted `intent.queue`, `intent.edit`, `intent.close` or `intent.remove`.

#### space-30

The core shall shape `SpaceState` as:

```ts
interface SpaceState {
  home: string;
  git: { ok: true; version: string } | { ok: false; guidance: string };
  defaultInstance: string;   // the default instance's origin, which the sign-in card's chooser preselects (space-115)
  signIn: { phase: "idle" }
    | { phase: "running"; instance: string; flow: "browser" | "device"; userCode?: string; verificationUri?: string; since: number }   // instance: the origin being signed in to
    | { phase: "failed"; instance: string; cause: "denied" | "expired" | "refused" | "unreachable"; message: string };
  repositories: RepositoryState[];   // all local and personal Space records
  instances: {
    origin: string;                      // the instance's origin, naming it in every command
    host: string;                        // its host name
    displayName: string | null;          // as last read, null until one is
    account: { id: string; login: string; displayName: string | null };
    signedIn: boolean;
    hostSignedOut: boolean;              // it signed this device out, held for the core's run (space-3)
    read: { phase: "idle" } | { phase: "running" } | { phase: "failed"; message: string }; // its full read and accepted Refresh setup; idle while signed out
    readAt: number | null;               // its last complete view, retained while reading or after failure
  }[];   // every instance the home lists, in its order (space-1)
  diagnostics: { file: string; reason: string; blocking: boolean; repair?: Repair }[];
  issues: number;
  // Repair: { kind: "repository" | "folder"; repository?: string; name?: string;
  //   directories: string[]; sessions: number; key: string; declined?: number;
  //   checked?: { path, here, repo, claimedBy?, unknown? }[];
  //   proposal?: { path: string; from: "recorded" | "beside-projects" } }
}
interface RepositoryState {
  key: string;                           // the clone's path under workspace/, or, with no clone here, the one a Join would make
  instance: string | null;               // its instance's origin (storage-31), null for a clone with none
  governing: string | null;              // the origin of the instance governing it (space-61), null while none does
  name: string; id: string | null; own: boolean; folder: string | null;   // id: its first placement's host id, or the listed repository's with no clone here
  code: string | null; codeKind: CodeKind;   // the code status (space-1), "Code: <where>" or "Code remote not configured", null while codeKind is "unknown"
  state: "local-only" | "reachable" | "read-only" | "unreachable" | "absent";   // the row's state (space-61)
  reason: string | null;                 // the host's words for read-only or unreachable
  mergePending: boolean;                 // a Git merge pending from a terminal in the clone (space-11); false where no clone is here
  placements: PlacementState[];          // in the order added, the path placement last, then each a placement file names that a signed-in instance lists and no remote here holds, then each instance a creation waits at (space-87); while local only, only the lines its placement files name and a creation waiting; for a row with no clone, its one listed placement with `attached` false and `state` "absent"
  placedAt: string[];                   // the origin of each instance a placement file of the clone names, held here or not (space-87)
  local: SpaceUnit[]; conflicts: SpaceConflict[];   // conflicts: every placement's, in the placements' order
  sync:
    | { phase: "idle" }
    | { phase: "running"; op: "sync" | "check" | "join" | "place" | "leave" | "attach"; placement?: string | null; step: SyncStep; since: number; cancelable: boolean }   // placement: the one in flight, its instance's origin or null for the path placement
    | { phase: "choices"; placement: string | null; savedCommit: string | null }
    | { phase: "unrelated"; placement: string | null }
    | { phase: "stopped"; op: "sync" | "check" | "join" | "place" | "leave" | "attach"; step: SyncStep; cause: SyncCause; message: string; guidance: string; retry: boolean; count?: number }   // count: a leave's units no remaining placement received (space-98)
    | { phase: "done"; at: number; sent: number; received: number; pushed: boolean };
}
interface PlacementState {
  instance: string | null;              // its instance's origin; null for the path placement
  path: string;                         // its path in the instance, or the path placement's remote as a report reads it (space-15)
  id: string | null;                    // the host's id there
  attached: boolean;                    // false for one a placement file names, or a creation waits at, and no remote here holds (space-87)
  state: "reachable" | "read-only" | "unreachable" | "absent";
  reason: string | null;                // the host's words for read-only or unreachable
  waiting: { step: "create" | "branch"; message: string } | null;   // a creation or branch preparation waiting at the host (space-64)
  branch: { ahead: number | null; behind: number | null; checkedAt: number | null; hostEmpty: boolean; unrelated: boolean;
            agreed: { at: number; current: boolean } | null } | null;   // against this placement's `spex`; agreed: the commit `spex` last shared with it as the clone last fetched or pushed it — its commit time, and whether `spex` is that commit; null where the clone holds none (space-61)
  incoming: SpaceUnit[]; conflicts: SpaceConflict[];   // conflicts: its incoming units this device changed too, each a choice to make (space-8)
  lastSync: { at: number; sent: number; received: number } | null;
  outcome: null
    | { kind: "synced" | "behind" | "choices" | "unrelated" | "waiting"; sent: number; received: number }
    | { kind: "stopped"; step: SyncStep; cause: SyncCause; message: string; guidance: string; retry: boolean };   // what the last sync left on its line (space-87)
}
type CodeKind = "space" | "elsewhere" | "none" | "unknown";   // where the code is (space-1): under a listed instance's reported Git origin, at another remote, no remote in project.json, or unknown — a Space’s Git address is still unknown, or this is the global records repository
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
check: host refused | reauth | gone | throttled | transport | timeout | move: destination taken | lease | changed meanwhile → next placement;  host empty → push;  Stop → stopped
compare: conflict without choice → next placement (choices);  no ancestor and not a join → next placement (unrelated);  nothing incoming → push
apply: a written unit changed since its base (first) → save;  validation | lease | authoring turn | moved | changed twice → stopped
refresh: diagnostic → push;  unsafe parent → stopped
push: rejected (first) → check;  rejected twice | refused | throttled | transport | timeout → next placement;  Stop → stopped;  read-only → next placement
catch-up: rejected (first) → that placement's check;  rejected again → that placement behind
check or push: core rejects effective Git destination (cause `git`) → next placement
any step: Git's own error → stopped
done: a placement in choices → choices;  choices ─sync with choices→ save;  unrelated ─sync with join→ save;  stopped ─Dismiss or next→ idle
```

- one full rescan of the clone runs as `refresh`;
- `check` makes a placement's follow and, for the key placement, the clone's move, a deferred migration move among them, before any fetch or push there [[space-60](#space-60)]; `apply` handles its unit-write refusals [[space-19](#space-19)] and reconciles the placements with their files [[space-91](#space-91)];
- before the first file is replaced, `apply` records the placement, its base, the plan's revisions, ancestor and choices in an ignored `<clone>/.spex-apply.json` and removes it after the ref update lands or a changed unit refuses its write [[space-19](#space-19)]; a marker left standing is finished by the repair [[space-67](#space-67)];
- `sync:<repository>:<placement>:last` persists in the preferences [[storage-5](storage.md#storage-5)]; the sync's transient state persists nowhere;
- a row read while an operation runs reads the clone at that instant, keeping that operation's own lists;
- reads recomputing one clone's lists from its working tree run one recomputation at a time: a read asking while one runs shares the next, which starts once that one ends, so any number of overlapping reads costs two recomputations at most and each reads the working tree as of its asking or later.

#### space-32

The core shall invoke Git as a child process per step, never through a shell, from the clone, with this environment and these commands, `<remote>` being the name of the remote of the placement a step runs on — its instance's folder, `@<host>`, or `origin` for the remote the reader named [[storage-34](storage.md#storage-34)] ([DR-127](../decisions/127-a-home-signed-in-to-several-instances.md), [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

- environment: the core's captured environment plus `GIT_TERMINAL_PROMPT=0`, `LC_ALL=C`, `LANG=C`, and `GIT_SSH_COMMAND=ssh -oBatchMode=yes` only where none is set; for a transport to a placement's instance's Git origin, `-c credential.helper=` naming the app's own helper and the credential that instance brokers [[git-host-9](git-host.md#git-host-9)], and for any other origin the device's own credential helpers; `process.umask(0o077)` around a new clone's `init` and its commits, which run synchronously, restored after; a join's `clone` and `checkout` children each spawned under `0o077`, the core's own umask restored before it awaits them; a 120-second limit on `ls-remote`, `fetch`, `clone` and `push` after which the child receives `SIGTERM`, then `SIGKILL` after five seconds;
- commit-writing commands carry `-c commit.gpgsign=false -c core.hooksPath=/dev/null`, and `-c user.name=<login> -c user.email=<login>@users.noreply.<host>` where the clone's instance [[storage-31](storage.md#storage-31)], its key placement's, is signed in, the account's there and that instance's host name, else `-c user.name=Spex -c user.email=spex@<hostname>` only where `git var GIT_COMMITTER_IDENT` fails;
- state: `--version`, `rev-parse --show-toplevel`, `rev-parse --git-dir`, `symbolic-ref -q --short HEAD`, `rev-parse -q --verify HEAD^{commit}`, `rev-parse -q --verify MERGE_HEAD`, `config --local --get-regexp ^remote\..+\.url$` for the placements in the order added, `remote get-url <remote>`, `config --get remote.<remote>.spexId`, `config --get branch.spex.remote`, `rev-parse -q --verify refs/remotes/<remote>/spex^{commit}`, `rev-list --left-right --count HEAD...refs/remotes/<remote>/spex`, `rev-list --count HEAD` where the host holds no `spex`, `status --porcelain=v1 -z -uall`, for the last sync a clone holds `merge-base <spex> <remote>/spex` and `log -1 --no-show-signature --format=%ct <commit>` [[space-61](#space-61)], and uses the recorded `spex.bootstrap` commit and exact tree to check an unchanged bootstrap [[space-59](#space-59)];
- initialize and the remote: `init -q -b spex`, falling back to `init -q` then `symbolic-ref HEAD refs/heads/spex`; `clone -q --origin <remote> --branch spex --single-branch <url> <clone>` for a join, falling back to a clone of the default branch followed by `checkout -q -b spex` where the host holds no `spex` yet; `remote add <remote> <url>` then `config remote.<remote>.spexId <id>`, and for a repository the core created [[git-host-7](git-host.md#git-host-7)] `config remote.<remote>.spexCreated <id>` first, then `config remote.<remote>.url <url>`, `config remote.<remote>.fetch +refs/heads/*:refs/remotes/<remote>/*` and `config remote.<remote>.spexId <id>` in place of `remote add`, so its remote never stands without the flag; `remote set-url <remote> <url>`, `remote rename <remote> <new>` for a follow [[space-60](#space-60)] [[space-82](#space-82)] [[space-91](#space-91)] [[space-98](#space-98)], `config --remove-section remote.<remote>` with `update-ref -d refs/remotes/<remote>/spex` to drop a placement, `update-ref -d refs/remotes/origin/spex` for the former path placement where the reader names another [[space-141](#space-141)], and `config --unset branch.spex.remote` where the remote dropped or replaced was the upstream;
- save: the managed-rules writer, `add -A -- .`, `diff --cached --name-only -z`, `write-tree` and `rev-parse HEAD` before validation, `read-tree <tree>` and `checkout-index -a -f --prefix=<private copy>/` under a temporary `GIT_INDEX_FILE`, `rev-parse <that HEAD>^{tree}`, `commit-tree <tree> -p <that HEAD> -m <message>`, `update-ref refs/heads/spex <commit> <that HEAD>`, `reset -q` on refusal; and for every version check, `hash-object --stdin-paths` over a unit's files;
- check: `ls-remote --exit-code --heads <remote> refs/heads/spex` (exit 2 means no `spex`), `fetch -q --no-tags <remote> +refs/heads/spex:refs/remotes/<remote>/spex`, `merge-base HEAD <remote>/spex`; `config --get remote.<remote>.spexCreated`, and `config --unset remote.<remote>.spexCreated` where the clone records a creation there [[git-host-7](git-host.md#git-host-7)]; for a default branch the core pushes itself [[git-host-7](git-host.md#git-host-7)], `hash-object -w --stdin` on the README, `mktree`, `commit-tree <tree> -m "Initial commit"` and `push -q <remote> <commit>:refs/heads/main`;
- plan: `ls-tree -rz --full-tree <rev>` per revision, and for the working tree `add -A -- .` then `write-tree` under a temporary `GIT_INDEX_FILE`;
- labels and diffs: one `cat-file --batch` over the files of each session side summarized [[space-33](#space-33)], `cat-file blob <oid>` per other described file, `log -1 --format=%ct <rev> -- <paths>` for a side's change time, `diff --no-color <ancestor> <side> -- <path>` for `space.diff`;
- apply: under a temporary `GIT_INDEX_FILE`, `read-tree HEAD`, `update-index -z --index-info` setting or removing each path of a unit taken from the host and `write-tree`, then that tree checked out into a private copy as at Save; `cat-file blob <oid>` per file of a unit written; `read-tree <tree>` and `update-index -q --refresh` on the clone's index; `merge-base --is-ancestor HEAD <remote>/spex` with `rev-parse <remote>/spex^{tree}`, `commit-tree <tree> -p HEAD -p <remote>/spex -m <message>` or none on a fast-forward, `update-ref refs/heads/spex <commit> <old HEAD>`;
- a hosted check or clone resolves the effective URL with `ls-remote --get-url` and uses the verified address directly. For a hosted push the core uses a command-scoped remote with one approved effective push URL, then records the named placement as upstream; for an external placement it checks Git's effective URLs with `remote get-url` [[space-140](#space-140)];
- push: `push -q <destination> spex`, with `-u` for the first external placement when no upstream is set;
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
- session choice titles, turn counts and activity read the selected revision through Playbook's shared history reader, with its replay and blob files from that revision and no changes to the live session [[storage-11](storage.md#storage-11)]; a side's summary is kept in memory by the blob ids of its files, so a side unchanged since its last summary is not read again;
- units: every tracked file of `sessions/` named for one session — `sessions/<uuid>.json` with every file of `sessions/<uuid>.replay/`, `sessions/<uuid>.blobs/` and `sessions/<uuid>.assets/` ([DR-254](../decisions/254-sessions-are-a-manifest-and-a-replay-log.md)) — `intents/<uuid>.json` with `intents/<uuid>.assets/`, `authoring/<uuid>.json` with its records and assets, `spex.yaml` with `spex.lock` wherever a clone holds them [[storage-1](storage.md#storage-1)], a folder holding `meta.yaml` on any side with every file under it [[storage-11](storage.md#storage-11)], and each other tracked path alone; a bundle unit taken from a side needs every file of it on that side or none;
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
| `sessions/<uuid>.json` / `.replay/` / `.blobs/` / `.hints.json` / `.assets/` | session manifest / session records / session chunks / provider hints / session attachments ([DR-254](../decisions/254-sessions-are-a-manifest-and-a-replay-log.md)) |
| `sessions/<uuid>.spex.json`, `.legacy-sessions/` | legacy session sidecar |
| `.lock*`, `sessions/.<uuid>.lock*`, `.spex-apply.json` | lease; sync repair marker |
| `intents/<uuid>.json`, `intents/<uuid>.assets/` | intent; intent attachments |
| `authoring/<uuid>.json` / `.records.jsonl` / `.assets/` | authoring session; its records; its attachments |
| `spex.yaml`, `spex.lock`, `.spex/` | spec package requests; spec package lock; installed spec packages with their placed skills |
| `config/playbook.config.yaml`; `*.bak*`, `*.backup*` | Settings; config backup |
| `project.json` | code remote |
| `placements/<folder>.yaml` | placement |
| `.gitignore`, `.gitattributes` | sync rules |
| `*.tmp` | temporary write |
| a folder outside `config/`, `sessions/`, `intents/`, `authoring/`, `placements/`, `.spex/`, `local/` and `.spex-uploads/` holding `meta.yaml`, the outermost where two nest, and every path under it no row above names | spec package |
| other | Not a Spex file |

- a path in an ignored family of the catalog is marked ignored whatever Git reports [[storage-1](storage.md#storage-1)];
- `space.read` refuses a path resolving outside the clone or through a symlink, withholds provider hints, and caps text at 256 KB or 2,000 lines on complete lines.

#### space-117

When a project's placement selects a Space, the core shall name that Space as the environment's collaboration and Git-broker preference while preserving its explicit registry selection [[environments-38](environments.md#environments-38)] and all existing locked package pins and source provenance, advancing only a lock digest that matched the manifest before this Space-only edit and leaving an already-stale, malformed or unreadable lock unchanged ([DR-168](../decisions/168-independent-package-registry.md)).

## Verification

#### space-118

When a real-core integration suite places a fresh project at a second signed-in Space, the suite shall assert the environment reports and records that Space for brokerage while retaining its public registry origin and every package pin, a previously current lock changing only its requests digest without a stale hint, and a previously stale lock remaining byte-identical and stale, and a malformed lock remaining byte-identical without blocking the Space binding [[space-117](#space-117)].

#### space-116

When a browser journey opens "Add a Space…", it shall verify that the chooser lists the directory's Spaces by display name with no field beside a chosen one, a directory choice starting the sign-in at that Space's origin, that "Other Space…" reveals the field "Space address" whose typed origin starts it, and that a failed directory read leaves the field alone holding the default instance's origin, with no sentence and no backend locator on the page [[space-115](#space-115)].

### Core Coverage

#### space-37

When an integration suite starts a real core on a fresh home and adds a Git working folder before signing in to a stand-in Space, the suite shall assert that local records remain available [[space-1](#space-1)], sign-in and Refresh list personal projects without creating a remote automatically [[space-4](#space-4)] [[space-2](#space-2)], explicitly choosing that Space sends records [[space-97](#space-97)] [[space-12](#space-12)], and signing out retains the project and local records [[space-6](#space-6)].

#### space-138

When the stand-in fails the account read before creating a project placement, the suite shall assert that Pick names the Space in its refusal, creates nothing, and succeeds on a fresh request [[space-97](#space-97)].

#### space-38

When an integration suite runs two real cores on two scratch homes sharing one stand-in Git host, both signed in to the same personal account, it shall assert the sync loop of one spex repository:

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
- the stand-in archiving the repository turns it read-only with the host's reason, a sync bringing the peer's new session without pushing and the core's new session kept with its mark; the stand-in withdrawing access to the repository turns it unreachable on the next read with the clone intact [[space-61](#space-61)] [[space-15](#space-15)] [[space-50](#space-50)];
- a stand-in whose Git transport answers 401 stops "reauth" and a sleeping one stops "timeout" within a test-shortened limit, each carrying its guidance [[space-15](#space-15)] [[space-32](#space-32)];
- an unsafe parent introduced while a later session lease is awaited leaves the first session written, stops with the repair marker and deferred-refresh diagnostic, reads no linked intent body during the stop broadcast, and finishes repair and refresh on Retry after the parent is restored [[space-19](#space-19)] [[space-20](#space-20)] [[space-67](#space-67)];
- a check the stand-in answers 429 stops `throttled` with "Retry waits, then runs the step.", reading "<display name> asks to wait 2 seconds" for `Retry-After: 2`, "3 seconds" for an HTTP date 3 s ahead and "a moment" for none [[space-15](#space-15)]; a Retry at once after the 2 s reads running at Check and completes, its first request reaching the stand-in no sooner than 2 s after the 429, and one after "a moment" reaches it at once [[space-15](#space-15)]; under `Retry-After: 5`, a Retry offers Stop while it waits, which stops it at once reading "Stopped while waiting for <display name>", nothing having reached the stand-in, and the next Retry waits out the rest before its step [[space-16](#space-16)] [[space-15](#space-15)].

#### space-39

When an integration suite writes local changes of every unit kind into a clone, it shall assert the listings and the explorer:

- the local list carries a titled session as new, an intent by its title, an authoring session, "Settings changed" with a diff, "Code remote changed" and "Sync rules updated", in the kinds' order, and in a clone holding `spex.yaml` with `spex.lock` "Spec packages changed" with a diff in its place [[space-7](#space-7)] [[space-34](#space-34)]; a spec package's folder reads as one row of its own, labelled with the folder ending `/`, its every file among its paths [[space-7](#space-7)] [[space-33](#space-33)];
- after a peer pushes, `space.fetch` lists the incoming units the same way with conflicts marked and ahead and behind counted, a host without `spex` reads empty, and `space.diff` returns a patch for Settings on each side and refuses a session and an intent unit [[space-8](#space-8)] [[space-10](#space-10)];
- `space.tree` maps every catalog path to its family and sharing mark with session and intent owners, reads an empty directory of a tracked kind as not yet shared, reports `.git` closed, `.spex/` as staying here, a spec package's folder and a file under it as spec package and a stray file as not a Spex file, and neither follows nor lists through a planted symlink; `space.read` pretty-prints JSON, returns YAML, Markdown and JSONL text, cuts a long log on a line, withholds a hints file, and refuses `../` [[space-23](#space-23)] [[space-24](#space-24)] [[space-35](#space-35)].

#### space-130

When an integration suite holds a clone's lists recomputation at its session's summary, asks for the Space state twice more meanwhile and then releases it, it shall assert:

- the two later reads recompute that clone's lists once between them, after the held one, and every read lists the session by its title [[space-31](#space-31)];
- the session's files are read through one `cat-file --batch` per summary and never one `cat-file blob` each, and a further read of the unchanged session reads none of its files again [[space-32](#space-32)] [[space-33](#space-33)].

#### space-51

When an integration suite reports diagnostics on a home holding a clone no pair names and sessions recorded under a directory, it shall assert the repair contract:

- the diagnostics fold to one repair naming the spex repository by its project name, carrying the recorded directory and the count of sessions there [[space-46](#space-46)];
- an import requiring the same folder joins that repair, while an unrelated missing-directory report keeps its own row [[space-46](#space-46)];
- a rebind to a chosen folder, carrying the repair's recorded directories as aliases, pairs the saved records without promising relocated continuation [[space-47](#space-47)];
- a rebind refused because the folder is inside another working folder, because the folder is another spex repository's, or because that repository's turn is running leaves the repair standing with its reason [[space-47](#space-47)];
- a repair still counts while drawn, while declining reduces the count and writes only this device's preference, the count and postponement surviving a core restart and changed folder findings, and direct folder selection removing the repaired task and its postponement [[space-49](#space-49)] [[space-54](#space-54)];
- answering a repair the core does not report is refused [[space-54](#space-54)];
- a recorded directory that is here and a work tree root no pair names is proposed, one that is absent is reported absent and proposed not at all, and no directory outside those the repair names and the shared-parent candidate is examined [[space-53](#space-53)].

#### space-52

When an integration suite reads a working folder's remote carrying a credential, and syncs against a stand-in answering a refusal with words, it shall assert the report:

- a URL carrying a credential in any form is refused before it is written to `project.json` [[space-5](#space-5)];
- the refused sync names only the Space’s sanitized words and the next action the cause supports [[space-15](#space-15)] [[space-50](#space-50)].

#### space-73

When an integration suite adds and removes an external records remote alongside a personal Space placement, it shall verify the independent placement state:

- the external address is recorded as `origin` and removing it keeps the Space remote, repository id, tracking ref and last sync [[space-141](#space-141)] [[space-29](#space-29)];
- leaving the Space removes its remote, tracking ref and last sync and keeps the local clone [[space-98](#space-98)];
- setting an external local path makes the clone reachable and lets Sync send its records there, and removing it returns the clone to local-only status [[space-61](#space-61)] [[space-12](#space-12)].

#### space-134

When the Space moves an already synced project repository outside the signed-in account’s personal namespace, integration verification shall assert:

- Refresh marks its local placement unavailable [[space-61](#space-61)], and Check and Sync stop that placement before Git transfer [[space-12](#space-12)] [[space-15](#space-15)];
- a fresh home neither lists nor opens it, and a cached destination cannot open, place or attach it after the move [[space-1](#space-1)] [[space-63](#space-63)] [[space-97](#space-97)] [[space-99](#space-99)];
- a move between Check and Push, including a catch-up push after another destination supplies records, stops before pushing to the former destination [[space-133](#space-133)].

#### space-142

When real cores transfer records with independent Space and external Git destinations, the integration suite shall verify their routing:

- after sign-out and restart, a previously learned separate Git address is still classified locally in HTTP(S) and both SSH forms [[space-136](#space-136)] and refused by `space.remote.set` [[space-29](#space-29)] with the destination message [[space-15](#space-15)];
- a clone whose only remote is a terminal-configured HTTP(S) `origin` at a known Space can sync through that Space after it confirms the matching personal repository [[space-140](#space-140)] [[space-12](#space-12)];
- a terminal-configured SSH `origin` at a known Space stops Check and Sync before a Space read for that placement or a Git transfer [[space-8](#space-8)] [[space-12](#space-12)] [[space-140](#space-140)], with cause `git`, the destination message and Retry [[space-15](#space-15)], keeping the local row reachable [[space-61](#space-61)];
- the SSH path placement's line shows the Space's display name and hides the transport address, both alone and beside a Space placement [[space-87](#space-87)] [[space-15](#space-15)];
- beside a Space placement, the stopped path placement advises changing or removing its own remote [[space-15](#space-15)]. Removing the path remote leaves only the Space placement [[space-29](#space-29)], which syncs on retry [[space-12](#space-12)];
- an approved personal repository uses its Space, an external HTTP Check follows ordinary Git redirects while the Space is unavailable, and an external SSH-authenticated LFS fetch uses ordinary Git transport [[space-140](#space-140)];
- a conflicting fetch rewrite, separate push URL or configured LFS download or upload endpoint stops the affected transfer before records reach the unapproved repository, identifies the Git settings and offers Retry. The endpoint cases include SSH and hosted uploads for both the default branch and `spex` [[space-140](#space-140)] [[space-15](#space-15)];
- when Git settings stop the first hosted placement at Push, a later healthy external placement still receives the saved records [[space-15](#space-15)];
- Stop during a held LFS Check ends the transfer before Apply, with HEAD, the index and the local asset unchanged [[space-16](#space-16)] [[space-12](#space-12)].

#### space-74

When the stand-in refuses Git operations, integration verification shall assert that public diagnostics name only the Space and its repository:

- a check, push or join receiving HTTP 500 identifies the Space and status and offers Retry [[space-15](#space-15)] [[space-32](#space-32)];
- a rejected push quoting the clone's URL and another Git URL identifies the clone by repository path and the other URL by Space display name in the read-only reason [[space-15](#space-15)] [[space-32](#space-32)] [[space-61](#space-61)].

#### space-86

Where a real core is signed in at the stand-in instance with a writable spex repository, when ordinary Sync reaches a receive hook, the integration suite shall assert the rejection distinction ([DR-129](../decisions/129-content-size-is-not-permission.md)):

- explicit content-size rejection, alongside a generic hook-decline marker, stops Push as `size_limit`, keeps the Save and existing access state, and reports the instance and reported limit without raw branding, quoted transport links, Share or sign-in guidance [[space-15](#space-15)] [[space-32](#space-32)] [[space-50](#space-50)] [[space-61](#space-61)];
- an explicit size rejection carrying no parseable numeric limit states the size cause without inventing a limit [[space-15](#space-15)];
- two recognized size sentences reporting incompatible numeric limits retain the size cause without selecting one limit [[space-15](#space-15)] [[space-32](#space-32)];
- a permission refusal retains its read-only state and access guidance even beside size wording, while a hook decline without explicit size wording retains its existing refusal classification [[space-15](#space-15)] [[space-32](#space-32)] [[space-50](#space-50)] [[space-61](#space-61)];
- no automatic retry runs, and once the stand-in lifts the content condition an explicit Sync sends the retained Save [[space-15](#space-15)].

#### space-83

When an integration suite signs a fresh home into two stand-in Spaces with separate backing stores, it shall assert:

- account names and project rows stay scoped to their Space even where the project names match [[space-1](#space-1)];
- sign-in creates or joins the personal global records placement [[space-4](#space-4)] [[space-59](#space-59)] [[space-65](#space-65)];
- explicitly syncing a local project at the second Space moves the clone beneath that Space, updates the local pair, and uses its account identity [[space-60](#space-60)] [[space-97](#space-97)] [[space-32](#space-32)];
- sign-out leaves its recorded placement local and unreachable, and Forget is refused while that project still depends on the Space [[space-6](#space-6)] [[space-82](#space-82)].

#### space-84

When an integration suite starts a real core on a scratch home against two stand-in instances over one Git backend, sharing its Git origin and each listing the person's namespace there with two projects' spex repositories, `a-spex` and `b-spex`, in it, it shall assert one host repository through both ([DR-127](../decisions/127-a-home-signed-in-to-several-instances.md)):

- signed in at both, each repository reads as one row, not on this device, under the instance listed first, and Join keys it under that instance's folder with its remote named by it [[space-1](#space-1)] [[space-61](#space-61)] [[space-63](#space-63)];
- joined, each stays one row under the first, the second's listing withholding Join alone [[space-61](#space-61)];
- the first signed out, both rows stand reachable under the second, and `a-spex`'s Sync re-keys its clone under the second's folder with its remote renamed, its pair and sync preferences re-keyed and its recorded last sync kept, then syncs with the second [[space-60](#space-60)] [[space-61](#space-61)] [[space-141](#space-141)] [[space-11](#space-11)];
- with the first signed out, a failed ownership read at the second refuses Forget with the second’s failure, keeping the placement and the signed-out entry [[space-82](#space-82)];
- with a session beneath `b-spex`'s clone, still keyed under the first, standing under a lease taken out of band, `space.forget` of the first is refused naming that session, the instance and that clone kept as they were [[space-82](#space-82)] [[space-29](#space-29)];
- the lease released, `space.forget` of the first re-keys `b-spex`'s clone under the second's folder with its remote renamed and its pair re-keyed, then removes the instance from the state [[space-82](#space-82)] [[space-60](#space-60)];
- on another scratch home signed in at the first, then at a third instance on a Git backend of its own, then at the second, `a-spex` joined through the first and a repository the first lists alone read the first as `governing`, and, the first signed out, `a-spex` reads the second, the earliest signed-in instance listing it, and the other none [[space-30](#space-30)] [[space-1](#space-1)];
- no reply or broadcast holds a URL under the shared Git origin, or a string under either stand-in's URL but that URL itself [[space-30](#space-30)] [[space-1](#space-1)].

#### space-92

When an integration suite runs a real core on a scratch home signed in to two stand-in instances on separate Git backends, holding a project's spex repository in the first account’s namespace, it shall drive the placement and its sync over the protocol and assert ([DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

- `space.place` creating in the second account’s namespace, with a peer's change standing at the first, adds the second's line and pushes it without acknowledgement while that same sync merges and pushes the first's, both lines reading synced, the row standing once under the first Space, naming both placements by Space display name [[space-97](#space-97)] [[space-87](#space-87)] [[space-1](#space-1)] [[space-29](#space-29)] [[space-30](#space-30)];
- `space.fetch` lists each placement's incoming units under its instance, and the local list names a unit the second lacks [[space-8](#space-8)] [[space-7](#space-7)];
- with both stand-ins' `spex` advanced by peers, one Sync merges the first's, then the second's against the first's merge, then pushes the first once more as a fast-forward, each line reading synced, a unit the first's merge rewrote taken from the second's side with no restart, and each placement's last sync recorded apart [[space-12](#space-12)] [[space-19](#space-19)] [[space-33](#space-33)] [[space-31](#space-31)] [[space-22](#space-22)];
- a catch-up push the first rejects runs it once more from Check, and rejected again leaves its line reading "Behind — Sync again" [[space-12](#space-12)];
- a conflict at the second ends that placement in choices with the first's merge and push standing, the caption naming the second's display name, and the sync sent with those choices passes the first as a fast-forward [[space-14](#space-14)] [[space-9](#space-9)] [[space-17](#space-17)] [[space-18](#space-18)];
- a path placement set by `space.remote.set` syncs last with no catalog read, and no merge drops it [[space-12](#space-12)] [[space-140](#space-140)] [[space-91](#space-91)];
- a repository the first lists with no clone here reads as a row carrying its one listed placement, `attached` false and `absent` [[space-30](#space-30)];
- the commit identity is the first's account, each remote holds its id in its own section, and `space.tree` reads `placements/<folder>.yaml` as a placement, shared [[space-32](#space-32)] [[space-23](#space-23)] [[space-35](#space-35)];
- `space.leave` of the second, not confirmed, stops `unreceived` counting a unit changed here that no remaining placement holds and not one this device holds unchanged since its last shared commit with the first while a peer rewrote it there; of the first, once a Check found the second's host holding no `spex`, it counts every record unit whatever the second's tracking ref still names; each keeps the placement, and the second sent `confirmed` drops the first, moving the clone to its path at the second [[space-98](#space-98)] [[space-12](#space-12)];
- no reply or broadcast holds a string under either stand-in's URL but that URL itself [[space-30](#space-30)] [[space-1](#space-1)].

#### space-100

When an integration suite runs a real core on a scratch home signed in to two stand-in instances on separate Git backends, holding two projects' spex repositories in the first account’s namespace, the first project placed in the second account’s namespace, it shall drive a placement's failures over the protocol and assert ([DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

- the first answering 503 at Check reads its line unreachable while the second syncs, the row reachable; the first signed out reads its line unreachable, its instance signed out, and both signed out refuse the Sync naming the first's display name [[space-15](#space-15)] [[space-61](#space-61)] [[space-6](#space-6)] [[space-11](#space-11)];
- `space.place` of the second project creating in the second account’s namespace that refuses it for the account's rights shows its waiting phrase on the second's line while the first syncs, its state carrying the wait on that placement [[space-97](#space-97)] [[space-64](#space-64)] [[space-87](#space-87)] [[space-30](#space-30)]; one naming a name taken there, and one naming the first, at which the clone holds a placement, are each refused [[space-29](#space-29)];
- Stop during the first's Check ends the sync with the second not run [[space-15](#space-15)] [[space-16](#space-16)];
- a chosen unit refused by validation at the first's Apply, and a stale lock on the first's remote-tracking ref failing its fetch with Git's own error, each end the sync with the second not run, the lock diagnostic naming the affected ref or file and its file-exists cause before recovery after removing the lock [[space-15](#space-15)] [[space-31](#space-31)];
- a real Git failure nested through its command wrapper retains its primary cause and final advice within three nonempty lines, with the synthetic credential and instance's Git URL in the command context removed from the public summary [[space-15](#space-15)];
- a file another process leaves invalid during the first's Apply stands as the refresh's finding while the first pushes and the second syncs [[space-15](#space-15)] [[space-20](#space-20)] [[space-31](#space-31)];
- a repair marker planted with a half-written selection at the second, on the first's merge commit as its base, is finished by the next admission into the recorded merge [[space-67](#space-67)] [[space-19](#space-19)];
- a placement whose `spex` shares no ancestor stops unrelated alone, and `space.sync` with `join` for it joins from the empty tree with every unit on both sides a choice [[space-13](#space-13)];
- no reply or broadcast holds a string under either stand-in's URL but that URL itself [[space-30](#space-30)] [[space-1](#space-1)].

#### space-93

When an integration suite runs real cores on three scratch homes against two stand-in instances on separate Git backends — the first home signed in to both with a project placed at each, the second signed in at the second alone, the third signed in to both using the same respective accounts — it shall assert that a project placed at two instances syncs through a device holding both and that a second device attaches from the placement's file ([DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

- the second home's Join at the second writes nothing new to the placement files, its row naming no placement it cannot reach [[space-63](#space-63)] [[space-87](#space-87)];
- a session the second home syncs to the second reaches the first's `spex` once the first home syncs, and an intent the first home queues reaches the second home [[space-12](#space-12)];
- the third home's Join at the first lists the second's placement from its file, not attached, and no row of its own, `space.join` of it refused; `space.attach` attaches and syncs that placement, its line synced [[space-87](#space-87)] [[space-29](#space-29)] [[space-99](#space-99)] [[space-61](#space-61)];
- a newly synchronized personal placement file stays unattached on every home until `space.attach` names it there [[space-99](#space-99)];
- the first home's `space.leave` of the second deletes the file, and the third home's next Sync drops its remote there with the clone's records kept; a Leave asked while that sync runs follows it [[space-98](#space-98)] [[space-91](#space-91)] [[space-21](#space-21)];
- the first and third homes each placing at the second at once meet as one choice of the file, the home whose side is not chosen dropping its remote at its next sync, the unchosen repository left at the stand-in, and listing the chosen one not attached [[space-91](#space-91)].

#### space-94

When three stand-in Spaces provide two distinct Git backends for the same person's accounts, integration verification shall assert:

- sign-in places personal global records once per backend, and explicit Place and Leave of those settings are refused [[space-4](#space-4)] [[space-65](#space-65)] [[space-29](#space-29)];
- after a peer adds a duplicate placement file for one project repository, Sync retains one placement. When the peer replaces the original file, the home follows the new Space and keeps its last sync [[space-91](#space-91)] [[space-60](#space-60)] [[space-141](#space-141)];
- when a forgotten Space's global records repository is available at another signed-in Space, the home follows that placement and syncs the change to the remaining backend [[space-82](#space-82)] [[space-60](#space-60)].

#### space-101

When an integration suite runs a real core on a scratch home signed in to three stand-in instances, the first two over one Git backend and the third on another, it shall drive `space.leave` over the protocol and assert ([DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

- for a project placed at the first and the third, the first lacking records the third holds: `space.leave` of the third stops `unreceived` naming the count, the placement kept; of the first, while a lease taken out of band stands beneath, is refused whole naming the session, and once it is released moves the clone under the third's folder with its pair re-keyed; and of the third, the last, sent `confirmed` after it stops naming every unit, moves the clone in the personal records folder, local only [[space-98](#space-98)] [[space-15](#space-15)];
- for a project placed at the first and the third, a peer's commit at the third deleting the first's placement file drops nothing at the next Sync while a lease taken out of band stands beneath the clone, syncing nothing with the first, and the Sync after the release drops it and moves the clone under the third's folder [[space-91](#space-91)];
- a failed ownership read at the second stops a confirmed Leave of the first with Retry, keeping the placement and the working folder’s pair [[space-98](#space-98)];
- with the first signed out, `space.leave` of the first for a project placed there alone, whose repository the second lists, renames its remote to the second's folder and rewrites its file, dropping nothing; a project placed at the first and at the second reads its first placement unreachable, its Sync's Check following nothing, and its `space.leave` of the first, sent `confirmed` after it stops for the placement it could not read, drops it [[space-98](#space-98)] [[space-60](#space-60)] [[space-61](#space-61)];
- with the third signed out, `space.forget` of it is refused naming a project placed there [[space-82](#space-82)] [[space-29](#space-29)].

#### space-76

When the integration suite runs a real core on a scratch home signed in to the stand-in host and the place of a spex repository being joined, named in 250 characters — on Windows, where Git takes no path so long, in a short name — is taken while its clone runs, on every platform and on Windows on the Node the app ships, it shall assert that the join stops reading the place taken, leaving what stands there as it is, and that no private folder of the join remains, the clone's read-only Git objects removed with it [[space-63](#space-63)].

#### space-119

When the integration suite starts a real core on a scratch home reading its clones' sessions and config as they change, signed in to the stand-in host, on every platform and on Windows on the Node the app ships, it shall assert:

- the first sign-in moves the personal records folder with a project's clone holding a session a peer wrote, places the global records repository at the stand-in and pushes it, the pair naming the moved clone and the session moved with it, and then reads a session a peer writes into the moved clone and a change of global configuration where they now lie [[space-59](#space-59)];
- a sync after the stand-in renamed a placed project's repository moves its clone, its pair following, and reads a session written there afterwards [[space-60](#space-60)];
- on Windows, that sync while another program holds the clone open stops at Check naming the project as in use with Retry, the clone and its pair where they were, and reads a session written into the clone afterwards; a sync whose holder lets go within its tries moves the clone in that same request [[space-60](#space-60)].

#### space-135

When integration verification holds a core read open while a project clone moves to its first Space, the suite shall assert that the next Space state shows the moved records and reflects the current clone and sync plan without repeating the clone under its previous key [[space-60](#space-60)] [[space-29](#space-29)].

### Surface Coverage

#### space-107

Where the Space surface uses the production store over a controlled command connection, when Sign out, "Remove from this list" or declining a repair returns an older running-state reply after a completed-state broadcast, the test suite shall assert that the displayed completion is retained and an unsuperseded reply to each action still applies (verifying [[space-106](#space-106)]).

#### space-131

Where the Space surface renders over the production store holding an idle session of the shown project, the integration suite shall assert the re-reads announcements prompt, each debounced by 300 ms:

- `session.state`, `session.removed`, `intents.changed` and `config.state` delivered together re-read once, and a minute of silence re-reads nothing [[space-2](#space-2)] [[space-29](#space-29)];
- a `session.state` starting that session's turn re-reads once, and further `session.state` for it with the same `live`, `turnActive`, `title` and `turns`, and `intents.changed` naming its project, re-read nothing while that turn runs [[space-2](#space-2)] [[space-29](#space-29)];
- an intent this page queues while that turn runs re-reads once after the core accepts it [[space-2](#space-2)] [[space-29](#space-29)];
- an `intents.changed` naming a project with no running turn re-reads once while that turn runs, alone or beside that turn's project [[space-2](#space-2)] [[space-29](#space-29)];
- a `session.state` settling that turn re-reads once, and a new session's first `session.state` re-reads once [[space-2](#space-2)] [[space-29](#space-29)].

#### space-56

Where the Space surface renders over a home whose issues list holds three unanswered repairs, each proposing its recorded folder, when the reader dismisses the first, activates the third's "Use <folder>", lets the core deliver a re-read, activates Refresh, then the second's "Use <folder>" and then the dismissed first's, the core reporting after each act what then remains, the test suite shall assert through the surface:

- the dismissed row moves to Dismissed with its folder action available, and the review remains neutral and Files & history shows the remaining unresolved count [[space-124](#space-124)] [[space-49](#space-49)] [[space-1](#space-1)];
- the third row gives way in its own place to an outcome confirming the chosen folder and a live-region announcement of that outcome [[space-48](#space-48)];
- focus rests on the second repair's "Use <folder>", wrapping past the declined row [[space-48](#space-48)];
- the core's re-read retains the active outcome and remaining task in their places and the dismissed task in Dismissed [[space-48](#space-48)] [[space-124](#space-124)];
- after Refresh the outcome is gone, the second task remains active and the dismissed first task remains under Dismissed [[space-48](#space-48)] [[space-124](#space-124)];
- the second's "Use <folder>" leaves the live region confirming its saved folder and focus on its outcome's Open project, which opens that project [[space-48](#space-48)];
- the dismissed repair's "Use <folder>" leaves both outcomes in active review with the core reporting no diagnostic, focus on the new outcome's Open project, until Refresh closes the list [[space-48](#space-48)].

#### space-66

When the rendered surface signs in to a Space while holding a local-only project, the suite shall assert that the sign-in card uses its supported flow [[space-3](#space-3)] and the project remains local until a person chooses a Space sync destination [[space-4](#space-4)] [[space-97](#space-97)].

#### space-95

Where a project has records at two signed-in Spaces, when a reader inspects it in the Space surface, the integration suite shall verify its row and both placement lines:

- the project appears once with local opening and records actions, and its Sync and Explore panels stay attached [[space-1](#space-1)] [[space-111](#space-111)] [[space-125](#space-125)];
- each placement shows its Space, state and last sync independently, and only the active placement shows its current step [[space-87](#space-87)] [[space-61](#space-61)] [[space-12](#space-12)];
- a conflict at the second Space identifies that Space in the caption and incoming list. The picker names that Space’s copy and enables Apply only after a choice [[space-9](#space-9)] [[space-17](#space-17)].

#### space-139

When a reader chooses a project’s first Space in the IDE, the integration suite shall verify that changing the Space resets the matching-records choice, selection alone sends nothing, and submitting sends the chosen Space either a new personal copy or the selected repository id [[space-137](#space-137)]:

- while submission is pending, the panel holds the selectors, submission and dismissal;
- a refusal names its cause and preserves the selection for retry; a successful submission closes the panel.

#### space-143

When the rendered Space lists personal projects, the integration suite shall verify that each row presents and routes the action appropriate to its state:

- a reachable project with only an external remote shows its standing phrase under “This computer” [[space-1](#space-1)] [[space-61](#space-61)] [[space-120](#space-120)];
- with two Spaces signed in, Open here opens the native folder picker directly. Cancelling sends nothing and selecting a folder opens the row's repository at its own Space [[space-63](#space-63)] [[space-111](#space-111)];
- Choose folder… on local records without a working folder pairs the chosen folder with those records [[space-63](#space-63)] [[space-111](#space-111)];
- an unreachable row with a signed-in Space displays the cause and its Retry requests another read [[space-61](#space-61)];
- after sign-out, the row remains under that Space and names the sign-out without Retry [[space-1](#space-1)] [[space-6](#space-6)] [[space-61](#space-61)];
- a waiting placement displays its step on the placement line with the refusal in its title [[space-64](#space-64)] [[space-87](#space-87)].

### Browser Journeys

#### space-40

When a standalone browser journey uses two fresh homes signed in to the same Space account, the suite shall verify one personal project’s lifecycle across devices:

- Add registers an existing folder and Create creates a local working folder, each returning to the project without a destination chooser [[space-1](#space-1)];
- the first destination panel shows signed-in Spaces and sends the project records only on explicit submission [[space-137](#space-137)] [[space-97](#space-97)] [[space-12](#space-12)];
- the second home lists it and opens it using the existing folder and records flow [[space-1](#space-1)] [[space-63](#space-63)] [[space-111](#space-111)];
- Sync and Explore remain attached to its row [[space-125](#space-125)] and local Files & history remains accessible after sign-out [[space-55](#space-55)] [[space-6](#space-6)].

#### space-41

Where the harness boots the served shell signed in on a home whose spex repository a peer home has pushed to — the peer holding a differing configuration, the same session changed and an intent it queued — the test suite shall assert the daily sync with conflicts through the page:

- Check lists the peer's session, Settings and intent under "From <display name> (3)" with the conflicts marked, the line's title reading one behind and the row its last sync [[space-8](#space-8)] [[space-120](#space-120)];
- Sync ends "Needs your choice" with Apply disabled reading "0 of 2 chosen"; "Take <display name>'s" for the session and "Keep this computer's" for Settings by keyboard enable Apply; Apply's confirm names one replaced unit with Cancel focused, Escape keeps the choices, and confirming ends synced [[space-9](#space-9)] [[space-14](#space-14)] [[space-17](#space-17)] [[space-18](#space-18)];
- View diff on the Settings row shows this computer's side headed "Changes on this computer" and the stand-in's headed "Changes at <display name>" [[space-10](#space-10)];
- the session's tab shows the host's turns and Settings shows this device's configuration [[space-20](#space-20)];
- with the peer's `spex` moved after the check, Sync ends "<display name> changed again" with the ahead count on the row, and a second Sync pushes [[space-15](#space-15)];
- Stop during a check against a sleeping transport ends the check with its stopped state and Retry [[space-16](#space-16)];
- no visible text on the surface contains `ours`, `theirs`, `HEAD`, `origin/spex`, `@<host>/spex` or `-spex`, or the words instance, host, namespace, device or spex repository [[space-27](#space-27)].

#### space-42

Where the harness boots the served shell with the demo project registered and a finished session, the test suite shall assert the exploring journey through the page:

- the Explore tab lists the session's node titled by its first turn with its manifest "Shared", its hints file "Stays here" and its records offering Open session; selecting the manifest previews pretty-printed JSON and selecting the hints file reads withheld [[space-23](#space-23)] [[space-24](#space-24)];
- an empty directory of a tracked kind — `intents/` before any queued intent — reads "Not yet shared", never "Stays here" [[space-23](#space-23)];
- "Stays on this computer" names the eight families with their reasons [[space-25](#space-25)];
- the served page offers Copy path beside the repository and no reveal control, and acknowledges the copy [[space-26](#space-26)].

#### space-43

Where the harness boots the served shell signed in with a spex repository carrying local changes of every kind, its Code change captured from the paired folder's actual Git remote at Save, and a check ended in choices, when the journey shows Space with its Sync tab and Explore tab at the widths 320, 480, 640, 800, 1024 and 1280 pixels, each at 800 and 400 pixels tall, with the sidebar collapsed and, from 480 pixels, open ([DR-041](../decisions/041-chrome-that-fits.md)), the test suite shall assert fit through the page, naming every offending element:

- the page scrolls in neither direction, no element outside the diff canvas is wider than its box, within every header, instance heading, repository row, list row and picker row no two visible siblings overlap and every child lies inside its parent, and every control keeps its accessible name at every width [[space-28](#space-28)];
- a long-named project not yet opened here, with configured code and no sync phrase, aligns its name and opening action on the leading line, its visible code-location caption beneath the name at widths offering it; rows carrying metadata retain the same alignment and wrap without overlap at narrow widths [[space-1](#space-1)] [[space-28](#space-28)];
- at the wide viewport with overflowing content, the centered column is at most 48rem and scrolling over each empty side gutter moves the surface, with the page still [[space-28](#space-28)];
- the selected row and its records share one continuous expansion before the next row [[space-1](#space-1)] [[space-125](#space-125)], and Explore retains its bounded viewing area, internal scrolling and tree-preview reflow [[space-28](#space-28)]; visual evidence includes the owning project row and neighboring rows in both themes and both interface languages.

#### space-44

Where the harness boots the served shell signed in with a spex repository whose check ended in choices, when the Space surface is scanned by axe-core at WCAG 2.1 AA in the light and the dark theme, the test suite shall assert no serious or critical violation, with the picker's radio groups, the tree, the personal projects list and the tabs named for assistive technology [[space-17](#space-17)] [[space-23](#space-23)] [[space-1](#space-1)].

#### space-36

Where the harness boots the served shell on an empty home against a stand-in holding a personal project's spex repository a peer pushed — the peer having saved a titled session and queued a project intent — the test suite shall assert the second device's set-up through the page:

- after sign-in the Space lists the project with no local-location text and "Open here" [[space-61](#space-61)] [[space-111](#space-111)];
- "Open here" clones the spex repository and, the code remote being a path the harness serves, the code into the folder the page names, the row reading reachable once the code is in that folder, with the peer’s session in the project’s sidebar and its queued intent on Overview [[space-63](#space-63)] [[space-61](#space-61)] [[space-20](#space-20)];
- a session run here and synced lands on the stand-in's `spex` branch beside the peer's [[space-12](#space-12)].

#### space-105

Where a real core holds a repository at two stand-in instances, the test suite shall assert coherent repository readings across controlled Git and Check barriers:

- a read held between its placement lines while Check finishes never pairs the ending phase with the first placement's earlier incoming list [[space-29](#space-29)] [[space-8](#space-8)];
- a read begun before Check cannot replace its completed placement plan when that read resumes, with the retained remote diff still naming the incoming unit [[space-29](#space-29)] [[space-10](#space-10)];
- an idle read held after capturing a tracking ref cannot replace the plan a later idle read completed after that ref advanced, with the retained remote diff still naming the incoming unit [[space-29](#space-29)] [[space-10](#space-10)];
- a read whose captured branch names move while it waits computes its branch counts and three-way lists from the captured commits consistently [[space-33](#space-33)].

#### space-110

When real protocol clients exercise reported sign-in completion against a controlled instance, the integration suite shall assert start-before-completion ordering, committed success independent of a later setup failure, denial/expiry/stop, cancellation during the initial awaited start, legacy start behavior and stale or foreign-connection cancellation leaving a replacement attempt untouched [[space-108](#space-108)] [[space-109](#space-109)].

#### space-122

Where the Space surface renders over a controlled command connection reporting folder recovery and unfolded diagnostics, the integration suite shall assert the English and Chinese review flow:

- optional recovery starts closed behind Files & history with the core's positive count and warning icon, its accessible name identifying that number as notices, a zero count leaving neutral Files & history with no icon, while only a blocking diagnostic opens attention-styled review [[space-1](#space-1)] [[space-55](#space-55)];
- review explains location, reading and locating project files once above the tasks, without claiming that project files are absent, repeating per-project instructions or adding leave-for-later guidance; when all folder tasks report zero conversations, the introduction makes no saved-history or read-now claim [[space-55](#space-55)];
- named projects have separate groups, including equal names at distinct identities, and unnamed history shows Earlier conversations with every previous folder; previews have conversation icons and known-date or untitled fallbacks [[space-46](#space-46)];
- opening an identified conversation shows its saved transcript with no registered project or folder choice, starts no turn and sends no folder change; previews without an identity remain text and a removed session's stale preview stays on Space with a Refresh instruction [[space-46](#space-46)];
- Locate folder opens the selected group's existing-folder editor, explains why files are needed and that none are created or downloaded, starts empty when the recorded folder is unusable, keeps the candidate on refusal and sends only that group's confirmed choice, leaving the other groups unchanged and Cancel and Escape sending nothing [[space-47](#space-47)];
- Dismiss lowers the count once and preserves unrelated active notices [[space-49](#space-49)], confirms preservation and names Dismissed within Space → Files & history, where all-dismissed folder tasks remain reachable at zero after a remount and reconnect without a registered project or sign-in [[space-124](#space-124)] [[space-55](#space-55)], and a saved-folder outcome does not claim all imports succeeded [[space-48](#space-48)];
- upgrade and unknown-code diagnostics show only their supported meanings, with technical evidence collapsed and expandable [[space-121](#space-121)];
- eligible older-history notices offer dismissal separately from folder instructions; successful Dismiss and Show again move only their item between active review and collapsed Dismissed and update the count, failures retain the item with an error, blocking and unknown diagnostics offer no dismissal, an ordinary Files & history visit leaves Dismissed collapsed, and return from a saved conversation reveals its dismissed folder choices in Files & history [[space-124](#space-124)].

#### space-129

Where a real core pairs a working Git repository with records at a stand-in instance, the integration suite shall exercise remote publication after registration and assert the Save refresh:

- adding and pushing `origin` then syncing updates the local and published project file and exposes the metadata a second home uses to open the code [[space-12](#space-12)] [[space-63](#space-63)];
- changing and removing `origin` update that metadata on later syncs [[space-12](#space-12)];
- a credential-bearing remote refuses Save and leaves the previous project file unchanged [[space-12](#space-12)];
- reads alone and an unavailable or non-root paired folder leave the metadata unchanged [[space-12](#space-12)].
