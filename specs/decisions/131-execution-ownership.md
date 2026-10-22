<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-131: Execution Ownership

## Status

Accepted (2026-10-21) on the owner's direction: before a project's records run on more than one runtime at once — a laptop and a seat on a team server ([DR-132](132-team-servers.md)) — each session, and each intent captured from this change on, is assigned to one runtime, and only that runtime executes it.
Amends, under [DR-046](046-decision-record-evolution.md):

- [DR-103](103-the-home-and-its-groups.md) in "you can continue it only on a device where the project's working folder is the one it ran in": a session continues only on the runtime it is assigned to, the folder rule standing beneath.
- [DR-047](047-explicit-session-recovery.md) in "regardless of their originating host": Restore and Discard are offered on the assigned runtime alone.
- [DR-055](055-queue-advancement.md) and [DR-077](077-up-next-is-a-committed-queue.md) in which intent is next: a runtime advances into, and offers to start, only the intents assigned to it.
- [DR-035](035-intent-ledger.md) in its attention queue and verdicts, and [DR-051](051-runtime-held-for-a-turn.md) and [DR-077](077-up-next-is-a-committed-queue.md) in the project's lane: attention, verdicts and the lane count only the runtime's own records.
- [DR-036](036-file-state-store.md) in "resumability stays machine-local": it stays with the assigned runtime, named in the records.

## Context

- Leases never sync, and a session's recorded working folder is the only rule deciding where it continues; a second device pairing the project at the same absolute path continues a synced session, and a session synced mid-turn offers Restore and Discard on the peer.
- An intent is queued the moment it is captured, and its only claim is the `dispatched` stamp written when a turn starts, which reaches another device at the next sync; two idle devices each dispatch the same intent, and a mid-turn sync derives the other device's open dispatch as released.
- A session's manifest is Playbook's, with a closed set of keys; Spex already appends hidden records of its own to the replay stream, and an intent file is Spex's own closed object with a `format`.
- Three identifiers exist: Playbook's machine identity, shared by every home of one OS user on one machine; the home's `device` UUID in `home.yaml`, one per home and one core per home, minted for one run alone where `home.yaml` cannot be read; and the host name, which drifts.
- The sync compares whole units against the common ancestor; a unit new on one side never conflicts, and a unit changed on both sides is one explicit choice.

## Decision

### The runtime

- A **runtime** is one core on one home, named by the home's `device` UUID; a label beside it, stored at assignment for display alone, is the server's name on a seat and the host name elsewhere.
- A runtime whose device id was minted for one run assigns nothing.

### Assignment

- A session is assigned to the runtime that creates it: before its first turn is admitted, the core appends one hidden record naming the runtime to the replay stream, under the session's lease, so the assignment rides the session bundle as one unit and is never rewritten.
- An intent is assigned to the runtime that captures it: `intents/<id>.json` takes `format` 2 with a `runtime` field, written once at capture and never rewritten, since a queued intent is startable at once.
- A record carrying no runtime, written before this change or by the Playbook CLI, keeps today's rules: the folder rule for a session; an intent runnable on any runtime but a seat.
- A runtime record that cannot be read names an unknown runtime, never this one.

### What another runtime does

- It serves the record's history and state as it serves any record.
- It reports the session as not continuable with the phrase below and offers no Restore, Discard or control on it; it never counts the session as the project's lane or as holding the project, so it may start sessions of its own.
- It lists another runtime's sessions and intents in no attention and counts them in no badge.
- It never derives another runtime's open dispatch as released into its own queue, never offers Start on another runtime's intent, never advances into one, and refuses a turn naming one as `conflict`; close, edit and drop on another runtime's intent are refused the same way, so no sync choice can drop the stamp of work that ran.
- Deleting a session stays as [DR-042](042-sessions-continue.md) has it, and removing a closed intent stays allowed on any runtime, as that deletion is.
- The phrase, wherever it applies: "Runs on <label>".

### Bounded stop

- When a runtime stops — on a signal, or at the end of an execution lease on a seat ([DR-132](132-team-servers.md)) — the core closes admission and aborts every active turn with the core-stop reason, as today; when every turn has settled, or after ten seconds, it sends every agent process it started that is still alive SIGTERM, and SIGKILL five seconds later, releases its leases and exits.
- On a seat the service manager's kill of the control group reaches the agents' descendants; elsewhere reaching them needs each agent child in a process group of its own, a change in the adapters.
- A stop writes nothing into a working folder and reverts no file; a turn cut before settlement stands `uncertain`, for Restore on its own runtime.

### Considered and declined

- The Playbook machine identity as the runtime: shared by every home of one OS user on one machine, so two homes of one person on one server would be one runtime.
- An account plus a server as the runtime: the same person on the laptop and the seat.
- A field in the session manifest: Playbook's keys are closed; a hidden stream record is Spex's own place today, and a manifest field is a later Playbook change that would also serve the CLI.
- A sidecar file per session: its own sync unit, selectable apart from its bundle, and the host-specific sidecar [DR-045](045-unified-session-storage.md) forbids.
- Migration, takeover and scheduling across runtimes: deferred; a record assigned to a retired seat reads "Runs on <label>" until one of them exists.
- Reassignment: a rewritten unit that conflicts; deferred with takeover.

## Consequences

- An upgrade is coordinated: an older Spex refuses a records tree holding an intent of format 2, so its sync of that repository stops until it is upgraded, and every member's device of a project moves together.
- Two runtimes each capturing the same forge issue still produce two intents; that stands as today and is not this record's.
- These specs change: `storage` for the intent file's format 2 and the hidden runtime record; `core-service` for assignment at creation and capture, the readings of another runtime's records, the refusals and the bounded stop; `dashboard` for the queue row's phrase, the queue's selection by runtime and the attention of the runtime's own records; `server-shell` for the bounded exit.
- Acceptance checks: a session created on one home refuses continuation, Restore and Discard on a second home with the folder at the same path, with the phrase, and appears in no attention there; an intent captured on one home is neither offered nor advanced into on the second, and a turn naming it there is refused; a record without a runtime behaves as before; a stop with a turn running ends every agent process within fifteen seconds and leaves the session restorable on its own runtime.
