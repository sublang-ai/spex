<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-111: The Core Coordinates as Git Does

## Status

Proposed (2026-10-09).
Amends [DR-045](045-unified-session-storage.md) §Git synchronization in one rule: local writers are no longer stopped during commit, checkout and merge; every write is versioned or appended, and a sync refuses a replacement its pre-write check finds changed since Save.
Amends [DR-057](057-space-surface.md) in its admission: a sync is no longer admitted only between turns and while nothing runs, and no gate is set before its checks; a sync, like every operation, refuses nothing and reports its progress.
Amends [DR-103](103-the-home-and-its-groups.md) where it inherited that admission for the per-repository sync, and in one clause: no local claim stands for a host repository; the host's answer alone decides a race between two devices.
Keeps [DR-036](036-file-state-store.md) and [DR-108](108-the-root-lease-names-the-machine.md) whole: one process serves a home under the root lease, and Playbook's per-session lease names the one writer of a session's records.

## Context

- Five review rounds found one class of defect: a fact checked once in memory and lost across an await, a restart or a reconnect, so that a sync applied under a running turn, an enabling committed for a session that had left, a removal deleted a clone while authoring ran, a waiting creation adopted the wrong repository.
  Each round closed the instances found by adding a gate, a blocker, a reservation, a claim or a guard, and the next round found the gaps between them.
- The core, since [DR-057](057-space-surface.md), appoints itself gatekeeper over operations: while a sync, check, join, move or removal runs, every write beneath the clone is refused `busy`; a sync is admitted only while no turn, compile, enabling or foreign lease stands; the gate is set before the admission checks so nothing slips between check and act.
  Every such gate is a fact held in memory for the length of an operation, and every await inside the operation is a place where the fact can go stale.
- Git coordinates many concurrent processes on one repository without any of this [[1]] [[2]].
  It coordinates processes, never operations: an editor, a build or a long script writes the working tree while `git commit` or `git merge` runs.
  Its only lock is a file held for the instant a ref or the index is written.
  It never prevents a race; it detects one and asks the person to retry — "index.lock exists", "your local changes would be overwritten by merge".
  It keeps no live picture that can go stale: every command reads the repository.
- Playbooks writing session records are editors in a Git repository.
  Git does not care, and the core need not either, except at the instant a sync would rewrite a file an agent is appending to — which Git answers by checking before it writes and refusing a changed file, not by stopping the agent.
