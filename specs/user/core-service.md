<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# CORE: Core Service Behavior

## Intent

This spec defines the observable behavior of the Spex core service:
the headless Node service in `packages/core` that owns config,
project sessions, the embedded playbook runtime, and persistence
behind one WebSocket API, per
[DR-002](../decisions/002-desktop-app-architecture.md).
The service embeds the headless cligent runtime and the playbook
captain shell per [DR-003](../decisions/003-runtime-reuse.md), and
shares the playbook launcher's config file, persistence split, and
adapter readiness rules per
[DR-004](../decisions/004-config-and-persistence.md).
Every behavior in this package is observable over the WebSocket
protocol; the service serves no HTML.

## Endpoint

### CORE-1

Where the core service is started by a host shell, when startup
completes, the core service shall accept WebSocket connections on a
loopback-only endpoint and report the endpoint address to the host.
When a client connects, the core service shall send a hello message
carrying the protocol version before any other message, so clients
can detect a protocol mismatch before issuing commands.

## Configuration

### CORE-2

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
playbook launcher ([CORE-16](../dev/core-service.md#core-16)).

### CORE-3

Where no config file exists at the shared config path, when the core
service starts, the core service shall write a starter config file
to that path, adopt it as the active config, and report the seeding
to connected clients.
When seeding, the core service shall not overwrite an existing
config file.

## Sessions

### CORE-4

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

## Boss Turns

### CORE-5

While a session is live and no boss turn is active on it, when a
client submits Boss composer text for that session, the core service
shall start a boss turn on the session's runtime and stream the
turn-started record to subscribed clients.

While a boss turn is active on a session, when a client submits
further Boss composer text for that session, the core service shall
reject the submission with a busy error and start no turn, so boss
turns on one session run strictly one at a time.

### CORE-6

While a boss turn is active on a session, when a client requests an
abort for that session, the core service shall abort the active
turn, stream the turn-aborted record to subscribed clients, and
accept a new Boss submission for that session afterwards.

## Record Streaming

### CORE-7

While a session is live, when the embedded runtime emits a record
not marked hidden, the core service shall deliver that record to
every client subscribed to the session, preserving the runtime's
emission order for each subscriber.

### CORE-8

While a session is live, when the embedded runtime emits a record
marked hidden (for example judge or router traffic), the core
service shall deliver it only to clients subscribed to the debug
channel and shall not deliver it on any session subscription, per
[DR-003](../decisions/003-runtime-reuse.md).

## Readiness

### CORE-9

When a client requests adapter readiness, the core service shall
report, for each profile in the active config, a readiness status
derived from the same adapter readiness rules as the playbook
launcher ([DR-004](../decisions/004-config-and-persistence.md)),
naming the unmet requirement for each profile that is not ready.
When the active config changes, the core service shall broadcast
refreshed readiness to connected clients.

## Persistence

### CORE-10

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
