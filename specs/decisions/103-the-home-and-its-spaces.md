<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-103: The Home and Its Groups

## Status

Accepted (2026-10-04).
Revised on 2026-10-04: no settings repository for a team or a person; what a project needs is in the project; an intent is one file, and intents form a set.
Revised on 2026-10-05: every record lives in a spex repository, `<name>-spex`, one per project and one per group, cloned under `~/.spex/workspace/` in a tree that mirrors the Git host and pushed to its group there; the code may be in any Git repository; a group's own sessions are a project without code; what you add for yourself is in your own group's spex repository; an intent is one file.
Spec packages are decided by [DR-104](104-spec-package-format-and-client-environments.md); this record only places their files.
spex.pub's own records map this record onto GitLab.com, which it wraps; it brokers the Git credential, so the only thing Spex reaches beyond spex.pub is the remote URL it hands over.
Amends ([DR-046](046-decision-record-evolution.md)):

- [DR-057](057-space-surface.md): the home is no longer the one repository with one remote; every project and group has a spex repository of its own, and the app signs in to a Git host and consults it. The surface's four duties and the sync machine stand, applied per spex repository.
- [DR-063](063-space-setup-and-repair.md): setting up by naming a remote gives way to signing in, after which Spex sets up what it needs, and a spex repository exists on this device before it has a remote. The folder repair stands.
- [DR-036](036-file-state-store.md) and [DR-045](045-unified-session-storage.md): `projects.json`, `intents/<projectId>.jsonl`, `prefs.json` and `local/project-paths.json` give way to the layout below. File state, leases, Playbook's session store and whole-unit selection stand.
- [DR-035](035-intent-ledger.md) and [DR-077](077-up-next-is-a-committed-queue.md): an intent is one file in its project's records, with no rank and no link to another intent; the next to run is the oldest one waiting. Capture, delivery and verdicts stand.
- [DR-058](058-chat-assisted-playbook-authoring.md): the draft store gives way to authoring sessions in a project.
- [DR-064](064-honest-remote-failure.md): where a Git host is signed in, Spex consults its answer. The rule to claim only what the host said stands.
- [DR-006](006-projects-and-forge.md): a project's code is any Git repository; its Spex records live in a spex repository, under the home and, once you sign in, in its group on the Git host. The forge binding stands.
- [DR-080](080-the-config-directory-is-named-config.md): `config/playbook.config.yaml` keeps its name and moves into your own group's spex repository, synced with it.

## Context

- Until now the home was one Git repository with one remote, so every record of every project had the same audience. A person could not keep private work beside a team's, and a team could not share one project without sharing all.
- The owner's direction: use the Git host for everything it already does. Accounts, groups, projects, members and roles belong to the Git host. Spex shows them and never manages them. End users must not need to know what happens behind the scenes.
- The smallest thing a Git host shares is a repository. Folders and branches inside it cannot have different readers. So each thing Spex shares is one repository.
- The people who share work on a codebase are not always the people who own it. A team works on code it cannot push to, on another host, or owned by someone else, and still keeps and shares its records.
- A project must carry what it needs. A person who can read its records but nothing else the team keeps must get the same tools as everyone else on that project.
- Playbook stores sessions in one flat folder per launch and keeps leases beside each bundle. A session continues only where its recorded working folder exists.
- Two words. A **Git host** is a Git system with OAuth sign-in, such as GitLab.com. The **Spex server** is the process behind the desktop or the browser, on this device or a remote one. Earlier records call that process a host.

## Decision

### Principle

Spex keeps every record in spex repositories, named `<name>-spex`: one per project and one per group.
Each lives on this device under `~/.spex/workspace/`, in a tree that mirrors the Git host, and, once you sign in, in its group on the Git host, where Spex creates it and pushes.
A project's code lives in any Git repository you choose, and Spex pushes nothing to it.
What a project needs is in its spex repository.
What you add for yourself is in your own group's.
The Git host decides who sees what: a spex repository's members see its records.
Spex adds no access control, no roles and no member lists of its own.

### Concepts

