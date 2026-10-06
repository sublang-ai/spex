<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-103: The Home and Its Groups

## Status

Accepted (2026-10-04).
Revised on 2026-10-04: no settings repository for a team or a person; what a project needs is in the project; an intent is one file, and intents form a set.
Revised on 2026-10-05: every record lives in a `.spex/` folder inside the folder it belongs to, a clone of a spex repository Spex creates on the Git host; the code may be in any Git repository; a group's own sessions are a project without code; what you add for yourself is in your home.
Spec packages are decided by [DR-104](104-spec-package-format-and-client-environments.md); this record only places their files.
spex.pub's own records map this record onto GitLab.com, which it wraps; it brokers the Git credential, so the only thing Spex reaches beyond spex.pub is the remote URL it hands over.
Amends ([DR-046](046-decision-record-evolution.md)):

- [DR-057](057-space-surface.md): the home is no longer the one repository with one remote; every project and group has its own, and the app signs in to a Git host and consults it. The surface's four duties and the sync machine stand, applied per `.spex/`.
- [DR-063](063-space-setup-and-repair.md): setting up by naming a remote gives way to signing in, after which Spex sets up what it needs. The folder repair stands.
- [DR-036](036-file-state-store.md) and [DR-045](045-unified-session-storage.md): `projects.json`, `intents/<projectId>.jsonl`, `prefs.json` and `local/project-paths.json` give way to the layout below. File state, leases, Playbook's session store and whole-unit selection stand.
- [DR-035](035-intent-ledger.md) and [DR-077](077-up-next-is-a-committed-queue.md): an intent is one file in its project's records, with no rank and no link to another intent; the next to run is the oldest one waiting. Capture, delivery and verdicts stand.
- [DR-058](058-chat-assisted-playbook-authoring.md): the draft store gives way to authoring sessions in a project.
- [DR-064](064-honest-remote-failure.md): where a Git host is signed in, Spex consults its answer. The rule to claim only what the host said stands.
- [DR-006](006-projects-and-forge.md): a project's code is any Git repository; its Spex records live beside it in `.spex/`, pushed to a repository Spex creates on the Git host. The forge binding stands.

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

A project or a group keeps its records in a `.spex/` folder inside its own folder.
Once you sign in, that folder is a clone of a spex repository, named `<name>-spex`, that Spex creates in a group on the Git host.
A project's code lives in any Git repository you choose, and Spex pushes nothing to it.
What a project needs is in its `.spex/`.
What you add for yourself is in your home, `~/.spex`.
The Git host decides who sees what.
Spex adds no access control, no roles and no member lists of its own.

### Concepts

| Concept | Meaning | On the Git host |
| --- | --- | --- |
| Git host | A Git system with OAuth. It owns accounts, groups, projects, members and roles. | Itself |
| Account | You. | The host's permanent account id |
| Group | A folder that holds projects. Every user has a group of their own, named after them; its folder is your home directory. | A group, at any depth, or you |
| Project | A folder you work in, with code or without. The unit of sharing. | Its spex repository, in a group |
| Spex repository | A repository named `<name>-spex` that Spex creates to hold the records of one project, or of a group itself, on its `spex` branch. | Its id, which survives rename and transfer |
| `.spex/` | The records of a project or a group, inside its folder. A plain folder until you sign in, then a clone of its spex repository. Yours is the home. | Its spex repository |
| Session | A conversation Playbook records as one bundle in a `.spex/`. | Nothing of its own |

- The home is `SPEX_HOME`, or `~/.spex`: your own group's `.spex/`, which also keeps this device's state out of Git.
- Spex works offline. Add a folder and work. Sign in when you want to share.
- A group's own sessions are the work across its projects. They run in the group's folder and live in its `.spex/`. Spex creates the group's spex repository when the first such session starts.
- A session outside any project belongs to your own group: it runs wherever it runs and lives in the home.

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
- A cached list proves nothing. A spex repository the host stops listing stays as unreachable. Nothing on the device is deleted because the host refused.
- Spex never promises privacy. Before your first push into a repository with other members, it says once that the records stay there, hidden records and attachments included, and that nothing recalls what others downloaded. A public repository makes its records public, and Spex says so.
- The token reaches Git through a credential helper, never through a remote URL.
- Spex reads the host when you sign in, when you press Refresh, and before a sync. Never on a timer.

### Spex repositories

