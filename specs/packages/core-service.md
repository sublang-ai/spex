<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# CORE: Core Service

## Intent

This spec covers the Spex core service — the headless Node service
in `packages/core` (the private workspace package
`@sublang/spex-core`): its observable behavior, its implementation
requirements, and its end-to-end integration coverage.
The service owns config, project sessions, the embedded playbook
runtime, and persistence behind one WebSocket API, per
[DR-002](../decisions/002-desktop-app-architecture.md).
Runtime embedding and record routing follow
[DR-003](../decisions/003-runtime-reuse.md): the service embeds the
headless cligent runtime and the playbook captain shell.
Config ownership, persistence, and readiness follow
[DR-004](../decisions/004-config-and-persistence.md): the service
shares the playbook launcher's config file, persistence split, and
adapter readiness rules.
Every behavior in this package is observable over the WebSocket
protocol; the service serves no HTML.
Integration coverage is exercised end to end over the WebSocket
protocol against the scripted fake adapter required by
[CORE-18](#core-18).

## External Behavior

### Endpoint

#### CORE-1

Where the core service is started by a host shell, when startup
completes, the core service shall accept WebSocket connections on a
loopback-only endpoint and report the endpoint address to the host.
When a client connects, the core service shall send a hello message
carrying the protocol version before any other message, so clients
can detect a protocol mismatch before issuing commands.

### Configuration

#### CORE-2

Where the shared config file exists at the path defined by
[DR-004](../decisions/004-config-and-persistence.md), when the core
service starts, the core service shall load and validate the config.
While the core service is running, when the config file's content
changes on disk, the core service shall reload and revalidate the
config without requiring a restart.

On every load and reload:

- On success, the core service shall broadcast the resulting config
  state to all connected clients.
- On failure, the core service shall broadcast a config error naming
  the offending entry and the violated rule, and shall reject
  session creation requests while no valid config is active.
- Live sessions composed under a previously valid config shall
  continue unaffected by a later invalid edit.

Validation shall fail closed on the same defect classes as the
playbook launcher ([CORE-16](#core-16)).

#### CORE-3

Where no config file exists at the shared config path, when the core
service starts, the core service shall write a starter config file
to that path, adopt it as the active config, and report the seeding
to connected clients.
When seeding, the core service shall not overwrite an existing
config file.

### Sessions

#### CORE-4

Where a project is registered (see
[DR-006](../decisions/006-projects-and-forge.md)) and the active
config is valid, when a client requests a session for that project,
the core service shall create a live session whose embedded runtime
is initialized with the project directory as its working directory,
and shall report the new session to subscribed clients.

While a live session exists for a project, when a client requests
another session for the same project, the core service shall reject
the request and create no session.
The core service shall run live sessions for distinct projects
concurrently.

While a session is live, when a client requests its disposal, the
core service shall dispose the session's runtime, report the session
as ended, and accept a subsequent session request for the same
project.

### Boss Turns

#### CORE-5

While a session is live and no boss turn is active on it, when a
client submits Boss composer text for that session, the core service
shall start a boss turn on the session's runtime and stream the
turn-started record to subscribed clients.

While a boss turn is active on a session, when a client submits
further Boss composer text for that session, the core service shall
reject the submission with a busy error and start no turn, so boss
turns on one session run strictly one at a time.

#### CORE-6

While a boss turn is active on a session, when a client requests an
abort for that session, the core service shall abort the active
turn, stream the turn-aborted record to subscribed clients, and
accept a new Boss submission for that session afterwards.

### Record Streaming

#### CORE-7

While a session is live, when the embedded runtime emits a record
not marked hidden, the core service shall deliver that record to
every client subscribed to the session, preserving the runtime's
emission order for each subscriber.

#### CORE-8

While a session is live, when the embedded runtime emits a record
marked hidden (for example judge or router traffic), the core
service shall deliver it only to clients subscribed to the debug
channel and shall not deliver it on any session subscription, per
[DR-003](../decisions/003-runtime-reuse.md).

### Readiness

#### CORE-9

When a client requests adapter readiness, the core service shall
report, for each profile in the active config, a readiness status
derived from the same adapter readiness rules as the playbook
launcher ([DR-004](../decisions/004-config-and-persistence.md)),
naming the unmet requirement for each profile that is not ready.
When the active config changes, the core service shall broadcast
refreshed readiness to connected clients.

### Persistence

#### CORE-10

The core service shall persist sessions, boss turns, records
(including hidden records), and usage totals to the app-local store
as they occur.
Where sessions have been persisted, when the core service starts,
the core service shall serve the stored sessions, turns, records,
and usage over the protocol with the same content and record order
as originally streamed, applying the same visibility filtering as
live streaming ([CORE-8](#core-8)).
Where a session was live at shutdown, when the core service starts,
the core service shall report that session as no longer live.

## Internal Behavior

### Package Layout

#### CORE-11

The `packages/core` workspace package shall build as a headless Node
package that imports no UI framework, no Electron module, and no DOM
API, so the identical package serves the desktop shell and a cloud
server deployment without change.

### Protocol

#### CORE-12

The core package shall define the WebSocket protocol — message
schemas, protocol version, and TypeScript message types — in one
module and export the types from a dedicated entry point free of
Node-only runtime imports, so the UI package consumes the protocol
as type-only imports and never redefines it.
When the protocol changes incompatibly, the protocol version carried
by the hello message ([CORE-1](#core-1))
shall be bumped.

#### CORE-13

When an inbound protocol message is received, the core package shall
validate it against the message schema before acting on it.
When a message fails validation or carries an unknown type, the
core package shall send an error response identifying the failure,
make no state change, and leave the connection open.

### Record Routing

#### CORE-14

The core package shall filter records by visibility
([CORE-8](#core-8)) at the protocol boundary,
before dispatch to any subscription, applying the same filter to
live streaming and to stored-record replay
([CORE-10](#core-10)), so that no message on
a session subscription ever carries a hidden record and clients need
no client-side filtering.

### Persistence Internals

#### CORE-15

The core package shall own the app-local SQLite store defined by
[DR-004](../decisions/004-config-and-persistence.md): it shall
define the schema, record a schema version in the store, and apply
forward migrations at startup before accepting client connections.
When a migration fails, the core package shall stop serving and
report the failure, so a partially migrated store is never served.
The core package shall be the store's only writer, exposing stored
data solely over the protocol.

### Runtime Composition

#### CORE-16

The core package shall compose player identities, the playbook
registry, and runtime options from the shared config with the same
player-id namespacing and fail-closed validation rules as the
playbook launcher, as recorded in
[DR-004](../decisions/004-config-and-persistence.md), so that any
config the launcher accepts or rejects is accepted or rejected
identically by the core package.

#### CORE-17

When a session is created, the core package shall instantiate the
engagement host through the playbook captain shell factory with a
core-provided module loader injected via the shell's dependency
options, keeping playbook module resolution under core control and
the shell's coupling to the core type-only.

### Contract Testing

#### CORE-18

The core contract test suite shall exercise the service end to end
through the WebSocket protocol against a scripted fake adapter that
replays a predetermined record script, using no network access and
no real agent credentials, so protocol behavior is verified
deterministically in CI.

### Endpoint Hardening

#### CORE-24

The core package shall reject WebSocket handshakes that do not
present the service's session token, and handshakes whose Origin
header names a foreign web origin, so that neither arbitrary local
web pages nor remote pages can drive the control plane; embedding
shells receive the token at startup and pass it to the UI.

### Compile Lifecycle

#### CORE-25

The core package shall run at most one compile per playbook id at a
time: while a compile is in flight for a playbook id, a further
`compile.run` for that id shall be rejected fail-closed with a
`busy` error naming the id, per
[DR-010](../decisions/010-interface-craft.md) principle 5.
The core package shall accept a `compile.abort` command that
cancels the in-flight compile for a playbook id by terminating the
toolchain child process, emits a final canceled progress line, and
makes the pending `compile.run` reply with an `aborted` error; no
further progress output shall follow the canceled line.
When `compile.abort` names a playbook id with no compile in
flight, the core package shall reject it with a `not_found` error.

### Readiness Reporting

#### CORE-26

In addition to the per-profile entries required by
[CORE-9](#core-9), the core package shall
emit a readiness entry for each adapter shorthand the active config
references directly — the captain reference and every playbook
player reference that names an adapter rather than a profiles
entry, under the same reference-resolution rule as the launcher
([CORE-16](#core-16)) — deduplicated across references, so that a
config using only shorthands still surfaces unmet adapter
requirements before the first turn fails.

## Verification

### Session Coverage

#### CORE-19
Verifies [CORE-4](#core-4), [CORE-5](#core-5), [CORE-7](#core-7), [CORE-18](#core-18).

Where the core service runs with a valid config and the scripted
fake adapter, the test suite shall connect a WebSocket client,
create a session for a temporary project directory, submit a Boss
turn, and assert that:

- the session's runtime working directory is the project directory;
- every non-hidden scripted record arrives on the session
  subscription in script order;
- the turn ends with a finished record;
- a second Boss submission during the turn is rejected with a busy
  error and starts no turn;
- no network connection is opened during the run.

### Record Visibility Coverage

#### CORE-20
Verifies [CORE-8](#core-8), [CORE-14](#core-14).

Where the fake adapter script contains records marked hidden, the
test suite shall subscribe one client to the session and a second
client to the debug channel, and assert that the session subscriber
receives no hidden record while the debug subscriber receives every
hidden record.

### Configuration Coverage

#### CORE-21
Verifies [CORE-2](#core-2), [CORE-16](#core-16).

Where the config file carries a defect from each launcher
fail-closed defect class recorded in
[DR-004](../decisions/004-config-and-persistence.md), the test suite
shall assert, per defect, that the core service reports a config
error naming the offending entry and rejects a session creation
request while that config is active.

### Persistence Coverage

#### CORE-22
Verifies [CORE-10](#core-10), [CORE-15](#core-15).

Where a session has completed a Boss turn, the test suite shall stop
the core service, start it again on the same store file, and assert
that the session, its turns, its records (content and order), and
its usage totals are served identically after restart, and that a
session live at shutdown is reported as no longer live.

### Readiness Coverage

#### CORE-23
Verifies [CORE-9](#core-9).

Where the config defines both a profile whose adapter readiness
requirements are satisfied and one whose requirements are not (via
controlled environment variables and home-directory fixtures), the
test suite shall assert that readiness reporting marks each profile
accordingly and names the unmet requirement for the not-ready
profile.

### Compile Lifecycle Coverage

#### CORE-27
Verifies [CORE-25](#core-25).

Where the core service runs with an injected compile spawner whose
toolchain run blocks until canceled, the test suite shall start a
compile over the protocol and assert that:

- a second `compile.run` for the same playbook id is rejected with
  a `busy` error naming the id while the first is in flight;
- `compile.abort` for that id makes the pending `compile.run`
  reply with an `aborted` error, and the final progress line
  broadcast for the playbook is the canceled marker;
- `compile.abort` for a playbook id with no compile in flight is
  rejected with a `not_found` error;
- after cancellation, a new `compile.run` for the same id is
  accepted.

### Shorthand Readiness Coverage

#### CORE-28
Verifies [CORE-26](#core-26).

Where the config references adapters by shorthand — as the captain
and as a playbook player — alongside a declared profile, the test
suite shall assert that readiness reporting includes exactly one
entry per referenced shorthand, marked per the adapter readiness
rules with the unmet requirement named for a not-ready shorthand,
while the declared profile keeps its own entry.
