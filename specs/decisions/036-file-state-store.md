<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-036: File State and the Shared Session Store

## Status

Accepted (2026-08-29).
Amends [DR-004](004-config-and-persistence.md), [DR-006](006-projects-and-forge.md), [DR-020](020-desktop-live-smoke.md), [DR-033](033-remote-gui-serving.md), [DR-035](035-intent-ledger.md).
Amended by [DR-037](037-playbook-12-adoption.md), [DR-045](045-unified-session-storage.md), [DR-103](103-the-home-and-its-groups.md), [DR-104](104-spec-package-format-and-client-environments.md), [DR-108](108-the-root-lease-names-the-machine.md), [DR-134](134-execution-ownership.md), [DR-246](246-remove-groups-and-team-servers-from-the-clients.md).

## Context

- The owner's direction (2026-08-29): all app status is maintained whenever the app opens — the desktop app on one machine, or a browser against the same server environment; durable state is plain parsable files, not a database; sessions run through the playbook CLI and through Spex appear and are managed in one place; a file-sync service (e.g. Box) can back everything up.
- Before this decision the state was split against that goal:
  - [DR-004](004-config-and-persistence.md) placed app state in per-shell SQLite stores — desktop under Electron `userData`, server under the XDG data dir — so one machine holds two disjoint state worlds, and a live SQLite file under a file-sync service is a known corruption path [[1]];
  - sessions are stored twice, disjointly: Spex persists the full record stream in its SQLite tables, while the playbook CLI persists per-session JSON records — projections, provider resume tokens, and the Boss-turn journal — under `${XDG_STATE_HOME:-~/.local/state}/playbook/sessions` [[2]]; neither host sees the other's sessions, and the CLI record keeps no sub-Boss history at all.
- An implementation audit (2026-08-29) established feasibility on both sides:
  - the playbook CLI already observes the full cligent record stream in both its paths and discards most of it — teeing every record to a per-session JSONL is one added observer; its session-store module is injectable, ships in the published `@sublang/playbook` package, and lacks only an exports entry; its lease discipline already enforces per-session single-writer with lease-free reads and same-host takeover of settled or crashed sessions; cligent itself stores nothing;
  - in Spex, every session read path is a per-session stream read or a small whole-table scan; turns, titles, and usage fold from the record stream; the only transaction is the schema migration; no WAL concurrency or cross-table atomicity is load-bearing; the intents table's post-insert writes are last-write-wins field sets — a textbook act log.

## Decision

- Amends [DR-004](004-config-and-persistence.md): the app-local SQLite store retires in favor of plain files.
- Amends [DR-033](033-remote-gui-serving.md): the per-shell store gives way to one shared state root.
- Amends [DR-006](006-projects-and-forge.md): the project registry lives in the state root's registry file, not the app-local SQLite store.
- Amends [DR-020](020-desktop-live-smoke.md): the smoke redirect covers the state root as well as the user-data directory.
- Amends [DR-035](035-intent-ledger.md)'s storage form: the intents table becomes an act log; every fold contract stands.

### Sessions live in the shared playbook session store

- One sessions store, shared with the playbook CLI, so terminal and app sessions land in one place by construction; its layout, ownership and lifecycle are [DR-045](045-unified-session-storage.md)'s.
- Spex watches the sessions store: a session run anywhere lists in Spex, bound to the project its working directory resolves to; a session matching no project stays unlisted.
- Spex's synthesized visible failure record enters the stream, so replay equals what live subscribers saw.

### Everything else is a file under one state root

- The Spex state root is `${SPEX_HOME:-~/.spex}`; its records live in spex repositories under `workspace/` ([DR-103](103-the-home-and-its-groups.md)), with intents kept as appended acts — [DR-035](035-intent-ledger.md)'s no-state-column law kept, every state folded at read.
- Every shell shares this one root; a root lease admits one core at a time, a second core refused fail-closed ([DR-108](108-the-root-lease-names-the-machine.md)).
- Writes are atomic whole-file replaces or line appends; each file kind carries a version; forward migration at startup stands, including a one-time import of an existing SQLite store, the old file left in place, which also relocates a legacy library directory into the state root and rewrites the config's `from` paths into it.
- No secrets: agent credentials and forge auth stay with their own tools; provider resume tokens stay out of the record stream, so syncing streams shares content, never continuation credentials.

### Files are the truth; any index is disposable

- The core builds its in-memory indexes — session summaries, the ledger fold's inputs — at startup and maintains them on append and on watch events; no derived index is ever the source of truth.
- SQLite stays solely as the one-time import's reader and retires together with the import path, under a future decision.

### Sync and backup are file semantics

- Backing up the state root and the config captures everything durable.
- Leases are same-host by design: one machine writes at a time, and concurrent multi-machine writing over a sync service is out of scope.
- Synced history is readable anywhere; resumability stays with the session's assigned runtime, named in the records ([DR-134](134-execution-ownership.md)), because provider conversation stores do not travel.
- Hidden records ride the synced stream: [DR-004](004-config-and-persistence.md)'s purge affordance stands, and syncing the root off-machine is the user's explicit act.

### Considered and declined

- keeping SQLite for the residue (registry, intents, preferences): a second storage engine for three small files, whose one incidental service — referential enforcement on project removal — is part of no contract;
- a Spex-owned session format for the CLI to adopt: the CLI's store already holds the resume tokens, journal, and lease correctness, and ships in the published package — Spex adopting it is one exports entry, the reverse is a migration for every CLI user;
- per-shell state roots: two stores on one machine answer "what is my app's state" two ways;
- a sync or backup service integration: the owner asked for plain files a file-sync service can carry unaided.

## Consequences

- The core-service persistence items rest on the file store — the state-root ownership with the SQLite import, the intent act log, foreign-session surfacing and the root lease, each with coverage — and the app-shell, server-shell, projects and dashboard packages reference it.
- The shared session format and module API are Playbook's to define; this record binds only Spex's adoption of them.
- The desktop's Electron `userData` keeps only the renderer profile the browser engine writes; renderer localStorage chrome preferences are untouched by this decision.
- Project removal keeps no referential constraint in place of the incidental SQLite one.
- Single-user scale bounds the design: startup reads every session manifest to build its indexes; if volume ever hurts, a rebuildable cache may return — as an index, never the truth.

## References

[1]: https://www.sqlite.org/howtocorrupt.html "SQLite, How To Corrupt An SQLite Database File"
[2]: https://specifications.freedesktop.org/basedir-spec/latest/ "XDG Base Directory Specification"
