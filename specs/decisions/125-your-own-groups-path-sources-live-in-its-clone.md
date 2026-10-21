<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-125: Your Own Group's Path Sources Live in Its Clone

## Status

Accepted (2026-10-19) on the owner's choice of a path inside your own group's clone over publishing each edit as a private prerelease.
Amends, under [DR-046](046-decision-record-evolution.md):

- [DR-104](104-spec-package-format-and-client-environments.md) in its path source: in your own group's environment a path is relative to the root of its spex repository's clone, where its `spex.yaml` is, confined to what that clone syncs, and used in place on every device it syncs to; a project's and another group's stay relative to the working folder.
- [DR-103](103-the-home-and-its-groups.md) in its units: a folder holding a spec package's `meta.yaml`, outside Spex's own paths, is one unit with every file under it.

Amended by [DR-128](128-a-spex-repository-placed-at-several-instances.md) in Spex's own paths: `placements/` joins them.

## Context

- Skills reach agents only through environments: Spex refuses a `skills` list in its configuration ([DR-123](123-playbook-17-10-1-cligent-0-34-0-slc-0-18-0-adoption.md)) and exports each environment's skills into the agents' folders ([DR-124](124-skills-reach-every-agent.md)).
- Your own group's environment is the one that reaches your own agents on every device, and its spex repository is the one place that follows you there ([DR-103](103-the-home-and-its-groups.md)).
- A request there comes from the registry, from Git at a commit, or by a path relative to a working folder.
- Your own group usually has no working folder on a device, so a path request is refused; where one is paired, the path names a folder only that device has, while the request syncs to every device.
- An unpublished skill of your own therefore costs a published prerelease, or a pushed commit, per edit.
- A Cargo path dependency is relative to the manifest naming it [[1]], as a project's path source is relative to the working folder root holding its `spex.yaml` ([DR-113](113-a-projects-environment-lives-in-its-working-folder.md)).
- Spex keeps its own paths in a clone: `config/`, `sessions/`, `intents/`, `authoring/` and its root files, synced; `packages/`, `skills/`, `local/` and what its managed Git rules drop, never synced.
- The sync takes each record unit whole from one side and every other tracked file alone, so two devices' edits to different files of one folder combine.
- An install links each path source's playbook folders to the app's engine, and the sync refuses a tracked link or a nested Git repository, which Git carries as a link to a commit.
- Git reads a file it tracks as never ignored, so one device's own excludes do not keep another device's committed file out of the sync.

## Decision

- **Relative to your own group's clone.** In your own group's environment, a request's `path` names a folder relative to the root of its clone, where its `spex.yaml` is, and is used in place on every device the clone syncs to; a project's and another group's paths stay relative to the working folder's root.
- **Confined to what syncs.** The folder lies below the clone's root, reached through no link and in no Git repository of its own, outside Spex's own paths — `config/`, `sessions/`, `intents/`, `authoring/`, `packages/`, `skills/`, `local/`, `.git/`, `.spex-uploads/` and the clone's root files, its first segment compared without case or compatibility forms — and it holds nothing the sync drops or refuses: the clone's Git rules keep every file of its release, none of an ignored family, and, where those rules do not ignore it, it holds no Git repository of its own, no link and no entry that is no regular file or folder. A request naming another is refused before anything is written, and a resolution or an install finding one fails naming why, before anything is installed or linked.
- **One unit.** A folder of a clone holding `meta.yaml` in either revision a sync compares or their ancestor, outside Spex's own paths and below the root, is one sync unit with every file under it on every side, the outermost where two nest. A sync takes it whole from one side and asks where both devices changed it differently, as for an intent with its attachments.
- **Engine links stay on the device.** The engine links an install provisions in such a folder's playbooks are listed in the clone's `.git/info/exclude` before any is made, as a working folder's are; an install that cannot list them there fails and makes none.
- **One path for every use.** Publishing a folder of your own group, and enabling an authoring session's playbook in your own group's environment, take a path in its clone as a request does.
- **The folder is said.** The environment's state names the folder its paths are relative to on this device, so "Add from folder" asks for a folder inside it.

Considered and declined:

- Every group's paths relative to its clone: a group's working folder may be a checkout its members share, as a project's is; your own group's environment alone must follow you, and no working folder does.
- Your own group's paths relative to its clone where no working folder is paired, else to that folder: one `spex.yaml` would name different folders on two devices.
- A folder outside the clone named in a device-local file: [DR-103](103-the-home-and-its-groups.md) declined a second personal place, and it would not follow you.
- Such a folder merged file by file, as any other tracked path: two devices' edits to different files would combine into a release neither wrote.
- A fixed folder name for spec packages of your own: the confinement already keeps Spex's paths apart, and the name is yours.
- Moving a request your own group made relative to a paired working folder into the clone: Spex would move your files; it reads as missing, naming the path, until you move the folder.
- Changing the managed Git rules, to ignore `node_modules/` or to sync a `uv.lock`: every device rewrites them before each sync, so devices on older apps would rewrite them back; a reader ignores what they choose with a `.gitignore` of their own in the folder.

## Consequences

- A skill, spec or playbook of your own is edited where your own group's clone holds it, and reaches your agents at the next export on each device, the next sync carrying its edits.
- Whoever reads your own group's spex repository reads that folder, as they read its sessions.
- A folder of a project's clone holding `meta.yaml`, where Spex puts none, syncs as one unit as well.
- A request your own group made by a path in a paired working folder reads as missing until its folder is moved into the clone.
- A release holding a file the clone's managed rules drop anywhere, such as `uv.lock`, `Cargo.lock` or a `*.tmp`, cannot be kept in your own group's clone.
- A folder holding a Git repository of its own or a link, such as one under `node_modules/`, is refused until it goes or a `.gitignore` of the reader's ignores it; a file added later that the sync would drop fails the next install on the device holding it, the last exports standing.
- An authoring session's playbook, written in a working folder, enables in your own group's environment only once its folder is in the clone, or once published.
- These specs change: `environments` for the path, its confinement, where a path source is used, publishing and the state; `storage` for the clone's tree, its units and its managed rules; `space` for the sync's units and rows and the Explore tab's spec package family; `playbook-library` for enabling, the engine links' exclude and "Add from folder".

## References

[1]: https://doc.rust-lang.org/cargo/reference/specifying-dependencies.html#specifying-path-dependencies "Cargo: specifying path dependencies"
