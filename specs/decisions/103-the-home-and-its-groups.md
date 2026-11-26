<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-103: The Home and Its Records Repositories

## Status

Accepted (2026-10-04); revised (2026-10-06).
Amends [DR-006](006-projects-and-forge.md), [DR-035](035-intent-ledger.md), [DR-036](036-file-state-store.md), [DR-045](045-unified-session-storage.md), [DR-057](057-space-surface.md), [DR-058](058-chat-assisted-playbook-authoring.md), [DR-064](064-honest-remote-failure.md), [DR-077](077-up-next-is-a-committed-queue.md), [DR-080](080-the-config-directory-is-named-config.md).
Amended by [DR-108](108-the-root-lease-names-the-machine.md), [DR-111](111-the-core-coordinates-as-git-does.md), [DR-113](113-a-projects-environment-lives-in-its-working-folder.md), [DR-120](120-the-instance-is-the-space.md), [DR-122](122-a-sync-reads-its-destination.md), [DR-125](125-your-own-groups-path-sources-live-in-its-clone.md), [DR-127](127-a-home-signed-in-to-several-instances.md), [DR-128](128-a-spex-repository-placed-at-several-instances.md), [DR-134](134-execution-ownership.md), [DR-144](144-bounded-session-storage.md), [DR-150](150-spex-space-product-and-destination.md), [DR-172](172-surfaces-a-fresh-user-reads.md), [DR-176](176-global-playbooks-and-a-placed-playbook-runs.md), [DR-213](213-public-github-code-opens-over-https.md), [DR-221](221-your-own-groups-folder-is-a-lowercase-name-checked-before-it-moves.md), [DR-246](246-remove-groups-and-team-servers-from-the-clients.md).

## Context

- Until this decision the home, Spex's folder `~/.spex` or `SPEX_HOME`, was one Git repository with one remote, so every session and intent of every project shared one history and one destination.
- The owner's direction: use the Git host behind a Space, a Git system with OAuth sign-in, for everything it already does. Accounts and repositories belong to the Space. Spex shows them and never manages them. You must not need to know what happens behind the scenes.
- The smallest thing a Git host keeps apart is a repository; folders and branches inside it cannot have different readers [[3]]. So each project's records are one repository.
- The code a person works on is not always theirs: it may be on another host, or one they cannot push to, and they still keep their records.
- A project must carry what it needs. A device that reads only a project's records must still get the tools its sessions used.
- Playbook runs a playbook: a workflow whose roles are played by agents you name, the players, under a Captain that talks with you. It writes every session, one conversation, as files in one sessions folder, and marks with a lease which process may write it.
- Spec packages are decided by [DR-104](104-spec-package-format-and-client-environments.md); this decision only places their files.
- The Space maps this decision onto its Git system in its own decision records [[3]]; it brokers the Git credential, so for spex repositories the remote URL it hands over is the only thing Spex reaches beyond it.

## Decision

### Principle

Every project, and the home's global settings, keep what is not code in a repository of their own.
What is not code is its sessions, the conversations with agents; its intents, instructions to run; the global spec packages, each a GEARS contract with the skills and playbooks made from it ([DR-104](104-spec-package-format-and-client-environments.md)); and the settings naming which player plays each role.
These are its records, and they live on the `spex` branch of a spex repository named `<name>-spex`: one per project, and the **global records repository** for the home's personal sessions, global configuration and global environment.
Each lives on this device under `~/.spex/workspace/` and, once you sign in and choose to sync it, in your own namespace at a Space, where Spex creates it and pushes ([DR-246](246-remove-groups-and-team-servers-from-the-clients.md)).
A project's code lives in any Git repository you choose, and Spex pushes nothing to it.
The Space decides who reads a spex repository; Spex adds no access control, roles or member lists of its own.

### Concepts

| Concept | Meaning |
| --- | --- |
| Working folder | A folder on this device where a project's sessions run, usually a clone of its code, which may be any Git repository. |
| Project | A working folder and a spex repository. Add a working folder, and Spex finds or makes its spex repository. |
| Global records repository | The spex repository holding the home's personal sessions outside any project, its global configuration and its global environment, kept in the personal records folder ([DR-127](127-a-home-signed-in-to-several-instances.md)). |

