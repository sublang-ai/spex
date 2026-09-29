<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# State-root lock: incident and proposed direction

**Status:** Revised proposal for review (2026-09-29). The owner selected candidate A for the state-root lease and included Playbook's session leases and repository claims in this review; they may be changed together during implementation. The remaining design details are open. No behavior or spec change is approved by this document.

## Purpose and scope

Spex needs two distinct forms of single-instance protection:

- The desktop shell uses Electron's `requestSingleInstanceLock()` to focus an existing app window when the same desktop app is launched again ([app-shell-2](../specs/packages/app-shell.md#app-shell-2), [implementation](../apps/desktop/src/main.ts)).
- The core's state-root lease admits one core or home-level storage operation at a time for Spex-owned files: a desktop core, a server core, or a storage command that mutates the home ([DR-036](../specs/decisions/036-file-state-store.md), [core-service-61](../specs/packages/core-service.md#core-service-61), [storage-14](../specs/packages/storage.md#storage-14)). Playbook CLI session writes use separate per-session leases and can coexist with a core. Electron's app lock alone cannot cover the home-level writers.

This proposal compares ways to protect the **state-root lease** and reviews the related hostname/PID failure in Playbook's per-session leases and repository claims. The review covers all three coordination mechanisms; implementation may change them together, with Playbook-owned formats and CLI behavior coordinated upstream.
The accepted contract is one core per state root; the particular `.lock/owner.json` mechanism is an implementation choice.

## Incident and observed behavior

On 2026-09-28, `npm start` built and launched the desktop app, but core startup reported that `/Users/kgm/.spex` was held by PID `25313` on `Minion.local`.
The existing `.lock/owner.json` contained that PID and host, although PID `25313` no longer existed.
The current `hostname()` returned `Mac.lan`, while the machine's local host name was `Minion`.
The user recovered by renaming `.lock/` to a timestamped backup and then running `npm start`:

```bash
mv ~/.spex/.lock ~/.spex/.lock.stale-$(date +%Y%m%d%H%M%S)
npm start
```

This preserved the old owner record while removing the active `.lock/` path; this particular successful retry was a manual recovery, not automatic stale-lock retirement.
The `.lock.stale-*` backup is ignored by the home's Git rules and can be deleted after it is no longer needed for diagnosis.

On 2026-09-29, the user also observed:

| Exit or restart path | Observation | Explanation from current code |
| --- | --- | --- |
| Close the app window | `.lock/` disappears | `window-all-closed` calls `app.quit()`; `before-quit` awaits `shutdown()`, which stops the core and releases its store lease ([desktop main](../apps/desktop/src/main.ts), [core stop](../packages/core/src/service.ts), [store close](../packages/core/src/store.ts)). |
| Press Ctrl+C in the `npm start` terminal | `.lock/` can remain | The source-runner sends `SIGINT` to the detached Electron process group. The Electron main process has no signal-to-`app.quit()` handler, so this path can end before its async shutdown runs ([source-runner](../scripts/desktop-runner.mjs), [desktop main](../apps/desktop/src/main.ts)). |
| Restart with a residual `.lock/` | Sometimes succeeds | If the recorded host equals the current `hostname()` and the PID is absent, the core retires the old directory and retries acquisition. If the host differs, it refuses before checking PID ([store lease](../packages/core/src/store.ts)). A still-running desktop instance can also intercept a second launch through Electron before the core reaches this check. |

The source explains these observations; the particular cause of the original process's termination is unknown.
The current lease also uses PID existence, not process identity, so PID reuse can make a dead owner's directory look occupied.
An unreadable owner file fails closed and requires manual attention.

## Current mechanism and its limits

The core publishes a directory atomically as `.lock/`, with `owner.json` recording PID, hostname, acquisition time, and token.
It removes only a lock whose token still matches its own.
On startup it can retire a same-host dead-PID lock, but treats any different hostname as a foreign host whose liveness it cannot check.
The [storage Git commands](../packages/core/src/storage-git.ts) reserve the same `.lock/` path and must participate in any replacement.

