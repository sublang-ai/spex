<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-145: Merge on Green

## Status

Accepted (2026-10-23) on the owner's direction to make merging timely while several people land work on `main` at once.
Extends [DR-086](086-tests-in-tiers.md) in the CI check tier: the check is the gate every merge into `main` passes through, run once per pull-request head.

## Context

Several branches now land on `main` in one day.
A pull request's checks run against the pull request merged with `main` as it stands, so a run goes stale the moment `main` moves, and a stale green run was not enough to merge once the branch turned conflicting or `main` brought a red test of its own.
Nothing kept `main` green: a merge needed no check, so a red test or a duplicate spec item on `main` turned every open pull request red.
Every push to a branch queued a full run beside the runs it superseded, the macOS runners queued for hours, and deleting a merged base branch closed the pull requests stacked on it.
The suites held assumptions the CI platform did not share: an order Git's listing or a directory listing happened to give on macOS, a wall-clock bound a loaded runner missed, an exact count of a tool's calls one Git version made and another did not, a scripted fault one call consumed before the call under test; each cost a full round to find, since the Linux runner's Git 2.55 was the only place they showed.

## Decision

- `main` is protected: a merge into it requires every job of the CI workflow to have passed on the pull request's head, with no requirement that the branch be up to date with `main`, so a green run stands until the branch itself changes.
- A pull request merges by GitHub's auto-merge once its checks pass, the maintainer having asked for the merge when the pull request was ready, so no interval stands between green and merged for `main` to move in; where the repository can hold no protection — a private repository on GitHub's free plan — the maintainer merges through `npm run merge-on-green`, which waits for the head's checks and merges the moment they are green.
- The CI workflow runs one run per pull-request head: a push to the branch cancels the run of the head it supersedes, while a push to `main` cancels nothing.
- A pull request's run is the Linux and Windows matrix plus one macOS smoke job — the macOS runner queue was the slowest link — and a push to `main` and a nightly run take the full matrix, so a macOS-only difference is found on `main` within a day and never holds a merge.
- A base branch is never deleted while a pull request still targets it: GitHub retargets its children only when the base merges, and deleting it closes them.
- Before a push, the developer/agent runs the pre-push check — no conflict marker left in the tree, `spex lint`, the catalogs' check and the type check — so a push never carries what the first CI minute would refuse, nor a spec item id another branch took.
- A suite is deterministic by construction: it takes no order from Git's listings or a directory listing but sorts both sides or reads the order its subject promises, bounds no step by wall-clock time but by the event the behavior names, counts no tool's calls exactly but asserts where they went, and scripts a fault to outlast every call that may consume it before the call under test.
- The CI platform runs locally on demand: `npm run test:linux` runs a workspace's tests in a Linux container holding the runners' Node and Git versions, so a platform difference shows before a push.

## Consequences

- A red test on `main` blocks every merge until `main` is fixed, which is what keeps `main` green: a fix for `main` is a pull request like any other, and it merges once its own checks pass.
- `release` states the merge rule, the run per head, the pull request's reduced matrix, the pre-push check and the parity script; its workflow audit asserts the cancellation rule, the matrix per event and that the required checks name the pull request's jobs.
- The repository's branch protection and auto-merge settings are the operator's to set; the record names them so a person can check them against the specs.
