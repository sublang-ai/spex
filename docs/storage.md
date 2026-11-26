<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# The `~/.spex` catalog

**Spex home** is the desktop and CLI data directory.
It defaults to `~/.spex`; `SPEX_HOME` selects another directory.
All paths below are relative to Spex home.
A **spex repository** holds the records of one project or your personal settings and sessions on its `spex` branch; its clone lives under `workspace/`, and its **key** is the clone's path relative to `workspace/`.
A spex repository at an instance lies under that instance's folder, `@<host>` with `_<port>` after it where the instance's origin names a port or is `http`, at its path there: `workspace/@spex.sublang.ai/alice/a-spex/`, key `@spex.sublang.ai/alice/a-spex`.
Your personal folder, `workspace/<own>/`, holds your personal records and local project clones. When you sync a project to a Space, its clone moves under the instance folder, once any active session releases it.
A **project** is a working folder on this device paired with a spex repository; your global records repository, `workspace/<own>/<own>-spex/`, holds your settings and the sessions that belong to no project.
The home itself is not a Git repository; only clones are.

## File catalog

A **session bundle** is every file of `sessions/` named for one session: its manifest file and the files under its replay, blob and asset folders.
Synchronization selects that complete bundle from the same revision or deletes it; it never merges its parts independently.
Git does not enforce this relationship.

Ignored files can contain durable local state.

| Path | Contents | Git |
| --- | --- | --- |
| `home.yaml` | This device's id, the instance it was created with, every instance it has signed in to with its account (the first is the default), your personal folder name, and each working folder with its spex repository and recorded `cwd` aliases. | Outside any clone |
| `<clone>/project.json` | The project's name and its code's remote URL. | Tracked |
| `<clone>/placements/<folder>.yaml` | One placement of the spex repository at an instance, named by that instance's folder: the instance's origin and the host's id for the repository there. | Tracked |
| `<clone>/config/playbook.config.yaml` | In your global records repository, the global config: the Captain, your players and the playbook entries every project uses; in a project's clone, only playbook entries, naming each role's player by name. | Tracked |
| `<clone>/spex.yaml`, `<clone>/spex.lock` | The global environment's requests and lock. A project's stand at its working folder's root, committed with its code; the app moves them there from a project's clone once. | Tracked, one unit |
| `<clone>/intents/<id>.json` | One intent: text, capture time, attachments, source, dispatch and close. | Tracked |
| `<clone>/intents/<id>.assets/` | Immutable uploaded files retained by that intent. | Tracked with its intent |
| `<clone>/sessions/<id>.json` | Schema-9 manifest file: the whole logical manifest and the replay prefix it binds, replaced atomically. | Tracked |
| `<clone>/sessions/<id>.replay/`, `<clone>/sessions/<id>.blobs/` | Append-only replay segments, and values past the 8 MiB per-file bound. | Tracked with the complete session bundle |
| `<clone>/sessions/<id>.assets/` | Immutable accepted input, observed media and deferred tool details. | Tracked with its session bundle |
| `<clone>/authoring/<id>.json`, `.records.jsonl`, `.assets/` | An authoring session: its queue, compile state, transcript and owned files. | Tracked, one unit |
| `<clone>/sessions/<id>.hints.json` | Provider resume tokens for the current checkpoint. | Ignored |
| `<clone>/.legacy-sessions/` | The earlier-format files of sessions Playbook's conversion command converted. | Ignored |
| `<clone>/.spex/` | The global environment's installed spec packages, generated skills and install record, rebuilt from `spex.lock`. A project's stand under its working folder's `.spex/`, which Git ignores. | Ignored |
| `<clone>/.spex-apply.json`, `<clone>/.spex-uploads/` | An interrupted in-app sync's marker; private upload staging. | Ignored |
| `store/`, `cache/` | A cache of verified spec package files by content digest, which every environment on the device copies its installed files from, and rebuildable caches such as fetched Git sources. | Outside any clone |
| `playbooks/<id>/` | A former home's library, kept until spec packages replace it. | Outside any clone |
| `local/prefs.json` | Core preferences, including the last viewed turn per session. | Never leaves the device |
| `local/credentials.yaml` | The app token each instance issued to this device, by the instance's origin, owner-only; removed at sign-out. | Never leaves the device |
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

The logical **manifest** stores recovery state: the checkpoint, journal, unresolved work and effect ledger used to reconcile external actions.
Playbook 20 stores it whole in the session's manifest file beside an append-only replay log; a value past 8 MiB moves into the session's blob parts, so no file passes that bound, without truncating history or recovery evidence.
Asset files keep their separate attachment limits.
This bounds individual runtime files, not total retained disk space or the memory required to hydrate a session.
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
Tracked `.gitignore` rules exclude local data; `.gitattributes` disables line-ending conversion for JSON/JSONL files, every file under `sessions/` and asset directories.

The app's Space surface syncs each spex repository's `spex` branch with the remote of each of its placements in turn, one spex repository at a time, without stopping the core, and never text-merges a file.
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

