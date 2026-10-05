<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR (draft): The Home and Its Spaces

## Status

Draft, revised on 2026-10-04 after the owner's review; first draft 2026-10-02.
Not yet numbered; on acceptance it takes the next number under [[meta-22](specs/meta.md#meta-22)].
What the review changed: a project is the unit of sharing and is the same thing as a project on the Git host; a space is a namespace there; Spex sets up whatever it needs on the Git host, so nobody creates repositories or edits branch rules by hand.
On acceptance it supersedes: the home as one Git repository with one remote in [DR-057](specs/decisions/057-space-surface.md); setting up by naming a remote in [DR-063](specs/decisions/063-space-setup-and-repair.md); the record layout of [DR-036](specs/decisions/036-file-state-store.md) and [DR-045](specs/decisions/045-unified-session-storage.md) with `projects.json`, `intents/<projectId>.jsonl`, `prefs.json` and `local/project-paths.json`; the draft store of [DR-058](specs/decisions/058-chat-assisted-playbook-authoring.md), which becomes authoring sessions; and the rule in [DR-057](specs/decisions/057-space-surface.md) and [DR-064](specs/decisions/064-honest-remote-failure.md) that the app enters no credential and asks no second tool.
The sync rules of those records stay for every mount: whole units, the core as the only Git actor between turns, no line-by-line merge, no credential in a remote URL.
Spec packages and environments are decided in [the companion draft](claude-spec-package-format-and-environments.md); this record only places their files.
A host record maps this record onto one Git host and proves it works there; the first is GitLab.com.

## Context

- Today the home is one Git repository with one remote, so every record of every project has the same audience. A person cannot keep private work beside a team's, and a team cannot share one project without sharing all.
- The owner's direction: use the Git host for everything it already does. Accounts, namespaces, projects, members and roles belong to the Git host. Spex shows them and never manages them. End users must not need to know what happens behind the scenes.
- The smallest thing a Git host shares is a repository. Folders and branches inside it cannot have different readers. So a Spex project must be one repository, and its records must live in it.
- Playbook stores sessions in one flat folder per launch and keeps leases beside each bundle. A session continues only where its recorded working folder exists.
- Two words. A **Git host** is a Git system with OAuth sign-in, such as GitLab.com. The **Spex server** is the process that serves a home: the desktop app's core or the server shell. Accepted specs call that process a host; they are renamed on acceptance.

## Decision

### The essence

Spex keeps a project's records in the project's own repository, on a branch named `spex`.
Spex keeps a person's or a team's shared settings in a repository named `spex` inside their namespace.
The Git host decides who sees what.
Spex adds no access control, no roles and no member lists of its own.

### Concepts

| Concept | Meaning | Identified by |
| --- | --- | --- |
| Git host | A Git system with OAuth. It owns accounts, namespaces, projects, members and roles. | Its URL |
| Account | You, on a Git host. | The host's permanent account id |
| Project | A repository: the folder you work in on this device, and a project on the Git host. Its Spex records live on its `spex` branch. The project is the unit of sharing. | A UUID in its records |
| Space | A namespace on a Git host: your own user namespace or a group. Its shared settings live in a repository named `spex` inside it. | The namespace's id on the host; a UUID while it has no host yet |
| Home | This device's `~/.spex`: mounts, device state and caches. Never a repository. | A device id made once |
| Mount | A checkout in the home of one project's records or one space's settings, with its own sync. | The project's or the space's id |
| Session | A conversation Playbook records as one bundle in a project's records. | Playbook's session id |

- A personal space is a space whose only member is you. Nothing in Spex marks it. The host's member list is the truth.
- A project belongs to the nearest space above it on the host that has a `spex` repository you can read. A project with no such space, or no remote, belongs to your default space.
- Your default space is the mount you choose as your own. Sessions outside any project go there, and its skills reach your agents' home folders.
- The home is `SPEX_HOME`, or `~/.spex`. First start creates a default space with no host, so Spex works offline before any sign-in.

### What Spex does on a Git host

Spex does five things there, always with your own account:

1. Signs you in with OAuth: the browser flow with PKCE [[1]] on the desktop, the device flow [[2]] on the Spex server.
2. Lists the projects and spaces you can read.
3. Clones, fetches and pushes `spex` branches.
4. Creates a space's `spex` repository, with an ordinary default branch first and the `spex` branch beside it.
5. Reads a project's or a space's members and shows them with the host's own role names, with a link to the host's page.

Everything else stays on the Git host: adding or removing members, roles, sharing, transferring, archiving, deleting, creating groups.
Spex never does these; it shows the state and links to the page.

- When a step needs rights you do not have, it stays pending, and a member who has them finishes it from Spex. Nobody is sent to edit Git settings.
- The host's refusal is the answer. Spex derives nothing from a role name or a cached list.
- A cached list proves nothing. A project the host stops listing stays mounted as unreachable. Nothing on the device is deleted because the host refused.
- Spex never promises privacy. Before your first push into a repository with other members, it says once that the records stay there and that nothing recalls what others downloaded. A public repository makes its records public, and Spex says so.
- The token reaches Git through a credential helper, never through a remote URL.
- Spex reads the host when you sign in, when you press Refresh, and before a sync. Never on a timer.

### The `spex` branch

- The `spex` branch is an orphan branch. It shares no history with the code and appears in no pull request.
- Spex writes to a repository's `spex` branch and to no other branch.
- The `spex` branch is never a repository's default branch, so the host's protection of the default branch never touches it. Every member who can write the repository can push it.
- Everyone who clones the code also gets the `spex` branch. Records cost clone size. Large files use the host's large-file storage where it exists.

### Layout

```text
~/.spex/
  home.yaml                        device id, Git hosts and accounts, mounts, default space
  projects/<project id>/           checkout of a project's spex branch
    project.json                   id and name
    intents/<device id>.jsonl      this device's intent acts, with their assets beside them
    sessions/                      Playbook's store for this project
  spaces/<space id>/               checkout of a space's spex repository
    space.yaml                     id
    spex.yaml, spex.lock           spec package requests and lock (companion draft)
    config/playbook.config.yaml    players, Captain, enabled playbooks
    sessions/                      sessions outside any project
  store/, cache/                   spec package bytes and caches (companion draft)
  local/                           device state: prefs, bindings, sync state, credentials, migrations
  .lease                           held by the one Spex server serving this home
```

- Every Spex file is JSON or YAML with a `format` number. A reader refuses a format it does not know and never guesses.
- `home.yaml` holds the device id, each Git host with its OAuth client id and your account, each mount with its kind, id and place on the host, and the default space.
- `project.json` holds `id` and `name`. `space.yaml` holds `id`. Both are written once, in the first commit.
- Intents are one file per device, so two devices never write the same file. Each act carries `at` and `by`, the author's account or `local`.
- Sessions are Playbook's bundles. Hints and leases beside them stay on the device.
- `local/` never leaves the device: preferences, the map from project id to working folder, sync state per mount, credentials with owner-only permissions, migration receipts.
- A project's working folder may hold `spex.yaml`, `spex.lock` and `config/playbook.config.yaml` of its own, committed with the code. Its installed view `.spex/` is ignored everywhere.

### Sync

- Every mount syncs on its own with the machine of [DR-057](specs/decisions/057-space-surface.md): save local changes as a commit, fetch, compare whole units, ask per conflict, apply, push.
- The units are a session bundle, one intent file with its assets, `project.json`, `space.yaml`, the pair `spex.yaml` and `spex.lock`, the config file, and each managed Git file. A unit is taken whole from one side. Nothing is merged line by line.
- A sync of a mount runs while no session stored in it has a turn in flight. It blocks writes to that mount only.
- A mount is reachable, unreachable (the host refused, or you are signed out), read-only (archived, or you may only read), or without a host yet.
- A read-only project keeps your new sessions on this device and says so.
- Unmounting deletes the checkout only. It refuses while local units are not on the remote, unless you confirm.

### Sessions and settings

- The Spex server stores a session it starts in its project's records.
- A terminal session lands in your default space. When it settles, the Spex server moves it into its project's records by its working folder.
- A session uses the settings of its project's space, then the project's own `config/playbook.config.yaml`, then this device's tuning. Nothing is merged across spaces.
- History reads anywhere the records are. A session continues only on a device where the project's working folder matches the bundle's, the runtime validates, and no lease is held.

### Projects on this device

- Binding a folder: Spex reads the folder's `spex` branch. If it carries `project.json`, that is the project. Otherwise Spex mints an id and creates the branch. The folder's remote names the project on the host.
- Two repositories with one project id are one project. Mounting the second is refused by name. A fork carries the old id; Spex offers to start its records afresh with a new one.
- Sharing a project with more or fewer people, moving it to another group, or archiving it, is done on the Git host. The records travel with the repository, and the mount follows by repository id.
- Removing a project from this device unbinds it and deletes its checkout. Nothing on the host changes.

### Migration

- Today's home becomes one space for your settings and one records branch per project.
- It runs once, under the lease, with old writers stopped, and leaves a receipt.
- Steps: the home repository becomes your default space under `spaces/<id>/`; each `projects.json` entry becomes a `project.json`; each project's intents and sessions move into `projects/<id>/` as a new `spex` branch with no history from the old home, pushed where you can push and kept on this device where you cannot; `prefs.json` and `local/project-paths.json` move under `local/`; `playbooks/<id>/` stays as legacy units until the companion draft's spec packages replace them.
- Your other devices sync on the old layout first, then upgrade and mount from the remotes.

### Scenarios

| Situation | What happens |
| --- | --- |
| First start, no account | A default space with no host. Everything works offline. After sign-in Spex publishes it. |
| A team project on the host | Bind the folder. Spex pushes the `spex` branch. Every member of the project sees its records. Spex mounts the group's space, creating its `spex` repository when you may, or leaving that pending for a member who may. |
| You can only read a project | You see its records. Your own sessions stay on this device, marked so. |
| A project is renamed or transferred on the host | The mount follows by repository id. Its label changes. |
| A member leaves, or access is revoked | The mount turns unreachable on the next read. Nothing on the device is deleted. |
| A fork | It carries the old records and id. Spex offers to start afresh with a new id. |
| Archived or over quota | The mount turns read-only with the host's reason. |
| A second device | Sign in, mount, sync. As today. |

### Considered and declined

- A space holding the records of many projects: sharing would be all-or-nothing per space, and a Spex project would not be a project on the host.
- A separate storage repository per project: two repositories and two member lists per project.
- Space kinds, personal or team: the member list decides, and a stored kind would lie.
- A Spex provisioning service with operators and service accounts: the Git host provides namespaces, and whoever administers it creates them.
- Spex managing members, roles or branch rules: the host's job; Spex shows and links, and puts its branch where no rule applies.
- Records on the code branches: every session would show up in code history and pull requests.
- A hidden ref instead of a branch: nobody could see or delete records on the host.

## Consequences

- One project, one audience, decided on the Git host. A team shares a project by adding members there.
- The Space surface becomes a list of mounts: sign in, mount, sync, members with the host's page linked, and what leaves this device.
- Settings are per space and per project, with no merge across spaces.
- Asks to Playbook: the author's account in the manifest, so a shared record names who ran it; and a launcher that finds the session store from the working folder's project, so terminal sessions land in their project's records directly.
- The host record for GitLab.com maps: the OAuth client and scopes, the device flow, listing projects and spaces, the members page, creating a `spex` repository, large-file storage, and rate limits. The journey harness gains a stand-in Git host.

## References

[1]: https://www.rfc-editor.org/rfc/rfc7636 "Proof Key for Code Exchange by OAuth Public Clients (RFC 7636)"
[2]: https://www.rfc-editor.org/rfc/rfc8628 "OAuth 2.0 Device Authorization Grant (RFC 8628)"
