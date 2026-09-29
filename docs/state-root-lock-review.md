<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# State-root lock: incident and proposed direction

**Status:** Proposal for review (2026-09-29). No behavior or spec change is approved by this document.

## Purpose and scope

Spex needs two distinct forms of single-instance protection:

- The desktop shell uses Electron's `requestSingleInstanceLock()` to focus an existing app window when the same desktop app is launched again ([app-shell-2](../specs/packages/app-shell.md#app-shell-2), [implementation](../apps/desktop/src/main.ts)).
- The core's state-root lease admits at most one writer for a Spex home, including a desktop core, a server core, and storage commands that mutate the home ([DR-036](../specs/decisions/036-file-state-store.md), [core-service-61](../specs/packages/core-service.md#core-service-61), [storage-14](../specs/packages/storage.md#storage-14)). Electron's app lock alone cannot cover those other writers.

This proposal concerns the **state-root lease**, not Playbook's separate per-session leases.
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

## Proposed direction

1. Keep Electron's single-instance lock for desktop window behavior.
2. Use a **nonblocking OS advisory exclusive file lock** as the authority for admission to a Spex home on macOS and Linux. All home writers, including the core and storage Git commands, acquire the same lock before changing state and hold it until their work ends. A contender that cannot acquire it refuses and reports the active owner when owner information is available.
3. Keep any lock file at a stable path and hold its descriptor open. Never unlink or replace that file as part of ordinary release; close the descriptor instead. The file may remain after exit, but an unheld file does not block startup. PID and hostname become diagnostic metadata only, written after lock acquisition and never used as the admission authority.
4. Route Ctrl+C during `npm start` through a graceful Electron/core shutdown where practical, with a bounded forced-exit fallback. This preserves session cleanup, but correctness must not depend on a shutdown callback: crashes and forced termination must release the OS lock automatically.

`flock(LOCK_EX | LOCK_NB)` is one candidate for the supported macOS/Linux hosts. Its lock is associated with an open file and released when the owning open descriptions close; it remains advisory, so every Spex home writer must cooperate ([Apple `flock(2)`](https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/flock.2.html), [Linux `flock(2)`](https://man7.org/linux/man-pages/man2/flock.2.html)). Electron documents `requestSingleInstanceLock()` and `before-quit`, but the latter does not run for immediate exits ([Electron app API](https://www.electronjs.org/docs/latest/api/app)).

This changes the failure mode: a dead process cannot leave an *active* local OS lock, even if a metadata file remains.
It does not make uncoordinated cross-machine writes safe.
If multi-machine concurrent access becomes a requirement, it needs an authoritative single writer or a genuine distributed coordination mechanism; a synchronized lock file is insufficient.

## Review decisions before specification or implementation

- **Lock identity and location:** Choose a stable, machine-local lock target keyed by the canonical state-root path, with private permissions. The lock target must not be replaced by Git or a file-sync client while held. Confirm handling of symlinks, alternate spellings of one root, missing runtime directories, and per-user scope.
- **Old-version coexistence:** A new OS-lock file would be invisible to older binaries that only inspect `.lock/`. Decide whether an upgrade requires all older writers to stop, or a temporary compatibility gate. Define how an existing stale legacy `.lock/` is handled once, without allowing an old writer and a new writer to run together.
- **Writer inventory:** Confirm that desktop, server, storage Git commands, migrations, and any other state-root mutation all use the shared guard. Playbook's per-session lease remains a separate concern.
- **Runtime binding:** Choose how Node/Electron obtains the OS lock on macOS and Linux, including packaging and native-ABI effects. Ensure child processes do not unintentionally keep the lock descriptor alive after the core exits.
- **Diagnostics:** Define the refusal message when the OS reports a busy lock but metadata is missing or stale. Never infer that metadata alone proves ownership.
- **Shutdown:** Define how the source-runner asks Electron to quit on SIGINT/SIGTERM, how long it waits, and when it escalates, while preserving its required Node ABI restoration ([app-shell-26](../specs/packages/app-shell.md#app-shell-26)).

## Suggested verification after approval

Run integration/system checks with real competing processes for: desktop versus desktop, desktop versus server, and core versus storage Git; normal close and Ctrl+C; forced termination followed by immediate restart; a remaining metadata file with no OS lock; a busy OS lock with missing metadata; and the legacy-version transition.
Check that the losing writer changes no protected state, that the winning writer retains its lock throughout shutdown, and that the source-runner still restores the Node ABI after interruption.

After review, record the accepted decision in the specs before implementation, updating the relevant core, shell, and storage contracts and their integration evidence.
Run `spex lint` after those spec edits as required by [AGENTS.md](../AGENTS.md).