- Parts of the core already work Git's way: the root lease admits one process per home ([DR-108](108-the-root-lease-names-the-machine.md)); the spec editor writes under a digest token and is refused on a mismatch [[spec-view-47](../packages/spec-view.md#spec-view-47)]; a session's records are an append-only file [[storage-23](../packages/storage.md#storage-23)]; a sync compares units and lets the reader choose where both sides changed [[space-17](../packages/space.md#space-17)].
  The archived review rounds also gave an authoring session a recorded instance that every command of it names, a version in Git's shape; this record keeps that shape and drops the gates built around it.
  The rest is the gatekeeper.

## Decision

- The core coordinates processes, not operations.
  The only exclusions between writers are the root lease, one process per home; Playbook's per-session lease, one writer of a session's records; and the instant of a write.
- This decision reaches the core's writes to files and the sync that carries them, nothing more.
  How the core admits a message to a session's runtime, how a playbook runs its turn, and how the interface orders its own replies are each that process's own rule, and stay as they are.
- Every write to a file the core owns is an append or a versioned write.
  A versioned write names the version it read — the file's bytes digest, the session's recorded instance, or the clone's `spex` commit — and is refused as a conflict, "changed meanwhile, retry", when the version differs at the instant of writing; the refusal is the command's reply, and the caller reads again.
  An append — a session record under Playbook's per-session lease, an authoring record under the root lease — names no version, because one writer holds its file.
  Across devices, a file both sides appended is a unit changed on both sides, and the reader chooses, as Git conflicts on two additions at one place [[space-17](../packages/space.md#space-17)].
- No operation refuses another.
  A sync, check, join, move, removal, compile, install or enabling reports its progress and admits every command; what the gate would have refused is admitted and either succeeds, its own write versioned or appended, or is refused at its write by the rule above or by a session's lease.
- A sync commits what is on disk, merges, and refuses a replacement whose pre-write check finds the file changed since Save, honoring a session's lease.
  An independent process keeps ordinary filesystem behavior: the check is the core's own, made at the instant before its rename, and no lock holds another process off the file.
  The apply step writes each unit under the version its Save step committed, taking a session's lease for that instant as any writer of its records does ([DR-108](108-the-root-lease-names-the-machine.md)).
  Where any such write is refused, because the unit changed since Save or its session is leased, Apply records no merge commit: the Save commit stands, the units already written are local changes equal to the host's side, and the sync saves and merges again or stops for a retry.
  A unit changed on both sides is a choice the reader answers, whole units chosen as [DR-045](045-unified-session-storage.md) decided, with no merge inside a unit [[storage-11](../packages/storage.md#storage-11)] [[space-17](../packages/space.md#space-17)].
- The core reads files for its picture.
  An in-memory copy in the core is a cache validated by the file's version at use, as Git's index is validated by stat, never a source of truth; a listing or a rescan corrects nothing, because nothing can be wrong.
- Identity is what the file records.
  A session is its recorded instance, a repository on the host its id; ids and paths are addresses.
- The genuinely stateful cases keep Git's answers:

| Case | Git's answer, adopted |
| --- | --- |
| an agent appends records while a sync applies | the apply replaces a session's files only where they still read as Save committed them and the lease is free for that instant; where not, no merge commit is recorded, the Save commit stands, and the sync saves and merges again or stops for a retry, a choice where both sides changed |
| a removal while a turn runs | the removal is one write at its instant, refused where a session's lease file names a live writer ([DR-108](108-the-root-lease-names-the-machine.md)); what a process does once its folder is gone is its own affair, as an editor's after `rm -rf` |
| a clone moved by the host while work runs beneath it | the move is one rename at its instant, a versioned write of the clone's address; the core's own writes resolve the address at their instant, and a process holding the old path is its own affair |
| two devices create a group's repository at once | the host refuses the second creation of a taken name, and the refusal is the answer; no local claim stands ([DR-103](103-the-home-and-its-groups.md)) |
| an enabling whose session left during its preparation | each write is versioned on the file it writes, and a session's departure is no version of those files; the enabling finishes or fails on its own, as a script does after its terminal closed |
| a second core on the same home | the root lease refuses it ([DR-108](108-the-root-lease-names-the-machine.md)) |

### Considered and declined

- Keeping the gates and holding them correctly through every await, as the review rounds and the operation-ownership branch attempted: every gate is a fact in memory for the length of an operation, so each new await is a new hole, and the rounds proved the pattern does not converge.
- Gating only the instant of the apply, a lock held for milliseconds: a refusal at that instant is indistinguishable, for the caller, from a conflict reply, and the conflict reply needs no lock.
- A per-operation transaction log with rollback, as the operation-ownership branch built for the enabling: private preparation is kept, each file published by its own rename under its version, but the rollback of a whole write set over files other writers may have changed is exactly the overwrite Git refuses.
- Merging appended records inside a session unit by sequence, as the first draft of this record proposed: Git conflicts on two additions at one place, the whole-unit choice of [DR-045](045-unified-session-storage.md) already answers a session two devices ran, and a merge inside a unit would be a protocol of the core's own.

## Consequences

- These items state a refusal while an operation runs and change: space-11's admission table keeps only the notice [[space-57](../packages/space.md#space-57)]; space-21's sole-writer rule and every `busy` it lists; space-31's gate bullets; space-14 and space-60 where they wait for nothing running beneath a clone; projects-10's removal gate; core-service-96's refusals of a command while the session's spex repository syncs; environments-15 where a request waits for a sync; the interface items that render `busy` (space-61's controls, the Settings and Playbooks surfaces' refusals).
- These items state the rule once and gain the version each write names: storage-14 (atomic replacement under a version, and the append); space-13, space-17 and space-20 (the apply's versioned units); core-service-96 and playbook-library-70 (the instance as the session's version; no mirror); environments-7, -14 and -15 (requests, lock and installs as versioned writes, prepared privately); shared-config-roundtrip-1 (a config write under the digest it read); spec-view-50 unchanged.
- The code loses the sync machine's write gate, the dispatch gate and `spaceBlocker`, the reservations and host claims, the environment queue's blocking of repository operations, and the authoring manager's live mirror; the inventory in `docs/gatekeeper-inventory.md` lists every holder with its disposition.
- The order of change: the sync's apply first, since it is the one writer that rewrites files others hold; then the authoring mirror; then the gates, whose removal is safe once every write beneath them is versioned; then the environment's writes.
- What the reader sees: "changed meanwhile, retry" where "busy" stood, and progress where a refusal stood; no write waits for another operation to finish.
- Tests change from holding an operation and asserting a refusal to running writers concurrently and asserting that nothing is lost and every real divergence surfaces as a choice or a retry.

## References

[1]: https://git-scm.com/docs/git-update-ref "git-update-ref: refs are updated through a lock file held for the instant of the write"
[2]: https://git-scm.com/docs/git-merge#_pre_merge_checks "git-merge, pre-merge checks: a merge refuses to overwrite local changes rather than stopping their writers"
