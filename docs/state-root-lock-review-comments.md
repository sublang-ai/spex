<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# State-root lock: review comments on the proposal

**Status:** Discussion notes (2026-09-29) on [state-root-lock-review.md](state-root-lock-review.md). Temporary, to be folded into the eventual DR and then removed together with the proposal.

## Summary

The incident analysis is accurate and every citation resolves.
The proposed direction has three gaps that should be closed before a decision: it skips the minimal fix without saying why, it presupposes an OS lock that Node and Electron cannot take without a native module, and it leaves Playbook's session lease with the same defect it sets out to remove.
One small fix (a signal handler in the desktop main process) is independent of the proposal and can land now.

## Verified against the code

| Claim in the proposal | Evidence |
| --- | --- |
| Hostname is compared before PID; a different hostname refuses outright | [store.ts](../packages/core/src/store.ts) `acquireRootLease`: `owner.hostname !== hostname()` is checked before `processAlive` |
| An unreadable owner file fails closed | Same function: a missing or unparsable `owner.json` throws without retiring the lock |
| Ctrl+C in `npm start` can leave `.lock/` behind | [desktop-runner.mjs](../scripts/desktop-runner.mjs) signals the detached process group; `apps/desktop/src` registers no `SIGINT`/`SIGTERM` handler, while [server main.ts](../apps/server/src/main.ts) does |
| Storage Git commands reserve the same `.lock/` path | [storage-git.ts](../packages/core/src/storage-git.ts) `reserveStorageHome` |
| Cited spec items exist | [app-shell-2](../specs/packages/app-shell.md#app-shell-2), [app-shell-26](../specs/packages/app-shell.md#app-shell-26), [core-service-61](../specs/packages/core-service.md#core-service-61), [storage-14](../specs/packages/storage.md#storage-14), [DR-036](../specs/decisions/036-file-state-store.md) |

## Comments on the proposed direction

### 1. The minimal fix is not weighed

The root cause is that `os.hostname()` on macOS follows the network-assigned name (`Mac.lan`) rather than the machine's own name (`Minion.local`).
Two changes inside the current design address the observed failure and the PID-reuse weakness without a new mechanism:

- compare a stable machine identifier instead of the hostname (a per-machine id persisted outside the home, or the platform's hardware id);
- record the owner's process start time next to its PID, so a reused PID no longer reads as the same owner.

The proposal names both weaknesses and then moves straight to an OS lock.
It should present "harden the existing lease" and "replace it with an OS lock" side by side, with the trade-offs, so the decision is made rather than assumed.

### 2. An OS lock needs a native module

Node and Electron expose no `flock`/`fcntl` locking API.
Taking the lock the proposal describes means adding a native addon.
This repository already carries the cost of one native module: [app-shell-26](../specs/packages/app-shell.md#app-shell-26) and [rebuild-native.mjs](../apps/desktop/scripts/rebuild-native.mjs) exist to rebuild `better-sqlite3` for Electron and back for Node on every source run.
The proposal lists "runtime binding" as a detail to settle later; it is the precondition of the whole direction and should be stated as such.

A crash-safe alternative that needs no native code is a heartbeat lease: the holder refreshes the lock's mtime on an interval, and a contender treats a lock older than a bounded threshold as abandoned.
The proposal should list the candidates (harden current lease, heartbeat lease, OS lock via native addon) with their costs.

### 3. Playbook's session lease has the same defect

Playbook's session store takes the same hostname-plus-PID approach: [session-store.js](../node_modules/@sublang/playbook/reference/sdlc/code.playbook/bin/session-store.js) returns `unknown` or a foreign-host error whenever `owner.hostname !== localHostname`.
After the same machine rename, every session lease misbehaves exactly as the root lease did.
Scoping session leases out makes the proposal read as if fixing the root lock is enough; it is not.

The session store accepts an injected `hostname` (and `probeProcess`) option.
A stable machine identifier chosen for the root lease can therefore be passed to Playbook as well, fixing both leases with one identity decision.
An OS lock on the root does nothing for session takeover.

### 4. The proposal silently amends DR-036

[DR-036](../specs/decisions/036-file-state-store.md) keeps "foreign-host leases never broken" as a standing rule.
Under an OS lock, a home synced from another machine holds no OS lock locally and is admitted at once.
That is a change to an accepted decision and must be listed as an explicit decision point, not only as "does not make cross-machine writes safe".

### 5. Two concrete `flock` risks are missing

- `flock` on network or sync-backed filesystems may be unreliable or a no-op.
  The lock target therefore belongs outside the home, at a machine-local path keyed by the canonical root path; the proposal lists location as open, and this is the answer to give.
- The core spawns agent processes through Cligent.
  An inherited descriptor keeps the lock alive after the core dies.
  Node opens files close-on-exec by default, but the proposal should state that assumption and cover it in verification.

### 6. The Ctrl+C fix stands on its own

A `SIGINT`/`SIGTERM` handler in the desktop main process that calls `app.quit()`, matching the server shell, restores the graceful path through `before-quit` and the store's release.
It depends on none of the decisions above and can be made now, with a bounded forced-exit fallback in the source runner.

## Minor

- The manual recovery left a `.lock.stale-*` directory in the home.
  The storage Git rules ignore it, so it is harmless, but the proposal should say it can be deleted.

## Suggested next step

Rewrite "Proposed direction" as a comparison of the three candidates, with the DR-036 amendment and the Playbook session lease as explicit decision points, and split the desktop signal handler out as immediate work.

---

# Round 2 (2026-09-29): comments on the revised proposal

The revision answers round 1: the three candidates are compared, A is selected, Playbook's session leases and repository claims are in scope, the DR-036 question and the desktop signal handler are listed.
The new claims check out against the installed `@sublang/playbook` 15.0.0: the session store compares hostname before PID and accepts `hostname`/`probeProcess`, Spex passes only `sessionsDir` ([store.ts](../packages/core/src/store.ts) `sessionStore`), and the repository coordinator validates a `hostname,ownerToken,pid,schema` owner and probes the PID.
The candidate B objection (a paused live owner outliving its deadline) is correct.
What follows are the gaps that remain in A's design.

### 1. Where the machine identity lives is A's central decision, and it is an upstream one

"Outside the synced home" is right, but the location is not named.
If Playbook's session leases and repository claims adopt the same identity, the standalone CLI must find the file at the same place without Spex.
The location is therefore a Playbook convention that Spex reads, not a Spex choice that Playbook receives.
Per shell there is no shared app-data directory today (the server has no `userData`), so a platform state directory (`$XDG_STATE_HOME`, `~/Library/Application Support`) keyed by user is the natural candidate; the proposal should name it.

### 2. Injecting the identity from Spex alone breaks same-host takeover

`@sublang/playbook/session-store` re-exports `createCaptainSessionStore` as `createSessionStore`, so Spex can pass `hostname` today without an upstream change.
But a lease Spex writes with a machine id in the hostname field is "foreign" to a CLI comparing `os.hostname()`, and vice versa.
On one machine, the CLI could no longer take over a crashed Spex session and Spex could not take over a CLI one.
The proposal says a Spex-only injection "would not fix" CLI leases; it should say it regresses them.
The ordering constraint belongs in the decision list: upstream first, or a transition rule that accepts either the current hostname or the machine id as "same host".

### 3. Process start identity means an owner-record schema change

Node exposes no process start time.
Linux needs `/proc/<pid>/stat`; macOS needs a spawned `ps -o lstart=` or a native `sysctl`, so the probe becomes a subprocess in the lock path.
More important, both Playbook owner records are validated against exact key sets (session-store `assertOwnerShape`, repository-effects line `keys.join(',') !== 'hostname,ownerToken,pid,schema'`), and Spex's `owner.json` reader is the same shape.
Adding a start-time field is a schema bump that older readers reject fail-closed, which is the concrete form of the "legacy owner files" item.

The release path already checks the owner token, so PID reuse only affects retirement of a dead owner's lock on the same machine.
The proposal should decide whether that residual risk justifies the schema change, rather than list start identity as settled.

### 4. DR-036 grounds the root's foreign-host refusal too

The revision reads DR-036's "foreign-host leases never broken" as a session-lease rule and the root's refusal as implementation.
DR-036 also states under "Sync and backup" that leases are same-host by design and one machine writes at a time.
Candidate A therefore "must preserve" the root's refusal unless DR-036 is amended, not "can preserve" it; the decision point should be phrased that way.

### 5. Leftover candidate-C wording

The "Diagnostics" bullet still says metadata never proves an OS lock is held.
With A selected there is no OS lock; the bullet should say what A reports when the owner is foreign, dead, unverifiable, or of a legacy shape.

### 6. Lost identity: propose the rule

A missing identity file after a reinstall makes every existing lock foreign and refused.
Suggested rule: generate a new identity, refuse with a message naming the lock path and the reason, and never retire a lock whose identity cannot be matched.
This keeps fail-closed and gives the operator the one action to take.

---

# Round 3 (2026-09-29): comments on the shared-identity revision

The revision settles the round-2 points: one shared machine identity for all three mechanisms, upstream-first ordering with an explicit mixed-version warning, process-start identity deferred with the schema cost stated, DR-036 read as binding the root too, the diagnostics bullet rewritten for A, and a lost-identity rule.
The new factual claims hold: PID reuse today yields a refusal rather than a second writer, Spex's root reader does not validate an exact key set, and Spex has no existing device identity to reuse (the per-device acknowledgement of [DR-063](../specs/decisions/063-space-setup-and-repair.md) lives in `prefs.json` inside the home).
Three decisions are still implicit and should be written down.

### 1. Which field carries the identity

The text says a Spex lease would carry the identity "in Playbook's `hostname` field", but never decides this.
The two options have different costs:

- **Reuse the `hostname` field.** No schema change, so the upstream change is small. But the field's meaning changes, every "held by pid N on host H" message shows an opaque id, and the transition rule must tell a legacy hostname from a machine id by its format alone.
- **Add a field.** Both Playbook readers reject extra keys, so this is the versioned owner format the proposal cites as the reason to defer process-start identity. If the format is versioned anyway, that deferral loses its rationale and both fields could ship together.

Name the choice; the transition plan and the deferral both depend on it.

### 2. The identity location should follow Playbook's existing convention

Playbook resolves its directories XDG-style on every platform with no platform branch: `XDG_CONFIG_HOME` or `~/.config` for the user config, and formerly `$XDG_STATE_HOME/playbook/sessions` for sessions ([launch-config.js](../node_modules/@sublang/playbook/reference/sdlc/code.playbook/bin/launch-config.js), [storage-18](../specs/packages/storage.md#storage-18)).
Proposing `~/Library/Application Support` on macOS introduces a platform split Playbook does not have.
Suggest `$XDG_STATE_HOME/playbook/` (or `~/.local/state/playbook/`) on both hosts, so the identity sits where Playbook already keeps machine-local state.

### 3. Legacy records: fail closed is stricter than today, and it hits the incident case

The proposal has legacy hostname-only records fail closed "when their origin cannot be proved".
Today a legacy record whose hostname equals the current hostname and whose PID is dead is retired automatically.
Under the new rule, the exact incident scenario, a stale `.lock/` after a crash, always needs manual cleanup on the first run after upgrade.
Keeping today's rule for legacy-shaped records during the transition is no less safe than the current release; whether to keep it or accept the one-time manual step is a decision to state, not leave to implementation.

---

# Round 4 (2026-09-29): comments on the tagged-identity revision

The three round-3 decisions are now written down: a version-tagged identity in the existing `hostname` field, the XDG-style Playbook state location on both hosts, and today's same-host/dead-PID rule kept for untagged owners.
Checked against the installed Playbook: both owner validators require only a non-empty `hostname` string, so a tagged value passes without a schema change; an old Spex reader turns a tagged owner into a held-root refusal and an old Playbook reader into `unknown` or a foreign-host error, so the mixed-version behavior is a loss of takeover only, never a second writer.
`slc` has no lease code.
The Chinese text matches.
What remains are implementation-shaping details.

### 1. Let Playbook resolve the identity by default, so Spex cannot forget it

The plan has Spex "update its calls to the Playbook API".
Spex creates the session store with only `sessionsDir` ([store.ts](../packages/core/src/store.ts) `sessionStore`) and never constructs the repository coordinator at all; the session host builds it internally.
If Playbook's store and coordinator default `hostname` to the identity file instead of `os.hostname()`, both paths are fixed with no Spex call change and no way to miss one.
Spex then needs the public identity API only for its own root lease and the storage Git reservation.
Suggest stating that split: Playbook defaults, Spex consumes for its own two writers.

### 2. State why the tag cannot collide with a legacy value

The safety of "recognize only the exact tagged format" rests on a real hostname never containing `:`.
That is true by the hostname grammar, but the proposal should say it, since it is the whole reason an untagged value can be trusted as a hostname.

### 3. An unusable identity file is not a lost one

The lost-identity rule generates a new identity.
If the file exists but is unreadable or malformed, generating over it could silently orphan every tagged owner on the machine.
Suggested rule: refuse to create a new identity while a file is present, treat the identity as unavailable, and fail closed on any tagged owner until an operator repairs the file.

### 4. Two Spex implementation notes for the diagnostics requirement

- The root refusal "state root … is held by pid … on …" is a catalog message in both PO files ([DR-078](../specs/decisions/078-the-interface-speaks-the-readers-language.md)); the new wording is a new message id and both languages, and the build refuses an incomplete catalog.
- Several homes on one machine (a developer's real home and a smoke run's isolated home) share one identity; that is the desired behavior and worth one sentence so it is not mistaken for a leak.

### 5. The identity file sits beside a migration source

`$XDG_STATE_HOME/playbook/sessions` is the directory the sessions migration reads and empties ([storage-18](../specs/packages/storage.md#storage-18)); the migration unlinks files inside `sessions/` only.
The upstream review should confirm that no migration or cleanup ever removes the parent `playbook/` directory or treats the identity file as an input.

---

# Round 5 (2026-09-29): comments on the implementation-boundary revision

All five round-4 points are in: Playbook resolves the identity by default and Spex consumes the API only for its own two writers, the tag grammar is discussed, an unreadable identity file is distinguished from an absent one, the catalog message and shared-identity-across-homes notes are present, and the migration must preserve the identity file.
The Chinese text matches.
Three points remain, all small.

### 1. The tag-collision hedge is larger than the risk

The new paragraph presents an old nonstandard hostname exactly matching a valid tag as an open limit of the unchanged schema.
Its failure mode is already safe under the stated rules: a new reader parses such a value as an identity and compares it with the local identity, so it is refused unless it equals this machine's UUID, which was generated after that record was written.
The worst case is therefore a refusal that needs manual recovery, never admission of a second writer.
Suggest stating that in two sentences and dropping the "cannot be distinguished" framing, which reads as a safety hole.

### 2. A writer without an identity must not start

"Treat identity as unavailable and refuse tagged-owner admission" covers the reading side.
It leaves open what a new writer does when the file is unreadable: it cannot publish an owner it can later prove, and writing `os.hostname()` would reintroduce legacy records after the transition.
The rule should be that the writer refuses to start, naming the file and the reason, the same fail-closed posture as an unreadable lock.

### 3. State the creation-race rule

Two writers can start at once with no identity file (a Spex core and a standalone CLI).
Atomic creation is delegated upstream, but the correctness condition is cheap to state here: the loser of the exclusive create discards its own value and re-reads the file, so both end up with one identity.
Add that case, and a writer start with an unreadable identity, to the A verification list.
