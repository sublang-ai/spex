<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-113: A Project's Environment Lives in Its Working Folder

## Status

Proposed (2026-10-10).
Amends, under [DR-046](046-decision-record-evolution.md):

- [DR-104](104-spec-package-format-and-client-environments.md) in where an environment lives: a project's `spex.yaml` and `spex.lock` move from its spex repository's clone to the root of its working folder, committed with the code, and a path source is relative to that root; the format, resolution, the store, the files installed under the clone and the exports stand, and a group's environment stays in its spex repository.
- [DR-103](103-the-home-and-its-groups.md) in its principle and its tree: the environment is the code's configuration, not a record, so a project's spex repository no longer holds `spex.yaml` or `spex.lock`, the unit `spex.yaml` with `spex.lock` remains for a group's own spex repository alone, and Spex itself still commits nothing to the code, the reader committing the environment with it.

## Context

- [DR-104](104-spec-package-format-and-client-environments.md) placed every environment, `spex.yaml` with `spex.lock`, in the spex repository, synced with the sessions and intents, on the rule of [DR-103](103-the-home-and-its-groups.md) and [DR-104](104-spec-package-format-and-client-environments.md) that nothing is committed with the code.
- The owner asked whether best practice keeps a project's manifest and lock under the home or in the working folder beside its spec packages.
- Every package manager keeps its manifest and lock with the code: Cargo tracks `Cargo.lock` in a new package so every build resolves alike [[1]], and npm commits `package-lock.json` for the same reason [[2]]; the agents' project-level skill folders live in the repository as well.
- An environment is the code's configuration: it says which skills and playbooks work on this code at this commit, and that differs by branch, is reviewed with the code, and is needed wherever the code is checked out.
- A record is not: a session or an intent is about the code, has its own audience and no branch, and is read without the code; that is why records left the working folder.
- Kept apart from the code, a project's environment drifts: one environment stands across every branch; a path source inside the working folder is pinned from a manifest outside it; a change in what the project installs is reviewed with no code change; a clone of the code, or a job built from it, cannot find what to install.

## Decision

### Principle

The environment lives with the code it serves.

- A project's `spex.yaml` and `spex.lock` are at the root of its working folder, committed with the code, as Cargo and npm keep theirs [[1]] [[2]].
- The environment follows the code's branches and history, is reviewed with the code, and any clone of the code installs from it.
- A group's environment stays in its spex repository, which has no code, synced with it as one unit as before.

### In the working folder

- Spex writes the two files at the working folder's root and touches the code's Git for nothing: it stages, commits and ignores nothing; the reader commits them with the code as any file, and Spex pushes nothing to the code ([DR-103](103-the-home-and-its-groups.md)).
- Where the reader does not commit them — the code is one they cannot push, one they keep clean, or no repository at all — this project's environment is this device's, and Spex says so where it lists the environment.
- An uncommitted environment is as safe as any untracked file; committing it is the protection.
- What the working folder holds at each use is the environment: a branch switch, a pull or a hand edit that changes the two files is a changed environment, installed from the lock as a lock a sync applied was, and a lock whose digest no longer matches its manifest is stale as before.
- A path source is a folder inside the working folder by a path relative to the working folder's root, where the manifest is, so the manifest and the sources it names are versioned together and a branch carries both.

### What stays

- The store under the home, `cache/`, the installed files under the spex repository's clone, and the exports into the agents' folders, listed in the working folder's `.git/info/exclude`, stand as [DR-104](104-spec-package-format-and-client-environments.md) decided: a working folder pairs with one spex repository on this device, so the clone's installed files are that working folder's.
- The lock's rules, resolution, the registry and Git sources, authoring and publishing stand.
- Your own group's environment, in its spex repository, still holds what you add for yourself, exported into your agents' home folders.

### Migration

- On the first start after the upgrade, Spex moves each project's `spex.yaml` and `spex.lock` from its clone into its working folder where the folder holds none; where the folder already holds a `spex.yaml`, the folder's stands and the clone's copy is dropped.
- The removal from the clone is a local change the next sync carries to the host.
- A project whose working folder is missing on this device keeps the clone's copy until the folder is found, when its move runs.
- It runs once per project under the root lease and leaves a receipt, as the groups migration does; the installed files are not touched.
- A device that syncs the removal before upgrading finds the project's environment gone until it upgrades, so every device upgrades together, the coordinated upgrade [DR-108](108-the-root-lease-names-the-machine.md) asks of a shared store.

### Considered and declined

- Keeping the environment in the project's spex repository, for the sake of committing nothing with the code: right for records, wrong for configuration. A record is about the code, with its own audience and no branch; the environment is part of the code, says which tools work on it at this commit, and changes with branches. Kept apart it drifts, as the Context lists, and the clone's copy serves only a reader who also has the code, since sessions run in the working folder.
- A `.spex/` folder in the working folder holding the environment: two files at the root is where Cargo and npm put theirs [[1]] [[2]], and a folder of Spex's would invite the records back in.
- Both places, the clone's copy standing in for a working folder without one: two sources of truth and a merge nobody authored.
- An exclude entry Spex writes for the two files, as for the exported skills: an ignored file refuses a plain `git add` [[3]], and Spex cannot tell which reader may push the code; the reader's Git decides, and the exported skills stay excluded because the lock rebuilds them.
- Spex committing the two files to the code: Spex pushes nothing to the code, and the reader's commit carries their review.
- A choice in the interface, "with the code" or "this device only": a corner case with a Git answer needs no control.
- The installed files beside the manifest in the working folder, as `node_modules` lies beside `package.json`: on this device one working folder pairs with one spex repository, so the clone's `packages/` is already the working folder's, and moving them would put more of Spex's files at the mercy of `git clean`.

## Consequences

- These specs change: `environments` for where the two files are, requests and the lock, path sources, a changed lock, the built-in request and the listing; `storage` for the tree, the units, pairing a folder and the migration; `projects` for adding and removing a project; `space` for the sync's units and the Sync tab's kinds; `playbook-library` for where an enabling requests. They are updated under this record before the code follows, and the versioned environment writes of [DR-111](111-the-core-coordinates-as-git-does.md) land on the files where this record puts them.
- Acceptance checks: a new project's working folder holding the two files and its clone none; a working folder paired while holding a committed environment installed from it with nothing written; a branch switch that changes the lock installed; a path source and its manifest on one branch; an environment the reader does not commit listed as this device's; a group's environment synced as one unit as before; a two-project home migrated with each project's files moved, the folder's copy winning, and the clone's removal pushed.
- What the reader sees: `spex.yaml` and `spex.lock` in the code's root and in its reviews; "Spec packages changed" in a Sync tab wherever a clone still holds the two files, a group's own or a project's not yet migrated; "Not committed with the code" on the Playbooks surface where it applies.
- Ask to the scaffold CLI: an install from the command line, so a job built from a clone installs before it runs; until then a clone installs when Spex opens it.

## References

[1]: https://doc.rust-lang.org/cargo/faq.html#why-have-cargolock-in-version-control "Cargo FAQ: why have Cargo.lock in version control"
[2]: https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json "npm: package-lock.json is intended to be committed into source repositories"
[3]: https://git-scm.com/docs/git-add "git add: ignored files are not added unless forced"
