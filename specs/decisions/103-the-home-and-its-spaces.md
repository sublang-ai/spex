<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-103: The Home and Its Spaces

## Status

Accepted (2026-10-04) on the owner's decision to adopt this record after reviewing it beside [the Codex draft](../../codex-dr-spaces-projects-and-storage.md), which stays a draft.
Revised the same day, while still being worked on: there is no settings repository for a team or a person; what a project needs is in the project, and what you add for yourself stays on your device; an intent is one file, and intents form a set.
Spec packages are decided by [DR-104](104-spec-package-format-and-client-environments.md); this record only places their files.
A host record maps this record onto one Git host and proves it there; the first is GitLab.com.
Amends ([DR-046](046-decision-record-evolution.md)):

- [DR-057](057-space-surface.md): the home is no longer one repository with one remote; it holds one checkout per project's records, and the app signs in to a Git host and consults it. The surface's four duties and the sync machine stand, applied per project.
- [DR-063](063-space-setup-and-repair.md): setting up by naming a remote gives way to signing in, after which Spex sets up what it needs. The folder repair stands.
- [DR-036](036-file-state-store.md) and [DR-045](045-unified-session-storage.md): `projects.json`, `intents/<projectId>.jsonl`, `prefs.json` and `local/project-paths.json` give way to the layout below. File state, leases, Playbook's session store and whole-unit selection stand.
- [DR-035](035-intent-ledger.md) and [DR-077](077-up-next-is-a-committed-queue.md): an intent is one file in its project's records, with no rank and no link to another intent; the next to run is the oldest one waiting. Capture, delivery and verdicts stand.
- [DR-058](058-chat-assisted-playbook-authoring.md): the draft store gives way to authoring sessions in a project.
- [DR-064](064-honest-remote-failure.md): where a Git host is signed in, Spex consults its answer. The rule to claim only what the host said stands.

Extends [DR-006](006-projects-and-forge.md): a project's Spex records live on the `spex` branch of the repository the project already is.

## Context

- Until now the home was one Git repository with one remote, so every record of every project had the same audience. A person could not keep private work beside a team's, and a team could not share one project without sharing all.
- The owner's direction: use the Git host for everything it already does. Accounts, groups, projects, members and roles belong to the Git host. Spex shows them and never manages them. End users must not need to know what happens behind the scenes.
- The smallest thing a Git host shares is a repository. Folders and branches inside it cannot have different readers. So a Spex project must be one repository, and its records must live in it.
- A project must carry what it needs. A person who can read the project but nothing else the team keeps must get the same tools as everyone else on that project.
- Playbook stores sessions in one flat folder per launch and keeps leases beside each bundle. A session continues only where its recorded working folder exists.
- Two words. A **Git host** is a Git system with OAuth sign-in, such as GitLab.com. The **Spex server** is the process behind the desktop or the browser, on this device or a remote one. Earlier records call that process a host.

## Decision

### Principle

Spex keeps a project's records in the project's own repository, on a branch named `spex`.
What a project needs, Spex keeps in the project.
What you add for yourself, Spex keeps on your device.
The Git host decides who sees what.
Spex adds no access control, no roles and no member lists of its own.

### Concepts

| Concept | Meaning | Identified by |
| --- | --- | --- |
| Git host | A Git system with OAuth. It owns accounts, groups, projects, members and roles. | Its URL |
| Account | You, on a Git host. | The host's permanent account id |
| Project | A repository: the folder you work in on this device, and a project on the Git host. Its Spex records live on its `spex` branch. The project is the unit of sharing. | A UUID in its records |
| Space | The group or user a project belongs to on the Git host. Spex uses it to list projects. It has no files of its own. | The host's id for it |
| Home | This device's `~/.spex`: checkouts of project records, your own settings, device state and caches. Never a repository. | A device id made once |
| Session | A conversation Playbook records as one bundle in a project's records. | Playbook's session id |

- The home is `SPEX_HOME`, or `~/.spex`.
- Spex works offline. Bind a folder and work. Sign in when you want to share.

### What Spex does on a Git host

Spex does five things there, always with your own account:

1. Signs you in with OAuth: the browser flow with PKCE [[1]] on the desktop, the device flow [[2]] on the Spex server.
2. Lists the projects you can read, grouped by space.
3. Clones, fetches and pushes `spex` branches.
4. Prepares a project's `spex` branch. Where a rule on the host would block that branch, Spex adds an exception for it when you are allowed to.
5. Reads a project's members and shows them with the host's own role names, with a link to the host's page.

