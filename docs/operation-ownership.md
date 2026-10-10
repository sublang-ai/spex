<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Operation ownership

This audit covers review findings 7b, 7c, 22 and 25.
The behavior belongs in the specs, which this document does not restate; it records the implementation boundaries and their audit.
The items it rests on:

- environments: `environments-26` (one queue per clone, nothing written once the core stops), `environments-17` (the stopped queue's `not_found`), `environments-28` (the enabling's private preparation and validated publication), `environments-27` (their test matrix);
- authoring: `core-service-96` (owner checks and `draft.register` replies), `playbook-library-7`, `-69` and `-100`;
- config: `shared-config-roundtrip-6` and `-7`, `settings-8`, and DR-111, which amends DR-004's last-writer-wins for an overtaken edit;
- repositories: `space-11`, `-14`, `-21`, `-31`, `-60`, `-61`, `-63`, `-64`, `-65`, `-72` (host assignment) and `-37`, `projects-10`, `storage-6` and `-28`.

## Rules

An asynchronous operation can prepare work while other things change.
Publishing that work requires current ownership of its destination.
Finishing an operation releases only the reservation it acquired.

| Resource | Owner | Publication boundary |
| --- | --- | --- |
| Authoring session | The live owner carrying the session's persistent instance | Admission and publication compare the current owner; departure cancels its pending work |
| Environment | The queue of operations for its clone | Enabling prepares candidate requests, resolution, installed files and config before one synchronous validated commit; ordinary requests and resolutions retain their earlier published intent |
| Repository operation | A reservation held by that operation | The reservation spans its first asynchronous preparation through completion; only that reservation can release it |
| Host repository being brought onto this device | One claim for its host id | Every assignment and Join acquires the claim before reading which clone holds the id; the clone's reservation is taken only just before the first write |

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
| Pick, automatic group lookup and pending-creation retry | Claim the host id before reading holders; decide without reserving the clone; reserve it immediately before the first write and hold it through completion or failure cleanup; a deferral is retried, not lost: a waiting creation met by a busy clone stays waiting; a project's whose target another clone holds stays waiting, naming that clone, while a group's own retry finding its records held ends its wait, the row naming the holder under `space-65` and the lookup asked again once that hold ends; and a session-start lookup is asked again through one release signal once all admitted work beneath the clone has ended, without polling |
| Join | Claim the same host id as an assignment before its first await; reserve the real destination before cloning or writing there; hold both through pairing or the failed clone's removal; never claim under a fabricated key, a pending owner reading "being joined"; the core's stop ends its transport |
| Project Add and Create | Allocate a name only from destinations neither present nor reserved; both use the same store allocator |
| Project Rebind | Recheck the clone's address and reservation after looking up the proposed working folder, immediately before publishing the pair |
| Host-id inference and incidental Git metadata writes | Reading and inferring gate no writer; the write is coordinated so that it excludes a conflicting mutation without showing ordinary readers a busy state, and is otherwise left to a later read |
| Session creation | Publishes its activity before asynchronous preparation, so a repository operation observes admitted work |

The visible sync phase describes progress; it does not grant ownership.
An attachment in progress already claims its host id, even before its Git configuration or clone is visible to an ordinary scan.
Retries pass through the same ownership boundary as initial requests.

## Verification boundaries

The regression cases exercise delayed completion and competing operations against real file and Git behavior:

- Session departure during resolution or a dependency download leaves the environment and configs unchanged, including when the package was already requested.
- A failed enabling preserves another accepted package request.
- A real `draft.register` held in preparation is refused when a config edit, a repository operation, a rewrite of `spex.yaml` or `spex.lock`, or a changed address of its destination lands meanwhile, keeping what landed.
- A remote change and removal exclude one another throughout their awaits; an old release cannot unlock a newer operation.
- Concurrent picks, Pick versus Join, and a pending creation retried after a separate Join leave at most one local owner of the host repository.
- A Join's pending destination cannot be allocated by Add or Create, and a namespace move cannot carry a clone that it does not own.
- Rebind refuses a repository operation that started during its folder lookup, preserving the current pair.
- A group's first session gets its group's own spex repository, with no Refresh, once the clone's admitted work, that session included, has ended; a waiting creation met by a busy clone stays waiting and is retried; a lookup that writes nothing refuses no command.
- The core's stop during a Join returns promptly, leaving no half-indexed clone.

