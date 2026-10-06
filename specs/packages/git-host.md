<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# git-host: The Git Host Client

## Intent

This package defines how the core talks to the Git host under [DR-103](../decisions/103-the-home-and-its-groups.md): signing a person in as a public client, keeping the app token, reading groups and spex repositories, creating one, preparing its `spex` branch, reading members, handing Git a credential through a helper, and the stand-in host the test suites run against.
The **Git host** is spex.pub, which brokers the Git credential and wraps the Git system behind it; its routes are JSON under `/api/v1` and its sign-in pages under `/login`, as spex.pub's own specs state [[1]].
An **app token** is the credential the host issues to one signed-in device: a short-lived access secret and a rotating refresh secret [[storage-19](storage.md#storage-19)].
The core reads the host only when a person signs in, activates Refresh, or starts a sync, never on a timer, and derives nothing from a cached list.

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
4. on the callback, check `state`, exchange the `code` with the verifier at the host's token endpoint, store the app token [[storage-19](storage.md#storage-19)], read the person [[git-host-5](git-host.md#git-host-5)], write the account into `home.yaml`, and answer the browser with a page saying the sign-in is complete and the browser may be closed;
5. set the home up for the account [[space-4](space.md#space-4)].

- a callback carrying `error=access_denied`, a wrong `state`, or a refused exchange ends the sign-in `failed` with its cause and stores nothing; ten minutes without a callback, or `space.signin.cancel`, ends it `expired` or `stopped` and closes the listener;
- at most one sign-in runs at a time; a second start is `busy`.

#### git-host-3

When a client sends `space.signin.start` on the server shell, the core shall sign in through the device flow ([DR-103](../decisions/103-the-home-and-its-groups.md)):

1. send `client_id=spex` and the device label to the host's device endpoint and reply with the user code, the verification URL and the expiry it returned;
2. poll the host's token endpoint at the interval it named, backing off when told to slow down, until the app token arrives, the person denies, or the code expires;
3. on the token, continue as the browser flow does from its fourth step.

- a denial ends the sign-in `failed` with `denied`, an expiry with `expired`, and `space.signin.cancel` stops the polling; nothing is stored until the token arrives.

#### git-host-4

While the home holds an app token, when a call to the host is made, the core shall present the access secret as a bearer credential and keep the token current:

- an access secret within a minute of expiring, or one the host answers `token_expired` to, is refreshed first through the refresh secret, one refresh at a time, the new pair stored before any further call [[storage-19](storage.md#storage-19)]; a call refused `token_expired` is retried once after the refresh;
- a refresh the host refuses, or a call the host answers `invalid_token`, `token_revoked` or `reauth_required` to, signs the device out of the home: the credential is removed, the account kept in `home.yaml` marked signed out, and every spex repository with a remote turns unreachable with "Sign in again" [[space-61](space.md#space-61)], until the next sign-in;
- `rate_limited` is reported with the host's retry time, `provider_unavailable` and a network failure as unreachable, and a `host_refused` with the host's words [[git-host-11](git-host.md#git-host-11)].

### Reads and Writes

#### git-host-5

When the home is signed in and a read of the host is due — at sign-in, on Refresh, and before a sync's Check step — the core shall read, in one pass, the person, every group, and every spex repository the host lists across its pages, and shall hold the answer as the home's current view until the next read ([DR-103](../decisions/103-the-home-and-its-groups.md)):

- a listed spex repository is matched to a clone by the id stored in the clone's Git configuration, else by the remote URL, never by name alone;
- a clone whose id the host no longer lists is marked unreachable with the cause, its files untouched;
- the host's `project.json` for each listed repository is kept for the pickers [[space-58](space.md#space-58)], and its archived flag and the account's role, as the host reports them, decide read-only [[space-61](space.md#space-61)];
- a read that fails leaves the previous view with its time and reports the failure once.

#### git-host-6

When the core creates a spex repository in a group — for a pick [[space-58](space.md#space-58)] or a group's first session [[space-65](space.md#space-65)] — it shall ask the host to create `<name>-spex` there, private, with a description naming it as the project's or the group's records and, for a project, where its code lives, and shall act on the answer:

| Answer | The core |
| --- | --- |
| created | records the repository's id and remote URL in the clone's Git configuration, prepares the branch [[git-host-7](git-host.md#git-host-7)], and pushes `spex` |
| pending, with the host's words | leaves the clone local only and reports the step as waiting with those words [[space-64](space.md#space-64)] |
| name taken | reports the name taken so the reader is asked for another [[space-58](space.md#space-58)] |

- a `<name>` is the working folder's name, or the group's, lower-cased to kebab-case where it is not one already, and never edited beyond that without the reader.

#### git-host-7

Before the first push of `spex` into a spex repository, the core shall ask the host to prepare the branch, and shall push only on `ready`:

- `pending`, with the host's words, is reported as waiting on the repository's row [[space-64](space.md#space-64)] and asked again before the next sync;
- a repository the host reports empty is pushed only after the host's default branch exists, so `spex` never becomes the default branch; the core asks again on the next sync until it does.

#### git-host-8

When a client sends `space.members` for a reachable spex repository, the core shall read its members from the host and reply with each member's id, login, display name and the host's own role name, and the host's members page URL, holding nothing of it after the reply.

#### git-host-9

When the core runs a Git transport — clone, fetch, push or `ls-remote` — against the Git host's origin, it shall ask the host for a credential first and hand it to Git through a credential helper, never through the remote URL ([DR-103](../decisions/103-the-home-and-its-groups.md)):

- the credential — the username and the secret the host returned, with its expiry — is written to a file with owner-only permissions in a temporary directory, which is removed when the Git child ends;
- Git runs with `-c credential.helper=` naming the app's own helper script on the app's own runtime, which answers Git's `get` with that username and password and ignores `store` and `erase`; a transport to any other origin names no helper and uses the device's own;
- the host refusing the credential signs the device out [[git-host-4](git-host.md#git-host-4)] and stops the transport before Git runs.

#### git-host-10

When a client sends `space.signout`, the core shall revoke this device at the host with its app token, remove the credential [[storage-19](storage.md#storage-19)], and mark the account signed out in `home.yaml`, keeping every clone and record:

- a host that cannot be reached is tried once; the credential is removed either way.

#### git-host-11

When the host answers a call with anything but success, the core shall relay it in the reader's language with the host's own words kept whole wherever it carries them, and shall claim nothing the host did not say ([DR-064](../decisions/064-honest-remote-failure.md)):

| Answer | Relayed as |
| --- | --- |
| `pending` | waiting, with the words, on the step's row |
| `name_taken` | the name is taken |
| `host_refused` | refused, with the words |
| `not_found` | no longer shared with this account |
| `rate_limited` | the host asks to wait, with the retry time |
| `reauth_required`, `token_revoked`, `invalid_token` | sign in again |
| `provider_unavailable`, no answer | the host could not be reached |

## Internal Behavior

#### git-host-12

The core package shall ship a stand-in Git host for its own tests and the browser journeys ([DR-039](../decisions/039-browser-acceptance-journeys.md)): an in-process HTTP server that implements the host's sign-in and host routes over a directory of bare Git repositories, serves their Git transport over HTTP, and exposes a scripting interface:

- sign-in: `/login/app` and `/login/device` pages and the device and token endpoints issuing app tokens, with scripted approval, denial and expiry; access secrets that expire on demand; revocation;
- host routes: the person, groups and spex repositories from a scripted fixture, creation of a bare repository with a README on `main`, members, branch preparation with a scripted refusal, and the credential for its own origin;
- Git transport: every repository served at `<origin>/<group>/<name>-spex.git` over HTTP through Git's own backend, accepting the credentials the stand-in issued and refusing others with 401, with a scripted sleep, a scripted refusal and a scripted archive;
- a scripted rename, transfer, archive and membership removal, each visible on the next read.

## Verification

#### git-host-13

When an integration suite starts a real core on a scratch home against the stand-in [[git-host-12](#git-host-12)], it shall assert the sign-in flows over the protocol:

- a new home records the stand-in's URL from `SPEX_HOST_URL`, and a later start with the variable changed keeps the recorded one [[git-host-1](#git-host-1)];
- the browser flow's URL names the loopback redirect, an S256 challenge and `client_id=spex`; completing it at the stand-in stores the app token with owner-only permissions and the account in `home.yaml`, and the callback page says the browser may be closed [[git-host-2](#git-host-2)];
- a callback with a wrong `state`, one carrying `access_denied`, a refused exchange, a cancel and a test-shortened expiry each end the sign-in with its cause and store nothing; a second start during a flow is `busy` [[git-host-2](#git-host-2)];
- the device flow shows the stand-in's user code, polls at its interval, backs off on slow down, and completes on approval; a denial and an expiry end it with their causes [[git-host-3](#git-host-3)];
- an access secret the stand-in expires is refreshed once before the next call, two concurrent calls refresh once, and a refresh the stand-in refuses signs the device out with every remote repository unreachable until the next sign-in [[git-host-4](#git-host-4)];
- sign-out revokes the device at the stand-in and removes the credential, and a stand-in that cannot be reached still leaves the home signed out [[git-host-10](#git-host-10)].

#### git-host-14

When an integration suite drives host reads and writes against the stand-in [[git-host-12](#git-host-12)], it shall assert:

- a read lists every group and every spex repository across two pages, matches clones by id and then by remote, marks a clone the stand-in stopped listing unreachable with its files intact, and keeps the previous view with its time when the stand-in answers 503 [[git-host-5](#git-host-5)];
- creating a spex repository records its id and remote in the clone's Git configuration, prepares the branch and pushes; a pending answer leaves the clone local only with the words; a taken name is reported as such [[git-host-6](#git-host-6)] [[git-host-7](#git-host-7)];
- an empty repository on the stand-in is not pushed until its default branch exists [[git-host-7](#git-host-7)];
- members are read with the stand-in's role names and members URL and held nowhere after the reply [[git-host-8](#git-host-8)];
- a push runs with the helper and a credential file of mode `0600` in a directory removed after the child ends, the stand-in's transport receiving the issued credential and refusing a push attempted with none; a fetch from a bare path remote names no helper [[git-host-9](#git-host-9)];
- each stand-in answer of the table is relayed in English and in Chinese with the stand-in's words kept whole [[git-host-11](#git-host-11)].

## References

[1]: https://github.com/sublang-ai/spex-pub/blob/main/specs/packages/host.md "spex.pub host package"
