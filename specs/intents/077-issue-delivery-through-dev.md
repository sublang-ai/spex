<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-077: Issue Delivery Through `/dev`

## Status

In progress (started 2026-09-12).

## Intent

A GitHub issue handed to `/dev` becomes a branch, the planned `decide` and/or `code` work, a pull request, a green CI run, a merge, and a closed issue, with no human step between them: adopt the playbook release whose `dev` composes the new `branch` and `pr` built-ins, route the Dashboard's issue capture to `/dev`, and prove it on a real repository.

## Deliverables

- [ ] Spex requires the playbook release that ships `branch` and `pr` and the issue-aware `dev`; the built-in catalog offers both new playbooks with `dev.coder` bindings.
- [ ] A new DR supersedes DR-054's "the Boss merges": an issue seed dispatches `/dev` with the issue, and delivery ends at the merged pull request and the restored default-branch checkout.
- [ ] The Dashboard's issue seed and its coverage follow the new DR.
- [ ] A real `/dev` run on a throwaway repository's issue produces a branch, a pull request, a green check, a merge commit on the default branch, and the issue closed.

## Tasks

1. Record the DR and this intent; amend the dashboard and playbook-library spec items.
2. Raise the playbook floor, refresh the lockfile, and extend the built-in catalog and its coverage.
3. Change the issue seed and its unit and journey coverage.
4. Run the live verification on the throwaway repository and record the evidence here.

## Verification

- `npm test -w packages/core`, `npm test -w packages/ui`, `npm run e2e`, `spex lint`.
- Live: from the Spex app on the throwaway repository, `/dev` with the seeded issue; evidence is the merged pull request URL, the CI run, and the issue's closed state.