These transitions test the boundaries; the invariant comes from routing every writer and release through its owner.

## Review dispositions

The review of this change (2026-10-09) reported four musts (M), substantive shoulds (S) and nits (N); duplicates across its three lenses are consolidated by defect class.
Every substantive must and should is accepted, the session-start trigger of `space-65` preserved; no rejected finding is implemented.

| ID | Finding | Disposition | Where |
| --- | --- | --- | --- |
| M1 | A group's first session no longer received its group's own spex repository; the deferral test was vacuous | Accepted: the lookup waits while admitted work holds the clone and is asked again once it all ends, with no Refresh; the test observes the eventual assignment | `space-65`, `space-72`, `space-37` |
| M2 | A waiting creation met by a busy clone was dropped | Accepted: deferral keeps the step waiting, a project's or a group's own; a project's target held by another clone keeps it waiting with that clone named, while a group's own found held follows `space-65`, its row naming the holder | `space-64`, `space-65`, `space-61`, `space-37` |
| M3 | The enabling's publication checks had no coverage | Accepted: real `draft.register` cases for a config edit, a held repository, a changed address, changed requests or lock, and a surviving accepted request | `environments-27`, `playbook-library-100` |
| M4 | Spec lawfulness: the enabling guarantee in Internal Behavior, `environments-26` holding four requirements, the assignment bullet under `space-58`, `playbook-library-7` untested | Accepted | `environments-26` and `-28` (External), `playbook-library-69`, `space-72`, `playbook-library-100` |
| S1 | Lookups and host-id recording held the clone's write reservation while only deciding; a test waited on a private promise to hide it | Accepted: no reservation until the first mutation. Remedy modified: the id write is coordinated against conflicting mutations rather than written blindly, without a busy state for readers or a new protocol value | `space-72`, `space-21`, `space-37` |
| S2 | Core shutdown waited for in-flight Joins | Accepted: the stop ends the Join's transport | `space-63`, `space-37` |
| S3 | Test determinism: cleanup order hanging on failure, a load pause taken by background work, a remote-change hold catching another read, waits on private state | Accepted: deterministic cleanup and owned seams, waits on protocol-visible state | the affected suites |
| S4 | Weak assertions: the holder's key unasserted, guards surviving mutation | Accepted: the key asserted; publication guards exercised through real cases, overlapping guards not each claimed necessary | `space-37`, `environments-27` |
| S5 | Spec drift and duplicates: gate versus reservation, the move rule in two items, repeated release rules, the Join's destination unstated, the environment condition missing from sync admission | Accepted | `space-11`, `-14`, `-21`, `-31`, `-60`, `-63`, `projects-10`, `storage-6` |
| S6 | `draft.register`'s new replies unlisted | Accepted | `core-service-96` |
| S7 | `environments-27` with two statements, a code link and no named test; `playbook-library-100` no longer describing its test | Accepted | `environments-27`, `playbook-library-100` |
| S8 | `shared-config-roundtrip-6` contradicted DR-004 with no DR | Accepted | DR-111, `settings-8`, `shared-config-roundtrip-6` |
| S9 | A reader's pick meeting holding work had no defined reply, and refusals did not name the operation | Accepted: a pick, a creation it starts included, is refused `busy` naming the holding work, only automatic assignments deferring; `space-21`'s naming contract stands | `space-72`, `space-21`, `space-29` |
| N1 | A failed publication left the empty folders it created | Accepted | `environments-28`, `environments-27` |
| N2 | A Join's claim carried a listing path in place of a clone key | Accepted: an unknown key reads "being joined" | `space-72`, `space-61`, `space-63` |
| N3 | An enabling queued at shutdown resolved as success; a refused candidate left a sticky environment error | Accepted, the stopped-queue refusal class-wide | `environments-26`, `-17`, `-28` |
| N4 | `storage-28` said Where for a runtime state | Accepted | `storage-28` |
| N5 | This audit's item list was incomplete and named a restoration change | Accepted | this document |
| N6 | A stale compiled test inflated the reported count | Accepted: the earlier full core count is corrected to 576; no final full-suite count is claimed, and only focused results are reported after the owner waived full tests | verification |
| N7 | A stale authoring subtest name and an unbounded wait | Accepted | `playbook-library-100`'s suite |
| N8 | A move test exercising its guard only on case-insensitive filesystems; a title naming an unstarted Join | Accepted: filesystem-specific skip with its reason, and names that match | `space-37`, `storage-28`'s suite |
| R1 | An enabling could recreate a missing clone at publication | Rejected: `validateInputs` in `EnvironmentManager.settleNow` (`packages/core/src/environments.ts`) refuses a clone that is gone or no longer the store's, synchronously before `extra.validate()`, the snapshot and the commit, with no await between; the commit creates only the config folder inside a clone that stands. No guard is added; the real `draft.register` address case covers the existing protection | `environments-28`, `environments-27` |

