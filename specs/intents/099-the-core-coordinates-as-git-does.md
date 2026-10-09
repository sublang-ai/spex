<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-099: The Core Coordinates as Git Does

## Status

Proposed (2026-10-09).

## Intent

Remove the core's gatekeeping over operations and keep to Git's rules: one process per home, a version check at the instant of each write, append-only records that merge by sequence, a sync that commits what is on disk and never overwrites a file changed since it read it, and an interface that reads files.
The decision is [DR-111](../decisions/111-the-core-coordinates-as-git-does.md); this record carries its delivery.

## Deliverables

- [ ] DR-111 accepted with the inventory of every gate, reservation, claim, blocker and in-memory holder and its disposition.
- [ ] The sync's apply writes each unit under the version it read and merges appended records by sequence; a unit changed meanwhile is a choice, never overwritten.
- [ ] The authoring manager reads session files for its picture and treats the recorded instance as the version of a session write; the interface holds no mirror a listing must correct.
- [ ] Every "busy" refusal while an operation runs is gone from the core, the protocol and the interface; a stale write is refused as "changed meanwhile, retry".
- [ ] The environment's requests, lock and installs are versioned writes prepared privately and published at one instant, with no queue blocking repository operations.
- [ ] The race suites assert no loss and surfaced conflicts under concurrent writers, replacing the gate tests.

## Tasks

1. Record DR-111 with the inventory and the amended spec items' list.
2. Rewrite the sync's apply step: versioned unit writes, append merge for records, choices for the rest; amend space-13, space-17, space-20 and storage-14.
3. Replace the authoring manager's live mirror with file-derived reads versioned by the recorded instance; amend core-service-96, playbook-library-70, -98, -101.
4. Remove the sync machine's write gate, the admission table's blockers, the dispatch gate and the removal gate; amend space-11, space-21, space-31, projects-10 and the interface's busy states.
5. Make environment writes versioned and privately prepared; amend environments-7, -14, -15 and the enabling path in playbook-library-69.
6. Replace the gate suites with concurrent-writer suites across space, authoring, environments and projects.

## Verification

Every task ends with `spex lint` clean and the core, interface and journey suites green; the concurrent-writer suites fail on the gated code and pass on the versioned one; no spec item states a refusal while an operation runs.
