<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-100: A Project's Environment Lives in Its Working Folder

## Status

Proposed (2026-10-10).
Its tasks precede the versioned environment writes of [DR-111](../decisions/111-the-core-coordinates-as-git-does.md)'s delivery, which then land on the files where this record puts them.

## Intent

Implement [DR-113](../decisions/113-a-projects-environment-lives-in-its-working-folder.md): a project's `spex.yaml` and `spex.lock` at the root of its working folder, committed with the code by the reader; a group's in its spex repository as before; path sources relative to the root; a lock changed from outside installed; the one-time move out of each project's clone; the listing saying when an environment is this device's.

## Deliverables

- [ ] DR-113 and the amended items in `environments`, `storage`, `projects`, `space` and `playbook-library`, lint-clean.
- [ ] The core reads and writes a project's environment at its working folder's root and a group's in its clone, stages, commits and ignores nothing, and resolves a path source against the root.
- [ ] Pairing a working folder writes an environment requesting the built-in spec package where the folder holds none and installs from the one it holds.
- [ ] A lock the working folder's files changed from outside is installed at the next read; a manifest changed alone marks the lock stale.
- [ ] The migration moves each project's files out of its clone once, with a receipt, the folder's copy winning and the deletion carried by the next sync.
- [ ] The listing and the Playbooks surface say when a project's environment is this device's; the Sync tab lists the environment kind for a group's own spex repository alone.
- [ ] Core, UI and browser-journey coverage for every amended verification item; the README and the storage guide follow.

## Tasks

1. Record DR-113, amend the specs and write this record.
2. Move the environment's location into the core: the working folder's root for a project, the clone for a group, the Git stance and the path base, the commands unchanged in shape.
3. Write the environment at pairing where the folder holds none, install from one it holds, and install a lock changed from outside at the next read.
4. Add the environment migration with its receipt, and the units' change in the sync's plan and the Sync tab.
5. Mark an uncommitted project environment as this device's in the listing and on the Playbooks surface, request from the new place in the Enable path, and leave the files on removal.
6. Port the core, UI and journey suites; update the README and the storage guide.

## Verification

Every task ends with `spex lint` clean and the core, interface and journey suites green; a fresh project's working folder holds the two files and its clone none, a cloned working folder with a committed environment installs with nothing written, a branch switch changing the lock reinstalls, a two-project home migrates with the folder's copy winning and the clone's deletion pushed, and a group's environment still syncs as one unit.