Remedies adjusted to the implementation, beyond S1's coordinated id write and R1's rebuttal:

- A sync of the enabling's target is already refused by sync admission while the enabling runs, so the `busy` cases hold the target's spex repository with a Check and your own group's with a Sync.
- An independent request on the same queue is submitted while the enabling is held and accepted after it settles; no early reply bypasses the queue.
- A Join cannot claim a key it does not know before its host read: it claims the host id before its first await and reserves the actual destination before cloning or writing.
- A creation's host id exists only once the host's create returns it, so the claim is taken then, before reading which clone holds it.

Appendix notes the review did not raise as findings — case-alias allocation and re-exports after an ordinary Rebind — are out of this change's scope.

## Verification results

Ready for review on limited checks; this is not a full-suite green, and no CI result is claimed.

- Merged build: one `npm run build -w packages/core` on the combined environment/publication and repository changes passed — catalogs checked and compiled strictly, `tsc` clean.
- Lint: `spex lint` after the final `space-64` wording, no problems found.
- Repository and ownership, initial pass: the targeted suites passed, 89 tests. One `project-allocation` file (3 tests) was rerun with unchanged inputs; the repeat added no evidence.
- Repository follow-up: the ownership file ran 11/12 — one test waited for `done` where the join of two histories legitimately ends in merge choices; its predicate was corrected and that case passed 1/1. The changed session and remote cases passed 2/2, the records phrase 1/1.
- Repository final correction: a transient-snapshot regression failed before the code change (a released claim stranded the group's lookup) and passed after; the two named cases passed 2/2. These ran as named subsets: the 13 cases have not all run together on the final source.
- Publication: final `config-publication` 9/9, the environment manager's `environments-27` 12/12, selected authoring 6/6. An earlier accidental broad integration run gave 314/319: two were then-unfinished new cases since fixed, three needed a built CLI absent from the isolated worktree (it exists in the main checkout). The last edit, a lazy timeout getter, is test-only cleanup, type-checked by the merged build and not rerun.
- Mutants: each targeted guard property was killed by an assertion naming it. Overlaps remain, and not every guard is independently necessary: the service's destination check survives because the environment's check covers it; the session's `onReleased` alone, and the reservation release's notification alone, survive because other notifications cover them.
- Not rerun: the UI suite (963/963 earlier, unchanged inputs) and its typecheck and build. The full core, server and browser suites were deliberately omitted at the owner's request.
- Integration seams inspected: the media and environment `onIdle` hooks fire after their pending counts reach zero and route into `activitySettled`; the session's release hooks fire after `opening` and `settling` are cleared; the group lookup recomputes `heldIds` and its holder synchronously after `readOthers`; the enabling has no await between `validateInputs` and its commit. No concrete integration issue found.

Rebuttal F4 (rejected): a duplicate blocker check before the reservation is not added. Discovery stays ungated, but a selected mutation's asynchronous admission must lie inside the reservation, so a check outside it proves nothing. The missing-clone refusal stands as R1 records, upheld by `validateInputs`. Cleanup of a dangling symlink's parent is theoretical and not material. `onIdle` only schedules the guarded asynchronous retry, whose failures `activitySettled` already catches, so no generic catch-all is needed.
