<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-099: The Core Coordinates as Git Does

## Status

In progress (2026-10-10).
DR-111 accepted; task 2 delivered.

## Intent

Remove the core's gatekeeping over operations and keep to Git's rules: one process per home, a version check at the instant of each write, append-only records under their session's lease, a sync that commits what is on disk and refuses a replacement its pre-write check finds changed since Save, and an interface that reads files.
How the core admits a message to a runtime and how the interface orders its own replies are outside it.
The decision is [DR-111](../decisions/111-the-core-coordinates-as-git-does.md); this record carries its delivery.

## Deliverables

- [x] DR-111 accepted with the inventory of every gate, reservation, claim, blocker and in-memory holder and its disposition.
- [x] The sync's apply writes each unit under the version it read, with a session's lease taken for that instant; a refused write leaves no merge commit, the sync saves and merges again or stops for a retry, and a unit changed on both sides is a choice.
- [ ] The authoring manager reads session files for its picture and treats the recorded instance as the version of a write to the session's own files.
- [ ] Every "busy" refusal of a command because a sync, check, join, move, removal, compile, install or enabling runs is gone from the core, the protocol and the interface; a session lease's refusal and the runtime's own admission of messages stay; a stale write is refused as "changed meanwhile, retry".
- [ ] The environment's requests, lock and installs are versioned writes, each prepared privately and published by its own rename, with no queue blocking repository operations; a command that fails after some of its writes reports what it did and undoes nothing.
- [ ] The race suites assert no loss and surfaced conflicts under concurrent writers, replacing the gate tests.

## Tasks

1. Record DR-111 with the inventory and the amended spec items' list.
2. Rewrite the sync's apply step: versioned unit writes, the lease taken for the instant of a session's write, whole-unit choices; amend space-15, space-19, space-20, space-31, space-32, space-33, storage-14 and storage-21.
3. Replace the authoring manager's live mirror with file-derived reads versioned by the recorded instance; amend core-service-96 and playbook-library-70.
4. Remove the sync machine's write gate, the admission table's blockers, the dispatch gate and the removal gate; amend space-11, space-21, space-31, projects-10 and the interface's busy states.
5. Make environment writes versioned and privately prepared; amend environments-7, -14, -15 and the enabling path in playbook-library-69.
6. Replace the gate suites with concurrent-writer suites across space, authoring, environments and projects.

## Verification

Every task ends with `spex lint` clean and the core, interface and journey suites green; the concurrent-writer suites fail on the gated code and pass on the versioned one; no spec item refuses a command because a sync, check, join, move, removal, compile, install or enabling runs, while a session lease's refusal and the runtime's admission of messages stay.
