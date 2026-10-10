<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-103: The Home and Its Groups

## Status

Accepted (2026-10-04); revised in place through 2026-10-06 while still being worked on, by the owner's direction.
Spec packages are decided by [DR-104](104-spec-package-format-and-client-environments.md); this decision only places their files.
The first Git host is spex.pub, which wraps GitLab.com and maps this decision onto it in its own decision records [[3]].
spex.pub brokers the Git credential, so for spex repositories the remote URL it hands over is the only thing Spex reaches beyond it.
Amends, under [DR-046](046-decision-record-evolution.md):

- [DR-057](057-space-surface.md): the home is no longer the one repository with one remote; every project and group has a spex repository of its own, and Spex signs in to a Git host and consults it. The Space surface, renamed Groups, keeps its duties and its sync, applied to the `spex` branch of each spex repository.
- [DR-063](063-space-setup-and-repair.md): setting up by naming a remote gives way to signing in, after which Spex sets up what it needs, and a spex repository exists on this device before it has a remote. The folder repair stands.
- [DR-036](036-file-state-store.md) and [DR-045](045-unified-session-storage.md): `projects.json`, `intents/<projectId>.jsonl`, `prefs.json` and `local/project-paths.json` give way to the layout below, and every sync, from the app or the command line, runs on the `spex` branch of one spex repository. File state, leases, Playbook's session store and taking a changed unit whole from one side stand. Queue-order and link validation go with ranks and links.
- [DR-035](035-intent-ledger.md) and [DR-077](077-up-next-is-a-committed-queue.md): each intent is kept on its own in its project's records, with no rank and no link to another intent; the next to run is the oldest one queued. Capture, delivery, verdicts and the rule that no state is stored for an intent stand.
- [DR-058](058-chat-assisted-playbook-authoring.md): the draft store gives way to authoring sessions in a project.
- [DR-064](064-honest-remote-failure.md): where you are signed in to a Git host, Spex consults its answer, keeps its sign-in under `local/`, and gives Git a credential through a credential helper. The rule to claim only what the host said, and the refusal of a remote URL embedding a credential, stand.
- [DR-006](006-projects-and-forge.md): a project's code is any Git repository; its records live in a spex repository, cloned under the home and pushed to its group on the Git host once you sign in. The forge binding stands.
- [DR-080](080-the-config-directory-is-named-config.md): `config/playbook.config.yaml` keeps its name and moves into your own group's spex repository, synced with it.

Amended by [DR-106](106-groups-after-a-restart-and-a-host-sign-out.md) in when Spex reads the host: also once when it starts signed in.
Extended by [DR-108](108-the-root-lease-names-the-machine.md): beside `.lease/`, the lease stages at `.lease.stage.<token>/` and keeps each retirement at `.lease.retired/<token>/`, its owner naming the machine by Playbook's machine identity; a `.lock/` of the former layout is read by the same rule before the migration.
Amended by [DR-111](111-the-core-coordinates-as-git-does.md) where it inherited [DR-057](057-space-surface.md)'s admission for the per-repository sync, and in one clause: no local claim stands for a host repository, the host's answer alone deciding a race between two devices; the layout, the groups and the host's role stand.

## Context

- Until now the home, Spex's folder `~/.spex` or `SPEX_HOME`, was one Git repository with one remote, so every session and intent of every project had the same audience. A person could not keep private work beside a team's, and a team could not share one project without sharing all.
- The owner's direction: use the Git host, a Git system with OAuth sign-in, for everything it already does. Accounts, groups, repositories, members and roles belong to the Git host. Spex shows them and never manages them. You must not need to know what happens behind the scenes.
- The smallest thing a Git host shares is a repository; folders and branches inside it cannot have different readers [[3]]. So each thing Spex shares is one repository.
- The people who share work on a codebase are not always the people who own it. A team works on code it cannot push to, on another host, or owned by someone else, and still keeps and shares its records.
- A project must carry what it needs. A person who can read only a project's sessions must still get the tools those sessions used.
- Playbook runs a playbook: a workflow whose roles are played by agents you name, the players, under a Captain that talks with you. It writes every session, one conversation, as files in one sessions folder, and marks with a lease which process may write it.
- The **Spex server** serves Spex to a browser, on this device or a remote one.

## Decision

### Principle

