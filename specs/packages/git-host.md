<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# git-host: The Git Host Client

## Intent

This package defines Space account sign-in, personal project discovery, placement creation and authenticated Git transport ([DR-246](../decisions/246-remove-groups-and-team-servers-from-the-clients.md)).
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
- a URL the origin rule refuses [[storage-2](storage.md#storage-2)] is refused `invalid_request` with the one phrase core-service names [[core-service-145](core-service.md#core-service-145)] before anything listens, storing nothing;
- at most one sign-in runs at a time, whichever instance it names; a second start is `busy`.

#### git-host-3

When a client sends `space.signin.start` on the server shell naming an instance's URL as `url`, the core shall sign in at that instance, by its origin [[storage-2](storage.md#storage-2)], through the device flow ([DR-103](../decisions/103-the-home-and-its-groups.md), [DR-127](../decisions/127-a-home-signed-in-to-several-instances.md)):

1. send `client_id=spex` and the device label to that instance's device endpoint and reply with the user code, the verification URL — the one completed with the user code where the instance returned it, else the plain one — the expiry it returned and, as `interval`, the seconds between polls it named;
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

When a signed-in Space is first read after startup, refreshed or read at sign-in, the core shall hold a complete current view of the account and its own project repositories, traversing all catalog pages and accepting only repositories the Space identifies as belonging to the signed-in account's own namespace ([DR-246](../decisions/246-remove-groups-and-team-servers-from-the-clients.md)):

- the Space description supplies its display name for the home entry [[storage-2](storage.md#storage-2)] and its reported Git origin for transport alone;
- repository identity uses the Git origin and stable repository id or matching remote URL, with a named instance and id used for a recorded placement not present on this device [[storage-36](storage.md#storage-36)]; names alone do not match;
- the signed-in Space that owns a placement governs its state; while signed out, the first signed-in Space listing that same repository in its own account's namespace can govern it on the next sync [[space-60](space.md#space-60)];
- the core treats a repository the Space no longer lists as personal as unavailable, preserving local records;
- the first read is started once per account generation, and concurrent Refreshes join an ongoing full read for that generation;
- a failed full read retains the last completed view and reports its sanitized cause without advancing the last-read time; completed pages and details are retained during a rate-limit retry [[git-host-21](#git-host-21)];
- an answer started before a completed attachment must be read again before replacing that instance's authority; a full read older than a targeted read does not overwrite the target [[git-host-22](#git-host-22)].

#### git-host-22

When sync checks a Space placement, the core shall independently re-read that Space's current account, complete catalog and matched target's repository details before fetching or writing, and refuse the destination unless the fresh result matches the placement's identity [[git-host-5](#git-host-5)] and identifies the repository in the signed-in account's own namespace ([DR-246](../decisions/246-remove-groups-and-team-servers-from-the-clients.md)):

- a target answer governs the repository's path, branch and access without advancing the full-view read time;
- a changed account or credential [[git-host-4](#git-host-4)] refuses the step and prevents a stale result from being published;
- a valid move within the personal namespace follows the clone's unchanged-path guards [[space-60](space.md#space-60)].

#### git-host-6

When the core creates a project placement [[space-97](space.md#space-97)] or a global records placement [[space-65](space.md#space-65)], it shall request a private `<name>-spex` repository in the signed-in account’s own namespace, using the working folder's name normalized to lowercase kebab-case unless the reader supplies another, or the personal records folder’s name for the global repository [[space-59](space.md#space-59)]:

- a creation records its remote and stable id [[storage-34](storage.md#storage-34)] and prepares its branch before the first push [[git-host-7](#git-host-7)];
- a pending or refused creation leaves the clone without that placement and reports the step's outcome [[space-64](space.md#space-64)];
- a name conflict reports that name without changing the clone.

#### git-host-7

Before the first push of `spex` into a placement, the core shall ask its instance to prepare the branch, and shall push only on `ready` ([DR-127](../decisions/127-a-home-signed-in-to-several-instances.md), [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

- `pending`, with the host's words, is reported as waiting on the repository's row [[space-64](space.md#space-64)] and asked again before the next sync;
- a repository the host reports empty is pushed only after the host's default branch exists, so `spex` never becomes the default branch; the core asks again on the next sync until it does;
- a sync whose placement records the core's creation of its repository [[git-host-6](#git-host-6)] — `remote.<folder>.spexCreated` in the clone's Git configuration, unset by the first check of that placement that finds the host's default branch or has pushed it, and kept by a check that stops before then — the core stopping, the host not answering, the push refused — or that finds the empty repository read-only, so the next sync, and a restarted core, owe the branch still and try again — finding it empty, reads it again every 2 s, five times at most, since the host may answer a creation before committing its default branch, and, finding it empty still, pushes that branch itself — `main`, one commit holding the README the host would have written, titled with the repository's name — before preparing the branch, a refusal of that push stopping that placement in the host's words [[space-15](space.md#space-15)].

#### git-host-9

When the core runs a Git transport — clone, fetch, push or `ls-remote`, including a fetch of LFS objects — on behalf of an instance at that instance's Git origin [[git-host-5](#git-host-5)], it shall ask that instance for a credential first and hand it to Git through a credential helper, never through the remote URL ([DR-103](../decisions/103-the-home-and-its-groups.md), [DR-127](../decisions/127-a-home-signed-in-to-several-instances.md), [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

- a placement's transport is on behalf of the instance its remote is named by [[storage-34](storage.md#storage-34)], or of the instance it is joined, created or attached at, never of one chosen by the Git origin alone, so a placement whose instance is signed out is fetched through no other instance sharing that Git origin until it follows one [[space-60](space.md#space-60)]; a project's code and a Git source are on behalf of the instance their own rules name [[projects-37](projects.md#projects-37)] [[environments-13](environments.md#environments-13)];
- the credential — the username and the secret the instance returned, with its expiry — is written with its permitted HTTP(S) origin to a file with owner-only permissions in a temporary directory, which is removed when the Git child ends; the helper answers only requests at that normalized scheme, host and port, including requests made through a configured LFS endpoint;
- Git runs with `-c credential.helper=` naming the app's own helper script on the app's own runtime, a line Git runs with its `sh` on every platform, Windows included, each path in it one word in single quotes so that any path holding no line break or NUL runs as it is — but for a helper's path holding a backslash outside Windows, from which the runtime loads no module — and the script answers Git's `get` with that username and password and ignores `store` and `erase`; a transport on behalf of no instance — a remote the reader named, any other origin — names no helper and uses the device's own;
- the instance refusing the credential signs the device out of it alone [[git-host-4](git-host.md#git-host-4)] and stops the transport before Git runs.

#### git-host-10

When a client sends `space.signout` naming a signed-in instance, the core shall revoke this device at that instance with its app token, then, in one step, remove that pair [[storage-19](storage.md#storage-19)] and mark that instance's entry signed out in `home.yaml`, keeping the entry, every clone and record, and every other instance's sign-in ([DR-127](../decisions/127-a-home-signed-in-to-several-instances.md)):

- an instance that cannot be reached is tried once; the credential is removed either way;
- where another pair was stored for that origin in its place meanwhile, by a sign-in or a refresh, nothing is removed, the instance stays signed in, and the sign-out is refused `conflict` as changed meanwhile, to be sent again;
- where that origin's entry in the credentials file is malformed, nothing is revoked, and that credentials entry is removed and the instance signed out, unless a well-formed pair is stored there by then, which stays as above; a credentials file of another format is left as it is and the sign-out refused [[storage-19](storage.md#storage-19)].

#### git-host-11


| Answer | Relayed as |
| --- | --- |
| `pending` | waiting, with the words, on the step's row |
| `name_taken` | the name is taken |
| `host_refused` | refused, with the words |
| `rate_limited` | the host asks to wait N seconds — its `Retry-After`'s number, or the seconds until its HTTP date, none below zero — or a moment, where it gives neither |
| `reauth_required`, `token_revoked`, `invalid_token` | sign in again |
| `provider_unavailable`, no answer | the host could not be reached |

#### git-host-21

When an instance answers a call 429, the core shall hold, for that instance alone, the instant that answer asks it to wait until — the answer's time plus its seconds [[git-host-11](#git-host-11)] — sending each call to it that waits only once that instant has passed and refusing every other call to it made before then at once, as the instance asking to wait the seconds that remain [[git-host-11](#git-host-11)] ([DR-127](../decisions/127-a-home-signed-in-to-several-instances.md)):

- the calls that wait are a sync step's, whose Stop ends that wait unsent and stops the step [[space-16](space.md#space-16)], and the host read's [[git-host-5](#git-host-5)];
- the hold is 120 seconds at most and none where the answer's seconds are unknown, and an instant already held stands where it is the later.
- only a full read's authenticated person, repository-page and repository-detail GET may replay after an actual 429 whose parsed `Retry-After` is positive and fits its remaining recovery time: a fixed 120-second deadline from that request's first 429, never extended by later answers; every replay waits out the shared hold and any extension within that deadline, and its transport is bounded by the remaining time;
- deadline expiry reports the latest actual 429, including while a shared hold extends past it; ordinary transport failure, caller cancellation, credential replacement and an intervening non-429 failure retain their own outcomes, and a shared hold may outlive this request;
- an aborted wait or a credential replaced meanwhile sends no retry, and the existing single token-expired refresh [[git-host-4](#git-host-4)] spans the whole recovery;
- public description, selected-destination reads, writes and token requests gain no rate-limit retry, nor does an answer with absent, invalid, zero or over-budget retry time.

### Registry purpose

#### git-host-31

The shared sign-in client shall bind each authorization, device, token, refresh and revoke request to its `registry` or `space` scope, defaulting an omitted client scope to `space`, and keep credentials independently by canonical origin and purpose, treating legacy origin-only entries solely as Space credentials ([DR-168](../decisions/168-independent-package-registry.md)):

- registry sign-in reads its account through the registry account API, acquires no host description or Git origin, and registers no Space;
- registry devices carry no Space server, person or admission ticket;
- refresh, refusal and sign-out affect only the selected purpose's credential, even when both share an origin.

## Internal Behavior

#### git-host-12

The library shall supply an HTTP stand-in for integration tests that serves Space sign-in, an account description, a paginated repository catalog with namespace identity, project details, private personal placement creation, branch preparation and Git credential brokering:

- separate stand-in Spaces can share a backing Git origin and record independent accounts and grants;
- fixtures may add repositories in another namespace or move a repository out of the signed-in account’s namespace to exercise filtering and fresh target checks;
- a fixture can script token refresh and expiry, revoked credentials, account changes, read-only state, transport refusals, and rate-limit responses with `Retry-After`.

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

When a real core signs in through the stand-in Space and creates a personal records placement, the integration suite shall assert:

- account identity, tokens and personal catalog refresh on sign-in, catalog pagination and exclusion of other namespaces [[git-host-2](#git-host-2)] [[git-host-3](#git-host-3)] [[git-host-4](#git-host-4)] [[git-host-5](#git-host-5)];
- creation, branch preparation and authenticated Git transport use that account and Space, with an expired token refreshed and a refused refresh signing out that Space only [[git-host-6](#git-host-6)] [[git-host-7](#git-host-7)] [[git-host-9](#git-host-9)] [[git-host-4](#git-host-4)];
- classified failure and retry guidance reports the Space name and bounds a rate-limit wait [[git-host-11](#git-host-11)] [[git-host-21](#git-host-21)];
- the repository moved outside the personal namespace fails its fresh target check before Git transport [[git-host-22](#git-host-22)];
- sign-out revokes credentials only for that Space [[git-host-10](#git-host-10)].

#### git-host-23

When a real core syncs an individual repository against the stand-in Space, the integration suite shall verify the target read [[git-host-22](#git-host-22)]:

- an unrelated repository detail failure leaves the selected sync available and the full read time unchanged;
- a repository moved outside the personal namespace stops the transfer, retains its local files and receives no new records, including during catch-up;
- target, catalog and authentication failures prevent transfer, and a held response across sign-out cannot restore access;
- a later complete read supersedes an earlier target read, while a target-only check after restart leaves the first full read due.

#### git-host-24

When a real core signs in at two independent stand-in Spaces, the integration suite shall verify that each account, personal catalog, refresh, rate-limit hold and sign-out is scoped to its own Space, and that a failed read there leaves the other Space usable [[git-host-2](#git-host-2)] [[git-host-4](#git-host-4)] [[git-host-5](#git-host-5)] [[git-host-21](#git-host-21)].

#### git-host-25

When two stand-in Spaces list the same personal repository over one Git backend, the integration suite shall assert that the clone appears once, the governing Space supplies its access state and credentials, and a sign-out follows the other Space only when it lists that personal repository [[git-host-5](#git-host-5)] [[git-host-9](#git-host-9)] [[git-host-22](#git-host-22)].

#### git-host-26

When a real core places one project at two stand-in Spaces on distinct Git backends, the integration suite shall verify that creation, branch preparation, access checks, credentials, failures and retries apply to the selected placement, including a fresh ownership check before catch-up [[git-host-6](#git-host-6)] [[git-host-7](#git-host-7)] [[git-host-9](#git-host-9)] [[git-host-22](#git-host-22)].

#### git-host-32

When a real shared-client integration runs against an HTTP service fixture at one origin, it shall verify that Space and registry grants survive each other's login, refresh and logout, legacy credentials are Space-only, each auth request carries its scope, registry login asks no host API, and a refused registry grant leaves Space usable [[git-host-31](#git-host-31)].

#### git-host-36

When an integration suite, on every platform and on Windows on the Node the app ships, hands a credential to a real Git through the helper's line naming the runtime it runs on and the shipped helper, then a copy of that helper under a folder whose name holds a space, `$`, a backtick and a single quote — and, where a name may hold one, a double quote — it shall assert that Git takes the helper's answer through each line [[git-host-9](#git-host-9)].

#### git-host-37

When an integration suite composes the helper's line for a credential, on every platform, it shall assert, case by case [[git-host-9](#git-host-9)]:

| The paths | The line |
| --- | --- |
| the app's executable and the shipped helper | the device's own helpers reset first, then the runtime and the script, each in single quotes |
| a Windows path holding a space, `$` and a single quote, for the runtime and for the helper | each path one word, its backslashes, space and `$` as they are and its quote closed, escaped and reopened |
| a runtime path holding a line break | refused |

#### git-host-38

When an integration suite runs the shipped helper on a credential's file, on every platform, it shall assert, case by case [[git-host-9](#git-host-9)]:

| Git asks | The helper |
| --- | --- |
| `get` at the credential's origin, in any case and with its default port | answers that username and password |
| `get` at another scheme, port or host | answers nothing |
| `store` or `erase` | answers nothing |

#### git-host-39

When an integration suite on Windows hands a credential to the helper beneath a temporary folder granting Everyone read access to what it holds, it shall assert that a plain file written beside the credential's inherits that grant, while the file the credential is written to grants Everyone nothing [[git-host-9](#git-host-9)].

## References

[1]: https://github.com/sublang-ai/spex.space/blob/main/specs/packages/host.md "Spex Space host package"
