<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# The `~/.spex` catalog

**Spex home** is the desktop and CLI data directory.
It defaults to `~/.spex`; `SPEX_HOME` selects another directory.
All paths below are relative to Spex home.
A **spex repository** holds the records of one project or one group on its `spex` branch; its clone lives under `workspace/<group>/<name>-spex/`, and its **key** is that path relative to `workspace/`, such as `alice/a-spex`.
A **project** is a working folder on this device paired with a spex repository; your own group's spex repository, `workspace/<own>/<own>-spex/`, holds your settings and the sessions that belong to no project.
The home itself is not a Git repository; only clones are.

## File catalog

A **session bundle** is one session's manifest, matching replay stream, and referenced immutable assets.
Synchronization selects that complete bundle from the same revision or deletes it; it never merges its parts independently.
Git does not enforce this relationship.

Ignored files can contain durable local state.

| Path | Contents | Git |
| --- | --- | --- |
| `home.yaml` | This device's id, the Git host, your own group's folder name, and each working folder with its spex repository and recorded `cwd` aliases. | Outside any clone |
| `<clone>/project.json` | The project's name and its code's remote URL. | Tracked |
| `<clone>/config/playbook.config.yaml` | Your own group's Captain, player and playbook settings; in a project's clone, only the playbooks it enables and the player each role uses. | Tracked |
| `<clone>/spex.yaml`, `<clone>/spex.lock` | The environment's requests and lock. | Tracked, one unit |
| `<clone>/intents/<id>.json` | One intent: text, capture time, attachments, source, dispatch and close. | Tracked |
| `<clone>/intents/<id>.assets/` | Immutable uploaded files retained by that intent. | Tracked with its intent |
| `<clone>/sessions/<id>.json` | Schema-7 manifest: identity, `cwd`, checkpoint and recovery evidence. | Tracked |
| `<clone>/sessions/<id>.records.jsonl` | Captain/player records, historical settings, role bindings, graphs and media references. | Tracked |
| `<clone>/sessions/<id>.assets/` | Immutable accepted input, observed media and deferred tool details. | Tracked with its session bundle |
| `<clone>/authoring/<id>.json`, `.records.jsonl`, `.assets/` | An authoring session: its queue, compile state, transcript and owned files. | Tracked, one unit |
| `<clone>/sessions/<id>.hints.json` | Provider resume tokens for the current checkpoint. | Ignored |
| `<clone>/packages/`, `<clone>/skills/` | The environment's installed spec packages and the skills exported from them, rebuilt from `spex.lock`. | Ignored |
| `<clone>/.spex-apply.json`, `<clone>/.spex-uploads/` | An interrupted in-app sync's marker; private upload staging. | Ignored |
| `store/`, `cache/` | Spec package files by content digest, shared by every environment on the device, and rebuildable caches such as fetched Git sources. | Outside any clone |
| `playbooks/<id>/` | A former home's library, kept until spec packages replace it. | Outside any clone |
| `local/prefs.json` | Core preferences, including the last viewed turn per session. | Never leaves the device |
| `local/credentials.yaml` | The app token the Git host issued to this device, owner-only; removed at sign-out. | Never leaves the device |
| `local/forge-cache.json` | Rebuildable issue and pull-request cache. | Never leaves the device |
| `local/migrations/<id>/` | Migration receipts and original inputs. | Never leaves the device |
| `local/former-home.git` | The former home's Git history, kept aside unchanged. | Never leaves the device |
| `.lease/`, `<clone>/sessions/.<id>.lock/`, staging and retired lease directories | Exclusive writer ownership and safe stale-lock recovery. | Ignored |
| Atomic-write temporary files | Pending file replacements. | Ignored |

Spex owns application data; Playbook owns session validation, migration, continuation and deletion.
A session belongs to the spex repository whose clone holds it; its recorded `cwd` decides only where it may continue.
One core serves each Spex home; one writer owns each session.
Writes require the corresponding lease.

## Session contents

