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
- a seat that fails to start within thirty seconds answers `503` naming the seat, the lease kept for the next admission.

#### hub-3

When a client opens a WebSocket at `/seats/<person id>` presenting `Authorization: Bearer <bearer>` and no `Origin` header, the hub shall admit it where the bearer is the one of that seat's unexpired lease, open a connection to the seat's socket presenting the seat's handshake token, and pipe frames both ways unread until either side closes, closing the other ([DR-132](../decisions/132-team-servers.md), [DR-133](../decisions/133-one-desktop-over-several-cores.md)):

- a request with any `Origin` header is refused `403` and not upgraded; a missing, unknown or expired bearer `401`;
- a lease ending closes every relay of its seat with the close code `4401`;
- the hub reads nothing of the frames and keeps nothing of them.

### Leases and stopping

#### hub-4

When a person is admitted for the first time, or admitted while their seat is stopped, the hub shall ask the helper to create the seat's account where none exists and to start its unit, the handshake token minted by the hub and handed to the helper on its standard input, and shall wait for the seat's socket before answering the admission ([DR-132](../decisions/132-team-servers.md)):

- the helper is `spex-seatctl` with exactly one of `create <id>`, `start <id>`, `stop <id>` and `wipe <id>`, `<id>` the person's permanent account id, every other invocation refused by the helper itself; the service manager's policy lets the hub's account run it and nothing else as root;
- `create` makes the account `spex-<id>` in the group `spex-seats` with a home readable by that account alone; `start` writes the token where the hub and the seat alone read it and starts the unit `spex-seat@<id>`; `stop` stops it; `wipe` deletes the seat's app token and code-credentials files [[storage-44](storage.md#storage-44)] and nothing else;
- the unit runs the server shell as a seat [[server-shell-25](server-shell.md#server-shell-25)] as that account, with the server's id and name and the instance's URL from the server's environment file, the shared credential file the install script made for the administrator to fill [[hub-7](#hub-7)], its socket and token under the seat's runtime directory, a stop timeout above the core's own bounds, and a kill of the whole control group at that timeout, so that the core's graceful stop [[core-service-39](core-service.md#core-service-39)] runs first.

#### hub-5

While a seat holds a lease, every thirty minutes while a relay to it is open or the seat reports a turn active — read over the hub's own connection to the seat as any client reads it [[core-service-32](core-service.md#core-service-32)] — the hub shall renew the lease at the instance with the server token, naming the person, and record the expiry answered ([DR-132](../decisions/132-team-servers.md)):

- the instance's `403` or `404` ends the lease at once; its `429` or `502`, or no answer, is retried at the interval until the lease's expiry, so no grace exceeds the sixty minutes the instance advertised;
- at the lease's end the hub closes the seat's relays [[hub-3](#hub-3)] and asks the helper to stop the seat's unit [[hub-4](#hub-4)], the seat's files standing;
- leases survive the hub's restart: a restarted hub continues each recorded lease from its recorded expiry.

### The administrator's commands

#### hub-6

When the administrator runs `spex-hub status`, `spex-hub evict <id>` or `spex-hub retire`, the hub shall act on its seats ([DR-132](../decisions/132-team-servers.md)):

| Command | Effect |
| --- | --- |
| `status` | lists each seat by its person id and login, whether its unit runs, its lease's expiry and whether a relay is open |
| `evict <id>` | ends that seat's lease at once, as a refusal does [[hub-5](#hub-5)] |
| `retire` | ends every lease, stops every seat, wipes each seat's credentials [[hub-4](#hub-4)] and forgets the server token; the server's record and its seat devices are revoked by a group Owner at the instance, which this command says |

### Installation

#### hub-7

When the administrator runs the install script of a source release on a Linux host with systemd and sudo, the script shall build the server shell and the hub from that checkout, install them under one prefix with the helper and a `spex-hub` command, the two units and the sudoers fragment in the system's own places, create the hub's account and the seats' group, make the shared credential file empty and readable by the seats' group where none exists, and print the three files the administrator writes before `attach`: the server's environment file, the shared credential file, and the TLS material ([DR-132](../decisions/132-team-servers.md), [DR-040](../decisions/040-source-only-app-releases.md)):

- the script installs no binary of Spex's own that the release does not build from source; the dependencies come as `npm ci` fetches them;
- every refusal — not root, no systemd or sudo, no release checkout, a prefix overlapping the checkout — comes before anything changes, and a second run updates the installed files and leaves the accounts, the groups and the administrator's files as they are.

## Internal Behavior

### State

#### hub-8

The hub shall keep its state under its own directory with owner-only permissions: the instance's URL, the server's id, name, address and token, and the leases as `{<person id>: {login, expires_at, bearer_hash}}`, a bearer stored as its SHA-256 and minted from 32 random bytes, so that a restart continues every lease and no secret is written elsewhere or logged.

## Verification

### Hub Coverage

#### hub-9

Where a stand-in instance answers the servers routes, a fake helper at a configured path creates and starts real seats as the current user on scratch homes, and fixture TLS material serves the hub, the integration suite shall assert over real connections:

- an admission redeems the ticket once and answers the endpoint, a bearer and the expiry, a second presentation answering `401` `ticket_invalid` [[hub-2](#hub-2)];
- the relay admits the bearer in the header alone, refuses any `Origin` and a wrong bearer, pipes a `project.list` round trip unread, and closes both sides when one closes [[hub-3](#hub-3)];
- the helper is called with the four forms alone and the token reaches it on standard input [[hub-4](#hub-4)];
- a renewal is sent at the interval while a relay is open or a turn runs, a refusal ends the lease and stops the seat with the close code `4401`, a `502` is retried, and a restarted hub continues the lease [[hub-5](#hub-5)];
- `status`, `evict` and `retire` act as their rows say, `retire` wiping the credentials and forgetting the token [[hub-6](#hub-6)];
- no bearer or token appears in the hub's output or logs [[hub-8](#hub-8)].

#### hub-10

Where the privileged lane runs on a Linux host with systemd and sudo, the suite shall install the hub with its helper and units, admit two members, and assert that each seat runs as its own account unable to read the other's home, that the seat's token and socket are readable by the hub and that seat alone, that a stop at the lease's end kills a stubborn agent child within the unit's timeout with the seat's files standing, and that `retire` leaves the homes and removes the credentials [[hub-4](#hub-4)] [[hub-5](#hub-5)] [[hub-6](#hub-6)].
