<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Codex DR draft: Spaces, Projects, and Portable Storage

## Status

Draft for review, 2026-10-02; not accepted and not implemented.
The requested `codex-` filename remains outside `specs/decisions/` until acceptance assigns a numeric DR ID.
This proposal does not amend existing accepted decisions or authorize migration, remote provisioning, or deletion.
Its scope is the conceptual model, local file contract, logical backend interface, and feasibility mapping to GitLab.com; wire protocols, SDK code, synchronization algorithms, process locking, and migration implementation are out of scope.

## Context

Spex needs personal and team work, individual-project and group sharing, portable history, package authoring and installation, and reuse of existing GitLab groups without duplicating their membership.
One repository containing every project's history cannot support independent project access through GitLab's permissions.
The current single-home storage and repository-only project definitions in [DR-045](specs/decisions/045-unified-session-storage.md), [DR-057](specs/decisions/057-space-surface.md), and [DR-006](specs/decisions/006-projects-and-forge.md) therefore need an explicit successor, not another directory naming convention.

## Decision

### 1. Concepts and identities

| Concept | Exact meaning and cardinality | GitLab adapter mapping |
| --- | --- | --- |
| Service | One Spex backend authority, with its own endpoint and stable service UUID; serves hosted and adopted spaces | One public top-level group; a private service-control project holds provider bindings and operation records, not users' working content |
| Account | An authenticated person in a service; identified by an opaque account ID, not a username | A binding to GitLab's numeric user ID; GitLab owns sign-in and account lifecycle |
| Space | An ownership and membership scope containing projects and zero or more child spaces; one parent or none, with no ownership cycles | One group/subgroup; a backend namespace is the adapter's implementation of this concept, not a second Spex concept |
| Personal space | A space explicitly associated with one account for personal work; an account can have several and designate one default | Hosted private subgroup or explicitly adopted existing subgroup; the designation does not override inherited permissions |
| Team space | A space used collaboratively; its effective audience is determined by membership, sharing, and inheritance | Hosted or adopted group/subgroup, retaining its existing members and policies |
| Project | The independently shareable, revisioned unit of durable Spex work; a supported remote project has exactly one owning space | One dedicated private storage project, independent of any source repository it references |
| Home project | An ordinary project designated as the default for one space's settings, packages, and otherwise unassigned work; one per initialized space | An ordinary storage project in that space's group, designated by a binding and its `space.yaml` |
| Package | A set of related source/spec/skill/applet artifacts; an editable package has a project-local UUID before it has a publication name or version | Files within a storage project's repository; not a GitLab package-registry entity |
| Artifact / variant | A source, GEARS spec, skill, or applet and its selectable locale/form/implementation; a playbook is an applet | Native files inside a package; no separate group, project, or ACL |
| Resource | An external repository or directory a project works on; linking it grants no access and copies no bytes | Optional reference to an ordinary GitLab project, another host's repository, or a local directory |
| Session bundle | One runtime-owned consistent checkpoint, presentation history, context, and declared attachments | Exact native files within one storage project, with large binary bytes eligible for Git LFS |
| Working directory | A device-specific directory used to edit or execute a project's managed package or external resource; zero or more per project | No GitLab entity; optionally a local checkout of a separately authorized source repository |
| Mount | The local materialization of one project plus its connection bindings; mounting never creates access | A local copy backed by an authorized storage-project binding |
| Environment | A package request manifest, exact lock, and generated installation at one directory | Manifests are project content; generated installations have no remote mapping |
| Revision | An opaque token identifying one complete project snapshot, including file bytes and executable flags | A storage-branch commit plus its referenced LFS objects, encoded behind an opaque API token |
| Grant / capability | A grant is one direct membership or sharing relationship; a capability is an action the caller can currently perform after all applicable policy | Native memberships/invitations/shares and effective project/group/branch permissions |

Space and project IDs are canonical lowercase UUIDs, independent of provider IDs, names, URLs, and filesystem paths.
IDs survive download, rename, and ownership transfer; a copy/fork receives a new project ID and records origin provenance.
One project has one authoritative remote binding, although several accounts or connections may reach that same remote.
A second remote containing a copied UUID is an identity conflict, not evidence that its contents should be merged.
Rebinding the same identity to a replacement remote is an explicit migration, while adopting a fork requires a new identity.
Local-only projects have UUIDs but no remote owner or binding until explicitly published into a space.
Backend descriptors, not editable project files or local catalogs, determine live ownership and permissions.

### 2. Ownership, sharing, and Home

Projects belong logically to spaces, but local payloads are stored once by project ID because sharing creates several access paths.
A project reader does not need permission to list its owner's other projects or read its Home project.
Space grouping in the UI and the physical local directory tree are therefore separate.
The same project can appear under its owner, a space with which it is shared, and a direct-share view without another local copy.
Discovery returns effective access after provider rules; it never assumes that membership in a subgroup grants membership in its parent or that every group-sharing relation is recursively transitive [[1]].
Access provenance can be redacted when the caller cannot inspect the granting group.

