<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-125: Global Path Sources Live in the Global Records Clone

## Status

Accepted (2026-10-19) on the owner's choice.
Amends [DR-103](103-the-home-and-its-groups.md), [DR-104](104-spec-package-format-and-client-environments.md).
Amended by [DR-128](128-a-spex-repository-placed-at-several-instances.md), [DR-246](246-remove-groups-and-team-servers-from-the-clients.md).

## Context

- The owner chose a path inside the global records clone over publishing each edit as a private prerelease.
- Skills reach agents only through environments: Spex refuses a `skills` list in its configuration ([DR-105](105-playbook-17-5-0-adoption.md)) and exports each environment's skills into the agents' folders ([DR-124](124-skills-reach-every-agent.md)).
- The global environment is the one that reaches your own agents on every device, and the global records repository is the one place that follows you there ([DR-103](103-the-home-and-its-groups.md)).
- A request there comes from the registry, from Git at a commit, or by a path.
- The global records repository has no working folder on a device, so a path relative to one names nothing, or a folder only one device has, while the request syncs to every device.
- An unpublished skill of your own would therefore cost a published prerelease, or a pushed commit, per edit.
- A Cargo path dependency is relative to the manifest naming it [[1]], as a project's path source is relative to the working folder root holding its `spex.yaml` ([DR-113](113-a-projects-environment-lives-in-its-working-folder.md)).
- Spex keeps its own paths in a clone: `config/`, `sessions/`, `intents/`, `authoring/`, `placements/` and its root files, synced; `.spex/`, `packages/`, `skills/`, `local/` and what its managed Git rules drop, never synced.
- The sync takes each record unit whole from one side and every other tracked file alone, so two devices' edits to different files of one folder combine.
- An install links each path source's playbook folders to the app's engine, and the sync refuses a tracked link or a nested Git repository, which Git carries as a link to a commit.
- Git reads a file it tracks as never ignored, so one device's own excludes do not keep another device's committed file out of the sync.

## Decision

- Amends [DR-104](104-spec-package-format-and-client-environments.md) in its path source and [DR-103](103-the-home-and-its-groups.md) in its units, as below.
- **Relative to the global records clone.** In the global environment, a request's `path` names a folder relative to the root of the global records repository's clone, where its `spex.yaml` is, and is used in place on every device the clone syncs to; a project's paths stay relative to its working folder's root.
- **Confined to what syncs.** The folder lies below the clone's root, reached through no link and in no Git repository of its own, outside Spex's own paths — `config/`, `sessions/`, `intents/`, `authoring/`, `placements/`, `.spex/`, `packages/`, `skills/`, `local/`, `.git/`, `.spex-uploads/` and the clone's root files, its first segment compared without case or compatibility forms — and it holds nothing the sync drops or refuses: the clone's Git rules keep every file of its release, none of an ignored family, and, where those rules do not ignore it, it holds no Git repository of its own, no link and no entry that is no regular file or folder. A request naming another is refused before anything is written, and a resolution or an install finding one fails naming why, before anything is installed or linked.
- **One unit.** A folder of a clone holding `meta.yaml` in either revision a sync compares or their ancestor, outside Spex's own paths and below the root, is one sync unit with every file under it on every side, the outermost where two nest. A sync takes it whole from one side and asks where both devices changed it differently, as for an intent with its attachments.
- **Engine links stay on the device.** The engine links an install provisions in such a folder's playbooks are listed in the clone's `.git/info/exclude` before any is made, as a working folder's are; an install that cannot list them there fails and makes none.
- **One path for every use.** A spec package a global authoring session creates lies in the clone and is requested by its path there, as any other request is.
- **The folder is said.** The environment's state names the folder its paths are relative to on this device.

Considered and declined:

- The global records repository's paths relative to a paired working folder where one exists, else to its clone: one `spex.yaml` would name different folders on two devices.
- A folder outside the clone named in a device-local file: [DR-103](103-the-home-and-its-groups.md) declined a second personal place, and it would not follow you.
- Such a folder merged file by file, as any other tracked path: two devices' edits to different files would combine into a release neither wrote.
- A fixed folder name for spec packages of your own: the confinement already keeps Spex's paths apart, and the name is yours.
- Moving a request made relative to a paired working folder into the clone: Spex would move your files; it reads as missing, naming the path, until you move the folder.
- Changing the managed Git rules, to ignore `node_modules/` or to sync a `uv.lock`: every device rewrites them before each sync, so devices on older apps would rewrite them back; a reader ignores what they choose with a `.gitignore` of their own in the folder.

## Consequences

- A skill, spec or playbook of your own is edited where the global records clone holds it, and reaches your agents at the next export on each device, the next sync carrying its edits.
- Whoever reads the global records repository reads that folder, as they read its sessions.
- A folder of a project's clone holding `meta.yaml`, where Spex puts none, syncs as one unit as well.
- A request made by a path in a paired working folder reads as missing until its folder is moved into the clone.
- A release holding a file the clone's managed rules drop anywhere, such as `uv.lock`, `Cargo.lock` or a `*.tmp`, cannot be kept in the global records clone.
- A folder holding a Git repository of its own or a link, such as one under `node_modules/`, is refused until it goes or a `.gitignore` of the reader's ignores it; a file added later that the sync would drop fails the next install on the device holding it, the last exports standing.
- These specs change: `environments` for the path, its confinement, where a path source is used and the state; `storage` for the clone's tree, its units and its managed rules; `space` for the sync's units and the Explore tab's spec package family; `playbook-library` for the engine links' exclude and global authoring.

## References

[1]: https://doc.rust-lang.org/cargo/reference/specifying-dependencies.html#specifying-path-dependencies "Cargo: specifying path dependencies"
