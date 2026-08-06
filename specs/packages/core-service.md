<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# core-service: Core Service

## Intent

This spec covers the Spex core service — the headless Node service in `packages/core` (the private workspace package `@sublang/spex-core`): its observable behavior, its implementation requirements, and its end-to-end integration coverage.
The service owns config, project sessions, the embedded playbook runtime, and persistence behind one WebSocket API: it embeds the headless cligent runtime and the playbook captain shell, and it shares the playbook launcher's config file, persistence split, and adapter readiness rules.
Every behavior in this package is observable over the WebSocket protocol; the service serves no HTML, and integration coverage runs end to end against a scripted fake adapter.

## External Behavior

### Endpoint

#### core-service-1

Where the core service is started by a host shell, when startup completes, the core service shall accept WebSocket connections on a loopback-only endpoint and report the endpoint address to the host:

- When a client connects, the core service sends a hello message carrying the protocol version before any other message, so clients can detect a protocol mismatch before issuing commands.

### Configuration

#### core-service-2

Where the shared config file exists at the path defined by [DR-004](../decisions/004-config-and-persistence.md), when the core service starts, the core service shall load and validate the config, reloading and revalidating it without a restart whenever the file's content changes on disk while the service runs.

On every load and reload:

- On success, the resulting config state is broadcast to all connected clients.
- On failure, a config error naming the offending entry and the violated rule is broadcast, and session creation requests are rejected while no valid config is active.
- Live sessions composed under a previously valid config continue unaffected by a later invalid edit.
- Where the file is a profiles-era config, the load migrates it in place per the launcher's semantics ([DR-019](../decisions/019-inline-agent-configuration.md)): named profiles inline into agent blocks, the `profiles` map is deleted, the pre-migration file is backed up beside the config with comments surviving, and a `profile` naming a missing entry is a config error that leaves the file untouched.
- Validation fails closed on the same defect classes as the playbook launcher [[core-service-16](#core-service-16)].

#### core-service-3

Where no config file exists at the shared config path, when the core service starts, the core service shall write a starter config file to that path, adopt it as the active config, and report the seeding to connected clients:

- When seeding, the core service does not overwrite an existing config file.

### Sessions

#### core-service-4

Where a project is registered ([DR-006](../decisions/006-projects-and-forge.md)) and the active config is valid, when a client requests a session for that project, the core service shall create a live session whose embedded runtime is initialized with the project directory as its working directory, and shall report the new session to subscribed clients:

- While a live session exists for a project, a further session request for the same project is rejected and creates no session.
- Live sessions for distinct projects run concurrently.
- While a session is live, a client's disposal request disposes the session's runtime, reports the session as ended, and a subsequent session request for the same project is accepted.

### Boss Turns

#### core-service-5

While a session is live and no boss turn is active on it, when a client submits Boss composer text for that session, the core service shall start a boss turn on the session's runtime and stream the turn-started record to subscribed clients:

- While a boss turn is active on a session, a further Boss submission for that session is rejected with a busy error and starts no turn, so boss turns on one session run strictly one at a time.

#### core-service-6

While a boss turn is active on a session, when a client requests an abort for that session, the core service shall abort the active turn, stream the turn-aborted record to subscribed clients, and accept a new Boss submission for that session afterwards.

### Record Streaming

#### core-service-7

While a session is live, when the embedded runtime emits a record not marked hidden, the core service shall deliver that record to every client subscribed to the session, preserving the runtime's emission order for each subscriber.

#### core-service-8

While a session is live, when the embedded runtime emits a record marked hidden (for example judge or router traffic), the core service shall deliver it only to clients subscribed to the debug channel and shall not deliver it on any session subscription, per [DR-003](../decisions/003-runtime-reuse.md).

### Readiness

#### core-service-9

When a client requests adapter readiness, the core service shall report one deduplicated entry per adapter the active config references, each entry naming the positions using that adapter (`captain`, `<playbook>.<role>`) and carrying a readiness status derived from the same adapter readiness rules as the playbook launcher — the runtime half and the credential half together ([DR-024](../decisions/024-app-supplied-agent-runtimes.md), [DR-004](../decisions/004-config-and-persistence.md)) — naming the unmet requirement for each adapter that is not ready and reporting null readiness with verify-yourself guidance for an adapter with no preflight rule:

- When the active config changes, refreshed readiness is broadcast to connected clients.

### Persistence

#### core-service-10

The core service shall persist sessions, boss turns, records (including hidden records), and usage totals to the app-local store as they occur:

- Where sessions have been persisted, a startup serves the stored sessions, turns, records, and usage over the protocol with the same content and record order as originally streamed, applying the same visibility filtering as live streaming [[core-service-8](#core-service-8)].
- Where a session was live at shutdown, the next startup reports that session as no longer live.

## Internal Behavior

### Package Layout

#### core-service-11

The `packages/core` workspace package shall build as a headless Node package that imports no UI framework, no Electron module, and no DOM API, so the identical package serves the desktop shell and a cloud server deployment without change.

### Protocol

#### core-service-12

The core package shall define the WebSocket protocol — message schemas, protocol version, and TypeScript message types — in one module and export the types from a dedicated entry point free of Node-only runtime imports, so the UI package consumes the protocol as type-only imports and never redefines it:

- When the protocol changes incompatibly, the protocol version carried by the hello message [[core-service-1](#core-service-1)] is bumped.

#### core-service-13

When an inbound protocol message is received, the core package shall validate it against the message schema before acting on it:

- When a message fails validation or carries an unknown type, the core package sends an error response identifying the failure, makes no state change, and leaves the connection open.

### Record Routing

#### core-service-14

The core package shall filter records by visibility [[core-service-8](#core-service-8)] at the protocol boundary, before dispatch to any subscription, applying the same filter to live streaming and to stored-record replay [[core-service-10](#core-service-10)], so that no message on a session subscription ever carries a hidden record and clients need no client-side filtering.

### Persistence Internals

#### core-service-15

The core package shall own the app-local SQLite store defined by [DR-004](../decisions/004-config-and-persistence.md): it shall define the schema, record a schema version in the store, and apply forward migrations at startup before accepting client connections:

- When a migration fails, the core package stops serving and reports the failure, so a partially migrated store is never served.
- The core package is the store's only writer, exposing stored data solely over the protocol.

### Runtime Composition

#### core-service-16

The core package shall compose player identities, the playbook registry, and runtime options from the shared config with the same player-id namespacing and fail-closed validation rules as the playbook launcher — as recorded in [DR-004](../decisions/004-config-and-persistence.md) and amended by [DR-019](../decisions/019-inline-agent-configuration.md): inline agent blocks with scalar adapter ids normalizing to bare-adapter blocks, adapter ids bounded by the embedded runtime's known set, adapter-scoped effort vocabularies, and the composed captain options carrying the Captain's adapter alongside the playbook enablement — so that any config the launcher accepts or rejects is accepted or rejected identically by the core package.

#### core-service-17

When a session is created, the core package shall instantiate the engagement host through the playbook captain shell factory with a core-provided module loader injected via the shell's dependency options, keeping playbook module resolution under core control and the shell's coupling to the core type-only.

#### core-service-29

Where a configured playbook's registry entry accepts a `cwd` option and the config block leaves it unset, when a session is created, the core package shall pass the session project's directory as that playbook's `cwd` option in the captain options ([DR-014](../decisions/014-released-toolchain.md)):

- A `cwd` set in the config block passes through unchanged.

### Contract Testing

#### core-service-18

The core contract test suite shall exercise the service end to end through the WebSocket protocol against a scripted fake adapter that replays a predetermined record script, using no network access and no real agent credentials, so protocol behavior is verified deterministically in CI.

### Endpoint Hardening

#### core-service-24

The core package shall reject WebSocket handshakes that do not present the service's session token, and handshakes whose Origin header names a foreign web origin, so that neither arbitrary local web pages nor remote pages can drive the control plane; embedding shells receive the token at startup and pass it to the UI.

### Compile Lifecycle

#### core-service-25

The core package shall run at most one compile per playbook id at a time and accept a `compile.abort` command that cancels the in-flight compile for a playbook id:

- While a compile is in flight for a playbook id, a further `compile.run` for that id is rejected fail-closed with a `busy` error naming the id, per [DR-010](../decisions/010-interface-craft.md) principle 5.
- `compile.abort` cancels the in-flight compile by terminating the toolchain child process, emits a final canceled progress line, and makes the pending `compile.run` reply with an `aborted` error; no further progress output follows the canceled line.
- When `compile.abort` names a playbook id with no compile in flight, the core package rejects it with a `not_found` error.

### Readiness Reporting

#### core-service-26

The readiness report of [[core-service-9](#core-service-9)] shall be keyed by adapter: the core package shall resolve every configured position — the captain and each playbook player, whether an inline agent block or a scalar adapter id, under the same resolution rule as the launcher [[core-service-16](#core-service-16)] — to its adapter and emit exactly one entry per distinct adapter listing those positions, so that no referenced adapter's unmet requirement is hidden by deduplication and a hand-written scalar still surfaces its adapter's requirements before the first turn fails.

## Verification

### Session Coverage

#### core-service-19

Where the core service runs with a valid config and the scripted fake adapter [[core-service-18](#core-service-18)], the test suite shall connect a WebSocket client, create a session for a temporary project directory, submit a Boss turn, and assert that:

- the session's runtime working directory is the project directory [[core-service-4](#core-service-4)];
- every non-hidden scripted record arrives on the session subscription in script order [[core-service-7](#core-service-7)];
- the turn ends with a finished record;
- a second Boss submission during the turn is rejected with a busy error and starts no turn [[core-service-5](#core-service-5)];
- no network connection is opened during the run [[core-service-18](#core-service-18)].

### Record Visibility Coverage

#### core-service-20

Where the fake adapter script contains records marked hidden, the test suite shall subscribe one client to the session and a second client to the debug channel, and assert that the session subscriber receives no hidden record [[core-service-8](#core-service-8)] while the debug subscriber receives every hidden record [[core-service-14](#core-service-14)].

### Configuration Coverage

#### core-service-21

Where the config file carries a defect from each launcher fail-closed defect class recorded in [DR-004](../decisions/004-config-and-persistence.md) as amended by [DR-019](../decisions/019-inline-agent-configuration.md) [[core-service-16](#core-service-16)], the test suite shall assert, per defect, that the core service reports a config error naming the offending entry and rejects a session creation request while that config is active [[core-service-2](#core-service-2)].

### Persistence Coverage

#### core-service-22

Where a session has completed a Boss turn, the test suite shall stop the core service, start it again on the same app-local store file [[core-service-15](#core-service-15)], and assert that the session, its turns, its records (content and order), and its usage totals are served identically after restart [[core-service-10](#core-service-10)], and that a session live at shutdown is reported as no longer live.

### Readiness Coverage

#### core-service-23

Where the config's agent blocks reference both an adapter whose readiness requirements are satisfied and one whose requirements are not (via controlled environment variables and home-directory fixtures), the test suite shall assert that readiness reporting marks each adapter's entry accordingly and names the unmet requirement for the not-ready adapter [[core-service-9](#core-service-9)].

### Compile Lifecycle Coverage

#### core-service-27

Where the core service runs with an injected compile spawner whose toolchain run blocks until canceled, the test suite shall start a compile over the protocol and assert that:

- a second `compile.run` for the same playbook id is rejected with a `busy` error naming the id while the first is in flight [[core-service-25](#core-service-25)];
- `compile.abort` for that id makes the pending `compile.run` reply with an `aborted` error, and the final progress line broadcast for the playbook is the canceled marker [[core-service-25](#core-service-25)];
- `compile.abort` for a playbook id with no compile in flight is rejected with a `not_found` error;
- after cancellation, a new `compile.run` for the same id is accepted.

### Readiness Dedup Coverage

#### core-service-28

Where the config references one adapter from several positions — as the captain and as a playbook player, including a hand-written scalar adapter id — the test suite shall assert that readiness reporting includes exactly one entry for that adapter [[core-service-26](#core-service-26)], naming each referencing position, marked per the adapter readiness rules with the unmet requirement named when the adapter is not ready [[core-service-9](#core-service-9)].
