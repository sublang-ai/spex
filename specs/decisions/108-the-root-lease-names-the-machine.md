<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-108: The Root Lease Names the Machine

## Status

Accepted (2026-09-30).
Extends [DR-036](036-file-state-store.md) in one scope: the root lease's owner names its machine by Playbook's machine identity rather than by the operating system's host name, and its retirement keeps a permanent record; one core per state root and the same-host design otherwise stand.
Extends [DR-045](045-unified-session-storage.md) in one scope: the storage Git tool takes the same lease by the same rules and recovers a dead owner of this machine.
Extends [DR-103](103-the-home-and-its-groups.md) in one scope: beside the home's `.lease/`, whose path stands, the lease stages at `.lease.stage.<token>/` and keeps each retirement at `.lease.retired/<token>/`; a `.lock/` of the former layout is read by the same rule before the migration.
Amends [DR-105](105-playbook-17-5-0-adoption.md) in its Playbook floor alone, now `^17.6.0`: the core requires Playbook 17.6.0, the first release that publishes `@sublang/playbook/machine-identity` [[2]]; everything else DR-105 decided stands.

## Context

The root lease of [DR-036](036-file-state-store.md) — `.lock/owner.json` then, `.lease/owner.json` since [DR-103](103-the-home-and-its-groups.md) — records the core's PID and `os.hostname()` and reclaims a dead owner only when the recorded host equals the current one.
On 2026-09-28 `npm start` refused the home: the lock named a dead PID on `Minion.local` while `os.hostname()` answered `Mac.lan`, because macOS follows the name the network assigns.
The operator moved the directory aside by hand.

The same rule governs Playbook's session leases and repository claims, which the core shares with the standalone CLI; a fix one writer adopts alone makes the other's leases foreign.
Playbook therefore publishes one machine identity per user and machine under its XDG state directory, carried in the owner's `hostname` field, and reads an untagged value as a legacy host name [[1]].
The core consumes that identity for its own lease and keeps no copy of the file's rules.

Reading the root lease again found three defects the host name does not explain:

- the reclaim path removes its token-specific retired directory at once, so a reclaimer that read old owner O, delayed past another reclaimer that retired O and published N, moves N into the now-free retired path and deletes it — two writers;
- the process probe reads every error but `EPERM` as death, where only `ESRCH` proves it;
- the storage Git tool's reservation refuses every existing `.lease/`, a dead owner's included, instead of reclaiming by the core's rule.

Playbook's leases keep every retired directory permanently, nonempty, and re-read the moved owner's token; a delayed reclaimer targeting an occupied retired path fails closed.
POSIX `rename` replaces an empty directory, so only a nonempty retired directory protects a successor, and a publication that only renames its stage into place would silently replace an empty `.lease/`.

Considered and declined:

- an operating-system advisory lock: Node and Electron expose no `flock`, so each shell would carry a native addon beside `better-sqlite3`, and a local lock says nothing about a lease from another machine;
- a heartbeat with a deadline: a paused live core outlives its deadline and writes on after a contender takes over;
- a process start time beside the PID: Node has no portable probe for it, and Playbook's owner records reject unknown keys; a reused PID today yields a refusal, never a second writer, so it waits;
- injecting a Spex-only identity into Playbook's store: a lease the CLI wrote would read as foreign to the core and vice versa.

## Decision

- **The core takes this machine's identity from Playbook's facade** once, at its asynchronous start, and hands it to the store; a storage Git command resolves it the same way before reserving the home.
  While the identity is unavailable — its file unreadable, malformed, or unsafe — the core refuses to serve and a mutating storage command refuses to run, each naming the file and the reason; neither publishes `os.hostname()` in its place.
- **One root-lease rule for every home writer**, the core and the storage Git tool alike, in one shared implementation:
  the owner record keeps its shape and its `hostname` field carries the identity; a reader takes the exact tag as an identity compared with its own, an untagged value as a legacy host name compared with the current `os.hostname()`, and a value that begins like the tag but fails its form as unverifiable;
  only `ESRCH` proves an owner dead; a malformed or tokenless owner, an `owner.json` not this user's, a tagged owner whose `owner.json` others may read — every writer naming its machine publishes it private, while an untagged record an older core wrote with the default mode is read as it is — an empty active directory, an owner on another machine, a live owner, and an owner whose probe fails otherwise all refuse, naming the lock path and the reason — a failed probe or file operation by its error code — and calling a tagged value a machine identity, never a host name.
- **Retirement is permanent and exact**: a dead owner and a normal release alike move the active `.lease/` to `.lease.retired/<token>/`, keep its `owner.json`, re-read the moved owner and confirm its token before finishing; an occupied retired target or a changed token fails closed without deleting anything.
  The `.lease.retired/` parent is created private and validated before use; nothing prunes it.
- **Publication never replaces**: before renaming its populated stage `.lease.stage.<token>/` to `.lease/`, a writer inspects the target without following links and renames only on a definite `ENOENT`; a contender that loses the race — its rename failing with `EEXIST` or `ENOTEMPTY` — re-evaluates the winner by the rule above, and any other staging or rename failure refuses at once, never read as a race.
- **A storage Git command recovers a verifiably dead local owner** by that same rule instead of refusing every existing lease.
- **The former layout's `.lock/`** is read by the same rule before [DR-103](103-the-home-and-its-groups.md)'s migration: a live owner, another machine's, or one the rule cannot verify keeps the core out; a dead owner of this machine is left for the migration.
- **The desktop quits on `SIGINT` and `SIGTERM`** through its ordinary shutdown, without the active-turn confirmation, exiting 130 or 143 once the core has stopped or after a bounded wait; the source runner, having signalled the launch stage, waits a bounded time for it and then ends its process group, so the Node ABI restore is never held by a hung app.
- **Coordinated upgrade**: every writer sharing the home — the CLI and every Spex shell — stops before the first new writer runs, after the home snapshot of [DR-088](088-playbook-17-slc-0-12-cligent-0-27-adoption.md); an old binary reads a tagged owner as foreign and refuses takeover, and a legacy record whose host name has since changed still needs its lock directory moved aside by hand.
- **The Playbook floor** rises to `^17.6.0`, 17.6.0 being the first release publishing the facade [[2]]; the lock is regenerated from the public registry as [DR-092](092-playbook-17-1-slc-0-13-cligent-0-28-adoption.md) requires, holding one Playbook, 17.6.0, and the merge gate runs against that release, not a local checkout.

## Consequences

- A renamed machine reclaims its own dead root lease, and the CLI and the core take each other's dead sessions over again once both are upgraded.
- The home gains `.lease.retired/<token>/` directories, one per core start and per storage command, outside every clone and so never committed; a reader never sees a second writer behind a delayed reclaimer.
- The core's refusal messages change wording, so the English and Chinese catalogs gain entries; the storage command's refusal keeps its `stop the Spex core` opening.
- `Ctrl+C` in `npm start` releases the lease; a killed core still leaves `.lease/`, which the next start of this machine reclaims.
- Two developer Spex homes on one machine share one identity and keep separate leases.
- The build stages the built-in spec package at 17.6.0, the installed Playbook's version, so a new environment pins it there; an existing lock keeps the version it pins until its environment updates.

## References

[1]: https://github.com/sublang-ai/playbook/blob/main/specs/decisions/087-leases-name-the-machine.md "Playbook DR-087: Leases name the machine"
[2]: https://github.com/sublang-ai/playbook/blob/main/CHANGELOG.md "Playbook changelog: 17.6.0"
