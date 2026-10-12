<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-120: Groups Live in the Host's Group

## Status

Accepted (2026-10-12) on the 2026-10-11 workshop simulation's finding that the organizer placed the workshop group wrong three times.
Amends [DR-103](103-the-home-and-its-groups.md) in its scenarios: "Set up a workshop or a team" joins them.
Amends [DR-114](114-groups-and-sharing-from-spex.md) where Spex creates a group at the top: where the host names a group of its own, every group is created inside it, "New group" at the groups list's head creating there.
Supersedes [DR-118](118-the-host-page-a-first-group-is-made-on.md) where the host names a group of its own: "New group at <site>" stands only where the host names none.

## Context

- Each spex.pub deployment owns one group at the top of its Git system — the internal instance's is `spex-internal` — and every group a person makes lives inside it as a private subgroup; nobody makes a group at the top [[1]].
- [DR-118](118-the-host-page-a-first-group-is-made-on.md) sent a person who may not create a group at the top to the host's own site, on the premise that a first group is made on GitLab.com's pages.
  In the 2026-10-11 workshop simulation the organizer then made the workshop group there, at the top and outside the deployment's group, and placed it wrong three times.
- The Groups surface knew nothing of the host's own group: its list was one forest in the order of full paths, its head offered "New group at <site>", and the pick listed every group alike.
- The one act a fresh person cannot do herself is joining the deployment's group: its owner shares it with her.
- [DR-069](069-key-phrases-not-sentences.md): key phrases, not sentences.

## Decision

- The host's read names the group the host owns, or none, and marks that group's row among the person's groups where she is a member of it [[1]].
- Where the host names a group, it is where every group is made:
  - On Groups it stands first after your own, headed "<name> · this host's group", then every group inside it, then every other group.
  - "New group" at the list's head creates a private subgroup of it, where the host says the person may create a subgroup there; its own heading carries no "New subgroup", the head's "New group" being that act.
  - Where the person is not a member of it, the list's head reads "Groups are made in <name>; ask its owner to share it with you", and no door to the host's site is shown.
  - The pick lists the groups inside it first, under the same phrase.
- Where the host names no group, the list's head stands as [DR-114](114-groups-and-sharing-from-spex.md) and [DR-118](118-the-host-page-a-first-group-is-made-on.md) decided.
- The sign-in card reads "Sign in to make your groups and share each project's records with the people in them."
- [DR-103](103-the-home-and-its-groups.md)'s scenarios gain one:

| Situation | What happens |
| --- | --- |
| Set up a workshop or a team | Sign in; where you are not a member of the host's group, ask its owner to share it with you. "New group" makes the workshop's group inside it, "New subgroup" each team's, and Share adds each team's people. |

## Consequences

- An organizer sets up a workshop in Spex alone, every group landing inside the deployment's group, and a newcomer reads the one thing she needs from someone else.
- The host client reads the host's group and the mark on its row; the Groups state carries both; the stand-in host names a group of its own by default, can name none or leave the person out of it, and lets nobody create a group at the top unless a test says so.
- `space` (the list's order and head, the sign-in card, the pick, New group) and `git-host` (the read, the stand-in) change.

## References

[1]: https://github.com/sublang-ai/spex-pub/blob/main/specs/packages/host.md "spex.pub host package"
