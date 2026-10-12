<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-114: Groups and Sharing from Spex

## Status

Accepted (2026-10-11).
Amends [DR-103](103-the-home-and-its-groups.md) in "What Spex does on a Git host": creating a group and adding a member join the list, leaving the Git host's pages for what remains.
Amends [DR-064](064-honest-remote-failure.md) in its guidance: where membership decides, the failure now names Share beside the host's members page.
Amended by [DR-118](118-the-host-page-a-first-group-is-made-on.md) in "where the host does not let this person act, nothing is shown": where the host's read says the person may not create a group, the list's head carries a link "New group at <site>" to the host's site in place of "New group".
Amended by [DR-120](120-groups-live-in-the-hosts-group.md) in "creates a group, at the top or inside a group": where the host names a group of its own, every group is created inside it, "New group" at the list's head creating there.

## Context

- [DR-103](103-the-home-and-its-groups.md) kept creating groups and adding members on the Git host's pages.
  A workshop organizer who sets up one group per team, and any team lead who shares a project's records with a colleague, had to leave Spex for the Git host, learn its pages, and come back.
  The owner's direction on 2026-10-11: these are done from the Spex app; the Git host is not a place a person works.
- spex.pub, the Git host Spex talks to, now creates groups and adds members as the person, says per person and per place what the host lets them do, and lists the host's own roles, with the host's refusal still the only answer [[1]].
- A person's own group is their user namespace on the host: it takes no subgroup and no member, so sharing what is there happens on its spex repositories.
- The owner's direction on the design: no model of Git hosts is drawn over these acts; Spex shows what GitLab.com, through spex.pub, says this person may do, and GitLab's roles as they are, so Spex hard-codes neither.

## Decision

- The minimal set for sharing records, chosen from GitLab's model: a place to share in, who has access, giving it and taking it away.
  Spex does three more things on the Git host, always with the person's own account: creates a group, at the top or inside a group, named by the reader; adds a member to a group or to a spex repository, by their login on the host, at one of the host's roles; removes a member the group or repository holds of its own.
  Changing a role is removal and addition; visibility, access requests, expiring memberships, group-to-group sharing, transfer, archive and delete are not bridged.
- Each host read brings what the person may do — create a group; in each group, create a subgroup and manage its members; on each spex repository, manage its members — and the host's roles with which may push, held in the view like everything else the host says and derived from nothing cached.
- The Groups surface shows an act exactly where the view says the person may take it: "New group" at the head of the groups list; Members and "New subgroup" on a group's heading; in a members panel, each member with "via <group>" where the membership is inherited, Share, and Remove on the members held directly; where the host does not let this person act, nothing is shown.
  Your own group's heading never carries them; its repositories' members panels carry Share and Remove where the host allows.
- The host is asked whatever the view said; a name it reports taken, a login it knows no account for, and a refusal each show in place with the host's words; nothing is retried, derived or cached.
- Everything else stays on the Git host — changing a role, visibility, transferring, archiving, deleting — reached through the "Open at <host>" link a members panel keeps.
- A second device of the same account starts from what the first pushed: where its own group's clone holds nothing of its own yet, the sign-in's join takes the host's side without asking, instead of showing a conflict over the seeded environment to a person who has not done anything yet.

## Consequences

- The organizer's whole setup — the workshop group, a subgroup per team, each team's representative added — runs in Spex, and so does a team lead's sharing of one project's records.
- The core gains three host writes and one protocol command each, and reads a group's members as a repository's; the stand-in host scripts them and what the person may do; the roles and permissions ride on the host read.
- Nothing changes in what the host decides: a refused creation or share is shown and stops there.

## References

[1]: https://github.com/sublang-ai/spex-pub/blob/main/specs/decisions/021-groups-and-sharing-from-a-spex-client.md "spex.pub DR-021: Groups and sharing from a Spex client"