- The name is `<name>-spex`: the folder's name for a project, which you may change, and the group's or the user's name for a group's own. A `<name>-spex` repository with a `spex` branch is Spex's; the name alone proves nothing. Where the name is taken by something else, Spex asks you for another.
- A renamed user or group keeps the old name in its spex repository's name. Spex follows the repository by its id, and the host lets you rename it.
- The `spex` branch holds the records and has its own history. The default branch holds the host's README and nothing else.
- Spex writes to the `spex` branch of a spex repository and to nothing else on the host.
- The `spex` branch is never the default branch. The host protects a new repository's default branch by the group's rule, which only a Maintainer may change, and a Developer who creates the repository is no Maintainer of it; a branch of another name has no rule unless the group names it. Where a rule would still block it, Spex adds one exception for that branch when you are allowed to. Then every member who can write the repository can push it.
- Records cost storage on the host and nothing in anyone's code. Large files use the host's large-file storage where it exists.

### What lives where

```text
<a project's or a group's folder>/
  .spex/                           records: a plain folder, then a clone of <name>-spex
    spex.yaml, spex.lock           what it needs (DR-104)
    config/playbook.config.yaml    its playbooks, and which player each role uses
    project.json                   the remote of the code, when there is code
    intents/<intent id>/           one folder per intent: intent.json and its attachments
    sessions/                      Playbook's store
    packages/, skills/             installed files (DR-104), kept out of Git

~/.spex/                           your own group's .spex, plus this device's state, kept out of Git:
  config/playbook.config.yaml      also what each player and the Captain run on
  home.yaml                        device id, Git hosts and accounts, the project folders on this device
  store/, cache/                   spec package bytes and caches (DR-104)
  local/                           preferences, sync state, credentials, migration receipts
  .lease                           held by the one Spex server serving this device
```

- Every Spex file is JSON or YAML with a `format` field, the version of its layout. A reader refuses one it does not know and never guesses.
- Spex adds to a project's folder only `.spex/` and the agent exports, and keeps both out of the code's Git through the repository's own local exclude file. Nothing is committed with the code.
- An intent is one instruction waiting to run: its text and attachments, who wrote it and when, where it came from, its state (waiting, running, done or dropped), and the session and turn that ran it. A project's intents form a set. Adding one never conflicts with anything. They have no order of their own: the next to run is the oldest one waiting, and you may run any of them directly.
- Sessions are Playbook's bundles. Hints and leases beside them stay on the device.
- Deleting a folder deletes its records with it, as it deletes `.git`. What was pushed comes back on the next clone.

### Sync, one `.spex/` at a time

- Every `.spex/` syncs on its own with the machine of [DR-057](057-space-surface.md): save local changes as a commit, fetch, compare whole units, ask per conflict, apply, push.
- The units are a session bundle, one intent folder, and each of `spex.yaml`, `spex.lock`, `config/playbook.config.yaml` and `project.json`. A unit is taken whole from one side. Nothing is merged line by line.
- A sync runs while no session of that `.spex/` has a turn in flight. It blocks writes to that `.spex/` only.
- A `.spex/` is reachable, unreachable (the host refused, or you are signed out), read-only (archived, or you may only read), or local only (not on the host yet).
- A read-only `.spex/` keeps your new sessions on this device and says so.

### Which settings apply

- A session runs with your own `config/playbook.config.yaml`, the project's own added on top, and the session's tuning last. The project's file names the playbooks it enables and which player each role uses. Yours says what each player runs on. A player this device lacks is reported before the session starts, and Settings offers to add it.
- History reads anywhere the records are. A session continues only on a device where the project's folder matches the bundle's, the runtime validates, and no lease is held.

### Projects on this device

- Adding a folder: Spex offers the spex repositories you can read whose `project.json` names the folder's remote, or creates one in a group you pick, named after the folder. Either way the folder gets its `.spex/`. Offline, it stays a plain folder until you sign in and pick the group.
- Joining a project: pick its spex repository on the host. Spex clones the code from the remote its `project.json` names, with your machine's own Git and its credentials, or takes a folder you already have, and clones the records into its `.spex/`.
- Two folders with one spex repository are two clones of one project. A fork of a spex repository is another project.
- Sharing a project with more or fewer people, moving it to another group, or archiving it, is done on the Git host. The records travel with the repository, and Spex follows it by id.
- Removing a project from this device forgets its folder. Nothing on the host changes.

### Migration

- Today's home stays where it is as your own group's `.spex/`, with its sessions and your settings file. Each project's intents and sessions move into that project's folder under `.spex/`, a plain folder until you sign in and pick a group for it.
- It runs once, under the lease, with old writers stopped, and leaves a receipt.
- Steps: the entries of `projects.json` become the project folders in `home.yaml`; each project's intent log is folded once into one folder per intent; each project's intents and sessions move into its `.spex/`, with the folder's remote written to `project.json`; sessions matching no project stay in the home; `prefs.json` moves under `local/` and `local/project-paths.json` goes away; `playbooks/<id>/` stays until the spec packages of [DR-104](104-spec-package-format-and-client-environments.md) replace them. The old remote is kept aside, unchanged.
- Your other devices sync on the old layout first, then upgrade and add their folders again.

