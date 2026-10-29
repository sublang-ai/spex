<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-163: The CLI Finds the Running App

## Status

Accepted (2026-10-29), under the owner's goal that package publishing and installation work end to end for a fresh user from the IDE and from the CLI.
Amends [DR-157](157-a-cli-attached-to-the-local-core.md) in how the CLI learns the access URL: an explicit URL still wins, and without one the CLI reads the one the running app left in its home.

## Context

- DR-157 attaches the CLI to an explicit access URL alone and keeps discovery out of its first slice.
- The desktop keeps its endpoint's port and token in memory, so a person running the desktop app cannot use the CLI at all: one process serves a home ([DR-111](111-the-core-coordinates-as-git-does.md)), so the server shell cannot start beside it, and the desktop prints no URL. The guide tells them to run the server shell from a checkout instead.
- The home's `local/` folder already holds what never leaves the device, with owner-only credentials beside it.

## Decision

- While a core serves a home at a loopback endpoint — the desktop's own listener, or a server shell bound to a loopback host — it writes `local/endpoint.json` under the home, owner-only, holding `{ format: 1, url, pid }`: the access URL with its token, and the serving process's id. It writes the file once listening and removes it when it stops; a seat, and a shell bound to any other host, write none.
- Given neither `--server` nor `SPEX_SERVER_URL`, the CLI reads that file from the home `SPEX_HOME` names, else `~/.spex`, and connects to its URL under the same loopback rule as an explicit one. A missing or unreadable file, or a connection refused there, fails naming that the Spex app must be running on this computer.
- Nothing else of DR-157 changes: an explicit URL wins, the CLI starts no server, reconnects nothing and replays nothing, and the file is the only discovery.
- The token on disk sits beside the home's credentials, owner-only, and grants what the app's own window has over that home.

### Considered and declined

- A fixed port or a well-known token: a fixed port collides and a well-known token is none.
- The desktop printing its URL: a window has no terminal, and copying a secret by hand is what the file spares.

## Consequences

- `storage-1` lists the file; `core-service` states its writing and removal; `attached-cli-1` states the order the CLI tries; the guides tell a desktop user to run the CLI beside the app, the server shell no longer a prerequisite.