The directory protects cooperating Spex writers on one filesystem, but its presence survives abrupt process termination.
Hostnames can change, and PID existence is weaker than proof that the original owner still holds the lease.
The existing directory also cannot guarantee mutual exclusion between two machines whose separate filesystem copies are synchronized asynchronously; [DR-036](../specs/decisions/036-file-state-store.md) explicitly leaves concurrent multi-machine writes out of scope.
The observed `Mac.lan`/`Minion.local` mismatch proves that the hostname changed, but does not establish which system setting or network event changed it.

The installed `@sublang/playbook` 15.0.0 session store (`reference/sdlc/code.playbook/bin/session-store.js`) likewise compares a lease owner's hostname before probing its PID.
It accepts injected `hostname` and `probeProcess` options, but Spex currently supplies neither, and a standalone Playbook CLI constructs its own store.
Injecting a stable identity only in Spex would regress same-machine takeover: a Spex lease carrying that identity in Playbook's `hostname` field looks foreign to a standalone CLI still comparing `os.hostname()`, and a CLI-authored lease looks foreign to Spex. The Playbook convention must be available to both writers before Spex switches, or a carefully reviewed transition must recognize old and new identities without mistaking a foreign host for this machine.
Its repository coordinator (`reference/sdlc/code.playbook/bin/repository-effects.js`) also uses hostname/PID ownership. The same review must cover its claim identity, stale-owner handling, and compatibility with existing claims.

## Candidate approaches

Electron's single-instance lock remains for desktop window behavior in every candidate. It cannot protect the server or storage commands.

| Candidate | Benefit | Cost and limitation |
| --- | --- | --- |
| **A. Harden the directory lease**: replace hostname with a shared machine identity stored outside the synced home, while retaining conservative PID-based retirement. | Addresses the observed hostname change without a new lock dependency and retains the foreign-host refusal required by DR-036. | Abrupt exit still leaves files, and PID reuse can still cause a false refusal. Legacy owner files, lost identity, and Playbook/CLI coordination need explicit handling; unreadable or unverifiable ownership remains fail-closed. |
| **B. Heartbeat with timeout**: periodically refresh the lease and retire it after a deadline. | No native binding; can recover from a dead owner without a process probe. | A sleeping, paused, or overloaded *live* owner can miss the deadline and continue writing after a contender takes over. A timeout alone cannot uphold the one-writer contract; it is suitable only as diagnostic evidence or with an additional authority/fencing design. |
| **C. OS advisory file lock**: take a nonblocking exclusive lock for the local home writer's lifetime. | The OS releases a local lock after the owner dies, so residual metadata cannot block the next local start. | Node/Electron expose no built-in `flock`/`fcntl` API; an in-process implementation needs a native addon, while a packaged helper would be another maintained binary. All writer entry points, packaging, ABI rebuilds, descriptor inheritance, and old-version coexistence must be addressed. A local OS lock alone does not enforce the current root foreign-host refusal or fix Playbook session leases. |