- Spex works offline. Add a working folder and work. Sign in when you want your records on another device.
- Before you sign in, the personal records folder under `workspace/` is named after your user name on this device. The first sign-in renames that folder and the global records repository after your account there ([DR-221](221-your-own-groups-folder-is-a-lowercase-name-checked-before-it-moves.md)). If another device of yours already pushed one, Spex joins the two as it joins any two histories: every unit on both sides is one choice.
- Where this device's global records clone provably holds only its unchanged generated bootstrap — no session, intent or authoring session, and nothing the reader changed — that join takes the Space's side for every unit without asking, so a second device starts from what the first pushed instead of asking about a seeded environment the person never touched.

### What Spex does at a Space

Spex does these things there, always with your own account:

1. Signs you in with OAuth: the browser flow with PKCE [[1]] on the desktop, the device flow [[2]] on the standalone browser shell.
2. Lists the spex repositories in your own namespace.
3. Creates a spex repository there: private, its description saying what it is and where the code lives.
4. Clones, fetches and pushes `spex` branches.
5. Asks the Space to prepare a `spex` branch before its first push.

Everything else stays with the Space.

- When a step needs rights you do not have, Spex says which and waits, and finds the result on the next read. Nobody is sent to edit the Space's settings.
- The Space's refusal is the answer; Spex derives nothing from a role name or a cached list. A spex repository the Space stops listing stays on this device as unreachable, and nothing on the device is deleted because the Space refused.
- The Git credential reaches Git through a credential helper, never through a remote URL.
- Spex reads the Space when you sign in, when you press Refresh, and before a sync ([DR-122](122-a-sync-reads-its-destination.md)), and once after a signed-in start ([DR-127](127-a-home-signed-in-to-several-instances.md)). Never on a timer.

### Spex repositories

- The name is `<name>-spex`: the working folder's name for a project, which you may change, and the personal records folder's name for the global records repository. A `<name>-spex` repository with a `spex` branch is Spex's; the name alone proves nothing. Where the name is taken, Spex asks you for another.
- The host gives every repository a permanent id that it keeps through renames and moves [[3]]. Spex stores that id in the clone's Git configuration beside the remote, and mints no repository id of its own.
- Spex pushes only the `spex` branch of a spex repository, and only once the spex repository has a default branch. The default branch holds the host's README and nothing else.
- Spex creates the `spex` branch beside the default branch, never as it: a host may protect every new repository's default branch, while a branch of another name carries no rule unless one names it [[3]].
- Large files go through Git LFS where the host supports it.

### What lives where

```text
~/.spex/
  workspace/<own>/                          the personal records folder (DR-127)
    <own>-spex/                             the global records repository
      spex.yaml, spex.lock                  the global environment (DR-104)
      config/playbook.config.yaml           its playbooks, which player each role uses, and what each player runs on
      sessions/                             the sessions outside any project, as Playbook writes them
    <name>-spex/                            a local-only project's records
  workspace/@<host>/<login>/<name>-spex/    a project's records synced to a Space (DR-127)
      project.json                          the remote of the code
      intents/<id>.json                     one file per intent, with <id>.assets/ beside it when it has attachments
      sessions/                             the sessions, as Playbook writes them
  home.yaml                                 the device id, the Spaces signed in to with their accounts, and each working folder with its spex repository
  store/, cache/                            spec package bytes and caches (DR-104)
  local/                                    preferences, sync state, credentials, migration receipts
```

- A project's `spex.yaml` and `spex.lock` live at its working folder's root ([DR-113](113-a-projects-environment-lives-in-its-working-folder.md)).
- Every file whose layout Spex defines is JSON or YAML with a `format` field, the version of that layout. A reader refuses one it does not know and never guesses.
- Spex writes into a working folder only the skills an agent reads from there, listed in the working folder's `.git/info/exclude` so Git ignores them. Spex commits nothing with the code.
- An intent is one instruction to run: its text and attachments, who wrote it and when, where it came from, and, once run, the session and turn that ran it, or that it was dropped. A project's intents form a set. Adding one never conflicts with anything. They have no order of their own: the next to run is the oldest one queued, and you may run any of them directly.
- The agents' own session ids and the lease beside a session stay on the device.
- `local/` never leaves the device; its credentials have owner-only permissions.

