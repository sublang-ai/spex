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
Injecting a stable identity only in Spex would not fix CLI-authored leases or old owner files; those need an upstream and transition plan.
Its repository coordinator (`reference/sdlc/code.playbook/bin/repository-effects.js`) also uses hostname/PID ownership. The same review must cover its claim identity, stale-owner handling, and compatibility with existing claims.

## Candidate approaches

Electron's single-instance lock remains for desktop window behavior in every candidate. It cannot protect the server or storage commands.

| Candidate | Benefit | Cost and limitation |
| --- | --- | --- |
| **A. Harden the directory lease**: replace hostname with a generated machine identity stored outside the synced home; record and verify PID plus process start identity before retiring a local owner's lock. | Addresses this incident and PID reuse without a new lock dependency; can preserve the current foreign-host refusal. | Abrupt exit still leaves files, though verifiably dead local owners can be retired. Process-start verification, legacy owner files, lost machine identity, and Playbook/CLI coordination need explicit handling. Unreadable or unverifiable ownership must still fail closed. |
| **B. Heartbeat with timeout**: periodically refresh the lease and retire it after a deadline. | No native binding; can recover from a dead owner without a process probe. | A sleeping, paused, or overloaded *live* owner can miss the deadline and continue writing after a contender takes over. A timeout alone cannot uphold the one-writer contract; it is suitable only as diagnostic evidence or with an additional authority/fencing design. |
| **C. OS advisory file lock**: take a nonblocking exclusive lock for the local home writer's lifetime. | The OS releases a local lock after the owner dies, so residual metadata cannot block the next local start. | Node/Electron expose no built-in `flock`/`fcntl` API; an in-process implementation needs a native addon, while a packaged helper would be another maintained binary. All writer entry points, packaging, ABI rebuilds, descriptor inheritance, and old-version coexistence must be addressed. A local OS lock alone does not enforce the current root foreign-host refusal or fix Playbook session leases. |

For candidate C, the lock target should be **outside the potentially synced home**, on a stable machine-local filesystem, keyed by the canonical state-root path and protected by private permissions. Hold its descriptor open; never unlink or replace the target during ordinary release. Verify that spawned agents cannot inherit and retain the descriptor. `flock(LOCK_EX | LOCK_NB)` is one macOS/Linux option, but its exact Node/Electron binding and packaging are prerequisites to selecting it ([Apple `flock(2)`](https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/flock.2.html), [Linux `flock(2)`](https://man7.org/linux/man-pages/man2/flock.2.html)).

**Selected direction for the state-root lease (2026-09-29):** harden the existing directory lease (A). B is not sufficient as the sole admission authority. C remains a comparison, not the planned root mechanism. Playbook's session leases and repository claims are included in the same design review and may be updated in the same implementation effort; their detailed changes and compatibility plan remain to be decided.

Separately, the desktop can handle `SIGINT`/`SIGTERM` by requesting `app.quit()` so `before-quit` stops the core, with a bounded escalation in the source-runner. This improves shutdown under any candidate, but forced termination must remain safe ([desktop main](../apps/desktop/src/main.ts), [source-runner](../scripts/desktop-runner.mjs), [Electron app API](https://www.electronjs.org/docs/latest/api/app)). It is independent implementation work **after approval**, consistent with the earlier request to defer development until review.

No candidate makes uncoordinated cross-machine writes safe over asynchronous file synchronization. True concurrent multi-machine access needs an authoritative single writer or a distributed coordination mechanism with enforced write ownership.

## Review decisions before specification or implementation

- **Foreign-host policy:** The root implementation currently refuses a visible foreign owner; DR-036 explicitly preserves that rule for *session* leases and leaves concurrent multi-machine writing out of scope. Specify how selected approach A recognizes a foreign machine and treats legacy hostname-only records; confirm whether the current refusal remains. Any change to the Playbook session rule requires an amendment to DR-036. Record the resulting root rule in the specs before implementation.
- **Primary local mechanism:** A is selected for the state-root lease. Its machine identity, process-start verification, legacy compatibility, and failure handling still need a concrete design before specification or implementation.
- **Playbook coordination:** Inclusion in this review is agreed, and implementation may be combined. Specify the upstream changes to session-lease and repository-claim identity, process probing, and compatibility with the standalone CLI and existing owner records. Passing `hostname` only from Spex would leave those paths behind.
- **Compatibility and identity:** Define how old `.lock/owner.json` records, Playbook owners, older binaries, and lost machine identities are treated without allowing concurrent writers; unverifiable cases remain fail closed. Canonicalize root identity and account for symlinks and alternate paths.
- **Writer and shutdown coverage:** Include desktop, server, storage Git commands, migrations, and session writers; define graceful desktop signal handling and bounded escalation without losing the Node ABI restoration required by [app-shell-26](../specs/packages/app-shell.md#app-shell-26).
- **Diagnostics:** Report a proven active owner when possible, and clearly identify uncertainty otherwise; metadata alone never proves that an OS lock is held.

## Suggested verification after approval

Run integration/system checks with real competing processes for desktop versus desktop, desktop versus server, and core versus storage Git; normal close and Ctrl+C; forced termination followed by immediate restart; hostname change; PID reuse; session takeover through Spex and the standalone Playbook CLI; competing Playbook repository operations and stale repository-claim recovery; and the legacy-version transition.
For C, also cover residual metadata without an OS lock, a busy OS lock with missing metadata, a sync-backed home with a machine-local lock target, and agent child processes outliving the core. For A, cover missing or changed machine identity and unverifiable process start identity. Check that a losing writer changes no protected state and that the source-runner still restores the Node ABI after interruption.

After review, record the accepted decision in the Spex specs before implementation, updating the relevant core, shell, and storage contracts and their integration evidence; coordinate the corresponding Playbook-owned specifications and implementation upstream.
Run `spex lint` after those spec edits as required by [AGENTS.md](../AGENTS.md).