A Home project has the same content and sharing rules as any other project, so sharing it shares its settings and unassigned work too.
It is not an ACL database or a prerequisite for discovering the space.
An observed or adopted but uninitialized space may have no Home; existing project access continues normally.
Initialization creates or designates a Home idempotently; `setHome` replaces or clears the designation, and a Home cannot be independently transferred or deleted before that operation completes.
Changing Home requires management of the space and write access to reachable affected old/new projects; it does not copy their contents.
The operation validates the new project belongs to the space, records its Home purpose and `space.yaml`, removes the old designation record and restores the old project to work purpose, then reports completion with exactly one or zero Home designations.
The operation is recoverable and may be pending: there is no claim of an atomic GitLab transaction across those resources.
If the former Home is confirmed missing or inaccessible, an authorized space manager may still replace or clear the authoritative designation; report unreachable marker cleanup as a warning, never use that stale marker as authority, and do not block unrelated project readers.
The API's space descriptor is authoritative for the designation; Home's `space.yaml` is its portable identity record, not authority to claim an arbitrary group.

New work names a project, defaulting to the selected space's Home.
Required project configuration and dependency selections are explicit within that project: defaults may be copied at creation, but there is no hidden live dependency on another project's config.
The personal Home supplies the user's explicitly selected global package environment; other project environments resolve independently and never silently borrow it.
Per-person preferences about shared work may live in that person's Home subject to its effective audience; values intended to remain device-private stay under local/, never implicitly in a shared project's config.
All children of a project share its audience; sharing a subset means exporting that subset or creating a separately shareable project, not inventing directory ACLs.

### 3. Portable layout and file formats

Spex home defaults to `~/.spex`, or `%USERPROFILE%\.spex` on Windows; a nonempty `SPEX_HOME` overrides it.
This describes format portability, not a new promise about supported native execution hosts.
Only portable project files are synchronized; the home itself is not one repository.
Every path family allowed by this design is listed below; unspecified generated files belong under `.spex/` or `cache/`, and unspecified private device state belongs under `local/`.

```text
~/.spex/
  connections.yaml
  projects/<project-id>/
    project.yaml
    space.yaml                         # Home only
    config/spex.yaml
    config/playbook.config.yaml
    spex.yaml
    spex.lock
    intents.jsonl
    packages/<package-id>/
    package-snapshots/<manifest-digest>/manifest.json
    package-snapshots/<manifest-digest>/files/<package-relative-path>
    authoring/<draft-id>/target.yaml
    authoring/<draft-id>/draft.json
    authoring/<draft-id>/records.jsonl
    sessions/<session-id>/bundle.yaml
    sessions/<session-id>/<session-id>.json
    sessions/<session-id>/<session-id>.records.jsonl
    sessions/<session-id>/<session-id>.assets/
    .spex/{packages,specs,skills,bin,build}/
  store/files/sha256/<digest>[-exec]
  cache/
  local/catalog.json
  local/bindings.json
  local/sync/<project-id>/
  local/runtime/<project-id>/
  local/preferences.json
  local/credentials/
```

Here `P` means portable project content at exactly the same relative path beneath `data/` in its GitLab storage repository; `L` means durable device-local data with no GitLab mapping; `G` means generated/rebuildable local data with no GitLab mapping.