### Scenarios

| Situation | What happens |
| --- | --- |
| First start, no account | Add a folder and work. Its `.spex/` stays a plain folder until you sign in and pick a group. |
| A team's codebase | Add the folder and pick the team's group. Spex creates `<folder>-spex` there and pushes. Every member of that repository sees its records. |
| Code you cannot push to, or on another host | The same. Nothing touches the code. |
| Work across a group's projects | Start a session in the group's folder. Spex creates `<group>-spex` there. Group members see it. |
| Bob can read Project A's spex repository and nothing else of the team's | Bob gets exactly what Project A's `.spex/` declares. Nothing is substituted. |
| You can only read a project | You see its records. Your own sessions stay on this device, marked so. |
| The name is taken | A repository of that name exists and is not Spex's. Spex asks you for another. |
| A spex repository is renamed or transferred on the host | Spex follows it by id. Its label changes. |
| A member leaves, or access is revoked | The records turn unreachable on the next read. Nothing on the device is deleted. |
| Archived or over quota | The records turn read-only with the host's reason. |
| Two devices add intents to one project | Two new folders; no conflict. Editing the same intent on both is one whole-unit choice. |
| A second device | Sign in, join the project, sync. |
| `git clean -x` in a project | Removes `.spex/` with the other ignored files. What was pushed comes back on the next sync; what was not is gone. |

### Considered and declined

- Records on a `spex` branch inside the code repository: records would need push rights to the code, so work on code you do not own could not be shared, and every clone of the code would carry them.
- Records under the home, keyed by an id Spex mints: a second identity beside the host's, a map from id to folder, and a repair whenever a folder moves. Beside the code, records move with it, and the launcher finds them by walking up.
- A group holding the records of many projects: sharing would be all-or-nothing per group.
- A team settings repository that projects depend on: a member who cannot read it would silently get other tools than the rest. A project's needs are in its own `.spex/`.
- A device environment beside your home: a second personal place for skills, and nobody could say which one holds yours.
- Records on the default branch: a Developer who created the repository cannot change the group's rule on it.
- A kind of its own for a group's sessions: a project without code needs no new rule.
- A spex repository known by its name alone: anyone may name a project `<name>-spex`; the `spex` branch decides.
- Group kinds, personal or team: the member list decides, and a stored kind would lie.
- A Spex provisioning service with operators and service accounts: the Git host provides groups, and whoever administers it creates them.
- Spex managing members, roles or branch rules: the host's job. Spex shows and links. The one rule it ever writes is the exception for its own branch.
- A hidden ref instead of a branch: nobody could see or delete records on the host.
- Intents as a log of actions with ranks and links: a log needs a fold and per-device files to avoid conflicts; a set of files needs neither.

## Consequences

- One project, one audience, decided on the Git host. A team shares a project by adding members to its spex repository there.
- The Space surface is renamed Groups: your groups, each with its spex repositories and where their code lives; sign in, add or join, sync, members with the host's page linked, and what leaves this device.
- Spec packages change: `storage` for `.spex/` and the units; `space` for the Groups surface, sign-in, add and join, and members; `projects` for folders and their spex repositories; `dashboard` and `core-service` for intents as files, one session store and one sync gate per `.spex/`; `settings` for your file and the project's; `app-shell` and `server-shell` for the OAuth flows and the credential helper. They are updated under this record before the code follows.
- Acceptance checks: a spex repository created in a group and shared through the host's members alone; records kept for code on another host and for code you cannot push to; a group's spex repository created at its first session; a step left waiting for a member with the rights; a member who reads only the spex repository getting what it declares; a taken name refused and another asked; offline first start, then sign-in and publishing; two devices saving the same project; two devices adding intents without conflict; a read-only member's sessions staying local; a rename or transfer followed by id; a moved folder carrying its records; a two-project home migrated.
- Asks to Playbook: the author's account in the manifest, so a shared record names who ran it; and a launcher that finds a session's store and settings in the nearest `.spex/` above its working folder, the home at last.
- spex.pub's records map: the OAuth client and scopes, the device flow, listing and creating spex repositories, the members page, the branch exception, large-file storage, and rate limits. The journey harness gains a stand-in Git host.

## References

[1]: https://www.rfc-editor.org/rfc/rfc7636 "Proof Key for Code Exchange by OAuth Public Clients (RFC 7636)"
[2]: https://www.rfc-editor.org/rfc/rfc8628 "OAuth 2.0 Device Authorization Grant (RFC 8628)"
