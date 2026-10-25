<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# hub: The Team Server's Hub

## Intent

This package covers the hub, the one public process of a team server under [DR-132](../decisions/132-team-servers.md): attached to a server a group Owner registered at an instance, it redeems members' tickets there, starts one seat per admitted member through a confined helper and the host's service manager, relays each member's client to their seat, renews each seat's execution lease at the instance and stops a seat within a bound when its lease ends, and offers the administrator `status`, `evict` and `retire`.
A **seat** is one member's own server shell, running as an OS account named from the member's permanent account id at the instance, listening on a socket the hub alone reaches [[server-shell-25](server-shell.md#server-shell-25)].
A **lease** is the member's admission, an expiry the instance set and the hub renews; a **bearer** is the secret the hub issues a member's client for the lease's life.

## External Behavior

### Attaching

#### hub-1

When the administrator runs `spex-hub attach` naming the instance's URL, the server's id and token as the instance's servers page showed them, the server's public https address and the TLS certificate and key, the hub shall keep them in its own state with owner-only permissions and answer with the address it will serve, refusing an id or token in the wrong format, an address that is no https origin, or a certificate without its key, naming the mistake ([DR-132](../decisions/132-team-servers.md)):

- the token is read from standard input or a file, never from the command line;
- `attach` run again replaces the state whole; the seats stand.

### Admission and relay

#### hub-2

While the hub serves its address over TLS, when a client sends `POST /admit` with a JSON body `{ticket}`, the hub shall redeem the ticket at the instance with the server token, start the admitted person's seat where it is not running [[hub-4](#hub-4)], mint a bearer and record the lease the instance answered, and respond `200` with `{endpoint, bearer, lease_expires_at, person}` — `endpoint` the `wss:` URL of the person's seat under the address, `/seats/<person id>` ([DR-132](../decisions/132-team-servers.md)):

- the instance's `401` `ticket_invalid` is relayed as `401` with that code, its other refusals with their status and code, and the instance unreachable as `502`; the bearer appears in this response alone;
- a body that is no JSON object or whose `ticket` is no string is `400`;
- a seat that fails to start within thirty seconds answers `503` naming the seat, the lease kept for the next admission;
- while `retire` runs or once it ran [[hub-6](#hub-6)], an admission is refused `503`, before its ticket is redeemed or, where the instance was already answering it, once answered; a seat an admission started before then is among those `retire` stops and wipes.

#### hub-3

When a client opens a WebSocket at `/seats/<person id>` presenting `Authorization: Bearer <bearer>` and no `Origin` header, the hub shall admit it where the bearer is the one of that seat's unexpired lease, open a connection to the seat's socket presenting the seat's handshake token, and pipe frames both ways unread until either side closes, closing the other ([DR-132](../decisions/132-team-servers.md), [DR-133](../decisions/133-one-desktop-over-several-cores.md)):

- a request with any `Origin` header is refused `403` and not upgraded; a missing, unknown or expired bearer `401`;
- a lease ending closes every relay of its seat with the close code `4401`;
- the hub reads nothing of the frames and keeps nothing of them.

### Leases and stopping

#### hub-4

When a person is admitted for the first time, or admitted while their seat is stopped, the hub shall ask the helper to create the seat's account where none exists — asked before every start, so that a creation that failed is asked again at the next admission — and to start its unit, the handshake token minted by the hub and handed to the helper on its standard input, and shall wait for the seat's socket before answering the admission ([DR-132](../decisions/132-team-servers.md)):

- the helper is `spex-seatctl` with exactly one of `create <id>`, `start <id>`, `stop <id>` and `wipe <id>`, `<id>` the person's permanent account id, every other invocation refused by the helper itself; the service manager's policy lets the hub's account run it and nothing else as root;
- `create` makes the account `spex-<id>` in the group `spex-seats` with a home readable by that account alone; `start` writes the token where the hub and the seat alone read it and starts the unit `spex-seat@<id>`; `stop` stops it; `wipe` deletes the seat's app token and code-credentials files [[storage-44](storage.md#storage-44)] and nothing else;
- the unit runs the server shell as a seat [[server-shell-25](server-shell.md#server-shell-25)] as that account, with the server's id and name and the instance's URL from the server's environment file, the shared credential file the install script made for the administrator to fill [[hub-7](#hub-7)], its socket and token under the seat's runtime directory, a stop timeout above the core's own bounds, and a kill of the whole control group at that timeout, so that the core's graceful stop [[core-service-39](core-service.md#core-service-39)] runs first.

#### hub-5

While a seat holds a lease, every thirty minutes while a relay to it is open or the seat reports a turn active — read over the hub's own connection to the seat as any client reads it [[core-service-32](core-service.md#core-service-32)] — the hub shall renew the lease at the instance with the server token, naming the person, and record the expiry answered ([DR-132](../decisions/132-team-servers.md)):

- the instance's `403` or `404` ends the lease at once; its `429` or `502`, or no answer, is retried at the interval until the lease's expiry, so no grace exceeds the sixty minutes the instance advertised;
- at the lease's end the hub closes the seat's relays [[hub-3](#hub-3)] and asks the helper to stop the seat's unit [[hub-4](#hub-4)], the seat's files standing but the core's own lease and scratch, which its stop removes [[core-service-39](core-service.md#core-service-39)]; a stop that fails is logged with its cause, the stop staying owed on the lease [[hub-8](#hub-8)] and asked again at each renewal interval and at the hub's next start until one succeeds;
- every minute, whether a hub runs or not, the service manager's sweep stops, through the helper's `stop` run as root [[hub-4](#hub-4)], every seat whose recorded lease [[hub-8](#hub-8)] has expired while its unit is still active — the bound while no hub runs, met within the sweep's period of a minute and its accuracy of five seconds after the expiry, plus the unit's stop timeout, the stops of several seats issued at once — the lease table left to the hub, a stop that fails logged and tried again at the next sweep ([DR-148](../decisions/148-a-lapsed-seat-is-stopped-by-a-sweep.md));
- a seat's lock [[hub-8](#hub-8)] is held by the hub while it records an admission and starts the seat and while it records a renewal, and by the sweep while it reads that seat's lease again and stops it, so that the sweep stops no seat admitted or renewed meanwhile; a lock the sweep cannot take within ten seconds leaves that seat to the next sweep, and one an admission cannot take within a minute refuses the admission `503`, nothing recorded; a lock whose holder is gone — its pid no longer running, or from before this boot, or older than fifteen minutes, every hold being bounded by the seat's start and stop timeouts, or still holding no pid a second after it was made — is cleared by the sweep alone, at each sweep for every seat — an entry it removes by its name alone, a file or an empty directory, so that root follows no path there — the hub waiting on it until then, so that no two takers of one stale lock both go on; the `locks/` directory is the hub's to make, and the sweep, as root, takes a lock only in a directory that is no link and is the state directory's owner's, reads the lease table through no link, from a regular file of that owner alone and bounded in size, and a lock through no link, from a regular file bearing one name and its first bytes alone, and makes, changes the owner of and reads nothing else but the names under `locks/`, so that what the hub's account could redirect root to is at most the making or removing of a file named `<id>.lock` under the hub's state or the seats' runtime directory, the only places its unit may write;
- leases survive the hub's restart: a restarted hub continues each recorded lease from its recorded expiry and asks the stop of every lease that ended while it was down, its stop still owed [[hub-8](#hub-8)].

### The administrator's commands

#### hub-6

When the administrator runs `spex-hub status`, `spex-hub evict <id>` or `spex-hub retire`, the hub shall act on its seats ([DR-132](../decisions/132-team-servers.md)):

| Command | Effect |
| --- | --- |
| `status` | lists each seat by its person id and login, whether its unit runs, its lease's expiry and whether a relay is open |
| `evict <id>` | ends that seat's lease at once, as a refusal does [[hub-5](#hub-5)]; a stop that fails is reported with its cause, the lease ended and the command exiting 1 |
| `retire` | ends every lease, stops every seat, wipes each seat's credentials [[hub-4](#hub-4)] and forgets the server token; the server's record and its seat devices are revoked by a group Owner at the instance, which this command says; every stop or wipe that fails is reported with its cause, the command exiting 1 and saying that `retire` run again asks each stop and wipe again |

### Installation

#### hub-7

When the administrator runs the install script of a source release on a Linux host with systemd and sudo, the script shall build the server shell and the hub from that checkout, install them under one prefix with the helper and a `spex-hub` command, the units — the hub's, the seat's, and the sweep's service and timer, the timer enabled and the sweep run once [[hub-5](#hub-5)] — and the sudoers fragment in the system's own places, create the hub's account and the seats' group and the hub's state directory with its `locks/` [[hub-8](#hub-8)], make the shared credential file empty and readable by the seats' group where none exists, and print the four files the administrator writes before `attach`: the server's environment file, the server token's file read by `attach` [[hub-1](#hub-1)], the shared credential file, and the TLS material ([DR-132](../decisions/132-team-servers.md), [DR-040](../decisions/040-source-only-app-releases.md)):

- the script installs no binary of Spex's own that the release does not build from source; the dependencies come as `npm ci` fetches them;
- every refusal — not root, no systemd, no sudo or a sudoers that does not read `/etc/sudoers.d`, no release checkout, a prefix overlapping the checkout — comes before anything changes, and a second run updates the installed files and leaves the accounts, the groups and the administrator's files as they are;
- once the units are in place, a sweep that does not run on the host and a sudo that does not let the hub's account run the helper each refuse the install with the cause, the installed files standing for the next run.

## Internal Behavior

### State

#### hub-8

The hub shall keep its state under its own directory with owner-only permissions: the instance's URL, the server's id, name, address and token, and the leases as `{<person id>: {login, expires_at, bearer_hash, stop_owed}}`, `stop_owed` true from a lease's admission until the helper's stop succeeds after its end [[hub-5](#hub-5)] and absent otherwise, a bearer stored as its SHA-256 and minted from 32 random bytes, and, under `locks/`, made by the hub, a lock per seat holding its holder's pid, taken by the hub and by the sweep [[hub-5](#hub-5)], a lock whose holder is gone cleared by the sweep alone [[hub-5](#hub-5)], the lease table read by the sweep and written by the hub alone, so that a restart continues every lease and no secret is written elsewhere or logged.

## Verification

### Hub Coverage

#### hub-9

Where a stand-in instance answers the servers routes, a fake helper at a configured path creates and starts real seats as the current user on scratch homes, and fixture TLS material serves the hub, the integration suite shall assert over real connections:

- an admission redeems the ticket once and answers the endpoint, a bearer and the expiry, a second presentation answering `401` `ticket_invalid` [[hub-2](#hub-2)];
- the relay admits the bearer in the header alone, refuses any `Origin` and a wrong bearer, pipes a `project.list` round trip unread, and closes both sides when one closes [[hub-3](#hub-3)];
- the helper is called with the four forms alone and the token reaches it on standard input [[hub-4](#hub-4)];
- a renewal is sent at the interval while a relay is open or a turn runs, a refusal ends the lease and stops the seat with the close code `4401`, a `502` is retried, and a restarted hub continues the lease [[hub-5](#hub-5)];
- `status`, `evict` and `retire` act as their rows say, `retire` wiping the credentials and forgetting the token [[hub-6](#hub-6)];
- an admission arriving while `retire` runs is refused `503` with its ticket unredeemed, one the instance was still answering is refused once answered, no seat is created or started for either and the retired seat is not restarted [[hub-2](#hub-2)] [[hub-6](#hub-6)];
- a creation that failed is asked again at the next admission, which starts the seat [[hub-4](#hub-4)];
- a stop that fails leaves the lease ended and the stop still owed, is reported by `evict`, running or not, and by `retire` with its cause and exit 1, and is asked again at the next renewal interval and at the hub's next start, with the seat's socket closed as well as open, until it succeeds, `retire` run again after a failure asking each stop and wipe again [[hub-5](#hub-5)] [[hub-6](#hub-6)] [[hub-8](#hub-8)];
- the sweep, run once over a lease table on disk with a fake service manager answering which units are active, stops through the helper a seat whose lease expired and still runs, leaves a lease still active and an expired lease whose unit is inactive alone, rewrites nothing of the table, waits on a seat's lock a live process holds and, the lease renewed before the lock is released, stops nothing, clears at each sweep a lock whose holder is gone, its seat's lease active or not, and replaces one in its way, logs a stop that fails, exiting 1, and, `locks/` or the lease table replaced by a link or by something that is no regular file, or the table past its size bound, takes no lock, stops nothing, names nothing of what it was led to and changes nothing where the link leads [[hub-5](#hub-5)] [[hub-8](#hub-8)];
- an admission waits on a seat's lock the sweep holds and goes through once it is released, waits on one whose holder no longer runs until the sweep clears it, and the renewal of a lease records its expiry under that lock [[hub-5](#hub-5)];
- no bearer or token appears in the hub's output or logs [[hub-8](#hub-8)].

#### hub-10

Where the privileged lane runs on a Linux host with systemd and sudo, the suite shall install the hub with its helper and units, admit two members, and assert that each seat runs as its own account unable to read the other's home, that the seat's token and socket are readable by the hub and that seat alone, that a stop at the lease's end kills a stubborn agent child within the unit's timeout with the seat's files standing but the core's own lease and scratch, that the sweep's timer is enabled [[hub-7](#hub-7)] and, with the hub's unit stopped, stops a seat whose lease lapsed within two minutes of its expiry with its files standing, the hub's next start recording that lease ended, and that `retire` leaves the homes and removes the credentials [[hub-4](#hub-4)] [[hub-5](#hub-5)] [[hub-6](#hub-6)].