### Sync, one spex repository at a time

- A unit is a session, an intent with its attachments, `spex.yaml` with `spex.lock`, `config/playbook.config.yaml`, or `project.json`. A unit is taken whole from one side.
- Every spex repository syncs on its own, as [DR-057](057-space-surface.md) decided: Spex commits local changes, fetches, compares each unit with the Space's copy, asks you where both sides changed one, applies, and pushes.
- A rename or move at the Space moves the matching clone on the next sync, and in the same step updates `home.yaml` and the exports beneath it.
- A spex repository is reachable, unreachable (the Space refused, you are offline, or you are signed out), read-only (archived, over quota, or you may only read), or local only (not at a Space yet).
- A read-only spex repository keeps your new sessions on this device and says so.

### Which settings apply

- A session runs with the global records repository's `config/playbook.config.yaml`, the project's own added on top, and the session's tuning last. The project's file names the playbooks it enables and which player each role uses, by name, and never a model. The global file says what each player runs on. A role whose player the global roster lacks runs on the Captain's agent ([DR-176](176-global-playbooks-and-a-placed-playbook-runs.md)).
- You can read a session wherever its spex repository is; it continues only on the runtime it is assigned to ([DR-134](134-execution-ownership.md)).

### Projects on this device

- Adding a working folder: Spex creates its spex repository locally in the personal records folder, named after the working folder, with no remote until you choose a Space to sync it to; `home.yaml` pairs the two.
- Opening a personal project on another device: Spex clones its spex repository under `workspace/`, then clones the code from the remote its `project.json` names, with this device's own Git and its credentials, or takes a working folder you already have.
- Two working folders paired with one spex repository are one project, checked out twice; each runs its own sessions and uses the spec packages its environment installs ([DR-104](104-spec-package-format-and-client-environments.md)). A fork of a spex repository is another project.
- Removing a project from this device forgets its working folder and deletes its spex repository's clone. Removal refuses while anything in the clone has not reached the Space, unless you confirm. Nothing at the Space changes.

### Migration

- The settings file and the sessions that match no project move into the global records repository under `workspace/`. Each project's intents and sessions move into a spex repository of their own there, local only until you choose a Space for it.
- It runs once, under the lease, with old writers stopped, and leaves a receipt:
  1. The entries of `projects.json`, with their paths from `local/project-paths.json`, become the working folders in `home.yaml`.
  2. Each project's intent log is replayed once into one file per intent.
  3. Each project's intents and sessions move into its spex repository as a new `spex` branch with no history from the old home, with the working folder's remote written to `project.json`.
  4. `prefs.json` moves under `local/`; `playbooks/<id>/` stays until the spec packages of [DR-104](104-spec-package-format-and-client-environments.md) replace them.
  5. The old remote is kept aside, unchanged.
- Before any device migrates, every device syncs on the old layout; the others then upgrade without migrating and add their working folders again.

### Amended decisions

- [DR-057](057-space-surface.md): the home is no longer the one repository with one remote; every project and the global records have a spex repository of their own, and Spex signs in to a Space and consults it. The Space surface keeps its duties and its sync, applied to the `spex` branch of each spex repository.
- [DR-036](036-file-state-store.md) and [DR-045](045-unified-session-storage.md): `projects.json`, `intents/<projectId>.jsonl`, `prefs.json` and `local/project-paths.json` give way to the layout above, and every sync, from the app or the command line, runs on the `spex` branch of one spex repository. File state, leases, Playbook's session store and taking a changed unit whole from one side stand. Queue-order and link validation go with ranks and links.
- [DR-035](035-intent-ledger.md) and [DR-077](077-up-next-is-a-committed-queue.md): each intent is kept on its own in its project's records, with no rank and no link to another intent; the next to run is the oldest one queued. Capture, delivery, verdicts and the rule that no state is stored for an intent stand.
- [DR-058](058-chat-assisted-playbook-authoring.md): the draft store gives way to authoring sessions in a project.
- [DR-064](064-honest-remote-failure.md): where you are signed in to a Space, Spex consults its answer, keeps its sign-in under `local/`, and gives Git a credential through a credential helper. The rule to claim only what the Space said, and the refusal of a remote URL embedding a credential, stand.
- [DR-006](006-projects-and-forge.md): a project's code is any Git repository; its records live in a spex repository, cloned under the home and pushed to your namespace at a Space once you sign in and choose to sync. The forge binding stands.
- [DR-080](080-the-config-directory-is-named-config.md): `config/playbook.config.yaml` keeps its name and moves into the global records repository, synced with it.

