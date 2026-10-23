<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-114: Team Servers

## Status

In progress (2026-10-21), after execution ownership and beside spex.pub's servers.

## Intent

Implement [DR-132](../decisions/132-team-servers.md): seat mode in the core and the server shell, the shared agent sign-ins, the projects tree and code credentials on a seat, the hub with its helper and units, the lease renewed by the hub, the bounded stop, and the installation from a source release.

## Deliverables

- [x] The `server-shell`, `core-service`, `settings`, `git-host`, `space`, `storage` and `projects` packages and a new `hub` package state DR-132, and DR-132 reads Accepted.
- [x] Seat mode in the core: the device request naming the server and the person, a device of another account refused, no own repository joined, path commands refused.
- [x] The shared credential file read into the environment at start and before each run, the member's own form winning, readiness recognizing the forms and reporting unreadable and expired.
- [ ] Projects allocated under the seat's tree, code cloned and pushed with the member's own token for its host, the clone failure naming the credential, the Settings surface taking the token.
- [x] The server shell's seat flags: the token from a file, the device label, the server and person ids, the shared file, the socket.
- [x] The hub: TLS, admission by ticket, the bearer in a header, the relay to the seat, leases renewed at the instance and kept across restarts, the helper calls, `attach`, `status`, `evict` and `retire`.
- [x] The helper, the units, the sudoers fragment and the install script over a source release.
- [x] The privileged lane on Linux and the live acceptance with two members.

## Tasks

1. Update the spec packages under DR-132, add the `hub` package, and accept it.
2. Add seat mode to the core: the options, the device request's server and person, the label, the account pinned to the admitted person, the own-repository join skipped, and the path commands refused, with stand-in routes and tests.
3. Read the shared credential file into the environment at start and before each run, leave a shared form out where the member set their own, and recognize the forms in readiness with the unreadable and expired readings, with tests over the fake adapter.
4. Allocate a project's folder under the seat's tree, keep a code host's token under `local/`, use it for every transport to that host, name the credential in a failed clone, and add the Settings commands, with tests over the Git HTTP host.
5. Add the server shell's seat flags and the socket listener, with real-process tests.
6. Add the hub: TLS, ticket redemption, the bearer, the relay with no `Origin` admitted, the lease table and its renewal at the instance, the bounded stop through the helper, and the four commands, with a fake helper and the stand-in instance in tests.
7. Add the helper with its argument checks, the seat and hub units, the sudoers fragment and the install script.
8. Add the privileged lane and record the live acceptance with two members on a Linux server.
9. Decide how the pushes agents make from a seat's work tree carry the member's code-host token — git-host-9's "pushed" half — and implement the decision.

## Verification

- The root build, `npx @sublang/spex lint`, every package's tests, the server shell's real-process tests and the hub's tests pass after each task.
- The privileged lane proves two seat accounts unable to read each other's files and a seat's agents killed within the bound.
- Waiting on the operator: a Linux server, the administrator's agent sign-ins, two member accounts at the instance, and the live checks of DR-132 recorded.
