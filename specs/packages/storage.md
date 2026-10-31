<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# storage: The Home and Its Spex Repositories

## Intent

This package defines Spex's data files under [DR-103](../decisions/103-the-home-and-its-groups.md), [DR-127](../decisions/127-a-home-signed-in-to-several-instances.md) and [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md): the home and the instances it signs in to, the spex repositories cloned under it and the instances each is placed at, the files each holds, the device-local files, the one-time migrations from the former layout, of a project's environment into its working folder and of a one-instance home into a folder per instance, and the whole-unit rules by which a spex repository's `spex` branch merges.
**Spex home** is the application data directory; paths below are relative to it.
An **instance** is a Git host the home signs in to — a Spex Space instance, whose groups and spex repositories a person sees there — known by its origin.
A **spex repository** is a Git repository named `<name>-spex` holding the records of one project or one group on its `spex` branch; its **clone** lives under `workspace/`, and its **key** is the clone's path relative to `workspace/`, such as `@spex.sublang.ai/acme/a-spex` under an instance's folder or `alice/alice-spex` under your own group's folder, each segment past an instance's folder spelled as the host spells its path — letters, digits, `.`, `_` and `-`, never starting with a dot — so a host's group or repository name is a key segment as it is, and none begins with the `@` that begins an instance's folder.
A **placement** of a spex repository is a host repository holding it at one instance, in a group or a namespace there, or the one remote the reader names, which has no instance; its clone holds each as a remote, at most one per instance, and its **first placement** is the first with an instance in the order they were added [[storage-34](#storage-34)].
A **working folder** is a folder on this device where a project's or a group's sessions run; a **project** is a working folder paired with a spex repository.
Playbook owns session files and recovery [[1]]; a **session bundle** consists of Playbook's versioned root, replay descriptor and session-owned immutable chunks, or its legacy manifest and replay stream, with its owned asset directory, selected from one revision or deleted as a unit during Git synchronization.
**Closed** JSON objects permit only the declared fields; every file whose layout this package defines carries a `format` field naming its layout's version, and a reader refuses a `format` it does not know.

## External Behavior

### storage-1

The store shall persist core-owned data in Spex home using these locations:

- Spex home defaults to `~/.spex`; a nonempty `SPEX_HOME` selects another directory.

| Path | Contents | Git |
| --- | --- | --- |
| `workspace/@<host>/` | an instance's folder, holding the spex repositories keyed under that instance [[storage-31](#storage-31)] | — |
| `workspace/@<host>/<group>/`, `workspace/@<host>/<login>/` | a plain folder per group at that instance, a subgroup's inside its parent's, named by the group's path in the instance ([DR-120](../decisions/120-the-instance-is-the-space.md)), and per account whose namespace there holds a spex repository — yours or another's — named by its login there | — |
| `workspace/@<host>/<path>/<name>-spex/` | the clone of one spex repository keyed under that instance by its first placement [[storage-31](#storage-31)], `<path>` being that placement's group's path or its namespace's login there, on its `spex` branch | the clone |
| `workspace/<own>/` | your own group's folder, the home's own and outside every instance's folder [[storage-2](#storage-2)] | — |
| `projects/@<host>/<group path>/<name>/` | on a seat, the working folder the core allocates for a project [[space-103](space.md#space-103)], a clone of its code | the code's own work tree |
| `workspace/<own>/<own>-spex/`, `workspace/<own>/<name>-spex/` | the clone of your own group's own repository, and of each local-only spex repository [[storage-6](#storage-6)], on its `spex` branch | the clone |
| `<clone>/project.json` | the code's remote [[storage-3](#storage-3)], present when the spex repository is a project's | Tracked |
| `<clone>/placements/<folder>.yaml` | the spex repository's placement at the instance whose folder `<folder>` is [[storage-36](#storage-36)] | Tracked, one unit each |
| `<clone>/config/playbook.config.yaml` | the spex repository's launcher configuration [[core-service-2](core-service.md#core-service-2)] | Tracked |
| `<clone>/spex.yaml`, `<clone>/spex.lock` | the requests and lock of a group's own environment [[environments-2](environments.md#environments-2)] [[environments-3](environments.md#environments-3)]; a project's are at its working folder's root [[environments-26](environments.md#environments-26)], a clone of the former placement holding them until the migration moves them [[storage-24](#storage-24)] | Tracked, one unit |
| `<clone>/intents/<id>.json`, optional `<clone>/intents/<id>.assets/` | one intent [[storage-4](#storage-4)] and its retained attachments [[media-4](media.md#media-4)] | Tracked, one unit |
| `<clone>/sessions/<id>.json`, `<clone>/sessions/<id>.replay.json`, `<clone>/sessions/<id>.chunks/`, legacy `<clone>/sessions/<id>.records.jsonl`, optional `<clone>/sessions/<id>.assets/` | a Playbook session bundle, read and validated through its hydrated API [[1]] ([DR-144](../decisions/144-bounded-session-storage.md)) | Tracked, one unit |
| `<clone>/authoring/<id>.json`, `<clone>/authoring/<id>.records.jsonl`, optional `<clone>/authoring/<id>.assets/` | an authoring session [[storage-23](#storage-23)] | Tracked, one unit |
| `<clone>/<folder>/` holding `meta.yaml`, below the root and outside every other path of this table | a spec package's folder, such as one your own group's environment requests by path [[environments-32](environments.md#environments-32)] ([DR-125](../decisions/125-your-own-groups-path-sources-live-in-its-clone.md)) | Tracked, one unit |
| `<clone>/.spex/` | the installed files, generated skills and install record of a group's own environment [[environments-7](environments.md#environments-7)] [[environments-8](environments.md#environments-8)] | Ignored |
| `<clone>/sessions/<id>.hints.json`, session leases, staging and atomic-write temporary files | provider hints and writer coordination [[1]] | Ignored |
| `<clone>/local/`, `<clone>/.spex-uploads/`, `<clone>/.spex-apply.json` | Playbook's own migration receipts, which may hold provider tokens; upload staging; the sync repair marker | Ignored |
| `home.yaml` | this device, the origin the home was created with, each instance it has signed in to with its account, your own group's folder name, and each working folder with its spex repository [[storage-2](#storage-2)] | — |
| `store/`, `cache/` | spec package bytes and caches [[environments-7](environments.md#environments-7)] | — |
| `local/prefs.json` | core preferences and viewed markers [[storage-5](#storage-5)] | — |
| `local/credentials.yaml` | each instance's app token [[storage-19](#storage-19)] | — |
| `local/code-credentials.yaml` | on a seat, the code-host tokens and agent credentials the member placed [[storage-44](#storage-44)] | — |
| `local/seats.yaml` | the seats this desktop opened on team servers [[storage-45](#storage-45)] | — |
| `local/migrations/` | migration receipts and retained inputs [[storage-9](#storage-9)] [[storage-30](#storage-30)] | — |
| `local/former-home.git`, `local/forge-cache.json` | the former home's Git history kept aside [[storage-9](#storage-9)]; the rebuildable forge cache | — |
| `.lease/`, `.lease.stage.<token>/`, `.lease.retired/<token>/` | the root lease held by the one process serving this home [[storage-14](#storage-14)], its staging and its permanent retirement records [[storage-26](#storage-26)] | — |

- Only a clone is a Git work tree; the home itself is none, and nothing outside `workspace/` is ever committed.
- `local/` never leaves the device, and its credentials file has owner-only permissions.
- An instance's folder is `@<host>`, `<host>` being its origin's host [[storage-2](#storage-2)] followed, where its origin names a port or its scheme is `http`, by `_<port>` with the port the origin names, else `80`.

### storage-2

The home file shall encode `home.yaml` as exactly `{format: 2, device, origin, instances, own, folders}`:

| Field | Content |
| --- | --- |
| `device` | a canonical lowercase UUID minted once for this device, keying what is acknowledged per device [[storage-5](#storage-5)] |
| `origin` | the origin of the instance the home was created with [[git-host-1](git-host.md#git-host-1)], kept as it is thereafter |
| `instances` | an array of `{origin, clientId, account, displayName?, signedOut?}`, one per instance the home has signed in to and not forgotten [[space-82](space.md#space-82)], in the order they were added: its origin, the public client id `spex`, `{id, login, displayName}` of the account as that instance reported them, the instance's display name as its last read named it, and `signedOut` true once its credential was removed while its entry is kept [[git-host-4](git-host.md#git-host-4)] [[git-host-10](git-host.md#git-host-10)] |
| `own` | the folder name of your own group under `workspace/`: this device's user name before the home's first sign-in and that sign-in's login after, no later sign-in renaming it [[space-59](space.md#space-59)] |
| `folders` | an array of `{path, repository, aliases?}`: a normalized absolute working folder, the key of its spex repository, and optional former working directories recorded in its sessions |

- an instance is recorded by its URL's origin — the scheme, the host in lowercase, and the port where it is not the scheme's default — and a URL with a path beyond `/`, a query or a user, a scheme other than `https` or `http`, `http` on a host that is not loopback, or a host holding `_` or a character outside a key segment's is refused, as is a new origin whose folder [[storage-1](#storage-1)] equals a listed instance's, no two entries sharing an origin;
- the home's **default instance** is the first entry of `instances`, or `origin` while `instances` is empty;
- each path and each repository key appears at most once; a key names a clone under `workspace/`, so a group's own spex repository is paired like a project's;
- a folder whose clone is missing, and a clone no folder pairs, are reported as diagnostics [[storage-12](#storage-12)] without deleting either;
- the store reads `home.yaml` and the clones under `workspace/` as they stand when a command needs them, with no reload; a read creates no folder, a session's open making its clone's `sessions/` where missing, never the clone, `session.create` refused `not_found` where that clone is gone before or during its open, and a clone gone since it was read is absent and refused where a command names it, your own group's clone being made only when the store opens ([DR-111](../decisions/111-the-core-coordinates-as-git-does.md));
- each change the core makes applies to the file as it reads at that instant, read, changed and written in one step, so a change an editor made since stands ([DR-111](../decisions/111-the-core-coordinates-as-git-does.md));
- a `home.yaml` that will not read, or that was deleted after it was read, is reported as blocking and refuses every write that needs it, a deleted one as changed meanwhile, the file neither written over nor recreated from memory until it reads again; meanwhile reads answer with no pairs, never pairs from an earlier reading, and with this device's id as last read, one damaged when the store opens taking an id minted for that run, so no command acts in a working folder through a pair the file no longer holds, and the pairs and id read from the file once it reads again.

### storage-3

The project file shall encode `<clone>/project.json` as exactly `{format: 1, name, remote}`: the project's name, and the code's remote URL as the working folder's `origin` reported it, or `null` where the folder has none, a credential embedded in the URL never written [[space-5](space.md#space-5)]:

- the store reads the file as it stands when a command needs it, with no reload ([DR-111](../decisions/111-the-core-coordinates-as-git-does.md)).

### storage-4

The intent store shall encode each `<clone>/intents/<id>.json` as a closed JSON object with `format: 2` and exactly these fields — a file of `format: 1` reading the same without `runtime` — the file's name being the intent's canonical lowercase UUID `id` ([DR-103](../decisions/103-the-home-and-its-groups.md), [DR-134](../decisions/134-execution-ownership.md)):

| Field | Content |
| --- | --- |
| `id`, `text`, `createdAt` | the identity, the exact staged text, and the capture time in Unix milliseconds |
| `attachments` | optional ordered references into `intents/<id>.assets/` [[media-5](media.md#media-5)] |
| `source` | optional `{kind, ref, url, labels?}` provenance — issue, PR, record, or chat |
| `author` | optional `{login, displayName}` of the account at the project's instance that captured it [[core-service-42](core-service.md#core-service-42)] |
| `runtime` | `{device, label}` in a format 2 file, required there and forbidden in a format 1 file: the `device` of the home whose core captured it [[storage-2](#storage-2)] and a label for display, written once at capture and never rewritten [[core-service-42](core-service.md#core-service-42)] |
| `dispatched` | optional `{sessionId, turnId, at}`, re-written by a later dispatch |
| `closed` | optional `{as: 'done' \| 'dropped', at}` |

- an intent holds no rank and no link to another intent: the next to run is the oldest queued one by `createdAt`, then by `id`;
- the store reads every intent file as it stands when a command needs it, with no reload ([DR-111](../decisions/111-the-core-coordinates-as-git-does.md));
- an edit, a dispatch and a close rewrite the file whole as it reads at that instant, in one step with that read, keeping its format, its captured `author` and its `runtime` as they were; an edit whose intent changed since its command read it, across the command's own wait, is refused as changed meanwhile; a remove deletes the file and its asset directory;
- a capture writes format 2 with the runtime of the home that captures it; a file of a format above 2 is malformed;
- a capture writes a new file only where no clone holds an intent of its id and no file holds its name, never replacing one;
- no write recreates the clone holding `intents/` where it moved or was removed;
- a malformed file is reported without deletion, and its intent is listed nowhere; a linked or non-directory intent folder is reported without reading its contents.

### storage-43

When a session is created, the session store shall append to its replay stream, under the session's lease and before its first turn, one hidden `captain_telemetry` record with topic `spex.session.runtime`, no turn id, and payload `{device, label}` — the `device` of the home whose core created it [[storage-2](#storage-2)] and a label for display — never rewritten, so that the assignment rides the session bundle as one unit [[storage-11](#storage-11)] ([DR-134](../decisions/134-execution-ownership.md)):

- the first such record in the stream names the session's runtime; a stream with none names no runtime, and one whose first such record cannot be read names an unknown runtime, never this home's;
- the record is hidden, so no session channel carries it [[core-service-8](core-service.md#core-service-8)].

### storage-5

The preference store shall encode `local/prefs.json` as exactly `{format: 1, prefs: {...}}`, with these core preference values:

- each preference is a JSON value, read from the file as it stands and changed in one step with that read, so a value another writer changed meanwhile stands ([DR-111](../decisions/111-the-core-coordinates-as-git-does.md));
- `viewed:<sessionId>` stores the last viewed turn as a nonnegative integer and resets when that session's stored history changes;
- `sync:<repository>:<placement>:last` stores the last completed in-app sync of that spex repository with one of its placements, `<placement>` being that placement's remote's name [[storage-34](#storage-34)], as `{at, sent, received}` — Unix milliseconds and unit counts — a value under the former `sync:<repository>:last` reading as its first placement's until that placement's next sync records one;
- `sync:<repository>:<placement>:noticed` records that this device's reader has seen the privacy notice before the first push into that placement [[space-57](space.md#space-57)], a value under the former `sync:<repository>:noticed` reading as its first placement's;
- both `sync:<repository>:<placement>:` entries follow that placement's remote [[storage-34](#storage-34)]: a rename of the remote re-keys them in the same step, and its drop removes them;
- `space:repair:<repair>` records that this device's reader declined to add a repair's project, keyed by the facts the repair names, so the repair stands in the list and counts as no issue here alone;
- `authoring:<instance>:player` stores the roster player id answering the conversation of the authoring session with that instance [[storage-23](#storage-23)]; absent means the Captain's block; removed with the session.
- `session:<id>:agents` stores that session's own agent settings as agent id — the reserved `captain`, or a roster player — to a model, a subagent model, an effort, a subagent effort and a fast mode, each a string, `false` for the provider's current default, or absent for the configured value [[core-service-100](core-service.md#core-service-100)]; browser access is a boolean override with omission inheriting the configured off-by-default setting [[media-9](media.md#media-9)]; absent means the session runs what the config resolves; removed with the session.
- `session:<id>:parked` stores what a run of that session standing parked on the Boss advertised at its last settlement — the park's reason, its actions and the shell's ending, each an id with its label and any standing the runtime reported [[core-service-32](core-service.md#core-service-32)]; absent means that settlement found no parked run advertising anything; the next settlement writes it again [[core-service-91](core-service.md#core-service-91)], and it is removed with the session.
- `config:seed` stores the config the core seeded on this device as `{path, version}` — the file's absolute path and the SHA-256 of the bytes it wrote [[core-service-3](core-service.md#core-service-3)] [[core-service-137](core-service.md#core-service-137)]; absent means no seeded config stands untouched here ([DR-156](../decisions/156-an-untouched-seed-follows-the-credentials.md)).
- `language` stores the home's interface language as an offered language code [[core-service-108](core-service.md#core-service-108)]; absent means the reader's system ([DR-078](../decisions/078-the-interface-speaks-the-readers-language.md)).

### storage-19

The credential store shall encode `local/credentials.yaml` as exactly `{format: 1, hosts: {<slot>: {access, accessExpiresAt, refresh}}}` with owner-only permissions: keyed by `registry:<origin>` for an independent registry grant and by the instance's origin for a Space grant [[storage-2](#storage-2)], legacy origin-only entries remaining Space grants, the app token that instance issued to this device, its access secret with its expiry in Unix milliseconds, and its refresh secret, written at its sign-in and at every refresh and removed at its sign-out or on its refusal, each as a versioned write of that instance's pair ([DR-111](../decisions/111-the-core-coordinates-as-git-does.md), [DR-127](../decisions/127-a-home-signed-in-to-several-instances.md)):

- a write names the pair its writer read, or none; in one step, the file is read, that instance's pair compared with the named one in every field, and the file replaced only where they are equal, every other instance's pair kept and the file removed with the last pair;
- where the pairs differ, nothing is written and the writer is told the pair changed meanwhile;
- a malformed entry for that instance is refused by every read and write, except that a sign-out which could not read it removes it in one step, every other instance's pair kept, unless a well-formed pair stands there by then, which stays;
- a file of another format, or with no hosts map, is refused and left as it is, no refusal, diagnostic or warning repeating the file's content and the format named only where it is a number;
- no credential is written anywhere else but the member's own on a seat [[storage-44](#storage-44)] and the seats a desktop opened [[storage-45](#storage-45)], and no credential enters a tracked file or a remote URL [[space-5](space.md#space-5)].

### storage-44

Where the core runs as a seat [[core-service-125](core-service.md#core-service-125)], the credential store shall encode `local/code-credentials.yaml` as exactly `{format: 1, hosts: {<host>: {token, username?}}, agents: {<adapter>: {<NAME>: value}}}` with owner-only permissions — a code host's token and each agent credential the member placed [[settings-48](settings.md#settings-48)] — written and removed as versioned writes as the app token's file is [[storage-19](#storage-19)], read before each transport and each agent run, and never entering a tracked file, a remote URL or a log ([DR-132](../decisions/132-team-servers.md)):

- a file of another format is refused and left as it is; a malformed entry is refused by every read and write and reported; no refusal, diagnostic or warning repeats the file's content, the format named only where it is a number;
- the file is removed with its last entry.

### storage-45

The seats store shall encode `local/seats.yaml` as exactly `{format: 1, seats: {<instance origin>#<server id>: {name, group, endpoint, bearer, leaseExpiresAt}}}` with owner-only permissions — each seat the desktop opened [[core-service-128](core-service.md#core-service-128)], its server's name and group, the endpoint and bearer the server's admission answered and the lease expiry in Unix milliseconds — written at an open and removed at a close or a refusal as versioned writes, as the app token's file is [[storage-19](#storage-19)], the file removed with its last entry, and never entering a tracked file, a remote URL or a log ([DR-133](../decisions/133-one-desktop-over-several-cores.md)).

### storage-6

When a working folder is added, the core shall pair it with a spex repository and record the pair in `home.yaml` [[storage-2](#storage-2)] ([DR-103](../decisions/103-the-home-and-its-groups.md), [DR-127](../decisions/127-a-home-signed-in-to-several-instances.md)):

| Case | The spex repository |
| --- | --- |
| the reader picks one of the spex repositories a signed-in instance lists whose `project.json` names the folder's remote [[space-58](space.md#space-58)] | cloned from that instance under its folder at its path there [[storage-1](#storage-1)] |
| the reader picks a group, or your namespace, at a signed-in instance to create one in | created at that instance, then cloned the same way |
| no sign-in, or no pick | created locally under `workspace/<own>/<name>-spex/` with no remote, `<name>` being the folder's name, until the reader picks a group |

- a folder already paired selects its existing pair; a folder inside another working folder below its top level is refused;
- the clone's `project.json` is written with the folder's remote [[storage-3](#storage-3)], its `spex` branch created with the first commit on this device where the repository is new, and, where the working folder holds no `spex.yaml`, its environment is written at the folder's root requesting the built-in spec package [[environments-11](environments.md#environments-11)] [[environments-26](environments.md#environments-26)], a folder holding one being installed from it [[environments-7](environments.md#environments-7)];
- a session is a project's by the clone that holds it, never by matching its working directory; its recorded working directory decides only where it may continue [[core-service-73](core-service.md#core-service-73)];
- the rename of your own group's folder at sign-in [[space-59](space.md#space-59)] and a rename or transfer the host reports of the clone's first placement [[space-60](space.md#space-60)] move the clone and rewrite every pair naming it in one step.

### storage-35

When, for a clone under your own group's folder holding no placement with an instance, the host accepts a pick that creates or joins a spex repository at an instance [[space-58](space.md#space-58)], or an Attach adds its first placement [[space-99](space.md#space-99)], the core shall move the clone under that instance's folder at the repository's path there [[storage-1](#storage-1)] in one rename, as a host's rename moves a clone [[space-60](space.md#space-60)], a legacy environment's built-in spec package's lock, where its pairing's stands, taking that instance's registry whether or not the clone moves [[environments-11](environments.md#environments-11)], while an explicitly selected registry and package pins remain unchanged as only the Space binding and a current lock's request digest follow the placement [[environments-38](environments.md#environments-38)] ([DR-127](../decisions/127-a-home-signed-in-to-several-instances.md), [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

- where a session lease beneath refuses the rename as it refuses a sign-in's [[space-59](space.md#space-59)], the pick or the Attach stands and the clone stays, read as that instance's by its remote [[storage-31](#storage-31)], until its next sync moves it [[space-60](space.md#space-60)].

### storage-31

The store shall read a clone's instance from its key where the key begins with the folder [[storage-1](#storage-1)] of an instance `home.yaml` lists or of the origin it records [[storage-2](#storage-2)], otherwise from the entry naming the clone in the `deferred` list of an instances migration's receipt [[storage-30](#storage-30)], and otherwise from the listed instance whose folder names its first placement's remote [[storage-34](#storage-34)], so that a clone is at its first placement's instance, your own group's own repository at its first placement's whatever its folder, and a migrated home with no account keeps its clones at its recorded origin's instance ([DR-127](../decisions/127-a-home-signed-in-to-several-instances.md), [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

- a clone keyed under an instance keeps its key, and that instance, while it holds no placement there — a group's repository before the host creates it, or one whose remote was removed outside Spex, the core dropping a first placement only with its move [[storage-38](#storage-38)];
- a clone these rules give no instance has none, and is local only where it holds no placement [[storage-34](#storage-34)].

### storage-34

When the core writes a placement's remote — its host repository created, joined, cloned or attached at an instance, a placement following that instance, the instances migration renaming a remote [[storage-30](#storage-30)], or the reader naming one [[space-5](space.md#space-5)] — it shall name that remote by the instance's folder [[storage-1](#storage-1)], `@<host>`, recording the host's id for that repository in the remote's own section of the clone's Git configuration as `remote.<folder>.spexId`, or `origin`, with no id, for the one remote the reader names, so that a placement's remote and id are renamed and dropped together ([DR-127](../decisions/127-a-home-signed-in-to-several-instances.md), [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

- the clone's placements are its remotes in the order its Git configuration holds them, the order they were added, a rename keeping its place and `origin` taken last;
- at most one remote stands per instance, and a clone holding no placement is local only;
- a clone named in the `deferred` list of an instances migration's receipt [[storage-30](#storage-30)] holds its remote, whatever its name, as its placement at the instance that entry names, with the `spex.repositoryId` it records, if any, as that placement's id, until its move renames that remote, where it records an id, moving the id into its section;
- the `spex.repositoryId` a clone records from an earlier Spex is the id of the remote the instances migration renames, moved into that remote's section in the same step.

### storage-36

When the core creates or joins a placement at an instance — a pick [[space-58](space.md#space-58)], a join [[space-63](space.md#space-63)], a group's first session [[space-65](space.md#space-65)], the sign-in's own-group step [[space-4](space.md#space-4)] or a Place [[space-97](space.md#space-97)] — or a follow rewrites one [[space-60](space.md#space-60)] [[space-82](space.md#space-82)] [[space-98](space.md#space-98)], the former instance's file deleted in the same step, the store shall write `<clone>/placements/<folder>.yaml`, `<folder>` being that instance's folder [[storage-1](#storage-1)], as exactly the three lines `format: 1`, `instance: "<origin>"` and `id: "<id>"`, each ending in a newline: the instance's origin [[storage-2](#storage-2)] and the host's id for the repository there, naming nothing of the Git system behind it ([DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

- the write replaces what the clone holds at that path as it reads at that instant [[storage-14](#storage-14)], the next Save committing it and every sync carrying it as one unit [[storage-11](#storage-11)], so every device holding one placement writes the same bytes;
- the remote the reader names is written to no file.

### storage-41

When the store reads a clone's placement files [[storage-36](#storage-36)], it shall read them as they stand when a command needs them, with no reload, a file whose name is not its `instance`'s folder, or that does not read as that encoding, naming no placement and reported [[storage-12](#storage-12)] ([DR-111](../decisions/111-the-core-coordinates-as-git-does.md), [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)).

### storage-37

When a sync's Save step [[space-12](space.md#space-12)] finds a placement with an instance whose file [[storage-36](#storage-36)] no commit reachable from the clone's `spex` has held — every placement of a clone the instances migration moved [[storage-30](#storage-30)], at its first sync — the store shall write that file before staging, so that the Save commits it and every device holding that placement commits the same bytes ([DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

- a file a commit once held is never written again by this rule, so the removal a merge brought stands while that placement's drop waits [[storage-38](#storage-38)].

### storage-38

When the core drops a clone's first placement — by Leave [[space-98](space.md#space-98)], or by a sync whose merge, or whose Save of a change made on this device, removed its file or changed it to name another host repository [[space-91](space.md#space-91)] — it shall, in the same step, move the clone to the path of its next placement with an instance, at that instance [[storage-1](#storage-1)], or to `workspace/<own>/<name>-spex/` where none is left, rewriting every pair, session location, sync preference [[storage-5](#storage-5)] and every skill placed for your agents that names it, as a host's rename moves them [[space-60](space.md#space-60)] ([DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

| The clone | Outcome |
| --- | --- |
| your own group's own repository | keeps its folder, its remote alone dropped |
| one beneath which a session lease does not read as a dead owner of this machine by steps 3 and 4 of the root lease's rule [[storage-26](#storage-26)] | neither dropped nor moved, the drop refused to the act that asked, naming the session |
| one whose destination something other than the clone itself takes | neither dropped nor moved, refused as a sync's move is [[space-60](space.md#space-60)] |
| one whose next placement no read of this run has placed [[git-host-5](git-host.md#git-host-5)] | neither dropped nor moved, the drop refused to the act that asked, naming that placement's instance |
| any other | dropped and moved |

### storage-7

Where a spex repository's clone holds `config/playbook.config.yaml`, the config loader shall read it as that spex repository's own, composing a session's configuration from your own group's file with the project's on top [[core-service-2](core-service.md#core-service-2)], so that a module location never stands in a shared file: playbooks come from the environment's lock [[environments-9](environments.md#environments-9)].

### storage-23

The authoring store shall encode `<clone>/authoring/<id>.json` as exactly `{format: 1, id, instance, createdAt, touchedAt, package, language?, queued, failures, compile?, proposal?}` and `authoring/<id>.records.jsonl` as newline-terminated `{seq, record}` objects in sequence order:

- `instance` is a canonical lowercase UUID minted at creation and never rewritten, the session's identity; a file an earlier version wrote without it reads as the UUID formed from the first 32 hex digits of the SHA-256 of `authoring:<id>:<createdAt>`, its version digit `8` and its variant bits `10`, until its next write records that UUID;
- `package` is the relative path, inside the working folder, of the spec package under development [[environments-10](environments.md#environments-10)]; `language` is the well-formed language tag of its playbook, fixed at creation, a file without it reading as `en`; `queued` is an array of `{text, attachments?}` content entries preserving ordered owned references [[media-5](media.md#media-5)]; `failures` a nonnegative integer; `compile` is `{at, by: 'boss' | 'agent', outcome: 'running' | 'ok' | 'failed' | 'canceled' | 'interrupted', device?, phase?, output?, questions?, relay?: 'sent' | 'stopped' | 'queued', roles?, sourceSha256?}`, `device` being the home's `device` [[storage-2](#storage-2)] that runs it while `outcome` is `running`; `proposal` is `{command, intent, players}`;
- a `turn_started` record carries the home's `device` as `device`;
- timestamps use Unix milliseconds; no provider token enters either file; an incomplete final record line is not a record;
- the session with its records and assets is one unit [[storage-11](#storage-11)], shared with the spex repository like any session.

### storage-9

Before admitting writers to the groups layout, when the core finds the former layout — `projects.json` at the home's root and no `home.yaml` — migration shall complete once under the home lease [[storage-14](#storage-14)] with old writers stopped, and leave a receipt ([DR-103](../decisions/103-the-home-and-its-groups.md)):

1. Preserve the original bytes of every file it rewrites or moves under `local/migrations/<migrationId>/inputs/<n>`, with `receipt.json` encoded as `{format: 1, id, kind: 'groups', inputs: [{path, sha256}], steps: [], complete}`; a restart verifies completed outputs or retries incomplete work without overwriting divergent destinations.
2. Write `home.yaml` [[storage-2](#storage-2)] with `own` as this device's user name, no instance, and one folder per entry of `projects.json` whose path `local/project-paths.json` records, keeping its aliases; an entry with no path becomes a repair the Space surface lists [[space-46](space.md#space-46)].
3. For each project, make `workspace/<own>/<name>-spex/` a repository on a new `spex` branch with no history from the former home, replay its act log once into one file per intent [[storage-4](#storage-4)] — ranks and links dropped, a removed or never-worked dropped intent written nowhere — move its asset directory beside the intents, move the sessions whose working directory resolves to the project into its `sessions/`, write `project.json` [[storage-3](#storage-3)], write the working folder's environment requesting the built-in spec package where the folder holds none [[environments-11](environments.md#environments-11)] [[environments-26](environments.md#environments-26)], and commit.
4. Make `workspace/<own>/<own>-spex/` your own group's repository the same way, moving `config/playbook.config.yaml` into it with every `playbooks.<id>.from` dropped and recorded in the receipt, and the sessions that resolve to no project into its `sessions/`.
5. Move `prefs.json` to `local/prefs.json` [[storage-5](#storage-5)], converting `space:lastSync` to no entry and `draft:<id>:player` to `authoring:<id>:player`; move the home's `.git`, where the home was a repository, to `local/former-home.git` unchanged, so the old remote is kept aside; leave `playbooks/<id>/` and `local/drafts/` in place, listed as retired.
6. Validate every output [[storage-12](#storage-12)] before setting the receipt's `complete` to true.

- an unknown `v` or `format` in an input is preserved unchanged and reported, never guessed or downgraded;
- no Git history is written before validation confirms session recovery fields contain no provider tokens;
- `meta.json` remains `{version: 1, importedLegacy?: string[]}` for completed legacy database imports.

### storage-50

While source writers are stopped, before admitting writers, when the home holds bounded Playbook sessions in its root `sessions/` or an incomplete bounded-session import receipt, a separate import stage shall preserve and move those complete families into the groups layout under the home lease [[storage-14](#storage-14)] without changing a released migration ([DR-144](../decisions/144-bounded-session-storage.md)):

1. Under each source session's management lease, validate its whole bundle through Playbook, retain every root, replay descriptor, chunk, asset and local hint byte under `local/migrations/<id>/inputs/<sessionId>/`, and record `{format: 1, id, kind: 'bounded-sessions', sessions: [{id, cwd, files: [{path, sha256}], retained, staged, repository?, complete}], complete}` in `receipt.json` before removing the source's files.
2. Verify the receipt's state transitions, every retained file's digest, its unchanged `cwd` and shared bundle validation before retiring source files; a changed source member or a file added since retention refuses without deleting that change, and a retry accepts only remaining source members whose bytes still equal the retained ones.
3. Run the existing groups migration [[storage-9](#storage-9)] over the remaining inputs, then select the clone whose working-folder path or recorded alias equals the session's unchanged `cwd`, or your own group's clone where no pair matches [[storage-2](#storage-2)].
4. Under the destination session's management lease, refuse a missing clone, unsafe parent or divergent existing family; otherwise copy the retained dependencies before the replay descriptor and root, keeping hints local and all directories and files private [[storage-1](#storage-1)].
5. Validate the destination through Playbook before marking that session and then the receipt complete; a restart verifies retained bytes and resumes identical partial output without overwriting a divergent destination [[storage-12](#storage-12)].

- a held or unverifiable source or destination lease refuses before that family's retirement or publication;
- the stage contacts no instance, rewrites no session bytes or working directory, and does not import or remove another session's files.

### storage-24

When the core, serving a home under the root lease [[storage-26](#storage-26)], finds a project's clone holding `spex.yaml` or `spex.lock` — it looks at its start and at each pairing of a working folder [[storage-6](#storage-6)] — the environment migration shall move that project's environment into its working folder once and leave a receipt under `local/migrations/` with `kind: 'environment'`, as the groups migration does [[storage-9](#storage-9)] ([DR-113](../decisions/113-a-projects-environment-lives-in-its-working-folder.md), [DR-165](../decisions/165-one-package-manager-hosted-by-the-cli-and-the-app.md)):

| The working folder | Outcome |
| --- | --- |
| holds neither file | the clone's `spex.yaml` and `spex.lock` are moved to the folder's root, and the clone's `packages/` with its install record and `skills/` under the folder's `.spex/` where that record matches the lock, else deleted and the lock installed from the store [[environments-7](environments.md#environments-7)] |
| holds either file | the folder's files stand and the clone's files and trees are deleted, the folder's lock installed where it is not [[environments-7](environments.md#environments-7)] |
| is missing on this device | the clone's files stay until the folder is paired, when the move runs for that project |

- the deletion from the clone is a local change the next sync of that spex repository carries [[space-7](space.md#space-7)];
- a `spex.yaml` moved or standing without `space` gains `space` naming the instance of the clone's placement where it has one, so an environment placed before `space` existed keeps resolving there [[environments-11](environments.md#environments-11)] [[environments-2](environments.md#environments-2)];
- a group's own spex repository, holding no `project.json`, keeps its two files [[storage-1](#storage-1)], its `spex.yaml` gaining `space` naming the instance its own repository's remote names where it lacks one, and its `packages/` and `skills/` moving under its clone's `.spex/` by the same rule;
- the moved files are installed and placed from where they now stand [[environments-7](environments.md#environments-7)];
- before changing either destination file, persist a per-repository pending plan with the source versions, both destination files' original and planned versions and retained planned bytes; resume only where every destination is still original or planned, verifying both planned files before retiring unchanged sources, including a retirement interrupted after source removal;
- a divergent destination or source remains untouched, the original source files not yet retired retained, and the receipt incomplete; until that repository recovers, its package operations and automatic preparation, resolution, installation and placement make no changes, while other repositories remain usable;
- an unsupported or damaged journal refuses package writes across the home because its affected repositories cannot be trusted, with original files unchanged; an unreadable shared journal may refuse opening the home before package management starts;
- the plan preserves an explicit registry, locked origins, versions, checksums and file digests, advancing a lock's request digest only where it matched the manifest before the migration [[environments-38](environments.md#environments-38)].

### storage-30

When the core, serving a home under the root lease [[storage-26](#storage-26)], finds at its start `home.yaml` in format 1, or a receipt of this migration not complete, the instances migration shall, before admitting any other write, bring the home to format 2 [[storage-2](#storage-2)] and its clones under their instance's folder [[storage-1](#storage-1)] once, and leave a receipt under `local/migrations/` with `kind: 'instances'`, as the groups migration does [[storage-9](#storage-9)] ([DR-127](../decisions/127-a-home-signed-in-to-several-instances.md)):

1. Preserve the original bytes of each file it may rewrite but the credentials file under `local/migrations/<migrationId>/inputs/<n>`, `<n>` being the file's index in `inputs`, with `receipt.json` encoded as `{format: 1, id, kind: 'instances', inputs: [{path, sha256, kept}], steps, deferred: [{from, to}], complete}`; a restart verifies each completed step and finishes what remains without overwriting a divergent destination:
   - `inputs` lists, in this order, each of `home.yaml`, `local/prefs.json`, `local/forge-cache.json` and the credentials file standing as a file when the migration begins, by its digest then, `kept` false for the credentials file alone, which no copy may hold [[storage-19](#storage-19)];
   - `steps` holds `{step: 'home', origin, credentials, written}` for step 2: the origin, the credentials file's digests `{from, to}` before and after its re-key, planned before either file is written, or null where no credential moves, and whether its writes are made;
   - `steps` then holds `{step: 'clones', folder, moves: [{from, to, remote, id, url}], done}` for step 3: the origin's folder, every move planned before the first is made — by the key the clone has, the key it takes, its own where the clone keeps its folder, whether its remote is renamed, and the host's id it recorded and the URL of its remote `origin` as they stood then, each null where it had none, so a restart or a later sync moves that clone alone, never another made at its key since — and in `done` the `from` of each move settled;
   - `deferred` names each clone whose move waits by the key it keeps and the key it moves to, its instance being the one whose folder that key names.
2. Canonicalize the host URL `home.yaml` records to its origin [[storage-2](#storage-2)], then, in one step, write `home.yaml` in format 2 with that origin as `origin` and, where the host held an account, as the one entry of `instances` carrying the host's client, account and sign-out mark, its other fields kept, and re-key the host's credential to that origin [[storage-19](#storage-19)]; a host URL the origin rule refuses stops the migration naming it, every file left as it was.
3. Move each clone as the table below says, `@<host>` being that origin's folder [[storage-1](#storage-1)], each move one rename that rewrites in the same step every pair, session location, sync preference [[storage-5](#storage-5)] and every skill placed for your agents that names the clone, as a host's rename moves them [[space-60](space.md#space-60)].
4. Validate every output [[storage-12](#storage-12)], and set the receipt's `complete` to true once no move remains deferred.

| The clone | Outcome |
| --- | --- |
| your own group's own repository | keeps its folder, its remote, where it records the host's id, renamed to `@<host>` with that id beside it [[storage-34](#storage-34)] |
| another under your own group's folder recording the host's id — a spex repository in your namespace | moved to `workspace/@<host>/<login>/<name>-spex/`, `<login>` being the account's, its remote renamed likewise |
| another under your own group's folder | stays, local only |
| one outside your own group's folder | moved to `workspace/@<host>/<key>/`, its remote renamed likewise where it records the host's id and kept as it is otherwise |

- a move is deferred where a session lease beneath does not read as a dead owner of this machine by steps 3 and 4 of the root lease's rule [[storage-26](#storage-26)]: the clone keeps its key and remote and the receipt's `deferred` names it, whether or not it records the host's id, and its move is made at the next start or at its next sync's Check step, before any fetch or push [[space-60](space.md#space-60)], whichever comes first, a move made at a sync removing its entry from `deferred`;
- the migration contacts no instance and changes nothing there, so each device migrates on its own at its next start.

### storage-17

When preparing a clone's Git rules before its first commit and before each sync, the store shall replace its managed rule blocks while preserving authored rules:

- `.gitignore` excludes, for the ignored families of the catalog [[storage-1](#storage-1)], `/.spex/`, `/packages/`, `/skills/`, `/local/`, `/.spex-uploads/`, `/.spex-apply.json` and `/.lock*` at the root, and anywhere in the clone `*.hints.json`, `*.spex.json`, `*.lock`, `*.lock.*`, `*.tmp`, `*.bak`, `*.bak.*`, `*.backup` and `*.backup.*` but the root `spex.lock`, with every unsupported session path; retried migration removes generated ignores for newly validated bundles;
- `.gitattributes` disables line-ending conversion for portable JSON/JSONL files and session chunks;
- generated privacy and byte-preservation rules take precedence over authored exceptions, without accumulating stale blocks.

### storage-18

Where no home or session location is explicitly selected, when the ordinary default-home core starts, the core shall import `$XDG_STATE_HOME/playbook/sessions`, or `~/.local/state/playbook/sessions` when XDG is unset, through Playbook's guarded migration [[1]] into your own group's `sessions/` before indexing sessions ([DR-050](../decisions/050-shared-storage-cutover.md)):

- a different configuration file alone does not suppress discovery;
- original manifest/replay bytes are retained in destination receipts before validated conversion removes the source files; skipped inputs remain in place with their reasons reported.

### storage-10

The storage Git tool shall expose `plan`, `select`, `validate` and `rebind` through `node scripts/storage-git.mjs [--home path] --repository <key> <command>`, using `--home`, then nonempty `SPEX_HOME`, then `~/.spex` to select the home and `--repository` to select the clone:

- commands report JSON results on stdout; invalid arguments and refused operations report their cause on stderr and exit nonzero;
- a mutating command takes the root lease by the core's rule [[storage-26](#storage-26)] — recovering a verifiably dead owner of this machine, and refusing with `stop the Spex core before changing stored data` followed by the lease path and the reason while a live, foreign, or unverifiable owner holds it — and refuses before any change while this machine's identity is unavailable, naming the identity file and the reason;
- Git transport and committing remain ordinary Git operations; local writers must stop for checkout, merge and mutating storage commands, and each session runs on at most one device at a time;
- this tool is the stopped-core path; the desktop and server app perform the same plan, validation and application in-process under the running core's lease, one spex repository and one of its placements at a time ([DR-103](../decisions/103-the-home-and-its-groups.md), [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)).

### storage-20

When invoked as `plan <ours> <theirs>`, the storage Git tool shall report the resolved revisions, common ancestor and every unit choice [[storage-11](#storage-11)] of the selected clone without changing files or the Git index; the report names the ancestor and, where none exists, reports the revisions unrelated.

### storage-21

When invoked as `select [unit=ours|theirs ...]` during a Git merge, the storage Git tool shall apply the validated selection between `HEAD` and `MERGE_HEAD` in the selected clone under the home lease [[storage-14](#storage-14)]:

- reject unknown or duplicate choices, unresolved conflicts and choices contrary to an unambiguous comparison [[storage-11](#storage-11)];
- validate the complete candidate — `HEAD`'s tree with each unit taken whole from its selected side — in a private copy before applying files [[storage-12](#storage-12)]; validation failure leaves working files and index unchanged;
- materialize that copy with Git's filters and write its validated bytes; LFS materialization uses only locally available objects, refusing before live writes without attempting a download where an object is missing or corrupt or cleaning the bytes does not recover the selected blob, including a noncanonical pointer;
- write or delete each unit whose working-tree files differ from its selection by a versioned replacement [[storage-14](#storage-14)] naming the unit's tracked paths as Git's merge left them when the selection began, each read as Git reads its path, a file in neither side's tree left untouched as Git leaves an untracked file, a session's chunks and assets before its replay descriptor or legacy replay, its root after those dependencies and, for a replacement root, obsolete dependencies removed afterward, and under that session's lease, its files and attachment folder owner-only, clear hints and viewed markers when its selected bundle differs from `HEAD`, and set the index to the candidate's tree;
- before reading a live unit or writing, deleting or clearing one of its files or hints, inspect every existing parent below the clone without following links, refusing a symbolic link or non-directory even where the leaf or a later parent is absent; check the session parent before taking its lease and check the destinations again after each awaited preparation or lease acquisition, never reading or changing a path outside the clone through a parent;
- a session chunk added since the selection began is a changed member of that session's unit;
- a unit changed since the selection began, or a session whose lease is held, refuses selection naming it, leaving its files and the index unchanged and the units written before it in place;
- report filesystem failures without claiming success; retrying selection completes an interrupted or refused application before reopening.

### storage-22

When invoked as `validate`, the storage Git tool shall reserve the home and validate the selected clone [[storage-12](#storage-12)] without staging or changing file contents; and when invoked as `rebind <key> <path> [--alias path ...]`, it shall pair the spex repository with the working folder under the home lease [[storage-6](#storage-6)], the destination a folder on this device, supplied aliases replacing the alias list and omitted ones preserving it, the result including the pair and the remaining storage diagnostics.

### storage-11

When selecting stored data during a Git merge of a spex repository's `spex` branch, the validator shall compare both pre-merge revisions with their common ancestor:

- compare complete file bytes and existence;
- treat the root, replay descriptor, every file under its session-owned chunk directory, legacy replay where present, and owned assets as one session bundle [[1]] ([DR-144](../decisions/144-bounded-session-storage.md)); each `intents/<id>.json` with its `intents/<id>.assets/` as one unit; each `authoring/<id>.json` with its records and assets as one unit; `spex.yaml` with `spex.lock`, where the spex repository holds them [[storage-1](#storage-1)], as one unit; each folder below the root holding `meta.yaml` in either revision or their common ancestor, outside `config/`, `sessions/`, `intents/`, `authoring/`, `placements/` and the folders the catalog ignores, `.spex/`, `packages/`, `skills/`, `local/` and `.spex-uploads/`, with every file under it on every side, as one unit, the outermost where two nest [[storage-1](#storage-1)] ([DR-125](../decisions/125-your-own-groups-path-sources-live-in-its-clone.md), [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)); and `config/playbook.config.yaml`, `project.json`, each placement file [[storage-36](#storage-36)] and each other tracked file as a separate unit.

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

- before each Spex-owned project, intent, authoring or configuration read, inspect the clone-relative parents and leaf without following links: existing parents must be directories and an existing leaf must have its expected regular-file or directory kind; missing optional paths remain absent, and unsafe paths refuse before reading their contents; repeat these checks at the actual read boundary after awaited work, including before handing session or attachment paths to Playbook, whose validation remains authoritative [[1]];
- file formats and closed encodings are valid [[storage-2](#storage-2)] [[storage-3](#storage-3)] [[storage-4](#storage-4)] [[storage-5](#storage-5)] [[storage-23](#storage-23)] [[storage-36](#storage-36)] [[storage-43](#storage-43)] [[storage-50](#storage-50)] [[1]];
- open artifact-source identities are unique within a spex repository [[core-service-42](core-service.md#core-service-42)], and dispatch targets still present belong to the same spex repository with valid turn boundaries;
- deleted session targets retain the existing ledger re-derivation behavior [[core-service-70](core-service.md#core-service-70)]; a missing session alone is not permission to discard a verdict or repeat work;
- a clone no folder pairs, and a folder whose clone is missing, are reported with their records unlisted, without blocking unrelated valid spex repositories or automatically pairing anything;
- incompatible modules or unsupported checkpoint relocation permit history only;
- invalid session data blocks that session's execution and recovery, preserving lease-checked deletion; an invalid intent file blocks that intent alone, and an invalid placement file names no placement, blocking nothing else [[storage-41](#storage-41)];
- invalid shared files block operations that require them; diagnostics name the failing file and reason, while startup, unrelated valid spex repositories and independent configuration or preference edits remain available;
- a damaged session file's diagnostic leaves once that file is gone; the forge cache's diagnostic follows the cache file as it stands when reported, leaving once the file is repaired or removed and reported again once it is damaged again;
- a config whose playbook cannot be loaded — the environment lacking it, or its module older than the toolchain — is reported without blocking, the validator telling that case by the failure's kind rather than by its reason's words, so the reason's language decides nothing.

### storage-13

When continuing after Git selection, the host shall require Playbook's repository/effect reconciliation [[1]] before any external action, preserving unresolved evidence because selecting or deleting history cannot undo executed work.

### storage-14

The core shall write Spex-owned files as the one process holding the Spex home lease at `.lease/` [[core-service-61](core-service.md#core-service-61)], each write an atomic same-directory replacement or an append, while session mutations use Playbook's per-session lease and shared store [[1]], one shared store per spex repository's `sessions/`:

- a versioned replacement names the bytes and existence it read and is refused where the file no longer holds them at the instant before its rename;
- an independent process writing the same files keeps ordinary filesystem behavior: no lock holds it off a file, and what it writes outside that instant is never refused;
- a replacement of a session's files takes that session's management lease for that write alone, releasing it once the write lands.

### storage-26

When a home writer — the core or a mutating storage Git command — takes the root lease, it shall admit itself by one shared rule over `.lease/owner.json`, a record of `pid`, `hostname`, `acquiredAt` and `token` whose `hostname` carries this machine's identity from Playbook's facade [[2]] ([DR-108](../decisions/108-the-root-lease-names-the-machine.md)):

1. Inspect `.lease` without following links: a definite `ENOENT` permits publication; any other inspection error refuses.
2. Read an existing owner: a symlink, a non-directory, an empty directory, contents other than one regular `owner.json` of the current user's, a record of another shape, a non-positive `pid`, a `token` that is not a UUID, or a `hostname` of the tagged form of step 3 in an `owner.json` whose permissions fail the private-storage policy ([DR-165](../decisions/177-native-windows-private-storage.md)) is malformed and refuses; an untagged record is read whatever its mode.
3. Read the owner's `hostname`: exactly the tagged form `machine-id:v1:<lowercase UUID>` is an identity, local when it equals this machine's; an untagged value is a legacy host name, local when it equals the current `os.hostname()`; a value that begins `machine-id:` but fails the exact form is unverifiable and refuses; another machine's owner refuses.
4. Probe a local owner's `pid` with signal `0`: success or `EPERM` is live and refuses; `ESRCH` is dead; any other error refuses, naming its code.
5. Retire a dead owner: create the private `.lease.retired/`, or, where it already stands, validate it as a private non-symlink directory, any other creation error refusing with its code; refuse an existing `.lease.retired/<token>/` target, rename `.lease/` there, re-read the moved `owner.json` and require its `token`; a changed token refuses without deleting anything, and the retired directory with its `owner.json` is kept forever.
6. Publish: write a private `.lease.stage.<token>/owner.json`, rename the stage to `.lease/` — a rename failing with `EEXIST` or `ENOTEMPTY`, a target that appeared meanwhile, makes the writer re-inspect, and any other staging or rename error refuses at once with its code — and re-read `.lease/owner.json` to confirm its own `token`.
7. Release: re-read `.lease/owner.json`; only an owner carrying this writer's `token` is retired as in step 5, and a successor is never touched.

- Every refusal names the lease path and the reason, calling a tagged value a machine identity and never a host name; a live owner's refusal names its `pid`.
- A writer whose identity is unavailable refuses before inspecting the lease, naming the identity file and the reason, and never publishes `os.hostname()`.
- The core, once published, reads a `.lock/owner.json` of the former layout [[storage-9](#storage-9)] by steps 3 and 4: an owner of another machine, an unverifiable one, a live one, or one whose probe answers neither way refuses and retires this writer's lease; a dead owner of this machine, or a record naming no `pid` and `hostname`, is left for the migration.

### storage-48

When a session read completes after its clone's location has changed [[storage-35](#storage-35)] [[space-60](space.md#space-60)], the store shall discard the retired location's result without changing the session's current association, indexed history, diagnostics or exclusion from Sync [[storage-17](#storage-17)].

### storage-51

The registry account metadata store shall keep only each registry's canonical origin, display name and public account identity in owner-only `local/registry-accounts.json`, with registry credentials exclusively in their purpose-scoped slots [[storage-19](#storage-19)], never creating or modifying a Space entry in `home.yaml` ([DR-168](../decisions/168-independent-package-registry.md)).

## Verification

### storage-52

When a real-core integration suite signs in to a registry and a Space at one origin and restarts the core, it shall verify independent credential slots and purpose-scoped removal [[storage-19](#storage-19)], public registry metadata without any credential and no registry-created Space entry [[storage-51](#storage-51)].


### storage-49

When the storage integration suite moves a real clone while its session reads are suspended, it shall verify that delayed successes and old-path failures leave every session associated with the moved clone, preserve the stored bytes, and leave valid session families eligible for the next Save [[storage-48](#storage-48)].

### storage-15

When an integration suite migrates a former-layout home of two projects and one unmatched session with writers stopped and opens it through desktop and CLI, it shall verify:

- default and explicitly selected locations, and that nothing outside `workspace/` is a Git work tree afterwards [[storage-1](#storage-1)];
- `home.yaml` in format 2 carrying the origin it was created with as its default instance, no instance listed, this device's user name as `own` and both folders with their aliases [[storage-2](#storage-2)] [[storage-9](#storage-9)];
- each project's clone on a `spex` branch with one commit, its `project.json` naming the folder's remote, one file per open or worked intent with ranks and links dropped, its asset directory beside them, its sessions inside, and its working folder's root holding `spex.yaml` requesting the built-in spec package [[storage-3](#storage-3)] [[storage-4](#storage-4)] [[storage-9](#storage-9)];
- your own group's clone holding the configuration with every `from` dropped and the unmatched session, the receipt naming the dropped entries [[storage-9](#storage-9)];
- preferences moved with their viewed markers and session tuning, the former home's `.git` kept aside, the retired library folder in place [[storage-5](#storage-5)] [[storage-9](#storage-9)];
- a working folder added afterwards paired with a local spex repository, the folder's own `spex.yaml` requesting the built-in spec package and the clone holding none, one added holding a committed environment installed from it with nothing written, and sessions listed by the clone that holds them [[storage-6](#storage-6)];
- a project's configuration composed on top of your own group's [[storage-7](#storage-7)];
- restart-safe migration and token-free Git ancestry [[storage-9](#storage-9)];
- refreshed Git rules after a migration retry [[storage-17](#storage-17)];
- ordinary-default discovery into your own group's sessions, retained inputs and explicit-location isolation [[storage-18](#storage-18)];
- exact authoring session and credential encodings written and read back, the credential keyed by its instance's origin, a session file without `instance` reading as the same derived UUID in two homes and recording it at its next write, the credentials file owner-only [[storage-23](#storage-23)] [[storage-19](#storage-19)];
- a credential write naming a pair the file no longer holds writing nothing, and one naming the held pair replacing or removing it with another instance's pair kept [[storage-19](#storage-19)];
- a malformed entry for an instance refused by a read and a versioned write, a sign-out's removal of it keeping another instance's pair, a well-formed pair stored after the failed read kept by that removal, and a file of another format left byte for byte as it was [[storage-19](#storage-19)].

### storage-25

When a real-core integration suite migrates environments, including child processes killed after the first destination write and during source retirement, it shall verify these cases:

- a project's empty working folder receives its clone's two files with `space` naming the placement, its matching installed trees move without fetching, and its clone keeps none of them; a folder holding either file keeps its own pair, while a missing folder's clone keeps its environment until pairing [[storage-24](#storage-24)];
- a tree whose install record does not match installs from the store, your own group's pair remains in its clone with its remote's instance named, one receipt stands, a restart repeats nothing and the next sync carries the clone's deletion [[storage-24](#storage-24)];
- interrupted moved, own-group and preexisting-folder pairs resume with their explicit registry, package origins, versions, checksums and file digests unchanged, fresh locks still fresh and originally stale locks still stale, including retirement after one or both source files were removed [[storage-24](#storage-24)];
- a divergent partial destination remains byte-identical with the remaining source retained and receipt incomplete, that repository's package mutations are refused without automatic file changes, another repository remains usable, restoring planned bytes allows recovery, and unreadable, unsupported or damaged journal metadata refuses package writes or home startup without bootstrapping an incomplete own-group pair [[storage-24](#storage-24)].

### storage-32

When an integration suite starts a real core on a signed-in format-1 home whose host URL names the stand-in instance with capitals and a trailing `/` — holding your own group's own repository with its remote, a project in your namespace and a group's project each recording the host's id, a group's repository the host has not created, a clone outside your own group's folder with a remote the reader named, a local-only project, and two clones whose session leases name live writers, one recording the host's id and one with a remote the reader named — then ends the second's writer and syncs it by its old key, and ends the first's and restarts the core, it shall verify:

- `home.yaml` in format 2 with the canonical origin as its recorded origin and its one instance entry, which carries the account and the client, the credential re-keyed to that origin with its secrets unchanged, and a receipt of kind `instances` in the encoding of its first step, whose inputs hold no credential [[storage-30](#storage-30)] [[storage-2](#storage-2)] [[storage-19](#storage-19)];
- your own group's own repository keeping its folder, its remote renamed to the instance's folder with the host's id beside it [[storage-34](#storage-34)], and read as that instance's [[storage-30](#storage-30)] [[storage-31](#storage-31)];
- the namespace project moved under `@<host>/<login>/` and the group's under `@<host>/<group>/`, their remotes renamed likewise; the uncreated repository and the reader-named clone moved under `@<host>/` at their keys, keeping their remotes and read as that instance's; the local-only project left where it was [[storage-30](#storage-30)] [[storage-31](#storage-31)];
- each moved clone's pairs, session locations, sync preferences and the skills placed for your agents following it [[storage-30](#storage-30)];
- each held clone keeping its key and remote, named in the receipt's `deferred` by the key it keeps and its destination, read as that instance's, and its remote held as its placement there, with the id where it recorded one [[storage-34](#storage-34)]; the second moved by its sync's Check before any fetch or push, with no host read naming it, and its entry leaving `deferred`, the first at the restart, and the receipt complete only after both [[storage-30](#storage-30)] [[storage-31](#storage-31)];
- a migration interrupted after its first move finished at the next start, a destination another process filled meanwhile left as it was, and a restart after completion repeating nothing [[storage-30](#storage-30)];
- no request reaching the stand-in instance during the migration [[storage-30](#storage-30)];
- a format-1 home holding no account, whose host URL is `http://LocalHost/` naming no port, migrated with `http://localhost` as its recorded origin and its clones outside your own group's folder moved under `workspace/@localhost_80/`, read as that origin's instance with no instance listed [[storage-30](#storage-30)] [[storage-1](#storage-1)] [[storage-31](#storage-31)];
- a format-1 home whose host URL carries a path stopping the migration naming that URL, `home.yaml` and the credentials file left byte for byte [[storage-30](#storage-30)] [[storage-2](#storage-2)].

### storage-33

When an integration suite runs a real core against two stand-in instances, at `http://localhost:<a>` and `http://127.0.0.1:<b>`, each holding a group `acme` with a spex repository — creating the home for the first, signing in to both, joining both `acme` repositories, creating a project in your namespace at the second, and picking two local-only projects into `acme` at the second, one while a live writer holds a session lease beneath it — it shall verify:

- before any sign-in, `home.yaml` in format 2 listing no instance with the first's origin recorded, that origin the default instance [[storage-2](#storage-2)];
- a URL recorded by its canonical origin, `HTTP://LocalHost:<a>/` as `http://localhost:<a>`, and a URL with a path, a query or a user, a scheme other than `http` or `https` such as `ssh://localhost:<a>`, `http` on a host that is not loopback, a host holding `_`, and `https://localhost:<a>`, whose folder equals the first's, each refused with nothing recorded [[storage-2](#storage-2)];
- `home.yaml` listing both instances in sign-in order, each with its client, account and display name, the first the default instance, and a sign-out of it marking its entry signed out and keeping it [[storage-2](#storage-2)];
- the credentials file holding one pair per origin, that sign-out removing the first's alone [[storage-19](#storage-19)];
- the two `acme` clones under `@localhost_<a>/acme/` and `@127.0.0.1_<b>/acme/` with distinct keys, each remote named by its instance's folder with the host's id beside it [[storage-34](#storage-34)], and each clone read as its instance's [[storage-1](#storage-1)] [[storage-31](#storage-31)];
- the namespace project under `@127.0.0.1_<b>/<login there>/` [[storage-1](#storage-1)] [[storage-6](#storage-6)];
- your own group's folder named the first instance's login and kept at the second sign-in, holding your own group's own repository and the local-only clones [[storage-1](#storage-1)] [[storage-2](#storage-2)];
- the first picked project moved under `@127.0.0.1_<b>/acme/` at its pick with its pair rewritten, and the held one left under your own group's folder, read as the second instance's by its remote, until its next sync after the writer ends moves it [[storage-35](#storage-35)] [[storage-31](#storage-31)];
- a clone whose remote the reader removed keeping its key and read as its instance's [[storage-31](#storage-31)].

### storage-39

When an integration suite runs a real core against two stand-in instances on separate Git backends — signing in to both, creating a project in the first's `acme`, placing it in a group of the second, joining it on a second home signed in at the second alone, having the second rename that placement's repository, then leaving the project's placements one by one, the first time while a live writer holds a session lease beneath it and again in a core restarted while the second's read fails, and on the second home leaving its placement, then signing in at the first and attaching the first's — it shall verify:

- each creation and join — the project's, the placement's, the second home's and your own group's at each sign-in — writing `placements/<folder>.yaml` as the three lines of its encoding, the same bytes on both homes, and no file for a remote named through `space.remote.set` [[storage-36](#storage-36)];
- each placement's remote named by its instance's folder with `remote.<folder>.spexId` holding the host's id, the placements read in the order added with `origin` last, and a rename keeping its place [[storage-34](#storage-34)];
- the project keyed under the first's folder and read as the first's, and your own group's own repository keeping its folder and read as the instance it was first placed at [[storage-1](#storage-1)] [[storage-31](#storage-31)];
- the second's rename moving no clone [[storage-6](#storage-6)];
- the first placement's leave refused while the writer holds its lease, naming the session, and in the restarted core, naming the second, the clone and its remotes as they were each time, then, the lease released and the second read, the clone moved to the second's path with its pairs, session locations, sync preferences and the skills placed for your agents following, and the last leave moving it under your own group's folder, local only [[storage-38](#storage-38)], a remote then named through `space.remote.set` making it local only no more [[storage-34](#storage-34)];
- the last sync and the notice recorded per placement and removed with its leave, and a former `sync:<repository>:last` and `sync:<repository>:noticed` read as the first placement's [[storage-5](#storage-5)];
- a placement file merged as one unit, a `meta.yaml` under `placements/` forming no unit, and a file not of its encoding reported, naming no placement and blocking nothing else [[storage-11](#storage-11)] [[storage-12](#storage-12)] [[storage-41](#storage-41)];
- the second home's clone, its one placement left with `confirmed`, local only under your own group's folder holding the first's file, moved under the first's folder at the repository's path there by an Attach once that home signs in at the first [[storage-35](#storage-35)].

### storage-40

When an integration suite migrates two signed-in format-1 homes, each holding a clone of one spex repository at the stand-in instance recording the host's id, syncs each, then places that repository at a second stand-in instance from the first home, attaches it on the second home, leaves the first placement on the first home, and syncs the second home while a live writer holds a session lease beneath its clone, then again once the lease is released, it shall verify that the host's id stands in each renamed remote's section [[storage-34](#storage-34)], that each first sync writes the placement file with the same bytes and the merge asks no choice, and that, while the drop of the first placement waits on the lease, the next Save does not write again the file the merge removed, the drop and the move made at the sync after the release [[storage-37](#storage-37)] [[storage-38](#storage-38)].

### storage-42

When an integration suite runs a real core on a scratch home signed in to two stand-in instances over one Git backend, with a project other members share placed at the first and synced after the notice, then signs the first out and syncs that project, it shall verify that the sync's follow leaves the clone's `placements/` holding the second's file, naming the same id, in place of the first's [[storage-36](#storage-36)], its remote renamed to the second's folder with the id in its section [[storage-34](#storage-34)], and its last sync and notice entries re-keyed to that remote in the same step [[storage-5](#storage-5)].

### storage-16

When an integration suite merges two real Git branches of a group's own spex repository containing sessions, intents, an authoring session and an environment, it shall verify:

- command results and refusals through the documented entry point with `--repository` [[storage-10](#storage-10)];
- an unchanged index after planning and refused selection, followed by staged complete choices [[storage-20](#storage-20)] [[storage-21](#storage-21)];
- stopped writers and reopening after a real Git checkout with umask `022`, and the pair restored through the rebind command [[storage-22](#storage-22)];
- every whole-unit choice, including clean text merges and deletion; an intent added on each side present on both afterwards with no choice asked; the environment unit and the empty-ancestor join [[storage-11](#storage-11)] [[storage-20](#storage-20)]; a spec package folder whose two sides changed different files, nested folders and a file added on one side included, one choice taken whole, a file beside it its own unit, a folder one side made a spec package folder by adding its `meta.yaml` while the other edited a file under it one unit in conflict, and a `meta.yaml` Git was forced to track under `packages/` forming no unit, each file there its own [[storage-11](#storage-11)], and, through the apply seam, a file added under a spec package folder since the plan refusing its replacement with that file kept [[storage-11](#storage-11)] [[storage-14](#storage-14)];
- reports of unpaired clones and folders, and rejection of duplicate sources, invalid dispatches and damaged bundles [[storage-12](#storage-12)]; a config naming a playbook the environment lacks is reported as a nonblocking diagnostic whether the core speaks English or Chinese [[storage-12](#storage-12)];
- through the real validator over a Git clone, linked parents or leaves, non-directory parents and special-file leaves in the project, intent, authoring and configuration paths refuse before their external contents are parsed, with original bytes, modes and index unchanged; replacing an intent parent while the validator awaits its first import also refuses, while absent optional paths and ordinary malformed-file diagnostics retain their behavior [[storage-12](#storage-12)];
- a selected bounded replay descriptor or chunk directory without its root refused by snapshot validation before Save can commit or push [[storage-12](#storage-12)];
- new-format sessions selected whole through the real shared store, their hydrated state and history preserved, a missing or corrupt chunk refused before live writes, a chunk added while a session lease is awaited refusing the unit in both Save-version and merge-output selection, its bytes kept and a preexisting untracked chunk retained by merge-output selection, and dependencies published before the root [[storage-11](#storage-11)] [[storage-12](#storage-12)] [[storage-21](#storage-21)];
- a format-2 intent and its dispatch selected alongside a bounded session, with its captured runtime preserved through later edit, dispatch and close [[storage-4](#storage-4)] [[storage-11](#storage-11)];
- no repetition of actions omitted from selected history [[storage-13](#storage-13)];
- through the apply seam, a versioned replacement refused where a file changed while its session's lease was awaited — against the Save commit, against an earlier placement's merge commit as a later placement's base, and under `select` against Git's merge output as it stood when the selection began — the change kept and the index unchanged, a session's lease free once its write lands, and the index holding the validated tree [[storage-14](#storage-14)] [[storage-21](#storage-21)];
- through the apply seam, a clone moved or removed while a lease is awaited refusing the write with no folder made at its former path, a held session lease refusing before any other unit is written, and a Git-checked-out CRLF file under `core.autocrlf` read as unchanged [[storage-14](#storage-14)];
- through real filtered Git branches, selected LFS content and ordinary filtered bytes materialized exactly, with the candidate tree retained in the index; a missing or corrupt LFS object refusing locally before any live write and making no network request, recognized noncanonical pointer versions or whitespace refusing instead of being installed as ordinary bytes, and an intervening working-file change refusing replacement with its bytes preserved [[storage-14](#storage-14)] [[storage-21](#storage-21)];
- through the apply seam over real Git branches, an incoming overwrite, creation or deletion beneath a linked or non-directory parent refusing with external canaries and the index unchanged, including an absent leaf or tail, a parent replaced at the before-write boundary or while a session lease is awaited, nested assets and hint cleanup; safe missing directories still permit the selection [[storage-21](#storage-21)];
- an untracked attachment in a unit neither side changed surviving selection [[storage-21](#storage-21)];
- the home lease refusing every mutating command, a held session lease refusing selection of that session's unit with the index unchanged and a retry after its release completing it, and a lease in another spex repository's store refusing nothing [[storage-14](#storage-14)] [[storage-21](#storage-21)].

### storage-47

When integration tests import bounded CLI sessions through a real home open and shared store, they shall verify a former home and an established home receiving a later default-location session, complete root/replay/chunk/asset transfer with unchanged semantic recovery and hints retained locally, held source and destination leases leaving their families unchanged, retry after interrupted destination publication, and refusal of inconsistent receipts, divergent destination bytes and unsafe parents without overwriting them [[storage-50](#storage-50)].

### storage-28

When an integration suite changes the home's files beside a running store, it shall verify that a change to `home.yaml` keeps an editor's change made since the store wrote it [[storage-2](#storage-2)]; that an intent edit whose file another writer rewrote during the edit's own wait is refused as changed meanwhile with that rewrite standing, and an intent written after its clone vanished is refused without recreating the clone [[storage-4](#storage-4)]; and that a preference write keeps a marker another writer cleared from `local/prefs.json` cleared, a read following the file [[storage-5](#storage-5)].

### storage-29

When an integration suite changes the files of a running real store from outside it, it shall verify, with no reload between change and read:

- a project's name, its working-folder pair and a clone another process added read on the next query, which leaves no `sessions/` in the clone it found [[storage-2](#storage-2)] [[storage-3](#storage-3)];
- a damaged `project.json` reported with its bytes kept, and its report gone once it is repaired [[storage-3](#storage-3)] [[storage-12](#storage-12)];
- a clone removed from outside absent from every read with its pair reported as a repair, its session store refused, your own group's clone refused once removed, and neither made again [[storage-2](#storage-2)];
- intent files added, closed, dispatched, repaired and removed from outside read by the queue, History, source, dispatch and asset reads, and an edit applied to the file as it stands [[storage-4](#storage-4)];
- a damaged intent file listed nowhere, reported without blocking, refused with its cause, and its bytes left by an edit and by a capture of its id, while a capture of an id another clone holds writes nothing [[storage-4](#storage-4)] [[storage-12](#storage-12)];
- a capture written at format 2 with this home's runtime, a format 1 file read without one and kept at format 1 by its edit, dispatch and close, a format 2 file kept at format 2 with its runtime and historical personal display name in its author unchanged by them, and a format 3 file reported as malformed [[storage-4](#storage-4)];
- a created session's stream holding one hidden runtime record naming this home before its first turn, read as the session's runtime, a stream without one reading as none, and one whose record is unreadable reading as unknown [[storage-43](#storage-43)];
- a damaged `home.yaml` answering no pairs, by id or by path, its device unchanged, and refusing a registration with its bytes kept while preferences stay writable, its repair restoring its pairs and admitting the next registration, a deleted one answering no pairs, refused as changed meanwhile and not written again, and one damaged when the store opens recovering its pairs once repaired [[storage-2](#storage-2)];
- through a real core, a `home.yaml` damaged after a project was paired refusing `specs.write`, `draft.create` and `compile.run` naming that project as no project of this device, with nothing written in its working folder or its clone [[storage-2](#storage-2)];
- through a real core, a compile admitted before `home.yaml` is damaged settling as this device's while the file does not read, its outcome recorded and never left running, and the file not written [[storage-2](#storage-2)];
- through a real core, a session created in a paired clone with no `sessions/` — one another process added, one whose `sessions/` was removed, and one a rebind paired — making that folder and succeeding, while one whose clone was removed from outside is refused `not_found` alike before its open and while the open prepares, the clone not made again [[storage-2](#storage-2)];
- a damaged session file and a damaged forge cache reported, each report gone once its file is removed, another damaged session's report standing, and the forge cache reported again once damaged again and gone once repaired [[storage-12](#storage-12)];
- on a seat, the member's credentials written owner-only, a replaced entry refused where the pair named differs, a malformed entry refused and reported, and the file removed with its last entry [[storage-44](#storage-44)].

### storage-27

When the root-lease integration suite runs the core's store and the storage Git reservation against one home with real competing processes and a fixed machine identity, it shall verify:

- a killed owner of this machine is reclaimed by the core and by a storage command alike, its `.lease.retired/<token>/owner.json` retained, and a normal release retires the same way so repeated starts leave one retired directory each [[storage-26](#storage-26)];
- a live owner refuses naming its `pid`, an owner tagged with another machine's identity refuses naming it as a machine identity, a legacy host-name owner is reclaimed when its name is the current one and refused when it differs, and a value that only begins like the tag refuses as unverifiable [[storage-26](#storage-26)];
- a malformed record, a tokenless record, a tagged `owner.json` open to the group or others, an empty active directory, a dangling symlink at `.lease`, and a probe failing with an error other than `ESRCH` each refuse without changing the home, the probe's refusal naming the error's code [[storage-26](#storage-26)];
- a dead local legacy owner whose `owner.json` is open to the group or others is reclaimed by the core's store, the storage command and the shared lease alike [[storage-26](#storage-26)];
- a `.lease.retired/` parent another writer created is validated and retired into, while one open to others or a symlink refuses with the lease left in place [[storage-26](#storage-26)];
- a home the writer cannot write refuses at once, naming the error's code rather than a race [[storage-26](#storage-26)];
- a reclaimer that read owner O, delayed until another process retired O and published N, refuses on the occupied retired target and N stays authoritative [[storage-26](#storage-26)];
- a second writer publishing between a contender's inspection and its rename leaves the contender refusing without overwriting the active entry [[storage-26](#storage-26)];
- a moved owner whose token differs from the one read fails closed with the moved directory intact [[storage-26](#storage-26)];
- a former-layout `.lock/` held by a live owner or another machine's keeps the core out, leaving no lease, and a dead one of this machine is left in place [[storage-26](#storage-26)];
- a storage command with an unavailable identity refuses before any change, naming the identity file [[storage-10](#storage-10)].

### storage-46

Where a home opens, closes and reopens seats against a stand-in instance and a stand-in hub, the test suite shall assert the seats file [[storage-45](#storage-45)]: written at an open with owner-only permissions under a `local/` of the same, read back at the next start with every entry, removed at the close of its last entry, a file of another format refused at an open and a close and left byte for byte as it was, and the bearer in no reply, event or log.

## References

[1]: https://github.com/sublang-ai/playbook/blob/main/specs/packages/session-storage.md "Shared Playbook session storage"
[2]: https://github.com/sublang-ai/playbook/blob/main/specs/packages/playbook-cli.md#playbook-cli-98 "Playbook playbook-cli-98: the machine identity facade"