### Scenarios

| Situation | What happens |
| --- | --- |
| First start, no account | Add a working folder and work. Its spex repository sits in the personal records folder with no remote until you sign in and choose a Space. |
| Code you cannot push to, or on another host | The same. Spex pushes nothing to the code. |
| The name is taken | A repository of that name exists and is not this project's. Spex asks you for another. |
| A spex repository is renamed or moved at the Space | Spex follows it by id and moves its clone on the next sync. Its name in Spex changes. |
| Your access is revoked | The records turn unreachable on the next read. Nothing on the device is deleted. |
| Archived or over quota | The records turn read-only with the Space's reason. |
| Two devices add intents to one project | Two new files; no conflict. Editing the same intent on both is one choice between the two versions. |
| A second device | Sign in, open the project, sync. What you made before signing in joins the same way. |

### Considered and declined

- Records on a `spex` branch inside the code repository: records would need push rights to the code, so work on code you do not own could not keep its records, and every clone of the code would carry them.
- Records inside the working folder, as a `.spex/`: Spex's files in the working folder, at the mercy of `git clean`.
- An id Spex mints for a project: a second identity beside the host's. The host's repository id and the tree under `workspace/` are enough.
- The code as a Git submodule of the spex repository: a submodule pins a commit and puts the code inside the clone; `project.json` names the remote and nothing else.
- One repository holding the records of many projects: its records would sync and be read all or nothing.
- Spec packages for this device alone, beside the global records repository's: a second personal place for skills, and nobody could say which one holds yours.
- Records on the default branch: a host may protect every new repository's default branch, and releasing that protection for spex repositories would release it for the code too; a second branch costs nothing.
- A spex repository known by its name alone: anyone may name a repository `<name>-spex`; the `spex` branch decides.
- A folder per intent: a folder for what is mostly one short instruction. A file, with attachments beside it when there are any, is Playbook's own pattern for a session.
- Spex managing access, roles or branch rules: the Space's job.
- A hidden ref instead of a branch: nobody could see or delete records in the host's pages.
- Intents as a log of actions with ranks and links: a log needs replaying, and one file per device to avoid conflicts; a set of files needs neither.

## Consequences

- The Space surface shows your local and personal projects with their records: sign in, sync, and what the next sync will push.
- These specs change: `storage` for `workspace/` and the units; `space` for the surface and sign-in; `projects` for working folders and their spex repositories; `dashboard` and `core-service` for intents as files, one session store and one sync at a time per spex repository; `settings` for the global file and the project's; `app-shell` and `server-shell` for the OAuth flows and the credential helper.
- Acceptance checks: records kept for code on another host and for code you cannot push to; a refused step shown as waiting and found done on a later read; a taken name refused and another asked; offline first start, then sign-in and the first push; a second device adopting the first device's pushed global records over its untouched bootstrap without asking; two devices changing the same unit; two devices adding intents without conflict; a read-only repository's sessions staying local; a rename or move followed by id and the clone moved; a two-project home migrated; browser journeys against a stand-in Space.
- Asks to Playbook: the author's account in each session, so a session names who ran it; and a launcher that asks Spex for the sessions folder and settings of a working folder, so a terminal session goes to its project from its first message.

## References

[1]: https://www.rfc-editor.org/rfc/rfc7636 "Proof Key for Code Exchange by OAuth Public Clients (RFC 7636)"
[2]: https://www.rfc-editor.org/rfc/rfc8628 "OAuth 2.0 Device Authorization Grant (RFC 8628)"
[3]: https://github.com/sublang-ai/spex-pub/blob/main/specs/decisions/020-gitlab-com-as-the-host-instance.md "spex.pub DR-020: GitLab.com as the host instance, with the facts checked against GitLab's documentation"