For candidate C, the lock target should be **outside the potentially synced home**, on a stable machine-local filesystem, keyed by the canonical state-root path and protected by private permissions. Hold its descriptor open; never unlink or replace the target during ordinary release. Verify that spawned agents cannot inherit and retain the descriptor. `flock(LOCK_EX | LOCK_NB)` is one macOS/Linux option, but its exact Node/Electron binding and packaging are prerequisites to selecting it ([Apple `flock(2)`](https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/flock.2.html), [Linux `flock(2)`](https://man7.org/linux/man-pages/man2/flock.2.html)).

**Selected direction for this review (2026-09-29):** harden the existing directory lease (A) and give the root lease, Playbook session leases, and repository claims one shared machine identity. Retain conservative refusal when a PID exists but may have been reused; process-start identity is deferred. B is not sufficient as the sole admission authority, and C remains a comparison rather than the planned root mechanism. The three mechanisms may be updated in the same implementation effort; their shared identity location and compatibility plan remain to be decided.

**Machine identity:** Playbook must define a private, machine-local per-user identity location so its standalone CLI, session store, repository coordinator, and Spex can read the same value without a Spex process. Candidate bases are `~/Library/Application Support` on macOS and `$XDG_STATE_HOME` (or `~/.local/state`) on Linux, under a Playbook-owned directory; the exact path and creation rules belong to the upstream review. A configured state directory that is itself synchronized across machines cannot be used for this identity. If the identity file is lost, generate a new identity for future leases but never auto-retire an existing owner whose identity cannot be matched; report the lock path and reason, and require an operator to establish that no writer remains before manual recovery.

**Deferred process identity:** PID reuse currently causes a conservative false refusal, not admission of a second writer. This implementation will not add a process-start field or retire an owner merely because a live PID might have been reused. A later change could improve recovery, but Node has no portable start-time probe: Linux needs a `/proc` read, and macOS needs a platform probe such as `ps` or `sysctl`. Playbook's session-owner and repository-claim records reject extra keys, so that later change would need a versioned owner format and compatibility plan; Spex's current root reader does not validate an exact key set, although older Spex still compares its `hostname` field.

Separately, the desktop can handle `SIGINT`/`SIGTERM` by requesting `app.quit()` so `before-quit` stops the core, with a bounded escalation in the source-runner. This improves shutdown under any candidate, but forced termination must remain safe ([desktop main](../apps/desktop/src/main.ts), [source-runner](../scripts/desktop-runner.mjs), [Electron app API](https://www.electronjs.org/docs/latest/api/app)). It is independent implementation work **after approval**, consistent with the earlier request to defer development until review.

No candidate makes uncoordinated cross-machine writes safe over asynchronous file synchronization. True concurrent multi-machine access needs an authoritative single writer or a distributed coordination mechanism with enforced write ownership.

## Review decisions before specification or implementation

- **Foreign-host policy:** DR-036 requires one machine to write at a time and never breaking foreign-host session leases. Under A, retain the root's foreign-owner refusal too unless a new decision amends DR-036. Specify how machine identity distinguishes foreign owners and how legacy hostname-only records fail closed when their origin cannot be proved.
- **Primary local mechanism:** A is selected for the state-root lease, with one shared machine identity across all three mechanisms and no process-start identity in this implementation. Settle the upstream identity location and creation rules; retain fail-closed behavior for a possibly reused live PID.
- **Playbook coordination:** Inclusion in this review is agreed, and implementation may be combined. Update the Playbook CLI/session store/repository coordinator before Spex starts publishing the shared identity, or specify a safe mixed-version transition. A Spex-only `hostname` injection would break same-machine takeover with an unchanged CLI.
- **Compatibility and identity:** Define how old `.lock/owner.json` records, Playbook owners, older binaries, and lost machine identities are treated without allowing concurrent writers; unverifiable cases remain fail closed. The deferred process-start field would be rejected by both current Playbook owner readers, though the Spex root reader is not exact-key validated. Canonicalize root identity and account for symlinks and alternate paths.
- **Writer and shutdown coverage:** Include desktop, server, storage Git commands, migrations, and session writers; define graceful desktop signal handling and bounded escalation without losing the Node ABI restoration required by [app-shell-26](../specs/packages/app-shell.md#app-shell-26).
- **Diagnostics:** Distinguish an active local owner, a verifiably dead local owner, a foreign owner, an unverifiable or legacy owner, and a lost machine identity; report the lock path and the reason for any refusal.

## Suggested verification after approval

Run integration/system checks with real competing processes for desktop versus desktop, desktop versus server, and core versus storage Git; normal close and Ctrl+C; forced termination followed by immediate restart; hostname change; PID reuse; session takeover through Spex and the standalone Playbook CLI; competing Playbook repository operations and stale repository-claim recovery; and the legacy-version transition.
For C, also cover residual metadata without an OS lock, a busy OS lock with missing metadata, a sync-backed home with a machine-local lock target, and agent child processes outliving the core. For A, cover missing or changed machine identity, old and new CLI/Spex combinations, and fail-closed refusal when a PID may have been reused. Check that a losing writer changes no protected state and that the source-runner still restores the Node ABI after interruption.

After review, record the accepted decision in the Spex specs before implementation, updating the relevant core, shell, and storage contracts and their integration evidence; coordinate the corresponding Playbook-owned specifications and implementation upstream.
Run `spex lint` after those spec edits as required by [AGENTS.md](../AGENTS.md).
