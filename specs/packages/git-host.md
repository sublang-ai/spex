<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# git-host: The Git Host Client

## Intent

This package defines how the core talks to the Git host under [DR-103](../decisions/103-the-home-and-its-groups.md): signing a person in as a public client, keeping the app token, reading groups and spex repositories, creating one, preparing its `spex` branch, reading members, renaming and deleting a group and moving a spex repository, waiting out the host's rate limit, handing Git a credential through a helper, and the stand-in host the test suites run against.
The **Git host** is spex.pub, which brokers the Git credential and wraps the Git system behind it; its routes are JSON under `/api/v1` and its sign-in pages under `/login`, as spex.pub's own specs state [[1]].
An **app token** is the credential the host issues to one signed-in device: a short-lived access secret and a rotating refresh secret [[storage-19](storage.md#storage-19)].
The core reads the host only when a person signs in, activates Refresh, or starts a sync, and once when a client first asks for the Groups state after a signed-in start, never on a timer, and derives nothing from a cached list.

## External Behavior

### Sign-In

#### git-host-1

When the core creates `home.yaml` [[storage-2](storage.md#storage-2)], it shall record the Git host as `https://spex.pub` with the client id `spex`, taking a nonempty `SPEX_HOST_URL` environment variable as the URL instead at that one moment, and shall thereafter use the recorded host alone:

- the URL is read from `home.yaml` on every start; the variable changes an existing home's host never.

#### git-host-2

When a client sends `space.signin.start` on the desktop, the core shall sign in through the browser flow with PKCE ([DR-103](../decisions/103-the-home-and-its-groups.md)):

1. listen on `127.0.0.1` at a port the operating system assigns, for one callback;
2. mint a 32-byte verifier and its S256 challenge;
3. reply with the host's `/login/app` URL carrying `client_id=spex`, a label naming this device and app, the loopback `redirect_uri`, the challenge with `code_challenge_method=S256`, and a random `state`, which the shell opens in the system browser [[app-shell-37](app-shell.md#app-shell-37)];
4. on the callback, check `state`, exchange the `code` with the verifier at the host's token endpoint, read the person [[git-host-5](git-host.md#git-host-5)] with the issued access secret, then, in one step with the sign-in's end, store the app token in place of the pair that stood when the sign-in began [[storage-19](storage.md#storage-19)], write the account into `home.yaml`, and answer the browser with a page saying the sign-in is complete and the browser may be closed;
5. set the home up for the account [[space-4](space.md#space-4)].

- a callback carrying `error=access_denied`, a wrong `state`, a refused exchange, or a person the host does not return ends the sign-in `failed` with its cause and stores nothing; ten minutes without a callback, or `space.signin.cancel`, ends it `expired` or `stopped` and closes the listener;
- a sign-in that ends before its token is stored stores nothing, and one that finds its starting pair changed or removed ends `stopped`, storing nothing;
- at most one sign-in runs at a time; a second start is `busy`.

#### git-host-3

When a client sends `space.signin.start` on the server shell, the core shall sign in through the device flow ([DR-103](../decisions/103-the-home-and-its-groups.md)):

1. send `client_id=spex` and the device label to the host's device endpoint and reply with the user code, the verification URL — the one completed with the user code where the host returned it, else the plain one — and the expiry it returned;
2. poll the host's token endpoint at the interval it named, backing off when told to slow down, until the app token arrives, the person denies, or the code expires;
3. on the token, continue as the browser flow does from its fourth step.

- a denial ends the sign-in `failed` with `denied`, an expiry with `expired`, and `space.signin.cancel` stops the polling; nothing is stored until the token arrives and the person is read.

#### git-host-4

While the home holds an app token, when a call to the host is made, the core shall present the access secret as a bearer credential and keep the token current:

- an access secret within a minute of expiring, or one the host answers `token_expired` to, is refreshed first through the refresh secret, one refresh at a time, the new pair stored in place of the refreshed one before any further call [[storage-19](storage.md#storage-19)]; a call refused `token_expired` is retried once after the refresh;
- a refresh the host refuses, or a call the host answers `invalid_token`, `token_revoked` or `reauth_required` to, signs the device out of the home: the credential is removed, the account kept in `home.yaml` marked signed out, the Groups state reporting the sign-out as the host's with that account's login [[space-3](space.md#space-3)], held for the core's run alone, and every spex repository with a remote turns unreachable with "Sign in again" [[space-61](space.md#space-61)], until the next sign-in;
- a refresh or a refusal answers the pair its request presented: the credential's removal and the sign-out are one step, and where that pair is no longer the stored one, by a sign-in, a refresh or a sign-out meanwhile [[storage-19](storage.md#storage-19)], nothing is stored or removed, the device is not signed out, and the call is refused as changed meanwhile, to be made again;
- `rate_limited` is reported with the host's retry time, `provider_unavailable` and a network failure as unreachable, and a `host_refused` with the host's words [[git-host-11](git-host.md#git-host-11)].

### Reads and Writes

#### git-host-5

When the home is signed in and a read of the host is due — at sign-in, on Refresh, and at the first `space.get` after the core started signed in with no full-view read begun since — the core shall read, in one pass, the host's description with the roles it grants [[git-host-16](#git-host-16)], the person with whether they may create a group, every group with whether the person may create a subgroup in it, manage its members, rename it and delete it, and every spex repository the host lists across its pages with whether the person may manage its members and move it to another group, and shall hold the answer as the home's current view until the next read ([DR-103](../decisions/103-the-home-and-its-groups.md), [DR-114](../decisions/114-groups-and-sharing-from-spex.md), [DR-120](../decisions/120-the-instance-is-the-space.md), [DR-122](../decisions/122-a-sync-reads-its-destination.md)):

- every path the host answers is taken as given, a path in the instance, and the view holds no URL but each repository's remote, which the core hands to Git alone ([DR-120](../decisions/120-the-instance-is-the-space.md));
- your own group is the listed group of kind `user` under the account's login; a listed spex repository's key is its group's path joined to its own [[storage-1](storage.md#storage-1)], none where that group is held as colliding — one of kind `group` whose path equals, ignoring case, your own group's folder name or the login of another account under which the host lists a spex repository, or lies beneath it ([DR-120](../decisions/120-the-instance-is-the-space.md));
- a listed spex repository is matched to a clone by the id stored in the clone's Git configuration, else by the remote URL, never by name alone;
- a clone whose id the host no longer lists is marked unreachable with the cause, its files untouched;
- a spex repository the core attaches a clone to, after creating it [[git-host-6](#git-host-6)] or from the view's own listing, and a group the core creates [[git-host-15](#git-host-15)], count as listed — each as that answer gave it, a created repository without its `spex` branch — until a read begun after the attachment or the creation is held, and a read begun before either is made again before it is held;
- a group the core renames or deletes and a spex repository it moves [[git-host-18](#git-host-18)] [[git-host-19](#git-host-19)] [[git-host-20](#git-host-20)] stand as the host's answer left them — renamed, with every group and spex repository inside it under its new path; gone; or in its new group — until a read begun after the change is held, and a read begun before the change is made again before it is held;
- the host's `project.json` for each listed repository is kept for the pickers [[space-58](space.md#space-58)], and its archived flag and the account's role, as the host reports them, decide read-only [[space-61](space.md#space-61)];
- each listed repository is held with its members' count, the account among them, and one whose members the host fails to read — by any answer but one that signs the device out [[git-host-4](#git-host-4)] — with none, that failure failing nothing else, while any other failure fails the whole read;
- the read due at the first `space.get` is begun once, however many clients ask, and that reply answers the state as it stands, never waiting for the read, whose outcome the core announces as any host read's [[space-2](space.md#space-2)];
- a full read, including the surrounding account setup accepted by Refresh, publishes its running state until all its tracked work settles and then its success or failure through the public Groups state [[space-1](space.md#space-1)], separately from sign-in and the last complete view's time; a failed catalog read retains that view and time and reports the existing sanitized host message even where no remote-backed row exists; a setup failure is also reported through this lifecycle without discarding a completed catalog view, using the existing host message for classified host errors and a translated generic Refresh failure for unexpected local errors; sign-out clears the read lifecycle;
- repeated Refresh joins the existing full read for the same signed-in account generation; work accepted after a sign-out or new sign-in waits for older owned work to settle and then performs the current account's setup/read, whose lifecycle an older completion cannot clear; a selected destination read [[git-host-22](#git-host-22)] neither starts nor clears the full-read lifecycle, and retains its newer-target authority.

#### git-host-22

When a sync checks a repository, or needs its first-sharing notice, the core shall read a fresh complete catalog — the host's description, person, every group and every repository across its pages — and only the matched repository's detail, branch, read-only state and members, independently of any full-view read [[git-host-5](#git-host-5)] ([DR-122](../decisions/122-a-sync-reads-its-destination.md)):

- matching uses the clone's recorded id, else its exact remote URL, and collision detection uses every user namespace in the catalog as well as your own folder and the account's login, by the full-view rules [[git-host-5](#git-host-5)];
- a failed first-notice read refuses admission with its cause and starts no sync; the catalog or target failing at Check stops it with that cause, an unmatched target being no longer shared; a members failure alone leaves its count unknown, except an answer that signs the device out or finds its credential pair replaced [[git-host-4](#git-host-4)], and an unknown count requires the first-sharing notice [[space-57](space.md#space-57)];
- the target's latest answer governs its row, path, abilities and read-only state, without advancing the whole view's read time or refreshing unrelated rows; a full read begun before it cannot replace that authority on success or failure, while a full read begun after it supersedes it;
- a creation, attachment, rename, deletion or move made by this core while a catalog read is in flight is reconciled by reading again before using that answer, as for a full read [[git-host-5](#git-host-5)];
- Check rechecks the first-notice condition against its fresh membership before any branch or Git transport effect: a count that changed from the account alone to shared or unknown stops there with the sharing-notice phrase, leaves acknowledgement unset and offers the usual notice on the next Sync, while existing explicit setup and pick authorization stands;
- a successful target answer crossing a core sign-out or sign-in is refused as sign-in changed meanwhile, stores no target authority and permits no path or remote update from that answer;
- following a move and updating the remote retain their unchanged-clone guards [[space-60](space.md#space-60)], and sign-out or a changed credential retains its refusal [[git-host-4](#git-host-4)].

#### git-host-6

When the core creates a spex repository in a group — for a pick [[space-58](space.md#space-58)] or a group's first session [[space-65](space.md#space-65)] — it shall ask the host to create `<name>-spex` there, private, with a description naming it as the project's or the group's records and, for a project, where its code lives, and shall act on the answer:

| Answer | The core |
| --- | --- |
| created | records the repository's id and remote URL in the clone's Git configuration, prepares the branch [[git-host-7](git-host.md#git-host-7)], and pushes `spex` |
| pending, with the host's words | leaves the clone local only and reports the step as waiting with those words [[space-64](space.md#space-64)] |
| name taken | reports the name taken so the reader is asked for another [[space-58](space.md#space-58)] |

- a group of the instance is named to the host by its id, and your own group by none, never by its id, which names no group of the instance there;
- a pick naming a group the home's current view does not list as a group of the instance — your own group's id among them — is refused `not_found` before the host is asked;
- a `<name>` is the working folder's name, or the group's, lower-cased to kebab-case where it is not one already, and never edited beyond that without the reader.

#### git-host-7

Before the first push of `spex` into a spex repository, the core shall ask the host to prepare the branch, and shall push only on `ready`:

- `pending`, with the host's words, is reported as waiting on the repository's row [[space-64](space.md#space-64)] and asked again before the next sync;
- a repository the host reports empty is pushed only after the host's default branch exists, so `spex` never becomes the default branch; the core asks again on the next sync until it does;
- a sync whose clone records the core's creation of the repository [[git-host-6](#git-host-6)] — `spex.created` in its Git configuration, unset by the first check that finds the host's default branch or has pushed it, and kept by a check that stops before then — the core stopping, the host not answering, the push refused — or that finds the empty repository read-only, so the next sync, and a restarted core, owe the branch still and try again — finding it empty, reads it again every 2 s, five times at most, since the host may answer a creation before committing its default branch, and, finding it empty still, pushes that branch itself — `main`, one commit holding the README the host would have written, titled with the repository's name — before preparing the branch, a refusal of that push stopping the sync in the host's words [[space-15](space.md#space-15)].

#### git-host-8

When a client sends `space.members` for a reachable spex repository or for a group the view lists, the core shall read its members from the host and reply with each member's id, login, display name, the host's own role name, whether the membership is that repository's or group's own and, where not, the path in the instance of the group it comes through, as the host answers them, holding nothing of it after the reply ([DR-114](../decisions/114-groups-and-sharing-from-spex.md)) ([DR-120](../decisions/120-the-instance-is-the-space.md)).

#### git-host-15

When a client sends `space.group.create` [[space-68](space.md#space-68)], the core shall ask the host to create the group — named as the reader typed, at the path the reader gave, private, inside the named group or at the instance's root — and shall act on the answer ([DR-114](../decisions/114-groups-and-sharing-from-spex.md)):

| Answer | The core |
| --- | --- |
| created | holds the group as listed, as the host answered it with what the person may do there [[git-host-5](#git-host-5)], beginning no read of its own; announces the state carrying it; then replies with the group's id, full path and name |
| name taken | refuses `invalid_request` saying the name is taken there |
| `host_refused` | refuses `invalid_request` with the host's words |

- a blank name or path is refused `invalid_request` before the host is asked, and a parent the home's current view does not list `not_found`;
- the host is asked whatever the view said the person may do there: its refusal is the answer.

#### git-host-16

When a client sends `space.share` [[space-69](space.md#space-69)], the core shall ask the host to add the account of that login to the named group or spex repository at the named role, and shall reply with the members as the host lists them after the addition [[git-host-8](#git-host-8)] ([DR-114](../decisions/114-groups-and-sharing-from-spex.md)):

- the roles are the host's own, as its description lists them in the current view [[git-host-5](#git-host-5)], each with the host's name and whether it may push; a role not among them, or a blank login, is refused `invalid_request` before the host is asked, and whatever the view said the person may do, the host is asked and its refusal is the answer;
- `not_found` answering the addition is relayed `not_found` with the host's words, which name the login, and `host_refused` — the person's rights, the account already a member — `invalid_request` with the host's words;
- a group or spex repository the view does not list is refused `not_found` before the host is asked.

#### git-host-17

When a client sends `space.unshare` [[space-72](space.md#space-72)], the core shall ask the host to remove the account of that login from the named group's or spex repository's own members and shall reply with the members as the host lists them afterwards [[git-host-8](#git-host-8)] ([DR-114](../decisions/114-groups-and-sharing-from-spex.md)):

- a blank login is refused `invalid_request` before the host is asked, and a group or spex repository the view does not list `not_found`;
- `not_found` answering the removal — no account under the login, or no membership of its own there — is relayed `not_found` with the host's words, and `host_refused` — the person's rights, the host keeping its last owner — `invalid_request` with the host's words;
- whatever the view said the person may do, the host is asked and its refusal is the answer.

#### git-host-18

When a client sends `space.group.rename` [[space-76](space.md#space-76)], the core shall ask the host to give the named group of the instance the name, the path segment, or both, that the command carries, and shall act on the answer ([DR-120](../decisions/120-the-instance-is-the-space.md)):

| Answer | The core |
| --- | --- |
| renamed | holds the group as the host answered it [[git-host-5](#git-host-5)], beginning no read of its own; announces the state carrying it; then replies with the group's id, full path and name |
| name taken | refuses `invalid_request` saying the path is taken there |
| `not_found` | refuses `not_found` with the host's words |
| any other | refuses `invalid_request` as [[git-host-11](#git-host-11)] relays it |

- neither a name nor a path, a blank name or a blank path is refused `invalid_request` before the host is asked, and a group the home's current view does not list as a group of the instance — your own group among them — `not_found`;
- the host is asked whatever the view said the person may do there: its refusal is the answer.

#### git-host-19

When a client sends `space.group.delete` [[space-77](space.md#space-77)], the core shall ask the host to delete the named group of the instance and shall act on the answer ([DR-120](../decisions/120-the-instance-is-the-space.md)):

| Answer | The core |
| --- | --- |
| deleted | holds the group as gone [[git-host-5](#git-host-5)], beginning no read of its own; announces the state without it; then replies |
| `not_found` | refuses `not_found` with the host's words |
| any other | refuses `invalid_request` as [[git-host-11](#git-host-11)] relays it |

- a group under which the home's current view lists a spex repository or a group is refused `invalid_request` before the host is asked, since the host deletes whatever a group holds with it;
- a group the view does not list as a group of the instance — your own group among them — is refused `not_found` before the host is asked;
- the host is asked whatever the view said the person may do there: its refusal is the answer.

#### git-host-20

When a client sends `space.repository.move` [[space-78](space.md#space-78)], the core shall ask the host to move the named spex repository into the named group of the instance, or into the person's own group where the command names none, and shall act on the answer ([DR-120](../decisions/120-the-instance-is-the-space.md)):

| Answer | The core |
| --- | --- |
| moved | holds the repository as the host answered it, in its new group [[git-host-5](#git-host-5)], beginning no read and moving no clone of its own; announces the state carrying it; then replies with its id and its path in the instance |
| name taken | refuses `invalid_request` saying the name is taken in that group |
| `not_found` | refuses `not_found` with the host's words |
| any other | refuses `invalid_request` as [[git-host-11](#git-host-11)] relays it |

- the repository is named by its key: a clone on this device alone is refused `invalid_request`, and a repository the view does not list `not_found`, before the host is asked;
- a group of the instance the view does not list is refused `not_found`, and one held as colliding [[git-host-5](#git-host-5)] `invalid_request` with that cause, before the host is asked;
- the host is asked whatever the view said the person may do on it: its refusal is the answer.

#### git-host-9

When the core runs a Git transport — clone, fetch, push or `ls-remote` — against the Git host's origin, it shall ask the host for a credential first and hand it to Git through a credential helper, never through the remote URL ([DR-103](../decisions/103-the-home-and-its-groups.md)):

- the credential — the username and the secret the host returned, with its expiry — is written to a file with owner-only permissions in a temporary directory, which is removed when the Git child ends;
- Git runs with `-c credential.helper=` naming the app's own helper script on the app's own runtime, which answers Git's `get` with that username and password and ignores `store` and `erase`; a transport to any other origin names no helper and uses the device's own;
- the host refusing the credential signs the device out [[git-host-4](git-host.md#git-host-4)] and stops the transport before Git runs.

#### git-host-10

When a client sends `space.signout`, the core shall revoke this device at the host with its app token, then, in one step, remove that pair [[storage-19](storage.md#storage-19)] and mark the account signed out in `home.yaml`, keeping every clone and record:

- a host that cannot be reached is tried once; the credential is removed either way;
- where another pair was stored in its place meanwhile, by a sign-in or a refresh, nothing is removed, the account stays signed in, and the sign-out is refused `conflict` as changed meanwhile, to be sent again;
- where this host's stored entry is malformed, nothing is revoked, and that entry is removed and the account signed out, unless a well-formed pair is stored there by then, which stays as above; a credentials file of another format is left as it is and the sign-out refused [[storage-19](storage.md#storage-19)].

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

When the host answers a call 429, the core shall hold the instant that answer asks it to wait until — the answer's time plus its seconds [[git-host-11](#git-host-11)] — sending each call that waits only once that instant has passed and refusing every other call made before it at once, as the host asking to wait the seconds that remain [[git-host-11](#git-host-11)]:

- the calls that wait are a sync step's, whose Stop ends that wait unsent and stops the step [[space-16](space.md#space-16)], and the host read's [[git-host-5](#git-host-5)];
- the hold is 120 seconds at most and none where the answer's seconds are unknown, and an instant already held stands where it is the later.

## Internal Behavior

#### git-host-12

The core package shall ship a stand-in Git host for its own tests and the browser journeys ([DR-039](../decisions/039-browser-acceptance-journeys.md)): an in-process HTTP server that implements the host's sign-in and host routes over a directory of bare Git repositories, serves their Git transport over HTTP, and exposes a scripting interface:

- sign-in: `/login/app` and `/login/device` pages, the device endpoint returning the verification URL completed with the user code as spex.pub does, and the token endpoint issuing app tokens, with scripted approval, denial and expiry; access secrets that expire on demand; revocation;
- host routes: the next host requests answered 429 `rate_limited` with a scripted `Retry-After` or none, 503 `provider_unavailable`, or 403 `host_refused` with scripted words; the description, whose `groups` says whether root groups can be made as the person's `can_create_group` does, and the person, who may create a group unless scripted otherwise; groups by their paths in the instance, with no group of the stand-in's own, the roles and spex repositories from a scripted fixture, one among them in another account's own group; the listing answered after a scripted sleep with what stood at its arrival; creation of a bare repository with a README on `main`, which a scripted hold keeps out of its first reads or until a push lands, in a group of the instance named by its id or in the person's own group where none is named, any other id — the person's own group's among them — answered `not_found` as spex.pub answers it, and each creation's body recorded; creation of a group at the root, holding the person and a scripted service identity as its Owners, or under a listed parent, with a scripted taken name, a root path equal to a known account's login answered `name_taken` unless scripted to admit it, a scripted refusal and a scripted lag leaving the groups it creates out of its listing; a repository's and a group's members with their source, the service identity never among them, counted or named as a source, and a scripted `provider_unavailable` answering every read, addition and removal of members while every other route answers, as spex.pub answers while its service identity's read fails; the addition of a member by login with scripted unknown logins and refusals, the removal of a member with a scripted refusal; the rename of a group of the instance, carrying the groups and repositories inside it to its new path, its deletion with everything inside it, and the move of a spex repository into a group of the instance or the person's own, each refused where what the person may do there says not, a path or name taken there answered `name_taken` — a root group's new path equal to a known account's login among them unless scripted to admit it, as at creation — with a scripted refusal of each; what the person may do per group — create a subgroup, manage its members, rename it, delete it — and per repository — manage its members, move it; branch preparation with a scripted refusal; the credential for its own origin; and no page URL in any answer ([DR-120](../decisions/120-the-instance-is-the-space.md));
- Git transport: every repository served over HTTP through Git's own backend at `<origin>/<login>/<name>-spex.git` in an account's own group and at `<origin>/<storage>/<group>/<name>-spex.git` in a group of the instance, `<storage>` a group no answer names, as a deployment's container, accepting the credentials the stand-in issued and refusing others with 401, with a scripted sleep, a scripted refusal in words that may carry URLs under its origin, a scripted answer of 500, a scripted refusal of a push to `main` alone in its words and a scripted archive, an empty repository taking the first branch pushed into it as its default;
- a scripted rename, transfer, archive and membership removal, each visible on the next read.

## Verification

#### git-host-13

When an integration suite starts a real core on a scratch home against the stand-in [[git-host-12](#git-host-12)], it shall assert the sign-in flows over the protocol:

- a new home records the stand-in's URL from `SPEX_HOST_URL`, and a later start with the variable changed keeps the recorded one [[git-host-1](#git-host-1)];
- the browser flow's URL names the loopback redirect, an S256 challenge and `client_id=spex`; completing it at the stand-in stores the app token with owner-only permissions and the account in `home.yaml`, and the callback page says the browser may be closed [[git-host-2](#git-host-2)];
- a callback with a wrong `state`, one carrying `access_denied`, a refused exchange, a cancel and a test-shortened expiry each end the sign-in with its cause and store nothing; a second start during a flow is `busy` [[git-host-2](#git-host-2)];
- with the person read held after the exchange, a cancel in the browser flow and in the device flow ends the sign-in `stopped` with nothing stored once the read answers, and a pair stored meanwhile ends it `stopped`, that pair and another host's kept [[git-host-2](#git-host-2)] [[git-host-3](#git-host-3)];
- with the person read failing after the exchange, the browser flow and the device flow each end the sign-in `failed` with nothing stored [[git-host-2](#git-host-2)] [[git-host-3](#git-host-3)];
- the device flow replies with the stand-in's user code and its verification URL completed with that code, polls at its interval, backs off on slow down, and completes on approval; a denial and an expiry end it with their causes [[git-host-3](#git-host-3)];
- an access secret the stand-in expires is refreshed once before the next call, two concurrent calls refresh once, and a refresh the stand-in refuses, or a device it revoked, signs the device out with every remote repository unreachable and the state reporting the host's sign-out with the account's login until the next sign-in, which clears it [[git-host-4](#git-host-4)];
- with a refresh's answer, granted or refused, or a revoked pair's refusal held while another pair is stored, the answer stores and removes nothing and signs nothing out, and the call is refused as changed meanwhile, another host's pair kept; a core whose held read was refused for the former pair keeps its account signed in [[git-host-4](#git-host-4)];
- sign-out revokes the device at the stand-in and removes the credential, and a stand-in that cannot be reached still leaves the home signed out [[git-host-10](#git-host-10)];
- a sign-out over a malformed entry for the stand-in removes it and marks the account signed out, another host's pair kept; one whose failed read is followed by a well-formed pair stored there keeps that pair, marks nothing and is refused as changed; one over a file of another format leaves it byte for byte and marks nothing [[git-host-10](#git-host-10)];
- a core's sign-out whose revocation is held while a new sign-in stores its pair is refused `conflict`, the new pair and the account signed in kept; one whose removal is followed, before the sign-out's own continuation, by a new sign-in storing its pair and account leaves that account signed in [[git-host-10](#git-host-10)].

#### git-host-14

When an integration suite drives host reads and writes against the stand-in [[git-host-12](#git-host-12)], it shall assert:

- a read lists every group and every spex repository across two pages, matches clones by id and then by remote, marks a clone the stand-in stopped listing unreachable with its files intact, and keeps the previous view with its time when the stand-in answers 503 [[git-host-5](#git-host-5)];
- a core restarted on a signed-in home answers its first `space.get` with no read time and begins one read of the stand-in however many `space.get` follow, its state announced with a read time [[git-host-5](#git-host-5)];
- creating a spex repository records its id and remote in the clone's Git configuration, prepares the branch and pushes; a pending answer leaves the clone local only with the words; a taken name is reported as such [[git-host-6](#git-host-6)] [[git-host-7](#git-host-7)];
- your own group's spex repository created at sign-in and a pick creating in your own group name no group to the stand-in, a pick naming your own group's id is refused `not_found` before any request reaches it, and the stand-in answers a creation naming that id `not_found` [[git-host-6](#git-host-6)] [[git-host-12](#git-host-12)];
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
- a group of the instance is renamed — its name and its path, every group and spex repository inside it then standing under the new path — and an empty one deleted, and a spex repository is moved into a group and into the person's own group, each standing in a state broadcast before its reply with no read of the stand-in begun, until a read held after it lists the stand-in's answer [[git-host-18](#git-host-18)] [[git-host-19](#git-host-19)] [[git-host-20](#git-host-20)] [[git-host-5](#git-host-5)];
- a taken path — a known account's login at the root among them — and a taken name are refused as taken, a refusal the stand-in scripts for each of the three, and the stand-in's own refusal of what it says the person may not do, with its words kept whole in English and in Chinese; neither a name nor a path, a blank one, a group holding a spex repository or a group, a group held as colliding, your own group, and a group or spex repository the view does not list are refused before any request reaches the stand-in [[git-host-18](#git-host-18)] [[git-host-19](#git-host-19)] [[git-host-20](#git-host-20)];
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
- a target-only read before the first Groups request after a signed-in restart leaves that request's nonblocking full read due;
- a failed first-notice read admits no later healthy Check or push, and membership changing from solo to shared at Check stops before transport without acknowledgement;
- a held successful target answer released after sign-out or another account's sign-in stops as changed meanwhile, repopulates no target authority and changes no clone path or remote.

## References

[1]: https://github.com/sublang-ai/spex-pub/blob/main/specs/packages/host.md "spex.pub host package"
