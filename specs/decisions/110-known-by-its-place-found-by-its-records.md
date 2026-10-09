<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-110: Known by Its Place, Found by Its Records

## Status

Accepted (2026-10-08).
Amends [DR-103](103-the-home-and-its-groups.md) in one scope: how a group's own spex repository — your own group's included — is found on the host: by the records it holds, not by the name `<group>-spex`, which creation still gives it; the rest of DR-103 stands, its declined minted id confirmed.
Completes [DR-109](109-your-own-groups-spex-repository-stays-in-your-own-group.md) in the one scope it left for later: a device signing in after a namespace rename finds your own group's spex repository under its former name.

## Context

- A spex repository on the host has the host's permanent id, which survives renames and transfers [[1]]; Spex records it in the clone's Git configuration beside the remote URL and matches what the host lists by that id, else by the remote URL, never by name ([DR-103](103-the-home-and-its-groups.md)).
- On this device a clone is known by its key, its path under `workspace/`, which mirrors the host. `home.yaml` pairs each working folder with a key and records your own group's spex repository by key ([DR-109](109-your-own-groups-spex-repository-stays-in-your-own-group.md)); the protocol's project id is the key; the preferences `sync:<key>:*`, the forge cache, the indexes of sessions and intents, the sync machines, the steps left waiting at the host, and the skills exported into working folders and agent home folders hold it too.
- A rename or transfer the host reports is followed in one gated step: the clone moves, and every holder above is rewritten while nothing beneath any carried clone runs; a local-only clone moves only with your own group's folder.
- A local-only clone has no host id. A design review asked what identifies it, whether a handle stable across moves belongs in `home.yaml`, and whether such a handle would demonstrably simplify the design over the gated move.
- Your own group's spex repository is found at sign-in by name, `<login>-spex` in the account's own group, and a group's own at its first session by `<group>-spex` in the group. The host renames no repository with its namespace or group [[2]], so after a namespace rename the device that holds the clone follows the repository by id and keeps `ada-spex` under `ada2/`, while a fresh device looks for `ada2-spex`, finds none, and creates a second one beside it; a renamed group gains `B-spex` beside `A-spex` at the next first session on any device the same way.
- For every spex repository the person can read, the host lists its id, its path, its group with the group's kind and full path — the account's own group having kind `user` — whether its `spex` branch exists, and the parsed `project.json` of that branch, or null where the branch or the file is absent [[1]]. A project's spex repository holds `project.json` from its first commit on any device; a group's own holds none, which Join already relies on to ask for a working folder instead of cloning code.
- Where two folders qualify for a repair, the row asks instead of proposing ([DR-065](065-repairs-the-reader-answers.md)).
- The review named three ways a fresh device might find your own group's spex repository: a marker file inside the repository declaring its owner; what the host lists in the account's own group, the repository's id taken as its identity once found; a convention the core writes to the host at creation.

## Decision

### Identity

- A spex repository on the host is identified by the host's repository id, recorded in the clone's Git configuration beside the remote URL, as [DR-103](103-the-home-and-its-groups.md) decided; `home.yaml` holds no copy of it.
  The id lives where the clone is, so a clone copied or moved by hand keeps it; a clone lacking it is matched by its remote URL and given it on the next read; and `home.yaml` keeps nothing of the host but the account.
- A clone on this device is identified by its key, on the host or local only alike.
  A local-only clone has no identity beyond its key and needs none: nothing matches it — no listing, no other device — until its pick, which records the host's id; the key changes only at the sign-in rename and when your own group's folder carries it, each one gated step.
  Spex mints no id, as DR-103 declined.
- The key-based index and the gated move stay, because a handle stable across moves would relieve little and cost a second identity:

| Holder of the key | A stable handle would |
| --- | --- |
| `home.yaml`'s pairs and `own` | relieve: one path field changes instead of every entry naming the key |
| the preferences `sync:<key>:*`, the forge cache | relieve |
| the indexes of sessions, intents, machines and waiting steps | relieve |
| the protocol's project id, which clients follow by working folder after a move | relieve |
| the clone's folder on disk | not relieve: the tree mirrors the host, so the folder moves |
| the gate — turns, compiles, uploads, picks and reads beneath every carried clone | not relieve: the folder moves |
| the `home.yaml` write | not relieve: the path changes |
| the skills exported into working folders and agent home folders | not relieve: they hold the clone's absolute path |
| the host id in the clone's Git configuration | not relieve: it moves with the clone |

- Every holder relieved is in-process state or one file, all already rewritten in the same gated step; the handle would add an id minted per clone, a `home.yaml` format with its migration, a second index from handle to path, and a protocol change for the project id, while the move and the gate remain.
  No simplification is demonstrable, so the index stays as it is.

