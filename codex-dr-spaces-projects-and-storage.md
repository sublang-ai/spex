<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Codex DR draft: Spaces, Projects, and Storage

## Status

Draft revised 2026-10-04; not accepted or implemented.
Read with [Spec Packages and Environments](codex-dr-package-format-and-environments.md).
GitLab is the first integration; the design uses capabilities any supported Git host must provide.

## Context

People need to share one project without sharing everything else.
A Git repository is the smallest unit whose readers the Git host controls independently.
Directories and branches cannot give parts of that repository different readers.

## Decision

### 1. One project, one repository

| Name | Meaning |
| --- | --- |
| Git host | The service that owns accounts, repositories, namespaces, and access rules. |
| Space | A view of a Git-host namespace and the projects visible within it. |
| Project | One Git repository, its working files, and its Spex records. |
| Home | The local Spex data directory, normally `~/.spex`, overridden by `SPEX_HOME`. |
| Spex server | The backend used by the desktop or browser, running locally or remotely. |

A Spex project and a Git-host project refer to the same repository.
Several worktrees are working copies of the same project.
A project may contain code, documents, spec packages, or only conversations.

A space groups projects; it is not itself a repository.
Personal and team access use the same model.
A contractor can receive one project without receiving its siblings.
Inherited namespace access still applies: a project needing fewer readers must use a namespace with suitable access.

Every repository reader can read its shared sessions, including their retained history.
A branch or hidden UI row does not make a session private.
Private work belongs in a separate project with the right access.
Before sharing, Spex shows the audience the Git host reports; public repositories make shared sessions public too.

### 2. The Git host decides; Spex does the work

The Git host owns roles, memberships, invitations, visibility, and branch rules.
Spex displays its native names and performs supported operations through its APIs as the signed-in user.
Spex needs no account database, role ladder, or copy of the membership system.

The normal setup is **sign in → choose a space → create or open a project**.
Spex creates the repository when needed, prepares record storage, and checks that synchronization works.
An existing repository URL is another way to open a project.
First launch creates a local default project, so conversations work before sign-in.
Connecting it later preserves its identity.

Source branches keep their existing review and protection rules.
Spex stores conversations on a dedicated branch, normally `spex-state`, created with its own history in the same repository.
For a new repository, Spex initializes the ordinary default branch first; the state branch never becomes the default.
It prepares that branch automatically and configures only the necessary branch permissions when the Git host authorizes the user to do so.
It never weakens source-branch protection to save a conversation.

If organization policy requires someone else's authority, setup remains pending and an authorized person can complete it inside Spex.
Ordinary users are not sent to edit Git settings.
Local work remains available while setup is pending; Spex cannot grant permission that the Git host refuses.
Native management links remain useful for administration, not a required setup step.

The integration needs:

- OAuth sign-in, account lookup, and secure credential storage; native clients use authorization code with PKCE [[1]].
- Repository discovery, including direct shares, stable IDs, and namespace details when visible.
- Repository creation and the native operations needed for sharing and storage setup.
- Actual branch write capability, policy failures, and native role and access information.
- Git reads and conditional pushes that preserve complete revisions.

Existing Git credentials also support opening a repository by URL when these APIs are unavailable.
Git receives tokens through a credential helper, never through remote URLs or logs.
Unsupported features are shown as such.
A stale list or failed connection never proves that a project was deleted or that access was revoked.
GitLab-specific roles, API mappings, and hosting-plan arrangements belong in its integration record, not this model [[2]] [[3]] [[4]].

### 3. Put each file beside what it describes

| Location | Contents |
| --- | --- |
| Working source branch | Project files, whole spec files, editable spec packages, `spex.yaml`, `spex.lock`, and `config/`. |
| State branch | `project.yaml`, sessions and their assets, runtime intent logs and their assets, and authoring conversations. |
| Home | State-branch worktrees, local project paths, sign-in credentials, preferences, runtime hints, leases, and caches. |
| Generated `.spex/` in each working tree | Installed spec-package views, skill exports, and reproducible builds; ignored by Git. |

The state branch is checked out separately under Home, so saving a session does not switch or dirty the user's source branch.
It contains only validated Spex records, not a copy of the working tree.
An existing branch is checked before use; unrelated contents are never overwritten.
Source files follow the project's ordinary commit and review workflow.
Spec decision and intent records stay with those source files.
Requests and locks travel with their source revision and are never duplicated on the state branch.

Each project owns its spec-package environment, as defined in the [companion proposal](codex-dr-package-format-and-environments.md).
A space has no files or commits, so it cannot own a lock directly.
A shared library is simply an ordinary project with spec-package requests and its own lock.
Opening another project never requires access to that library or to sibling projects.

