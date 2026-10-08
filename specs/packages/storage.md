<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# storage: The Home and Its Spex Repositories

## Intent

This package defines Spex's data files under [DR-103](../decisions/103-the-home-and-its-groups.md): the home, the spex repositories cloned under it, the files each holds, the device-local files, the one-time migration from the former layout, and the whole-unit rules by which a spex repository's `spex` branch merges.
**Spex home** is the application data directory; paths below are relative to it.
A **spex repository** is a Git repository named `<name>-spex` holding the records of one project or one group on its `spex` branch; its **clone** lives under `workspace/`, and its **key** is the clone's path relative to `workspace/`, such as `acme/a-spex`, each segment spelled as the host spells its path — letters, digits, `.`, `_` and `-`, never starting with a dot — so a host's group or repository name is a key segment as it is.
A **working folder** is a folder on this device where a project's or a group's sessions run; a **project** is a working folder paired with a spex repository.
Playbook owns session files and recovery [[1]]; a **session bundle** consists of a manifest, its matching replay stream, and its owned asset directory, selected from one revision or deleted as a unit during Git synchronization.
**Closed** JSON objects permit only the declared fields; every file whose layout this package defines carries a `format` field naming its layout's version, and a reader refuses a `format` it does not know.

## External Behavior

### storage-1

The store shall persist core-owned data in Spex home using these locations:

- Spex home defaults to `~/.spex`; a nonempty `SPEX_HOME` selects another directory.

