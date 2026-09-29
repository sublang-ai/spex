<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# State-root lock: review of the two-repository revision

**Status:** Discussion notes (2026-09-29) on the revision of [state-root-lock-review.md](state-root-lock-review.md) made after the rebase onto `main` and the refresh of the local Playbook checkout. Temporary, like the earlier rounds in [state-root-lock-review-comments.md](state-root-lock-review-comments.md).

## Summary

The revision's new findings about the Spex root lease are real and verified against the rebased code: the storage reservation refuses every existing lock, the reclaim path has a delayed-reclaimer race, and the process probe counts any non-`EPERM` error as death.
Its claims about Playbook 17.0.0 hold against both the installed package and the local checkout.
Five points remain, two of which change the plan's shape: the mixed-version scope contradicts Playbook's own upgrade policy, and the synchronous identity API pushes a second file-safety implementation into Playbook.

## Verified against both repositories

| Claim in the revision | Evidence |
| --- | --- |
| The storage reservation refuses any existing `.lock/`, dead owner or not | [storage-git.ts](../packages/core/src/storage-git.ts) `reserveStorageHome`: a failed rename throws without reading the owner |
| A delayed reclaimer can move and delete a successor | [store.ts](../packages/core/src/store.ts) `acquireRootLease`: the retired path is removed at once, so a second `rename(lock, retired.<O>)` succeeds against the new owner's directory |
| Only `EPERM` reads as alive | [store.ts](../packages/core/src/store.ts) `processAlive`: every other error returns dead |
| Playbook 17.0.0 declared, locked, installed; local checkout at 17.0.0 with an empty Unreleased section and no lease-file changes since the tag | `packages/core/package.json`, `package-lock.json`, the Playbook `CHANGELOG.md` and `git log 82bb138..HEAD` on the three lease files |
| Playbook keeps token-specific retired paths and re-checks the moved owner's token | `session-store.js` `retiredPathFor`/`readRetiredLease`; `repository-effects.js` `retired-<token>` with a post-move token comparison |
| The prospective-worktree claim is process-local | Playbook [playbook-cli-57](../../playbook/specs/packages/playbook-cli.md#playbook-cli-57) |
| Named Playbook spec files exist | `specs/packages/session-storage.md`, `specs/packages/playbook-cli.md` |

The Chinese text matches the English.

## Comments

### 1. The mixed-version scope contradicts Playbook's upgrade policy

Playbook 17.0.0 already states that hosts through 16.0.x cannot open the sessions it saves and that every application sharing a store upgrades together.
Its [release-35](../../playbook/specs/packages/release.md#release-35) makes a mixed store an unsupported configuration and requires stopping all older writers before a new writer saves.
The revision instead asks for "supported mixed-version combinations" to be tested and documents an old CLI refusing tagged owners as an availability limit to live with.

Choose one:

- **Coordinated upgrade, the existing policy.** The identity change ships under the same gate: stop every older writer, then upgrade both hosts. Old *records* left by stopped writers still need the legacy same-host/dead-PID rule; old *writers* do not need support. The test matrix shrinks to "old records read by new readers".
- **Genuine mixed-version support.** Then the proposal must say which combinations are supported and for how long, which release-35 currently forbids.

The first matches Playbook's own spec and needs no new rule; the revision should say so and drop the mixed-writer tests it no longer needs.

### 2. A synchronous identity API means a second file-safety implementation

`Store` is constructed synchronously and `reserveStorageHome` is synchronous, so the revision asks Playbook for a synchronous identity API "with a synchronous file-I/O adapter with the same handle verification".
Playbook's `prepareSessionPermissions` is `fs.promises`-based with handle identity checks; a synchronous twin is a second implementation of the rule the proposal says must exist once.

The alternative is one asynchronous Playbook API and a small Spex change: resolve the identity once at service start, before `new Store`, and pass it into `Store` as an option and into `reserveStorageHome` as a new parameter.
`Store` is built inside a private constructor that only the service's asynchronous factory reaches, and the reservation's two callers, the merge selection in `storage-git.ts` and the `storage-git.mjs` script, are asynchronous already.
That keeps one implementation upstream at the cost of one parameter downstream, which is the smaller change overall.

### 3. Occupied is not enough; the retired path must stay non-empty

POSIX `rename(2)` replaces an existing *empty* directory.
Playbook's retired directories are safe because they keep their owner file.
The Spex rule "leave that path occupied so a delayed reclaimer cannot move a successor into it" should say non-empty, with the owner file retained.

The same fact touches release: a crash inside the recursive removal can leave an empty `.lock/` that a later publication rename silently replaces while a concurrent reader reports it as an unreadable lock.
The outcome is safe either way, since the releasing owner had already given up, but the proposal should name the empty directory as a state and say which reading it gets.

### 4. Add the post-move token check to the Spex list

Playbook re-reads the moved owner after the rename and fails if the token changed.
The Spex row asks for "exact-owner retirement to a permanent token-specific path" but not for that check.
With an `ESRCH`-only probe and permanent paths the check is redundant in every interleaving I can construct, but it is one read, it is what Playbook means by exact-owner, and it turns an argument into an assertion.

### 5. Tokenless owners need no legacy protocol

Every owner Spex has ever written carries a token, in both the core and the storage reservation.
"A malformed or tokenless owner is not automatically retired without a separately proven safe legacy protocol" can therefore be shortened to: a tokenless owner is malformed and refused.
That removes one open item.

## Smaller notes

- The Spex PR row names the contracts generically. The storage Git tool's refusal wording and the root-lease test item ([core-service-61](../specs/packages/core-service.md#core-service-61) and its verifying test) are the concrete spec changes; the storage command recovering a dead local owner is a new behavior that needs its own item.
- If comment 1 takes the coordinated-upgrade path, the Playbook PR also touches `release.md`, beside the two files the revision names.
- Development of the Spex PR will need a local link or pack of unreleased Playbook. The revision forbids validating with it, which is right for the merge gate; it should say development may use it so the rule is not read as a ban on working ahead.

---

# Round 2 (2026-09-29): comments on the coordinated-upgrade revision

Every point of the first round is in: the rollout is a coordinated upgrade under Playbook's release-35 and Spex's [DR-088](../specs/decisions/088-playbook-17-slc-0-12-cligent-0-27-adoption.md) snapshot rule, the identity API is asynchronous and resolved before the synchronous `Store` and reservation, retired paths are nonempty with the owner file, the post-move token check is required, a tokenless owner is malformed, the Spex spec items are named, `release.md` is in the Playbook PR, and a local Playbook build is allowed for development.
The new citations resolve: [core-service-63](../specs/packages/core-service.md#core-service-63) is the verifying test of the admission contract, [storage-10](../specs/packages/storage.md#storage-10) carries the command-refusal wording, and DR-088 does require a home snapshot before hosts upgrade together.
The rebind command builds a `Store`, so the injected option covers it; the demo helper builds one too.
The Chinese text matches.
Two implementation points remain.

### 1. Say where permanent retired directories go, and that nothing prunes them

Playbook keeps every retired lease directory forever: `makeLeaseStage` refuses a token whose retired path exists, `retireObservedLease` and `retireClaim` rename and re-read, and no code in the package removes a retired path.
Those directories sit inside the sessions directory.
The Spex root lease now retires on every normal release as well, so each core start and each storage command leaves one directory, and with today's naming they land at the top of `~/.spex` beside the user's files.

Suggest one nested location such as `.lock.retired/<token>/`, which the existing `.lock*` ignore rules in the storage Git tool and the portable-file filter already cover, and an explicit sentence that retired directories are never pruned, matching Playbook, since no prune bound can be proved against a delayed reclaimer.

### 2. Refusing an empty active `.lock/` needs a check before the publication rename

POSIX `rename(2)` succeeds onto an empty directory, so a publication that only renames the stage into place silently replaces an empty `.lock/` instead of refusing it.
The refusal the revision specifies therefore needs an existence check before the rename.
The check-then-rename gap is safe: if another writer publishes in between, the rename fails on the nonempty target and the contender loops or refuses as it would for any held lock.
With rename-based release Spex itself never creates the empty state, so this only guards records left by the old release path or by hand.

---

# Round 3 (2026-09-29): comments on the retirement-and-publication revision

Both round-2 points are in: retirement records live under `<state-root>/.lock.retired/<token>/`, are kept permanently with their owner file, and are never pruned; publication inspects the active path without following symlinks and renames only on a definite `ENOENT`, with an existing entry evaluated by the shared rules and the check-then-rename gap argued correctly.
The verification list names the new cases.
The Chinese text matches.

Checked that the nested location is inert for existing code: the home-tree copy in `storage-git.ts` skips every `.lock`-prefixed entry, the portable-file filter and the `/.lock*` Git rule exclude it, storage diagnostics do not enumerate top-level entries, and the core's watchers target the config directory and the sessions directory, not the home root.

No new points.
The proposal is consistent end to end, every Spex-side rule is now concrete enough to specify, and the remaining open details are the Playbook identity-file internals it delegates by name.
