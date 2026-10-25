<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# git-host: The Git Host Client

## Intent

This package defines how the core talks to the Git hosts a home signs in to under [DR-103](../decisions/103-the-home-and-its-groups.md), [DR-127](../decisions/127-a-home-signed-in-to-several-instances.md) and [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md): signing a person in at an instance as a public client, keeping each instance's app token, reading groups and spex repositories, creating one at the instance a pick, a placement or a sign-in names, preparing its `spex` branch, reading members, renaming and deleting a group and moving a spex repository, waiting out a host's rate limit, handing Git a credential through a helper, signing out of an instance, and the stand-in host the test suites run against, as one instance or several.
A **Git host**, or **instance**, is a deployment of Spex Space, which brokers the Git credential and wraps the Git system behind it; its routes are JSON under `/api/v1` and its sign-in pages under `/login`, as Spex Space's own specs state [[1]].
A home may be signed in to several instances at once, each known by its origin [[storage-2](storage.md#storage-2)] and holding in the core its own client, app token, account, view and rate-limit hold.
An **app token** is the credential an instance issues to one signed-in device: a short-lived access secret and a rotating refresh secret [[storage-19](storage.md#storage-19)].
The core reads an instance only when a person signs in there, activates Refresh, or starts a sync, and once when a client first asks for the Space state after a start with it signed in, never on a timer, and derives nothing from a cached list.

## External Behavior

### Sign-In

#### git-host-1

When the core creates `home.yaml` [[storage-2](storage.md#storage-2)], it shall record there, as the origin the home is created with, the origin of a nonempty `SPEX_HOST_URL` environment variable at that one moment, else `https://spex.sublang.ai` ([DR-150](../decisions/150-spex-space-product-and-destination.md), [DR-127](../decisions/127-a-home-signed-in-to-several-instances.md)):

- the recorded origin is read from `home.yaml` on every start; the variable changes an existing home's never;
- a variable holding a URL the origin rule refuses [[storage-2](storage.md#storage-2)] stops the core's start naming the variable, writing no `home.yaml`.

#### git-host-2

When a client sends `space.signin.start` on the desktop naming an instance's URL as `url`, the core shall sign in at that instance, by its origin [[storage-2](storage.md#storage-2)], through the browser flow with PKCE ([DR-103](../decisions/103-the-home-and-its-groups.md), [DR-127](../decisions/127-a-home-signed-in-to-several-instances.md)):

1. listen on `127.0.0.1` at a port the operating system assigns, for one callback;
2. mint a 32-byte verifier and its S256 challenge;
3. reply with that instance's `/login/app` URL carrying `client_id=spex`, a label naming this device and app, the loopback `redirect_uri`, the challenge with `code_challenge_method=S256`, and a random `state`, which the shell opens in the system browser [[app-shell-37](app-shell.md#app-shell-37)];
4. on the callback, check `state`, exchange the `code` with the verifier at that instance's token endpoint, read the person [[git-host-5](git-host.md#git-host-5)] with the issued access secret — at a listed instance, a person other than its entry's account ending the sign-in `failed`, naming that entry's login and storing nothing — then, in one step with the sign-in's end, store the app token for that origin in place of the pair that stood for it when the sign-in began [[storage-19](storage.md#storage-19)], write the account into that origin's entry in `home.yaml` with the client id `spex` and its sign-out mark cleared, an entry appended after the listed ones where none stands for that origin [[storage-2](storage.md#storage-2)], and answer the browser with a page saying the sign-in is complete and the browser may be closed;
5. set the home up for the account [[space-4](space.md#space-4)].

- a callback carrying `error=access_denied`, a wrong `state`, a refused exchange, or a person the instance does not return ends the sign-in `failed` with its cause and stores nothing; ten minutes without a callback, or `space.signin.cancel`, ends it `expired` or `stopped` and closes the listener;
- a sign-in that ends before its token is stored stores nothing, and one that finds its starting pair changed or removed ends `stopped`, storing nothing;
- a URL the origin rule refuses [[storage-2](storage.md#storage-2)] is refused `invalid_request` naming the rule before anything listens, storing nothing;
- at most one sign-in runs at a time, whichever instance it names; a second start is `busy`.

#### git-host-3

When a client sends `space.signin.start` on the server shell naming an instance's URL as `url`, the core shall sign in at that instance, by its origin [[storage-2](storage.md#storage-2)], through the device flow ([DR-103](../decisions/103-the-home-and-its-groups.md), [DR-127](../decisions/127-a-home-signed-in-to-several-instances.md)):

1. send `client_id=spex` and the device label to that instance's device endpoint and reply with the user code, the verification URL — the one completed with the user code where the instance returned it, else the plain one — and the expiry it returned;
2. poll that instance's token endpoint at the interval it named, backing off when told to slow down, until the app token arrives, the person denies, or the code expires;
3. on the token, continue as the browser flow does from its fourth step.

- a URL the origin rule refuses [[storage-2](storage.md#storage-2)] is refused as in the browser flow [[git-host-2](#git-host-2)];
- a denial ends the sign-in `failed` with `denied`, an expiry with `expired`, and `space.signin.cancel` stops the polling; nothing is stored until the token arrives and the person is read.

#### git-host-4

While the home holds an instance's app token, when a call to that instance is made, the core shall present that token's access secret as a bearer credential and keep the token current ([DR-127](../decisions/127-a-home-signed-in-to-several-instances.md), [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

- an access secret within a minute of expiring, or one the instance answers `token_expired` to, is refreshed first through its refresh secret, one refresh at a time per instance, the new pair stored in place of the refreshed one before any further call there [[storage-19](storage.md#storage-19)]; a call refused `token_expired` is retried once after the refresh;
- a refresh the instance refuses, or a call it answers `invalid_token`, `token_revoked` or `reauth_required` to, signs the device out of that instance alone: its credential removed, its entry kept in `home.yaml` marked signed out [[storage-2](storage.md#storage-2)], the Space state reporting the sign-out as that instance's with its entry's login [[space-3](space.md#space-3)], held for the core's run alone, and every placement at that instance [[storage-34](storage.md#storage-34)] that no other signed-in instance lists [[git-host-5](#git-host-5)] turning unreachable with "Sign in again" [[space-61](space.md#space-61)], until the next sign-in there, every other instance's token, view and rows untouched;
- a refresh or a refusal answers the pair its request presented: the credential's removal and the sign-out are one step, and where that pair is no longer the stored one, by a sign-in, a refresh or a sign-out meanwhile [[storage-19](storage.md#storage-19)], nothing is stored or removed, the device is not signed out, and the call is refused as changed meanwhile, to be made again;
- `rate_limited` is reported with the instance's retry time, `provider_unavailable` and a network failure as unreachable, and a `host_refused` with the instance's words [[git-host-11](git-host.md#git-host-11)].

### Reads and Writes

#### git-host-5

When an instance is signed in and a read of it is due — at its sign-in, on Refresh, and at the first `space.get` after the core started with it signed in and no full-view read of it begun since — the core shall read that instance, in one pass, its description with the roles it grants [[git-host-16](#git-host-16)], the person with whether they may create a group, every group with whether the person may create a subgroup in it, manage its members, rename it and delete it, and every spex repository it lists across its pages with whether the person may manage its members and move it to another group, and shall hold the answer as that instance's current view until its next read, each instance's read standing or failing on its own ([DR-103](../decisions/103-the-home-and-its-groups.md), [DR-114](../decisions/114-groups-and-sharing-from-spex.md), [DR-120](../decisions/120-the-instance-is-the-space.md), [DR-122](../decisions/122-a-sync-reads-its-destination.md), [DR-127](../decisions/127-a-home-signed-in-to-several-instances.md), [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

- every path the instance answers is taken as given, a path in the instance, and the view holds no URL but each repository's remote, which the core hands to Git alone, and the description's Git origin, held for the core's run alone; the description's display name is written into that instance's entry [[storage-2](storage.md#storage-2)] ([DR-120](../decisions/120-the-instance-is-the-space.md));
- the view holds each group by the instance and the group's id, and your namespace there — the listed group of kind `user` under that instance's account's login — and another account's — one under another login in which it lists a spex repository — by the instance and the login;
- a listed spex repository's key is that instance's folder joined to its group's path and its own name [[storage-1](storage.md#storage-1)], a placement of a clone here [[storage-34](storage.md#storage-34)] taking that clone's key and your own group's own repository keeping its key, and none where that group is held as colliding — one of kind `group` whose path equals, ignoring case, your login at that instance or another login under which it lists a spex repository, or lies beneath one — so a group collides within its own instance alone ([DR-120](../decisions/120-the-instance-is-the-space.md));
- a listed spex repository is one host repository by that instance's Git origin and its id, matched to a placement of a clone, whatever instance the clone is keyed under, where the id recorded beside one of the clone's remotes [[storage-34](storage.md#storage-34)] is that id and that remote lies under that Git origin, else where that remote is its remote URL, and otherwise to the clone whose placement file names that instance and id [[storage-36](storage.md#storage-36)] as a placement not on this device [[space-87](space.md#space-87)], never by name alone;
- a host repository more than one signed-in instance lists, all reporting one Git origin, is one placement, whose instance — the one its remote is named by [[storage-34](storage.md#storage-34)] — while signed in, alone governs its path and moves, its read-only state, its unlisting, its members, what the person may do on it, and Share, every other instance's listing only withholding Join [[space-63](space.md#space-63)] and Attach [[space-90](space.md#space-90)]; while that instance is signed out, the earliest signed-in instance in the home's list that lists it governs it, and the placement follows that one at its next sync [[space-60](space.md#space-60)];
- a placement at that instance whose host repository it no longer lists is marked unreachable with the cause, the clone's files untouched;
- a spex repository the core attaches a clone to, after creating it [[git-host-6](#git-host-6)] or from the view's own listing, and a group the core creates [[git-host-15](#git-host-15)], count as listed in their instance's view — each as that answer gave it, a created repository without its `spex` branch — until a read of that instance begun after the attachment or the creation is held, and a read begun before either is made again before it is held;
- a group the core renames or deletes and a spex repository it moves [[git-host-18](#git-host-18)] [[git-host-19](#git-host-19)] [[git-host-20](#git-host-20)] stand in their instance's view as its answer left them — renamed, with every group and spex repository inside it under its new path; gone; or in its new group — until a read of that instance begun after the change is held, and a read begun before the change is made again before it is held;
- the `project.json` the instance returns for each listed repository is kept for the pickers [[space-58](space.md#space-58)] [[space-88](space.md#space-88)], and its archived flag and the role of that instance's account, as the instance reports them, decide read-only [[space-61](space.md#space-61)];
- each listed repository is held with its members' count, the account among them, and one whose members the instance fails to read — by any answer but one that signs the device out of it [[git-host-4](#git-host-4)] — with none, that failure failing nothing else, while any other failure fails that instance's whole read;
- the read due at the first `space.get` is begun once per instance, however many clients ask, and that reply answers the state as it stands, never waiting for any read, whose outcome the core announces as any host read's [[space-2](space.md#space-2)];
- each instance's full read, including the surrounding account setup accepted by Refresh, publishes its running state until all its tracked work settles and then its success or failure through that instance's part of the public Space state [[space-1](space.md#space-1)], separately from its sign-in and its last complete view's time; a failed catalog read retains that view and time and reports the existing sanitized host message even where no remote-backed row exists; a setup failure is also reported through this lifecycle without discarding a completed catalog view, using the existing host message for classified host errors and a translated generic Refresh failure for unexpected local errors; that instance's sign-out clears its read lifecycle;
- repeated Refresh joins each instance's existing full read for the same signed-in account generation; work accepted after a sign-out or new sign-in there waits for that instance's older owned work to settle and then performs the current account's setup/read, whose lifecycle an older completion cannot clear; a selected destination read [[git-host-22](#git-host-22)] neither starts nor clears the full-read lifecycle, and retains its newer-target authority.

#### git-host-22

When a sync checks a placement, or needs its first-sharing notice, the core shall read — at that placement's turn for a check, and at admission for a notice that may be owed — a fresh complete catalog of the instance governing that placement [[git-host-5](#git-host-5)] — its description, person, every group and every repository across its pages — and only the matched repository's detail, branch, read-only state and members, independently of any full-view read [[git-host-5](#git-host-5)] ([DR-122](../decisions/122-a-sync-reads-its-destination.md), [DR-127](../decisions/127-a-home-signed-in-to-several-instances.md), [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

- matching and collision detection follow the full-view rules [[git-host-5](#git-host-5)], every user namespace in the catalog and your login at that instance counting;
- a failed first-notice read stops that placement alone, as unreachable, a sync refused only where no placement could run [[space-57](space.md#space-57)]; the catalog or target failing at Check stops that placement with that cause, an unmatched target being no longer shared; a members failure alone leaves its count unknown, except an answer that signs the device out or finds its credential pair replaced [[git-host-4](#git-host-4)], and an unknown count requires the first-sharing notice [[space-57](space.md#space-57)];
- the target's latest answer governs its row, path, abilities and read-only state, without advancing the whole view's read time or refreshing unrelated rows; a full read begun before it cannot replace that authority on success or failure, while a full read begun after it supersedes it;
- a creation, attachment, rename, deletion or move made by this core while a catalog read is in flight is reconciled by reading again before using that answer, as for a full read [[git-host-5](#git-host-5)];
- Check rechecks the first-notice condition against its fresh membership before any branch or Git transport effect: a count that changed from the account alone to shared or unknown stops there with the sharing-notice phrase, leaves acknowledgement unset and offers the usual notice on the next Sync, while existing explicit setup and pick authorization stands;
- a successful target answer crossing a sign-out or sign-in at that instance is refused as sign-in changed meanwhile, stores no target authority and permits no path or remote update from that answer;
- following a move and updating the remote retain their unchanged-clone guards [[space-60](space.md#space-60)], and sign-out or a changed credential retains its refusal [[git-host-4](#git-host-4)].

#### git-host-6

When the core creates a spex repository at an instance — for a pick or a Place naming a group or your namespace there [[space-58](space.md#space-58)] [[space-97](space.md#space-97)], or for a group's first session or your own group's sign-in at any instance [[space-65](space.md#space-65)] — it shall ask that instance to create `<name>-spex` there, private, with a description naming it as the project's or the group's records and, for a project, where its code lives, and shall act on the answer ([DR-127](../decisions/127-a-home-signed-in-to-several-instances.md), [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

| Answer | The core |
| --- | --- |
| created | records the repository's remote URL in the clone's Git configuration as a remote named by that instance's folder, with its id beside it [[storage-34](storage.md#storage-34)], prepares the branch [[git-host-7](git-host.md#git-host-7)], and pushes `spex` |
| pending, with the instance's words | leaves the clone without that placement — local only for a pick — and reports the step as waiting with those words [[space-64](space.md#space-64)] |
| name taken | reports the name taken so the reader is asked for another [[space-58](space.md#space-58)] |

- a group of the instance is named to it by its id, and your namespace there by none, never by its id, which names no group of the instance there;
- a pick naming a group that instance's current view does not list as a group of the instance — your namespace's id among them — is refused `not_found` before the instance is asked;
- a `<name>` is the working folder's name, or the group's, lower-cased to kebab-case where it is not one already, and never edited beyond that without the reader.

#### git-host-7

Before the first push of `spex` into a placement, the core shall ask its instance to prepare the branch, and shall push only on `ready` ([DR-127](../decisions/127-a-home-signed-in-to-several-instances.md), [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

- `pending`, with the host's words, is reported as waiting on the repository's row [[space-64](space.md#space-64)] and asked again before the next sync;
- a repository the host reports empty is pushed only after the host's default branch exists, so `spex` never becomes the default branch; the core asks again on the next sync until it does;
- a sync whose placement records the core's creation of its repository [[git-host-6](#git-host-6)] — `remote.<folder>.spexCreated` in the clone's Git configuration, unset by the first check of that placement that finds the host's default branch or has pushed it, and kept by a check that stops before then — the core stopping, the host not answering, the push refused — or that finds the empty repository read-only, so the next sync, and a restarted core, owe the branch still and try again — finding it empty, reads it again every 2 s, five times at most, since the host may answer a creation before committing its default branch, and, finding it empty still, pushes that branch itself — `main`, one commit holding the README the host would have written, titled with the repository's name — before preparing the branch, a refusal of that push stopping that placement in the host's words [[space-15](space.md#space-15)].

#### git-host-8

When a client sends `space.members` for a reachable spex repository or for a group a signed-in instance's view lists, the core shall read its members from the instance that lists the group, or from the instance of the repository's placement the command names, the governing one where several list it [[git-host-5](#git-host-5)], and reply with each member's id, login, display name, that instance's own role name, whether the membership is that repository's or group's own and, where not, the path in the instance of the group it comes through, as the instance answers them, holding nothing of it after the reply ([DR-114](../decisions/114-groups-and-sharing-from-spex.md), [DR-120](../decisions/120-the-instance-is-the-space.md), [DR-127](../decisions/127-a-home-signed-in-to-several-instances.md), [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)).

#### git-host-15

When a client sends `space.group.create` [[space-68](space.md#space-68)], the core shall ask the instance the command names to create the group — named as the reader typed, at the path the reader gave, private, inside the named group of that instance or at its root — and shall act on the answer ([DR-114](../decisions/114-groups-and-sharing-from-spex.md), [DR-127](../decisions/127-a-home-signed-in-to-several-instances.md)):

| Answer | The core |
| --- | --- |
| created | holds the group as listed in that instance's view, as it answered it with what the person may do there [[git-host-5](#git-host-5)], beginning no read of its own; announces the state carrying it; then replies with the group's id, full path and name |
| name taken | refuses `invalid_request` saying the name is taken there |
| `host_refused` | refuses `invalid_request` with the instance's words |

- a blank name or path is refused `invalid_request` before the instance is asked, and a parent that instance's current view does not list `not_found`;
- the instance is asked whatever its view said the person may do there: its refusal is the answer.

#### git-host-16

When a client sends `space.share` [[space-69](space.md#space-69)], the core shall ask the instance that lists the named group, or that governs the named placement of the spex repository [[git-host-5](#git-host-5)], to add the account of that login there to it at the named role, and shall reply with the members as that instance lists them after the addition [[git-host-8](#git-host-8)] ([DR-114](../decisions/114-groups-and-sharing-from-spex.md), [DR-127](../decisions/127-a-home-signed-in-to-several-instances.md), [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

- the roles are that instance's own, as its description lists them in its current view [[git-host-5](#git-host-5)], each with the instance's name and whether it may push; a role not among them, or a blank login, is refused `invalid_request` before the instance is asked, and whatever the view said the person may do, the instance is asked and its refusal is the answer;
- `not_found` answering the addition is relayed `not_found` with the instance's words, which name the login, and `host_refused` — the person's rights, the account already a member — `invalid_request` with the instance's words;
- a group, or a placement, no signed-in instance's view lists is refused `not_found` before any instance is asked.

#### git-host-17

When a client sends `space.unshare` [[space-72](space.md#space-72)], the core shall ask the instance that lists the named group, or that governs the named placement of the spex repository [[git-host-5](#git-host-5)], to remove the account of that login there from its own members and shall reply with the members as that instance lists them afterwards [[git-host-8](#git-host-8)] ([DR-114](../decisions/114-groups-and-sharing-from-spex.md), [DR-127](../decisions/127-a-home-signed-in-to-several-instances.md), [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

- a blank login is refused `invalid_request` before the instance is asked, and a group, or a placement, no signed-in instance's view lists `not_found`;
- `not_found` answering the removal — no account under the login, or no membership of its own there — is relayed `not_found` with the instance's words, and `host_refused` — the person's rights, the instance keeping its last owner — `invalid_request` with the instance's words;
- whatever the view said the person may do, the instance is asked and its refusal is the answer.

#### git-host-18

When a client sends `space.group.rename` [[space-76](space.md#space-76)], the core shall ask the instance that lists the named group to give it the name, the path segment, or both, that the command carries, and shall act on the answer ([DR-120](../decisions/120-the-instance-is-the-space.md), [DR-127](../decisions/127-a-home-signed-in-to-several-instances.md)):

| Answer | The core |
| --- | --- |
| renamed | holds the group as the instance answered it [[git-host-5](#git-host-5)], beginning no read of its own; announces the state carrying it; then replies with the group's id, full path and name |
| name taken | refuses `invalid_request` saying the path is taken there |
| `not_found` | refuses `not_found` with the instance's words |
| any other | refuses `invalid_request` as [[git-host-11](#git-host-11)] relays it |

- neither a name nor a path, a blank name or a blank path is refused `invalid_request` before the instance is asked, and a group its instance's current view does not list as a group of the instance — your namespace there among them — `not_found`;
- the instance is asked whatever its view said the person may do there: its refusal is the answer.

#### git-host-19

When a client sends `space.group.delete` [[space-77](space.md#space-77)], the core shall ask the instance that lists the named group to delete it and shall act on the answer ([DR-120](../decisions/120-the-instance-is-the-space.md), [DR-127](../decisions/127-a-home-signed-in-to-several-instances.md)):

| Answer | The core |
| --- | --- |
| deleted | holds the group as gone [[git-host-5](#git-host-5)], beginning no read of its own; announces the state without it; then replies |
| `not_found` | refuses `not_found` with the instance's words |
| any other | refuses `invalid_request` as [[git-host-11](#git-host-11)] relays it |

- a group under which its instance's current view lists a spex repository or a group is refused `invalid_request` before the instance is asked, since the instance deletes whatever a group holds with it;
- a group its instance's view does not list as a group of the instance — your namespace there among them — is refused `not_found` before the instance is asked;
- the instance is asked whatever its view said the person may do there: its refusal is the answer.

#### git-host-20

When a client sends `space.repository.move` [[space-78](space.md#space-78)], the core shall ask the instance governing the named placement of the spex repository [[git-host-5](#git-host-5)] to move that host repository into the named group of that instance, or into your namespace there where the command names none, and shall act on the answer ([DR-120](../decisions/120-the-instance-is-the-space.md), [DR-127](../decisions/127-a-home-signed-in-to-several-instances.md), [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

| Answer | The core |
| --- | --- |
| moved | holds the repository as the instance answered it, in its new group [[git-host-5](#git-host-5)], beginning no read and moving no clone of its own; announces the state carrying it; then replies with its id and its path in the instance |
| name taken | refuses `invalid_request` saying the name is taken in that group |
| `not_found` | refuses `not_found` with the instance's words |
| any other | refuses `invalid_request` as [[git-host-11](#git-host-11)] relays it |

- the repository is named by its key and the placement by its instance: a clone with no placement there is refused `invalid_request`, and a repository that instance's view does not list `not_found`, before the instance is asked;
- a group that instance's view does not list — one of another instance among them — is refused `not_found`, and one held as colliding [[git-host-5](#git-host-5)] `invalid_request` with that cause, before the instance is asked;
- the instance is asked whatever its view said the person may do on it: its refusal is the answer.

#### git-host-9

When the core runs a Git transport — clone, fetch, push or `ls-remote` — on behalf of an instance at that instance's Git origin [[git-host-5](#git-host-5)], it shall ask that instance for a credential first and hand it to Git through a credential helper, never through the remote URL ([DR-103](../decisions/103-the-home-and-its-groups.md), [DR-127](../decisions/127-a-home-signed-in-to-several-instances.md), [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

- a placement's transport is on behalf of the instance its remote is named by [[storage-34](storage.md#storage-34)], or of the instance it is joined, created or attached at, never of one chosen by the Git origin alone, so a placement whose instance is signed out is fetched through no other instance sharing that Git origin until it follows one [[space-60](space.md#space-60)]; a project's code and a Git source are on behalf of the instance their own rules name [[projects-37](projects.md#projects-37)] [[environments-13](environments.md#environments-13)];
- the credential — the username and the secret the instance returned, with its expiry — is written to a file with owner-only permissions in a temporary directory, which is removed when the Git child ends;
- Git runs with `-c credential.helper=` naming the app's own helper script on the app's own runtime, which answers Git's `get` with that username and password and ignores `store` and `erase`; a transport on behalf of no instance — a remote the reader named, any other origin — names no helper and uses the device's own, except that on a seat a remote at a host the member placed a token for [[storage-44](storage.md#storage-44)] takes the app's helper with that token, and the seat account's own Git configuration names the app's helper in its member mode — answering `get` for an `http` or `https` host the member placed a token for from the store, as the app's own transports serve both, [[storage-44](storage.md#storage-44)] and nothing for any other host or for a request naming a username other than the entry's, so the device's own helpers serve it — so a project's code is cloned and pushed with the member's own credential, by the app and by an agent in the work tree alike, and never the administrator's ([DR-132](../decisions/132-team-servers.md));
- the instance refusing the credential signs the device out of it alone [[git-host-4](git-host.md#git-host-4)] and stops the transport before Git runs.

#### git-host-10

When a client sends `space.signout` naming a signed-in instance, the core shall revoke this device at that instance with its app token, then, in one step, remove that pair [[storage-19](storage.md#storage-19)] and mark that instance's entry signed out in `home.yaml`, keeping the entry, every clone and record, and every other instance's sign-in ([DR-127](../decisions/127-a-home-signed-in-to-several-instances.md)):

- an instance that cannot be reached is tried once; the credential is removed either way;
- where another pair was stored for that origin in its place meanwhile, by a sign-in or a refresh, nothing is removed, the instance stays signed in, and the sign-out is refused `conflict` as changed meanwhile, to be sent again;
- where that origin's entry in the credentials file is malformed, nothing is revoked, and that credentials entry is removed and the instance signed out, unless a well-formed pair is stored there by then, which stays as above; a credentials file of another format is left as it is and the sign-out refused [[storage-19](storage.md#storage-19)].

#### git-host-11

When the host answers a call with anything but success, the core shall relay it in the reader's language with the host's own words kept whole wherever it carries them, and shall claim nothing the host did not say ([DR-064](../decisions/064-honest-remote-failure.md)):

| Answer | Relayed as |
| --- | --- |
| `pending` | waiting, with the words, on the step's row |
| `name_taken` | the name is taken |
| `host_refused` | refused, with the words |
| `not_found` | no longer shared with this account; for a share, the host's words naming the login [[git-host-16](#git-host-16)] |
| `rate_limited` | the host asks to wait N seconds — its `Retry-After`'s number, or the seconds until its HTTP date, none below zero — or a moment, where it gives neither |
| `reauth_required`, `token_revoked`, `invalid_token` | sign in again |
| `provider_unavailable`, no answer | the host could not be reached |

#### git-host-21

When an instance answers a call 429, the core shall hold, for that instance alone, the instant that answer asks it to wait until — the answer's time plus its seconds [[git-host-11](#git-host-11)] — sending each call to it that waits only once that instant has passed and refusing every other call to it made before then at once, as the instance asking to wait the seconds that remain [[git-host-11](#git-host-11)] ([DR-127](../decisions/127-a-home-signed-in-to-several-instances.md)):

- the calls that wait are a sync step's, whose Stop ends that wait unsent and stops the step [[space-16](space.md#space-16)], and the host read's [[git-host-5](#git-host-5)];
- the hold is 120 seconds at most and none where the answer's seconds are unknown, and an instant already held stands where it is the later.

#### git-host-27

Where the core runs as a seat [[core-service-125](core-service.md#core-service-125)], when the device flow runs [[git-host-3](#git-host-3)], the request shall carry `server_id` and `person_id` beside the client id and the label "Spex on <server name>", and the sign-in shall end `failed` with `denied` where the instance denies the code and `failed` naming another account where the person read bears another permanent id than the person's, storing nothing either way ([DR-132](../decisions/132-team-servers.md)).

#### git-host-29

When the core lists a signed-in instance's servers or asks it for a ticket — `GET /api/v1/host/servers` and `POST /api/v1/host/servers/:id/tickets`, with that instance's app token [[git-host-4](#git-host-4)] — it shall take the listing and the ticket as the instance answers them, holding nothing after the reply, and relay any other answer [[git-host-11](#git-host-11)] ([DR-133](../decisions/133-one-desktop-over-several-cores.md)).

## Internal Behavior

#### git-host-12

The core package shall ship a stand-in Git host for its own tests and the browser journeys ([DR-039](../decisions/039-browser-acceptance-journeys.md), [DR-127](../decisions/127-a-home-signed-in-to-several-instances.md)): an in-process HTTP server that implements an instance's sign-in and host routes over a directory of bare Git repositories, serves their Git transport over HTTP, and exposes a scripting interface, several running at once as several instances:

- instances: each at its own loopback origin with its own display name, accounts, tokens, groups and description; two able to run over one directory of bare repositories and one Git transport, served at one origin both descriptions report as their Git origin, each instance's groups in a container of its own, the accounts' namespaces and their repositories listed by both under the same ids, either scriptable to answer a repository's archived flag or the person's role there unlike the other, each issuing credentials that transport accepts, and the transport recording which instance issued each credential it accepts;
- sign-in: `/login/app` and `/login/device` pages, the device endpoint returning the verification URL completed with the user code as Spex Space does, and the token endpoint issuing app tokens, with scripted approval, denial and expiry; access secrets that expire on demand; revocation;
- host routes: the next host requests answered 429 `rate_limited` with a scripted `Retry-After` or none, 503 `provider_unavailable`, or 403 `host_refused` with scripted words; the description, whose `groups` says whether root groups can be made as the person's `can_create_group` does, and the person, who may create a group unless scripted otherwise; groups by their paths in the instance, with no group of the stand-in's own, the roles and spex repositories from a scripted fixture, one among them in another account's namespace; the listing answered after a scripted sleep with what stood at its arrival; creation of a bare repository with a README on `main`, which a scripted hold keeps out of its first reads or until a push lands, in a group of the instance named by its id or in the person's namespace where none is named, any other id — the person's namespace's among them — answered `not_found` as Spex Space answers it, and each creation's body recorded; creation of a group at the root, holding the person and a scripted service identity as its Owners, or under a listed parent, with a scripted taken name, a root path equal to a known account's login answered `name_taken` unless scripted to admit it, a scripted refusal and a scripted lag leaving the groups it creates out of its listing; a repository's and a group's members with their source, the service identity never among them, counted or named as a source, and a scripted `provider_unavailable` answering every read, addition and removal of members while every other route answers, as Spex Space answers while its service identity's read fails; the addition of a member by login with scripted unknown logins and refusals, the removal of a member with a scripted refusal; the rename of a group of the instance, carrying the groups and repositories inside it to its new path, its deletion with everything inside it, and the move of a spex repository into a group of the instance or the person's namespace, each refused where what the person may do there says not, a path or name taken there answered `name_taken` — a root group's new path equal to a known account's login among them unless scripted to admit it, as at creation — with a scripted refusal of each; what the person may do per group — create a subgroup, manage its members, rename it, delete it — and per repository — manage its members, move it; branch preparation with a scripted refusal; the credential for its Git origin; and no page URL in any answer ([DR-120](../decisions/120-the-instance-is-the-space.md));
- Git transport: every repository served over HTTP through Git's own backend at `<origin>/<login>/<name>-spex.git` in an account's namespace and at `<origin>/<storage>/<group>/<name>-spex.git` in a group of the instance, `<storage>` a group no answer names, as a deployment's container, accepting the credentials the stand-in issued and refusing others with 401, with a scripted sleep, a scripted refusal in words that may carry URLs under its origin, a scripted answer of 500, a scripted refusal of a push to `main` alone in its words and a scripted archive, an empty repository taking the first branch pushed into it as its default;
- a scripted rename, transfer, archive and membership removal, each visible on the next read.

## Verification

#### git-host-13

When an integration suite starts a real core on a scratch home against the stand-in [[git-host-12](#git-host-12)], it shall assert the sign-in flows over the protocol:

- a new home records the stand-in's origin from `SPEX_HOST_URL`, one created with `https://SPEX.pub:443/` still records `https://spex.pub` and one with none set `https://spex.sublang.ai`, and a later start with the variable changed keeps the recorded one [[git-host-1](#git-host-1)];
- `space.signin.start` naming a URL with a path, a query or a user, `http` at a host other than loopback, a host holding `_`, or, once the stand-in is listed, `https` at its host and port, whose folder equals the stand-in's, is refused `invalid_request`, nothing listening and no request reaching any host [[git-host-2](#git-host-2)], and a core started on a new home with `SPEX_HOST_URL` holding `_` in its host stops naming the variable, writing no `home.yaml` [[git-host-1](#git-host-1)];
- the browser flow's URL names the loopback redirect, an S256 challenge and `client_id=spex`; completing it at the stand-in stores the app token under its origin with owner-only permissions and its entry in `home.yaml` with the client id `spex` and the account, and the callback page says the browser may be closed [[git-host-2](#git-host-2)];
- a callback with a wrong `state`, one carrying `access_denied`, a refused exchange, a cancel and a test-shortened expiry each end the sign-in with its cause and store nothing; a second start during a flow is `busy` [[git-host-2](#git-host-2)];
- with the person read held after the exchange, a cancel in the browser flow and in the device flow ends the sign-in `stopped` with nothing stored once the read answers, and a pair stored meanwhile ends it `stopped`, that pair and another host's kept [[git-host-2](#git-host-2)] [[git-host-3](#git-host-3)];
- with the person read failing after the exchange, the browser flow and the device flow each end the sign-in `failed` with nothing stored [[git-host-2](#git-host-2)] [[git-host-3](#git-host-3)];
- the device flow replies with the stand-in's user code and its verification URL completed with that code, polls at its interval, backs off on slow down, and completes on approval; a denial and an expiry end it with their causes [[git-host-3](#git-host-3)];
- an access secret the stand-in expires is refreshed once before the next call, two concurrent calls refresh once, and a refresh the stand-in refuses, or a device it revoked, signs the device out with every remote repository unreachable and the state reporting the host's sign-out with the account's login until the next sign-in, which clears it [[git-host-4](#git-host-4)];
- with a refresh's answer, granted or refused, or a revoked pair's refusal held while another pair is stored, the answer stores and removes nothing and signs nothing out, and the call is refused as changed meanwhile, another host's pair kept; a core whose held read was refused for the former pair keeps its account signed in [[git-host-4](#git-host-4)];
- sign-out revokes the device at the stand-in and removes its credential, its entry kept marked signed out, and a stand-in that cannot be reached still leaves it signed out [[git-host-10](#git-host-10)];
- a sign-out over a malformed entry for the stand-in removes it and marks the account signed out, another host's pair kept; one whose failed read is followed by a well-formed pair stored there keeps that pair, marks nothing and is refused as changed; one over a file of another format leaves it byte for byte and marks nothing [[git-host-10](#git-host-10)];
- a core's sign-out whose revocation is held while a new sign-in stores its pair is refused `conflict`, the new pair and the account signed in kept; one whose removal is followed, before the sign-out's own continuation, by a new sign-in storing its pair and account leaves that account signed in [[git-host-10](#git-host-10)].

#### git-host-14

When an integration suite drives host reads and writes against the stand-in [[git-host-12](#git-host-12)], it shall assert:

- a read lists every group and every spex repository across two pages, matches clones by id and then by remote, marks a clone the stand-in stopped listing unreachable with its files intact, and keeps the previous view with its time when the stand-in answers 503 [[git-host-5](#git-host-5)];
- a core restarted on a signed-in home answers its first `space.get` with no read time and begins one read of the stand-in however many `space.get` follow, its state announced with a read time [[git-host-5](#git-host-5)];
- creating a spex repository records its id and remote in the clone's Git configuration, prepares the branch and pushes; a pending answer leaves the clone local only with the words; a taken name is reported as such [[git-host-6](#git-host-6)] [[git-host-7](#git-host-7)];
- your own group's spex repository created at sign-in and a pick creating in your namespace there name no group to the stand-in, a pick naming your namespace's id is refused `not_found` before any request reaches it, and the stand-in answers a creation naming that id `not_found` [[git-host-6](#git-host-6)] [[git-host-12](#git-host-12)];
- from a creation, or a pick joining a listed repository, to its push's end no state reads the repository unreachable, also where a read begun before the creation answers after it without it, and the push lands with no Refresh [[git-host-5](#git-host-5)];
- an empty repository on the stand-in is not pushed until its default branch exists [[git-host-7](#git-host-7)];
- a repository whose README the stand-in holds out of its first reads is pushed by its creation's first sync with no stop; one whose README never comes gets from that sync, after reading it again, `main` holding the README as the stand-in's default branch and then `spex`; that push of `main` refused, the sync stops in the stand-in's words and the clone keeps the creation recorded, a Retry reads it again and pushes `main` again, refused again in those words, a sync while the stand-in holds it archived ends read-only [[git-host-5](#git-host-5)], pushing nothing and keeping the creation, and a Retry once the stand-in unarchives it and lifts the refusal pushes `main`, the default branch, and then `spex`; a core stopped while such a first sync reads it again leaves the creation recorded on the clone, and the next core's sync reads it again and pushes `main` and then `spex`; no clone records its creation once such a sync has pushed [[git-host-7](#git-host-7)];
- members are read with the stand-in's role names and sources, no URL and no service identity among them, and held nowhere after the reply [[git-host-8](#git-host-8)];
- with the stand-in failing every members route, a read holds every listed spex repository with no members' count and the rest of the view as listed, a Refresh and a sync's Check succeed, and a members read is relayed as the host could not be reached [[git-host-5](#git-host-5)] [[git-host-11](#git-host-11)];
- a read of the stand-in's defaults says the person may create a group, one scripted otherwise says not, the stand-in's description saying the same in `groups` [[git-host-12](#git-host-12)], and a group created at the root lists the person as its Owner and no one else [[git-host-5](#git-host-5)] [[git-host-15](#git-host-15)] [[git-host-8](#git-host-8)];
- the read holds the stand-in's roles with its default, a group is created at the top and under a listed parent at the path given, a name in Chinese among them, with the reply naming its full path, a taken name is refused as taken there and a scripted refusal with the stand-in's words, and a blank name, a blank path and an unlisted parent are refused before any request reaches the stand-in [[git-host-5](#git-host-5)] [[git-host-15](#git-host-15)];
- a created group stands, with what the stand-in says the person may do there, in a state broadcast before its reply and in the next `space.get`, after its parent where it has one, no read of the stand-in begun, and is taken as a parent and its members read before any read [[git-host-15](#git-host-15)] [[git-host-5](#git-host-5)]; a Refresh whose read lists it keeps it, one whose read the stand-in answers without it, its listing lagging, drops it, and a read begun before a creation that answers after it without the group is made again, no state from the creation to that read's end lacking it [[git-host-5](#git-host-5)];
- a member is added to a group and to a spex repository by login at a role with the reply listing the stand-in's members afterwards, an unknown login is refused `not_found` with the stand-in's words, an existing member and a scripted refusal `invalid_request` with the words, and a role outside the view's and a blank login are refused before any request reaches the stand-in [[git-host-16](#git-host-16)];
- a group's members are read with each one's source, a direct member is removed from a group and from a spex repository with the reply listing the stand-in's members afterwards, a login with no membership of its own there is refused `not_found` with the stand-in's words, a scripted refusal `invalid_request` with the words, and a blank login and an unlisted group before any request reaches the stand-in [[git-host-8](#git-host-8)] [[git-host-17](#git-host-17)];
- a push runs with the helper and a credential file of mode `0600` in a directory removed after the child ends, the stand-in's transport receiving the issued credential and refusing a push attempted with none; a fetch from a bare path remote names no helper [[git-host-9](#git-host-9)];
- a group of the instance is renamed — its name and its path, every group and spex repository inside it then standing under the new path — and an empty one deleted, and a spex repository is moved into a group and into your namespace there, each standing in a state broadcast before its reply with no read of the stand-in begun, until a read held after it lists the stand-in's answer [[git-host-18](#git-host-18)] [[git-host-19](#git-host-19)] [[git-host-20](#git-host-20)] [[git-host-5](#git-host-5)];
- a taken path — a known account's login at the root among them — and a taken name are refused as taken, a refusal the stand-in scripts for each of the three, and the stand-in's own refusal of what it says the person may not do, with its words kept whole in English and in Chinese; neither a name nor a path, a blank one, a group holding a spex repository or a group, a group held as colliding, your namespace, and a group or spex repository the view does not list are refused before any request reaches the stand-in [[git-host-18](#git-host-18)] [[git-host-19](#git-host-19)] [[git-host-20](#git-host-20)];
- each stand-in answer of the table is relayed in English and in Chinese with the stand-in's words kept whole [[git-host-11](#git-host-11)];
- a 429 is relayed with `Retry-After: 2` as "asks to wait 2 seconds", with an HTTP date 3 s ahead "3 seconds", with a date past in RFC 850's or asctime's form "0 seconds", and with none "a moment" [[git-host-11](#git-host-11)]; a read the stand-in answers 429 keeps the previous view with its time, its rows reading unreachable with "<display name> asks to wait 30 seconds", in English and in Chinese [[git-host-5](#git-host-5)] [[git-host-11](#git-host-11)];
- after a 429, the next call that waits reaches the stand-in no sooner than 2 s after `Retry-After: 2`'s answer, no sooner than 3 s after two calls in flight are answered 3 and 1 seconds, no sooner than a date 3 s ahead, at once after a date past or none, and about 1 s after `Retry-After: 30`'s under a test-shortened bound of 1 s; a call whose Stop comes while it waits ends at once, nothing reaching the stand-in; a members read during `Retry-After: 2`'s hold is refused at once as asking to wait 2 seconds, nothing reaching the stand-in [[git-host-21](#git-host-21)];
- a core asked for a spex repository's members during a hold refuses at once with "<display name> asks to wait N seconds", N the seconds that remain, nothing reaching the stand-in, while a Check begun then waits the hold out [[git-host-21](#git-host-21)].

#### git-host-23

When a real-core integration suite checks a selected repository against the stand-in [[git-host-12](#git-host-12)], it shall verify the destination read [[git-host-22](#git-host-22)]:

- an unrelated detail failure stops a full Refresh but not the selected sync, which makes no unrelated detail or members call and leaves the full read time unchanged;
- target, catalog and authentication failures stop the selected check without a push, and missing targets retain their local files;
- fresh namespace facts refuse a collision, an id follows a move with the remote guarded, and unknown target membership requires the notice;
- older full-read success and failure completing around a target check never restore its old path or access, and a later full read supersedes it;
- a creation or move during an in-flight catalog causes rereading before the target is used;
- a target-only read before the first Space request after a signed-in restart leaves that request's nonblocking full read due;
- a failed first-notice read admits no later healthy Check or push, and membership changing from solo to shared at Check stops before transport without acknowledgement;
- a held successful target answer released after sign-out or another account's sign-in stops as changed meanwhile, repopulates no target authority and changes no clone path or remote.

#### git-host-24

When an integration suite starts a real core on a scratch home against two stand-in instances [[git-host-12](#git-host-12)], each holding a group `acme` with a spex repository and a group named like the account's login at the first, where the second's login differs, it shall assert that each instance stands on its own:

- a sign-in at the second, then at the first, appends each entry after the listed ones with its token under its origin [[git-host-2](#git-host-2)]; a sign-in at the first named with a trailing `/` signs its entry in again, and one there as another account ends `failed` naming the entry's login, both stored pairs kept [[git-host-2](#git-host-2)];
- a Refresh reads both, each `acme` repository listed under a key in its own instance's folder, and the group named like the first's login is held as colliding at the first alone [[git-host-5](#git-host-5)];
- a core restarted signed in to both begins one read of each at its first `space.get`, and with the second answering 503 the first's view is held with its read time while the second reports its failure [[git-host-5](#git-host-5)];
- after a 429 from the first, a read of the second reaches it at once while the first's waits out its hold [[git-host-21](#git-host-21)];
- a refresh the first refuses signs that instance out alone, its entry kept marked signed out and its rows unreachable with "Sign in again", the second's token, view and rows kept; a credential the second refuses to a transport signs the second out alone; a sign-out of one keeps the other signed in [[git-host-4](#git-host-4)] [[git-host-9](#git-host-9)] [[git-host-10](#git-host-10)];
- a pick into the second's `acme` creates the repository at the second, records its remote named by the second's folder with the id beside it, and pushes with a credential the second issued; a group created at each root reaches only the instance the command names; a member added in the second's `acme` reaches the second alone; a move into a group of the other instance is refused `not_found` before any request [[git-host-6](#git-host-6)] [[git-host-9](#git-host-9)] [[git-host-15](#git-host-15)] [[git-host-16](#git-host-16)] [[git-host-20](#git-host-20)].

#### git-host-25

When an integration suite starts a real core against two stand-in instances over one Git backend [[git-host-12](#git-host-12)], both listing one spex repository in the account's namespace under one id, and the first listing a repository in a group of its own, it shall assert that a host repository is one by its Git origin and id and is governed by its clone's instance:

- signed in to both, the namespace repository is one spex repository, its clone made by Join keyed under the first, the second's listing offering no second Join [[git-host-5](#git-host-5)];
- the second scripted to answer it archived, or with the account below the role that may push, changes nothing while the first is signed in; its members are read from the first and a member is added there; its push presents a credential the first issued [[git-host-5](#git-host-5)] [[git-host-8](#git-host-8)] [[git-host-16](#git-host-16)] [[git-host-9](#git-host-9)];
- with the first signed out, the repository reads through the second, and once its next Sync has moved the clone under the second's folder, its Check reads the second's catalog and its push presents a credential the second issued [[git-host-5](#git-host-5)] [[git-host-22](#git-host-22)] [[git-host-9](#git-host-9)]; the clone of the repository the first lists alone reads unreachable, no transport running for it through the second's credential [[git-host-5](#git-host-5)] [[git-host-9](#git-host-9)].

#### git-host-26

When an integration suite starts a real core against two stand-in instances on separate Git backends [[git-host-12](#git-host-12)], with a project's spex repository at the first, it shall assert that each placement is served by its own instance:

- a Place creating in a group of the second asks the second alone, records its remote named by the second's folder with the id in that remote's section, prepares its branch and pushes with a credential the second issued, and a Place joining a repository the second lists asks the first nothing [[git-host-6](#git-host-6)] [[git-host-7](#git-host-7)] [[git-host-9](#git-host-9)];
- a creation the second answers pending, and one whose README it holds back, wait on that placement alone while the first syncs, the clone recording the creation in that remote's section until the second's default branch exists, and a refusal of the default-branch push stopping that placement alone in the second's words [[git-host-6](#git-host-6)] [[git-host-7](#git-host-7)];
- a Sync's Check reads each instance's catalog at its placement's turn, a failed read of the second stopping its placement alone, and a first-notice read failing at the second leaving the first's sync admitted [[git-host-22](#git-host-22)];
- members are read from, a member added to and removed from, and the repository moved at the instance of the placement each command names [[git-host-8](#git-host-8)] [[git-host-16](#git-host-16)] [[git-host-17](#git-host-17)] [[git-host-20](#git-host-20)];
- a credential the second refuses to a transport signs the second out alone, its placement unreachable and the first's syncing [[git-host-4](#git-host-4)] [[git-host-9](#git-host-9)];
- a repository the second lists that a placement file names is held as that clone's placement not on this device, offering no Join, and one both of two instances over one Git backend list is one placement [[git-host-5](#git-host-5)].

#### git-host-28

Where the core runs as a seat against the stand-in instance and the Git HTTP host, the test suite shall assert that the device request carries the server and the person, that a denied code and a person of another id each end the sign-in `failed` storing nothing [[git-host-27](#git-host-27)], and that a transport to the Git HTTP host takes the app's helper with the token the member placed for it and none without one [[git-host-9](#git-host-9)].

#### git-host-30

Where the stand-in instance answers the servers listing and the ticket route, the test suite shall assert that each call carries that instance's app token, that the listing and the ticket are returned as answered and held nowhere, and that a `host_refused`, a `not_found` and a `429` are relayed as [[git-host-11](#git-host-11)] states [[git-host-29](#git-host-29)].

## References

[1]: https://github.com/sublang-ai/spex.space/blob/main/specs/packages/host.md "Spex Space host package"