The **manifest** stores recovery state: the checkpoint, journal, unresolved work and effect ledger used to reconcile external actions.
Recovery evidence is durable before external actions run, independently of transcript writes.
The checkpoint identifies an exact replay prefix by sequence and digest.
Its state is `settled`, `uncertain` or `history-only`; transcript completeness alone does not establish safe continuation.

A turn is marked `uncertain` before execution; each step's start and result are saved before the next transition, and a turn stopped after a save settles at that position.
If its writer stops first, desktop or CLI requires explicit recovery:

- **Restore** reconciles completed work, restores the saved position and reports what was recorded; nothing is repeated and the saved input is not run again.
- **Discard** is offered only when nothing was recorded — no step, no abandonment, unchanged repository evidence — and restores the preceding checkpoint; a fresh session with no settled checkpoint may be removed.

Neither action authorizes repeating completed effects or erasing unresolved evidence.

The **replay stream** contains Captain/player records, including hidden records, and immutable execution context: participants, settings, role bindings and state-machine definitions.
Events and checkpoints reference that context, allowing recorded graphs to render without installed playbook modules.
When a host has no graph definition, history shows only observed states and transitions.
Summaries and usage are derived from records; current activity comes from the session's writer.
Valid unknown record kinds and headerless legacy records are not corruption.
Unsupported recovery versions allow history viewing and deletion, but no continuation; older writers preserve their bytes.

**Provider hints** are local resume tokens bound to one participant and the exact manifest bytes.
A hint is deleted and the deletion synced before use; replacement hints are written only after the resulting checkpoint.
This prevents stale reuse after a crash or rollback.
Missing hints start fresh conversations from the Captain's journal or the player's complete task prompt.
Definite rejection before execution permits one fresh attempt; ambiguous failures never retry automatically.
Provider-only knowledge is unavailable, while pending operations retain their player identity and effect evidence.

## Attachments and figures

Before upgrading a shared home to asset-bearing sessions, stop older desktop, server, and Playbook CLI writers and update them to compatible releases.
Legacy history remains readable, but an older writer is not authorized to rewrite the new asset-bearing format.

Input records preserve exact user text beside ordered content references.
The session receives its own verified copy before a submission is accepted;
deleting it does not delete the project intent's independent copy.
References identify bytes by SHA-256, with display names and MIME types
retained per use. Native media and large tool details are stored before
records refer to them. Missing or changed content is reported as unavailable
and cannot be silently replaced by a changed source file.
Agent-written Markdown paths and remote URLs are not imported as assets.

## Git synchronization

Each clone tracks portable files only; provider tokens never enter recovery fields that Git sees.
Tracked `.gitignore` rules exclude local data; `.gitattributes` disables line-ending conversion for JSON/JSONL files and asset directories.

The app's Groups surface syncs each spex repository's `spex` branch with its host remote, one spex repository at a time, without stopping the core, and never text-merges a file.
Signed in, Spex asks the Git host for a short-lived Git credential before each transport to the host's Git origin and hands it to Git through its own credential helper, run on the app's runtime, in a file only you can read that is removed when Git ends; it never enters a remote URL.
A transport to any other remote, and a fetch of a spec package from a Git repository elsewhere, uses this device's own Git and its credentials.
The command-line path stops local writers of that spex repository during its commit, checkout and merge; the [Git workflow](storage-git.md) gives the selection and validation commands.
Run each session on at most one device at a time; leases are local.

Compare each unit in both pre-merge revisions with the common ancestor:

| Changes | Selection |
| --- | --- |
| Neither side changed, or both agree | Agreed unit or deletion |
| Only one side changed | That unit or deletion |
| Both changed differently | Explicit whole-unit choice from either side |

A unit is a session bundle, an intent with its assets, an authoring session, the environment's two files, or any other single file.
The unit rule applies even after a clean text merge; an intent added on either side never conflicts.
Unselected changes leave active state but remain recoverable from Git history.