Authoring conversations name their target spec package and artifact explicitly.
Generated specs and code remain project files when they cannot be reproduced from retained inputs.
Session records identify the working revision and environment used; uncommitted source is marked as such, not claimed to be backed up by session sync.
Secrets, provider hints, and leases stay local, even when a runtime places them beside portable session files.
Sharing includes captured conversation content and owned attachments, not just the visible messages.

### 4. Keep identity separate from names and paths

Git-host origin and stable IDs identify accounts, namespaces, and remote repositories.
The UUID in the state branch's `project.yaml` identifies a project before and after it gains a remote.
Once published, that marker also records the authoritative Git-host repository ID, changed only through explicit rebinding.
Local bindings connect that identity to worktrees and one authoritative remote.
Names and paths are labels, not evidence that two repositories are the same project.

Cloning, renaming, and transferring preserve identity.
Forking or independently copying creates a new project identity; copied markers are detected before synchronization.
Copied session history grants no authority to repeat or resume its work.
A remote replacement is an explicit rebind, never an automatic response to a missing repository.
Directly shared projects remain usable when the namespace's details are unavailable.

Home is not synchronized as a whole.
A local preference selects the default project for new work.
Desktop and terminal launches choose the project from an explicit selection or a registered working folder before writing the first message; otherwise they use the default project.
Changing a working folder never automatically moves existing session records to another project.
Other preferences select which projects contribute skills to this device; they neither merge configurations nor grant access.
Removing a local binding, signing out, clearing a cache, and deleting a remote project remain separate operations.
None silently discards unsent work.

### 5. Synchronize records without guessing

Each project's state branch synchronizes independently.
One Spex server serves a Home and coordinates its writers with the native session leases.
Sync waits for that project's active turns to finish and pauses its record writers; other projects keep working.
It saves a revision, fetches, and compares each complete record bundle with its common ancestor.
A bundle is a session with all owned files, an intent log with its assets, or an authoring conversation with its assets.
A remaining manifest is a whole-file unit.

If only one side changed, use that side.
If both made the same change, they agree.
If both changed differently, keep both revisions and ask the user to choose the complete bundle, including deletion conflicts.
Do not merge conversation text or concatenate intent logs.
Validate the result before applying it and push only if the remote still matches the revision checked [[5]].
Interrupted work is recovered before writers resume.

Network failures leave local revisions pending.
Confirmed loss of write access stops remote writes without deleting local work.
A read-only project still provides history; new local sessions are marked as not shared.
Revoking access cannot recall downloaded copies or erase shared Git history.
Moving a project changes its inherited audience; moving files alone does not remove earlier history.

History stays readable without an executable workflow or a working checkout.
Continuing a session still requires Playbook's runtime, path, and effect checks; synchronization cannot undo work already performed ([DR-045](specs/decisions/045-unified-session-storage.md)).
Local leases do not prevent another device from executing the same session.

## Consequences

Project sharing now matches the Git host exactly.
The separate state branch keeps frequent conversation saves out of source review while retaining one audience.
Its history still adds to repository storage and clone size.
There is no global environment or merged launcher configuration.

Acceptance requires successor decisions for project and storage rules ([DR-006](specs/decisions/006-projects-and-forge.md), [DR-036](specs/decisions/036-file-state-store.md), [DR-045](specs/decisions/045-unified-session-storage.md)), synchronization and setup ([DR-057](specs/decisions/057-space-surface.md), [DR-063](specs/decisions/063-space-setup-and-repair.md), [DR-064](specs/decisions/064-honest-remote-failure.md)), and authoring and configuration ([DR-058](specs/decisions/058-chat-assisted-playbook-authoring.md), [DR-080](specs/decisions/080-the-config-directory-is-named-config.md)).
Migration must copy only the selected project's records into its repository, preserving original backups without exposing unrelated history.
Acceptance checks must cover direct project sharing, automatic setup with protected source branches, blocked organization policy, offline work, concurrent saves, and cross-device history.

## References

[1]: https://www.rfc-editor.org/rfc/rfc8252 "OAuth 2.0 for Native Apps"
[2]: https://docs.gitlab.com/user/permissions/ "GitLab roles, inherited access, and branch permissions"
[3]: https://docs.gitlab.com/api/projects/ "GitLab project creation"
[4]: https://docs.gitlab.com/api/protected_branches/ "GitLab branch-policy API"
[5]: https://git-scm.com/docs/git-push "Git conditional pushes"
