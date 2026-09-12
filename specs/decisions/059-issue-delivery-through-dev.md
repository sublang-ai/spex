<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-059: Issue Delivery Through `/dev`

## Status

Accepted (2026-09-12).
Supersedes [DR-054](054-issue-intent-delivery.md): the issue seed no longer instructs a coder to branch and open a pull request, and the Boss no longer merges.
Amends [DR-035](035-intent-ledger.md)'s issue capture seed and [DR-037](037-playbook-12-adoption.md)'s built-in catalog.

## Context

- DR-054 carried the delivery steps as seed prose for the Captain to route, ending at an open pull request that the Boss merged by hand.
- Playbook 13.2 ships two maintained playbooks, `branch` and `pr`, and an issue-aware `dev` that composes them [[1]]: when a development request names a GitHub issue or asks for pull-request delivery, `dev` calls `branch` before its `code` or `decide`-then-`code` path and `pr` after `code` succeeds; `pr` publishes the branch, waits for the checks, fixes red checks through `code` once, merges with a merge commit, deletes the branch, and restores the default-branch checkout, and GitHub closes the linked issue on merge.
- The Captain's command parse takes everything after a registered command, later lines included, so a seed starting with `/dev` dispatches deterministically with the issue reference in its body.

## Decision

- An issue seed is `/dev Address #N: <title>`, a blank line, and the issue's canonical URL; it carries no delivery instructions, because the playbooks own them.
- Delivery ends at the merged pull request and the restored default-branch checkout, or at a typed `pr` failure that leaves the pull request open; the Boss merges nothing by hand.
- Spex requires Playbook 13.2 or later and adds `branch` and `pr` to the built-in catalog, seeded through the installed starter with their `coder` roles bound to `dev.coder`.
- While `dev` is configured but `branch` or `pr` is not, the Library marks `dev`'s pull-request delivery unavailable and names the built-ins to enable; a plain `/dev` request keeps working.

## Consequences

- Newly queued issues carry the `/dev` seed; existing intents keep their text.
- The Dashboard's Queue control on an issue is the one gesture from issue to merged pull request, gated by the playbooks' own review and by the repository's checks.
- A repository with no checks merges on the strength of `code`'s nested review alone; branch protection that refuses the merge ends the run at `pr`'s failure with the pull request open.

## References

[1]: https://github.com/sublang-ai/playbook/blob/main/specs/decisions/050-pull-request-delivery.md "Playbook DR-050: Pull-Request Delivery Through BRANCH and PR"