Everything else stays on the Git host: adding or removing members, roles, sharing, transferring, archiving, deleting, creating groups.
Spex never does these; it shows the state and links to the page.

- When a step needs rights you do not have, it waits, and a member who has them finishes it from Spex. Nobody is sent to edit Git settings.
- The host's refusal is the answer. Spex derives nothing from a role name or a cached list.
- A cached list proves nothing. A project the host stops listing stays bound as unreachable. Nothing on the device is deleted because the host refused.
- Spex never promises privacy. Before your first push into a repository with other members, it says once that the records stay there, hidden records and attachments included, and that nothing recalls what others downloaded. A public repository makes its records public, and Spex says so.
- The token reaches Git through a credential helper, never through a remote URL.
- Spex reads the host when you sign in, when you press Refresh, and before a sync. Never on a timer.

### One branch for records

- The `spex` branch has its own history, separate from the code. It appears in no pull request.
- Spex writes to a repository's `spex` branch and to no other branch.
- The `spex` branch is never a repository's default branch, so the protection of the default branch never touches it. Every member who can write the repository can push it.
- Everyone who clones the code also gets the `spex` branch. Records cost clone size. Large files use the host's large-file storage where it exists.

### What lives where

```text
~/.spex/
  home.yaml                        device id, Git hosts and accounts, bound projects
  config/playbook.config.yaml      your players and Captain on this device
  global/                          what you add on this device for your agents: spex.yaml, spex.lock (DR-104)
  projects/<project id>/           checkout of a project's spex branch
    project.json                   id and name
    intents/<intent id>/           one folder per intent: intent.json and its attachments
    sessions/                      Playbook's store for this project
  sessions/                        sessions outside any project; they stay on this device
  store/, cache/                   spec package bytes and caches (DR-104)
  local/                           device state: prefs, folder bindings, sync state, credentials, migrations
  .lease                           held by the one Spex server serving this home
```

- Every Spex file is JSON or YAML with a `format` number. A reader refuses a format it does not know and never guesses.
- `home.yaml` holds the device id, each Git host with its OAuth client id and your account, and each bound project with its repository on the host.
- `project.json` holds `id` and `name`, written once in the first commit.
- An intent is one instruction waiting to run: its text and attachments, who wrote it and when, where it came from, its state (waiting, running, done or dropped), and the session and turn that ran it. A project's intents form a set. Adding one never conflicts with anything. They have no order of their own: the next to run is the oldest one waiting, and you may run any of them directly.
- Sessions are Playbook's bundles. Hints and leases beside them stay on the device.
- `local/` never leaves the device: preferences, the map from project id to working folder, sync state per project, credentials with owner-only permissions, migration receipts.
- A project's working folder holds what the project needs: `spex.yaml`, `spex.lock` and `config/playbook.config.yaml`, committed with the code. Its installed view `.spex/` is ignored.

### Sync, one project at a time

- Every project's records sync on their own with the machine of [DR-057](057-space-surface.md): save local changes as a commit, fetch, compare whole units, ask per conflict, apply, push.
- The units are a session bundle, one intent folder, `project.json`, and each managed Git file. A unit is taken whole from one side. Nothing is merged line by line.
- A sync runs while no session of that project has a turn in flight. It blocks writes to that project's records only.
- A project's records are reachable, unreachable (the host refused, or you are signed out), read-only (archived, or you may only read), or local only (no remote yet).
- A read-only project keeps your new sessions on this device and says so.
- Unbinding a project deletes its checkout only. It refuses while local units are not on the remote, unless you confirm.

### Where sessions go, and which settings apply

- A session is stored in its project's records from its first message. A session outside any project stays on this device.
- A session runs with this device's `config/playbook.config.yaml`, with the project's own `config/playbook.config.yaml` added on top, and the session's own tuning last.
- The project's file names the playbooks it enables and which player each role uses. This device's file says what each player runs on. A player this device does not have is reported before the session starts, and Settings offers to add it.
- History reads anywhere the records are. A session continues only on a device where the project's working folder matches the bundle's, the runtime validates, and no lease is held.

### Projects on this device