Every project and every group keeps what is not its code, shared with exactly the people the Git host lets read it, through nothing the host does not already do.
What is not code is its sessions, the conversations with agents; its intents, instructions to run; the spec packages it installs, each a GEARS contract with the skills and playbooks made from it ([DR-104](104-spec-package-format-and-client-environments.md)); and the settings naming which player plays each role.
These are its records, and they live on the `spex` branch of a spex repository named `<name>-spex`: one per project and one per group.
Each lives on this device under `~/.spex/workspace/`, in a tree that mirrors the Git host, and, once you sign in, in its group on the Git host, where Spex creates it and pushes.
A project's code lives in any Git repository you choose, and Spex pushes nothing to it.
What you add for yourself is in your own group's spex repository.
The Git host decides who sees what: a spex repository's members, as the host lists them, see its records.
Spex adds no access control, no roles and no member lists of its own.

### Concepts

| Concept | Meaning |
| --- | --- |
| Working folder | A folder on this device where sessions run, belonging to one project or one group. For a project, usually a clone of its code, which may be any Git repository. |
| Project | A working folder and a spex repository. Add a working folder, and Spex finds or makes its spex repository. |
| Group | A group on the Git host, at any depth, or your own, since every user has one named after them. Its spex repository is a project without code, holding its sessions across projects, which run in a working folder you choose on each device. |

- Spex works offline. Add a working folder and work. Sign in when you want to share.
- Your own group also holds your sessions outside any project. Spex creates its spex repository on the host when you sign in, and another group's when that group's first session starts.
- Before you sign in, your own group's folder under `workspace/` is named after your user name on this device. Sign-in renames that folder and its spex repository after your account on the host. If another device of yours already pushed one, Spex joins the two as it joins any two histories: every unit on both sides is one choice.

### What Spex does on a Git host

Spex does six things there, always with your own account:

1. Signs you in with OAuth: the browser flow with PKCE [[1]] on the desktop, the device flow [[2]] on the Spex server.
2. Lists your groups and the spex repositories you can read in each.
3. Creates a spex repository in a group: private, its description saying what it is and where the code lives.
4. Clones, fetches and pushes `spex` branches.
5. Prepares a `spex` branch. Where a branch rule on the host would block pushes to it, Spex adds a rule allowing them, or changes the rule named `spex`, when you are allowed to.
6. Reads a spex repository's members and shows them with the host's own role names, with a link to the host's members page.

Everything else stays on the Git host: adding or removing members, roles, sharing, transferring, archiving, deleting, creating groups.

- When a step needs rights you do not have, Spex says which and waits. A member who has them creates the spex repository or prepares the branch from their own Spex, and yours finds the result on the next read. Nobody is sent to edit the host's settings.
- The host's refusal is the answer; Spex derives nothing from a role name or a cached list. A spex repository the host stops listing stays on this device as unreachable, and nothing on the device is deleted because the host refused.
- Spex never promises privacy. Before your first push into a spex repository with other members, it says once that every session stays there whole, hidden parts and attachments included, and that nothing recalls what others downloaded. A public spex repository makes its records public, and Spex says so.
- The Git credential reaches Git through a credential helper, never through a remote URL.
- Spex reads the host when you sign in, when you press Refresh, and before a sync. Never on a timer.

### Spex repositories

- The name is `<name>-spex`: the working folder's name for a project, which you may change, and the group's or the user's name for a group's own. A `<name>-spex` repository with a `spex` branch is Spex's; the name alone proves nothing. Where the name is taken, Spex asks you for another.
- The host gives every repository a permanent id that it keeps through renames and transfers [[3]]. Spex stores that id in the clone's Git configuration beside the remote URL, and mints no repository id of its own. The host does not rename a spex repository when its group is renamed, so group B renamed from A still holds `A-spex` until someone renames it there.
- Spex pushes only the `spex` branch of a spex repository, and only once the spex repository has a default branch. The default branch holds the host's README and nothing else.
- Spex creates the `spex` branch beside the default branch, never as it. A group may protect every new repository's default branch, and the repository's creator may not be allowed to change that, while a branch of another name carries no rule unless one names it [[3]]. So every member who can write the spex repository can push `spex`.
- Large files go through Git LFS where the host supports it.

### What lives where

```text
~/.spex/
  workspace/<group>/                        a plain folder per group, a subgroup's inside its parent's
    <group>-spex/, <name>-spex/             the spex repositories in that group, named as on the host
      spex.yaml, spex.lock                  what it needs (DR-104)
      config/playbook.config.yaml           its playbooks, and which player each role uses; your own group's also what each player runs on
      project.json                          the remote of the code, when there is code
      intents/<id>.json                     one file per intent, with <id>.assets/ beside it when it has attachments
      sessions/                             the sessions, as Playbook writes them
      packages/, skills/                    installed spec packages and exported skills (DR-104), kept out of Git
  home.yaml                                 the device id, for what is acknowledged per device; the Git host with its OAuth client id and your account; each working folder with its spex repository
  store/, cache/                            spec package bytes and caches (DR-104)
  local/                                    preferences, sync state, credentials, migration receipts
  .lease                                    held by the one process serving this home
```

