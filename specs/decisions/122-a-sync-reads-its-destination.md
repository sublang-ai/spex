<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-122: A Sync Reads Its Destination

## Status

Accepted (2026-10-17).
Amends [DR-103](103-the-home-and-its-groups.md).
Amended by [DR-128](128-a-spex-repository-placed-at-several-instances.md), [DR-246](246-remove-groups-and-team-servers-from-the-clients.md).

## Context

A sync operates on one records repository, but its Check previously enriched the whole account's catalog.
An unrelated repository's detail timing out could stop a valid destination before Git ran.
The complete catalog is still needed to discover immutable identities and moves.

## Decision

- Amends [DR-103](103-the-home-and-its-groups.md)'s read before a sync: authority over the selected destination no longer requires every repository's detail.
- Full reads at sign-in, Refresh and signed-in startup retain their whole-view contract.
- Each placement's sync reads a fresh complete catalog of its Space, then enriches only its destination, at that placement's turn ([DR-128](128-a-spex-repository-placed-at-several-instances.md)).
  Catalog and destination failures remain authoritative; a failed read stops that placement before any branch or transport effect.
- The destination counts only while the Space identifies it as a repository in the signed-in account's own namespace ([DR-246](246-remove-groups-and-team-servers-from-the-clients.md)).
- A destination answer refreshes only its row, never the whole-view time.
  Reads are ordered by when they began: an older full read's success or failure cannot overwrite newer destination authority, and a later full read supersedes it.
- Changes this core makes at the Space invalidate in-flight catalog answers just as they invalidate full reads.
  Authentication, unchanged-remote and clone-move guards stand.

## Consequences

An unrelated detail failure no longer blocks one repository's sync or makes it wait for a concurrent full read.
All catalog pages must still succeed, so catalog availability remains a prerequisite.
No timeout is raised and no target failure is ignored.
