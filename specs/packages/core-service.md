<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# core-service: Core Service

## Intent

This spec covers the Spex core service — the headless Node service in `packages/core` (the private workspace package `@sublang/spex-core`): its observable behavior, its implementation requirements, and its end-to-end integration coverage.
The service owns config, project sessions, the intent ledger, the embedded playbook runtime, and persistence behind one WebSocket API: it embeds the headless cligent runtime and the playbook captain shell, and it shares the playbook launcher's config file, its session store ([DR-036](../decisions/036-file-state-store.md)), and its adapter readiness rules.
Every behavior in this package is observable over the WebSocket protocol; the service serves no HTML, and integration coverage runs end to end against a scripted fake adapter.

## External Behavior

### Endpoint

#### core-service-1

Where the core service is started by a host shell, when startup completes, the core service shall accept WebSocket connections on its endpoint — a loopback-only socket the service binds itself by default, or a shell-supplied HTTP server the service attaches to, leaving binding and transport security to that shell ([DR-033](../decisions/033-remote-gui-serving.md)) — and report the endpoint address to the host:

- When a client connects, the core service sends a hello message carrying the protocol version before any other message, so clients can detect a protocol mismatch before issuing commands.

#### core-service-24

The core package shall reject WebSocket handshakes that do not present the service's session token, and handshakes whose Origin header names a foreign web origin, so that neither arbitrary local web pages nor remote pages can drive the control plane; embedding shells receive the token at startup and pass it to the UI:

An Origin is not foreign only in these cases:

| Origin | Admitted as |
| --- | --- |
| absent | a non-browser client |
| `null`, or a `file://` origin | the packaged renderer |
| `http(s)://localhost` or `http(s)://127.0.0.1`, any port | a local dev page |
| the host the handshake request itself addressed | a page the embedding shell serves ([DR-033](../decisions/033-remote-gui-serving.md)) |

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
- Where the runtime's own disposal fails, the session is still reported as ended and its project still accepts a new session, with the failure reported to the requesting client — a runtime that failed to dispose is unusable, so holding its project would strand it until a restart.

#### core-service-32

When a client requests the session list, the core service shall reply with every stored session's lifecycle fields and its conversation summary ([DR-029](../decisions/029-session-history-home.md)):

- each entry carries the session's project, creation and end times, and liveness;
- each entry carries a title — the first Boss turn's text — absent when the session held no turn;
- each entry carries its turn count and whether it ended holding a failure record.

#### core-service-34

When the core service reports a session's state to subscribed clients — at each turn's start and end, and when the session ends — the report shall carry that session's conversation summary as the listing carries it [[core-service-32](#core-service-32)] ([DR-029](../decisions/029-session-history-home.md)), never the summary the session was created with:

- A session is named from the turn that starts, not the turn that finishes, so a running session is never listed as having said nothing.

### Boss Turns

#### core-service-5

While a session is live and no boss turn is active on it, when a client submits Boss composer text for that session, the core service shall start a boss turn on the session's runtime and stream the turn-started record to subscribed clients:

- While a boss turn is active on a session, a further Boss submission for that session is rejected with a busy error and starts no turn, so boss turns on one session run strictly one at a time.

#### core-service-6

While a boss turn is active on a session, when a client requests an abort for that session, the core service shall abort the active turn, stream the turn-aborted record to subscribed clients, and accept a new Boss submission for that session afterwards.

### Intent Ledger

#### core-service-42

When a client sends `intent.queue` for a registered project ([DR-006](../decisions/006-projects-and-forge.md)), the core service shall store a new open intent — the request's text, its optional source (kind, reference, and URL), its optional after-link, and its queue position — reply with the stored intent, and announce the write [[core-service-51](#core-service-51)] ([DR-035](../decisions/035-intent-ledger.md)):

- the request places the intent at the head or the tail of the project's queue as it asks, tail when it says nothing;
- where the source kind is issue, PR, or record and the project already holds an open intent with the same source kind and reference, the request is rejected with a `conflict` error naming that intent and stores nothing — at most one open intent per source artifact per project;
- a chat-sourced or unsourced intent is never deduplicated.

#### core-service-43

