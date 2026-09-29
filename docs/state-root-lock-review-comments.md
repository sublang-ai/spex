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