| Path | Contents | Git |
| --- | --- | --- |
| `workspace/<group>/` | a plain folder per group of the Git host, a subgroup's inside its parent's, named as on the host; one whose name ends in `-spex` is told from a clone by holding no `.git` and holding a folder named `<name>-spex` | — |
| `workspace/<group>/<name>-spex/` | the clone of one spex repository, on its `spex` branch | the clone |
| `<clone>/project.json` | the code's remote [[storage-3](#storage-3)], present when the spex repository is a project's | Tracked |
| `<clone>/config/playbook.config.yaml` | the spex repository's launcher configuration [[core-service-2](core-service.md#core-service-2)] | Tracked |
| `<clone>/spex.yaml`, `<clone>/spex.lock` | the environment's requests and lock [[environments-2](environments.md#environments-2)] [[environments-3](environments.md#environments-3)] | Tracked, one unit |
| `<clone>/intents/<id>.json`, optional `<clone>/intents/<id>.assets/` | one intent [[storage-4](#storage-4)] and its retained attachments [[media-4](media.md#media-4)] | Tracked, one unit |
| `<clone>/sessions/<id>.json`, `<clone>/sessions/<id>.records.jsonl`, optional `<clone>/sessions/<id>.assets/` | a Playbook session bundle [[1]] | Tracked, one unit |
| `<clone>/authoring/<id>.json`, `<clone>/authoring/<id>.records.jsonl`, optional `<clone>/authoring/<id>.assets/` | an authoring session [[storage-23](#storage-23)] | Tracked, one unit |
| `<clone>/packages/`, `<clone>/skills/` | installed spec packages and exported skills [[environments-8](environments.md#environments-8)] | Ignored |
| `<clone>/sessions/<id>.hints.json`, session leases, staging and atomic-write temporary files | provider hints and writer coordination [[1]] | Ignored |
| `<clone>/local/`, `<clone>/.spex-uploads/`, `<clone>/.spex-apply.json` | Playbook's own migration receipts, which may hold provider tokens; upload staging; the sync repair marker | Ignored |
| `home.yaml` | this device, the Git host, the account, and each working folder with its spex repository [[storage-2](#storage-2)] | — |
| `store/`, `cache/` | spec package bytes and caches [[environments-7](environments.md#environments-7)] | — |
| `local/prefs.json` | core preferences and viewed markers [[storage-5](#storage-5)] | — |
| `local/credentials.yaml` | the Git host's app token [[storage-19](#storage-19)] | — |
| `local/migrations/` | migration receipts and retained inputs [[storage-9](#storage-9)] | — |
| `local/former-home.git`, `local/forge-cache.json` | the former home's Git history kept aside [[storage-9](#storage-9)]; the rebuildable forge cache | — |
| `.lease/` | held by the one process serving this home [[storage-14](#storage-14)] | — |

- Only a clone is a Git work tree; the home itself is none, and nothing outside `workspace/` is ever committed.
- `local/` never leaves the device, and its credentials file has owner-only permissions.

### storage-2

The home file shall encode `home.yaml` as exactly `{format: 1, device, host, own, folders}`:

| Field | Content |
| --- | --- |
| `device` | a canonical lowercase UUID minted once for this device, keying what is acknowledged per device [[storage-5](#storage-5)] |
| `host` | `{url, clientId, account?, signedOut?}`: the Git host's URL, the public client id `spex`, once signed in `{id, login, displayName}` as the host reported them, and `signedOut` true once the credential was removed while the account is kept [[git-host-4](git-host.md#git-host-4)] |
| `own` | the folder name of your own group under `workspace/`, one key segment [[storage-1](#storage-1)]: this device's user name before sign-in, the account's login as the host spells it after [[storage-6](#storage-6)] |
| `folders` | an array of `{path, repository, aliases?}`: a normalized absolute working folder, the key of its spex repository, and optional former working directories recorded in its sessions |

- each path and each repository key appears at most once; a key names a clone under `workspace/`, so a group's own spex repository is paired like a project's;
- a folder whose clone is missing, and a clone no folder pairs, are reported as diagnostics [[storage-12](#storage-12)] without deleting either.

### storage-3

The project file shall encode `<clone>/project.json` as exactly `{format: 1, name, remote}`: the project's name, and the code's remote URL as the working folder's `origin` reported it, or `null` where the folder has none, a credential embedded in the URL never written [[space-5](space.md#space-5)].

### storage-4

The intent store shall encode each `<clone>/intents/<id>.json` as a closed JSON object with `format: 1` and exactly these fields, the file's name being the intent's canonical lowercase UUID `id` ([DR-103](../decisions/103-the-home-and-its-groups.md)):

| Field | Content |
| --- | --- |
| `id`, `text`, `createdAt` | the identity, the exact staged text, and the capture time in Unix milliseconds |
| `attachments` | optional ordered references into `intents/<id>.assets/` [[media-5](media.md#media-5)] |
| `source` | optional `{kind, ref, url, labels?}` provenance — issue, PR, record, or chat |
| `author` | optional `{login, displayName}` of the signed-in account that captured it |
| `dispatched` | optional `{sessionId, turnId, at}`, re-written by a later dispatch |
| `closed` | optional `{as: 'done' \| 'dropped', at}` |

- an intent holds no rank and no link to another intent: the next to run is the oldest queued one by `createdAt`, then by `id`;
- an edit, a dispatch and a close rewrite the file whole; a remove deletes the file and its asset directory;
- a malformed file is reported without deletion, and its intent is listed nowhere.

### storage-5

The preference store shall encode `local/prefs.json` as exactly `{format: 1, prefs: {...}}`, with these core preference values:

- each preference is a JSON value;
- `viewed:<sessionId>` stores the last viewed turn as a nonnegative integer and resets when that session's stored history changes;
- `sync:<repository>:last` stores the last completed in-app sync of that spex repository as `{at, sent, received}` — Unix milliseconds and unit counts;
- `sync:<repository>:noticed` records that this device's reader has seen the privacy notice before the first push into a spex repository with other members [[space-57](space.md#space-57)];
- `space:repair:<repair>` records that this device's reader declined to add a repair's project, keyed by the facts the repair names, so the repair stands in the list and counts as no issue here alone;
- `authoring:<id>:player` stores the roster player id answering that authoring session's conversation; absent means the Captain's block; removed with the session.
- `session:<id>:agents` stores that session's own agent settings as agent id — the reserved `captain`, or a roster player — to a model, a subagent model, an effort, a subagent effort and a fast mode, each a string, `false` for the provider's current default, or absent for the configured value [[core-service-100](core-service.md#core-service-100)]; browser access is a boolean override with omission inheriting the configured off-by-default setting [[media-9](media.md#media-9)]; absent means the session runs what the config resolves; removed with the session.
- `session:<id>:parked` stores what a run of that session standing parked on the Boss advertised at its last settlement — the park's reason, its actions and the shell's ending, each an id with its label and any standing the runtime reported [[core-service-32](core-service.md#core-service-32)]; absent means that settlement found no parked run advertising anything; the next settlement writes it again [[core-service-91](core-service.md#core-service-91)], and it is removed with the session.
- `language` stores the home's interface language as an offered language code [[core-service-108](core-service.md#core-service-108)]; absent means the reader's system ([DR-078](../decisions/078-the-interface-speaks-the-readers-language.md)).

### storage-19

The credential store shall encode `local/credentials.yaml` as exactly `{format: 1, hosts: {<url>: {access, accessExpiresAt, refresh}}}` with owner-only permissions: the app token the Git host issued to this device, its access secret with its expiry in Unix milliseconds, and its refresh secret, written at sign-in and at every refresh and removed at sign-out:

- no credential is written anywhere else, and no credential enters a tracked file or a remote URL [[space-5](space.md#space-5)].

### storage-6

When a working folder is added, the core shall pair it with a spex repository and record the pair in `home.yaml` [[storage-2](#storage-2)] ([DR-103](../decisions/103-the-home-and-its-groups.md)):

| Case | The spex repository |
| --- | --- |
| the reader picks one of the spex repositories the Git host lists whose `project.json` names the folder's remote [[space-58](space.md#space-58)] | cloned under `workspace/<group>/` from the host |
| the reader picks a group to create one in | created on the host, then cloned |
| no sign-in, or no pick | created locally under `workspace/<own>/<name>-spex/` with no remote, `<name>` being the folder's name, until the reader picks a group |

- a folder already paired selects its existing pair; a folder inside another working folder below its top level is refused;
- the clone's `project.json` is written with the folder's remote [[storage-3](#storage-3)], its `spex` branch created with the first commit on this device where the repository is new, and its environment requests the built-in spec package [[environments-11](environments.md#environments-11)];
- a session is a project's by the clone that holds it, never by matching its working directory; its recorded working directory decides only where it may continue [[core-service-73](core-service.md#core-service-73)];
- the rename of your own group's folder at sign-in [[space-59](space.md#space-59)] and a rename or transfer the host reports [[space-60](space.md#space-60)] move the clone and rewrite every pair naming it in one step.

### storage-7

Where a spex repository's clone holds `config/playbook.config.yaml`, the config loader shall read it as that spex repository's own, composing a session's configuration from your own group's file with the project's on top [[core-service-2](core-service.md#core-service-2)], so that a module location never stands in a shared file: playbooks come from the environment's lock [[environments-9](environments.md#environments-9)].

### storage-23

The authoring store shall encode `<clone>/authoring/<id>.json` as exactly `{format: 1, id, createdAt, touchedAt, package, queued, failures, compile?, proposal?}` and `authoring/<id>.records.jsonl` as newline-terminated `{seq, record}` objects in sequence order:

- `package` is the relative path, inside the working folder, of the spec package under development [[environments-10](environments.md#environments-10)]; `queued` is an array of `{text, attachments?}` content entries preserving ordered owned references [[media-5](media.md#media-5)]; `failures` a nonnegative integer; `compile` is `{at, by: 'boss' | 'agent', outcome: 'running' | 'ok' | 'failed' | 'canceled' | 'interrupted', phase?, output?, questions?, relay?: 'sent' | 'stopped' | 'queued', roles?, sourceSha256?}`; `proposal` is `{command, intent, players}`;
- timestamps use Unix milliseconds; no provider token enters either file; an incomplete final record line is not a record;
- the session with its records and assets is one unit [[storage-11](#storage-11)], shared with the spex repository like any session.

### storage-9

Before admitting writers to the groups layout, when the core finds the former layout — `projects.json` at the home's root and no `home.yaml` — migration shall complete once under the home lease [[storage-14](#storage-14)] with old writers stopped, and leave a receipt ([DR-103](../decisions/103-the-home-and-its-groups.md)):

1. Preserve the original bytes of every file it rewrites or moves under `local/migrations/<migrationId>/inputs/<n>`, with `receipt.json` encoded as `{format: 1, id, kind: 'groups', inputs: [{path, sha256}], steps: [], complete}`; a restart verifies completed outputs or retries incomplete work without overwriting divergent destinations.
2. Write `home.yaml` [[storage-2](#storage-2)] with `own` as this device's user name and one folder per entry of `projects.json` whose path `local/project-paths.json` records, keeping its aliases; an entry with no path becomes a repair the Groups surface lists [[space-46](space.md#space-46)].
3. For each project, make `workspace/<own>/<name>-spex/` a repository on a new `spex` branch with no history from the former home, replay its act log once into one file per intent [[storage-4](#storage-4)] — ranks and links dropped, a removed or never-worked dropped intent written nowhere — move its asset directory beside the intents, move the sessions whose working directory resolves to the project into its `sessions/`, write `project.json` [[storage-3](#storage-3)], request the built-in spec package [[environments-11](environments.md#environments-11)], and commit.
4. Make `workspace/<own>/<own>-spex/` your own group's repository the same way, moving `config/playbook.config.yaml` into it with every `playbooks.<id>.from` dropped and recorded in the receipt, and the sessions that resolve to no project into its `sessions/`.
5. Move `prefs.json` to `local/prefs.json` [[storage-5](#storage-5)], converting `space:lastSync` to no entry and `draft:<id>:player` to `authoring:<id>:player`; move the home's `.git`, where the home was a repository, to `local/former-home.git` unchanged, so the old remote is kept aside; leave `playbooks/<id>/` and `local/drafts/` in place, listed as retired.
6. Validate every output [[storage-12](#storage-12)] before setting the receipt's `complete` to true.

- an unknown `v` or `format` in an input is preserved unchanged and reported, never guessed or downgraded;
- no Git history is written before validation confirms session recovery fields contain no provider tokens;
- `meta.json` remains `{version: 1, importedLegacy?: string[]}` for completed legacy database imports.

### storage-17

When preparing a clone's Git rules before its first commit and before each sync, the store shall replace its managed rule blocks while preserving authored rules:

- `.gitignore` excludes `packages/`, `skills/`, every ignored family of the catalog [[storage-1](#storage-1)] and every unsupported session path; retried migration removes generated ignores for newly validated bundles;
- `.gitattributes` disables line-ending conversion for portable JSON/JSONL files;
- generated privacy and byte-preservation rules take precedence over authored exceptions, without accumulating stale blocks.

### storage-18

Where no home or session location is explicitly selected, when the ordinary default-home core starts, the core shall import `$XDG_STATE_HOME/playbook/sessions`, or `~/.local/state/playbook/sessions` when XDG is unset, through Playbook's guarded migration [[1]] into your own group's `sessions/` before indexing sessions ([DR-050](../decisions/050-shared-storage-cutover.md)):

- a different configuration file alone does not suppress discovery;
- original manifest/replay bytes are retained in destination receipts before validated conversion removes the source files; skipped inputs remain in place with their reasons reported.

### storage-10

The storage Git tool shall expose `plan`, `select`, `validate` and `rebind` through `node scripts/storage-git.mjs [--home path] --repository <key> <command>`, using `--home`, then nonempty `SPEX_HOME`, then `~/.spex` to select the home and `--repository` to select the clone:

- commands report JSON results on stdout; invalid arguments and refused operations report their cause on stderr and exit nonzero;
- Git transport and committing remain ordinary Git operations; local writers must stop for checkout, merge and mutating storage commands, and each session runs on at most one device at a time;
- this tool is the stopped-core path; the desktop and server app perform the same plan, validation and application in-process under the running core's lease, one spex repository at a time ([DR-103](../decisions/103-the-home-and-its-groups.md)).

### storage-20

When invoked as `plan <ours> <theirs>`, the storage Git tool shall report the resolved revisions, common ancestor and every unit choice [[storage-11](#storage-11)] of the selected clone without changing files or the Git index; the report names the ancestor and, where none exists, reports the revisions unrelated.

### storage-21

When invoked as `select [unit=ours|theirs ...]` during a Git merge, the storage Git tool shall apply the validated selection between `HEAD` and `MERGE_HEAD` in the selected clone under the home and session leases [[storage-14](#storage-14)]:

- reject unknown or duplicate choices, unresolved conflicts and choices contrary to an unambiguous comparison [[storage-11](#storage-11)];
- validate the complete candidate before applying files [[storage-12](#storage-12)]; validation failure leaves working files and index unchanged;
- write or delete each selected session's replay before its manifest, clear hints and viewed markers when its selected bundle differs from `HEAD`, and stage every selected path;
- report filesystem failures without claiming success; retrying selection repairs an interrupted application before reopening.

### storage-22

When invoked as `validate`, the storage Git tool shall reserve the home and validate the selected clone [[storage-12](#storage-12)] without staging or changing file contents; and when invoked as `rebind <key> <path> [--alias path ...]`, it shall pair the spex repository with the working folder under the home lease [[storage-6](#storage-6)], the destination a folder on this device, supplied aliases replacing the alias list and omitted ones preserving it, the result including the pair and the remaining storage diagnostics.

### storage-11

When selecting stored data during a Git merge of a spex repository's `spex` branch, the validator shall compare both pre-merge revisions with their common ancestor:

- compare complete file bytes and existence;
- treat the manifest, matching replay stream, and owned assets as one session bundle [[1]]; each `intents/<id>.json` with its `intents/<id>.assets/` as one unit; each `authoring/<id>.json` with its records and assets as one unit; `spex.yaml` with `spex.lock` as one unit; and `config/playbook.config.yaml`, `project.json` and each other tracked file as a separate unit.

| Comparison | Selection |
| --- | --- |
| Neither side changed, or both agree | Agreed bytes or deletion |
| Exactly one side changed | That side's entire unit or deletion |
| Both changed differently | Explicit choice of the entire unit from either branch, even after a clean text merge |

- absence means deletion; a present bundle requires every owned file of the unit from the same selected revision, never mixed generations;
- an intent added on one side is never a conflict, because its file exists on that side alone;
- an unresolved choice refuses selection; revisions with no common ancestor refuse selection unless the caller explicitly joins them, whereupon the empty tree is the ancestor and every unit present on both sides differently is an explicit choice;
- unselected history remains recoverable from Git, but its intents and settings leave current state;
- hunk-level preferences, record concatenation and automatic unions do not satisfy this contract.

### storage-12

Before reopening selected state, the validator shall validate the complete selected tree of a clone without modifying file contents, after Playbook's preparation removes excess permissions from verified user-owned session entries and refuses unsafe paths [[1]]:

- file formats and closed encodings are valid [[storage-2](#storage-2)] [[storage-3](#storage-3)] [[storage-4](#storage-4)] [[storage-5](#storage-5)] [[storage-23](#storage-23)] [[1]];
- open artifact-source identities are unique within a spex repository [[core-service-42](core-service.md#core-service-42)], and dispatch targets still present belong to the same spex repository with valid turn boundaries;
- deleted session targets retain the existing ledger re-derivation behavior [[core-service-70](core-service.md#core-service-70)]; a missing session alone is not permission to discard a verdict or repeat work;
- a clone no folder pairs, and a folder whose clone is missing, are reported with their records unlisted, without blocking unrelated valid spex repositories or automatically pairing anything;
- two spex repositories holding an authoring session of one id are reported without blocking, naming both and the id, the one whose key sorts first kept [[storage-23](#storage-23)];
- incompatible modules or unsupported checkpoint relocation permit history only;
- invalid session data blocks that session's execution and recovery, preserving lease-checked deletion; an invalid intent file blocks that intent alone;
- invalid shared files block operations that require them; diagnostics name the failing file and reason, while startup, unrelated valid spex repositories and independent configuration or preference edits remain available;
- a config whose playbook cannot be loaded — the environment lacking it, or its module older than the toolchain — is reported without blocking, the validator telling that case by the failure's kind rather than by its reason's words, so the reason's language decides nothing.

### storage-13

When continuing after Git selection, the host shall require Playbook's repository/effect reconciliation [[1]] before any external action, preserving unresolved evidence because selecting or deleting history cannot undo executed work.

### storage-14

The core shall remain the sole writer of Spex-owned files, using atomic same-directory replacement under the Spex home lease at `.lease/` [[core-service-61](core-service.md#core-service-61)], while session mutations use Playbook's per-session lease and shared store [[1]], one shared store per spex repository's `sessions/`.

## Verification

### storage-15

When an integration suite migrates a former-layout home of two projects and one unmatched session with writers stopped and opens it through desktop and CLI, it shall verify:

- default and explicitly selected locations, and that nothing outside `workspace/` is a Git work tree afterwards [[storage-1](#storage-1)];
- `home.yaml` carrying this device's user name as `own` and both folders with their aliases [[storage-2](#storage-2)] [[storage-9](#storage-9)];
- each project's clone on a `spex` branch with one commit, its `project.json` naming the folder's remote, one file per open or worked intent with ranks and links dropped, its asset directory beside them, and its sessions inside [[storage-3](#storage-3)] [[storage-4](#storage-4)] [[storage-9](#storage-9)];
- your own group's clone holding the configuration with every `from` dropped and the unmatched session, the receipt naming the dropped entries [[storage-9](#storage-9)];
- preferences moved with their viewed markers and session tuning, the former home's `.git` kept aside, the retired library folder in place [[storage-5](#storage-5)] [[storage-9](#storage-9)];
- a working folder added afterwards paired with a local spex repository that requests the built-in spec package, and sessions listed by the clone that holds them [[storage-6](#storage-6)];
- a project's configuration composed on top of your own group's [[storage-7](#storage-7)];
- restart-safe migration and token-free Git ancestry [[storage-9](#storage-9)];
- refreshed Git rules after a migration retry [[storage-17](#storage-17)];
- ordinary-default discovery into your own group's sessions, retained inputs and explicit-location isolation [[storage-18](#storage-18)];
- exact authoring session and credential encodings written and read back, the credentials file owner-only [[storage-23](#storage-23)] [[storage-19](#storage-19)].

### storage-16

When an integration suite merges two real Git branches of one spex repository containing sessions, intents, an authoring session and an environment, it shall verify:

- command results and refusals through the documented entry point with `--repository` [[storage-10](#storage-10)];
- an unchanged index after planning and refused selection, followed by staged complete choices [[storage-20](#storage-20)] [[storage-21](#storage-21)];
- stopped writers and reopening after a real Git checkout with umask `022`, and the pair restored through the rebind command [[storage-22](#storage-22)];
- every whole-unit choice, including clean text merges and deletion; an intent added on each side present on both afterwards with no choice asked; the environment unit and the empty-ancestor join [[storage-11](#storage-11)] [[storage-20](#storage-20)];
- reports of unpaired clones and folders, and rejection of duplicate sources, invalid dispatches and damaged bundles [[storage-12](#storage-12)]; a config naming a playbook the environment lacks is reported as a nonblocking diagnostic whether the core speaks English or Chinese [[storage-12](#storage-12)];
- no repetition of actions omitted from selected history [[storage-13](#storage-13)];
- leases blocking competing writes, one session store per spex repository [[storage-14](#storage-14)].

### storage-24

When an integration suite opens a store on a home whose group folders bear names ending in `-spex` — another group, a subgroup, and your own group — it shall verify:

- each clone beneath them, one not yet a Git repository among them, listed by its own key, such as `my-spex/my-spex-spex`, and no group folder listed or written into [[storage-1](#storage-1)];
- your own group so named listing its own spex repository `<own>/<own>-spex` on every open [[storage-1](#storage-1)] [[storage-2](#storage-2)].

### storage-25

When an integration suite starts the core on a home whose two spex repositories each hold an authoring session of one id, it shall verify:

- one nonblocking diagnostic among the home's diagnostics, naming both spex repositories and the id [[storage-12](#storage-12)];
- the session of the spex repository whose key sorts first opening, and the other's refused as no such session [[storage-12](#storage-12)].

## References

[1]: https://github.com/sublang-ai/playbook/blob/main/specs/packages/session-storage.md "Shared Playbook session storage"
