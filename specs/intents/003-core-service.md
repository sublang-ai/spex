<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-003: Core Service

## Status

Done

## Intent

Implement `packages/core` — the headless Spex core service — per the core-service spec package, embedding the cligent headless runtime and the Playbook Captain shell behind the WebSocket protocol.

## Deliverables

- [x] `@sublang/spex-core` workspace package building and testing in root CI
- [x] Typed WebSocket protocol module exported for UI consumption
- [x] Config module: locate, load, validate (launcher parity), seed, watch, compose
- [x] SQLite store with sessions/turns/records/usage persistence
- [x] Scripted fake adapter fixture enabling network-free tests
- [x] Session manager embedding runtime + captain shell with channel-boundary visibility filtering
- [x] WebSocket server with subscriptions, commands, readiness
- [x] Integration tests covering core-service-19..23

## Tasks

1. **Package scaffolding** — `packages/core` package.json (`@sublang/spex-core`, private), tsconfig, node:test runner script, deps (`@sublang/cligent`, `@sublang/playbook`, `ws`, `zod`, `better-sqlite3`, `yaml`).

2. **Protocol module** — zod schemas + TS types for every client→core command and core→client message [[core-service-12](../packages/core-service.md#core-service-12)], [[core-service-13](../packages/core-service.md#core-service-13)]; hello/version handshake shape [[core-service-1](../packages/core-service.md#core-service-1)].

3. **Config module** — XDG path resolution, YAML load, fail-closed validation with launcher parity [[core-service-16](../packages/core-service.md#core-service-16)], starter seeding [[core-service-3](../packages/core-service.md#core-service-3)], file watch + reload [[core-service-2](../packages/core-service.md#core-service-2)], composition to runtime options with `<id>-<role>` namespacing; unit tests.

4. **Store module** — better-sqlite3 schema and persistence API for sessions, turns, records, usage [[core-service-15](../packages/core-service.md#core-service-15)], [[core-service-10](../packages/core-service.md#core-service-10)]; unit tests.

5. **Fake adapter fixture** — scripted cligent adapter driving deterministic records incl. hidden ones and usage payloads [[core-service-18](../packages/core-service.md#core-service-18)].

6. **Session manager** — one runtime per project session, captain shell with injected loadModule [[core-service-17](../packages/core-service.md#core-service-17)], record bus with hidden filtering at the channel boundary [[core-service-14](../packages/core-service.md#core-service-14)], [[core-service-7](../packages/core-service.md#core-service-7)], [[core-service-8](../packages/core-service.md#core-service-8)], boss turn serialization and abort [[core-service-5](../packages/core-service.md#core-service-5)], [[core-service-6](../packages/core-service.md#core-service-6)].

7. **WebSocket server** — loopback endpoint, hello, subscriptions (session + debug channels), command dispatch, readiness reporting [[core-service-1](../packages/core-service.md#core-service-1)], [[core-service-9](../packages/core-service.md#core-service-9)].

8. **Integration tests** — end-to-end coverage per [[core-service-19](../packages/core-service.md#core-service-19)]..[[core-service-23](../packages/core-service.md#core-service-23)] over a real WebSocket client against the fake adapter.

## Verification

- `npm run build` and `npm test` green from the repo root with the new workspace included.
- Integration tests exercise every core-service test item (core-service-19..23) and open no network connection.
- The protocol module is importable as types without pulling in Node-only runtime code.