| Concept | Meaning |
| --- | --- |
| Git host | A Git system with OAuth. It owns accounts, groups, projects, members and roles. |
| Account | You on the Git host, known by its permanent account id. |
| Working folder | A folder on this device where sessions run. For a project, usually a clone of its code, which may be any Git repository. Spex writes only agent exports into it. |
| Spex repository | A repository named `<name>-spex` holding the records of one project, or of a group itself, on its `spex` branch. It lives on this device under `~/.spex/workspace/` and, once you sign in, in its group on the Git host, where its members see the records: it is the unit of sharing. Spex follows it by the host's id, which survives rename and transfer. |
| Project | A working folder and a spex repository. Add a working folder, and Spex makes the spex repository. |
| Group | A group on the Git host, at any depth, or you, since every user has a group of their own named after them; and its spex repository, holding its sessions across projects, which run in a working folder you choose on each device. Under `workspace/`, a group's clone holds its projects' clones. |
| Session | A conversation Playbook records as one bundle in a spex repository. |

- The home is `SPEX_HOME`, or `~/.spex`: `workspace/` and this device's state.
- Spex works offline. Add a working folder and work. Sign in when you want to share.
- Your own group holds your sessions outside any project and what you add for yourself. Spex creates its spex repository on the host when you sign in, and another group's when that group's first session starts.
- Before you sign in, your own group's folder under `workspace/` is named after your account on this device. Sign-in renames it after your account on the host.

### What Spex does on a Git host

Spex does six things there, always with your own account:

1. Signs you in with OAuth: the browser flow with PKCE [[1]] on the desktop, the device flow [[2]] on the Spex server.
2. Lists your groups and the spex repositories you can read in each.
3. Creates a spex repository in a group: private, its description saying what it is and where the code lives.
4. Clones, fetches and pushes `spex` branches.
5. Prepares a `spex` branch. Where a rule on the host would block it, Spex adds an exception for it when you are allowed to.
6. Reads a spex repository's members and shows them with the host's own role names, with a link to the host's page.

Everything else stays on the Git host: adding or removing members, roles, sharing, transferring, archiving, deleting, creating groups.
Spex never does these; it shows the state and links to the page.

- When a step needs rights you do not have, it waits, and a member who has them finishes it from Spex. Nobody is sent to edit Git settings.
- The host's refusal is the answer. Spex derives nothing from a role name or a cached list.
- A cached list proves nothing. A spex repository the host stops listing stays on this device as unreachable. Nothing on the device is deleted because the host refused.
- Spex never promises privacy. Before your first push into a repository with other members, it says once that the records stay there, hidden records and attachments included, and that nothing recalls what others downloaded. A public repository makes its records public, and Spex says so.
- The token reaches Git through a credential helper, never through a remote URL.
- Spex reads the host when you sign in, when you press Refresh, and before a sync. Never on a timer.

### Spex repositories

- The name is `<name>-spex`: the working folder's name for a project, which you may change, and the group's or the user's name for a group's own. A `<name>-spex` repository with a `spex` branch is Spex's; the name alone proves nothing. Where the name is taken by something else, Spex asks you for another.
- A renamed user or group keeps the old name in its spex repository's name. Spex follows the repository by its id, and the host lets you rename it.
- The `spex` branch holds the records and has its own history. The default branch holds the host's README and nothing else.
- Spex writes to the `spex` branch of a spex repository and to nothing else on the host.
- The `spex` branch is never the default branch. The host protects a new repository's default branch by its group's rule, which the repository's creator may not be allowed to change, while a branch of another name has no rule unless one names it. Where a rule would still block it, Spex adds one exception for that branch when you are allowed to. Then every member who can write the repository can push it.
- Records cost storage on the host and nothing in anyone's code. Large files use the host's large-file storage where it exists.

### What lives where

```text
~/.spex/
  workspace/<group>/<subgroup>/<project>/   the clone of each spex repository, in a tree that mirrors the host
    spex.yaml, spex.lock                    what it needs (DR-104)
    config/playbook.config.yaml             its playbooks, and which player each role uses; your own group's also what each player runs on
    project.json                            the remote of the code, when there is code
    intents/<id>.json                       one file per intent, with <id>.assets/ beside it when it has attachments
    sessions/                               Playbook's store
    packages/, skills/                      installed files (DR-104), kept out of Git
  home.yaml                                 device id, Git hosts and accounts, and each working folder with its spex repository
  store/, cache/                            spec package bytes and caches (DR-104)
  local/                                    preferences, sync state, credentials, migration receipts
  .lease                                    held by the one Spex server serving this device
```

