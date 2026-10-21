<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-112: One Desktop Over Several Cores

## Status

In progress (2026-10-21), after the hub admits a seat and after the home's client per instance.

## Intent

Implement [DR-133](../decisions/133-one-desktop-over-several-cores.md): the server commands and the relay in the local core, a store per core behind a place selector, the joined sidebar, attention queue and approvals inbox, and the remote-project rules.

## Deliverables

- [x] The `app-shell`, `dashboard`, `core-service`, `storage`, `run-view`, `approvals`, `localization` and `git-host` packages state DR-133, the place selector stated once in `run-view`, and DR-133 reads Accepted.
- [ ] The core's servers and ticket calls, the seats kept under `local/`, the three server commands with their state message, and the protocol bumped.
- [ ] The relay: a loopback endpoint per seat admitted as the core's own, the bearer in a header with no `Origin`, the watch with hello, mismatch and reopening at start, and the attention count the shell's badge reads.
- [ ] A store per core with the singletons inside, per-place preferences, the local store's exports kept for the tests, and a connection and banner per place.
- [ ] The sidebar, the attention queue and the approvals inbox joined; the place selector on Settings, Playbooks, Groups and Environments; servers listed and opened with the contract.
- [ ] Remote projects opened among the member's groups with no picker, reveal or path entry.
- [ ] Browser journeys over a stand-in hub and two seats.

## Tasks

1. Update the spec packages under DR-133 and accept it.
2. Add the servers and ticket calls, the seats store, the three commands and the state message to the core, and bump the protocol, with integration tests.
3. Add the relay and the watch to the core, the attention count, and the shell's badge from it, with a stand-in hub in tests.
4. Make the UI's store a factory per core with the singletons inside, per-place preferences and the local exports kept, with unit tests for isolation.
5. Connect the UI to each place with a banner and a mismatch per place.
6. Join the sidebar, the attention queue and the approvals inbox across places, with tests.
7. Add the place selector and the servers list with open and close and the contract, with tests.
8. Apply the remote-project rules, with tests.
9. Add the browser journeys over a stand-in hub and two seats.

## Verification

- The root build, `npx @sublang/spex lint`, every package's tests and the browser journeys pass after each task.
- The local core and two seats open at once in one window: each place lists its own projects, one queue carries all three cores' attention, an approval is answered at its seat, and the bearer reaches no renderer message.
