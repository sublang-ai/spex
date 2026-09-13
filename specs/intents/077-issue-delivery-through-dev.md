<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-077: Issue Delivery Through `/dev`

## Status

Done (2026-09-13): the live `/dev` run on the throwaway repository ended with the pull request merged and the issue closed; see Verification.

## Intent

A GitHub issue handed to `/dev` becomes a branch, the planned `decide` and/or `code` work, a pull request, a green CI run, a merge, and a closed issue, with no human step between them: adopt the playbook release whose `dev` composes the new `branch` and `pr` built-ins, route the Dashboard's issue capture to `/dev`, and prove it on a real repository.

## Deliverables

- [x] Spex requires the playbook release that ships `branch` and `pr` and the issue-aware `dev`; the built-in catalog offers both new playbooks with `dev.coder` bindings.
- [x] A new DR supersedes DR-054's "the Boss merges": an issue seed dispatches `/dev` with the issue, and delivery ends at the merged pull request and the restored default-branch checkout.
- [x] The Dashboard's issue seed and its coverage follow the new DR.
- [x] A real `/dev` run on a throwaway repository's issue produces a branch, a pull request, a green check, a merge commit on the default branch, and the issue closed.

## Tasks

1. Record the DR and this intent; amend the dashboard and playbook-library spec items.
2. Raise the playbook floor, refresh the lockfile, and extend the built-in catalog and its coverage.
3. Change the issue seed and its unit and journey coverage.
4. Run the live verification on the throwaway repository and record the evidence here.

## Verification

- `npm test -w packages/core`, `npm test -w packages/ui`, `npm run e2e`, `spex lint`: green on Playbook 13.2.0 (core 302, journeys 50).
- Live: from the Spex app on the throwaway repository, `/dev` with the seeded issue; evidence is the merged pull request URL, the CI run, and the issue's closed state.
- Live note (2026-09-12): with the Captain on `claude-opus-5`, the Analyst's adjudication call was refused twice by the provider's safeguard classifier ("Opus 5's safeguards flagged this message"); the workflow parked in its recoverable failure, and switching the Captain to `claude-fable-5-1` let "Retry and continue the iteration" proceed — a provider-side false positive, not a playbook defect.
- Live result (2026-09-13), from the served shell on a scratch home over the clone of `basicthinker/spex-playground`: the Dashboard's Queue control captured issue #1 as `/dev Address #1: Add a greet(name) helper` and Start dispatched it; `dev` chose `code via pull request`, `branch` created `issue-1-add-greet-helper` with an `unchanged` receipt, `code` committed `6638019` and its nested `review` passed with no findings, `pr` pushed the branch and opened pull request #2, its wait script watched the check to success (`gh pr checks --watch`), its merge script merged with merge commit `a65ed0b`, deleted the branch, and checked out `main`, and its fast-forward left the clone clean on the merged head; GitHub closed issue #1 on the merge (https://github.com/basicthinker/spex-playground/pull/2). The Captain's final reply reported the completion. The check sat in GitHub's runner queue for over two hours until a push to `main` unstuck it; the playbook's wait held throughout without a timeout, as designed.