- Every file whose layout Spex defines is JSON or YAML with a `format` field, the version of that layout. A reader refuses one it does not know and never guesses.
- Spex writes into a working folder only the skills an agent reads from there, listed in the working folder's `.git/info/exclude` so Git ignores them. Nothing is committed with the code.
- An intent is one instruction to run: its text and attachments, who wrote it and when, where it came from, and, once run, the session and turn that ran it, or that it was dropped. A project's intents form a set. Adding one never conflicts with anything. They have no order of their own: the next to run is the oldest one queued, and you may run any of them directly.
- The agents' own session ids and the lease beside a session stay on the device.
- `local/` never leaves the device; its credentials have owner-only permissions.

### Sync, one spex repository at a time

- A unit is a session, an intent with its attachments, `spex.yaml` with `spex.lock`, `config/playbook.config.yaml`, or `project.json`. A unit is taken whole from one side.
- Every spex repository syncs on its own, as [DR-057](057-space-surface.md) decided: Spex commits local changes, fetches, compares each unit with the host's copy, asks you where both sides changed one, applies, and pushes.
- A rename or transfer on the host moves the matching group folder or clone on the next sync, and in the same step updates `home.yaml` and the exports beneath it.
- A sync, and any move it makes, runs only while no session beneath it has a turn in flight, and blocks writes beneath it only.
- A spex repository is reachable, unreachable (the host refused, you are offline, or you are signed out), read-only (archived, over quota, or you may only read), or local only (not on the host yet).
- A read-only spex repository keeps your new sessions on this device and says so.

### Which settings apply

- A session runs with your own group's `config/playbook.config.yaml`, the project's own added on top, and the session's tuning last. The project's file names the playbooks it enables and which player each role uses, by name, and never a model. Yours says what each player runs on, so a team shares player names and each person picks their own models. A player the project names and yours lacks is reported before the session starts, and Settings offers to add it.
- You can read a session wherever its spex repository is. You can continue it only on a device where the project's working folder is the one it ran in and no other process holds its lease.

### Projects on this device

- Adding a working folder: Spex offers the spex repositories you can read whose `project.json` names the working folder's remote, or creates one in a group you pick, named after the working folder. Until you sign in and pick a group, its spex repository sits in your own group's folder under `workspace/`; `home.yaml` pairs the two.
- Joining a project: pick its spex repository on the host. Spex clones it under `workspace/`, then clones the code from the remote its `project.json` names, with this device's own Git and its credentials, or takes a working folder you already have.
- Two working folders paired with one spex repository are one project, checked out twice; each runs its own sessions and uses the spec packages that live inside it ([DR-104](104-spec-package-format-and-client-environments.md)). A fork of a spex repository is another project.
- Removing a project from this device forgets its working folder and deletes its spex repository's clone. Removal refuses while anything in the clone has not reached the host, unless you confirm. Nothing on the host changes.

### Migration

- Your settings file and the sessions that match no project move into your own group's spex repository under `workspace/`. Each project's intents and sessions move into a spex repository of their own there, with a remote once you sign in and pick a group for it.
- It runs once, under the lease, with old writers stopped, and leaves a receipt:
  1. The entries of `projects.json`, with their paths from `local/project-paths.json`, become the working folders in `home.yaml`.
  2. Each project's intent log is replayed once into one file per intent.
  3. Each project's intents and sessions move into its spex repository as a new `spex` branch with no history from the old home, with the working folder's remote written to `project.json`.
  4. `prefs.json` moves under `local/`; `playbooks/<id>/` stays until the spec packages of [DR-104](104-spec-package-format-and-client-environments.md) replace them.
  5. The old remote is kept aside, unchanged.
- Before any device migrates, every device syncs on the old layout; the others then upgrade without migrating and add their working folders again.

### Scenarios

| Situation | What happens |
| --- | --- |
| First start, no account | Add a working folder and work. Its spex repository sits in your own group's folder with no remote until you sign in and pick a group. |
| A team's codebase | Add the working folder and pick the team's group. Spex creates `<name>-spex` there and pushes. Every member of that spex repository sees its records. |
| Code you cannot push to, or on another host | The same. Spex pushes nothing to the code. |
| Work across a group's projects | Start a session at the group, in a working folder you choose. Spex creates `<group>-spex` there. Group members see it. |
| Bob can read Project A's spex repository and nothing else of the team's | Bob gets the tools Project A's spex repository names, as every member does; nothing comes from the team's other spex repositories. |
| You can only read a project | You see its records. Your own sessions stay on this device, marked so. |
| The name is taken | A repository of that name exists and is not this project's. Spex asks you for another. |
| A spex repository is renamed or transferred on the host | Spex follows it by id and moves its clone once nothing under it is running. Its name in Spex changes. |
| You leave, or your access is revoked | The records turn unreachable on the next read. Nothing on the device is deleted. |
| Archived or over quota | The records turn read-only with the host's reason. |
| Two devices add intents to one project | Two new files; no conflict. Editing the same intent on both is one choice between the two versions. |
| A second device | Sign in, join the project, sync. What you made before signing in joins the same way. |