While an intent is queued [[core-service-47](#core-service-47)], when a client sends `intent.edit` for it, the core service shall replace the intent's text and announce the write [[core-service-51](#core-service-51)]:

- an edit of a dispatched or closed intent is rejected: from its dispatch binding on, the text is history ([DR-035](../decisions/035-intent-ledger.md)).

#### core-service-44

When a client sends `intent.move` for an intent, the core service shall reorder the intent within its own project's queue — to the position after a named intent of that project, or to the head when none is named — and announce the write [[core-service-51](#core-service-51)]:

- a move naming an intent of another project is rejected: only a project's own order has dispatch meaning ([DR-035](../decisions/035-intent-ledger.md)).

#### core-service-45

When a client sends `intent.link` for an intent, the core service shall set the intent's single after-link to the named open intent — of any project — or clear it when the request names none, and announce the write [[core-service-51](#core-service-51)]:

- a link to a closed intent is rejected;
- a link that would close a cycle of after-links is rejected fail-closed;
- while its after-link names a still-open intent, the intent is blocked — ineligible for dispatch [[core-service-47](#core-service-47)] — and the block lifts by derivation when that predecessor closes, with nothing written.

#### core-service-46

When a client sends `intent.close` for an open intent with a verdict of `done` or `dropped`, the core service shall record the verdict and its time on the intent — the row kept, never deleted [[core-service-52](#core-service-52)] — and announce the write [[core-service-51](#core-service-51)]:

- `done` is accepted only while a turn the intent attributes [[core-service-47](#core-service-47)] ended finished with none later active, and is otherwise rejected — confirming work that never ran would falsify the ledger ([DR-035](../decisions/035-intent-ledger.md));
- `dropped` is legal on any open intent;
- a close of an already-closed intent is rejected.

#### core-service-47

While a session is live, when a client's Boss submission for it [[core-service-5](#core-service-5)] carries an intent id, the core service shall validate the intent at submission — open, of the session's project, queued, and unblocked [[core-service-45](#core-service-45)] — and stamp the dispatch (session, turn, and time) onto the intent when and only when the submitted turn starts, announcing the write [[core-service-51](#core-service-51)] ([DR-035](../decisions/035-intent-ledger.md)):

- a submission whose intent fails validation is rejected and starts no turn;
- a submission that never starts a turn stamps nothing, and the intent stays queued;
- a later dispatch of the same intent re-writes the stamps;
- the stamp attributes turns: an intent's turns run from its dispatch turn up to, not including, the next turn in the session that is another intent's dispatch turn, so the newest dispatched open intent owns follow-up turns;
- an intent is queued while it is open and holds no standing dispatch — never dispatched, its dispatch turn ended aborted, or its dispatching session ended before that turn finished — the release derived, never written: the stamps remain and the queue position keeps its rank.

#### core-service-48

When a client sends `session.viewed` naming a session and a turn, the core service shall persist that turn as the session's last-viewed marker in the state root's preferences file [[core-service-15](#core-service-15)], so review state derives from stored data alone [[core-service-49](#core-service-49)] and survives a restart.

#### core-service-49

When a client sends `ledger.get`, the core service shall reply with the cross-project ledger read model, derived solely from the stored intents, turns, records, and viewed markers — the same stored data yielding an identical reply after a restart [[core-service-10](#core-service-10)] ([DR-035](../decisions/035-intent-ledger.md)):

| Part | Content |
| --- | --- |
| Attention entries | two bands — intents standing interrupted on the Boss (a pending question, a permission request, or an unacknowledged failure among their turns), then intents finished and awaiting a verdict — each band ordered longest waiting first by condition onset |
| Run stats | each finished entry carries stats folded from its intent's attributed turns [[core-service-47](#core-service-47)]: turn count, elapsed time, and the review rounds when any |
| Session stand-ins | a session bound to no intent enters the same bands for its own question, permission request, failure, or finished turn past the viewed marker [[core-service-48](#core-service-48)] |
| Project groups | per project: the live session's state, the queue in rank order with each blocked intent marked [[core-service-45](#core-service-45)], and the open intents' source-artifact references [[core-service-42](#core-service-42)] |
| Badge | the count of all attention entries |

#### core-service-50

When a client sends `ledger.history` for a project, the core service shall reply with one page of that project's closed intents, newest-closed first, the same stored data yielding identical pages after a restart [[core-service-10](#core-service-10)]:

- a page holds at most twenty rows and carries a cursor naming its last row's close time and id;
- a request carrying a prior page's cursor returns the page after it, overlapping nothing.

#### core-service-51

When the intents table is written [[core-service-52](#core-service-52)], or a session event lands that can change a derived intent state — a turn's start, finish, or abort, a session's end, or an interruption-condition record — the core service shall broadcast an `intents.changed` message naming the affected project to subscribed clients, so every consumer re-reads the one core-side fold [[core-service-49](#core-service-49)] instead of deriving its own ([DR-035](../decisions/035-intent-ledger.md)).

### Record Streaming

#### core-service-7

While a session is live, when the embedded runtime emits a record not marked hidden, the core service shall deliver that record to every client subscribed to the session, preserving the runtime's emission order for each subscriber.

#### core-service-8

While a session is live, when the embedded runtime emits a record marked hidden (for example judge or router traffic), the core service shall deliver it only to clients subscribed to the debug channel and shall not deliver it on any session subscription, per [DR-003](../decisions/003-runtime-reuse.md).

#### core-service-30

While a session is live, when the embedded runtime emits a captain result record marked hidden whose result reports an error, the core service shall synthesize a visible failure record carrying the underlying error text into the session stream ([DR-028](../decisions/028-run-machine-view.md)) — the cause reaches every session subscriber [[core-service-7](#core-service-7)] while the hidden record itself stays off the session channel [[core-service-8](#core-service-8)].

#### core-service-36

While a session is live, when the embedded runtime emits a player record, the core service shall deliver and persist it carrying the role of the call it belongs to ([DR-032](../decisions/032-session-players.md)), so a player several roles share is read as a sequence of calls rather than one voice:

- a `player.call.started` trace opens a call on the player it names, and that player's `player.call.finished` closes it;
- a player record between them carries the opening trace's role, and the closing record carries it too;
- a trace naming no resolved player opens nothing, and a player record outside any open call carries no role;
- a replayed record carries the same role the live stream carried [[core-service-10](#core-service-10)].

### Readiness

#### core-service-9

When a client requests adapter readiness, the core service shall report one deduplicated entry per adapter the active config references, each entry naming the positions using that adapter — `captain`, and each session player as `<player>` followed by the `<playbook>.<role>` bindings it answers ([DR-032](../decisions/032-session-players.md)) — and carrying a readiness status derived from the same adapter readiness rules as the playbook launcher — the runtime half and the credential half together ([DR-024](../decisions/024-app-supplied-agent-runtimes.md), [DR-004](../decisions/004-config-and-persistence.md)) — naming the unmet requirement for each adapter that is not ready and reporting null readiness with verify-yourself guidance for an adapter with no preflight rule:

- When the active config changes, refreshed readiness is broadcast to connected clients; a reload superseded by a newer one — before committing, or while its runtime probes are in flight — commits and broadcasts nothing, so the state and readiness clients hold always correspond to the newest configuration read.

### Persistence

#### core-service-10

The core service shall persist each session as files in the shared session store as records occur — the session's record stream appended one record per line (hidden records included), beside its manifest and its project-binding sidecar ([DR-036](../decisions/036-file-state-store.md)):

- Where sessions have been persisted, a startup serves the stored sessions, turns, records, and usage over the protocol with the same content and record order as originally streamed, applying the same visibility filtering as live streaming [[core-service-8](#core-service-8)] — turns, titles, and usage totals folded from the stored stream, never separately stored.
- Where a session was live at shutdown, the next startup reports that session as no longer live.
- The synthesized visible failure record [[core-service-30](#core-service-30)] is persisted in the stream, so replay carries what live subscribers saw.
- The stream is a token-free replay projection: provider resume tokens are stripped before a record is served or persisted, the session manifest being their only durable home ([DR-036](../decisions/036-file-state-store.md)).
- When a record cannot be durably appended, the record is still delivered and served from memory, no further stream write is attempted for that session, and the session's listing marks the stream incomplete after its last durable sequence — truncated history is never presented as complete.

#### core-service-60

The core service shall serve every session present in the shared session store's directory — the directory the shared config's `sessions` key names, defaulting to the playbook CLI's own sessions directory ([DR-036](../decisions/036-file-state-store.md)) — whether found there at startup or written by another host while the service runs:

- such a session binds to the registered project whose path is the session's recorded working directory, and lists non-live [[core-service-32](#core-service-32)] with its records served per [[core-service-10](#core-service-10)]; a session matching no registered project is not listed;
- an arrival or change while the service runs is announced to subscribed clients as a session-state report, with `intents.changed` where a derived intent state can change [[core-service-51](#core-service-51)].

#### core-service-65

While another host's lease holds a session in the shared session store, the core service shall write none of that session's files, so per-session single-writer holds across hosts ([DR-036](../decisions/036-file-state-store.md)).

#### core-service-61

When the core service starts against a state root that another core instance holds, the core service shall refuse to serve, reporting the holding instance to the host — one core per state root at a time ([DR-036](../decisions/036-file-state-store.md)).

#### core-service-64

Where the host shell names a legacy SQLite store, when the core service starts on a state root that has not yet imported it, the core service shall import the store's rows into the file state once, before serving — the imported data served identically to data written natively [[core-service-10](#core-service-10)], and the legacy file left in place ([DR-036](../decisions/036-file-state-store.md)):

- The same import relocates a legacy library directory into the state root, rewriting the shared config's `from` paths that point into it with the comment-preserving targeted edit ([DR-005](../decisions/005-compilation-integration.md)).

### Shutdown

#### core-service-39

When a host shell stops the core service, the core service shall attempt disposal of every live session's runtime, close its endpoint and its store, and report the disposal failures to the host once every session has been attempted:

- One session's disposal failure neither skips another session's disposal nor leaves the endpoint or the store open, so no live runtime survives a stop because an earlier one failed.
- Each attempted session is recorded as ended whether or not its runtime disposal succeeded [[core-service-4](#core-service-4)].

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

The core package shall own the file state of [DR-036](../decisions/036-file-state-store.md) — the state root's registry, intent-act-log, preferences, and forge-cache files, and the per-session files it writes into the shared session store — defining each file kind with a version marker and applying forward migrations at startup before accepting client connections:

- When a migration fails, the core package stops serving and reports the failure, so a partially migrated root is never served.
- The core package is the only writer of the Spex-owned files, exposing stored data solely over the protocol; session manifests are written through the shared session-store module.
- A released migration is never edited: a format change is a new migration, so files written by an earlier release open rather than failing on a field they have never seen.

### Intent Storage

#### core-service-52

The core package shall hold intents in one per-project append-only act log of acts and provenance only — no state or status field, every visible state derived at read time by folding the acts [[core-service-49](#core-service-49)] — kept in the state root [[core-service-15](#core-service-15)] and appended solely by the intent commands ([[core-service-42](#core-service-42)] [[core-service-43](#core-service-43)] [[core-service-44](#core-service-44)] [[core-service-45](#core-service-45)] [[core-service-46](#core-service-46)]) and the dispatch stamp [[core-service-47](#core-service-47)] ([DR-035](../decisions/035-intent-ledger.md), [DR-036](../decisions/036-file-state-store.md)):

| Field(s) | Content |
| --- | --- |
| `id` | the intent's identifier |
| `projectId` | the owning project |
| `text` | the staged Boss turn text; its first line is the display title |
| `source` (`kind`, `ref`, `url`) | provenance — issue, PR, record, or chat, with reference and URL — absent when unsourced |
| `rank` | the per-project lexicographic order key |
| `afterId` | the single optional predecessor intent, of any project |
| `createdAt` | the capture time |
| `dispatched` (`sessionId`, `turnId`, `at`) | the dispatch stamp, re-written by a later dispatch |
| `closedAt`, `closedAs` | the close time and verdict — `done` or `dropped` |

- An act is never deleted or rewritten: an edit, move, link, dispatch, or close appends, the fold takes each field's latest act, and a dropped intent keeps its struck fold — permanent deletion waits for its own decision ([DR-035](../decisions/035-intent-ledger.md)).

### Runtime Composition

#### core-service-16

The core package shall compose the session-player roster, the playbook registry, and runtime options from the shared config with the same fail-closed validation rules as the playbook launcher — as recorded in [DR-004](../decisions/004-config-and-persistence.md) and amended by [DR-019](../decisions/019-inline-agent-configuration.md) and [DR-032](../decisions/032-session-players.md) — so that any config the launcher accepts or rejects is accepted or rejected identically by the core package:

| Rule | Composition |
| --- | --- |
| Roster | a top-level `players` map of player id to inline agent block; a scalar adapter id normalizes to a bare-adapter block; an id outside `^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)*$`, or the reserved `captain`, is refused |
| Bindings | `playbooks.<id>.roles` maps every id in the entry's `requiredRoleIds` to a roster player, as a bare player id or a block naming `player` with `model`/`effort`; a role left unbound, or bound to an absent player, is refused naming it |
| Binding keys | `adapter`, `permissions`, `instruction` and `workspace` inside a binding are refused: they belong to the player's envelope |
| Tuning | an omitted `model`/`effort` inherits the player's, `false` selects the provider's current default, and a string pins it; the composed selection is complete on every call |
| Concurrency | every group in the entry's `concurrentRoleSets` must bind to pairwise-distinct players, refused naming the group otherwise |
| Roster scope | only players some binding references reach the composed session, so an unused roster entry gates no run |
| Legacy | a surviving `playbooks.<id>.players` block is refused in the launcher's own words |

#### core-service-17

When a session is created, the core package shall instantiate the engagement host through the playbook captain shell factory with a core-provided module loader injected via the shell's dependency options, keeping playbook module resolution under core control and the shell's coupling to the core type-only.

#### core-service-29

Where a configured playbook's registry entry accepts a `cwd` option and the config block leaves it unset, when a session is created, the core package shall pass the session project's directory as that playbook's `cwd` option in the captain options ([DR-014](../decisions/014-released-toolchain.md)):

- A `cwd` set in the config block passes through unchanged.

### Contract Testing

#### core-service-18

The core contract test suite shall exercise the service end to end through the WebSocket protocol against a scripted fake adapter that replays a predetermined record script, using no network access and no real agent credentials, so protocol behavior is verified deterministically in CI.

### Compile Lifecycle

#### core-service-25

The core package shall run at most one compile per playbook id at a time and accept a `compile.abort` command that cancels the in-flight compile for a playbook id:

- While a compile is in flight for a playbook id, a further `compile.run` for that id is rejected fail-closed with a `busy` error naming the id, per [DR-010](../decisions/010-interface-craft.md) principle 5.
- `compile.abort` cancels the in-flight compile by terminating the toolchain child process, emits a final canceled progress line, and makes the pending `compile.run` reply with an `aborted` error; no further progress output follows the canceled line.
- When `compile.abort` names a playbook id with no compile in flight, the core package rejects it with a `not_found` error.

### Readiness Reporting

#### core-service-26

The readiness report of [[core-service-9](#core-service-9)] shall be keyed by adapter: the core package shall resolve every configured position — the captain and each referenced session player, whether an inline agent block or a scalar adapter id, under the same resolution rule as the launcher [[core-service-16](#core-service-16)] — to its adapter and emit exactly one entry per distinct adapter listing those positions, so that no referenced adapter's unmet requirement is hidden by deduplication and a hand-written scalar still surfaces its adapter's requirements before the first turn fails.

## Verification

### Session Coverage

#### core-service-19

Where the core service runs with a valid config and the scripted fake adapter [[core-service-18](#core-service-18)], the test suite shall connect a WebSocket client, create a session for a temporary project directory, submit a Boss turn, and assert that:

- the session's runtime working directory is the project directory [[core-service-4](#core-service-4)];
- every non-hidden scripted record arrives on the session subscription in script order [[core-service-7](#core-service-7)];
- the turn ends with a finished record;
- a second Boss submission during the turn is rejected with a busy error and starts no turn [[core-service-5](#core-service-5)];
- no network connection is opened during the run [[core-service-18](#core-service-18)].

#### core-service-31

Where a session's captain finishes a turn with a hidden result reporting an error, the test suite shall assert the synthesized surfacing of [[core-service-30](#core-service-30)]: a session subscriber receives a visible failure record carrying the underlying error text with the turn's id, and no hidden record reaches the session channel [[core-service-8](#core-service-8)].

#### core-service-37

Where a scripted captain calls one player twice within a turn, bracketing each call with the trace that names a different role, the test suite shall assert that the prompt and result records of the first call carry the first role and those of the second carry the second, that the trace records themselves carry none, and that reading the session back from the store yields the same roles [[core-service-36](#core-service-36)].

#### core-service-33

Where a stored session held two turns and a failure record, and a second stored session held neither, the test suite shall assert the listing contract of [[core-service-32](#core-service-32)]: the first entry carries the first turn's text as its title, a turn count of two, and the failure marker; the second entry carries no title, a zero count, and no marker.

#### core-service-35

Where a client subscribes to a session that then runs a fake-adapter turn and is disposed, the test suite shall assert the broadcast contract of [[core-service-34](#core-service-34)]: the state reported at the turn's start already carries the session's title, and the states reported at the turn's end and the session's end each carry the title and turn count, not the zeros the session was created with.

#### core-service-40

Where a live session's runtime fails its disposal, the test suite shall request that session's disposal over the protocol and assert the failing-disposal case of [[core-service-4](#core-service-4)]: the request replies with an error carrying the runtime's failure, and a fresh session request for the same project is then accepted.

### Shutdown Coverage

#### core-service-41

Where two sessions are live and the first one's runtime fails its disposal, the test suite shall stop the core service and assert the stop contract of [[core-service-39](#core-service-39)]:

- the second session's runtime is disposed even though the first one's disposal failed;
- the stop reports the first session's failure to the host after both sessions have been attempted;
- the endpoint accepts no further connection once the stop has returned.

### Record Visibility Coverage

#### core-service-20

Where the fake adapter script contains records marked hidden, the test suite shall subscribe one client to the session and a second client to the debug channel, and assert that the session subscriber receives no hidden record [[core-service-8](#core-service-8)] while the debug subscriber receives every hidden record [[core-service-14](#core-service-14)].

### Configuration Coverage

#### core-service-21

Where the config file carries a defect from each launcher fail-closed defect class recorded in [DR-004](../decisions/004-config-and-persistence.md) as amended by [DR-019](../decisions/019-inline-agent-configuration.md) [[core-service-16](#core-service-16)], the test suite shall assert, per defect, that the core service reports a config error naming the offending entry and rejects a session creation request while that config is active [[core-service-2](#core-service-2)].

### Persistence Coverage

#### core-service-22

Where a session has completed a Boss turn, the test suite shall stop the core service, start it again on the same state root and sessions directory [[core-service-15](#core-service-15)], and assert that the session, its turns, its records (content and order), and its usage totals are served identically after restart [[core-service-10](#core-service-10)], and that a session live at shutdown is reported as no longer live:

- Where the root carries an earlier release's file versions, the suite shall assert startup migrates forward, keeps every row, and serves the migrated data identically [[core-service-15](#core-service-15)].
- Where records carry provider resume tokens — in a result and in a `playbook.trace` payload — the suite shall assert the persisted and replayed stream carries none of them [[core-service-10](#core-service-10)].
- Where the stream file becomes unappendable mid-session, the suite shall assert the fail-soft contract of [[core-service-10](#core-service-10)]: the record is still served from memory, the listing marks the stream incomplete after the last durable sequence, and the mark survives a restart.
- Where the shell names a legacy SQLite store holding sessions and intents, beside a legacy library directory the shared config's `from` paths point into, the suite shall assert the one-time import of [[core-service-64](#core-service-64)]: the rows serve identically from the file state, the library relocates with its `from` paths rewritten and comments kept, the legacy store file is untouched, and a second startup imports nothing twice.

#### core-service-62

Where a fixture session — manifest naming a registered project's directory as its working directory, record-stream file, and no Spex sidecar — sits in the sessions directory before the core service starts, and the test suite writes a second such fixture session while the service runs, the test suite shall assert the foreign-session contract of [[core-service-60](#core-service-60)]:

- both sessions appear in the listing bound to that project, non-live, with titles and turn counts folded from their streams [[core-service-32](#core-service-32)];
- their records are served with hidden records filtered from the session subscription [[core-service-10](#core-service-10)];
- a session-state report announcing the second session reaches a subscribed client [[core-service-60](#core-service-60)];
- a fixture session whose working directory matches no registered project is absent from the listing [[core-service-60](#core-service-60)];
- a fixture session held by a live foreign lease serves read-only, its files byte-identical afterwards [[core-service-65](#core-service-65)].

#### core-service-63

While a core service is serving a state root, the test suite shall start a second core service against the same root and assert the admission contract of [[core-service-61](#core-service-61)]: the second start refuses to serve reporting the holder, and after the first service stops [[core-service-39](#core-service-39)], a fresh start on that root succeeds.

### Intent Ledger Coverage

#### core-service-53

Where the core service runs with a valid config and the scripted fake adapter [[core-service-18](#core-service-18)], the test suite shall drive intents through their lives over the protocol — queue, edit, reorder, dispatch on a session's turn, finish, and close — and assert that:

- a queued intent comes back from `ledger.get` in its project's queue at the requested position [[core-service-42](#core-service-42)] [[core-service-49](#core-service-49)];
- an edit lands while the intent is queued, and the same edit after dispatch is rejected [[core-service-43](#core-service-43)];
- a move reorders the queue within the project, and a move naming another project's intent is rejected [[core-service-44](#core-service-44)];
- closing the dispatched intent as `done` before its turn finishes is rejected, succeeds after the finish, and `dropped` is accepted on a second, still-queued intent [[core-service-46](#core-service-46)];
- an `intents.changed` broadcast naming the project arrives for each write and for the turn's start and finish [[core-service-51](#core-service-51)].

#### core-service-54

Where a store holds queued, dispatched, finished, and closed intents from a completed run, the test suite shall stop the core service, start it again on the same state root [[core-service-15](#core-service-15)], and assert that `ledger.get` replies identically to its pre-restart reply [[core-service-49](#core-service-49)] and that the intent act log carries no state or status field [[core-service-52](#core-service-52)].

#### core-service-55

Where a project holds an open issue-sourced intent, the test suite shall send a second `intent.queue` with the same source kind and reference and assert the dedup contract of [[core-service-42](#core-service-42)]: the reply is a `conflict` error naming the existing intent, no intent is stored, and once the existing intent closes [[core-service-46](#core-service-46)] the same request is accepted.

#### core-service-56

Where two open intents are linked one after the other, the test suite shall assert the link guards of [[core-service-45](#core-service-45)]: a reverse link closing the cycle is rejected fail-closed, a link to a closed intent is rejected, and closing the predecessor [[core-service-46](#core-service-46)] lifts the successor's blocked mark in the next `ledger.get` reply [[core-service-49](#core-service-49)].

#### core-service-57

Where a session is live on the fake adapter, the test suite shall submit Boss text carrying an intent id and assert the stamping contract of [[core-service-47](#core-service-47)]:

- when the submitted turn starts, the intent carries that session, that turn, and a dispatch time;
- a submission carrying the id of a blocked intent, or of another project's intent, is rejected and starts no turn;
- a submission rejected busy while a turn is active [[core-service-5](#core-service-5)] stamps nothing and leaves the intent queued;
- a dispatch turn that is aborted [[core-service-6](#core-service-6)] keeps its stamps while the next `ledger.get` re-derives the intent as queued at its kept rank [[core-service-49](#core-service-49)].

#### core-service-58

Where a project's store holds twenty-five closed intents, the test suite shall page through `ledger.history` and assert the paging contract of [[core-service-50](#core-service-50)]: the first page holds the twenty newest-closed intents newest-first, the second page — requested with the first page's cursor — holds the remaining five with no overlap, and both pages reply identically after a restart on the same store [[core-service-15](#core-service-15)].

#### core-service-59

Where a session finishes a turn bound to no intent, the test suite shall assert the review-state contract of [[core-service-48](#core-service-48)]: `ledger.get` lists a finished-band stand-in entry for the unviewed turn [[core-service-49](#core-service-49)], a `session.viewed` naming that turn clears the entry from the next reply, and the entry stays cleared after a restart on the same store.

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

### Endpoint Coverage

#### core-service-38

Where the core service attaches to a test-supplied HTTP server [[core-service-1](#core-service-1)], the test suite shall connect real WebSocket clients to that server's port and assert the admissions and rejections of [[core-service-24](#core-service-24)]:

- a token-bearing handshake whose Origin is the server's own host succeeds and receives the hello with the protocol version, with the endpoint address reported to the host [[core-service-1](#core-service-1)];
- a handshake with a wrong or missing token is rejected;
- a token-bearing handshake from a foreign web origin is rejected;
- a token-bearing handshake with no Origin, and one from a `file://` origin, each succeed.

### Readiness Dedup Coverage

#### core-service-28

Where the config references one adapter from several positions — as the captain and as a session player, including a hand-written scalar adapter id — the test suite shall assert that readiness reporting includes exactly one entry for that adapter [[core-service-26](#core-service-26)], naming each referencing position, marked per the adapter readiness rules with the unmet requirement named when the adapter is not ready [[core-service-9](#core-service-9)].
