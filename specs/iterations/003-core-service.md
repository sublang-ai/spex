<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-003: Core Service

## Goal

Implement `packages/core` — the headless Spex core service — per the
CORE spec package, embedding the cligent headless runtime and the
Playbook Captain shell behind the WebSocket protocol.

## Deliverables

- [x] `@sublang/spex-core` workspace package building and testing in
  root CI
- [x] Typed WebSocket protocol module exported for UI consumption
- [x] Config module: locate, load, validate (launcher parity), seed,
  watch, compose
- [x] SQLite store with sessions/turns/records/usage persistence
- [x] Scripted fake adapter fixture enabling network-free tests
- [x] Session manager embedding runtime + captain shell with
  channel-boundary visibility filtering
- [x] WebSocket server with subscriptions, commands, readiness
- [x] Integration tests covering CORE-19..23

## Tasks

1. **Package scaffolding** — `packages/core` package.json
   (`@sublang/spex-core`, private), tsconfig, node:test runner
   script, deps (`@sublang/cligent`, `@sublang/playbook`, `ws`,
   `zod`, `better-sqlite3`, `yaml`).

2. **Protocol module** — zod schemas + TS types for every
   client→core command and core→client message
   ([CORE-12](../dev/core-service.md#core-12),
   [CORE-13](../dev/core-service.md#core-13)); hello/version
   handshake shape ([CORE-1](../user/core-service.md#core-1)).

3. **Config module** — XDG path resolution, YAML load, fail-closed
   validation with launcher parity
   ([CORE-16](../dev/core-service.md#core-16)), starter seeding
   ([CORE-3](../user/core-service.md#core-3)), file watch + reload
   ([CORE-2](../user/core-service.md#core-2)), composition to
   runtime options with `<id>-<role>` namespacing; unit tests.

4. **Store module** — better-sqlite3 schema and persistence API for
   sessions, turns, records, usage
   ([CORE-15](../dev/core-service.md#core-15),
   [CORE-10](../user/core-service.md#core-10)); unit tests.

5. **Fake adapter fixture** — scripted cligent adapter driving
   deterministic records incl. hidden ones and usage payloads
   ([CORE-18](../dev/core-service.md#core-18)).

6. **Session manager** — one runtime per project session, captain
   shell with injected loadModule
   ([CORE-17](../dev/core-service.md#core-17)), record bus with
   hidden filtering at the channel boundary
   ([CORE-14](../dev/core-service.md#core-14),
   [CORE-7](../user/core-service.md#core-7),
   [CORE-8](../user/core-service.md#core-8)), boss turn
   serialization and abort
   ([CORE-5](../user/core-service.md#core-5),
   [CORE-6](../user/core-service.md#core-6)).

7. **WebSocket server** — loopback endpoint, hello, subscriptions
   (session + debug channels), command dispatch, readiness
   reporting ([CORE-1](../user/core-service.md#core-1),
   [CORE-9](../user/core-service.md#core-9)).

8. **Integration tests** — end-to-end coverage per
   [CORE-19..23](../test/core-service.md) over a real WebSocket
   client against the fake adapter.

## Acceptance criteria

- `npm run build` and `npm test` green from the repo root with the
  new workspace included.
- Integration tests exercise every CORE test item (CORE-19..23) and
  open no network connection.
- The protocol module is importable as types without pulling in
  Node-only runtime code.
