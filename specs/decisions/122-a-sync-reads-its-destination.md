<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-122: A Sync Reads Its Destination

## Status

Accepted (2026-10-17).
Amends [DR-103](103-the-home-and-its-groups.md)'s read before sync: selected destination authority no longer requires every repository's detail.

## Context

A sync operates on one records repository, but its Check previously enriched the whole account's catalog.
An unrelated repository's detail timing out could stop a valid destination before Git ran.
The complete catalog is still needed to discover immutable identities, moves and colliding user namespaces.

## Decision

- Full reads at sign-in, Refresh and signed-in startup retain their whole-view contract.
- Sync and its first-sharing notice read a fresh complete catalog, then enrich only the selected destination.
  Catalog and destination failures remain authoritative; unreadable members remain unknown and require the conservative notice.
  A failed notice read refuses admission before Save; Check rechecks current membership before any branch or transport effect without inventing an acknowledgement.
- A destination answer refreshes only its row, never the whole-view time.
  Reads are ordered by when they began: an older full read's success or failure cannot overwrite newer destination authority, and a later full read supersedes it.
- Host changes made by this core invalidate in-flight catalog answers just as they invalidate full reads.
  Authentication, unchanged-remote and clone-move guards stand.

## Consequences

An unrelated detail failure no longer blocks one repository's sync or makes it wait for a concurrent full read.
All catalog pages must still succeed, so catalog availability remains a prerequisite.
No timeout is raised and no target failure is ignored.
