<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR (draft): The Home and Its Spaces on a Host

## Status

Draft (2026-10-02), unnumbered until accepted; on acceptance it takes the next number under [[meta-22](specs/meta.md#meta-22)].
Would supersede, on acceptance: the home as one Git repository on one shared branch with one remote of [DR-057](specs/decisions/057-space-surface.md); the setup by naming a remote and the rule that no repository exists without a remote of [DR-063](specs/decisions/063-space-setup-and-repair.md); the home's record layout of [DR-036](specs/decisions/036-file-state-store.md) and [DR-045](specs/decisions/045-unified-session-storage.md) in `projects.json`, `intents/<projectId>.jsonl`, `prefs.json`, and `local/project-paths.json`; the draft store of [DR-058](specs/decisions/058-chat-assisted-playbook-authoring.md); the purge of hidden records that [DR-004](specs/decisions/004-config-and-persistence.md) and [DR-036](specs/decisions/036-file-state-store.md) hold out, which a checkpoint's byte digest forbids; and the human-authored status of the home's `config/playbook.config.yaml` of [DR-080](specs/decisions/080-the-config-directory-is-named-config.md), which becomes a generated composition.
Every sync rule those records state for one repository stands for each space: whole-unit selection, the core as sole Git actor between turns, no text merge, commits standing on a transport failure, no credential in a remote URL.
Environments, packages, and the compiled playbook library are decided by [the companion draft](claude-dr-package-format-and-environments.md); this record places them.
A later record decides the GitLab-specific implementation; this record fixes what that implementation must provide and confirms that GitLab.com provides it.

## Context

- The goal: GitLab.com is the backend storage and user management for every person's `~/.spex`; the service holds one public top-level group with private subgroups and projects for its people and teams; a team that already has a group reuses it, and a member's existing per-user subgroup inside it is reused for that member; user management, access control and sharing go through GitLab; a person sees their own space and every shared space.
- Today the home is one Git repository with one remote, so it has exactly one audience: a person cannot hold their own records beside a team's.
- Verified host facts that shape the design: group membership inherits downward only, as a floor no subgroup can lower or remove, so every reader of a group reads every subgroup beneath it and nothing above; the creator of a group becomes its direct Owner, the creator of a project in a group gets no direct role; private children may sit under a public group; the Free five-user cap binds private top-level groups and exempts public ones and personal namespaces; a new project's default branch admits pushes from Maintainers only, and the per-project rule is the only Free-tier change; sharing a project with a group, archiving and transferring are an Owner's acts; group and project access tokens are paid features while service accounts are free but may join only their own hierarchy; a top-level group is created only by hand; some legal usernames are illegal subgroup paths, usernames change, and a renamed path redirects only until someone claims it; the projects a person may read are one membership query, and project topics filter it exactly [[1]] [[2]] [[3]] [[4]] [[5]] [[6]] [[7]] [[8]].
- Playbook's session store is one flat directory the launcher resolves from the shared config's `sessions` key, with hints and leases beside each bundle, and needs no project registry; schema 7 relocates no path, so a session continues only where its recorded working directory exists.
- Every file in the home is classed by what deleting it costs: configuration a person authored, a record of what happened, a derived view rebuilt from records and the store, device state, a runtime artifact of a running process, or a cache.

## Decision

### Concepts

| Concept | Definition | Identity |
| --- | --- | --- |
| Host | A service that authenticates accounts and stores Git repositories; a full host also holds repositories inside namespaces with roles, a plain host offers transport alone. | Its normalized origin URL |
| Account | A person's identity at a host; Spex keeps no account of its own. | `{host, account id}`, the id immutable; the username is display only |
| Namespace | A host container holding members with roles and, possibly, child namespaces and repositories; a role on it reaches every child at no lower level and never a parent; access control lives here and nowhere in Spex. | `{host, namespace id}`; its path is display only |
| Role | What an account may do in a namespace or repository: none, reader, writer, admin, or owner, as a floor over the host's levels; the host's refusal is the access decision, and Spex reads roles only to choose the credential and the route before a first write. | The host's level, mapped below |
| Space | A private Git repository on branch `main` whose root holds a valid `space.yaml`: the declared environment, launcher configuration and records of one audience, synced whole; it is bound to one host repository or unbound, binds once, and two repositories carrying one id are one space, the second found refused as a mount. | The UUID in `space.yaml`; the host repository is a binding |
| Scope | A space is user-scoped, the records of one person named by `subject`, or team-scoped, the records of a namespace's members; set at creation, never changed, read from the marker alone; its controller is whoever holds owner on its namespace, whatever its scope. | `scope` and `subject` in `space.yaml` |
| User space | The one user-scoped space a person owns on a host, in their own namespace; the default space of their devices. | A space |
| Member space | A user-scoped space inside a team's namespace: read by the team's readers, written by the person and by the team's admins and owners, controlled by the team, and the team's when the person leaves. | A space |
| Instance | One Spex server: a provisioning service that owns a public top-level namespace on one host and creates, under its own credential, the namespaces a caller's role cannot. | `{host, top-level namespace id}` and its server URL |
| Operator | The direct owners of an instance's top-level namespace and its service accounts; by inheritance they control every space under the instance. | Read live from the namespace's members |
| Home | This device's root: the mounts of its spaces, the one materialized user environment, device state, and caches; never a repository, never synced as a whole. | The device, with a device id minted once |
| Mount | This device's checkout of one space, with a composing flag and a state: reachable, unreachable, or read-only. | The space's UUID |
| Binding | A device record tying an identity to a location: a mount's binding names `{host, repository id}`, a project's binding names the working directory. | The identity it binds |
| Project | An identity registered in exactly one space and bound per device to a working directory; its record holds its identity and intents, and its sessions are the bundles whose recorded working directory binds to it, in whichever mounted space wrote them. | Its UUID |
| Session | A conversation recorded by Playbook as one bundle, written by one device at a time, in the space whose store the launcher was given. | Playbook's session id |
| Default space | The mount this device registers new projects in and sends terminal sessions to; the user space unless the person sets another mount. | `default` in `home.yaml` |

- The home resolves as the first nonempty `SPEX_HOME`, else the first nonempty `HOME` joined with `.spex`, else the process home directory joined with `.spex`; the core and the launcher resolve it identically, and a mismatch is reported, not repaired.
- A home always holds at least one space: first start creates an unbound user-scoped space as the default, so a person with no account works offline from the first minute.

### Layout

```text
~/.spex/                           HOME: this device
  home.yaml                        configuration
  config/
    registries.yaml                configuration (companion draft)
    playbook.config.yaml           derived: the composed launcher config
  spaces/<space id>/               one mount per space, side by side
  global/                          derived: the user environment (companion draft)
  store/                           cache (companion draft)
  cache/<host>/                    cache
  local/                           state, device-only
    prefs.json
    bindings.json
    sync/<space id>.json
    credentials.yaml
    migrations/
  .lease                           runtime

spaces/<space id>/                 SPACE: one repository, one audience, one sync unit
  space.yaml                       configuration
  spex.yaml                        configuration (companion draft)
  config/playbook.config.yaml      configuration
  projects/<project id>/
    project.json                   record
    intents/<device id>.jsonl      record
  sessions/                        record: Playbook's flat store
    <session id>.json, <session id>.records.jsonl, <session id>.assets/
    <session id>.hints.json, .<session id>.lock/   state and runtime, ignored
  .gitignore, .gitattributes       configuration, managed
```

| Path | Class | Format | Writer | Content |
| --- | --- | --- | --- | --- |
| `home.yaml` | configuration | YAML, `format: 1` | the core, on the person's commands | `device`: UUID minted once; `hosts`: list of `{url, kind: full or plain, client, account}`, `client` the OAuth client id sign-in used; `instances`: list of `{url, host, namespace}`, `namespace` the top-level namespace id; `mounts`: ordered list of `{space, host, repository, composing}`, `host` and `repository` absent for an unbound space; `default`: a space id |
| `spaces/<space id>/` | mount | the space tree | the core, and Playbook's leased session writers inside `sessions/` | The checkout; the surface labels it by its namespace path from the cache, an unbound one as this device's |
| `config/registries.yaml` | configuration | per the companion draft | the person | Named registries and the default; the device fallback for a name no environment defines |
| `config/playbook.config.yaml` | derived | Playbook's format, headed by a comment naming it generated | the core | The composition of the composing mounts' launcher configurations, the user space first, then team spaces in mount order, the device layer above all, with `sessions` and every `from` locator absolute; the launcher reads it here and seeds nothing |
| `global/` | derived | per the companion draft | the core | The user environment, resolved from the composing mounts' requests over the store |
| `store/`, `cache/<host>/` | cache | per the companion draft; canonical JSON | the core | Blobs; per host, the last space listing with roles and namespace records by id, refreshed on sync and on Refresh |
| `local/prefs.json` | state | canonical JSON | the core | Interface language, layout, theme and notifications, the device layer of the launcher configuration; per-record keys by record id: viewed turn, acknowledged repairs, parked controls |
| `local/bindings.json` | state | canonical JSON | the core | Map from project UUID to `{directory, aliases}`, `aliases` the recorded working directories that resolve to the project; one directory binds to one project, and a project's space is the mount carrying its record |
| `local/sync/<space id>.json` | state | canonical JSON | the core | Last sync's time and counts, the apply marker written before the first file is replaced and removed after the ref lands, and the in-flight project move; the synced revision is the checkout's own remote ref |
| `local/credentials.yaml` | state | YAML, owner-only permissions | the core | Host tokens with their kind and expiry, and registry credentials; the OS keyring is an optional backing store; never inside a space or `global/` |
| `local/migrations/` | state | receipts and retained inputs | the core | Migration evidence |
| `.lease` | runtime | lease directory | the core | Writer lease of the one core serving this home |
| `space.yaml` | configuration | YAML, `format: 1` | the creator, in the first commit, never again | `id`: UUID; `scope`: `user` or `team`; `subject`: the `{host, account id}` of the person when `scope` is `user` and the space is bound; a repository is a space iff this file validates, and a reader refuses an unsupported `format` |
| `spex.yaml` | configuration | per the companion draft | writers of the space | The requests the space's members share; a space holds no lock, since only a project and a device resolve |
| `config/playbook.config.yaml` | configuration | Playbook's format | writers of the space | A team space carries `playbooks.<id>` entries alone; a user-scoped space carries the roster, the captain and defaults too; `sessions` and path locators are never written here |
| `projects/<id>/project.json` | record | canonical JSON, `format: 1` | the registering device | `id`: UUID equal to the directory; `name`; `registered`: timestamp; `remotes`: the directory's remote URLs with any userinfo stripped, a URL still carrying one refused, read to offer a binding before a new id is minted; `moved-from`: the source space UUID of a move, absent otherwise; no absolute path |
| `projects/<id>/intents/<device id>.jsonl` | record | JSONL, one act per line | that device | The acts one device appended, each carrying `at` and `by`, the author's `{host, account id}` or `local`; the fold orders acts by `at`, then device id, then line, holds an act naming an intent no shard has queued as pending, and resolves equal ranks and cyclic links at fold time with a diagnostic instead of refusing the project |
| `sessions/` | record | Playbook's store | the launcher | Every bundle this space's store received: `<id>.json`, `<id>.records.jsonl`, `<id>.assets/`, selected or deleted whole; `<id>.hints.json` and `.<id>.lock/` beside them are device state and runtime, ignored by the managed rules |
| `.gitignore`, `.gitattributes` | configuration | Git's | the core | Managed blocks ignoring hints, leases and temporaries, and disabling line-ending conversion |

- Canonical JSON means stable key order, two-space indentation, and a trailing newline; YAML is YAML 1.2 core schema without tags or anchors, edited by targeted comment-preserving writes.
- The whole-unit selection subjects are: a session bundle, one intent shard, `project.json`, `space.yaml`, `spex.yaml`, `config/playbook.config.yaml`, and each managed Git file.
- Every host-side identifier anywhere in the home is the pair `{host, id}`; a space UUID, a project UUID, a session id and a device id stand alone.

### Access

| Role | Host level | May |
| --- | --- | --- |
| none | below 20 | listed as a member, reads nothing |
| reader | 20 to 29 | read the space |
| writer | 30 to 39 | push records and declarations where the write policy admits writers |
| admin | 40 to 49 | push regardless, set the write policy, manage the repository's members, set topics, export |
| owner | 50 | manage namespace members, share, archive, transfer, delete |

- Every space is private; publishing is the registry's job.
- A space's readers and writers are the host's effective members of its repository, direct, inherited and shared; Spex keeps no list of its own and shows the host's list as a lower bound, each entry with its origin namespace, plus every namespace the repository is shared with.
- Write policy by scope: a team space admits writers to `main`, set right after creation; a user-scoped space keeps the host's default and admits admins only.
- The person holds owner on their user space's namespace and exactly one direct admin membership on a member space's namespace, granted at creation; a direct owner of a member space who is not an owner of the team is demoted to admin by adoption and by creation, because the host makes every creator an owner.
- Inheritance fixes what a member space is: every reader of the team reads it, every admin and owner of the team writes it, every owner of the team may archive, transfer or delete it, and leaving the team leaves it behind; a space whose only reader is the person exists only in the person's own namespace.
- The operator controls every space under the instance; the instance says so in its confirmation of every namespace it creates, and the members view shows it as inherited membership.
- A child-only member, one with a role on a child of a team's namespace and none on the team space, receives a direct reader membership on the team space's repository when they need the team's declarations; nothing is shared for that.
- A registry's membership is the registry's own and independent of any space: a team names its registries in its space's requests, a registry credential lives per device, and a missing credential fails that package's installation naming the registry.

### Spaces side by side

- Spaces are peers: parallel on disk, as units of sync, access and lease, and in the mount list; each mount has its own sync machine and write gate, so a sync of one space refuses writes under that space alone and is admitted while no session of that space's projects has a turn in flight.
- The surface lists the user space first, then one heading per team, by the parent namespace id of each repository's cached namespace record, holding the team space and the person's member space.
- Nothing flows between spaces on the host: no space references another, no inheritance, no snapshot of one into another.
- The user environment composes on the device from the composing mounts, per the companion draft; a conflict the person cannot fix in a space they write is escaped by setting `composing` off on a mount.
- The launcher configuration composes by Playbook's own merge, recursive for maps and replacement for every other value, the user space first, then team spaces in mount order, the device layer above all; a `playbooks` entry whose players the composed roster lacks is omitted and listed; a composition the launcher's fail-closed rules reject leaves the last valid composed file active and names the spaces at fault; the core writes `sessions` as the default space's store and every locator absolute, and rejects `sessions` or a path-shaped locator found in a space's configuration.
- A session lands in the store the launcher was given: the core gives a session it starts the store of the project's space; a terminal session lands in the default space; a session joins its project by its working directory through the device's bindings, so a project's history is the union over mounted spaces, and moving a bundle to another space is one whole-unit move that leaves hints and leases behind.
- History is readable wherever the space is; a session continues on a device only where the project's binding equals the bundle's recorded working directory, the runtime and the composed configuration validate against it, and no lease is held; elsewhere it is history, and the surface says so.
- Leases are device-local, so a bundle continued on two devices is a whole-unit choice whose unchosen turns stay in Git history and whose executed effects nothing undoes.
- What leaves a device is a mount's tracked content, hidden records included, readable in full by every reader of the space; the ignored families beside a bundle stay on the device even inside a mount, and the home outside `spaces/` never syncs; a bundle records the working directory it ran in, so a space's readers see where its projects live.
- Before minting a project id, the device compares the directory's remotes with the `remotes` of every project in every mount and offers the match as a binding; one project id present in two mounts without `moved-from` is a named diagnostic, never a union.
- A project moves between spaces only by an explicit move, resumable from `local/sync/` and refused while any of its sessions is live or leased: write the project directory and its session bundles into the destination with `moved-from` set, sync the destination, sync the source again and delete the copied units only where they still equal what was copied, sync; a reader holding both copies treats the one carrying `moved-from` as the project and the other as read-only; a source the device cannot read leaves the source half undone and recorded.
- Removing a project from a space deletes `project.json` alone; its intents and sessions persist unlisted and raise the folder-without-project repair.
- Two writers of one unit are a whole-unit choice; a chosen `spex.yaml` is recomposed on the device, never merged.
- A mount the host refuses stays mounted and unreachable, with its clone and bindings, syncing refused by name until a check succeeds; a mount whose repository is archived, over quota, or read to the person is read-only, and writes into it are refused by name; registering into an unreachable or read-only default space is refused with the picker; nothing on the device is deleted by a host's refusal.
- Unmounting refuses while local units are not on the remote unless the person confirms discarding them.
- A space grows monotonically, since deletion frees no repository history; its remedy is a successor: create a space, move the active projects, archive the full one, which stays a readable mount.
- Leaving a team is ordered: offer a move of each member-space project to the user space, sync, then end the membership; the person's committed records stay with the team, and the surface says so at the first write into a team space.

### Backend interface

The client and the server are written against one provider contract; a full host implements every operation, a plain host the transport alone.

| Operation | Inputs → result | Caller's role |
| --- | --- | --- |
| `signIn(host, client)` | → account `{id, username}` and a credential for the client's own calls, with no client secret | none |
| `idToken(host)` | → a fresh signed token proving the account to a third party, carrying no API power, requested right before the call that needs it | signed in through a client that issues one |
| `namespace(host, ref)` | id or path → `{id, kind, path, parent, visibility, policies}`, policies naming who may create namespaces and repositories and whether sharing is locked | reader |
| `createNamespace(parent, slug, visibility, policies)` | → namespace, its creator demoted to admin unless an owner of the parent | owner of the parent, or admin where its policy allows |
| `members(target)` | namespace or repository → `[{account, role, origin}]`, direct, inherited and shared, plus the namespaces a repository is shared with | reader |
| `setMember(target, account, role)`, `removeMember(target, account)` | → the membership, the role always explicit and never below reader; a removal from a namespace removes the account's direct memberships beneath it | owner of a namespace; admin of a repository |
| `createRepository(namespace, path, visibility, topic)` | → repository `{id}`, tagged with the topic | admin of the namespace |
| `commit(repository, files)` | one atomic first commit on `main` from files, for a creator holding no clone | writer |
| `setWritePolicy(repository, role)` | the least role that may write `main` | admin |
| `share(repository, namespace, maxRole)`, `unshare` | → the share, then the members actually reached, read back | owner of the repository, member of the namespace, no sharing lock |
| `myRepositories(host, topic, minRole)` | → `[{repository, namespace, role}]` for every tagged repository the caller holds at least that role on, through any membership | signed in |
| `repository(host, ref)` | → `{id, path, namespace, archived, size, cloneUrl}` | reader |
| `readFile(repository, path)` | → the file's bytes at `main`, for the marker alone | reader |
| `clone`, `fetch`, `push(repository)` | the whole repository, atomically per push, the URL re-derived from the id before every transport | reader; writer to push |
| `archive(repository)` | → read-only | owner |
| `serviceAccount(topNamespace)` | → an account that uses no seat and may join only that hierarchy, with its credential | owner of the top-level namespace |

SDK operations run on the device with the person's credential; each composes the operations above and checks the role it needs before its first write.
Where the person's role does not suffice, the operation goes to the instance's server when the target lies under the instance, and otherwise stops and names the namespace's owners and the act they must perform.

| SDK operation | Steps | Precondition |
| --- | --- | --- |
| `signIn(host)` | `signIn` with the host's client; store the credential; record the account | none |
| `listSpaces(host)` | `myRepositories(host, "spex-space", reader)`; cache; best-effort, with Refresh | signed in |
| `mount(locator, composing)`, `unmount(space)` | `repository` by URL or `{host, id}`; `clone`; validate `space.yaml`; record the mount; unmounting removes the checkout and the mount, keeping `local/` state | reader; unmounting as above |
| `createSpace(namespace, scope, subject?, from?)` | `createRepository(namespace, "spex", private, "spex-space")`; `setWritePolicy(writer)` for a team space; first commit of `space.yaml` with a fresh UUID and the managed files, or the unbound mount `from` pushed to the empty repository | admin of the namespace |
| `createMemberNamespace(team, account)` | `createNamespace(team, username, private, {namespaces: owner, repositories: admin})`, retried as `<username>-<account id>` where the host refuses the path; `setMember(account, admin)` | owner of the team, or admin where allowed |
| `status(space)`, `sync(space)` | `repository`; save local units as a commit, `fetch`, whole-unit compare, ask per conflict, apply, `push`; an unbound space saves alone | reader; writer to push |
| `members(space)`, `setMember`, `removeMember` | the provider operations on the space's namespace or repository | as the provider requires |
| `share(space, namespace, maxRole)`, `unshare` | the provider operations on the repository | owner |
| `adoptNamespace(host, ref)` | `namespace`; `myRepositories` under it; `createSpace` where the namespace holds no tagged repository; a child namespace whose repository carries a user-scoped marker is that subject's member space, any other child is listed for the owner to confirm; demote member-space owners | owner of the namespace |
| `moveProject(project, from, to)` | the move sequence above | writer of the destination |
| `leave(space)` | the leave sequence above; `removeMember(namespace, self)` | member, not the sole owner |
| `archive(space)` | `archive` | owner |

Server operations run with the instance's credential after verifying the caller's id token: issuer the host, audience one of the instance's accepted clients, expiry unpassed, subject the account id; the server receives nothing else and holds no data beyond its credential.

| Server operation | Steps | Caller |
| --- | --- | --- |
| `createTeam(slug)` | `createNamespace(t, slug, private, {namespaces: owner, repositories: admin})`; `setMember(caller, owner)`; `createSpace(it, team)` | admitted by the operator's policy, which this record leaves to the operator |
| `ensureMemberSpace(team)` | `createMemberNamespace(team, caller)`; `createSpace(it, user, caller)`, the first commit made through `commit`; find before create at every step | a member of that team under the instance whose role falls short |
| `describe()` | → `{format, host, namespace id and path, clients, teams container id, credentialExpiry}`, the instance document a device reads when the person adds the instance by URL | anyone |

- Bootstrap is the operator's, under the human owner's own credential: create the public top-level namespace in the host's interface and pass the host's identity verification; `serviceAccount`; `setMember(it, owner)`; `createNamespace(top, "t", private, {namespaces: owner, repositories: admin})` with no direct members and sharing outside the hierarchy allowed; configure the server with the credential and rotate it before its expiry, which `describe` publishes.
- A device ships one built-in client for gitlab.com, so sign-in and a user space in the person's own namespace need no instance; an instance names the clients whose tokens it accepts, and adding one that excludes the host's client is refused with that reason.
- A personal access token signs in without an id token, so a device holding one runs every SDK operation its role allows and no server operation.

### Mapping to GitLab

| Spex | GitLab | Caveat |
| --- | --- | --- |
| Full host | A GitLab instance, first gitlab.com; a plain host is any Git remote | |
| Account | A user; `id` immutable, `username` renamable | |
| Namespace | A group, subgroup, or user namespace, read as `GET /namespaces/:id` with `kind`; policies and parent from `GET /groups/:id` | A user namespace holds projects only; group list endpoints allow 50 requests a minute and are never called in steady state |
| Namespace policies | `subgroup_creation_level`, `project_creation_level`, `share_with_group_lock`, `prevent_sharing_groups_outside_hierarchy`, `visibility` | New groups default to maintainer and developer creation levels |
| Role floors | Access levels 20, 30, 40, 50; Guest 10, Planner 15 and Minimal 5 are none | The members API defaults to 30, so every call passes the level |
| Space | A private project at path `spex` on branch `main`, topic `spex-space` | A leading-dot path passes enforcement but the documentation forbids it; `spex` costs nothing |
| Write policy | Delete the default protected-branch rule, create `main` with `push_access_level` 30 and `merge_access_level` 30; a user-scoped space keeps the default 40 | Group-level defaults and `PATCH` of levels are paid |
| User space | `<username>/spex`, the person Owner | Follows a username change; no ancestor, no cap, no server; invisible to the instance |
| Team space under an instance | `<top>/t/<slug>/spex`, founders Owner of `t/<slug>` | |
| Reused team space | `<group>/spex` | A reused private Free top-level group is capped at five unique users |
| Member space | `<group>/<username>/spex` as the creation convention, identified by marker; the person Maintainer of the subgroup | A Maintainer may rename the repository path, which the topic and id survive |
| Instance | A public top-level group, identified by id, plus a group service account holding Owner with an `api` personal access token of at most 365 days | Public groups are exempt from the cap by the rule's wording; a group turned private puts the instance read-only, so the client refuses a non-public instance; accounts created after 2026-01-27 may own three top-level groups |
| Teams container | Private subgroup `t` with no direct members | |
| Operator | `GET /groups/:id/members/all` of the top-level group at level 50 | |
| `signIn` | OAuth 2.0 authorization code with PKCE, or the device grant for headless hosts; scopes `api`, `write_repository`, `openid`; `GET /user` | Access tokens live two hours; refresh rotates both tokens, persisted before use |
| `idToken` | The OpenID Connect id token; verified against `/.well-known/openid-configuration` and `/oauth/discovery/keys` | |
| `namespace` | `GET /namespaces/:id`, `GET /groups/:id` | |
| `createNamespace` | `POST /groups` with `parent_id`; then `PUT /groups/:id/members/:user_id` to 40 for a creator who is not an owner of the parent | A top-level group is created in the UI only |
| `members`, `setMember`, `removeMember` | `GET .../members/all` and `shared_with_groups` of `GET /projects/:id`; `POST`, `PUT`, `DELETE /groups/:id/members`, the same under `/projects/:id`, `DELETE` with `skip_subresources=false` | Members of private invited groups the caller cannot see are omitted; the web UI keeps subgroup memberships unless its checkbox is ticked |
| `createRepository` | `POST /projects` with `namespace_id`, `path`, `visibility`, `topics` | The creator gets no direct role, hence admin required |
| `commit` | `POST /projects/:id/repository/commits` with `actions` | One request, one commit |
| `setWritePolicy` | `DELETE` then `POST /projects/:id/protected_branches` | |
| `share`, `unshare` | `POST`, `DELETE /projects/:id/share`, then `GET /projects/:id/members/all` | A project share reaches the invited group's direct, inherited and shared members at the lower role; group-to-group sharing is never used |
| `myRepositories` | `GET /projects?membership=true&topic=spex-space&min_access_level=20` with keyset pagination | Authorization tables refresh asynchronously, so a fresh share may lag |
| `repository` | `GET /projects/:id?statistics=true`, `http_url_to_repo`, `namespace` | 10 GiB per project on Free, read-only beyond |
| `readFile` | `GET /projects/:id/repository/files/space.yaml/raw?ref=main` | 300 requests a minute per path |
| `clone`, `fetch`, `push` | Git over HTTPS as `oauth2:<token>` | Git HTTPS allows 10,000 requests a minute |
| `archive` | `POST /projects/:id/archive` | |
| `serviceAccount` | `POST /groups/:id/service_accounts`, then its personal access tokens endpoint | Free since 18.11, 100 per top-level group, members of their own hierarchy only; whether the account rotates its own token is unverified |
| `describe` | Served by the instance's server, not by GitLab | |

### Considered and declined

- Mirroring the namespace tree on disk: binds the layout to host paths, moves checkouts on a rename, and roots nothing for a person with spaces on two hosts.
- A child space snapshotting or referencing its parent's declarations: a subgroup's readers include people the parent excludes, and the device composes what the person can read.
- Sessions under each project's directory: the launcher writes one flat store and knows no project; moving bundles between stores is the whole-unit move the law already has.
- Intent shards per author: one person's two devices still collide; a shard per device has one writer.
- A per-person namespace under the instance: the person's own namespace already is their user space, cap-free, operator-invisible and server-free, while an instance-hosted one needs an admission policy, a demotion rule, a deletion operation, a username-independent path, and a disclosure; a host without personal namespaces would reopen the question.
- Addressing people by username anywhere but as a creation convention: usernames rename, collide with reserved words, and are reclaimed; the account id does none of that.
- A device-chosen alias for a mount directory: a name the marker and the host already supply, with uniqueness and casing rules of its own.
- Delegating an adopted group to the instance: a service account may join only its own hierarchy.
- A public instance card as a GitLab project: a shared raw-file rate limit and a path a stranger could claim; the server describes itself.
- Invitations by email: a member signs in to the host first, then is added.
- Group-to-group sharing: it fans into every member space.
- A lock in a space, merging locks across spaces by precedence, or a derived view inside every mount: decided in the companion draft.
- Proxying host calls through the server: a second trust root and a terms problem; the person's own account is first-party.

## Consequences

- One person holds any number of spaces, each with its own audience, and sees them side by side; a team adopts the group it already has by adding one repository per space, and nothing about its membership is copied.
- The Space surface becomes a surface over mounts: list, sign in, mount by discovery or locator, sync per space, members and sharing by the host's roles, the privacy panel and the explorer defined per mount, stating what leaves and what stays.
- Migration of today's home runs once under the home lease with old writers stopped, on a home whose `main` equals its remote's or with the person's consent, and leaves a receipt: the repository moves to `spaces/<space id>/` and one commit rewrites the layout and adds `space.yaml` with the new UUID; `projects.json` entries become `projects/<id>/project.json`; `intents/<id>.jsonl` becomes `projects/<id>/intents/<device id>.jsonl` with `at` and `by` filled from the device; `sessions/` stays as it is; `playbooks/<id>/` stays as legacy units whose locators the composition rewrites until the companion draft's packages replace them; `local/project-paths.json` becomes `local/bindings.json`; `prefs.json` moves under `local/`; the old remote becomes the mount's binding when it is a tagged `spex` repository on a full host, a plain-host binding when it is any other Git remote; another device still on the old layout is refused by the marker it cannot read.
- Asks to Playbook, made once: `projectId` and author in the manifest; tuning and parked controls in the manifest so a session travels whole; the hint and lease files beside a bundle stay as they are.
- Asks to Settings: a write names the space it edits; the launcher reads the composed file.
- GitLab.com checks before launch: whether the Subscription Agreement's third-party-access and service-bureau clauses permit a public provisioning service, which counsel reviews; whether the `api` scope alone authorizes Git over HTTPS; whether a service account rotates its own token.

## References

[1]: https://docs.gitlab.com/user/group/subgroups/ "GitLab subgroups: membership inheritance and creation"
[2]: https://docs.gitlab.com/user/permissions/ "GitLab roles and permissions"
[3]: https://docs.gitlab.com/user/free_user_limit/ "GitLab.com Free tier user limit"
[4]: https://docs.gitlab.com/user/project/repository/branches/protected/ "GitLab protected branches"
[5]: https://docs.gitlab.com/user/project/members/sharing_projects_groups/ "GitLab sharing projects and groups"
[6]: https://docs.gitlab.com/user/profile/service_accounts/ "GitLab service accounts"
[7]: https://docs.gitlab.com/api/projects/ "GitLab Projects API"
[8]: https://docs.gitlab.com/user/project/repository/ "GitLab repository paths and redirects"