- Binding a folder: Spex reads the folder's `spex` branch. If it carries `project.json`, that is the project. Otherwise Spex mints an id and creates the branch. The folder's remote names the project on the host.
- Two repositories with one project id are one project. Binding the second is refused by name. A fork carries the old id; Spex offers to start its records afresh with a new one.
- Sharing a project with more or fewer people, moving it to another group, or archiving it, is done on the Git host. The records travel with the repository, and Spex follows it by repository id.
- Removing a project from this device unbinds it and deletes its checkout. Nothing on the host changes.

### Migration

- Today's home becomes one records branch per project. Your settings file stays where it is.
- It runs once, under the lease, with old writers stopped, and leaves a receipt.
- Steps: each `projects.json` entry becomes a `project.json`; each project's intent log is folded once into one folder per intent; each project's intents and sessions move into `projects/<id>/` as a new `spex` branch with no history from the old home, pushed where you can push and kept on this device where you cannot; sessions matching no project stay under `sessions/`; `prefs.json` and `local/project-paths.json` move under `local/`; `playbooks/<id>/` stays until the spec packages of [DR-104](104-spec-package-format-and-client-environments.md) replace them. The old home repository is kept aside, unchanged.
- Your other devices sync on the old layout first, then upgrade and bind their folders again.

### Scenarios

| Situation | What happens |
| --- | --- |
| First start, no account | Bind a folder and work. Records stay on this device until you sign in and push. |
| A team project on the host | Bind the folder. Spex pushes the `spex` branch. Every member of the project sees its records. |
| Bob can read Project A and nothing else of the team's | Bob gets exactly what Project A declares. Nothing is substituted. |
| You can only read a project | You see its records. Your own sessions stay on this device, marked so. |
| A project is renamed or transferred on the host | Spex follows it by repository id. Its label changes. |
| A member leaves, or access is revoked | The records turn unreachable on the next read. Nothing on the device is deleted. |
| A fork | It carries the old records and id. Spex offers to start afresh with a new id. |
| Archived or over quota | The records turn read-only with the host's reason. |
| Two devices add intents to one project | Two new folders; no conflict. Editing the same intent on both is one whole-unit choice. |
| A second device | Sign in, bind the folder, sync. |

### Considered and declined

- A space holding the records of many projects: sharing would be all-or-nothing per space, and a Spex project would not be a project on the host.
- A separate storage repository per project: two repositories and two member lists per project.
- A settings repository for a team or a person: a member who cannot read it would silently get other tools than the rest. A project's needs belong in the project, and your own additions on your device.
- Space kinds, personal or team: the member list decides, and a stored kind would lie.
- A Spex provisioning service with operators and service accounts: the Git host provides groups, and whoever administers it creates them.
- Spex managing members, roles or branch rules: the host's job. Spex shows and links, and puts its branch where no rule applies.
- Records on the code branches: every session would show up in code history and pull requests.
- A hidden ref instead of a branch: nobody could see or delete records on the host.
- Intents as a log of actions with ranks and links: a log needs a fold and per-device files to avoid conflicts; a set of files needs neither.

## Consequences

- One project, one audience, decided on the Git host. A team shares a project by adding members there.
- The Space surface becomes the list of your projects' records, grouped by space: sign in, sync, members with the host's page linked, and what leaves this device.
- Spec packages change: `storage` for the layout and the units; `space` for the surface over project records, sign-in and members; `projects` for binding through the `spex` branch; `dashboard` and `core-service` for intents as files, one session store per project and one sync gate per project; `settings` for the device file and the project file; `app-shell` and `server-shell` for the OAuth flows and the credential helper. They are updated under this record before the code follows.
- Acceptance checks: sharing one project through the host's members alone; a records branch beside a protected default branch, with an exception added where allowed; a step left waiting for a member with the rights; a member who reads only the project getting what it declares; offline first start, then publishing; two devices saving the same project; two devices adding intents without conflict; a read-only member's sessions staying local; a rename or transfer followed by repository id; a fork offered a new id; a two-project home migrated.
- Asks to Playbook: the author's account in the manifest, so a shared record names who ran it; and a launcher that finds the session store and the project's settings from the working folder, so a terminal session goes to its project from its first message.
- The host record for GitLab.com maps: the OAuth client and scopes, the device flow, listing projects, the members page, the branch exception, large-file storage, and rate limits. The journey harness gains a stand-in Git host.

## References

[1]: https://www.rfc-editor.org/rfc/rfc7636 "Proof Key for Code Exchange by OAuth Public Clients (RFC 7636)"
[2]: https://www.rfc-editor.org/rfc/rfc8628 "OAuth 2.0 Device Authorization Grant (RFC 8628)"