- Every Spex file is JSON or YAML with a `format` field, the version of its layout. A reader refuses one it does not know and never guesses.
- `workspace/` mirrors the host: a group's clone holds its subgroups' and projects' clones. Each holds the `spex` branch, with the host's copy as its remote once you sign in. A parent's local exclude file, which Spex writes, keeps its children out of its Git. A rename or transfer on the host moves the clone on the next sync.
- A working folder gets only the agent exports, kept out of the code's Git through the repository's own local exclude file. Nothing is committed with the code.
- An intent is one instruction waiting to run: its text and attachments, who wrote it and when, where it came from, its state (waiting, running, done or dropped), and the session and turn that ran it. A project's intents form a set. Adding one never conflicts with anything. They have no order of their own: the next to run is the oldest one waiting, and you may run any of them directly.
- Sessions are Playbook's bundles. Hints and leases beside them stay on the device.
- `home.yaml` holds the device id, each Git host with its OAuth client id and your account, and each working folder with its spex repository.
- `local/` never leaves the device: preferences, sync state per spex repository, credentials with owner-only permissions, migration receipts.

### Sync, one spex repository at a time

- Every spex repository syncs on its own with the machine of [DR-057](057-space-surface.md): save local changes as a commit, fetch, compare whole units, ask per conflict, apply, push. The sync stages known units only, never the whole tree.
- The units are a session bundle, one intent with its attachments, `spex.yaml` with `spex.lock`, `config/playbook.config.yaml`, and `project.json`. A unit is taken whole from one side. Nothing is merged line by line.
- A sync runs while no session of that spex repository has a turn in flight. It blocks writes to it only.
- A spex repository is reachable, unreachable (the host refused, or you are signed out), read-only (archived, or you may only read), or local only (not on the host yet).
- A read-only spex repository keeps your new sessions on this device and says so.

### Which settings apply

- A session runs with your own group's `config/playbook.config.yaml`, the project's own added on top, and the session's tuning last. The project's file names the playbooks it enables and which player each role uses. Yours says what each player runs on. A player this device lacks is reported before the session starts, and Settings offers to add it.
- History reads anywhere the records are. A session continues only on a device where the project's working folder matches the bundle's, the runtime validates, and no lease is held.

### Projects on this device

- Adding a working folder: Spex offers the spex repositories you can read whose `project.json` names its remote, or creates one in a group you pick, named after it. Its spex repository appears under `workspace/`, with a remote once you sign in and pick the group, and `home.yaml` binds the two.
- Joining a project: pick its spex repository on the host. Spex clones it under `workspace/`, then clones the code from the remote its `project.json` names, with your machine's own Git and its credentials, or takes a working folder you already have.
- Two working folders bound to one spex repository are one project, checked out twice. A fork of a spex repository is another project.
- Sharing a project with more or fewer people, moving it to another group, or archiving it, is done on the Git host. The records travel with the repository, and Spex follows it by id.
- Removing a project from this device forgets its working folder and deletes its spex repository's clone. It refuses while local units are not on the host, unless you confirm. Nothing on the host changes.

### Migration

- Today's home becomes your own group's spex repository under `workspace/`, with its sessions and your settings file. Each project's intents and sessions move into a spex repository of their own there, with a remote once you sign in and pick a group for it.
- It runs once, under the lease, with old writers stopped, and leaves a receipt.
- Steps: the entries of `projects.json` become the bindings in `home.yaml`; each project's intent log is folded once into one file per intent; each project's intents and sessions move into its spex repository as a new `spex` branch with no history from the old home, with the folder's remote written to `project.json`; sessions matching no project stay with your own group; `prefs.json` moves under `local/` and `local/project-paths.json` goes away; `playbooks/<id>/` stays until the spec packages of [DR-104](104-spec-package-format-and-client-environments.md) replace them. The old remote is kept aside, unchanged.
- Your other devices sync on the old layout first, then upgrade and add their working folders again.

### Scenarios