### Considered and declined

- Records on a `spex` branch inside the code repository: records would need push rights to the code, so work on code you do not own could not be shared, and every clone of the code would carry them.
- Records inside the working folder, as a `.spex/`: Spex's files in the working folder, at the mercy of `git clean`, and working folders are not organized by group.
- An id Spex mints for a project: a second identity beside the host's. The host's repository id and the tree under `workspace/` are enough.
- The code as a Git submodule of the spex repository: a submodule pins a commit and puts the code inside the clone; `project.json` names the remote and nothing else.
- A group's subgroups and projects nested inside the group's own clone: a subgroup named like one of the clone's own folders, such as `config`, would collide, and Git cannot give one path two owners. A plain folder per group holds them side by side.
- A group holding the records of many projects: sharing would be all-or-nothing per group.
- A team settings repository that projects depend on: a member who cannot read it would silently get other tools than the rest. A project's needs are in its own spex repository.
- Spec packages for this device alone, beside your own group's: a second personal place for skills, and nobody could say which one holds yours.
- Records on the default branch: a group may protect every new repository's default branch, and the repository's creator may not be allowed to change that; where the protection covers every new repository alike, releasing it for spex repositories would release it for the code too. A host whose administrator makes `spex` every repository's writable default would work, but the design would then rest on that setup; a second branch costs nothing.
- A kind of its own for a group's sessions: a project without code needs no new rule.
- A spex repository known by its name alone: anyone may name a repository `<name>-spex`; the `spex` branch decides.
- A folder per intent: a folder for what is mostly one short instruction. A file, with attachments beside it when there are any, is Playbook's own pattern for a session.
- Group kinds, personal or team: the member list decides, and a stored kind would lie.
- A Spex provisioning service with operators and service accounts: the Git host provides groups, and whoever administers it creates them.
- Spex managing members, roles or branch rules: the host's job. The one rule it ever writes is the one allowing pushes to its own branch.
- A hidden ref instead of a branch: nobody could see or delete records in the host's pages.
- Intents as a log of actions with ranks and links: a log needs replaying, and one file per device to avoid conflicts; a set of files needs neither.

## Consequences

- The Groups surface shows your groups, each with its spex repositories and where their code lives: sign in, sync, members with the host's members page linked, and what the next sync will push.
- These specs change: `storage` for `workspace/` and the units; `space` for the Groups surface, sign-in and members; `projects` for working folders and their spex repositories; `dashboard` and `core-service` for intents as files, one session store and one sync at a time per spex repository; `settings` for your own group's file and the project's; `app-shell` and `server-shell` for the OAuth flows and the credential helper. They are updated under this decision before the code follows.
- Acceptance checks: a spex repository created in a group and shared through the host's members alone; records kept for code on another host and for code you cannot push to; a group's spex repository created at its first session; a refused step shown as waiting and found done after a member with the rights did it; a member who reads only the spex repository getting the tools it names; a taken name refused and another asked; offline first start, then sign-in and the first push; two devices changing the same unit; two devices adding intents without conflict; a read-only member's sessions staying local; a rename or transfer followed by id and the clone moved; a two-project home migrated; browser journeys against a stand-in Git host.
- Asks to Playbook: the author's account in each session, so a shared session names who ran it; and a launcher that asks Spex for the sessions folder and settings of a working folder, so a terminal session goes to its project from its first message.
- spex.pub's decision records map onto GitLab.com: the OAuth client and scopes, listing groups and spex repositories, creating spex repositories, the members page, the branch rule, Git LFS, and rate limits.

## References

[1]: https://www.rfc-editor.org/rfc/rfc7636 "Proof Key for Code Exchange by OAuth Public Clients (RFC 7636)"
[2]: https://www.rfc-editor.org/rfc/rfc8628 "OAuth 2.0 Device Authorization Grant (RFC 8628)"
[3]: https://github.com/sublang-ai/spex-pub/blob/main/specs/decisions/020-gitlab-com-as-the-host-instance.md "spex.pub DR-020: GitLab.com as the host instance, with the facts checked against GitLab's documentation"
