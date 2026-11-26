<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-144: Bounded Session Storage

## Status

Accepted (2026-10-22) on the owner's direction to make runtime session files bounded end to end.
Amends [DR-045](045-unified-session-storage.md), [DR-103](103-the-home-and-its-groups.md), [DR-111](111-the-core-coordinates-as-git-does.md).

## Context

A session's recovery snapshot and replay grow with its work.
Splitting the durable representation into bounded immutable files keeps one session's files transferable while retaining the complete recovery state and history.
Spex must select a session whole rather than select its physical files independently.

## Decision

- Root acceptance tooling declares the core's Playbook as a development dependency, so its direct session-store imports use the supported writer rather than an accidentally hoisted copy.
- Playbook owns the physical format, its content bounds, hydration, validation and explicit conversion of legacy sessions; the semantic manifest and replay contracts presented to hosts remain unchanged.
- A session's tracked unit includes its root, replay descriptor, every file in its own chunk directory, its legacy replay where present, and its owned assets.
- A selected session must validate through the shared store with every referenced chunk from that selected revision; missing or damaged dependencies refuse the candidate before any live write.
- Apply writes chunks and assets before the replay descriptor and publishes a replacement root before removing obsolete dependencies, retaining manifest-last deletion, under the existing lease and version check; files added to the chunk directory since Save count as a changed unit.
- Historical choice labels and counts read the selected revision through Playbook, never through the current working tree.
- Session observations begun at a clone's former location are discarded after a move, so a stale read cannot exclude a valid moved family from its first Sync.
- With source writers stopped, a new receipt-backed import stage retains and validates bounded sessions arriving in the home's former root session directory before the released groups migration runs, then publishes their complete families into the matching clone after the home exists; released migrations stay unchanged.
- New-format support is a coordinated upgrade of the CLI and embedding hosts, stopping older writers and snapshotting their shared home before any new writer saves; old sessions stay readable, with explicit source-retaining migration required before continuation.
- This change rewrites no existing commit and does not claim that new bounded files remove oversized blobs from prior history.

## Consequences

Spex's execution, history and recovery continue through the hydrated shared API.
The sync and explorer recognize the physical files without implementing Playbook's codec.
Authoring sessions remain a separate Spex-owned format.