| Situation | What happens |
| --- | --- |
| First start, no account | Add a working folder and work. Its spex repository sits under `workspace/` with no remote until you sign in and pick a group. |
| A team's codebase | Add the working folder and pick the team's group. Spex creates `<name>-spex` there and pushes. Every member of that repository sees its records. |
| Code you cannot push to, or on another host | The same. Nothing touches the code. |
| Work across a group's projects | Start a session at the group, in a working folder you choose. Spex creates `<group>-spex` there. Group members see it. |
| Bob can read Project A's spex repository and nothing else of the team's | Bob gets exactly what Project A's spex repository declares. Nothing is substituted. |
| You can only read a project | You see its records. Your own sessions stay on this device, marked so. |
| The name is taken | A repository of that name exists and is not Spex's. Spex asks you for another. |
| A spex repository is renamed or transferred on the host | Spex follows it by id and moves its clone. Its label changes. |
| A member leaves, or access is revoked | The records turn unreachable on the next read. Nothing on the device is deleted. |
| Archived or over quota | The records turn read-only with the host's reason. |
| Two devices add intents to one project | Two new files; no conflict. Editing the same intent on both is one whole-unit choice. |
| A second device | Sign in, join the project, bind or clone the code, sync. |

### Considered and declined

- Records on a `spex` branch inside the code repository: records would need push rights to the code, so work on code you do not own could not be shared, and every clone of the code would carry them.
- Records inside the working folder, as a `.spex/`: Spex's files in the code's folder, at the mercy of `git clean`, and working folders are not organized by group.
- An id Spex mints for a project: a second identity beside the host's. The host's repository id and the tree under `workspace/` are enough.
- A group holding the records of many projects: sharing would be all-or-nothing per group.
- A team settings repository that projects depend on: a member who cannot read it would silently get other tools than the rest. A project's needs are in its own spex repository.
- A device environment beside your own group's: a second personal place for skills, and nobody could say which one holds yours.
- Records on the default branch: the host's rule on it, which the repository's creator may not be allowed to change.
- A kind of its own for a group's sessions: a project without code needs no new rule.
- A spex repository known by its name alone: anyone may name a project `<name>-spex`; the `spex` branch decides.
- A folder per intent: a directory, a tree and a listing for what is mostly one short instruction. A file, with attachments beside it when there are any, is Playbook's own session pattern.
- Group kinds, personal or team: the member list decides, and a stored kind would lie.
- A Spex provisioning service with operators and service accounts: the Git host provides groups, and whoever administers it creates them.
- Spex managing members, roles or branch rules: the host's job. Spex shows and links. The one rule it ever writes is the exception for its own branch.
- A hidden ref instead of a branch: nobody could see or delete records on the host.
- Intents as a log of actions with ranks and links: a log needs a fold and per-device files to avoid conflicts; a set of files needs neither.

## Consequences

- One project, one audience, decided on the Git host. A team shares a project by adding members to its spex repository there.
- The Space surface is renamed Groups: your groups, each with its spex repositories and where their code lives; sign in, add or join, sync, members with the host's page linked, and what leaves this device.
- Spec packages change: `storage` for `workspace/` and the units; `space` for the Groups surface, sign-in, add and join, and members; `projects` for working folders and their spex repositories; `dashboard` and `core-service` for intents as files, one session store and one sync gate per spex repository; `settings` for your own group's file and the project's; `app-shell` and `server-shell` for the OAuth flows and the credential helper. They are updated under this record before the code follows.
- Acceptance checks: a spex repository created in a group and shared through the host's members alone; records kept for code on another host and for code you cannot push to; a group's spex repository created at its first session; a step left waiting for a member with the rights; a member who reads only the spex repository getting what it declares; a taken name refused and another asked; offline first start, then sign-in and publishing; two devices saving the same project; two devices adding intents without conflict; a read-only member's sessions staying local; a rename or transfer followed by id and the clone moved; a two-project home migrated.
- Asks to Playbook: the author's account in the manifest, so a shared record names who ran it; and a launcher that asks Spex for the store and settings of a working folder, so a terminal session goes to its project from its first message.
- spex.pub's records map: the OAuth client and scopes, the device flow, listing and creating spex repositories, the members page, the branch exception, large-file storage, and rate limits. The journey harness gains a stand-in Git host.

## References

[1]: https://www.rfc-editor.org/rfc/rfc7636 "Proof Key for Code Exchange by OAuth Public Clients (RFC 7636)"
[2]: https://www.rfc-editor.org/rfc/rfc8628 "OAuth 2.0 Device Authorization Grant (RFC 8628)"
