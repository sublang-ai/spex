<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# CORE: Core Service Implementation Requirements

## Intent

This spec defines implementation requirements for the Spex core
service package (`packages/core`, the private workspace package
`@sublang/spex-core`), per
[DR-002](../decisions/002-desktop-app-architecture.md).
Runtime embedding and record routing follow
[DR-003](../decisions/003-runtime-reuse.md); config ownership,
persistence, and readiness follow
[DR-004](../decisions/004-config-and-persistence.md).

## Package Layout

### CORE-11

The `packages/core` workspace package shall build as a headless Node
package that imports no UI framework, no Electron module, and no DOM
API, so the identical package serves the desktop shell and a cloud
server deployment without change.

## Protocol

### CORE-12

The core package shall define the WebSocket protocol — message
schemas, protocol version, and TypeScript message types — in one
module and export the types from a dedicated entry point free of
Node-only runtime imports, so the UI package consumes the protocol
as type-only imports and never redefines it.
When the protocol changes incompatibly, the protocol version carried
by the hello message ([CORE-1](../user/core-service.md#core-1))
shall be bumped.

### CORE-13

When an inbound protocol message is received, the core package shall
validate it against the message schema before acting on it.
When a message fails validation or carries an unknown type, the
core package shall send an error response identifying the failure,
make no state change, and leave the connection open.

## Record Routing

### CORE-14

The core package shall filter records by visibility
([CORE-8](../user/core-service.md#core-8)) at the protocol boundary,
before dispatch to any subscription, applying the same filter to
live streaming and to stored-record replay
([CORE-10](../user/core-service.md#core-10)), so that no message on
a session subscription ever carries a hidden record and clients need
no client-side filtering.

## Persistence

### CORE-15

The core package shall own the app-local SQLite store defined by
[DR-004](../decisions/004-config-and-persistence.md): it shall
define the schema, record a schema version in the store, and apply
forward migrations at startup before accepting client connections.
When a migration fails, the core package shall stop serving and
report the failure, so a partially migrated store is never served.
The core package shall be the store's only writer, exposing stored
data solely over the protocol.

## Runtime Composition

### CORE-16

The core package shall compose player identities, the playbook
registry, and runtime options from the shared config with the same
player-id namespacing and fail-closed validation rules as the
playbook launcher, as recorded in
[DR-004](../decisions/004-config-and-persistence.md), so that any
config the launcher accepts or rejects is accepted or rejected
identically by the core package.

### CORE-17

When a session is created, the core package shall instantiate the
engagement host through the playbook captain shell factory with a
core-provided module loader injected via the shell's dependency
options, keeping playbook module resolution under core control and
the shell's coupling to the core type-only.

## Contract Testing

### CORE-18

The core contract test suite shall exercise the service end to end
through the WebSocket protocol against a scripted fake adapter that
replays a predetermined record script, using no network access and
no real agent credentials, so protocol behavior is verified
deterministically in CI.