With the session lease held, delete replay, blobs, hints, assets and derived session state, then the manifest last.
Interrupted cleanup is retryable; incomplete bundles cannot continue.
Deletion fails if another writer is active or exclusive ownership cannot be proven.
Retired lease directories remain so delayed stale-lock recovery cannot affect a new owner.
If one side deletes a session and another modifies it, synchronization requires an explicit choice between deletion and the complete modified bundle.

Removing a project forgets its pair and deletes its clone, asking a second confirmation while the clone holds records that no placement holds, as the clone last fetched or pushed it or at their last shared commit; the working folder is left untouched.
Replacing session history resets its last-viewed turn.
Local preferences and migration records never leave the device; caches are rebuildable.

## External data

Project repositories and their effect claims, installed runtimes, provider credentials/history and browser profiles remain external.
Layout preferences stay in browser storage.
Unsaved drafts and access tokens are not portable session state.

## Migration and definitions

### Converting earlier sessions

This release reads sessions only in Playbook 20's format, schema 9.
A session saved by an earlier release — schema 8 chunks or a schema 7 manifest — is listed as an older conversation that cannot be opened, and its files stay as they are.
A clone that tracks one cannot sync until it is converted.
On each device that shares the home:

1. Quit Spex, and every other app, server or Playbook CLI using the home.
2. Upgrade them all to releases on Playbook 20.
3. Convert the home's sessions, its root `sessions/` and every clone's, with Node.js 20.6 or later:

   ```sh
   npx @sublang/playbook@20 sessions upgrade --recursive ~/.spex --dry-run
   npx @sublang/playbook@20 sessions upgrade --recursive ~/.spex
   ```

   Use your `SPEX_HOME` in place of `~/.spex` where you set one.
   The first command lists what it would convert; the second converts each session after checking that its manifest and replay are unchanged, and keeps the former files in the clone's `.legacy-sessions/`, which never syncs.
   A session another writer holds is skipped; run the command again once it is free.
4. Start Spex and sync.

Conversion does not rewrite old Git commits or remove oversized blobs from prior history.

A home in the former layout — `projects.json` at its root and no `home.yaml` — migrates once at startup under the home lease:
each project becomes `workspace/<own>/<name>-spex/` with one file per open or finished intent, its intent attachments and the sessions that ran in its folder;
your global records repository receives the settings, with every `playbooks.<id>.from` dropped, and the remaining sessions;
preferences move to `local/prefs.json`, and the former home's `.git` moves to `local/former-home.git`, keeping the old remote aside.
Original bytes stay under `local/migrations/<id>/inputs/` with a receipt; an interrupted migration resumes on the next start.
Sessions the Playbook CLI saves in the home's root `sessions/`, its default, are retained by a separate receipt-backed stage and transferred whole into the matching clone, or your global records repository when no working folder matches, before writers are admitted.
The first write that saves a Space's reported Git address changes `home.yaml` from format 2 to format 3.
Spex uses the saved address after restart, including while the Space is signed out.

A home whose `home.yaml` names one instance in format 1 takes format 2 once at startup under the home lease, its instance written as its origin and its app token re-keyed to that origin in the same step, with a receipt beside the earlier layout receipt; an older Spex refuses the migrated home.
In the same migration every clone at that instance moves under its folder, each by one rename with its pair, sync preferences and forge cache entry following: one recording the host's id at its path there with its remote renamed to the folder, any other outside your personal folder at its key keeping its remote; your global records repository renames its remote and keeps its folder, and the projects never shared stay.
A clone a live session's lease holds keeps its key and remote, named in the receipt, until its next sync or the next start moves it.
This release no longer imports the former CLI session directory, `$XDG_STATE_HOME/playbook/sessions`, or desktop session sidecars, and leaves their files unchanged; open a home still holding them once with an earlier release, which imports them, then convert it.
Legacy provider tokens cannot become usable hints because their checkpoint binding is unproven.

[DR-103](../specs/decisions/103-the-home-and-its-groups.md) records the layout;
[DR-104](../specs/decisions/104-spec-package-format-and-client-environments.md) records spec packages and environments;
[DR-045](../specs/decisions/045-unified-session-storage.md) records the shared session store, and [DR-254](../specs/decisions/254-sessions-are-a-manifest-and-a-replay-log.md) its current layout and conversion.
Exact formats and behavior are defined by their owning packages:

| Owner | Definition |
| --- | --- |
| Spex | [Home files, spex repositories, migration and Git selection](../specs/packages/storage.md) |
| Spex | [Environments: requests, locks, the store and installs](../specs/packages/environments.md) |
| Spex | [Sign-in, the app token and the Git credential helper](../specs/packages/git-host.md) |
| Playbook | [Session format, context, hints and recovery](https://github.com/sublang-ai/playbook/blob/main/specs/packages/session-storage.md) |
| Cligent | [Definite provider session rejection](https://github.com/sublang-ai/cligent/blob/main/specs/packages/engine.md#engine-84) |
