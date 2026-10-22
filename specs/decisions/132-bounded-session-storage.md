<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-132: Bounded Session Storage

## Status

Accepted (2026-10-22) on the owner's direction to make runtime session files bounded end to end.
Amends [DR-045](045-unified-session-storage.md) and [DR-103](103-the-home-and-its-groups.md) in the portable session's files: Playbook's versioned root, replay descriptor and session-owned immutable chunks replace the monolithic manifest and replay for new sessions, with the semantic host API preserved.
Amends [DR-111](111-the-core-coordinates-as-git-does.md) in a session unit's members and publication order: every chunk belongs to its session, dependencies precede their descriptor and root, and a chunk added since Save refuses that unit's replacement.

## Context

A session's recovery snapshot and replay grow with its work.
Splitting the durable representation into bounded immutable files keeps one session's files transferable while retaining the complete recovery state and history.
Spex must select a session whole rather than select its physical files independently.

## Decision

- Playbook owns the physical format, its content bounds, hydration, validation and explicit conversion of legacy sessions; the semantic manifest and replay contracts presented to hosts remain unchanged.
- A session's tracked unit includes its root, replay descriptor, every file in its own chunk directory, its legacy replay where present, and its owned assets.
- A selected session must validate through the shared store with every referenced chunk from that selected revision; missing or damaged dependencies refuse the candidate before any live write.
- Apply writes chunks and assets before the replay descriptor and publishes a replacement root before removing obsolete dependencies, retaining manifest-last deletion, under the existing lease and version check; files added to the chunk directory since Save count as a changed unit.
- Historical choice labels and counts read the selected revision through Playbook, never through the current working tree.
- A new receipt-backed import stage retains and validates bounded sessions arriving in the home's former root session directory before the released groups migration runs, then publishes their complete families into the matching clone after the home exists; released migrations stay unchanged.
- New-format support is a coordinated upgrade of the CLI and embedding hosts, stopping older writers before any new writer saves; old sessions stay readable and conversion is explicit.
- This change rewrites no existing commit and does not claim that new bounded files remove oversized blobs from prior history.

## Consequences

Spex's execution, history and recovery continue through the hydrated shared API.
The sync and explorer recognize the physical files without implementing Playbook's codec.
Authoring sessions remain a separate Spex-owned format.