Before reopening, validate the selected files for duplicate open intent sources, unreadable intents or authoring sessions, settings a project may not hold, and invalid session/turn references.
Before continuing, reconcile repository state and completed external actions with the selected checkpoint.
Git selection cannot undo actions recorded only in the unselected history.

Reopening tightens verified user-owned session directories to `0700` and files to `0600` before strict validation; unsafe paths are rejected.
Use `umask 077` for Git writes to prevent exposure before reopening.

## Cross-device continuation

Pair each spex repository with its working folder on this device in `home.yaml`, with aliases for the working directories its sessions recorded elsewhere.
A clone no folder pairs and a folder whose clone is missing are reported as repairs, never deleted.
A session continues only in the folder it ran in, or one aliased to it; elsewhere its history stays readable.

Aliases associate history with a folder; they do not authorize checkpoint relocation.
**Schema 7 does not relocate checkpoint paths.**
Different repository or module paths permit history only, even with fresh provider conversations.
Matching paths still require compatible runtimes and repository/effect reconciliation.

## Deletion

With the session lease held, delete replay, hints, assets, any active legacy sidecar and derived session state, then the manifest last.
Interrupted cleanup is retryable; incomplete bundles cannot continue.
Deletion fails if another writer is active or exclusive ownership cannot be proven.
Retired lease directories remain so delayed stale-lock recovery cannot affect a new owner.
If one side deletes a session and another modifies it, synchronization requires an explicit choice between deletion and the complete modified bundle.

Removing a project forgets its pair and deletes its clone, asking a second confirmation while the clone holds records that have not reached the host; the working folder is left untouched.
Replacing session history resets its last-viewed turn.
Local preferences and migration records never leave the device; caches are rebuildable.

## External data

Project repositories and their effect claims, installed runtimes, provider credentials/history and browser profiles remain external.
Layout preferences stay in browser storage.
Unsaved drafts and access tokens are not portable session state.

## Migration and definitions

Before upgrading, stop legacy writers and snapshot both `~/.spex` and `$XDG_STATE_HOME/playbook` (or `~/.local/state/playbook` when XDG is unset).
A home in the former layout — `projects.json` at its root and no `home.yaml` — migrates once at startup under the home lease:
each project becomes `workspace/<own>/<name>-spex/` with one file per open or finished intent, its intent attachments and the sessions that ran in its folder;
your own group's spex repository receives the settings, with every `playbooks.<id>.from` dropped, and the remaining sessions;
preferences move to `local/prefs.json`, and the former home's `.git` moves to `local/former-home.git`, keeping the old remote aside.
Original bytes stay under `local/migrations/<id>/inputs/` with a receipt; an interrupted migration resumes on the next start.
Default-home startup also imports the former CLI session directory into your own group's spex repository.
Skipped files remain in place with their reasons reported.
Use `playbook migrate-session <id>` to migrate a session in an explicitly configured store; `--with <path>` selects configuration files.
CLI schemas 2–5 and desktop checkpoints without compatible recovery data remain history only.
Legacy provider tokens cannot become usable hints because their checkpoint binding is unproven.

[DR-103](../specs/decisions/103-the-home-and-its-groups.md) records the layout;
[DR-104](../specs/decisions/104-spec-package-format-and-client-environments.md) records spec packages and environments;
[DR-045](../specs/decisions/045-unified-session-storage.md) records the shared session store.
Exact formats and behavior are defined by their owning packages:

| Owner | Definition |
| --- | --- |
| Spex | [Home files, spex repositories, migration and Git selection](../specs/packages/storage.md) |
| Spex | [Environments: requests, locks, the store and installs](../specs/packages/environments.md) |
| Spex | [Sign-in, the app token and the Git credential helper](../specs/packages/git-host.md) |
| Playbook | [Session format, context, hints and recovery](https://github.com/sublang-ai/playbook/blob/main/specs/packages/session-storage.md) |
| Cligent | [Definite provider session rejection](https://github.com/sublang-ai/cligent/blob/main/specs/packages/engine.md#engine-84) |
