<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-109: Your Own Group's Spex Repository Stays in Your Own Group

## Status

Accepted (2026-10-08).
Amends [DR-103](103-the-home-and-its-groups.md) in the scope of your own group's spex repository's identity and host moves: `home.yaml` records it by key, a move within your own group is followed with the local-only clones of your own group's folder, and a move out of your own group is not followed; every other spex repository's rename or transfer is still followed by id.
Completed by [DR-110](110-known-by-its-place-found-by-its-records.md) in the one scope left for later: a device signing in after a namespace rename finds your own group's spex repository by the records it holds.

## Context

- `home.yaml` named your own group by its folder, and Spex derived your own group's spex repository from that name as `<own>/<own>-spex`.
- The host renames a person's namespace without renaming the repositories in it, so after a rename it lists your own group's spex repository under the new namespace with its old name, and the derived key names no clone.
- After a rename differing only by case, the clone followed the host's spelling while the folder name `home.yaml` held did not, and Spex read your own group's spex repository as another group's.
- After any namespace rename, the clones you added for yourself and never put on the host stayed in the former folder, which no sync of theirs would move, and the Groups surface listed that folder as a second group.
- [DR-103](103-the-home-and-its-groups.md) follows every rename or transfer by id.
- Followed out of your own group, a transfer would make another group your own: your sessions outside any project and your settings would be pushed to that group's members, and nothing on the Groups surface would say so.

## Decision

- `home.yaml` records your own group's spex repository by its key, whose group names your own group's folder.
- A move of it within your own group, a rename of your namespace by name or only by case, is followed: the clone moves, and its key in `home.yaml` is rewritten with the pairs in the same step.
- That move carries the local-only clones of your own group's folder with it, since what you add for yourself stays in your own group's folder; a clone on the host follows the host's moves on its own syncs.
- A move of it out of your own group is not followed: its sync or check stops at Check naming that, nothing moved or pushed, until it is moved back on the host.
- Every other spex repository's rename or transfer is still followed by id.

## Consequences

- Through a namespace rename the reader keeps one own group: its row reads as your own under the host's spelling, the projects not yet on the host move with it, and nothing asks for a choice.
- A transfer of your own group's spex repository out of your own group reads as a stopped sync naming the host and the way back, and what it holds stays on this device until it is moved back.
- `home.yaml` holds a key where it held a folder name; a one-segment value an earlier file holds reads as `<value>/<value>-spex`, and the next write records the key, so an earlier home opens unchanged.
- The Groups surface lists one own group after a namespace rename, with no former folder left holding local-only clones.
- Left for later: a second device signing in after a namespace rename looks for `<login>-spex` and does not find your own group's spex repository, which the rename left under its old name.
