<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Operation ownership

This audit covers review findings 7b, 7c, 22 and 25.
The behavior belongs in `core-service-96`, `playbook-library-7`, the environment contract, `space-21`, `space-58` and `projects-10`; this document records the implementation boundaries and their audit.

## Rules

An asynchronous operation can prepare work while other things change.
Publishing that work requires current ownership of its destination.
Finishing an operation releases only the reservation it acquired.

| Resource | Owner | Publication boundary |
| --- | --- | --- |
| Authoring session | The live owner carrying the session's persistent instance | Admission and publication compare the current owner; departure cancels its pending work |
| Environment | The queue of operations for its clone | Enabling prepares candidate requests, resolution, installed files and config before one synchronous validated commit; ordinary requests and resolutions retain their earlier published intent |
| Repository operation | A reservation held by that operation | The reservation spans its first asynchronous preparation through completion; only that reservation can release it |
| Host repository being brought onto this device | One claim for its host id | Every adoption and Join acquires the claim before writing a remote or cloning |

These owners have different jobs: an instance identifies the session, a transaction serializes changes to shared files, and a reservation keeps a competing operation from taking the same resource.
The home-wide authoring keeper rule and the repository's existing path identity still apply.

## Environment audit

| Entry | Files or state affected | Ownership obligation |
| --- | --- | --- |
| `request`, `remove` | `spex.yaml`, then resolution and installation | Queue admission through completion counts as work; later operations read the preceding result |
| `resolveLater`, `installLater`, `ready`, `settleUnresolved`, startup | Lock, packages, skills and agent exports | Use the same per-clone queue and prepared installation |
| `applied`, `moved` | Installation and exports after a sync or move | Run within the invoking operation's lifetime without reacquiring its own repository gate |
| `requestAndInstall` for enabling | Requests, lock, packages, exports and prepared config edits | Hold one queue entry from reading inputs through preparation and commit; validate the session and every destination at commit |
| Existing request during enabling | A newly resolved lock or missing installed files | The same transaction applies even when `spex.yaml` needs no edit |
| Own roster plus project config | Two config destinations | Prepare both; validate both current files, clone addresses and gates before either is published |
| Ordinary settings and playbook config edits | Own config, or a project config validated against it | Compare the captured files and destinations at the synchronous write; a concurrent edit or repository operation refuses stale preparation |
| Failure or departure during preparation | Temporary staged files and reusable download cache | Discard prepared work; do not restore an old whole-file snapshot over another operation's accepted changes |
| Failure during synchronous commit | Only this transaction's changes | Rollback stays within the serialized commit and restores only its own effects |

For enabling, one queue turn covers the transaction as a whole, including configuration publication.
Taking snapshots outside it, or enqueuing its request, resolve and rollback separately, allows another accepted edit to be lost.
Its downloads and asynchronous configuration composition happen before visible publication; the commit validates request and lock bytes, path-source staleness and config inputs together. A check before calling an asynchronous installer is insufficient.
Ordinary Request and Remove publish the request in one queue turn, then enqueue resolution and installation. Ordinary Resolve publishes its new lock before installation; a failed download therefore leaves the new request and lock with the prior files, as `environments-14` requires. Queued and running turns both block competing repository operations.

## Repository and adoption audit

| Entry | Ownership obligation |
| --- | --- |
| Sync, Check and a choice's Apply | Reserve before asynchronous admission; retain ownership through Git work, refresh and completion |
| Remote change | Own the same reservation before reading Git state; never reset another operation's phase |
| Project removal | Retain its reservation across the media drain and final blocker check; release only that reservation |
| Namespace rename, transfer and carried clones | Reserve sources and destinations; recheck the affected clone set after preparation, rewrite holders together, and release each owned reservation |
| Pick, automatic group lookup and pending-creation retry | Own the clone while attaching and use the common host-id claim |
| Join | Claim the same host id as adoption and reserve its destination before cloning, including the interval before the clone appears in the store |
| Project Add and Create | Allocate a name only from destinations neither present nor reserved; both use the same store allocator |
| Project Rebind | Recheck the clone's address and reservation after looking up the proposed working folder, immediately before publishing the pair |
| Host-id inference and incidental Git metadata writes | Write under an owned reservation, or defer while another operation owns the clone |
| Session creation and restoration | Publish their activity before asynchronous preparation, so a repository operation observes admitted work |

The visible sync phase describes progress; it does not grant ownership.
An attachment in progress already claims its host id, even before its Git configuration or clone is visible to an ordinary scan.
Retries pass through the same ownership boundary as initial requests.

## Verification boundaries

The regression cases exercise delayed completion and competing operations against real file and Git behavior:

- Session departure during resolution or a dependency download leaves the environment and configs unchanged, including when the package was already requested.
- A failed enabling preserves another accepted package request.
- A remote change and removal exclude one another throughout their awaits; an old release cannot unlock a newer operation.
- Concurrent picks, Pick versus Join, and a pending creation retried after a separate Join leave at most one local owner of the host repository.
- A Join's pending destination cannot be allocated by Add or Create, and a namespace move cannot carry a clone that it does not own.
- Rebind refuses a repository operation that started during its folder lookup, preserving the current pair.
- Independent clones continue to make progress, and a session can still start while opportunistic host setup defers.

These transitions test the boundaries; the invariant comes from routing every writer and release through its owner.