| Path | Format, contents, and ownership | Class / GitLab mapping |
| --- | --- | --- |
| `connections.yaml` | YAML `{format:1,connections:[{id,endpoint,accountId}],defaultConnection?,defaultPersonalSpace?}`; connection IDs are UUIDs, endpoint is a Spex API URL, and account IDs are opaque; no tokens | L |
| `projects/<id>/` | One portable work root plus its excluded `.spex/`; unuploaded changes are valuable local work, not cache | P for listed portable children |
| `project.yaml` | YAML `{format:1,id,label,purpose,resources,origin?}`; ID matches directory, `label` is a portable display fallback, `purpose` is `work` or `home`, resources are `{id,label,kind,uri?}` with UUID IDs and kind `repository` or `directory`; URI has no embedded credentials, and absolute device paths are forbidden; origin is `{projectId,revision}` for a copy | P; live name/owner from API descriptor; manifest identity must match registered binding |
| `space.yaml` | Home-only YAML `{format:1,id,kind,personalAccountId?}`; space UUID, kind `personal` or `team`, and account ID required only for personal; no roster, ACL, or backend group ID | P; identity record for the group's registered Home, checked against adapter bindings |
| `config/spex.yaml` | YAML `{format:1,locale?}`; locale is a BCP 47 preferred human language; future settings require an explicit schema change or namespaced extension | P; this project's preferences, or personal Home's user preference |
| `config/playbook.config.yaml` | Unmodified Playbook launcher configuration; file locators resolve relative to this directory; credentials are resolved locally, not embedded | P; enclosed native contract [[2]] |
| `spex.yaml` / `spex.lock` | YAML requests / exact resolution, each format 2; self-contained registry routing, selectors, request digest, source identity, selected file inventory, and exports follow the [package draft](codex-dr-package-format-and-environments.md) | P; no hidden Home configuration fallback |
| `intents.jsonl` | Spex intent-act log scoped to this project; existing act fields and lifecycle remain owned by [[storage-4](specs/packages/storage.md#storage-4)] and [[core-service-52](specs/packages/core-service.md#core-service-52)]; complete records are retained and never concatenated to resolve conflicts | P; no GitLab issue is created by recording an intent |
| `packages/<package-id>/` | Editable package root, containing authored sources and retained derived specs/implementations; package UUID is not its publication name; published content follows the enclosed package manifest and native variant layouts | P; regular repository/LFS files, not the package registry |
| `package-snapshots/<digest>/` | Immutable selected local-package files and format-1 manifest, with inventory identical to its lock entry, per the [package draft](codex-dr-package-format-and-environments.md); digest is SHA-256 of the canonical manifest bytes [[18]] | P; required snapshots survive deletion of editable files, cache, and package store |
| `authoring/<draft-id>/target.yaml` | YAML `{format:1,id,packageId,artifactId,sourcePath,state}`; draft UUID matches directory, artifact ID is the intended package artifact, source path is package-relative, state is `draft` or `registered`; each authoring task has one explicit target | P; several tasks/artifacts may belong to one package |
| `authoring/<draft-id>/draft.json` | Spex v1 authoring state with `id` equal to draft ID; holds queue, compile result, and proposal under [[storage-23](specs/packages/storage.md#storage-23)]; target.yaml supplies the package/artifact/source binding that replaces the former filename-derived target | P; no provider resume credentials; native source/entry names are not forced to equal UUIDs |
| `authoring/<draft-id>/records.jsonl` | Existing authoring `{seq,record}` transcript, monotonically ordered by positive sequence; exact complete records retained | P; registration changes target state and retains authoring history rather than deleting the task |
| `sessions/<sid>/bundle.yaml` | Spex envelope `{format:1,id,projectLabel,resources}`; ID matches directory, resources are captured `{id,label,kind,uri?}` records with the same types as project resources, independent of their later removal/rename; runtime files below remain native | P; association and historical presentation, never runtime authorization |
| Native session files and `<sid>.assets/` | Native manifest, proven replay prefix, and complete declared immutable assets exported by Playbook; byte-exact files and names, with no injected Spex fields | P; native schema/asset contracts [[3]] [[4]], assets may use LFS |
| `.spex/packages/<org>/<name>/` | Selected installed package files, one source/version per identity and preserving verified package-relative paths; registry identity stays in the lock | G; recreated from project lock and shared store |
| `.spex/specs/` | Composed spec indexes referencing verified installed files, never merged replacements of published text | G |
| `.spex/skills/` / `.spex/bin/` | Skill exports and CLI launchers named by resolved export aliases; duplicates within an environment are errors | G; shared-space exports do not overwrite personal exports implicitly |
| `.spex/build/` | Mechanically reproducible bundles and intermediate products, keyed by their project/package inputs | G; AI-generated specs/code never become disposable merely because a compiler produced them |
| `store/files/sha256/<digest>[-exec]` | Immutable package bytes keyed by SHA-256 plus executable flag; `-exec` distinguishes identical bytes requiring executable mode | G; shared across authorized local environments, never an ACL or evidence of installation |
| `cache/` | Downloaded archives, metadata, indexes, and disposable transport caches | G; deleting it loses no authored or pending work |
| `local/catalog.json` | JSON `{format:1,checkedAt,spaces,projects}` containing last observed API descriptors; absence or stale data never proves deletion or revocation | G; cache of API results, no remote writeback |
| `local/bindings.json` | JSON `{format:1,mounts,workingDirectories,exports}`; mounts `{projectId,connectionIds,offline}`, with connection IDs from connections.yaml and boolean offline-retention preference; directory records `{id,projectId,resourceId?,packageId?,path,aliases}` with exactly one resource/package selector and absolute device paths; exports are `{projectId,scope,workingDirectoryId?,agents}` with scope `user` or `project`, same-project working-directory ID required only for project scope, and distinct adapter IDs; arrays may be empty, multiple bindings allowed, ambiguous path lookup requires selection | L; user exports require the selected personal Home, and project exports require a chosen working directory; only requested adapters authorized by the binding receive exports; an empty mount connection list denotes local-only work |
| `local/sync/<project-id>/` | Durable synchronization base revision, base content needed for comparisons, pending changes, and unresolved incoming/conflict snapshots | L; not cache; exact internal encoding belongs to later synchronization design |
| `local/runtime/<project-id>/` | Runtime-owned hints and device-specific execution material, segregated from native portable exports | L; native runtime storage APIs govern placement/encoding, not a second Spex session schema |
| `local/preferences.json` | JSON `{format:1,values}` with namespaced JSON-valued device/UI preferences, including viewed markers; not portable task/session configuration | L |
| `local/credentials/` | Optional credential-provider-owned private files or references; no mandated plaintext format | L; GitLab/service tokens never enter project content or shared blobs |

A target source must exist when compilation starts; retaining an authoring record after its source is removed preserves history without making the missing target compilable.
The native encodings referenced above are current contracts in [storage](specs/packages/storage.md) and [core-service](specs/packages/core-service.md), not fields that this draft silently changes.
Absent optional files mean no corresponding data; `project.yaml` is required, and an initialized Home also requires `space.yaml`.
Native runtime directory adapters may require changes before this physical enclosure is usable; portable export is the boundary, and current runtime compatibility is not assumed.

Spex-owned YAML uses YAML 1.2 with unique keys and no custom tags; JSON uses unique keys; new text uses UTF-8 and LF, and JSONL has one complete JSON record per line.
Unknown required formats are preserved and reported as unsupported; they are not guessed, rewritten, or executed.
Each Spex-owned schema starts at its stated `format`; breaking changes increment that schema, and ignored optional extensions use `x-<namespace>-<name>` keys.
Enclosed formats keep their own version fields, and existing integrity-bound native bytes are never reformatted.
Portable storage preserves path, exact bytes, and executable flag only; symlinks and special files are rejected, and empty directories carry no meaning.
Paths are relative and traversal-free, use components of 1–255 UTF-8 bytes other than dot/dot-dot, and exclude control characters and `/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|` within components.
File/directory collisions, Windows device names with or without extensions, trailing dots/spaces, and duplicate file or implied-directory paths after NFC/case-folding are rejected before upload and after download.
Runtime materialization may impose stricter private-file modes and single-link ownership checks; session assets are not hard-linked from the package store.
All JSON object examples are closed except documented x-prefixed extensions; UUID sets and path keys are unique, sizes/sequences are nonnegative safe integers with sequences starting at one, digests are lowercase SHA-256, and checkedAt is an RFC 3339 timestamp and expiresOn is a YYYY-MM-DD calendar date; sub-day expiration precision is unsupported rather than silently truncated; enclosed native schemas keep their own time encodings.

### 4. Packages, authoring, and session closure

The pipeline is optional phases of one package: source/intent/skill, localized GEARS, then applets including CLI/browser/Desktop playbooks.
A package can carry any subset; full and wrapper skill variants share the same specs/applet, and a wrapper explicitly invokes an included applet target.
One published package has one SemVer version and a versioned manifest; native Agent Skills directories and runtime applet formats remain enclosed rather than replaced.
The [package draft](codex-dr-package-format-and-environments.md) defines the release layout, manifest, source routing, dependency/variant resolution, environment schemas, selected snapshots, exports, and registry boundary.
This draft owns project placement and backend storage; registry publication remains a separate operation.

An editable package may be incomplete and need no publication org/name/version; packaging constructs and validates a complete candidate before it can be installed or published.
Installation from local work captures immutable selected files under `package-snapshots/`; replay reads that snapshot, not a later edit of the source.
A current lock's snapshots remain portable project content even when the shared store holds identical bytes.
Publication exports only declared package files, never authoring records, sessions, or the project manifest.
Installed packages are immutable materializations; editable packages are never edited through shared store links.
Agent export destinations are device bindings, independent of the project's storage path; portable requests express adapter intent but do not authorize a destination automatically.

Starting a new playbook creates or selects a package and an explicit authoring target in a chosen project, with authoring records outside its package root.
Incomplete packages may compile/run through their native development runtime but cannot be installed into an environment until they have a complete format-2 manifest.
Supplying local org/name/version metadata requires no registry account, namespace ownership, or publication.
Compilation retains source, generated GEARS, generated code, and non-reproducible outputs; only outputs reproducible from retained inputs and declared toolchain/configuration belong in `.spex/build/`.
Working on an external repository changes that repository's working directory, not a mirrored copy under Spex home; only explicitly captured package/session files are backed up here.

A session's native checkpoint and its proven replay prefix and declared assets are one consistency unit, exported through Playbook's native exporter [[3]].
The Spex envelope captures project/resource labels so historical display needs no live catalog, source checkout, Home project, or provider conversation.
External URLs remain links; they are not promised to be captured attachments.
Missing declared assets or an invalid checkpoint prevent claiming a complete portable bundle; unrelated valid projects remain usable.
Viewing a bundle on another device is independent of permission to execute its former tools; continuation requires the runtime's identity, resource, and effect checks and never follows merely from rebinding a directory.

### 5. Backend architecture and common contract

Clients call a provider-neutral Spex service through a thin SDK; the storage/membership domain is not placed inside the general agent runtime.
The service delegates normal content and management operations as the caller and uses service authority only for its own control data and explicitly scoped hosted provisioning.
An operator token's access is never substituted for a denied end-user request.
GitLab is the authority for its users and effective grants; the service has no independent password store or shadow allow-list.
Provider URLs, group/project IDs, branch names, and OAuth credentials occur only in adapter bindings, never public IDs or portable authorization files.
The service-control project stores identity/resource bindings and mutation outcomes durably; this is adapter metadata, not a public tenant directory or a second copy of user content.
Its internal encoding and caching strategy are implementation concerns.
Read-only observation may register stable IDs for accessible groups without adopting them or changing any native resource; adoption separately enables Spex management/provisioning within that scope.

These are logical interface operations, not a prescribed HTTP route or SDK syntax.
All operate on one selected connection/account; IDs are opaque, path entries follow the portable rules, and list results are paginated `{items,nextCursor?}` without requiring a globally atomic catalog snapshot.
Every mutation has a caller-generated `requestId`; retrying the same request returns its recorded outcome or pending operation, while reusing the ID for different arguments is invalid.
Slow/provider-accepted mutations return an operation ID and are not reported complete before the defined postcondition holds.
Errors distinguish `invalid`, `unauthenticated`, `unavailable-or-forbidden`, `conflict`, `identity-conflict`, `unsupported`, `quota`, `rate-limited`, and `temporary`; optional retry information does not discard local work.
Responses never reveal inaccessible resources merely to distinguish absence from denial.

| Returned type | Required meaning |
| --- | --- |
| `Account` | `{id,label}` for current authenticated identity |
| `Space` | `{id,label,parentId?,kind,personalAccountId?,homeProjectId?,managed,status,capabilities}`; managed is a boolean distinguishing adopted/hosted scopes from observation; parent/owner details may be withheld when inaccessible; status `uninitialized`, `active`, `archived`, or `unavailable` |
| `Project` | `{id,label,ownerSpaceId?,purpose,status,capabilities,revision?}`; status `active`, `archived`, `pending-deletion`, `unsupported-location`, or `unavailable`; omitted revision means content unreadable or not initialized |
| `Capabilities` | Map from logical operation names in the next table to booleans for this caller/resource; absent means unsupported; in particular createSpace, createProject, adoptSpace, initializeHome, setHome, and detachSpace are distinct; native policy and token scope apply, and true is advisory at observation time |
| `Grant` | `{id,subject,role,origin,direct,expiresOn?,mutable}`; subject is account/space or redacted; role is an opaque assignable role ID; origin can be redacted; identity addresses exactly one native membership, invitation, or share |
| `Role` | `{id,label,description}` returned for that target, describing the native privileges the grant would confer; roles are not misleading universal read/write aliases |
| `Snapshot` | `{projectId,revision,files}`; each file `{path,sha256,size,executable}` describes actual content bytes, not an LFS pointer or archive digest |
| `Operation` | `{id,state,result?,error?,warnings?}` with `pending`, `succeeded`, or `failed`; includes the resulting resource descriptor where applicable; warnings are `{code,resourceId?}` records for non-authoritative cleanup that could not finish |

An adapter can deny an action immediately after a capability check if permissions or state changed.
Read-only discovery and attachment do not require write access; provisioning, adoption, Home management, detachment, and membership changes require their distinct capabilities.
For the GitLab adapter, adopting/detaching a group and changing its Home designation require group Owner authority; writing Home records also requires the corresponding project permissions, subject to the stale-Home repair exception.
A personal-account association requires that account to be the caller or an explicitly selected existing member under an authorized space administrator; names alone never establish the association.

### 6. Complete logical interface and GitLab mapping

GitLab paths in this table are relative to `/api/v4` except OAuth and Git/LFS protocols.
Creation, adoption, and Home changes can leave pending provider resources after an interruption; operation recovery identifies them and never assumes a multi-resource rollback succeeded.
The table states required outcomes and backend dependencies, not internal call ordering.
Native member endpoints are `/groups/:id/members` and `/projects/:id/members` with user-ID suffixes for mutation and `/all` for effective listings; invitation endpoints use `/invitations`, and group shares use `/share`; their actual grant identifiers stay adapter-local [[20]].

| Operation and inputs | Result / invariant | GitLab dependency |
| --- | --- | --- |
| `describe()` | Service ID, API/schema versions, supported operations and limits; independent of user project data | Service configuration bound to the public root and private control project |
| `beginSignIn(returnTo)`, `finishSignIn(flow,response)` | Backend-directed browser/device authorization and authenticated connection; no GitLab password handled by Spex | OAuth authorization-code/PKCE or device endpoints; `/oauth/token`; `GET /user` [[5]] |
| `currentAccount()`, `signOut()` | Current Account; invalidate this Spex connection and its delegated credential without deleting projects or GitLab account | `GET /user`, `/oauth/revoke` as appropriate [[5]] |
| `discoverSpaces(cursor)`, `getSpace(id)` | Accessible bound spaces, including effective inherited/shared access; discovery not limited to the service root | `GET /groups`, group/subgroup/share lookups and registered bindings [[6]] |
| `discoverAdoptableSpaces(cursor)` | Existing unmanaged management scopes, including observed or detached scopes, plus opaque adoption handles and capabilities; no creation | Authorized group listings [[6]] |
| `adoptSpace(handle,kind,personalAccountId?)` | Bind the existing scope in place and preserve its members; initialize/reuse Home when authorized, otherwise remain uninitialized | `GET /groups/:id`, existing project discovery, optional `POST /projects`; binding metadata |
| `createSpace(parent?,label,kind,personalAccountId?)` | Create owned scope and designate Home; parent omitted means service's hosted root, not a new GitLab top-level group | `POST /groups` with `parent_id`, `POST /projects`, scoped membership grant [[6]] [[7]] |
| `initializeHome(spaceId)` | Return current valid Home or create/designate one idempotently; never replace an existing Home implicitly | `GET /groups/:id/projects`, `POST /projects` when absent; identity files and binding |
| `setHome(spaceId,projectId|null)` | Replace/clear designation with the ownership, record cleanup, access, and pending-operation rules above; null leaves the space uninitialized | Group/project lookup; conditional content writes to affected Home records and control designation; no native ACL copying |
| `detachSpace(id,includeDescendants)` | Deactivate service management associations and their active project connections while retaining UUID/provider identity records, native content/membership, and local mounts; false refuses if managed descendant spaces remain, true includes them; later reads can rediscover resources as observed, and re-adoption reuses their IDs | Control bindings only; no GitLab group/project DELETE; no simultaneous implicit re-adoption |
| `listProjects(spaceId?,recursive,includeShared,cursor)`, `getProject(id)` | Deduplicated registered projects; omitting space includes directly shared projects without requiring readable ancestors | `GET /projects`, `GET /groups/:id/projects` with `include_subgroups` / `with_shared`; verify identity markers [[6]] [[7]] |
| `createProject(spaceId,id,label,initialSnapshot)` | Bind a fresh or local-only UUID, validate and publish its first snapshot; create nothing in source repositories | `POST /projects` with namespace/visibility; repository initialization; binding metadata [[7]] |
| `attachProject(projectId)` | Add an authorized connection to an existing registered project without changing identity, grants, or downloading everything | `GET /projects/:id`, identity file read; reuse registered binding |
| `getAccess(target)` | Caller operation capabilities; independent of permission to enumerate the complete roster | Effective membership, group policy, project/branch protection including caller can_push, and token scope [[8]] [[9]] [[19]] |
| `listGrants(target,cursor)`, `listAssignableRoles(target,cursor)` | Paginated visible grants or assignable roles; inherited/redacted grants need not be editable | Direct/effective group/project member APIs, invitations, invited groups, and policies [[8]] [[10]] |
| `invite(target,email,role,expiresOn?)` | Invite through identity provider; accepting does not create a second Spex identity for that account | Group/project Invitations API [[10]] |
| `grant(target,accountId,role,expiresOn?)`, `updateGrant(target,grantId,role,expiresOn?)` | Add/change one direct member grant, never copy effective ancestor membership | Group/project members POST/PUT [[8]] |
| `share(target,spaceId,role,expiresOn?)` | One native group invitation with provider-defined recipient-membership semantics, not a snapshot of users | `POST /groups/:id/share` or `POST /projects/:id/share` [[1]] [[6]] [[7]] |
| `revokeGrant(target,grantId)` | Remove only that direct membership/invitation/share; other access paths remain | Members, invitations, or share DELETE on the grant's origin [[8]] [[10]] |
| `rename(target,label)` | Change live display name without changing Spex UUID, project files, or local mount path | Group/project PUT `name`; portable fallback label refreshed on a later content save [[6]] [[7]] |
| `transferProject(id,targetSpaceId)` | Move ownership, preserve identity, refresh inherited access; Home requires replacement/clear designation first; no claim that old downloaded copies disappear | `PUT /projects/:id/transfer` with namespace; provider transfer constraints apply [[7]] |
| `archiveProject(id,archived)` | Explicitly make remote project read-only or reopen it when permitted | Project archive/unarchive endpoints [[7]] |
| `deleteProject(id)` | Delete only the selected Spex storage project, never a linked source repo; surface provider pending-deletion state; Home designation precondition applies | `DELETE /projects/:id`, subsequent project lookup [[7]] |
| `restoreProject(id)` | Restore a provider-retained pending-deletion project if supported and authorized, retaining UUID; otherwise unsupported/unavailable | `POST /projects/:id/restore` and observed lifecycle state [[7]] |
| `getOperation(requestId)` | Recover a mutation's pending/final result after interrupted communication; unknown ID is not proof of success | Adapter operation records and verified provider outcomes |
| `head(projectId)` | Current committed revision under caller's read permission | Repository branches/commits API [[11]] |
| `snapshot(projectId,revision)`, `readFile(projectId,revision,path)` | Manifest and exact bytes at one revision, with LFS resolved; absent/corrupt content is an error | Repository tree, raw files/blobs, Git/LFS retrieval; `data/` prefix stripped [[11]] [[12]] |
| `commit(projectId,baseRevision,changes)` | One complete new snapshot iff current revision equals base; changes are unique-path `put(path,bytes,executable)` or `delete(path)`; otherwise conflict, with no partial visible snapshot | Git-over-HTTPS update with explicit expected old ref; LFS objects available before publication; not bare Commits API `start_sha` [[5]] [[17]] |
| `usage(target)` | Known used/limit values and read-only state; unavailable fields are null, never zero or an unlimited-storage promise | Project/group statistics and provider quota/status responses, constrained by caller permission [[14]] |

All mutations in the table also carry `requestId`; `target` is a tagged `{kind:space|project,id}`.
No Spex operation deletes or transfers a GitLab group in this interface, because that could affect unrelated repositories; such external administration is observed on the next authorized discovery.
If a bound storage project moves into an unadopted group, expose its new owner as an observed Space without provisioning or adopting it; never retain the old owner.
A move to a GitLab user namespace is outside this group-backed contract: report unsupported-location, permit authorized snapshot export, preserve local work, and refuse further writes until the project returns to a supported group.
Restoring the same provider project retains its binding; recreating a deleted resource with copied files is identity migration, not automatic restoration.
Unbinding a project/connection locally is not `deleteProject` or `revokeGrant`.
Copying/exporting, installing, compiling, and mounting are client content operations over these primitives, not separate GitLab management APIs.
An ordinary code repository is a discoverable external resource, not an implicitly adopted Spex storage project; source-resource browsing uses its source provider, outside this storage interface.

Project commits compare the whole base revision, preserve bytes/modes, and expose related files together; the adapter may return stricter whole-project conflicts rather than perform semantic merges.
Each session envelope plus its complete native bundle is one resolution unit; each editable package plus all authoring tasks targeting it is another, even though their files occupy different directories.
Divergent intent logs are never automatically unioned.
GitLab's Commits API offers useful multi-file edits, but its `last_commit_id` is a per-file check and `start_sha` does not provide this interface's whole-branch compare-and-swap [[13]].
Conflict resolution is a client decision followed by another conditional commit, not last-writer-wins.
There is no cross-project transaction: copying work publishes a complete destination before any explicit source removal.

### 7. GitLab feasibility and adapter boundaries

The service root is public; hosted user/team subgroups and all storage/control projects are private by default.
Ordinary users are never added to the service root merely to permit provisioning; they receive membership only at their intended scopes.
Root owners inherently retain access to hosted descendants, and team-parent members retain their inherited access to username subgroups; the UI describes that audience rather than calling such storage private-to-one-person [[9]].
Existing teams remain outside the service root when they already live there, and existing username subgroups are associated by verified account identity and explicit selection, never by matching a name alone.
Existing groups' SSO, invitation restrictions, branch protection, quotas, and inherited grants are honored; unsupported operations are reported rather than emulated with service-owner authority.

| Spex data/entity | Exact GitLab representation |
| --- | --- |
| Service, account, space, project bindings | Durable private service-control records mapping opaque Spex IDs to GitLab numeric IDs; usernames/paths are display/lookup hints only; native custom attributes are not required |
| Space identity / Home designation | Binding from group ID to space UUID and designated Home project; Home `data/space.yaml` preserves portable identity, subject to binding validation |
| Portable project file `p` | `data/p` at a configured storage branch in the bound GitLab project; API revisions are opaque; branch name is not in local content |
| Backend transport files | Repository-root adapter files outside `data/`, including any LFS attributes; excluded from the Spex snapshot file set |
| Large declared file / session asset | Git LFS object referenced by its repository path; clients receive resolved original bytes and their SHA-256, not the pointer text [[15]] |
| Membership/share/ownership | Native GitLab group/project relationships, not a copied roster in Home or the service-control project |
| Editable package, authoring record, intent, session | Ordinary project files; no implicit pipeline, issue, merge request, or GitLab release entity |
| Published package | Separate package-registry contract; storing its editable source here neither publishes it nor creates a GitLab Generic Package |
| Local bindings, runtime hints, credentials, installs, build output, caches | No GitLab representation and no inclusion in project snapshots |

New hosted spaces grant the requesting account ownership only within the created child scope, never at the service root.
Each UUID binding is checked against the actual remote resource; a forged/copied manifest cannot claim another registered project's identity.
GitLab.com top-level service groups require initial UI creation; the supported API provisioning path creates subgroups beneath an existing root [[6]].
GitLab accounts are established at GitLab; invitations/sign-in are supported, not administrator-only account creation.
Public top-level groups are currently exempt from the Free private-group five-user limit, while adopted private groups retain their existing plan constraints [[16]].
Repository plus LFS storage is quota-bound, and quota exhaustion can make writes read-only; no unlimited storage or zero-latency membership propagation is promised [[14]].
No live GitLab resources were provisioned for this draft: feasibility is checked against the documented APIs, and implementation acceptance will need real integration evidence.

### 8. Scenario audit and invariants

| Scenario | Required outcome |
| --- | --- |
| First sign-in / existing personal subgroup | Select or provision intended personal space, initialize Home, bind stable account ID; never expose sibling users through root membership |
| Existing team with source repositories | Adopt the existing group and members; add storage projects only; source repos remain separate and untouched |
| Group invitation / nested groups / group-to-group share | Refresh the effective catalog using native semantics; show allowed projects, not an assumed recursive union of everyone in every subgroup |
| Project-only recipient / unreadable Home | Read the complete shared project independently, with captured config/labels/history; no access to siblings inferred |
| Same project through several accounts or shares | One UUID/payload, distinct authorized connection choices; reauthorize every operation through its selected connection |
| New project or draft while offline | Persist unbound UUID/content locally; upload and owner choice are explicit and idempotent |
| New playbook / full-to-wrapper skill | Author a package, retain source/GEARS/implementation, select variants explicitly; wrapper points to shared applet target rather than duplicating implementation |
| Several languages / package implementations | Preserve variants together, install only selected variants, use independent project locks and verified shared byte store |
| Existing checkout / several worktrees / another device | Bind resource/package IDs to device paths explicitly; paths never create remote identity or authorize execution relocation |
| Snapshot on second device / missing attachment | View native complete bundle without source checkout; incomplete assets are reported, not silently omitted; continuation is separately validated |
| Concurrent saves / interrupted upload / quota failure | Whole-snapshot conditional publication or explicit failure; pending local work survives; recover ambiguous outcomes by request ID |
| Rename / transfer / deletion performed outside Spex | Refresh live ownership/capabilities without rewriting identities; unavailable resource is not silently recreated from cache |
| Rename / transfer inside Spex | Preserve UUID and payload location, honor Home preconditions and provider restrictions; never imply transfer erases access to prior copies |
| Copy / raw provider fork / restoration | A second device or backup of the same remote retains UUID; independent copy gets a new UUID and origin; copied conflicting remote identity requires explicit resolution |
| Copy authored work into another project | Copy package/config content intentionally; queue entries and resumable execution history are not duplicated automatically; history exports preserve native bytes and remain subject to native import/recovery rules |
| Share a package/session only / publish a release | Export the selected complete unit or place it in a separately shared project; never share unrelated Home/project history implicitly |
| Personal notes about shared work | Persist in personal Home/device state; shared project config is deliberately shared, not a private preference channel |
| Remove one grant / expire membership / leave team | Recompute remaining effective grants; stop disallowed backend operations; retain unsent local work and acknowledge that downloaded bytes cannot be recalled |
| Unmount / sign out / clear cache / delete remote | Four distinct operations; none is silently substituted for another; destructive local removal must distinguish unsent work from reproducible copies |
| Delete or replace Home / detach existing team | Update/clear designation first; project-only access still works; detach never deletes the team's group or unrelated source projects |
| Unsupported native/schema version / invalid file | Preserve original bytes and report scoped incompatibility; do not guess migrations, run content, or block unrelated valid projects |

## Consequences

One space organizes people/projects, one project defines the durable sharing boundary, and one local payload serves every access path.
There is no portable `workspaces/` tree, no GitLab ID in a local path, no space-wide repository containing independently private project histories, and no duplicated ACL catalog.
Home, package authoring, installation, native sessions, and external resource bindings have distinct locations and owners.
The cost is one storage project per independently shared Spex project plus one Home per initialized space, and explicit handling of backend quotas and cross-project operations.

Acceptance would require successor/amendment links for [DR-006](specs/decisions/006-projects-and-forge.md), [DR-045](specs/decisions/045-unified-session-storage.md), [DR-057](specs/decisions/057-space-surface.md), [DR-058](specs/decisions/058-chat-assisted-playbook-authoring.md), and [DR-080](specs/decisions/080-the-config-directory-is-named-config.md), and coordinated updates to storage, projects, space, playbook-library, shared configuration, and core-service specs.
In particular, project no longer means exactly one local Git repository, drafts become portable project data, and the former single-home Git synchronization model is replaced by independent project snapshots.
The companion package draft reconciles this placement with local sources, portable snapshots, and explicit per-environment registry routing; acceptance must still coordinate successor records with the existing package/environment/registry specs before implementation.

## References

[1]: https://docs.gitlab.com/user/project/members/sharing_projects_groups/ "GitLab sharing semantics"
[2]: https://github.com/sublang-ai/playbook/blob/main/specs/packages/playbook-cli.md "Native Playbook configuration"
[3]: https://github.com/sublang-ai/playbook/blob/main/specs/packages/session-storage.md "Native session files and exact bundle export"
[4]: https://github.com/sublang-ai/playbook/blob/main/specs/packages/session-assets.md "Native portable session assets"
[5]: https://docs.gitlab.com/api/oauth2/ "OAuth and delegated Git HTTPS access"
[6]: https://docs.gitlab.com/api/groups/ "Group discovery, adoption, creation and sharing"
[7]: https://docs.gitlab.com/api/projects/ "Project discovery and lifecycle"
[8]: https://docs.gitlab.com/api/project_members/ "Project memberships, with analogous group-members operations"
[9]: https://docs.gitlab.com/user/project/members/ "Membership inheritance and visibility"
[10]: https://docs.gitlab.com/api/invitations/ "Group and project invitations"
[11]: https://docs.gitlab.com/api/repositories/ "Repository trees and snapshots"
[12]: https://docs.gitlab.com/api/repository_files/ "Exact raw-file retrieval"
[13]: https://docs.gitlab.com/api/commits/ "Multi-file commits and file-level preconditions"
[14]: https://docs.gitlab.com/user/storage_usage_quotas/ "Storage quotas and read-only behavior"
[15]: https://docs.gitlab.com/topics/git/lfs/ "Large-file storage within repository ownership"
[16]: https://docs.gitlab.com/user/free_user_limit/ "GitLab.com membership limits"
[17]: https://git-scm.com/docs/git-push "Explicit expected-ref preconditions for publication"
[18]: https://www.rfc-editor.org/rfc/rfc8785 "JSON Canonicalization Scheme"
[19]: https://docs.gitlab.com/api/branches/ "Caller-specific branch permissions"

[20]: https://docs.gitlab.com/api/group_members/ "Group memberships and direct-grant operations"
