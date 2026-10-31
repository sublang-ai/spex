<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# environments: Spec Packages and Environments

## Intent

This package defines spec packages and the environments that install them under [DR-104](../decisions/104-spec-package-format-and-client-environments.md) and [DR-165](../decisions/165-one-package-manager-hosted-by-the-cli-and-the-app.md): the release layout and manifest the package manager reads and checks, the requests and lock of each project and group, resolution, installing through the content-addressed store, the placements that put skills and specs where agents read them and playbooks where the launcher loads them, spec packages under development, the built-in spec package the app ships, and the registry and Git sources.
The package manager is one library, hosted by the `spex` command line and by the app's core; where an item says the core, it says what either host does, and where it names a command, the core's protocol command, the command line's verb of the same meaning [[cli-1](cli.md#cli-1)].
A **spec package** is one GEARS contract with the sources, spec, skills, playbooks and applets made from it, named `<org>/<pkg>`; a **release** is its immutable files at one version; an **artifact** is one `source`, `spec`, `skill`, `playbook` or `applet` of a release.
An **environment** is what a project or a group installs: `spex.yaml` says which spec packages it wants, `spex.lock` records exactly what it got, and `.spex/` holds what was installed, all at the environment's **root** — a project's working folder, or a group's own spex repository's clone [[environments-26](#environments-26)] [[storage-1](storage.md#storage-1)].
An **instance** is a deployment of Spex Space known by its origin; an environment's instance is the `space` its `spex.yaml` names, else the home's default instance [[storage-2](storage.md#storage-2)], independent of the registry selected by `registry` ([DR-168](../decisions/168-independent-package-registry.md)).
A **working folder** is where a project's or a group's sessions run; the app pairs it with the spex repository holding its records [[storage-6](storage.md#storage-6)], which the environment in it does not need.

## External Behavior

### The Format

#### environments-1

When the core reads a release — from the registry, a Git commit, a path source's folder [[environments-2](#environments-2)], or the app's own built-in spec package — it shall accept it only as a folder in the release layout with a `meta.yaml` manifest of `format: 2`, refusing any other with its reasons ([DR-104](../decisions/104-spec-package-format-and-client-environments.md)):

| Path in a release | Content |
| --- | --- |
| `meta.yaml` | the manifest |
| `README.md`, `LICENSE` | optional description and license |
| `sources/<language>/<id>/` | source material entered at `SOURCE.md`, attachments beside it |
| `specs/<language>/<pkg>.md` | the one spec file, with its sections, item ids and citations kept whole |
| `skills/<language>/<id>/` | an Agent Skills folder [[1]] whose `SKILL.md` name is `<id>` |
| `playbooks/<language>/<id>/` | a playbook in Playbook's native layout: the text the compiler reads, its compiled module and what the compiler wrote beside them, except its `.slc/` build history and `.slc-verify/` verifier support, which a folder read as a release leaves out wherever they stand in it |
| `applets/<id>/` | a static web application entered at `index.html`, a regular file at the folder's root, every file beside it served as it is ([DR-161](../decisions/161-an-applet-is-a-page-the-ide-serves.md)); a folder without that entry is refused naming the applet |

| `meta.yaml` field | Content |
| --- | --- |
| `format` | `2` |
| `org`, `name`, `version` | lowercase kebab-case names of at most 64 characters, and a Semantic Versioning 2.0.0 version [[2]] |
| `description`, `license`, `repository` | a description and the license, both required to publish [[environments-10](#environments-10)], and an optional repository URL |
| `dependencies` | optional: `<org>/<pkg>` to a version requirement [[environments-4](#environments-4)] |
| `provides` | optional: the artifact kinds an environment is offered, a list; absent, every kind the release holds ([DR-174](../decisions/174-what-a-package-provides-is-placed.md)) |
| `artifacts` | artifact id to `{kind, language, from, requires, generated-by}` |

- `kind` is one of the five kinds; `language` is a BCP 47 tag [[3]] naming the artifact's original folder, absent for an applet, the artifact's other language folders being its translations; `from` and `requires` name artifact ids of the same release; `generated-by` is an optional `{agent, model}`; an `x-` prefixed field is ignored and any other unknown field refused;
- a release provides an artifact when `provides` is absent or lists its kind, and no sibling names it in `from` or `requires` — such an artifact is its sibling's support, whatever `provides` lists; a `provides` that is not a nonempty list of the five kinds is refused ([DR-174](../decisions/174-what-a-package-provides-is-placed.md));
- the manifest and the folders name the same artifacts and languages; every file lies under one artifact or is one of the three root files; a release has at most one spec, whose id is `<pkg>`; a skill's id is its Agent Skills name [[1]], a playbook's id its Playbook id and an Agent Skills name as well, and no skill and playbook share an id; a translated spec keeps the original's item ids;
- a path is portable: components of at most 255 bytes, no control characters, none of `/ \ : * ? " < > |`, no trailing dot or space, no Windows device name [[4]], unique after NFC and case folding; a link or special file is refused;
- a release keeps, per file, its path, its bytes and one executable flag.

### Requests and the Lock

#### environments-26

The core shall keep an environment at its root — the working folder for a project, the clone for a group's own spex repository [[storage-1](storage.md#storage-1)] — as `spex.yaml` and `spex.lock` at the root and the installed files, the generated skills and the install record under `<root>/.spex/`, reading them at each use and writing them there, never staging, committing or ignoring the two files or a spec an install placed [[environments-41](#environments-41)] in a working folder's Git ([DR-113](../decisions/113-a-projects-environment-lives-in-its-working-folder.md), [DR-165](../decisions/165-one-package-manager-hosted-by-the-cli-and-the-app.md)):

- `.spex/` holds a `.gitignore` of one line, `*`, written with the folder, so Git ignores the installed tree and a group's own clone never syncs it, and nothing under it is the reader's to edit;
- a project's environment is committed with its code by the reader, the specs an install places under `specs/packages/` with it [[environments-41](#environments-41)], so it follows the code's branches and history, and a working folder cloned with them holds its environment before Spex writes anything, `spex install` or a use materializing `.spex/` from the lock [[environments-7](#environments-7)];
- a project's environment is this device's alone while the code's `HEAD` lacks either file, read from the folder's Git at each use, so a file added but not committed counts as not committed, as does a folder that is no repository or has no commit;
- a use is the core's start, the pairing of a working folder, a session start, a placement, `environment.get` and each package command of the command line [[cli-1](cli.md#cli-1)], and the files as the root holds them at that read are the environment, so a branch switch, a pull, a hand edit or the other host's write shows at the next use;
- an environment needs no pairing and no registration: either host finds it by the `spex.yaml` at its root.

#### environments-2

The core shall read an environment's `spex.yaml` [[environments-26](#environments-26)] as exactly `{format: 1, language?, space?, registry?, packages}` — an optional preferred language, the optional origin of the environment's instance [[storage-2](storage.md#storage-2)], and `<org>/<pkg>` to one request — refusing a `format` it does not know and a `space` or `registry` that is no canonical service origin ([DR-104](../decisions/104-spec-package-format-and-client-environments.md), [DR-165](../decisions/165-one-package-manager-hosted-by-the-cli-and-the-app.md)):

| Source | Fields | Meaning |
| --- | --- | --- |
| registry | `version` | a version requirement [[environments-4](#environments-4)], met from the registry |
| path | `path` | a folder inside the environment's path root, by a path relative to it, used in place |
| Git | `git`, `rev`, optional `path` | a repository an instance or this device's Git can read, at a branch, tag or commit, with an optional folder inside |

- a request names exactly one source and may add `select`, a list of `{artifact, language}`, and `alias`, the id of a skill, playbook or spec to the Agent Skills name its skill is placed under;
- an environment's path root is its root [[environments-26](#environments-26)] — for a project in the app, its working folder on this device, none while the device holds none for it — your own group's confined as [[environments-32](#environments-32)] states ([DR-125](../decisions/125-your-own-groups-path-sources-live-in-its-clone.md));
- a spec package under development lives at `spex-packages/<org>/<pkg>/` under the root and is requested by that path [[environments-10](#environments-10)];
- a direct request fixes the source of that spec package for everything that requires it; every other spec package comes from the registry.

#### environments-32

When the core reads a request by path in your own group's environment — before writing it [[environments-15](#environments-15)], at each resolution [[environments-5](#environments-5)] and at each install [[environments-7](#environments-7)] — it shall accept only a folder below its clone's root that lies outside Spex's own paths, is reached through no link, lies in no Git repository of its own, and holds nothing the clone's sync drops or refuses, refusing any other with the path and its reason, so the folder syncs with the clone ([DR-125](../decisions/125-your-own-groups-path-sources-live-in-its-clone.md), [DR-128](../decisions/128-a-spex-repository-placed-at-several-instances.md)):

| Refused | Reason |
| --- | --- |
| the clone's root, or a path leading out of it | not below the clone's root |
| a path whose first segment — compared without case after Unicode compatibility normalization (NFKC) — is `config`, `sessions`, `intents`, `authoring`, `placements`, `.spex`, `packages`, `skills`, `local`, `.git`, `.spex-uploads`, `spex.yaml`, `spex.lock`, `project.json`, `.gitignore`, `.gitattributes`, `.spex-apply.json` or a name beginning `.lock` | a path Spex keeps [[storage-1](storage.md#storage-1)] |
| a path the clone's Git rules ignore, such as one under a folder named `*.tmp` [[storage-17](storage.md#storage-17)] | not synced |
| a folder that is a link, or lies under one | reached through a link |
| a folder that is, or lies under, a Git repository of its own — a folder below the root holding `.git` | a repository the sync does not carry, named |
| a folder holding a file of its release [[environments-1](#environments-1)] the clone's Git rules ignore, or one of an ignored family of the catalog [[storage-1](storage.md#storage-1)], which a sync refuses to share [[space-15](space.md#space-15)] | a file not synced, named |
| a folder holding at any depth, where the clone's Git rules do not ignore it, a Git repository of its own, a link, or an entry that is no regular file or folder | an entry the sync does not carry, named |
| an existing subtree the clone's Git rules do not ignore whose entries cannot be inspected | confinement cannot be established, the unreadable path named |

- the clone's Git rules are Git's own reading of its `.gitignore` files and this device's excludes, under which a file Git tracks is never ignored, so a rule of one device's excludes refuses no file another device committed;
- a request is checked against what stands at its path when it arrives, so a folder not made yet is refused only by the first five rows, and the last three read it at the first resolution or install finding it;
- an install finding a folder refused fails before anything is installed or linked, its cause naming the path and the reason, the last files and placements staying [[environments-7](#environments-7)].

#### environments-3

The core shall write and read an environment's `spex.lock` [[environments-26](#environments-26)] as exactly `{format: 1, requests, packages}` — a SHA-256 digest of the `spex.yaml` it resolved, and `<org>/<pkg>` to one resolution — refusing a `format` it does not know ([DR-104](../decisions/104-spec-package-format-and-client-environments.md)):

| Resolution field | Content |
| --- | --- |
| `source` | the exact source: `{registry, version, checksum}`, `registry` naming the package service by its origin [[environments-5](#environments-5)]; `{path, version, dependencies, requires}` as the path's manifest states them; or `{git, commit, path?}` |
| `required-by` | the spec packages that required it, `[]` for a direct request alone |
| `artifacts` | each selected artifact id to `{language, fallback}`: its chosen language and whether that was a fallback |
| `files` | every selected file as `{path, sha256, executable}`; empty for a path source |
| `exports` | placed Agent Skills name to artifact id |

- a lock changes only when `spex.yaml` changes, the reader asks to resolve again, or a pick records its local-only clone's first placement at an instance [[environments-11](#environments-11)]; installing from an existing lock resolves nothing.

#### environments-4

When the core matches a version requirement, it shall accept exactly the three forms below and no other, ignoring build metadata and admitting a prerelease only where the requirement itself names a prerelease of the same `major.minor.patch` [[2]]:

| Form | Example | Satisfied by |
| --- | --- | --- |
| exact | `1.2.3` | that version only |
| caret | `^1.2.3` | that version up to the next major; for major zero, the next minor; for major and minor zero, the next patch |
| tilde | `~1.2.3` | that version up to the next minor |

### Resolution

#### environments-5

When a client sends `environment.resolve` for a spex repository, or its `spex.yaml` has no lock, the core shall resolve the requested spec packages and everything they require at any depth into one solution — every spec package at one version and every selected artifact in one language, so that every version requirement and `select` entry holds — and write the lock [[environments-3](#environments-3)] ([DR-104](../decisions/104-spec-package-format-and-client-environments.md)):

- a cycle in the dependency graph is allowed and adds nothing;
- caret and tilde never pick a version its publisher yanked; an exact requirement, or installing from the lock, may; nothing picks a version the registry's operator suppressed;
- among solutions the core takes the highest, comparing the requested spec packages' versions first, then the rest, each in name order; a newer release lacking a selected artifact never blocks an older solution;
- the environment's registry is asked as [[environments-12](#environments-12)] states, and each spec package resolved from it records it in its resolution, keeping instead the registry the lock records, by its canonical origin, where that names an origin and it resolves to the version and checksum recorded there ([DR-127](../decisions/127-a-home-signed-in-to-several-instances.md));
- a path source resolves to the manifest in its folder [[environments-2](#environments-2)], your own group's once the folder passes [[environments-32](#environments-32)], a Git source to the named commit's manifest, with their dependencies from the registry;
- when no solution exists, the core replies `invalid_request` naming the version requirements in conflict, before anything is installed or run, save that a spec package the registry lists to no reader of it — absent, or private to others — ends the resolution with the registry's answer naming it [[environments-12](#environments-12)];
- the lock is written only while `spex.yaml` still holds the bytes resolved and `spex.lock` the bytes read before resolving, each checked at the instant of the write; a resolution overtaken meanwhile writes nothing, a caller awaiting it is refused `conflict` naming the file that changed meanwhile, to retry, and it records no failure in the environment's state ([DR-111](../decisions/111-the-core-coordinates-as-git-does.md));
- a resolution that fails, or finds no solution, once either file no longer holds the bytes it read is overtaken in the same way, its outcome recorded nowhere, so it never replaces what a later operation left.

#### environments-6

When a solution stands, the core shall select, within it, in this order ([DR-104](../decisions/104-spec-package-format-and-client-environments.md)):

1. artifacts: those a request selects, or all of them by default, plus everything any requiring spec package needs, together with everything they `requires`;
2. languages: for each selected artifact, the language its `select` entry names; else the environment's `language` when the artifact has it; else its original text, recorded as a fallback when another language was wanted;
3. files: the root files and every file of each selected artifact in its chosen language;
4. placements: each provided playbook [[environments-1](#environments-1)] under its id, one skill for each provided skill and each provided playbook under the artifact's id, and for a provided spec the name its generated skill takes where it is placed as one [[environments-8](#environments-8)], `<org>-<pkg>`, or `<pkg>` where that is longer than an Agent Skills name may be [[1]] — each skill under its alias where the request names one ([DR-115](../decisions/115-a-spec-reaches-the-agents.md), [DR-174](../decisions/174-what-a-package-provides-is-placed.md)).

- two playbooks with one id, or two placed skill names alike, in one environment are refused naming both, until one is aliased;
- a selected artifact its release does not provide [[environments-1](#environments-1)] is installed with the rest and placed nowhere.

### Installing

#### environments-7

When a client sends `environment.install` for a spex repository, or a resolve or a sync of a group's own spex repository changed its lock, or a use's read [[environments-26](#environments-26)] finds a lock other than the one installed, the core shall install the lock's selected files under `<root>/.spex/packages/<org>/<pkg>/` at their release paths through the store under the home, atomically ([DR-104](../decisions/104-spec-package-format-and-client-environments.md), [DR-165](../decisions/165-one-package-manager-hosted-by-the-cli-and-the-app.md)):

- the store keeps each distinct file once under `store/<sha256>`, written once after its digest is verified, with an executable copy apart under `store/x/<sha256>`, and keeps a file while a lock of an environment the home knows [[environments-26](#environments-26)] selects it; an install hard-links the store's bytes where the file system allows and copies them otherwise, so a file leaving the store breaks no installed tree; `cache/` holds fetched archives and metadata and may be deleted at any time;
- in a legacy manifest without `registry`, a spec package from a registry is fetched from the registry of the environment's instance where it has one, else from the registry its lock records, else from that of any other instance the home is signed in to, whichever first serves its release at the locked version and checksum, each asked as [[environments-12](#environments-12)] states; where none does, the install fails naming the spec package — except the built-in spec package [[environments-11](#environments-11)], which is served first from this device's seed at the locked version where the seed's files carry the digests the lock records for them, its archive's checksum aside, and, where no seed and no registry serves it, is left out of the install as not installed while the rest installs, for the app's next use to install it from its seed ([DR-127](../decisions/127-a-home-signed-in-to-several-instances.md), [DR-165](../decisions/165-one-package-manager-hosted-by-the-cli-and-the-app.md));
- a file is fetched by any transport the registry serving it offers — the release archive, or raw files — or from the Git source at the locked commit, and stored only when its SHA-256 matches the lock's `files`; the portable-path rules [[environments-1](#environments-1)] are re-checked; no code runs;
- a path source copies nothing: its files are used where its path resolves [[environments-2](#environments-2)] — in a working folder, each running its own, or in your own group's clone, each device running the copy its clone syncs —; a device lacking the folder reports it missing, and the environment stays otherwise installed;
- in the app, every playbook artifact folder of the lock, a path source's where its path resolves included, is prepared to run on the app's engine [[playbook-library-46](playbook-library.md#playbook-library-46)] at the app's own installs, also where the installed files already match the lock, and at each use that hands the launcher module locations [[environments-9](#environments-9)], so a playbook another host installed runs; the command line prepares none;
- the new installed files are complete, prepared privately, before they replace the old ones; a failure before that replacement commits leaves the last files in place and reports its cause;
- the replacement commits when the complete new tree stands at `.spex/packages/`; removing the obsolete tree afterward is garbage collection, whose failure leaves the new files installed, does not prevent their placement, and records a diagnostic naming the retained tree and cause; the former `packages/` and `skills/` of the environment's spex repository's clone, where a clone holds them, are removed the same way once `.spex/` stands;
- the replacement happens only while the root stands, the environment's `spex.lock` [[environments-26](#environments-26)] still holds the bytes installed, and the lock still matches `spex.yaml` and its path sources, checked at the instant before the swap; an install overtaken meanwhile publishes nothing, the last files staying, a caller awaiting it is refused `conflict` naming the file that changed meanwhile, to retry, and it records no failure in the environment's state; a root gone meanwhile is never made again, and an install awaited on it is refused ([DR-111](../decisions/111-the-core-coordinates-as-git-does.md));
- the placements of an install are written only while the lock and the installed files still stand as it left them, so no placement mixes two locks; where either changed after the swap, the placements standing are not rewritten, the swapped-in files stay, and the install is overtaken as above;
- an install's outcome — its failure, its stale report, or its success clearing an earlier failure — is recorded only while `spex.yaml` and `spex.lock` still hold the bytes the install read or itself wrote; otherwise the install is overtaken as above, what it installed and placed standing;
- a stale lock — its `requests` digest no longer matching `spex.yaml`, or a path source's manifest no longer stating the version, dependencies and `requires` the lock recorded, or lacking an artifact the lock selected — installs and places nothing new: the last files stay, and the core reports that resolving again is needed, refusing an install its caller awaits with that reason.

### Placement

#### environments-8

When an environment is installed or a group's own lock applied by a sync, the core shall place the skills, playbooks and specs its releases provide [[environments-6](#environments-6)], so that every member of a project gets the same tools ([DR-104](../decisions/104-spec-package-format-and-client-environments.md), [DR-115](../decisions/115-a-spec-reaches-the-agents.md), [DR-174](../decisions/174-what-a-package-provides-is-placed.md)):

| Placed | Where |
| --- | --- |
| each provided skill, copied with its `name` rewritten, as a YAML string, where aliased [[1]] | `<root>/.spex/skills/<name>/`, then, for a project, into the agent folders of its root, listed in that folder's `.git/info/exclude` so Git ignores them |
| a generated skill per provided playbook, under the playbook's id or alias, that runs the playbook in the working folder of the session and names the exact spec package and version it came from | `<root>/.spex/skills/<name>/`, then Claude Code's agent folders of the places each selected skill goes [[environments-16](#environments-16)] |
| the provided spec, in a project's environment | `specs/packages/<pkg>.md` under a root holding `specs/`, derived from the release's file, and nowhere under one holding none [[environments-41](#environments-41)] |
| the provided spec, in your own group's environment, whose root holds no `specs/`, as a generated skill under its placement name [[environments-6](#environments-6)] that holds the spec file in its chosen language copied byte for byte as `<pkg>.md` and names the spec package's org, name, version and description | the places each selected skill goes |
| your own group's skills | your agents' user-level folders on this device as well, so they reach every session run here |

- the agent folders are the folders where each agent Spex drives reads project-level and user-level skills, as the core's agent table states them [[environments-16](#environments-16)];
- a placed skill, playbook or spec is bound to the environment whose lock placed it: it runs or holds that environment's installed files, or a path source's files where its path resolves for that environment [[environments-2](#environments-2)], never another environment's copy of the same name;
- when a project and your own group place one skill name, both keep it, one in the project's agent folder and one in the agent's user-level folder, and the project's Playbooks tab lists both saying where each comes from [[playbook-library-1](playbook-library.md#playbook-library-1)];
- a placement leaves nothing it did not write: a folder the agent table names holds only the placed skills of that environment beside what the reader put there;
- a folder the reader put in an agent folder under a placed name stays as it is, that skill left out of that agent folder alone, and a provided artifact whose files the placement does not find, as a path source the working folder lacks [[environments-7](#environments-7)], is placed nowhere.

#### environments-41

When an install runs in a project's environment, the core shall place each provided spec as `specs/packages/<pkg>.md` under a root holding `specs/` — one comment line `<!-- Placed by Spex from <org>/<pkg> <version>; an edit makes this file yours. -->`, a blank line, then the release's spec file in its chosen language with its citations rewritten for the tree — recording in the install record the path written, the release's `<org>/<pkg>` and version and the written bytes' SHA-256, and leave the file the reader's to commit with the code [[environments-26](#environments-26)] ([DR-174](../decisions/174-what-a-package-provides-is-placed.md)):

- an address `spex:<org>/<pkg>#<id>` [[environments-42](#environments-42)] whose package's spec stands in this `specs/` becomes the relative link to that file's anchor; one whose package's spec does not is removed with its brackets, the phrase it annotated kept, and the install reports each such package with the count of links waiting for it; a same-file citation and a relative link to `meta.md` stay; the placed files are derived again whenever the set of placed specs changes, so a package added later makes its links appear;
- a file at that path whose bytes equal the derivation is this package's copy, recorded as such with or without an earlier record, so a fresh clone installs to no diff; one whose bytes equal the hash last recorded is rewritten by the derivation; any other is edited: the install leaves it standing, places nothing over it and reports it with the newer release's version waiting under `.spex/`;
- a copy whose package the lock no longer holds, or whose release no longer provides its spec, leaves, unless edited, when it stays as the project's own and the install reports so;
- a file of that basename under `specs/` that is neither the derivation nor this package's copy by the record blocks the placement, reported naming the file; of two selected packages of one `<pkg>`, the first by `<org>` is placed and the second reported blocked;
- a root holding no `specs/` places no spec, reported naming `spex scaffold`;
- `specs/` holds no address: a placed file's links are relative or absent, as the project's own files' are.

#### environments-42

When the library builds a release's spec from a project's spec file [[cli-23](cli.md#cli-23)], it shall rewrite each citation for the release, where an address `spex:<org>/<pkg>#<id>` cites another release's spec item and stands only inside a release — `spex-packages/`, the registry, `.spex/` ([DR-174](../decisions/174-what-a-package-provides-is-placed.md)):

- a relative citation into the same file becomes a same-file citation, `[[<id>](#<id>)]`;
- a relative citation whose target file is `<pkg>.md` of exactly one package under development at `spex-packages/`, or the placed spec of a package installed by this environment by the install record, becomes `[[<id>](spex:<org>/<pkg>#<id>)]`, that package's; one `<pkg>.md` two packages under development claim is removed as below, the warning naming both;
- a relative citation whose target is a spec of no package is removed with its brackets, the phrase kept, and reported as a warning naming the citing item and the target;
- a relative citation whose target is `meta.md` at the specs root is kept as it is, since the scaffold puts that file in every tree;
- a decision record's link keeps its text and loses its link, reported as a warning naming the citing item and the record;
- nothing else in the file changes, and the project's own file is not written.

#### environments-31

When a working folder is paired with a spex repository [[storage-6](storage.md#storage-6)], the core shall read the folder's environment as a use [[environments-26](#environments-26)], installing [[environments-7](#environments-7)] and placing [[environments-8](#environments-8)] as that read requires, so the folder's agents have its tools once it is opened in the app ([DR-104](../decisions/104-spec-package-format-and-client-environments.md), [DR-124](../decisions/124-skills-reach-every-agent.md)).

#### environments-9

When a session starts in a working folder, the core shall hand the launcher the module location of each playbook its composed configuration enables [[core-service-2](core-service.md#core-service-2)] — the installed playbook artifact's module under the project's environment's `.spex/`, else your own group's, else, for a path source, the module where its path resolves [[environments-2](#environments-2)], each prepared to run on the app's engine at this use [[playbook-library-46](playbook-library.md#playbook-library-46)] — and shall write no path into a shared file ([DR-104](../decisions/104-spec-package-format-and-client-environments.md), [DR-165](../decisions/165-one-package-manager-hosted-by-the-cli-and-the-app.md)):

- a playbook the configuration enables and no environment of the session places is a config error naming the playbook and the spex repository whose environment lacks it;
- a registry or Git source supplies a module only while its package is installed as the current lock records it — the install record naming the same source, files and artifacts, every selected file there [[environments-14](#environments-14)]; retained files from another lock are unavailable and are not imported during configuration loading, including after a failed install [[environments-7](#environments-7)], while a path source is used in place;
- a playbook available in an environment but enabled in no configuration is listed and not launched.

### Authoring and Publishing

#### environments-10

When an authoring session [[storage-23](storage.md#storage-23)] writes a spec package under development, or the command line builds one from the project's own files [[cli-23](cli.md#cli-23)], the core shall keep it as a folder in the release layout at `spex-packages/<org>/<pkg>/` under the environment's root, compile its playbooks there with the compiler in the playbook's artifact folder [[playbook-library-57](playbook-library.md#playbook-library-57)], and offer to request it from the environment by `path` and to publish it by name ([DR-104](../decisions/104-spec-package-format-and-client-environments.md), [DR-165](../decisions/165-one-package-manager-hosted-by-the-cli-and-the-app.md)):

- a publish names a spec package `<org>/<pkg>` and uploads the declared release files of its folder — the folder of the environment's path request for that name where it has one, else `spex-packages/<org>/<pkg>/` — only, after the same checks the core makes on a release [[environments-1](#environments-1)], to the registry of the environment the publish names [[environments-17](#environments-17)] as the account holding a registry-scoped grant at that unchanged origin [[environments-12](#environments-12)] ([DR-127](../decisions/127-a-home-signed-in-to-several-instances.md)); a folder whose manifest names another spec package is refused naming both;
- a manifest without a `description` or a `license`, which the registry requires, is refused naming each missing field before any upload, its preview included [[environments-17](#environments-17)];
- to share before publishing, the folder is requested by `git` at a commit, or published as a prerelease to a private namespace at the registry; to use it yourself on every device, it is kept in your own group's clone and requested by path there [[environments-2](#environments-2)];
- a root may hold any number of spec packages under development, two orgs' packages of one name apart.

#### environments-27

While the home holds the selected registry credential, when the core asks the registry for the orgs its account may publish to, it shall send one `GET /api/v1/account/orgs` to that registry presenting its selected purpose's app token as resolving and installing do [[environments-12](#environments-12)], and take a `200` whose `orgs` lists each org's `name`, its provider namespace `path`, the account's `role` and optional identity `provider`, independent of Space affiliation, sorted by name, as the answer ([DR-120](../decisions/120-the-instance-is-the-space.md), [DR-127](../decisions/127-a-home-signed-in-to-several-instances.md)):

- the background authoring-default suggestion treats any status but `200`, a body not in that shape, a network failure, or no answer within two seconds as no answer;
- the explicit `registry.orgs` selection waits up to thirty seconds and refuses with a readable error when the registry grant is missing or the registry gives no valid answer, preserving a valid empty `orgs` list as a successful empty answer.

### The Built-In Spec Package

#### environments-11

When the core starts, it shall seed the app's built-in spec package — the playbooks Playbook ships, as one spec package named `sublang/playbooks` at Playbook's version, each playbook an artifact in `en` with `code` and `decide` requiring `review` — into the store, and shall request it with a caret requirement in your own group's environment where that environment lacks it and in a new project's environment, written at pairing [[storage-6](storage.md#storage-6)], each `spex.yaml` written with `space` naming the environment's instance [[environments-2](#environments-2)] — the project's where it has one, or the one your own group's own repository's remote names — so the built-in playbooks work offline from the first start and the file resolves at the same Space on every device ([DR-104](../decisions/104-spec-package-format-and-client-environments.md), [DR-165](../decisions/165-one-package-manager-hosted-by-the-cli-and-the-app.md)):

- the lock pins its version like any other, so an app update never changes an environment by itself: the newer release is seeded beside the older, which the store keeps while a lock selects it;
- the built-in release's resolution, made from the seed offline, records the environment's independently selected registry [[environments-38](#environments-38)] as the one it was resolved at [[environments-5](#environments-5)], and a pick recording a legacy local-only clone's first placement at an instance [[storage-35](storage.md#storage-35)] records that instance's registry in its place and writes `space` naming that instance, with an explicitly selected registry unchanged, while the environment requests the built-in spec package alone and its lock holds just the resolution a pairing writes for it ([DR-127](../decisions/127-a-home-signed-in-to-several-instances.md));
- the seeded release's checksum is that of the release archive this device packs from its seed;
- while an environment's lock selects an older release than the one this app ships and the version requirement its `spex.yaml` requests the built-in spec package at admits the shipped one [[environments-4](#environments-4)], its state [[environments-14](#environments-14)] names both releases, the lock unchanged until the reader resolves again [[environments-5](#environments-5)];
- the seeded artifacts carry the playbook text and the module as the app's Playbook ships them, the module's engine resolved through the engine links provisioned in each installed playbook artifact's folder as a compile provisions them [[playbook-library-46](playbook-library.md#playbook-library-46)].

### Sources

#### environments-12

When the core resolves or installs from a registry, it shall read the registry's version index for every spec package of the graph, read a version resource only for each version it picks, fetch files by the raw-file URLs or the release archive, and present its selected purpose's token where one is held and none otherwise — registry purpose for explicit `registry`, legacy Space purpose otherwise [[environments-38](#environments-38)], the access secret kept current before each call [[git-host-31](git-host.md#git-host-31)], an answer that it expired reported as a failure of that operation — so a private namespace the account there may read installs and a public one needs no credential ([DR-104](../decisions/104-spec-package-format-and-client-environments.md), [DR-127](../decisions/127-a-home-signed-in-to-several-instances.md)):

- the registry answering `invalid_token`, `token_revoked` or `reauth_required` removes only the credential its call presented [[git-host-31](git-host.md#git-host-31)] and fails that call;
- a release whose `format` the core does not know is refused naming it; a registry answer the core cannot read, or a digest that does not match, installs nothing and is reported;
- the Git host controls who reads a spex repository and the registry who downloads; neither grants the other, so a member lacking the registry's permission is told which spec package they cannot fetch.

#### environments-13

When the core resolves or installs a Git source, it shall fetch the repository at the named `rev` with the credential brokered by an instance the home is signed in to at whose Git origin the repository lies [[git-host-9](git-host.md#git-host-9)], the environment's own instance preferred where it is one, and with this device's Git where none is, record the commit, read the manifest at the optional `path`, digest every file at resolution and install from those bytes ([DR-104](../decisions/104-spec-package-format-and-client-environments.md), [DR-127](../decisions/127-a-home-signed-in-to-several-instances.md)):

- a `rev` naming a branch or tag resolves to its commit at resolution and the lock holds the commit alone;
- a repository at the Git origin of no instance the home is signed in to, a signed-out instance's included, is fetched with this device's own Git, so a public one still installs and a private one reports Git's refusal.
- On Windows, Git-source commands select Git's `core.longpaths=true` for that command only, so the mirror's pack and reference files remain usable below long cache roots without changing system, user or repository configuration ([DR-167](../decisions/173-windows-git-source-long-paths.md)).
- A Git-source archive disables ambient automatic line-ending conversion for that command only, so a device's checkout preference does not rewrite the release bytes ([DR-167](../decisions/173-windows-git-source-long-paths.md)).

### Listing

#### environments-14

When a client sends `environment.get` for a spex repository, the core shall reply with the environment as the project's Packages tab lists it, read at the reply from the environment's files where it lives [[environments-26](#environments-26)] and the files installed under its root's `.spex/`: the environment's instance for collaboration and Git-source brokerage, or none while `spex.yaml` does not read [[environments-2](#environments-2)], its independently selected registry as `{origin, legacy}` with `legacy` identifying a manifest without `registry` and an absent manifest selecting the public registry [[environments-38](#environments-38)], every request with its source, every resolved spec package with its version, source, who required it, its selected artifacts with their chosen language and fallback mark, its placements, and for a provided spec its placement under `specs/` — placed at its path, edited in place with the newer release's version where one waits under `.spex/`, blocked by a file of its name, or waiting for `specs/` — with each package its links wait for and their count [[environments-41](#environments-41)], whether its files are installed as the lock locks them — recorded by the install that placed them, with the same source, files and artifacts, every file there — a path source missing on this device, the environment's path root on this device or none [[environments-2](#environments-2)], what the core's last placement of the environment left out where that placement went into the environment's root, or into none while this device holds none [[environments-8](#environments-8)] — each skill a folder the reader put under its name kept out of an agent folder, with that folder as the agent table names it [[environments-16](#environments-16)], and each spec package a provided artifact of which it did not find — the lock's staleness, the step of the latest operation still running — one begun before the clone moved counted, and its end announced, at the new address — the failure the last failing operation recorded, cleared by a later success and never recorded by an operation overtaken by a change of its files [[environments-5](#environments-5)] [[environments-7](#environments-7)], while that failure stands the registry spec packages its registry refused as it refuses one for want of a grant — not found, unauthenticated or forbidden [[environments-12](#environments-12)] — the conflict report while `spex.yaml` still holds the bytes the failed resolution read, and, for a project, whether its two files are committed with the code, both in the code's `HEAD`, or not and so this device's alone, or unknown while this device holds no working folder for it [[environments-26](#environments-26)] ([DR-104](../decisions/104-spec-package-format-and-client-environments.md), [DR-111](../decisions/111-the-core-coordinates-as-git-does.md)).

#### environments-29

The core shall present generated environment source labels, conflict requirements and operation failures using the instance's naming boundary ([DR-120](../decisions/120-the-instance-is-the-space.md)):

- a Git request is a display summary, distinct from the command that authors its transport locator; a local path or file URL stays as given, while a network repository reads as the display name of an instance under whose reported Git origin its remote lies — the environment's own where it is one, else the earliest in the home's list —, as the external remote with any embedded HTTP(S) user removed when under none, and as an unnamed remote while the home's default instance or an instance it lists has not reported its origin [[git-host-5](git-host.md#git-host-5)] ([DR-127](../decisions/127-a-home-signed-in-to-several-instances.md)); the same rule governs a locked package's source detail;
- generated failures and conflict requirements follow that source rule, including failures returned by an awaited operation and those reported through state; a transport failure for an instance source, or one whose origin is not known, carries no raw transport output;
- source labels and conflict requirements use the latest known origin without requesting another host read; a recorded failure keeps the safe explanation generated from its operation's source and the origin known when it failed, independent of later request edits;
- presentation changes no request, lock or installed file, and never substitutes a displayed label for the locator Git fetches [[environments-13](#environments-13)].

#### environments-15

When a client sends `environment.request` for a spex repository with a spec package name and a request [[environments-2](#environments-2)], or `environment.remove` with a name, the core shall write `spex.yaml` where the environment lives [[environments-26](#environments-26)], preserving comments and key order, then resolve [[environments-5](#environments-5)] and install [[environments-7](#environments-7)], and announce the environment changed:

- a request naming a path and no package name takes the name and version the folder's `meta.yaml` gives, refused as naming no package where none reads ([DR-172](../decisions/172-surfaces-a-fresh-user-reads.md));
- a dry run makes the same refusals and writes nothing, replying the name the request takes and the version its folder's `meta.yaml` gives, each null where none reads;
- a request naming a path while its environment has no path root on this device, a path outside that root [[environments-2](#environments-2)] or one your own group's clone refuses [[environments-32](#environments-32)], a malformed requirement, or a name that is not `<org>/<pkg>` is refused before any write;
- an environment with no root on this device when the command arrives is refused `not_found` before any write;
- the candidate is prepared from the bytes read and written under their version, so a file changed meanwhile, or a root gone after the command read it, is refused `conflict` — changed meanwhile, retry — with the newer file kept and no folder made ([DR-111](../decisions/111-the-core-coordinates-as-git-does.md));
- every command starts at once, beside any operation still running on the environment, and none waits for or refuses another;
- once the core stops, no operation starts, and a request or install its caller awaits is refused before any write.

#### environments-35

When an environment mutation requests `wait: true`, the core shall send that request's correlated reply only after its own operation settles, without changing concurrent-operation admission or the default immediate replies [[environments-15](#environments-15)] [[environments-17](#environments-17)]:

- Success returns `{ completed: true }`; publication adds `published: { instance: { origin, name }, name, version, url }` from its actual upload destination and result [[environments-10](#environments-10)].
- A refusal uses the existing error envelope and code, preserving `conflict` for changed inputs and `invalid_request` for resolution, stale-lock, install or registry failures, with `aborted` when the manager has stopped and the existing safe error explanations [[environments-5](#environments-5)] [[environments-7](#environments-7)].
- Completion is captured from the invocation, never inferred from aggregate state or another operation's `published` value.
- A dry run remains an immediate preview and uploads nothing even when `wait` is supplied [[environments-17](#environments-17)].
- Disconnect ends delivery only: the core neither replays nor cancels or rolls back work already dispatched.

#### environments-38

The package manager shall select package service independently from Space when `spex.yaml` names `registry`, using that canonical origin for resolution, search and publishing, and its registry-scoped grant for private reads, publishing and authorized namespaces, with no Space sign-out caused by a registry refusal ([DR-168](../decisions/168-independent-package-registry.md)):

- new manifests explicitly name `https://spex.sublang.ai` as `registry`;
- a manifest without `registry` retains its former Space/default package destination and legacy read credential behavior until explicit migration, while publishing requires a registry grant at that unchanged origin, and no edit silently retargets a private source or publish;
- installs in explicit registry mode ask only the lock's recorded registry and any explicitly trusted origin mapping, never every signed-in Space, verifying the locked version, checksum and file digests without rewriting the lock's origins;
- Git-source transport continues using the environment's Space credential brokerage.

#### environments-39

When a host discovers package services, the shared registry client shall read the public registry descriptor from `GET /api/v1/registry` as `{origin, display_name, providers}` and its public Space directory from `GET /api/v1/spaces` as `{spaces: [{origin, display_name, sign_in}]}`, validating canonical origins and string lists, presenting no credential and conferring no credential trust from a directory entry ([DR-168](../decisions/168-independent-package-registry.md)).

## Internal Behavior

#### environments-16

The library shall keep the agent folder table that placements read [[environments-8](#environments-8)] as one data file naming, per agent Spex drives, the home folder that shows the device has it, whether playbook skills go there, and that agent's project-level folder relative to a working folder and user-level folder relative to the user's home as Cligent's published native-skill support states them [[5]], a test of the core checking the two against Cligent ([DR-104](../decisions/104-spec-package-format-and-client-environments.md), [DR-124](../decisions/124-skills-reach-every-agent.md), [DR-130](../decisions/130-playbook-17-11-0-cligent-0-36-0-slc-0-19-0-adoption.md), [DR-165](../decisions/165-one-package-manager-hosted-by-the-cli-and-the-app.md)):

| Agent | Home folder | Project-level | User-level | Playbook skills |
| --- | --- | --- | --- | --- |
| `claude` | `~/.claude` | `.claude/skills` | `~/.claude/skills` | yes |
| `codex` | `~/.codex` | `.agents/skills` | `~/.agents/skills` | no |
| `gemini` | `~/.gemini` | `.agents/skills` | `~/.agents/skills` | no |
| `kimi` | `~/.kimi-code` | `.agents/skills` | `~/.agents/skills` | no |
| `opencode` | `~/.config/opencode` or `~/.local/share/opencode` | `.agents/skills` | `~/.agents/skills` | no |

- a project's root receives each project-level folder, whatever agents the device has, and two folders a link makes one are written once, taking playbook skills where either does; a user-level folder is written only where the home folder of an agent reading it exists on this device, so Spex never creates an agent's own home folder, and your own group's user-level placement runs only for the default home or one the shell names as the person's, never for a scratch home;
- the generated skill for a playbook is a `SKILL.md` whose `name` is a YAML string and whose `description`, within the Agent Skills limit of 1024 characters [[1]], says that it starts the playbook, naming its id and spec package, through Spex in the working folder and that it is not for an agent already playing a role in a playbook, and whose body tells the agent to run the playbook's command through Spex in the working folder, naming the spec package, version and playbook id, then tells an agent already inside a Spex session as a player of a playbook, given a role and a step, that the skill does not apply and to do that step, and nothing else;
- the generated skill for a spec is a `SKILL.md` whose `name` is a YAML string and whose `description`, within the Agent Skills limit of 1024 characters [[1]], names the spec package, its version and the manifest's `description` where it has one, and whose body names the org, name, version and that description and tells the agent the spec is the `<pkg>.md` beside it, and nothing else.

#### environments-30

When a placement mirrors a skill into an agent folder [[environments-8](#environments-8)], the core shall leave a folder whose files already match as it is and replace a changed one whole, renaming a complete copy staged beside the agent folder into place and restoring the replaced one where that rename fails, so a run reading the folder meanwhile never finds a skill half-written, a changed one being absent only between two renames ([DR-124](../decisions/124-skills-reach-every-agent.md)).

#### environments-17

The core shall expose environments through these commands and one message, each reply validated against the command schema, `repository` naming a spex repository by its key and so the environment of the working folder it pairs with, or a group's own [[environments-26](#environments-26)]:

| Command | Input | Result | Errors |
| --- | --- | --- | --- |
| `environment.get` | `{ repository }` | `EnvironmentState` [[environments-14](#environments-14)] | `not_found` |
| `environment.request` | `{ repository, name?, request, wait?, dryRun? }`, `name` left out only for a path request [[environments-15](#environments-15)] | `{ accepted: true }`, a dry run adding `preview: { name, version }` [[environments-15](#environments-15)], or terminal reply with `wait: true` [[environments-35](#environments-35)] | `invalid_request`, `not_found`, `conflict`; terminal wait also `aborted` |
| `environment.remove` | `{ repository, name, wait? }` | `{ accepted: true }`, or terminal reply with `wait: true` [[environments-35](#environments-35)] | `invalid_request`, `not_found`, `conflict`; terminal wait also `aborted` |
| `environment.resolve` | `{ repository, wait? }` | `{ accepted: true }`, or terminal reply with `wait: true` [[environments-35](#environments-35)] | `not_found`; terminal wait also `invalid_request`, `conflict`, `aborted` |
| `environment.install` | `{ repository, wait? }` | `{ accepted: true }`, or terminal reply with `wait: true` [[environments-35](#environments-35)] | `not_found`; terminal wait also `invalid_request`, `conflict`, `aborted` |
| `environment.search` | `{ repository, query }`, searching the registry of `repository`'s environment ([DR-127](../decisions/127-a-home-signed-in-to-several-instances.md)) | `{ packages: [{ name, description, versions }] }` | `invalid_request` (signed out of that registry's instance and the registry refusing), `not_found` |
| `environment.publish` | `{ repository, name, dryRun?, wait? }`, `name` naming a spec package under development, whose folder [[environments-10](#environments-10)] lies inside the environment's path root [[environments-2](#environments-2)] | `{ accepted: true }`, a dry run uploading nothing and adding `preview: { instance: { origin, name }, name, version, files }`, where `instance` is the server-resolved publication destination; `wait: true` returns its terminal receipt [[environments-35](#environments-35)] | `invalid_request` (no path root on this device; no folder for the name; its manifest naming another spec package; not a release; no `description` or `license`; not signed in at the instance it publishes to [[environments-10](#environments-10)]), `not_found`, `aborted` |

- `environment.state { repository, state: EnvironmentState }` is broadcast after every resolve, install, publish, sync-applied lock and pairing's placement [[environments-31](#environments-31)]; a long command without `wait: true` replies `accepted` at once and reports through state ([DR-010](../decisions/010-interface-craft.md) §5).

#### environments-18

The library shall ship a stand-in registry for its own tests, the core's and the browser journeys: an in-process HTTP server serving the registry's version index, version resources, raw files and release archives from a directory of releases, answering at each stand-in instance set to relay to it, so one registry may stand behind several instances, with scripted yank, suppression, private namespaces honouring the app tokens of each instance it answers at, a scripted `token_revoked` answer to one instance's tokens, the orgs listed for an app token — any other token, or none, refused `401` — answered after a scripted delay, and a publish endpoint that validates as the core does and stores the archive.

## Verification

#### environments-19

When an integration suite reads releases from a fixture directory, it shall assert the format's acceptance and refusals [[environments-1](#environments-1)]: a release with every kind and two languages accepted whole; a manifest without `format: 2`, an unknown field, a file under no artifact, a folder without a manifest entry, a skill whose `SKILL.md` name differs from its id, a skill and a playbook sharing an id, a translation whose item ids differ, a `provides` that is not a nonempty list of the five kinds, an applet without `index.html` at its folder's root, a non-portable path and a link each refused naming the reason.

#### environments-20

When an integration suite resolves fixture requests against the stand-in registry [[environments-18](#environments-18)], it shall assert:

- exact, caret and tilde requirements admit and refuse the versions of the table, prereleases only when named [[environments-4](#environments-4)];
- a two-level graph resolves to the highest solution reading the version index alone, a yanked version is skipped by caret and taken by exact, a suppressed one never, and a cycle resolves [[environments-5](#environments-5)];
- conflicting requirements are reported by name before anything is installed [[environments-5](#environments-5)];
- a `select` entry, the environment's `language` and the original text choose the language in that order with the fallback recorded; what a playbook `requires` is selected with it; two skills of one name are refused until one is aliased; a spec's skill name is `<org>-<pkg>`, `<pkg>` where `<org>-<pkg>` is longer than 64 characters, and its alias [[environments-6](#environments-6)];
- a lock recording a release's registry by another spelling of an origin, resolved again where that release reproduces its version and checksum, keeps the origin in its canonical form, and one recording a path, a file URL, a user or no URL records the registry asked [[environments-5](#environments-5)] [[environments-3](#environments-3)];
- the lock written is exactly the encoding of [[environments-3](#environments-3)] and installing from it on a second scratch home resolves nothing and yields byte-identical `.spex/packages/` [[environments-3](#environments-3)] [[environments-7](#environments-7)].

#### environments-21

When an integration suite installs locked environments on a scratch home, it shall assert:

- every selected file lands under the root's `.spex/packages/` with its bytes and executable flag, `.spex/.gitignore` holding `*`, the store holds each distinct file once with an executable copy apart, a wrong digest installs nothing and is reported, `cache/` deleted mid-way is rebuilt, a file leaves the store only when no lock the home knows selects it, and an installed tree reads whole after its store files are removed [[environments-7](#environments-7)] [[environments-26](#environments-26)];
- the replacement is atomic: a failure between fetch and replace leaves the previous files whole and retains its primary cause; where a readable but nonwritable old tree prevents its removal after replacement, the new files stay installed and are placed in the working folder, the obsolete tree retained with its cause reported [[environments-7](#environments-7)];
- through a real core with an install's download held at the registry: a lock replaced meanwhile, or a `spex.yaml` changed meanwhile, publishes nothing, the files standing stay, and the state records no failure while reading the current lock's standing [[environments-7](#environments-7)] [[environments-14](#environments-14)]; an install awaited by the enabling path whose `spex.lock` is rewritten, or whose install record is removed, after its swap and before its placements is refused `conflict` naming that change, to retry, the placements standing byte for byte on the same inodes, the swapped-in files staying and no failure recorded [[environments-7](#environments-7)]; a download held and failing once released, after `spex.yaml` changed and a later install succeeded, records no failure, the later installed state standing [[environments-7](#environments-7)]; an install succeeding after an earlier failure was recorded, whose `spex.yaml` changes after its files are installed and before its placements, is refused `conflict` naming `spex.yaml` once its placements are written, the placements standing and the earlier failure still recorded, and an install of a lock a path-source manifest change made stale, whose `spex.yaml` changes before its report is recorded, is refused `conflict` naming `spex.yaml`, not with its stale reasons [[environments-7](#environments-7)]; a root removed meanwhile is not made again, no staged tree outlives the refusal, `environment.request` and `environment.remove` on it are refused `not_found`, and a request or install then awaited on it is refused [[environments-15](#environments-15)]; an install of the lock left stale then installs and places nothing and reports its stale reasons alone, and with `spex.yaml` gone beside an installed lock an install awaited by the enabling path is refused, resolving again needed; and `environment.get` reports a package installed only where the install record matches the lock, never for files of another lock under the same names [[environments-7](#environments-7)] [[environments-14](#environments-14)];
- a changed `spex.yaml`, a changed path-source manifest and a path source lacking a selected artifact each mark the lock stale, install nothing new and report resolving again [[environments-7](#environments-7)];
- a path source is used in place, a second working folder of the same project runs its own copy, and a device whose working folder lacks it reports it missing [[environments-7](#environments-7)];
- a Git source at a branch resolves to its commit, installs from that commit through the stand-in host's credential, and the lock holds the commit alone [[environments-13](#environments-13)];
- a project's `spex.yaml` and `spex.lock` stand at its working folder's root and its installed files under that root's `.spex/`, nothing of either in its clone, the core having staged, committed and ignored nothing outside `.spex/` [[environments-26](#environments-26)]; a working folder paired while holding a committed environment installs from it with nothing but `.spex/` written [[environments-26](#environments-26)] [[environments-7](#environments-7)]; a project's clone holding a former `packages/` and `skills/` loses them at the next install [[environments-7](#environments-7)]; an environment the command line installed in a folder the app then pairs is read installed with its install record, nothing rewritten, and one the app installed is read by the command line the same way [[environments-26](#environments-26)] [[environments-14](#environments-14)]; a lock changed by a Git checkout in the folder is installed at the next use [[environments-7](#environments-7)]; and the environment is listed as this device's while the files are untracked, still after `git add` alone, and as committed once a commit holds both [[environments-14](#environments-14)];
- a private namespace at the stand-in registry installs with the app token of the instance it answers at and refuses without, naming the spec package, a resolution with no token ending in the registry's answer, not a conflict [[environments-12](#environments-12)] [[environments-5](#environments-5)].

#### environments-22

When an integration suite places an installed environment's skills into a working folder with the core's agent table, it shall assert:

- each selected skill stands in the root's `.spex/skills/<name>/` and in the folder's `.claude/skills/<name>/` and `.agents/skills/<name>/`, an aliased one with its `name` rewritten as a YAML string even where YAML would read the alias as another type, the folder's `.git/info/exclude` listing them, and your own group's skills in the scratch user home's `.claude/skills/` and, once an agent reading it has a home folder there, `.agents/skills/` [[environments-8](#environments-8)] [[environments-16](#environments-16)];
- the table names every agent Spex drives, each with the project-level and user-level folders Cligent's native-skill support publishes for it, the two read from Cligent in the test and compared with the library's data, and with no home folder of a reader in the scratch user home, no user-level `.agents/skills/` and no agent home folder is made, while the working folder still receives both project-level folders [[environments-16](#environments-16)];
- where the working folder's `.agents/skills` links to its `.claude/skills` before that folder exists, a placement, and a second one, leaves every skill and the playbook's generated skill standing there [[environments-16](#environments-16)];
- a generated skill per playbook stands in `.claude/skills/` and not in `.agents/skills/`, and a generated playbook's or spec's `name` stays the string it is placed under even where YAML would read it as another type [[environments-16](#environments-16)]; it names the spec package, version and id and runs that playbook in the working folder [[environments-8](#environments-8)] [[environments-16](#environments-16)], its `description` within 1024 characters and saying it is not for an agent already playing a role in a playbook, and its body ending by sending such a player back to the step it was given [[environments-16](#environments-16)]; the project's and your own group's skill of one name both stand with their origins listed [[environments-8](#environments-8)] [[environments-16](#environments-16)];
- a session started in the folder hands the launcher the installed playbook's module location, your own group's where the project lacks it, the path source's in the folder for a path request, and a config enabling a playbook no environment places is refused naming both [[environments-9](#environments-9)];
- through a real core, a failed startup restoration leaves another lock's files unavailable without importing them; one successful resolve installs and prepares the selected release and makes the same process's configuration valid without a restart or a session; a Git source absent from the install record does not import retained files [[environments-9](#environments-9)] [[environments-7](#environments-7)];
- a path source's spec requested in your own group's environment stands as a generated skill under `<org>-<pkg>` in the scratch user home's `.claude/skills/`, its `<pkg>.md` byte-equal to the clone's spec file and its `SKILL.md` naming the org, name, version and description [[environments-8](#environments-8)] [[environments-16](#environments-16)];
- a folder the reader put under a placed name in the working folder's `.agents/skills/`, and one in the user home's `.agents/skills/`, stands byte for byte while the skill stands in each other agent folder, and a placement into a working folder whose `.agents/skills` links to its `.claude/skills` leaves such a folder there as it is [[environments-8](#environments-8)];
- a later placement removes a skill the lock no longer selects and leaves a reader-placed skill beside it [[environments-8](#environments-8)], leaves an unchanged skill's files as they were, stands a changed skill whole with no staging copy left behind, and, where the changed skill cannot be moved or renaming its new copy in fails, leaves the previous one standing whole [[environments-30](#environments-30)];
- through a real core, a spec-only spec package requested from the stand-in registry by `environment.request` in a project whose working folder holds `specs/` places its spec at `specs/packages/<pkg>.md`, opening with the marker line, and into no agent folder [[environments-8](#environments-8)] [[environments-41](#environments-41)]; requested in your own group's environment, it stands as a generated skill in the scratch user home's `.claude/skills/<org>-<pkg>/`, its `<pkg>.md` byte-equal to the release's spec file [[environments-8](#environments-8)]; and after `environment.remove` and its install, the placed file, the skill and its copy in the user home are gone [[environments-8](#environments-8)] [[environments-15](#environments-15)];
- through a real core, a project whose environment requests two skills from the stand-in registry and a path source in its working folder, once installed and rebound to a second working folder, broadcasts its state [[environments-17](#environments-17)] and has both skills in the second folder's `.claude/skills/` and the one the reader did not shadow in its `.agents/skills/`, each listed in its `.git/info/exclude`, with no environment command sent [[environments-31](#environments-31)]; the reader's folder under the other skill's name in `.agents/skills/` stays byte for byte [[environments-8](#environments-8)], the path source the second folder lacks has its skill in neither agent folder there [[environments-8](#environments-8)], and `environment.get` names that skill with `.agents/skills`, and that path source, as left out [[environments-14](#environments-14)]; once the reader's folder is moved away and the path source copied in, `environment.install` places both there and the state names nothing left out [[environments-8](#environments-8)] [[environments-14](#environments-14)]; rebound to a third working folder while the registry spec package's installed files are gone, it installs them [[environments-7](#environments-7)] and places both skills there with no environment command sent [[environments-31](#environments-31)], the state naming the path source the third folder lacks as left out [[environments-14](#environments-14)]; and rebound to a fourth whose path source states another version, so the lock is stale there, the state names nothing left out [[environments-14](#environments-14)].

#### environments-33

When an integration suite, through real cores on two scratch homes whose own groups' clones sync through the stand-in host, requests by path in your own group's environment a spec package kept in its clone, it shall assert:

- `environment.request` with a path below the clone's root resolves the folder's manifest, the lock holding the path and no files, and `environment.get` names the clone as the path root and the package installed [[environments-2](#environments-2)] [[environments-5](#environments-5)] [[environments-14](#environments-14)];
- the package's skill stands in the first home's user `.claude/skills/` and `.agents/skills/`, and an edit to its `SKILL.md` in the clone stands there after `environment.install` [[environments-7](#environments-7)] [[environments-8](#environments-8)]; a dry run of `environment.publish` with the same path previews that folder's release [[environments-17](#environments-17)];
- a file named `*.bak` then added to the folder fails the next `environment.install`, the state naming the path, the file and its reason and neither user folder's skill holding the file, and once it is removed an install clears the failure [[environments-32](#environments-32)] [[environments-14](#environments-14)];
- with your own group's spex repository paired with a Git working folder holding another release at the same path, `environment.get` still names the clone as the path root and the folder's `.claude/skills/` holds the skill with the clone's bytes [[environments-2](#environments-2)] [[environments-8](#environments-8)] [[environments-14](#environments-14)];
- the clone's root, a path leading out of it, a path under each first segment Spex keeps, `placements` among them [[environments-32](#environments-32)], a first segment `Sessions`, a folder named `*.tmp`, a folder reached through a link, a folder that is a Git repository of its own, a folder holding a file named `*.tmp`, one holding a `*.tmp` file Git was forced to track, one holding a Git repository of its own and one holding a link under `node_modules/` are each refused naming its reason, `spex.yaml` keeping its bytes [[environments-32](#environments-32)] [[environments-15](#environments-15)]; a folder holding a file Git tracks that this device's excludes match is accepted [[environments-32](#environments-32)];
- a path requested before its folder exists is accepted, and once the folder stands holding a file named `*.tmp`, `environment.resolve` fails, the state naming the path, the file and its reason, `spex.lock` keeping its bytes [[environments-32](#environments-32)] [[environments-5](#environments-5)];
- an otherwise valid folder holding a nonignored `node_modules/` that is a Git repository is refused while readable and while unreadable, the unreadable path named by `environment.request`, resolution and install, with the request, lock and previous placements unchanged; ignoring that subtree permits the same folder, while a genuinely absent source retains its missing-folder behavior [[environments-32](#environments-32)] [[environments-15](#environments-15)] [[environments-5](#environments-5)] [[environments-7](#environments-7)];
- once the second home's own group's clone syncs from the host, the folder, `spex.yaml` and `spex.lock` stand there, `environment.get` there names the package installed, and the skill stands in that home's user `.claude/skills/` and `.agents/skills/` with the bytes of the first home's edit [[environments-7](#environments-7)] [[environments-8](#environments-8)].

#### environments-23

When an integration suite starts a real core on a fresh scratch home with no registry reachable, it shall assert that the built-in spec package is seeded into the store, requested in your own group's environment and, at the working folder's root, in a new project's, every built-in playbook launches from it, and a core started with a newer built-in release seeds it beside the older without changing either lock [[environments-11](#environments-11)], each environment's state naming the newer release and the older its lock selects until `environment.resolve` moves that lock to the newer, and naming none for an environment whose lock selects the newer or whose request admits only the older [[environments-11](#environments-11)], and that a lock's checksum for the seeded release is that of the archive the seed packs to [[environments-11](#environments-11)], a lock recording another archive checksum with the same files' digests installing from the seed and one recording another digest for a file failing naming the spec package [[environments-7](#environments-7)].

#### environments-24

When an integration suite runs an authoring session that writes a spec package at `spex-packages/<org>/<pkg>/` in a working folder, compiles its playbook, requests it by path, enables it and starts a session with it, then publishes it by name to the stand-in registry and requests the published version from a second scratch home, it shall assert each step's outcome, that a publish naming a package whose folder's manifest names another is refused naming both, and that the published release equals the folder's declared files [[environments-10](#environments-10)] [[environments-15](#environments-15)] [[environments-12](#environments-12)], none of them under a `.slc/` or `.slc-verify/` placed in the playbook's folder, in the preview or at the registry [[environments-1](#environments-1)], its manifest carrying a `description` and a `license`, while a dry run of the folder with `license` taken out of its `meta.yaml` was refused naming the field with nothing reaching the registry [[environments-10](#environments-10)] [[environments-17](#environments-17)].

#### environments-25

When an integration suite drives the environment commands over the protocol, it shall assert each command's reply and refusal of the table, the `environment.state` broadcast after resolve, install and a sync-applied lock, and `environment.get` carrying every field the surface lists [[environments-17](#environments-17)] [[environments-14](#environments-14)] [[environments-15](#environments-15)]:

- with a resolution held at the registry, a second request is admitted and written beside the first, the final lock resolves both, the state reads busy until the last operation ends, and the overtaken resolution, once released after the second installed both, writes no lock and records no failure, the state reading both installed with no error [[environments-15](#environments-15)] [[environments-5](#environments-5)] [[environments-14](#environments-14)];
- with `environment.resolve` held at the registry and `spex.lock` rewritten by hand, `spex.yaml` unchanged, the rewritten lock stands and no failure is recorded, while a resolution the enabling path awaits, held and overtaken the same way, is refused `conflict` naming `spex.lock` [[environments-5](#environments-5)];
- a resolution held at the registry while `spex.yaml` changes, and failing there once released after a later resolution succeeded, records no failure, the later outcome standing; and one finding no solution once released after a later request's resolution failed leaves that later failure standing [[environments-5](#environments-5)];
- an environment whose lock and installed files are removed, sent `environment.resolve`, resolves from its current files and installs again [[environments-5](#environments-5)];
- an operation held while its clone is renamed and the store and environment follow the move reads busy at the new address, and its end is announced there with busy cleared and no failure recorded, nothing written at the old [[environments-14](#environments-14)] [[environments-5](#environments-5)];
- once the core stops, a request and an install awaited by the enabling path are refused `aborted` with `spex.yaml` unchanged [[environments-15](#environments-15)];
- a conflict report reads while `spex.yaml` holds the bytes its resolution read and no longer after the file changes, listing no package as refused [[environments-14](#environments-14)];
- a path request naming no package takes the name its folder's `meta.yaml` gives, a dry run of it, and of one naming a package, replying the name taken and that version with `spex.yaml` unchanged, and a folder whose `meta.yaml` names none previewing nulls and refused as naming no package [[environments-15](#environments-15)];
- a request of a private spec package the stand-in registry hides from a signed-out home lists that package as refused while its failure stands, and no longer once it is removed [[environments-14](#environments-14)];
- with Git sources inside and outside the stand-in instance, replies and broadcasts carry display summaries before and after the origin is reported, with no backing storage locator and no embedded HTTP(S) user, and no extra host read for presentation [[environments-29](#environments-29)]; an actual instance-source install fetches the locked commit while the authored request, lock and installed bytes retain their transport and content [[environments-13](#environments-13)] [[environments-29](#environments-29)]; missing revisions, invalid releases, conflicting requirements and refused transports read safely both in state and through an awaited operation [[environments-29](#environments-29)].

#### environments-28

When an integration suite asks the stand-in registry [[environments-18](#environments-18)] for the orgs a person may publish to, it shall assert sorted authorized answers, the background suggestion giving no answer for a refused, missing or failing grant and after two seconds, and explicit selection accepting an answer delayed beyond that suggestion window, refusing missing grants or failures rather than reporting an empty list, and succeeding with a valid empty list and on retry after failure [[environments-27](#environments-27)].

#### environments-34

When an integration suite, through a real core on a scratch home signed in to two stand-in instances over one stand-in Git backend, each answered by a stand-in registry of its own [[environments-18](#environments-18)], the first the home's default instance, and on a second scratch home signed in only to a third stand-in instance that the first's registry also answers, drives the environments of a project at the second instance and of a local-only project, it shall assert:

- the second's project, its `spex.yaml` naming the second as `space`, resolves at the second's registry with the second's token, its lock recording the second's origin, and installs from it, the local-only project resolves at the first's, and a `space` or `registry` that is no canonical service origin is refused naming it [[environments-5](#environments-5)] [[environments-12](#environments-12)] [[environments-2](#environments-2)] [[environments-3](#environments-3)] [[environments-7](#environments-7)];
- a lock recording the first's origin for a release the second's registry also holds at that version and checksum, resolved again in the second's project, keeps the first's origin [[environments-5](#environments-5)];
- a new project paired at the second instance and a local-only project picked there have `space` naming the second in their `spex.yaml` and the built-in spec package locked at the second's origin, one paired at the first, the default, or a local-only project picked there, has `space` naming the first, and a local-only project has none [[environments-11](#environments-11)] [[environments-2](#environments-2)] [[environments-3](#environments-3)];
- the second's project installs a public release its lock records at the first's origin, which the second's registry lacks, from the first's [[environments-7](#environments-7)]; and on the second home, a local-only project whose lock records a private release at the first's origin installs it through the third instance with its token, the first's registry refusing it without one, and with the third signed out fails naming the spec package [[environments-7](#environments-7)] [[environments-12](#environments-12)];
- `environment.search` for the second's project lists the second's registry's spec packages and not the first's [[environments-17](#environments-17)];
- a Git source at the shared Git backend's origin, requested in the second's project, is fetched with the credential the second instance brokers, and its source reads as the second's display name [[environments-13](#environments-13)] [[environments-29](#environments-29)];
- the orgs asked of the second's registry are read with the second's token [[environments-27](#environments-27)];
- a publish from the second's project lands at the second's registry and one from the local-only project at the first's, and once the second is signed out, a publish from its project is refused as not signed in there [[environments-10](#environments-10)] [[environments-17](#environments-17)];
- with the first's registry answering `token_revoked` to the first's tokens, a resolution in the local-only project signs the first instance alone out, the second staying signed in and its project's resolution and install succeeding [[environments-12](#environments-12)];
- with the first signed out and your own group's own repository following the second by its remote, a start finding your own group's `spex.yaml` and `spex.lock` gone requests the built-in spec package there with `space` naming the second, its lock recording the second's origin [[environments-11](#environments-11)] [[environments-2](#environments-2)];
- the first then forgotten, your own group's environment, whose own repository was created at the first and now syncs with the second, resolves at the second's registry, its lock recording the second's origin, and a publish from it lands there [[environments-5](#environments-5)] [[environments-10](#environments-10)].

#### environments-36

When real protocol clients run delayed and overlapping environment mutations in immediate and terminal-wait modes, the integration suite shall assert unchanged immediate acceptance, request-specific success and failure, conflict/stale-lock refusal and continued execution without replay after disconnect, and shutdown refusing post-preflight writes/uploads [[environments-15](#environments-15)] [[environments-35](#environments-35)].

#### environments-37

When a real protocol client previews and publishes to a controlled registry in terminal-wait mode, the integration suite shall assert actual instance/name/version/files in the upload-free preview, the actual publication receipt on success and a later failure despite a preceding successful `published` state [[environments-17](#environments-17)] [[environments-35](#environments-35)].

#### environments-40

When a real package-library integration uses an HTTP fixture with separate grants, it shall verify independent manifest routing, public reads without a grant, private reads with a registry grant, legacy source preservation and install isolation from unrelated signed-in Spaces [[environments-38](#environments-38)], and unauthenticated descriptor and directory reads [[environments-39](#environments-39)].

#### environments-43

When an integration suite installs, into a scratch project holding a scaffolded `specs/`, a stand-in registry package providing a spec whose release cites a second package's spec and a third's by address, it shall assert: the spec placed at `specs/packages/<pkg>.md` with the second's citation as a relative link once the second is installed too, and the third's removed with the install reporting the third and one link waiting [[environments-41](#environments-41)]; a hand-edited copy left standing and reported edited across an update to a newer release, whose file stands under `.spex/` [[environments-41](#environments-41)]; a project file of the same basename blocking the placement, reported [[environments-41](#environments-41)]; a removal taking an unedited copy and keeping an edited one, reported [[environments-41](#environments-41)]; a root without `specs/` reporting `spex scaffold` and placing no spec [[environments-41](#environments-41)]; two selected packages of one `<pkg>`, the first by `<org>` placed and the second reported blocked [[environments-41](#environments-41)]; the placed file opening with the marker line naming the package and version [[environments-41](#environments-41)]; a second scratch clone holding the committed copy, `spex.yaml` and `spex.lock`, whose first install rewrites nothing and records the copy as the package's, and a copy committed at a newer release's version read as the package's, not edited, on a device whose record held the older hash [[environments-41](#environments-41)]; a citation of `meta.md` kept as it is in both directions [[environments-41](#environments-41)] [[environments-42](#environments-42)]; a release listing `provides: [skill]`, and one whose playbook is `from` its spec, placing no spec and no support skill [[environments-1](#environments-1)] [[environments-6](#environments-6)]; your own group's environment writing the generated skill instead [[environments-8](#environments-8)]; and a project's spec file built into a release with its same-file citation kept, an installed package's spec cited by address, a local spec's citation removed and a decision record's link reduced to its text, each reported, the project's file unchanged [[environments-42](#environments-42)].

#### environments-44

When the Windows integration suite fetches and reuses a real Git source below a cache root whose mirror pack paths exceed the legacy Windows path bound, it shall assert the expected commit and exported file bytes, with the source repository's configuration unchanged [[environments-13](#environments-13)].

## References

[1]: https://agentskills.io/specification "Agent Skills specification"
[2]: https://semver.org/spec/v2.0.0.html "Semantic Versioning 2.0.0"
[3]: https://www.rfc-editor.org/rfc/rfc5646 "BCP 47: Tags for Identifying Languages (RFC 5646)"
[4]: https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file "Naming Files, Paths, and Namespaces"
[5]: https://github.com/sublang-ai/cligent/blob/v0.36.0/specs/packages/skills.md#skills-11 "Cligent skills-11: native-skill support per adapter"
