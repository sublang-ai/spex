<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-118: The Host Page a First Group Is Made On

## Status

Accepted (2026-10-11).
Amends [DR-114](114-groups-and-sharing-from-spex.md) in "where the host does not let this person act, nothing is shown": at the groups list's head, where the host's read says the person may not create a group, a link to the host's site stands in place of "New group".
Superseded by [DR-120](120-groups-live-in-the-hosts-group.md) where the host names a group of its own: every group is made inside it from Spex, and the link stands only where the host names none.

## Context

- [DR-114](114-groups-and-sharing-from-spex.md) shows "New group" at the groups list's head exactly where the host's read says the person may create one, and nothing otherwise.
- GitLab.com refuses creating a group at the top through its API, so spex.pub answers that nobody may create one there: a group at the top is made once on GitLab.com's own pages, and everything beneath it from Spex [[1]].
- In the 2026-10-11 workshop simulation, the organizer found no "New group" and nothing naming the one thing she had to do on the host's pages.
- [DR-069](069-key-phrases-not-sentences.md): what is not offered is not explained; a key phrase where it applies is enough.

## Decision

- Where the host's read says the person may not create a group, the list's head carries one link, "New group at <site>", leading to the host's site — the origin of the person's own group's page as the read gives it — and no explanation.
- Where the read says the person may, "New group" stands as [DR-114](114-groups-and-sharing-from-spex.md) decided; before a read gives that page, neither stands.

## Consequences

- An organizer on GitLab.com sees where her first group is made, then makes every subgroup and share from Spex.
- Where a host refuses a person groups altogether, the link still leads to its site, whose own pages say so.

## References

[1]: https://github.com/sublang-ai/spex-pub/blob/main/specs/decisions/021-groups-and-sharing-from-a-spex-client.md "spex.pub DR-021: Groups and sharing from a Spex client"
