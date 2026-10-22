<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-113: Execution Ownership

## Status

In progress (2026-10-21), before any shared execution ships.

## Intent

Implement [DR-134](../decisions/134-execution-ownership.md): every session and every new intent assigned to one runtime, another runtime's readings and refusals, the phrase, and the bounded stop.

## Deliverables

- [x] The `storage`, `core-service`, `dashboard` and `server-shell` packages state DR-134, and DR-134 reads Accepted.
- [ ] The runtime named by the home's device with a stored label; the hidden session record before the first turn; intent files at format 2 with a runtime, format 1 files kept.
- [ ] Another runtime's readings: not continuable with the phrase, no Restore, Discard or control, no lane or holder, no attention or badge, no released dispatch, no Start, advance or turn, and close, edit and drop refused.
- [ ] The bounded stop in the core and the server shell, within fifteen seconds.
- [ ] Integration tests over two homes and UI tests for the phrase.

## Tasks

1. Update the spec packages under DR-134 and accept it.
2. Name the runtime, append the session's runtime record at creation, and write intent files at format 2 with a runtime, reading format 1 as before.
3. Read another runtime's sessions and intents as DR-134 has it, in the continuation readings, the recovery offers, the lane, the ledger and the queue, and refuse the turn, close, edit and drop with `conflict`; show the phrase in the UI.
4. Bound the stop: abort, ten seconds, SIGTERM to every agent process the core started, SIGKILL five seconds later, leases released; the server shell's signal handling bounded the same way.
5. Add the two-home integration tests and the browser journey over the phrase and the refusals.

## Verification

- The root build, `npx @sublang/spex lint`, every package's tests and the browser journeys pass after each task.
- Two homes pairing one project at one path: the session and the intent captured on the first are shown on the second with the phrase and run nowhere but the first.
