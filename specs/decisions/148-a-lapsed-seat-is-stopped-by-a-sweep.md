<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-148: A Lapsed Seat Is Stopped by a Sweep

## Status

Accepted (2026-10-24) on the owner's direction — a simple and reliable bound, chosen for its return over a design that meets every case to its maximum — answering a review's objection (GPT-6 Astra, 2026-10-24) that a seat runs past the bound of [DR-132](132-team-servers.md) while no hub runs, and adopting the reviewer's recommendation of one root sweep with a shared lock per seat.
Amends, under [DR-046](046-decision-record-evolution.md):

- [DR-132](132-team-servers.md) in Lifecycle's "the hub stops the seat's unit" at the lease's end: the hub does so while it runs; whether one runs or not, the service manager's sweep stops, within a minute, every seat whose recorded lease has expired, under a lock per seat that the hub holds while it records a lease.

## Context

- [DR-132](132-team-servers.md) bounds a seat's execution by its lease — sixty minutes without a successful read of the membership ends it — and has the hub stop the unit at the lease's end; the hub is one unprivileged process, the only one the service manager's policy lets run the helper, and leases survive its restart so that an upgrade or a crash cuts no member's running turn [[hub-5](../packages/hub.md#hub-5)].
- While no hub runs — a crash loop, an administrator's stop, a hub that cannot start — no seat stops; a seat whose lease lapses meanwhile runs until the next hub start, past the bound and past the member's removal from the group.
- [DR-132](132-team-servers.md) declines the seat's own word on its access: its processes are the member's.
- The helper's `stop` is idempotent and runs as root directly; the lease table is an owner-only file of a documented shape that the hub alone writes [[hub-8](../packages/hub.md#hub-8)].
- The service manager runs a oneshot service on a timer at a fixed period as root, independent of any other process, and does not start it again while it still runs [[1]] [[2]].
- The owner's direction: a simple and reliable solution at a good return, not one that meets every case to its maximum; running work preserved across brief hub restarts.

## Decision

### The sweep

- A **sweep** runs as root every minute under the service manager's timer, whether a hub runs or not: it reads the hub's lease table and, for every lease that has expired while the seat's unit is still active, runs the helper's `stop`; it writes nothing to the table.
- The bound while no hub runs is met within the sweep's period of a minute and its accuracy of five seconds after the expiry, plus the unit's stop timeout; a seat the service manager is restarting at that instant is stopped as a running one; the stops of several seats are issued at once, so a slow one delays no other; the hub's own stop at the exact expiry stands while a hub runs.
- A stop that fails is logged and tried again at the next sweep; the hub reconciles its own record of a stop owed when its next stop finds the unit stopped.

### The lock per seat

- A lock per seat lives under the hub's state directory, a file holding its holder's pid: the hub holds it while it records an admission and starts the seat, and while it records a renewal; the sweep holds it while it reads that seat's lease again and stops the seat.
  Under the lock the sweep acts only on a lease still expired, so no seat admitted or renewed meanwhile is stopped.
- A holder that died, that ran before this boot, or whose lock is older than fifteen minutes — every hold being bounded by the seat's start and stop timeouts — is replaced by whoever finds it; two finders in one instant may both go on, which costs at most one re-admission, a price taken for a lock with no daemon behind it.
  A lock the sweep cannot take within its wait leaves that seat to the next sweep; one an admission cannot take within its wait refuses the admission with nothing recorded.
- The `locks/` directory is the hub's: the sweep, as root, makes and changes the owner of nothing under the state directory, takes a lock only in a directory that is no link and belongs to the state directory's owner, and reads the lease table through no link, from a regular file of that owner alone and bounded in size, and a lock through no link, from a regular file bearing one name, its first bytes alone; its unit mounts the system read-only but for the hub's state and the seats' runtime directory and bounds a sweep's time.
  What remains to the hub's account, the one the internet reaches, is a race between the sweep's check of the directory and its next use of a path through it, whose prize is a file named `<id>.lock` made or removed in one of those two places: accepted, named here, since closing it needs a directory handle Node does not give.
- Network calls — the ticket's redemption, the renewal at the instance — happen outside the lock.

### What stands

- The hub's own enforcement: its timer at each lease's expiry, the stops it owes and retries, its start ending every lease that lapsed meanwhile, `evict` and `retire`.
- Leases survive the hub's restart, and the sweep stops no seat whose lease is active.
- The helper's four forms and the sudoers policy: the sweep runs the helper as root through its unit, not through sudo.

### Considered and declined

- A transient timer per seat, armed by the hub through a fifth helper form at every admission and renewal: exact to the second and ordered by the hub's own queue, but a new root-reaching form, a wider sudoers policy, arming at three sites with a failure path at each and a cancel at every stop; a minute's grace buys all of that back.
- The seat ending itself at a deadline, `RuntimeMaxSec=` extended by the seat, `PartOf=` or `BindsTo=` on the hub's unit: the seat's own word, or every member's running turn cut by a hub restart, as [DR-132](132-team-servers.md) has it.
- A sweep acting only while no hub answers: the lock makes it safe at any time, and a hub alive but stuck would otherwise hold the bound open.
- A shorter or longer period: a minute is a small part of a sixty-minute lease, and the unit's stop timeout dominates it.

## Consequences

- `hub` changes: the sweep and the lock in the lease's end (hub-5); the sweep's service and timer installed and enabled (hub-7); the locks under the state directory and the table read by the sweep (hub-8); the sweep run hermetically against a lease table with the fake helper and a fake service manager, and the admission and the renewal under the lock (hub-9); the lane asserting a lapsed seat stopped with the hub's unit stopped (hub-10).
- Code: a sweep program beside the hub run by its unit, the lock in the hub's state module and used by both, the install script rendering the two units and enabling the timer, the deploy test holding them to the shared paths.
- Acceptance: the privileged lane run on a Linux host with systemd before the change ships, recorded in `LANE.md` when made; this record is accepted ahead of that run.

## References

[1]: https://www.freedesktop.org/software/systemd/man/latest/systemd.timer.html "systemd.timer: OnBootSec=, OnUnitActiveSec=, AccuracySec="
[2]: https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html "systemd.service: Type=oneshot"