### A group's own spex repository, found by its records

- A **group's own** spex repository holds the group's records and no `project.json`; a project's holds `project.json`.
  On the host, a group's own spex repository is the spex repository the host lists in that group whose `spex` branch holds no `project.json`, or one named `<group>-spex` whose `spex` branch does not exist yet — created by another device and not pushed, or waiting for its branch.
  The name alone still proves nothing; creation keeps giving the name `<group>-spex`, `<login>-spex` for your own group.
- Your own group's spex repository is the group's own spex repository of the account's own group — the group the host lists with kind `user` — by the same rule.
- Spex looks for it at sign-in, for your own group, and at a group's first session on this device, for that group, in each case only while the group's clone has no remote, and acts on what the host lists:

| The host lists | Spex |
| --- | --- |
| none | creates `<group>-spex` there, prepares its branch and pushes the clone, as before |
| exactly one | joins the clone's history with it as any two; the clone takes the host's key on that sync, a move within the group — within your own group, as DR-109 follows |
| several | creates and joins nothing; the choice stands as an issue the reader answers |

- While the choice stands, the group's clone stays local only and its row offers the choice: one control per candidate, each the pick of that listed spex repository, which joins the clone with it; the other candidates stay listed in the group as not on this device.
  Set aside, the choice stands quietly and counts no more; it lapses only when the candidates the host lists change, one candidate left being joined and none left created at the next read.
- Spex merges no two spex repositories: making one of several is done on the host, by renaming, transferring or deleting there, and the next read finds what remains.
- The surface tells a group's own spex repository the same way: the row reading "Group records" and the first place in its group go to the spex repository holding no `project.json`, not to the one named after the group.

### Considered and declined

- A marker file inside the repository declaring its owner: it travels with every fork and copy, so two candidates carry the same marker and it tells them apart no better than their place does; a fresh device reads it only by cloning each candidate or through a second file the host relays; a repository pushed before the marker exists lacks it until some device syncs it; and the absence of `project.json` already says what the marker would say.
- A convention the core writes to the host at creation: the description is prose in the creating device's language, editable on the host; a topic or tag is the Git host's own notion, also editable; and a record per account at spex.pub naming the own repository's id would be a second truth beside the Git host, wrong after a transfer or deletion there, needing a route and a column the stand-in mirrors, and silent for every repository created before it.
- A handle stable across moves, in `home.yaml` or minted into the clone: argued above.
- Picking one of several by a rule: the one named `<login>-spex` rewards the device that created the duplicate during the gap over the one holding the history; the oldest needs a creation time the host does not relay; and any rule sends the person's settings and sessions into a repository they did not choose, where the choice costs one gesture once.
- Merging the candidates into one: a sync of one repository's branch into another's, which nothing in Spex does, and which the person can do on the host.
- Keeping the name rule and asking the person to rename the repository on the host: the surface would explain the host's naming to someone who need not know what happens behind the scenes.

## Consequences

- A device signing in after a namespace rename from `ada` to `ada2` joins `ada-spex` as your own group's; its clone lies at `ada2/ada-spex`, which `home.yaml` records, and no `ada2-spex` is created.
- A renamed group's first session on a device joins `A-spex` under `B` instead of creating `B-spex` beside it.
- A person whose own group already holds two such repositories from the gap sees the choice on the next device that signs in; the devices holding one of them each keep theirs.
- These specs change: `storage`, for what `own` records once sign-in joins a found repository; `space`, for the definition of a group's own spex repository, the sign-in's third step, the first session's rule with its three outcomes, the standing choice and its row, and the suites that drive them.
  `git-host` and `projects` keep their items.
- The code that tells a group's own spex repository by the name `<group>-spex` — the sign-in's and the first session's lookup, the groups list's order and the row's "Group records" — reads `project.json` instead, and the stand-in host scripts a group's own repository under another name.
- Acceptance checks: a sign-in after a namespace rename joining the former name with nothing created and the clone at the host's key; a renamed group's first session joining; two candidates leaving the clone local only with the choice and one issue, the pick joining one and the other staying listed, setting aside counting no more, and one candidate deleted on the host joined at the next read; a group's own repository under another name reading "Group records" first in its group.

## References

[1]: https://github.com/sublang-ai/spex-pub/blob/main/specs/packages/host.md "spex.pub host package: the groups and repositories a Spex client reads"
[2]: https://github.com/sublang-ai/spex-pub/blob/main/specs/decisions/020-gitlab-com-as-the-host-instance.md "spex.pub DR-020: GitLab.com as the host instance, namespaces and repository ids"
