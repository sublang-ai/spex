<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-135: Bounded Session Storage

## Status

Accepted (2026-10-22) on the owner's direction to make runtime session files bounded end to end.
Amends [DR-045](045-unified-session-storage.md) and [DR-103](103-the-home-and-its-groups.md) in the portable session's files: Playbook's versioned root, replay descriptor and session-owned immutable chunks replace the monolithic manifest and replay for new sessions, with the semantic host API preserved.
Amends [DR-111](111-the-core-coordinates-as-git-does.md) in a session unit's members and publication order: every chunk belongs to its session, dependencies precede their descriptor and root, and a chunk added since Save refuses that unit's replacement.
Amends [DR-131](131-playbook-17-11-1-adoption.md) in the Playbook floor and built-in release, and permits its compiler-only nested Playbook dependency; the remaining dependency and SDK identities stay preserved.

## Context

A session's recovery snapshot and replay grow with its work.
Splitting the durable representation into bounded immutable files keeps one session's files transferable while retaining the complete recovery state and history.
Spex must select a session whole rather than select its physical files independently.
slc 0.19.0 declares Playbook `^17.11.0`, and its shipped entry points use phase execution, ABI validation and compiler definitions rather than the Captain session store or host.
Releasing an unrelated compiler update only to deduplicate those libraries is unnecessary for the session-format upgrade.

## Decision

- The core requires Playbook `^18.0.0`, adopted from its verified public release with the npm lock regenerated from that artifact; Cligent, slc, xstate and existing agent SDK resolutions stay unchanged unless a separate adoption requires otherwise.
- Root acceptance tooling declares the same Playbook 18 development dependency so its direct session-store imports use the supported writer rather than an accidentally hoisted compiler dependency.
- The unchanged slc 0.19.0 may resolve its declared Playbook 17 dependency naturally as a nested compiler-only copy; it must never serve as a Captain session writer, and the core's session-store/host APIs use Playbook 18.
- The installed closure keeps one shared Cligent and xstate with their existing SDK identities, without overrides or links; the official post-install lock and physical dependency tree must verify that closure.
- The built-in `sublang/playbooks` package follows the installed Playbook 18 release; existing environment locks keep their selected release until explicitly resolved again.
- Playbook owns the physical format, its content bounds, hydration, validation and explicit conversion of legacy sessions; the semantic manifest and replay contracts presented to hosts remain unchanged.
- A session's tracked unit includes its root, replay descriptor, every file in its own chunk directory, its legacy replay where present, and its owned assets.
- A selected session must validate through the shared store with every referenced chunk from that selected revision; missing or damaged dependencies refuse the candidate before any live write.
- Apply writes chunks and assets before the replay descriptor and publishes a replacement root before removing obsolete dependencies, retaining manifest-last deletion, under the existing lease and version check; files added to the chunk directory since Save count as a changed unit.
- Historical choice labels and counts read the selected revision through Playbook, never through the current working tree.
- With source writers stopped, a new receipt-backed import stage retains and validates bounded sessions arriving in the home's former root session directory before the released groups migration runs, then publishes their complete families into the matching clone after the home exists; released migrations stay unchanged.
- New-format support is a coordinated upgrade of the CLI and embedding hosts, stopping older writers and snapshotting their shared home before any new writer saves; old sessions stay readable, with explicit source-retaining migration required before continuation.
- This change rewrites no existing commit and does not claim that new bounded files remove oversized blobs from prior history.

## Consequences

Spex's execution, history and recovery continue through the hydrated shared API.
The sync and explorer recognize the physical files without implementing Playbook's codec.
Authoring sessions remain a separate Spex-owned format.
